package organization

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"
	"testing"

	"backend/internal/domain/organization/dto"
	"backend/internal/shared/contracts"
	"backend/internal/shared/response"
)

// Every domain error must carry a code. A plain errors.New falls through to
// INTERNAL_ERROR, which is how a duplicate name would report itself as
// "internal server error" while correctly returning 409.
func TestErrorsAreCoded(t *testing.T) {
	tests := []struct {
		err        *Error
		wantCode   string
		wantStatus int
	}{
		{ErrOrganizationNotFound, "ORGANIZATION_NOT_FOUND", http.StatusNotFound},
		{ErrOrganizationKeyExists, "ORGANIZATION_KEY_EXISTS", http.StatusConflict},
		{ErrOrganizationNameExists, "ORGANIZATION_NAME_EXISTS", http.StatusConflict},
		{ErrOrganizationInvalidKey, "ORGANIZATION_INVALID_KEY", http.StatusBadRequest},
		{ErrOrganizationInvalidBranch, "ORGANIZATION_INVALID_BRANCH", http.StatusBadRequest},
		{ErrOrganizationUnknownSection, "ORGANIZATION_UNKNOWN_SECTION", http.StatusBadRequest},
		{ErrOrganizationSectionTaken, "ORGANIZATION_SECTION_TAKEN", http.StatusConflict},
		{ErrOrganizationInternalError, "ORGANIZATION_INTERNAL_ERROR", http.StatusInternalServerError},
		// A constructor rather than a var: the message names the operations.
		{ErrOrganizationInUse([]string{"Exercise One"}), "ORGANIZATION_IN_USE", http.StatusConflict},
	}
	for _, tt := range tests {
		var coded response.CodedError = tt.err
		if coded.GetCode() != tt.wantCode {
			t.Errorf("code = %q, want %q", coded.GetCode(), tt.wantCode)
		}
		if coded.GetStatus() != tt.wantStatus {
			t.Errorf("%s status = %d, want %d", tt.wantCode, coded.GetStatus(), tt.wantStatus)
		}
		if coded.Error() == "" {
			t.Errorf("%s has an empty message", tt.wantCode)
		}
	}

	got := response.Err(ErrOrganizationNameExists)
	if got.Error == nil || got.Error.Code != "ORGANIZATION_NAME_EXISTS" {
		t.Errorf("envelope code = %+v, want ORGANIZATION_NAME_EXISTS", got.Error)
	}
}

func TestNormaliseKey(t *testing.T) {
	good := map[string]string{
		"green":     "green",
		"  Green  ": "green",
		"BLUE_2":    "blue_2",
		"2nd":       "2nd",
	}
	for in, want := range good {
		if got, ok := NormaliseKey(in); !ok || got != want {
			t.Errorf("NormaliseKey(%q) = %q, %v; want %q, true", in, got, ok, want)
		}
	}
	for _, in := range []string{"", "   ", "_green", "two words", "a-b", "a.b", "<x>", strings.Repeat("a", 51)} {
		if _, ok := NormaliseKey(in); ok {
			t.Errorf("NormaliseKey(%q) accepted it; want refused", in)
		}
	}
	if _, ok := NormaliseKey(strings.Repeat("a", 50)); !ok {
		t.Error("a 50 character key must be accepted")
	}
}

type fakeSections struct {
	keys []string
	err  error
}

func (f *fakeSections) GetSectionKeys(_ context.Context) ([]string, error) { return f.keys, f.err }

type fakeUsage struct {
	ops []string
	err error
}

func (f *fakeUsage) OperationsUsingOrganization(_ context.Context, _ string) ([]string, error) {
	return f.ops, f.err
}

type recorder struct{ events []contracts.AuditEventInput }

func (r *recorder) Record(_ context.Context, in contracts.AuditEventInput) {
	r.events = append(r.events, in)
}

func TestCreateOrganizationStoresNormalisedValues(t *testing.T) {
	var created *Organization
	repo := &MockRepository{
		CreateFunc: func(_ context.Context, o *Organization) error { created = o; return nil },
	}
	svc := NewService(repo)
	rec := &recorder{}
	svc.SetAudit(rec)

	resp := &dto.CreateOrganizationResponse{}
	status, err := svc.CreateOrganization(context.Background(), &dto.CreateOrganizationRequest{
		Key: "  Army_Aviation ", Name: "  Army Aviation ", ShortLabel: " AVN ", Branch: "Army", Color: "#112233",
		CreatedBy: "mike", UpdatedBy: "mike", ActorID: "u1",
	}, resp)

	if status != http.StatusCreated || err != nil {
		t.Fatalf("status = %d, err = %v; want 201 / nil", status, err)
	}
	if created.Key != "army_aviation" || created.Name != "Army Aviation" || created.ShortLabel != "AVN" {
		t.Errorf("stored %+v; want normalised key, trimmed name and label", created)
	}
	if created.Branch != "USA" {
		t.Errorf("branch = %q, want the alias Army stored as USA", created.Branch)
	}
	if resp.Organization.Key != "army_aviation" || resp.Organization.Branch != "USA" {
		t.Errorf("response = %+v", resp.Organization)
	}
	if len(rec.events) != 1 || rec.events[0].Action != "create" || rec.events[0].ResourceType != "organization" ||
		rec.events[0].ResourceID != "army_aviation" {
		t.Errorf("audit events = %+v; want one organization create keyed by the slug", rec.events)
	}
}

func TestCreateOrganizationBlankBranchIsAllowed(t *testing.T) {
	var created *Organization
	repo := &MockRepository{
		CreateFunc: func(_ context.Context, o *Organization) error { created = o; return nil },
	}
	status, err := NewService(repo).CreateOrganization(context.Background(),
		&dto.CreateOrganizationRequest{Key: "coalition", Name: "Coalition", Branch: "  "}, &dto.CreateOrganizationResponse{})
	if status != http.StatusCreated || err != nil {
		t.Fatalf("status = %d, err = %v; want 201 / nil", status, err)
	}
	if created.Branch != "" {
		t.Errorf("branch = %q, want blank (stored as NULL)", created.Branch)
	}
}

func TestCreateOrganizationRejectsMalformedInput(t *testing.T) {
	svc := NewService(&MockRepository{})

	status, err := svc.CreateOrganization(context.Background(),
		&dto.CreateOrganizationRequest{Key: "two words", Name: "X"}, &dto.CreateOrganizationResponse{})
	if status != http.StatusBadRequest || !errors.Is(err, ErrOrganizationInvalidKey) {
		t.Errorf("key: status = %d, err = %v; want 400 / %v", status, err, ErrOrganizationInvalidKey)
	}

	status, err = svc.CreateOrganization(context.Background(),
		&dto.CreateOrganizationRequest{Key: "x", Name: "X", Branch: "Foreign Legion"}, &dto.CreateOrganizationResponse{})
	if status != http.StatusBadRequest || !errors.Is(err, ErrOrganizationInvalidBranch) {
		t.Errorf("branch: status = %d, err = %v; want 400 / %v", status, err, ErrOrganizationInvalidBranch)
	}
}

func TestCreateOrganizationSectionMustExistWhenListerIsWired(t *testing.T) {
	t.Run("rejects an unknown section", func(t *testing.T) {
		created := false
		repo := &MockRepository{CreateFunc: func(_ context.Context, _ *Organization) error { created = true; return nil }}
		svc := NewService(repo)
		svc.SetSectionLister(&fakeSections{keys: []string{"a-sqd"}})

		status, err := svc.CreateOrganization(context.Background(),
			&dto.CreateOrganizationRequest{Key: "x", Name: "X", SectionKey: "nope"}, &dto.CreateOrganizationResponse{})
		if status != http.StatusBadRequest || !errors.Is(err, ErrOrganizationUnknownSection) {
			t.Errorf("status = %d, err = %v; want 400 / %v", status, err, ErrOrganizationUnknownSection)
		}
		if created {
			t.Error("the organization was stored despite the refusal")
		}
	})
	t.Run("accepts a known section", func(t *testing.T) {
		svc := NewService(&MockRepository{})
		svc.SetSectionLister(&fakeSections{keys: []string{"a-sqd"}})
		status, err := svc.CreateOrganization(context.Background(),
			&dto.CreateOrganizationRequest{Key: "x", Name: "X", SectionKey: "a-sqd"}, &dto.CreateOrganizationResponse{})
		if status != http.StatusCreated || err != nil {
			t.Errorf("status = %d, err = %v; want 201 / nil", status, err)
		}
	})
	t.Run("is permissive when no lister is wired", func(t *testing.T) {
		svc := NewService(&MockRepository{})
		status, err := svc.CreateOrganization(context.Background(),
			&dto.CreateOrganizationRequest{Key: "x", Name: "X", SectionKey: "anything"}, &dto.CreateOrganizationResponse{})
		if status != http.StatusCreated || err != nil {
			t.Errorf("status = %d, err = %v; want 201 / nil", status, err)
		}
	})
}

func TestCreateOrganizationRejectsDuplicates(t *testing.T) {
	t.Run("key", func(t *testing.T) {
		repo := &MockRepository{KeyExistsFunc: func(_ context.Context, _ string) (bool, error) { return true, nil }}
		status, err := NewService(repo).CreateOrganization(context.Background(),
			&dto.CreateOrganizationRequest{Key: "green", Name: "Green"}, &dto.CreateOrganizationResponse{})
		if status != http.StatusConflict || !errors.Is(err, ErrOrganizationKeyExists) {
			t.Errorf("status = %d, err = %v; want 409 / %v", status, err, ErrOrganizationKeyExists)
		}
	})
	t.Run("name", func(t *testing.T) {
		repo := &MockRepository{NameExistsFunc: func(_ context.Context, _ string) (bool, error) { return true, nil }}
		status, err := NewService(repo).CreateOrganization(context.Background(),
			&dto.CreateOrganizationRequest{Key: "green2", Name: "green"}, &dto.CreateOrganizationResponse{})
		if status != http.StatusConflict || !errors.Is(err, ErrOrganizationNameExists) {
			t.Errorf("status = %d, err = %v; want 409 / %v", status, err, ErrOrganizationNameExists)
		}
	})
}

func TestUpdateOrganizationAppliesOnlyTheFieldsSentAndAuditsADiff(t *testing.T) {
	existing := &Organization{Key: "green", Name: "Green", ShortLabel: "GREEN", Branch: "USA", Color: "#2E7D32", Notes: "keep me"}
	var updated *Organization
	repo := &MockRepository{
		FindByKeyFunc: func(_ context.Context, _ string) (*Organization, error) { return existing, nil },
		UpdateFunc:    func(_ context.Context, o *Organization) error { updated = o; return nil },
	}
	svc := NewService(repo)
	rec := &recorder{}
	svc.SetAudit(rec)

	name := "  Green Force "
	status, err := svc.UpdateOrganization(context.Background(),
		&dto.UpdateOrganizationRequest{Key: "green", Name: &name, UpdatedBy: "mike", ActorID: "u1"},
		&dto.UpdateOrganizationResponse{})
	if status != http.StatusOK || err != nil {
		t.Fatalf("status = %d, err = %v; want 200 / nil", status, err)
	}
	if updated.Name != "Green Force" || updated.Notes != "keep me" || updated.Branch != "USA" || updated.UpdatedBy != "mike" {
		t.Errorf("updated %+v; want the name changed and everything else untouched", updated)
	}
	if len(rec.events) != 1 {
		t.Fatalf("audit events = %d, want 1", len(rec.events))
	}
	changes := rec.events[0].Changes
	if _, ok := changes["name"]; !ok || len(changes) != 1 {
		t.Errorf("changes = %v; want only name", changes)
	}
}

func TestUpdateOrganizationWithNoChangeWritesAndAuditsNothing(t *testing.T) {
	wrote := false
	repo := &MockRepository{
		FindByKeyFunc: func(_ context.Context, _ string) (*Organization, error) {
			return &Organization{Key: "green", Name: "Green", Branch: "USA"}, nil
		},
		UpdateFunc: func(_ context.Context, _ *Organization) error { wrote = true; return nil },
	}
	svc := NewService(repo)
	rec := &recorder{}
	svc.SetAudit(rec)

	name, br := "Green", "army"
	status, err := svc.UpdateOrganization(context.Background(),
		&dto.UpdateOrganizationRequest{Key: "green", Name: &name, Branch: &br}, &dto.UpdateOrganizationResponse{})
	if status != http.StatusOK || err != nil {
		t.Fatalf("status = %d, err = %v; want 200 / nil", status, err)
	}
	if wrote || len(rec.events) != 0 {
		t.Errorf("wrote = %v, events = %d; want a no-op update to do neither", wrote, len(rec.events))
	}
}

func TestUpdateOrganizationRules(t *testing.T) {
	existing := func() *Organization { return &Organization{Key: "green", Name: "Green"} }
	find := func(_ context.Context, _ string) (*Organization, error) { return existing(), nil }

	t.Run("not found", func(t *testing.T) {
		repo := &MockRepository{FindByKeyFunc: func(_ context.Context, _ string) (*Organization, error) {
			return nil, ErrOrganizationNotFound
		}}
		status, err := NewService(repo).UpdateOrganization(context.Background(),
			&dto.UpdateOrganizationRequest{Key: "x"}, &dto.UpdateOrganizationResponse{})
		if status != http.StatusNotFound || !errors.Is(err, ErrOrganizationNotFound) {
			t.Errorf("status = %d, err = %v; want 404", status, err)
		}
	})
	t.Run("duplicate name", func(t *testing.T) {
		repo := &MockRepository{
			FindByKeyFunc:           find,
			NameExistsExcludingFunc: func(_ context.Context, _, _ string) (bool, error) { return true, nil },
		}
		n := "Blue"
		status, err := NewService(repo).UpdateOrganization(context.Background(),
			&dto.UpdateOrganizationRequest{Key: "green", Name: &n}, &dto.UpdateOrganizationResponse{})
		if status != http.StatusConflict || !errors.Is(err, ErrOrganizationNameExists) {
			t.Errorf("status = %d, err = %v; want 409", status, err)
		}
	})
	t.Run("invalid branch", func(t *testing.T) {
		b := "nope"
		status, err := NewService(&MockRepository{FindByKeyFunc: find}).UpdateOrganization(context.Background(),
			&dto.UpdateOrganizationRequest{Key: "green", Branch: &b}, &dto.UpdateOrganizationResponse{})
		if status != http.StatusBadRequest || !errors.Is(err, ErrOrganizationInvalidBranch) {
			t.Errorf("status = %d, err = %v; want 400", status, err)
		}
	})
	t.Run("blank branch clears it", func(t *testing.T) {
		var updated *Organization
		repo := &MockRepository{
			FindByKeyFunc: func(_ context.Context, _ string) (*Organization, error) {
				return &Organization{Key: "green", Name: "Green", Branch: "USA"}, nil
			},
			UpdateFunc: func(_ context.Context, o *Organization) error { updated = o; return nil },
		}
		b := ""
		status, err := NewService(repo).UpdateOrganization(context.Background(),
			&dto.UpdateOrganizationRequest{Key: "green", Branch: &b}, &dto.UpdateOrganizationResponse{})
		if status != http.StatusOK || err != nil || updated.Branch != "" {
			t.Errorf("status = %d, err = %v, branch = %q; want 200 / nil / blank", status, err, updated.Branch)
		}
	})
	t.Run("unknown section", func(t *testing.T) {
		svc := NewService(&MockRepository{FindByKeyFunc: find})
		svc.SetSectionLister(&fakeSections{keys: []string{"a-sqd"}})
		s := "nope"
		status, err := svc.UpdateOrganization(context.Background(),
			&dto.UpdateOrganizationRequest{Key: "green", SectionKey: &s}, &dto.UpdateOrganizationResponse{})
		if status != http.StatusBadRequest || !errors.Is(err, ErrOrganizationUnknownSection) {
			t.Errorf("status = %d, err = %v; want 400", status, err)
		}
	})
}

func TestDeleteOrganization(t *testing.T) {
	find := func(_ context.Context, _ string) (*Organization, error) {
		return &Organization{Key: "green", Name: "Green"}, nil
	}

	t.Run("refused naming the operations when usage is wired", func(t *testing.T) {
		deleted := false
		repo := &MockRepository{
			FindByKeyFunc: find,
			DeleteFunc:    func(_ context.Context, _ string) error { deleted = true; return nil },
		}
		svc := NewService(repo)
		svc.SetOrganizationUsage(&fakeUsage{ops: []string{"Exercise One", "Exercise Two"}})

		status, err := svc.DeleteOrganization(context.Background(), &dto.DeleteOrganizationRequest{Key: "green"})
		if status != http.StatusConflict || err == nil {
			t.Fatalf("status = %d, err = %v; want 409", status, err)
		}
		var coded *Error
		if !errors.As(err, &coded) || coded.Code != "ORGANIZATION_IN_USE" {
			t.Fatalf("err = %v; want ORGANIZATION_IN_USE", err)
		}
		if !strings.Contains(err.Error(), "Exercise One") || !strings.Contains(err.Error(), "Exercise Two") {
			t.Errorf("message %q does not name the operations", err.Error())
		}
		if deleted {
			t.Error("the organization was deleted despite the refusal")
		}
	})
	t.Run("proceeds when nothing uses it, and audits", func(t *testing.T) {
		repo := &MockRepository{FindByKeyFunc: find}
		svc := NewService(repo)
		svc.SetOrganizationUsage(&fakeUsage{})
		rec := &recorder{}
		svc.SetAudit(rec)

		status, err := svc.DeleteOrganization(context.Background(), &dto.DeleteOrganizationRequest{Key: "green", UpdatedBy: "mike"})
		if status != http.StatusNoContent || err != nil {
			t.Fatalf("status = %d, err = %v; want 204 / nil", status, err)
		}
		if len(rec.events) != 1 || rec.events[0].Action != "delete" || rec.events[0].ResourceName != "Green" {
			t.Errorf("audit events = %+v; want one delete naming Green", rec.events)
		}
	})
	t.Run("is permissive when usage is not wired", func(t *testing.T) {
		status, err := NewService(&MockRepository{FindByKeyFunc: find}).DeleteOrganization(
			context.Background(), &dto.DeleteOrganizationRequest{Key: "green"})
		if status != http.StatusNoContent || err != nil {
			t.Errorf("status = %d, err = %v; want 204 / nil", status, err)
		}
	})
	t.Run("maps the database backstop", func(t *testing.T) {
		repo := &MockRepository{
			FindByKeyFunc: find,
			DeleteFunc:    func(_ context.Context, _ string) error { return ErrOrganizationInUse(nil) },
		}
		status, err := NewService(repo).DeleteOrganization(context.Background(), &dto.DeleteOrganizationRequest{Key: "green"})
		if status != http.StatusConflict || err == nil {
			t.Errorf("status = %d, err = %v; want 409", status, err)
		}
	})
	t.Run("not found", func(t *testing.T) {
		repo := &MockRepository{FindByKeyFunc: func(_ context.Context, _ string) (*Organization, error) {
			return nil, ErrOrganizationNotFound
		}}
		status, err := NewService(repo).DeleteOrganization(context.Background(), &dto.DeleteOrganizationRequest{Key: "x"})
		if status != http.StatusNotFound || !errors.Is(err, ErrOrganizationNotFound) {
			t.Errorf("status = %d, err = %v; want 404", status, err)
		}
	})
}

// Lists and the unset-as-empty-string fields must reach the wire as [] and "",
// never null, or the frontend's `.map` and string handling throw.
func TestListsAreNeverNull(t *testing.T) {
	resp := &dto.ListOrganizationsResponse{}
	status, err := NewService(&MockRepository{}).ListOrganizations(context.Background(), resp)
	if status != http.StatusOK || err != nil {
		t.Fatalf("status = %d, err = %v", status, err)
	}
	if resp.Organizations == nil || resp.Total != 0 {
		t.Errorf("resp = %+v; want an empty non-nil list", resp)
	}

	r := toResponse(&Organization{Key: "k"})
	if r.Branch != "" || r.SectionKey != "" {
		t.Errorf("toResponse = %+v; want unset fields as empty strings", r)
	}
}

func TestOrganizationsByKeys(t *testing.T) {
	repo := &MockRepository{
		FindByKeysFunc: func(_ context.Context, keys []string) ([]*Organization, error) {
			if !slices.Equal(keys, []string{"green", "ghost"}) {
				t.Errorf("keys = %v", keys)
			}
			return []*Organization{{Key: "green", Name: "Green", ShortLabel: "GREEN", Branch: "USA", Color: "#2E7D32"}}, nil
		},
	}
	got, err := NewService(repo).OrganizationsByKeys(context.Background(), []string{"green", "ghost"})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got["ghost"]; ok {
		t.Error("an unknown key must be absent from the map")
	}
	if got["green"].Name != "Green" || got["green"].Branch != "USA" {
		t.Errorf("green = %+v", got["green"])
	}
}

// Compile-time proof the service satisfies the contract operation depends on.
var _ contracts.OrganizationLookup = (*Service)(nil)

// operation_count is what lets the Settings page disable Delete before the
// server's ORGANIZATION_IN_USE arrives, so it must reach every response built
// from OrganizationResponse with the value the repository read, and an unused
// organization must say 0 on the wire rather than leave the field out.
func TestOperationCountReachesEveryResponse(t *testing.T) {
	t.Run("list carries each organization's count", func(t *testing.T) {
		repo := &MockRepository{FindAllFunc: func(_ context.Context) ([]*Organization, error) {
			return []*Organization{
				{Key: "blue", Name: "Blue", OperationCount: 2},
				{Key: "green", Name: "Green"},
			}, nil
		}}
		resp := &dto.ListOrganizationsResponse{}
		if status, err := NewService(repo).ListOrganizations(context.Background(), resp); status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		got := map[string]int{}
		for _, o := range resp.Organizations {
			got[o.Key] = o.OperationCount
		}
		if got["blue"] != 2 || got["green"] != 0 {
			t.Errorf("counts = %v; want blue 2, green 0", got)
		}
	})

	t.Run("an update of a used organization keeps the count it was read with", func(t *testing.T) {
		repo := &MockRepository{FindByKeyFunc: func(_ context.Context, _ string) (*Organization, error) {
			return &Organization{Key: "blue", Name: "Blue", OperationCount: 3}, nil
		}}
		name := "Blue Force"
		resp := &dto.UpdateOrganizationResponse{}
		status, err := NewService(repo).UpdateOrganization(context.Background(),
			&dto.UpdateOrganizationRequest{Key: "blue", Name: &name}, resp)
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if resp.Organization.OperationCount != 3 {
			t.Errorf("operation_count = %d; want 3, not a zero placeholder", resp.Organization.OperationCount)
		}
	})

	t.Run("a just-created organization reports 0", func(t *testing.T) {
		resp := &dto.CreateOrganizationResponse{}
		status, err := NewService(&MockRepository{}).CreateOrganization(context.Background(),
			&dto.CreateOrganizationRequest{Key: "teal", Name: "Teal"}, resp)
		if status != http.StatusCreated || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if resp.Organization.OperationCount != 0 {
			t.Errorf("operation_count = %d; want 0", resp.Organization.OperationCount)
		}
	})

	t.Run("0 is on the wire, not omitted", func(t *testing.T) {
		b, err := json.Marshal(toResponse(&Organization{Key: "green"}))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(b), `"operation_count":0`) {
			t.Errorf("json = %s; want \"operation_count\":0", b)
		}
	})
}

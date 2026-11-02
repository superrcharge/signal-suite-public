package operation

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"backend/internal/domain/operation/dto"
	"backend/internal/shared/contracts"
	"backend/internal/shared/response"
)

func TestErrorsAreCoded(t *testing.T) {
	tests := []struct {
		err        *Error
		wantCode   string
		wantStatus int
	}{
		{ErrOperationNotFound, "OPERATION_NOT_FOUND", http.StatusNotFound},
		{ErrOperationNameExists, "OPERATION_NAME_EXISTS", http.StatusConflict},
		{ErrOperationInvalidStatus, "OPERATION_INVALID_STATUS", http.StatusBadRequest},
		{ErrOperationInvalidDates, "OPERATION_INVALID_DATES", http.StatusBadRequest},
		{ErrParticipantNotFound, "PARTICIPANT_NOT_FOUND", http.StatusNotFound},
		{ErrParticipantUnknownOrganization, "PARTICIPANT_UNKNOWN_ORGANIZATION", http.StatusBadRequest},
		{ErrParticipantStale, "PARTICIPANT_STALE", http.StatusConflict},
		{ErrParticipantIdentityRequired, "PARTICIPANT_IDENTITY_REQUIRED", http.StatusBadRequest},
		{ErrParticipantAdhocNameExists, "PARTICIPANT_ADHOC_NAME_EXISTS", http.StatusConflict},
		{ErrParticipantInvalidBranch, "PARTICIPANT_INVALID_BRANCH", http.StatusBadRequest},
		{ErrOperationInternalError, "OPERATION_INTERNAL_ERROR", http.StatusInternalServerError},
		{ErrParticipantUnknownWaveform([]string{"NOPE"}), "PARTICIPANT_UNKNOWN_WAVEFORM", http.StatusBadRequest},
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
}

type recorder struct{ events []contracts.AuditEventInput }

func (r *recorder) Record(_ context.Context, in contracts.AuditEventInput) {
	r.events = append(r.events, in)
}

type fakeOrgs struct {
	known map[string]contracts.OrganizationInfo
}

func (f *fakeOrgs) OrganizationsByKeys(_ context.Context, keys []string) (map[string]contracts.OrganizationInfo, error) {
	out := map[string]contracts.OrganizationInfo{}
	for _, k := range keys {
		if v, ok := f.known[k]; ok {
			out[k] = v
		}
	}
	return out, nil
}

func orgsOf(keys ...string) *fakeOrgs {
	m := map[string]contracts.OrganizationInfo{}
	for _, k := range keys {
		m[k] = contracts.OrganizationInfo{Key: k, Name: strings.ToUpper(k[:1]) + k[1:]}
	}
	return &fakeOrgs{known: m}
}

type mockLibrary struct{ known map[string]struct{} }

func (m *mockLibrary) KnownWaveformAbbrevs(_ context.Context) (map[string]struct{}, error) {
	return m.known, nil
}

func libraryOf(abbrevs ...string) *mockLibrary {
	known := map[string]struct{}{}
	for _, a := range abbrevs {
		known[strings.ToLower(a)] = struct{}{}
	}
	return &mockLibrary{known: known}
}

func TestOperationStatusVocabulary(t *testing.T) {
	if !slices.Equal(ValidStatuses, []string{"planning", "active", "complete"}) {
		t.Errorf("ValidStatuses = %v", ValidStatuses)
	}
	for in, want := range map[string]string{"": "planning", " Active ": "active", "COMPLETE": "complete"} {
		if got, err := resolveStatus(in); err != nil || got != want {
			t.Errorf("resolveStatus(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
}

func TestCreateOperation(t *testing.T) {
	t.Run("stores normalised values and audits", func(t *testing.T) {
		var created *Operation
		repo := &MockRepository{CreateFunc: func(_ context.Context, o *Operation) error {
			o.ID = "op-9"
			created = o
			return nil
		}}
		svc := NewService(repo)
		rec := &recorder{}
		svc.SetAudit(rec)

		resp := &dto.CreateOperationResponse{}
		status, err := svc.CreateOperation(context.Background(), &dto.CreateOperationRequest{
			Name: "  Exercise One ", StartDate: "2026-10-01", EndDate: "2026-10-09", CreatedBy: "mike", UpdatedBy: "mike",
		}, resp)
		if status != http.StatusCreated || err != nil {
			t.Fatalf("status = %d, err = %v; want 201 / nil", status, err)
		}
		if created.Name != "Exercise One" || created.Status != "planning" {
			t.Errorf("stored %+v; want trimmed name and the planning default", created)
		}
		if resp.Operation.StartDate != "2026-10-01" || resp.Operation.EndDate != "2026-10-09" {
			t.Errorf("dates = %q / %q", resp.Operation.StartDate, resp.Operation.EndDate)
		}
		if len(rec.events) != 1 || rec.events[0].ResourceType != "operation" || rec.events[0].ResourceID != "op-9" {
			t.Errorf("audit = %+v", rec.events)
		}
	})
	t.Run("rejects an invalid status", func(t *testing.T) {
		status, err := NewService(&MockRepository{}).CreateOperation(context.Background(),
			&dto.CreateOperationRequest{Name: "X", Status: "paused"}, &dto.CreateOperationResponse{})
		if status != http.StatusBadRequest || !errors.Is(err, ErrOperationInvalidStatus) {
			t.Errorf("status = %d, err = %v; want 400", status, err)
		}
	})
	t.Run("rejects an end before the start", func(t *testing.T) {
		status, err := NewService(&MockRepository{}).CreateOperation(context.Background(),
			&dto.CreateOperationRequest{Name: "X", StartDate: "2026-10-09", EndDate: "2026-10-01"}, &dto.CreateOperationResponse{})
		if status != http.StatusBadRequest || !errors.Is(err, ErrOperationInvalidDates) {
			t.Errorf("status = %d, err = %v; want 400", status, err)
		}
	})
	t.Run("rejects a malformed date", func(t *testing.T) {
		status, err := NewService(&MockRepository{}).CreateOperation(context.Background(),
			&dto.CreateOperationRequest{Name: "X", StartDate: "10/01/2026"}, &dto.CreateOperationResponse{})
		if status != http.StatusBadRequest || !errors.Is(err, ErrOperationInvalidDates) {
			t.Errorf("status = %d, err = %v; want 400", status, err)
		}
	})
	t.Run("rejects a duplicate name", func(t *testing.T) {
		repo := &MockRepository{NameExistsFunc: func(_ context.Context, _ string) (bool, error) { return true, nil }}
		status, err := NewService(repo).CreateOperation(context.Background(),
			&dto.CreateOperationRequest{Name: "x"}, &dto.CreateOperationResponse{})
		if status != http.StatusConflict || !errors.Is(err, ErrOperationNameExists) {
			t.Errorf("status = %d, err = %v; want 409", status, err)
		}
	})
}

func TestUpdateOperation(t *testing.T) {
	d := func(s string) *time.Time { v, _ := time.Parse(DateFormat, s); return &v }
	find := func(_ context.Context, _ string) (*Operation, error) {
		return &Operation{ID: "op-1", Name: "Ex", Status: "planning", StartDate: d("2026-10-05"), Notes: "keep"}, nil
	}

	t.Run("applies only the fields sent and audits a diff", func(t *testing.T) {
		var updated *Operation
		repo := &MockRepository{FindByIDFunc: find, UpdateFunc: func(_ context.Context, o *Operation) error { updated = o; return nil }}
		svc := NewService(repo)
		rec := &recorder{}
		svc.SetAudit(rec)
		st := "active"
		status, err := svc.UpdateOperation(context.Background(),
			&dto.UpdateOperationRequest{ID: "op-1", Status: &st, UpdatedBy: "mike"}, &dto.UpdateOperationResponse{})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if updated.Status != "active" || updated.Notes != "keep" || fmtDate(updated.StartDate) != "2026-10-05" {
			t.Errorf("updated %+v", updated)
		}
		if len(rec.events) != 1 || len(rec.events[0].Changes) != 1 {
			t.Errorf("audit = %+v; want one event with one change", rec.events)
		}
	})
	t.Run("no change writes and audits nothing", func(t *testing.T) {
		wrote := false
		repo := &MockRepository{FindByIDFunc: find, UpdateFunc: func(_ context.Context, _ *Operation) error { wrote = true; return nil }}
		svc := NewService(repo)
		rec := &recorder{}
		svc.SetAudit(rec)
		n, s := "Ex", "2026-10-05"
		status, err := svc.UpdateOperation(context.Background(),
			&dto.UpdateOperationRequest{ID: "op-1", Name: &n, StartDate: &s}, &dto.UpdateOperationResponse{})
		if status != http.StatusOK || err != nil || wrote || len(rec.events) != 0 {
			t.Errorf("status = %d, err = %v, wrote = %v, events = %d", status, err, wrote, len(rec.events))
		}
	})
	t.Run("an end before the stored start is refused", func(t *testing.T) {
		e := "2026-10-01"
		status, err := NewService(&MockRepository{FindByIDFunc: find}).UpdateOperation(context.Background(),
			&dto.UpdateOperationRequest{ID: "op-1", EndDate: &e}, &dto.UpdateOperationResponse{})
		if status != http.StatusBadRequest || !errors.Is(err, ErrOperationInvalidDates) {
			t.Errorf("status = %d, err = %v; want 400", status, err)
		}
	})
	t.Run("duplicate name and not found", func(t *testing.T) {
		n := "Other"
		repo := &MockRepository{FindByIDFunc: find, NameExistsExcludingFunc: func(_ context.Context, _, _ string) (bool, error) { return true, nil }}
		status, err := NewService(repo).UpdateOperation(context.Background(),
			&dto.UpdateOperationRequest{ID: "op-1", Name: &n}, &dto.UpdateOperationResponse{})
		if status != http.StatusConflict || !errors.Is(err, ErrOperationNameExists) {
			t.Errorf("status = %d, err = %v; want 409", status, err)
		}
		repo = &MockRepository{FindByIDFunc: func(_ context.Context, _ string) (*Operation, error) { return nil, ErrOperationNotFound }}
		status, err = NewService(repo).UpdateOperation(context.Background(),
			&dto.UpdateOperationRequest{ID: "x"}, &dto.UpdateOperationResponse{})
		if status != http.StatusNotFound || !errors.Is(err, ErrOperationNotFound) {
			t.Errorf("status = %d, err = %v; want 404", status, err)
		}
	})
}

func TestDeleteOperationAudits(t *testing.T) {
	repo := &MockRepository{FindByIDFunc: func(_ context.Context, _ string) (*Operation, error) {
		return &Operation{ID: "op-1", Name: "Ex"}, nil
	}}
	svc := NewService(repo)
	rec := &recorder{}
	svc.SetAudit(rec)
	status, err := svc.DeleteOperation(context.Background(), &dto.DeleteOperationRequest{ID: "op-1"})
	if status != http.StatusNoContent || err != nil {
		t.Fatalf("status = %d, err = %v", status, err)
	}
	if len(rec.events) != 1 || rec.events[0].Action != "delete" || rec.events[0].ResourceName != "Ex" {
		t.Errorf("audit = %+v", rec.events)
	}
}

// participantRepo is an in-memory stand-in for one operation's check-ins, so a
// save-then-save-again sequence behaves as it does against the database.
func participantRepo() (*MockRepository, *map[string]*Participant, *int) {
	store := map[string]*Participant{}
	writes := 0
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, id string) (*Operation, error) {
			return &Operation{ID: id, Name: "Exercise One"}, nil
		},
		FindParticipantFunc: func(_ context.Context, _, key string) (*Participant, error) {
			if p, ok := store[key]; ok {
				cp := *p
				return &cp, nil
			}
			return nil, ErrParticipantNotFound
		},
		CreateParticipantFunc: func(_ context.Context, p *Participant) error {
			p.ID = "part-1"
			cp := *p
			store[p.OrganizationKey] = &cp
			writes++
			return nil
		},
		UpdateParticipantFunc: func(_ context.Context, p *Participant) error {
			cp := *p
			store[p.OrganizationKey] = &cp
			writes++
			return nil
		},
	}
	return repo, &store, &writes
}

func TestSaveParticipantCreatesThenUpdates(t *testing.T) {
	repo, store, writes := participantRepo()
	svc := NewService(repo)
	rec := &recorder{}
	svc.SetAudit(rec)
	svc.SetOrganizationLookup(orgsOf("green"))

	resp := &dto.SaveParticipantResponse{}
	status, err := svc.SaveParticipant(context.Background(), &dto.SaveParticipantRequest{
		OperationID: "op-1", OrganizationKey: " Green ", WaveformAbbrevs: []string{"L16", "l16"},
		EquipmentIDs: []string{"e1", "e1"}, POCName: " Pat ", UpdatedBy: "mike",
	}, resp)
	if status != http.StatusCreated || err != nil {
		t.Fatalf("first save: status = %d, err = %v; want 201 / nil", status, err)
	}
	if resp.Participant.OrganizationKey != "green" || resp.Participant.Organization.Name != "Green" {
		t.Errorf("response = %+v; want the key normalised and the summary filled", resp.Participant)
	}
	if !slices.Equal(resp.Participant.WaveformAbbrevs, []string{"L16"}) || !slices.Equal(resp.Participant.EquipmentIDs, []string{"e1"}) {
		t.Errorf("lists = %v / %v; want de-duplicated", resp.Participant.WaveformAbbrevs, resp.Participant.EquipmentIDs)
	}
	if resp.Participant.ServiceAbbrevs == nil || resp.Participant.TransportIDs == nil {
		t.Error("an unsent list must be [] not null")
	}
	if len(rec.events) != 1 || rec.events[0].Action != "create" || rec.events[0].ResourceType != "operation_participant" ||
		rec.events[0].ResourceName != "Exercise One - Green" {
		t.Fatalf("audit after create = %+v", rec.events)
	}

	// Second save with a changed contact: an update with a diff.
	status, err = svc.SaveParticipant(context.Background(), &dto.SaveParticipantRequest{
		OperationID: "op-1", OrganizationKey: "green", WaveformAbbrevs: []string{"L16", "MADL"},
		EquipmentIDs: []string{"e1"}, POCName: "Pat", UpdatedBy: "mike",
	}, &dto.SaveParticipantResponse{})
	if status != http.StatusOK || err != nil {
		t.Fatalf("second save: status = %d, err = %v; want 200 / nil", status, err)
	}
	if len(rec.events) != 2 || rec.events[1].Action != "update" {
		t.Fatalf("audit after update = %+v; want the action to flip to update", rec.events)
	}
	if _, ok := rec.events[1].Changes["waveform_abbrevs"]; !ok || len(rec.events[1].Changes) != 1 {
		t.Errorf("changes = %v; want only waveform_abbrevs", rec.events[1].Changes)
	}

	// An identical PUT is a no-op: nothing written, nothing recorded.
	before := *writes
	status, err = svc.SaveParticipant(context.Background(), &dto.SaveParticipantRequest{
		OperationID: "op-1", OrganizationKey: "green", WaveformAbbrevs: []string{"L16", "MADL"},
		EquipmentIDs: []string{"e1"}, POCName: "Pat", UpdatedBy: "mike",
	}, &dto.SaveParticipantResponse{})
	if status != http.StatusOK || err != nil {
		t.Fatalf("no-op save: status = %d, err = %v", status, err)
	}
	if *writes != before || len(rec.events) != 2 {
		t.Errorf("writes = %d (was %d), events = %d; a no-op PUT must do neither", *writes, before, len(rec.events))
	}
	if len(*store) != 1 {
		t.Errorf("store has %d rows, want 1", len(*store))
	}
}

func TestSaveParticipantRules(t *testing.T) {
	save := func(svc *Service, req *dto.SaveParticipantRequest) (int, error) {
		req.OperationID = "op-1"
		return svc.SaveParticipant(context.Background(), req, &dto.SaveParticipantResponse{})
	}

	t.Run("unknown organization is refused through the lookup", func(t *testing.T) {
		repo, _, writes := participantRepo()
		svc := NewService(repo)
		svc.SetOrganizationLookup(orgsOf("green"))
		status, err := save(svc, &dto.SaveParticipantRequest{OrganizationKey: "ghost"})
		if status != http.StatusBadRequest || !errors.Is(err, ErrParticipantUnknownOrganization) {
			t.Errorf("status = %d, err = %v; want 400", status, err)
		}
		if *writes != 0 {
			t.Error("a check-in was stored despite the refusal")
		}
	})
	t.Run("unknown operation is a 404", func(t *testing.T) {
		repo := &MockRepository{FindByIDFunc: func(_ context.Context, _ string) (*Operation, error) { return nil, ErrOperationNotFound }}
		status, err := save(NewService(repo), &dto.SaveParticipantRequest{OrganizationKey: "green"})
		if status != http.StatusNotFound || !errors.Is(err, ErrOperationNotFound) {
			t.Errorf("status = %d, err = %v; want 404", status, err)
		}
	})
	t.Run("a stale expected_updated_at is a 409 and nothing is written", func(t *testing.T) {
		repo, store, writes := participantRepo()
		stored := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
		(*store)["green"] = &Participant{ID: "part-1", OperationID: "op-1", OrganizationKey: "green", UpdatedAt: stored}
		svc := NewService(repo)

		status, err := save(svc, &dto.SaveParticipantRequest{OrganizationKey: "green", ExpectedUpdatedAt: "2026-10-09T11:00:00Z", Notes: "mine"})
		if status != http.StatusConflict || !errors.Is(err, ErrParticipantStale) {
			t.Errorf("status = %d, err = %v; want 409", status, err)
		}
		if *writes != 0 {
			t.Error("a stale save was written")
		}

		// The matching value, formatted as the response formats it, goes through.
		status, err = save(svc, &dto.SaveParticipantRequest{OrganizationKey: "green", ExpectedUpdatedAt: stored.Format(time.RFC3339), Notes: "mine"})
		if status != http.StatusOK || err != nil {
			t.Errorf("fresh save: status = %d, err = %v; want 200", status, err)
		}
	})
	t.Run("expected_updated_at on a row that is gone is stale", func(t *testing.T) {
		repo, _, _ := participantRepo()
		status, err := save(NewService(repo), &dto.SaveParticipantRequest{OrganizationKey: "green", ExpectedUpdatedAt: "2026-10-09T11:00:00Z"})
		if status != http.StatusConflict || !errors.Is(err, ErrParticipantStale) {
			t.Errorf("status = %d, err = %v; want 409", status, err)
		}
	})
}

// A check-in may only name waveforms the library declares, and says which are
// wrong. Permissive when no library is wired, like platform's check.
func TestParticipantWaveformsMustBeInTheLibrary(t *testing.T) {
	req := func(abbrevs ...string) *dto.SaveParticipantRequest {
		return &dto.SaveParticipantRequest{OperationID: "op-1", OrganizationKey: "green", WaveformAbbrevs: abbrevs}
	}

	t.Run("rejects an unknown abbrev, and says which", func(t *testing.T) {
		repo, _, writes := participantRepo()
		svc := NewService(repo)
		svc.SetWaveformLookup(libraryOf("L16"))
		status, err := svc.SaveParticipant(context.Background(), req("L16", "MADL"), &dto.SaveParticipantResponse{})
		if status != http.StatusBadRequest || err == nil {
			t.Fatalf("status = %d, err = %v; want 400", status, err)
		}
		var coded *Error
		if !errors.As(err, &coded) || coded.Code != "PARTICIPANT_UNKNOWN_WAVEFORM" {
			t.Errorf("err = %v; want PARTICIPANT_UNKNOWN_WAVEFORM", err)
		}
		if !strings.Contains(err.Error(), "MADL") || strings.Contains(err.Error(), "L16") {
			t.Errorf("message %q must name MADL and only MADL", err.Error())
		}
		if *writes != 0 {
			t.Error("the check-in was stored despite the refusal")
		}
	})
	t.Run("accepts known abbrevs in any case", func(t *testing.T) {
		repo, _, _ := participantRepo()
		svc := NewService(repo)
		svc.SetWaveformLookup(libraryOf("L16", "MADL"))
		status, err := svc.SaveParticipant(context.Background(), req("l16", " MADL "), &dto.SaveParticipantResponse{})
		if status != http.StatusCreated || err != nil {
			t.Errorf("status = %d, err = %v; want 201", status, err)
		}
	})
	t.Run("is permissive when no library is wired", func(t *testing.T) {
		repo, _, _ := participantRepo()
		status, err := NewService(repo).SaveParticipant(context.Background(), req("ANYTHING"), &dto.SaveParticipantResponse{})
		if status != http.StatusCreated || err != nil {
			t.Errorf("status = %d, err = %v; want 201", status, err)
		}
	})
}

func TestGetAndDeleteParticipant(t *testing.T) {
	repo, store, _ := participantRepo()
	(*store)["green"] = &Participant{ID: "part-1", OperationID: "op-1", OrganizationKey: "green", Organization: OrgSummary{Key: "green", Name: "Green"}}
	svc := NewService(repo)
	rec := &recorder{}
	svc.SetAudit(rec)

	resp := &dto.GetParticipantResponse{}
	status, err := svc.GetParticipant(context.Background(), &dto.GetParticipantRequest{OperationID: "op-1", OrganizationKey: "green"}, resp)
	if status != http.StatusOK || err != nil || resp.Participant.Organization.Name != "Green" {
		t.Errorf("get: status = %d, err = %v, resp = %+v", status, err, resp.Participant)
	}
	status, err = svc.GetParticipant(context.Background(), &dto.GetParticipantRequest{OperationID: "op-1", OrganizationKey: "blue"}, &dto.GetParticipantResponse{})
	if status != http.StatusNotFound || !errors.Is(err, ErrParticipantNotFound) {
		t.Errorf("get missing: status = %d, err = %v; want 404", status, err)
	}

	status, err = svc.DeleteParticipant(context.Background(), &dto.DeleteParticipantRequest{OperationID: "op-1", OrganizationKey: "green"})
	if status != http.StatusNoContent || err != nil {
		t.Fatalf("delete: status = %d, err = %v", status, err)
	}
	if len(rec.events) != 1 || rec.events[0].Action != "delete" || rec.events[0].ResourceType != "operation_participant" {
		t.Errorf("audit = %+v", rec.events)
	}
	status, err = svc.DeleteParticipant(context.Background(), &dto.DeleteParticipantRequest{OperationID: "op-1", OrganizationKey: "blue"})
	if status != http.StatusNotFound || !errors.Is(err, ErrParticipantNotFound) {
		t.Errorf("delete missing: status = %d, err = %v; want 404", status, err)
	}
}

// Lists must reach the wire as [], never null, or the frontend's `.map` throws.
func TestListsAreNeverNull(t *testing.T) {
	resp := &dto.ListOperationsResponse{}
	if status, err := NewService(&MockRepository{}).ListOperations(context.Background(), resp); status != http.StatusOK || err != nil {
		t.Fatalf("status = %d, err = %v", status, err)
	}
	if resp.Operations == nil {
		t.Error("ListOperations left a nil list")
	}

	repo := &MockRepository{FindByIDFunc: func(_ context.Context, id string) (*Operation, error) { return &Operation{ID: id}, nil }}
	got := &dto.GetOperationResponse{}
	if status, err := NewService(repo).GetOperation(context.Background(), &dto.GetOperationRequest{ID: "op-1"}, got); status != http.StatusOK || err != nil {
		t.Fatalf("status = %d, err = %v", status, err)
	}
	if got.Participants == nil {
		t.Error("GetOperation left a nil participants list")
	}

	r := toParticipantResponse(&Participant{})
	if r.EquipmentIDs == nil || r.WaveformAbbrevs == nil || r.ServiceAbbrevs == nil || r.TransportIDs == nil {
		t.Errorf("toParticipantResponse left a nil list: %+v", r)
	}
}

func TestGetOperationCountsItsParticipants(t *testing.T) {
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, id string) (*Operation, error) { return &Operation{ID: id, Name: "Ex"}, nil },
		FindParticipantsFunc: func(_ context.Context, _ string) ([]*Participant, error) {
			return []*Participant{{OrganizationKey: "green"}, {OrganizationKey: "blue"}}, nil
		},
	}
	resp := &dto.GetOperationResponse{}
	if _, err := NewService(repo).GetOperation(context.Background(), &dto.GetOperationRequest{ID: "op-1"}, resp); err != nil {
		t.Fatal(err)
	}
	if resp.Operation.ParticipantCount != 2 || len(resp.Participants) != 2 {
		t.Errorf("count = %d, participants = %d; want 2 / 2", resp.Operation.ParticipantCount, len(resp.Participants))
	}
}

func TestOperationsUsingOrganizationPassesThrough(t *testing.T) {
	repo := &MockRepository{OperationsUsingOrganizationFunc: func(_ context.Context, key string) ([]string, error) {
		if key != "green" {
			t.Errorf("key = %q", key)
		}
		return []string{"Exercise One"}, nil
	}}
	got, err := NewService(repo).OperationsUsingOrganization(context.Background(), "green")
	if err != nil || !slices.Equal(got, []string{"Exercise One"}) {
		t.Errorf("got %v, %v", got, err)
	}
}

// Compile-time proof the service satisfies the contract organization depends on.
var _ contracts.OrganizationUsage = (*Service)(nil)

// idRepo is an in-memory check-in store addressed by id, for the id-keyed routes.
func idRepo() (*MockRepository, map[string]*Participant, *int) {
	store := map[string]*Participant{}
	writes := 0
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, id string) (*Operation, error) {
			return &Operation{ID: id, Name: "Exercise One"}, nil
		},
		FindParticipantByIDFunc: func(_ context.Context, _, id string) (*Participant, error) {
			if p, ok := store[id]; ok {
				cp := *p
				return &cp, nil
			}
			return nil, ErrParticipantNotFound
		},
		CreateParticipantFunc: func(_ context.Context, p *Participant) error {
			p.ID = "part-" + string(rune('a'+len(store)))
			cp := *p
			store[p.ID] = &cp
			writes++
			return nil
		},
		UpdateParticipantFunc: func(_ context.Context, p *Participant) error {
			cp := *p
			store[p.ID] = &cp
			writes++
			return nil
		},
		DeleteParticipantByIDFunc: func(_ context.Context, _, id string) error {
			delete(store, id)
			return nil
		},
	}
	return repo, store, &writes
}

func TestCreateParticipantIdentityRules(t *testing.T) {
	create := func(req *dto.CreateParticipantRequest) (int, error) {
		repo, _, _ := idRepo()
		svc := NewService(repo)
		svc.SetOrganizationLookup(orgsOf("blue"))
		req.OperationID = "op-1"
		return svc.CreateParticipant(context.Background(), req, &dto.CreateParticipantResponse{})
	}
	t.Run("both identities", func(t *testing.T) {
		status, err := create(&dto.CreateParticipantRequest{OrganizationKey: "blue", Adhoc: &dto.AdhocOrganization{Name: "TF Kilo"}})
		if status != http.StatusBadRequest || !errors.Is(err, ErrParticipantIdentityRequired) {
			t.Errorf("status = %d, err = %v; want 400 identity", status, err)
		}
	})
	t.Run("neither identity", func(t *testing.T) {
		status, err := create(&dto.CreateParticipantRequest{})
		if status != http.StatusBadRequest || !errors.Is(err, ErrParticipantIdentityRequired) {
			t.Errorf("status = %d, err = %v; want 400 identity", status, err)
		}
	})
	t.Run("blank ad hoc name", func(t *testing.T) {
		status, err := create(&dto.CreateParticipantRequest{Adhoc: &dto.AdhocOrganization{Name: "   "}})
		if status != http.StatusBadRequest || !errors.Is(err, ErrParticipantIdentityRequired) {
			t.Errorf("status = %d, err = %v; want 400 identity", status, err)
		}
	})
	t.Run("invalid ad hoc branch", func(t *testing.T) {
		status, err := create(&dto.CreateParticipantRequest{Adhoc: &dto.AdhocOrganization{Name: "TF Kilo", Branch: "Pirates"}})
		if status != http.StatusBadRequest || !errors.Is(err, ErrParticipantInvalidBranch) {
			t.Errorf("status = %d, err = %v; want 400 branch", status, err)
		}
	})
	t.Run("library organization still validates through the lookup", func(t *testing.T) {
		status, err := create(&dto.CreateParticipantRequest{OrganizationKey: "nope"})
		if status != http.StatusBadRequest || !errors.Is(err, ErrParticipantUnknownOrganization) {
			t.Errorf("status = %d, err = %v; want 400 unknown organization", status, err)
		}
		status, err = create(&dto.CreateParticipantRequest{OrganizationKey: " Blue "})
		if status != http.StatusCreated || err != nil {
			t.Errorf("status = %d, err = %v; want 201", status, err)
		}
	})
	t.Run("an ad hoc one never consults the organization lookup", func(t *testing.T) {
		repo, _, _ := idRepo()
		svc := NewService(repo)
		svc.SetOrganizationLookup(&fakeOrgs{})
		status, err := svc.CreateParticipant(context.Background(), &dto.CreateParticipantRequest{
			OperationID: "op-1", Adhoc: &dto.AdhocOrganization{Name: "TF Kilo"},
		}, &dto.CreateParticipantResponse{})
		if status != http.StatusCreated || err != nil {
			t.Errorf("status = %d, err = %v; want 201", status, err)
		}
	})
}

func TestCreateAdhocParticipant(t *testing.T) {
	repo, store, _ := idRepo()
	svc := NewService(repo)
	rec := &recorder{}
	svc.SetAudit(rec)

	resp := &dto.CreateParticipantResponse{}
	status, err := svc.CreateParticipant(context.Background(), &dto.CreateParticipantRequest{
		OperationID: "op-1", UpdatedBy: "mike",
		Adhoc: &dto.AdhocOrganization{Name: "  Task Force Kilo ", ShortLabel: " TF KILO ", Branch: "Army", Color: "#abc"},
	}, resp)
	if status != http.StatusCreated || err != nil {
		t.Fatalf("status = %d, err = %v; want 201 / nil", status, err)
	}
	o := resp.Participant.Organization
	if !o.Adhoc || o.Key != "" || o.Name != "Task Force Kilo" || o.ShortLabel != "TF KILO" || o.Branch != "USA" || o.Color != "#abc" {
		t.Errorf("summary = %+v; want a synthesised ad hoc summary with branch USA", o)
	}
	if resp.Participant.OrganizationKey != "" {
		t.Errorf("organization_key = %q, want empty", resp.Participant.OrganizationKey)
	}
	stored := store[resp.Participant.ID]
	if stored == nil || stored.AdhocName != "Task Force Kilo" || stored.AdhocBranch != "USA" {
		t.Errorf("stored = %+v; want the trimmed name and canonical branch", stored)
	}
	if len(rec.events) != 1 || rec.events[0].Action != "create" || rec.events[0].ResourceName != "Exercise One - Task Force Kilo" {
		t.Errorf("audit = %+v", rec.events)
	}

	t.Run("blank branch is allowed", func(t *testing.T) {
		status, err := svc.CreateParticipant(context.Background(), &dto.CreateParticipantRequest{
			OperationID: "op-1", Adhoc: &dto.AdhocOrganization{Name: "Partner"},
		}, &dto.CreateParticipantResponse{})
		if status != http.StatusCreated || err != nil {
			t.Errorf("status = %d, err = %v; want 201", status, err)
		}
	})
}

func TestCreateAdhocParticipantDuplicateName(t *testing.T) {
	repo, _, _ := idRepo()
	repo.CreateParticipantFunc = func(_ context.Context, _ *Participant) error { return ErrParticipantAdhocNameExists }
	status, err := NewService(repo).CreateParticipant(context.Background(), &dto.CreateParticipantRequest{
		OperationID: "op-1", Adhoc: &dto.AdhocOrganization{Name: "Task Force Kilo"},
	}, &dto.CreateParticipantResponse{})
	if status != http.StatusConflict || !errors.Is(err, ErrParticipantAdhocNameExists) {
		t.Errorf("status = %d, err = %v; want 409 PARTICIPANT_ADHOC_NAME_EXISTS", status, err)
	}
}

func TestUpdateParticipantByID(t *testing.T) {
	repo, store, writes := idRepo()
	svc := NewService(repo)
	rec := &recorder{}
	svc.SetAudit(rec)
	svc.SetWaveformLookup(libraryOf("L16"))

	created := &dto.CreateParticipantResponse{}
	if status, err := svc.CreateParticipant(context.Background(), &dto.CreateParticipantRequest{
		OperationID: "op-1", UpdatedBy: "mike", Adhoc: &dto.AdhocOrganization{Name: "Task Force Kilo"},
	}, created); status != http.StatusCreated || err != nil {
		t.Fatalf("create: %d, %v", status, err)
	}
	pid := created.Participant.ID
	update := func(req *dto.UpdateParticipantByIDRequest) (int, error) {
		req.OperationID, req.ParticipantID, req.UpdatedBy = "op-1", pid, "mike"
		return svc.UpdateParticipantByID(context.Background(), req, &dto.UpdateParticipantByIDResponse{})
	}

	if status, err := update(&dto.UpdateParticipantByIDRequest{EquipmentIDs: []string{"prc-152"}, WaveformAbbrevs: []string{"L16"}}); status != http.StatusOK || err != nil {
		t.Fatalf("update: %d, %v", status, err)
	}
	if len(rec.events) != 2 || rec.events[1].Action != "update" || len(rec.events[1].Changes) != 2 {
		t.Fatalf("audit = %+v; want an update event with two changes", rec.events)
	}
	if store[pid].AdhocName != "Task Force Kilo" || !slices.Equal(store[pid].EquipmentIDs, []string{"prc-152"}) {
		t.Errorf("stored = %+v; identity must survive an update", store[pid])
	}

	before := *writes
	if status, err := update(&dto.UpdateParticipantByIDRequest{EquipmentIDs: []string{"prc-152"}, WaveformAbbrevs: []string{"L16"}}); status != http.StatusOK || err != nil {
		t.Fatalf("no-op: %d, %v", status, err)
	}
	if *writes != before || len(rec.events) != 2 {
		t.Errorf("writes = %d (was %d), events = %d; a no-op must do neither", *writes, before, len(rec.events))
	}

	t.Run("stale", func(t *testing.T) {
		status, err := update(&dto.UpdateParticipantByIDRequest{Notes: "x", ExpectedUpdatedAt: "2001-01-01T00:00:00Z"})
		if status != http.StatusConflict || !errors.Is(err, ErrParticipantStale) {
			t.Errorf("status = %d, err = %v; want 409 stale", status, err)
		}
	})
	t.Run("unknown id", func(t *testing.T) {
		status, err := svc.UpdateParticipantByID(context.Background(),
			&dto.UpdateParticipantByIDRequest{OperationID: "op-1", ParticipantID: "ghost"}, &dto.UpdateParticipantByIDResponse{})
		if status != http.StatusNotFound || !errors.Is(err, ErrParticipantNotFound) {
			t.Errorf("status = %d, err = %v; want 404", status, err)
		}
	})
	t.Run("unknown waveform", func(t *testing.T) {
		status, err := update(&dto.UpdateParticipantByIDRequest{WaveformAbbrevs: []string{"NOPE"}})
		if status != http.StatusBadRequest || err == nil {
			t.Errorf("status = %d, err = %v; want 400", status, err)
		}
	})
}

func TestDeleteParticipantByID(t *testing.T) {
	repo, store, _ := idRepo()
	svc := NewService(repo)
	rec := &recorder{}
	svc.SetAudit(rec)

	created := &dto.CreateParticipantResponse{}
	if _, err := svc.CreateParticipant(context.Background(), &dto.CreateParticipantRequest{
		OperationID: "op-1", Adhoc: &dto.AdhocOrganization{Name: "Task Force Kilo"},
	}, created); err != nil {
		t.Fatal(err)
	}
	status, err := svc.DeleteParticipantByID(context.Background(), &dto.DeleteParticipantByIDRequest{
		OperationID: "op-1", ParticipantID: created.Participant.ID, UpdatedBy: "mike",
	})
	if status != http.StatusNoContent || err != nil {
		t.Fatalf("status = %d, err = %v; want 204", status, err)
	}
	if len(store) != 0 {
		t.Errorf("store = %v; want the row removed", store)
	}
	if len(rec.events) != 2 || rec.events[1].Action != "delete" || rec.events[1].ResourceName != "Exercise One - Task Force Kilo" {
		t.Errorf("audit = %+v; want a delete naming the ad hoc organization", rec.events)
	}

	status, err = svc.DeleteParticipantByID(context.Background(), &dto.DeleteParticipantByIDRequest{OperationID: "op-1", ParticipantID: "ghost"})
	if status != http.StatusNotFound || !errors.Is(err, ErrParticipantNotFound) {
		t.Errorf("status = %d, err = %v; want 404", status, err)
	}
}

func TestOperationAcronym(t *testing.T) {
	t.Run("create trims and upper-cases", func(t *testing.T) {
		var created *Operation
		repo := &MockRepository{CreateFunc: func(_ context.Context, o *Operation) error { o.ID = "op-1"; created = o; return nil }}
		resp := &dto.CreateOperationResponse{}
		status, err := NewService(repo).CreateOperation(context.Background(),
			&dto.CreateOperationRequest{Name: "Exercise", Acronym: "  ms1 "}, resp)
		if status != http.StatusCreated || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if created.Acronym != "MS1" || resp.Operation.Acronym != "MS1" {
			t.Errorf("acronym = %q / %q; want MS1", created.Acronym, resp.Operation.Acronym)
		}
	})
	t.Run("update upper-cases, audits the change and a blank clears it", func(t *testing.T) {
		stored := &Operation{ID: "op-1", Name: "Ex", Status: "planning"}
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*Operation, error) { c := *stored; return &c, nil },
			UpdateFunc:   func(_ context.Context, o *Operation) error { c := *o; stored = &c; return nil },
		}
		svc := NewService(repo)
		rec := &recorder{}
		svc.SetAudit(rec)
		set := func(v string) {
			status, err := svc.UpdateOperation(context.Background(),
				&dto.UpdateOperationRequest{ID: "op-1", Acronym: &v, UpdatedBy: "mike"}, &dto.UpdateOperationResponse{})
			if status != http.StatusOK || err != nil {
				t.Fatalf("status = %d, err = %v", status, err)
			}
		}
		set("ms")
		if stored.Acronym != "MS" || len(rec.events) != 1 {
			t.Fatalf("stored %q, events %d", stored.Acronym, len(rec.events))
		}
		if _, ok := rec.events[0].Changes["acronym"]; !ok {
			t.Errorf("changes = %+v; want acronym named", rec.events[0].Changes)
		}
		set("")
		if stored.Acronym != "" {
			t.Errorf("acronym = %q; want cleared", stored.Acronym)
		}
	})
	t.Run("over-long is a 400 validation error", func(t *testing.T) {
		v := NewValidator()
		long := strings.Repeat("A", 21)
		if err := v.Validate(&dto.CreateOperationRequest{Name: "X", Acronym: long}); err == nil {
			t.Error("create accepted a 21 character acronym")
		}
		if err := v.Validate(&dto.UpdateOperationRequest{ID: "op-1", Acronym: &long}); err == nil {
			t.Error("update accepted a 21 character acronym")
		}
		if err := v.Validate(&dto.CreateOperationRequest{Name: "X", Acronym: strings.Repeat("A", 20)}); err != nil {
			t.Errorf("20 characters refused: %v", err)
		}
	})
}

func TestParticipantPlatformIDs(t *testing.T) {
	repo, store, _ := idRepo()
	svc := NewService(repo)
	rec := &recorder{}
	svc.SetAudit(rec)

	created := &dto.CreateParticipantResponse{}
	if status, err := svc.CreateParticipant(context.Background(), &dto.CreateParticipantRequest{
		OperationID: "op-1", UpdatedBy: "mike", Adhoc: &dto.AdhocOrganization{Name: "Task Force Kilo"},
		PlatformIDs: []string{"p1", "p1", "p2"},
	}, created); status != http.StatusCreated || err != nil {
		t.Fatalf("create: %d, %v", status, err)
	}
	pid := created.Participant.ID
	if !slices.Equal(created.Participant.PlatformIDs, []string{"p1", "p2"}) {
		t.Errorf("created platform_ids = %v; want de-duplicated", created.Participant.PlatformIDs)
	}

	if status, err := svc.UpdateParticipantByID(context.Background(), &dto.UpdateParticipantByIDRequest{
		OperationID: "op-1", ParticipantID: pid, UpdatedBy: "mike", PlatformIDs: []string{"p2", "p3"},
	}, &dto.UpdateParticipantByIDResponse{}); status != http.StatusOK || err != nil {
		t.Fatalf("update: %d, %v", status, err)
	}
	if !slices.Equal(store[pid].PlatformIDs, []string{"p2", "p3"}) {
		t.Errorf("stored platform_ids = %v", store[pid].PlatformIDs)
	}
	last := rec.events[len(rec.events)-1]
	if _, ok := last.Changes["platform_ids"]; !ok || last.Action != "update" {
		t.Errorf("audit = %+v; want platform_ids named in the diff", last)
	}

	if r := toParticipantResponse(&Participant{}); r.PlatformIDs == nil {
		t.Error("toParticipantResponse left platform_ids nil")
	}
}

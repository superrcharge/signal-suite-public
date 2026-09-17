package platform

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
	"testing"

	"backend/internal/domain/platform/dto"
	"backend/internal/shared/response"
)

// Every domain error must carry a code. A plain errors.New falls through to
// INTERNAL_ERROR, which is how a duplicate designation would report itself as
// "internal server error" while correctly returning 409.
func TestErrorsAreCoded(t *testing.T) {
	tests := []struct {
		err        *Error
		wantCode   string
		wantStatus int
	}{
		{ErrPlatformNotFound, "PLATFORM_NOT_FOUND", http.StatusNotFound},
		{ErrPlatformDesignationExists, "PLATFORM_DESIGNATION_EXISTS", http.StatusConflict},
		{ErrPlatformInvalidCategory, "PLATFORM_INVALID_CATEGORY", http.StatusBadRequest},
		{ErrPlatformInvalidKind, "PLATFORM_INVALID_KIND", http.StatusBadRequest},
		{ErrPlatformInternalError, "PLATFORM_INTERNAL_ERROR", http.StatusInternalServerError},
		// A constructor rather than a var: the message names the bad abbrevs.
		{ErrPlatformUnknownWaveform([]string{"NOPE"}), "PLATFORM_UNKNOWN_WAVEFORM", http.StatusBadRequest},
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

	got := response.Err(ErrPlatformDesignationExists)
	if got.Error == nil || got.Error.Code != "PLATFORM_DESIGNATION_EXISTS" {
		t.Errorf("envelope code = %+v, want PLATFORM_DESIGNATION_EXISTS", got.Error)
	}
}

// Normalisation is what buys back the consistency an open vocabulary gives up.
// The blank fallbacks are the migration's column defaults.
func TestNormaliseVocab(t *testing.T) {
	cats := map[string]string{
		"Joint":        "joint",
		"  COALITION ": "coalition",
		"":             "joint",
		"   ":          "joint",
	}
	for in, want := range cats {
		if got := NormaliseCategory(in); got != want {
			t.Errorf("NormaliseCategory(%q) = %q, want %q", in, got, want)
		}
	}
	kinds := map[string]string{
		"Ship":             "ship",
		"ground_vehicle":   "ground vehicle",
		"ground   station": "ground station",
		"":                 "aircraft",
	}
	for in, want := range kinds {
		if got := NormaliseKind(in); got != want {
			t.Errorf("NormaliseKind(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIsValidVocab(t *testing.T) {
	for _, v := range []string{"joint", "fixed relay site", "uas-group-3"} {
		if !IsValidVocab(v) {
			t.Errorf("IsValidVocab(%q) = false, want true", v)
		}
	}
	for _, v := range []string{"", strings.Repeat("a", MaxVocabLen+1), "<script>", "-leading", "a/b"} {
		if IsValidVocab(v) {
			t.Errorf("IsValidVocab(%q) = true, want false", v)
		}
	}
}

// Abbrevs are compared case-insensitively everywhere they are read, so a
// repeat differing only by case is one waveform, and the first spelling wins.
func TestNormaliseAbbrevs(t *testing.T) {
	got := NormaliseAbbrevs([]string{" L16 ", "MADL", "l16", "", "  ", "SATCOM UHF"})
	want := []string{"L16", "MADL", "SATCOM UHF"}
	if !slices.Equal(got, want) {
		t.Errorf("NormaliseAbbrevs = %v, want %v", got, want)
	}
}

func TestNormaliseIDsKeepsCaseAndDropsExactRepeats(t *testing.T) {
	got := NormaliseIDs([]string{"a", " a ", "A", ""})
	want := []string{"a", "A"}
	if !slices.Equal(got, want) {
		t.Errorf("NormaliseIDs = %v, want %v", got, want)
	}
}

func TestCreatePlatformStoresNormalisedValues(t *testing.T) {
	var created *Platform
	repo := &MockRepository{
		CreateFunc: func(_ context.Context, p *Platform) error {
			created = p
			return nil
		},
		FindAllFunc: func(_ context.Context) ([]*Platform, error) {
			return []*Platform{{ID: "new", Designation: "F-35A"}}, nil
		},
	}
	svc := NewService(repo)

	resp := &dto.CreatePlatformResponse{}
	status, err := svc.CreatePlatform(context.Background(), &dto.CreatePlatformRequest{
		Designation:     "  F-35A ",
		Category:        "Joint",
		Kind:            "",
		Operator:        " USAF ",
		WaveformAbbrevs: []string{"L16", "l16", "MADL"},
	}, resp)

	if status != http.StatusCreated || err != nil {
		t.Fatalf("status = %d, err = %v; want 201 / nil", status, err)
	}
	if created.Designation != "F-35A" || created.Operator != "USAF" {
		t.Errorf("stored %+v; want trimmed designation and operator", created)
	}
	if created.Category != "joint" || created.Kind != "aircraft" {
		t.Errorf("category/kind = %q/%q, want joint/aircraft", created.Category, created.Kind)
	}
	if !slices.Equal(created.WaveformAbbrevs, []string{"L16", "MADL"}) {
		t.Errorf("abbrevs = %v, want [L16 MADL]", created.WaveformAbbrevs)
	}
	if resp.Platform.ID != "new" {
		t.Errorf("response ID = %q, want the re-fetched ID", resp.Platform.ID)
	}
}

// A nil list must reach the wire as [], not null, or the frontend's
// `.map` on it throws.
func TestResponseListsAreNeverNull(t *testing.T) {
	r := toResponse(&Platform{})
	if r.WaveformAbbrevs == nil || r.EquipmentIDs == nil {
		t.Errorf("toResponse left a nil list: %+v", r)
	}
}

func TestCreatePlatformRejectsMalformedVocab(t *testing.T) {
	svc := NewService(&MockRepository{})

	status, err := svc.CreatePlatform(context.Background(),
		&dto.CreatePlatformRequest{Designation: "X", Category: "<b>"}, &dto.CreatePlatformResponse{})
	if status != http.StatusBadRequest || !errors.Is(err, ErrPlatformInvalidCategory) {
		t.Errorf("category: status = %d, err = %v; want 400 / %v", status, err, ErrPlatformInvalidCategory)
	}

	status, err = svc.CreatePlatform(context.Background(),
		&dto.CreatePlatformRequest{Designation: "X", Kind: "a/b"}, &dto.CreatePlatformResponse{})
	if status != http.StatusBadRequest || !errors.Is(err, ErrPlatformInvalidKind) {
		t.Errorf("kind: status = %d, err = %v; want 400 / %v", status, err, ErrPlatformInvalidKind)
	}
}

func TestCreatePlatformRejectsDuplicateDesignation(t *testing.T) {
	repo := &MockRepository{
		DesignationExistsFunc: func(_ context.Context, _ string) (bool, error) { return true, nil },
	}
	svc := NewService(repo)

	status, err := svc.CreatePlatform(context.Background(),
		&dto.CreatePlatformRequest{Designation: "f-35a"}, &dto.CreatePlatformResponse{})

	if status != http.StatusConflict || !errors.Is(err, ErrPlatformDesignationExists) {
		t.Errorf("status = %d, err = %v; want 409 / %v", status, err, ErrPlatformDesignationExists)
	}
}

func TestUpdatePlatformAppliesOnlyTheFieldsSent(t *testing.T) {
	existing := &Platform{
		ID: "1", Designation: "F-35A", Category: "joint", Kind: "aircraft",
		WaveformAbbrevs: []string{"L16"}, Notes: "keep me",
	}
	var updated *Platform
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, _ string) (*Platform, error) { return existing, nil },
		UpdateFunc: func(_ context.Context, p *Platform) error {
			updated = p
			return nil
		},
	}
	svc := NewService(repo)

	abbrevs := []string{"L16", "MADL"}
	status, err := svc.UpdatePlatform(context.Background(),
		&dto.UpdatePlatformRequest{ID: "1", WaveformAbbrevs: &abbrevs, UpdatedBy: "mike"},
		&dto.UpdatePlatformResponse{})

	if status != http.StatusOK || err != nil {
		t.Fatalf("status = %d, err = %v; want 200 / nil", status, err)
	}
	if !slices.Equal(updated.WaveformAbbrevs, abbrevs) {
		t.Errorf("abbrevs = %v, want %v", updated.WaveformAbbrevs, abbrevs)
	}
	if updated.Notes != "keep me" || updated.Designation != "F-35A" {
		t.Errorf("an omitted field was changed: %+v", updated)
	}
}

// The audit diff must see the list change. It compares against a copy taken
// before mutation, and a list is a slice header - so this also guards against
// the copy aliasing the new value.
func TestDiffPlatformReportsListChanges(t *testing.T) {
	before := &Platform{WaveformAbbrevs: []string{"L16"}}
	after := &Platform{WaveformAbbrevs: []string{"L16", "MADL"}}
	changes := diffPlatform(before, after)
	got, ok := changes["waveform_abbrevs"].(map[string]any)
	if !ok || got["old"] != "L16" || got["new"] != "L16, MADL" {
		t.Errorf("changes = %+v", changes)
	}
}

func TestUpdatePlatformRejectsDuplicateDesignation(t *testing.T) {
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, _ string) (*Platform, error) {
			return &Platform{ID: "1", Designation: "Old"}, nil
		},
		DesignationExistsExcludingFunc: func(_ context.Context, _, _ string) (bool, error) { return true, nil },
	}
	svc := NewService(repo)

	taken := "F-35A"
	status, err := svc.UpdatePlatform(context.Background(),
		&dto.UpdatePlatformRequest{ID: "1", Designation: &taken}, &dto.UpdatePlatformResponse{})

	if status != http.StatusConflict || !errors.Is(err, ErrPlatformDesignationExists) {
		t.Errorf("status = %d, err = %v; want 409 / %v", status, err, ErrPlatformDesignationExists)
	}
}

func TestDeletePlatformIsNotFoundWhenAbsent(t *testing.T) {
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, _ string) (*Platform, error) {
			return nil, ErrPlatformNotFound
		},
	}
	svc := NewService(repo)

	status, err := svc.DeletePlatform(context.Background(), &dto.DeletePlatformRequest{ID: "gone"})

	if status != http.StatusNotFound || !errors.Is(err, ErrPlatformNotFound) {
		t.Errorf("status = %d, err = %v; want 404 / %v", status, err, ErrPlatformNotFound)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// A platform may only name waveforms the library declares. This
// reverses migration 040's deliberate tolerance, which existed to protect
// against rename and retirement - both of which the waveform domain now handles
// directly, so the tolerance no longer buys what it was bought for.
// ─────────────────────────────────────────────────────────────────────────────

type mockLibrary struct {
	known map[string]struct{}
	err   error
}

func (m *mockLibrary) KnownWaveformAbbrevs(_ context.Context) (map[string]struct{}, error) {
	return m.known, m.err
}

func libraryOf(abbrevs ...string) *mockLibrary {
	known := map[string]struct{}{}
	for _, a := range abbrevs {
		known[strings.ToLower(a)] = struct{}{}
	}
	return &mockLibrary{known: known}
}

func platformSvc(lib *mockLibrary, created *bool) *Service {
	repo := &MockRepository{
		CreateFunc: func(_ context.Context, _ *Platform) error {
			if created != nil {
				*created = true
			}
			return nil
		},
		FindByIDFunc: func(_ context.Context, _ string) (*Platform, error) {
			return &Platform{ID: "p1", Designation: "F-35A", Category: "joint", Kind: "aircraft"}, nil
		},
	}
	svc := NewService(repo)
	if lib != nil {
		svc.SetWaveformLookup(lib)
	}
	return svc
}

func TestPlatformWaveformsMustBeInTheLibrary(t *testing.T) {
	t.Run("rejects a create naming an unknown abbrev, and says which", func(t *testing.T) {
		created := false
		svc := platformSvc(libraryOf("L16"), &created)

		status, err := svc.CreatePlatform(context.Background(),
			&dto.CreatePlatformRequest{Designation: "F-35A", WaveformAbbrevs: []string{"L16", "MADL"}},
			&dto.CreatePlatformResponse{})

		if status != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", status)
		}
		if created {
			t.Error("the platform was stored despite the refusal")
		}
		if err == nil {
			t.Fatal("no error returned")
		}
		// Naming the offender matters on a platform carrying eight of them.
		if !strings.Contains(err.Error(), "MADL") {
			t.Errorf("message does not name the unknown abbrev: %q", err.Error())
		}
		if strings.Contains(err.Error(), "L16") {
			t.Errorf("message names an abbrev that WAS in the library: %q", err.Error())
		}
	})

	t.Run("accepts a create whose abbrevs are all known, case-insensitively", func(t *testing.T) {
		created := false
		svc := platformSvc(libraryOf("L16", "MADL"), &created)

		status, err := svc.CreatePlatform(context.Background(),
			&dto.CreatePlatformRequest{Designation: "F-35A", WaveformAbbrevs: []string{"l16", " MADL "}},
			&dto.CreatePlatformResponse{})

		if status >= http.StatusBadRequest || !created {
			t.Errorf("status = %d, err = %v, created = %v; want a successful create", status, err, created)
		}
	})

	t.Run("rejects an update naming an unknown abbrev", func(t *testing.T) {
		svc := platformSvc(libraryOf("L16"), nil)
		abbrevs := []string{"IFDL"}

		status, err := svc.UpdatePlatform(context.Background(),
			&dto.UpdatePlatformRequest{ID: "p1", WaveformAbbrevs: &abbrevs},
			&dto.UpdatePlatformResponse{})

		if status != http.StatusBadRequest || err == nil {
			t.Errorf("status = %d, err = %v; want 400", status, err)
		}
	})

	t.Run("a library lookup failure refuses rather than admitting the abbrev", func(t *testing.T) {
		created := false
		svc := platformSvc(&mockLibrary{err: errors.New("db down")}, &created)

		status, _ := svc.CreatePlatform(context.Background(),
			&dto.CreatePlatformRequest{Designation: "F-35A", WaveformAbbrevs: []string{"L16"}},
			&dto.CreatePlatformResponse{})

		if status != http.StatusInternalServerError || created {
			t.Errorf("status = %d, created = %v; a failed lookup has not established the abbrev is known", status, created)
		}
	})

	t.Run("stays permissive with no library wired", func(t *testing.T) {
		// Every other unit test in this package builds a Service without it.
		created := false
		svc := platformSvc(nil, &created)

		status, _ := svc.CreatePlatform(context.Background(),
			&dto.CreatePlatformRequest{Designation: "F-35A", WaveformAbbrevs: []string{"ANYTHING"}},
			&dto.CreatePlatformResponse{})

		if status >= http.StatusBadRequest || !created {
			t.Errorf("status = %d, created = %v; want a successful create", status, created)
		}
	})
}

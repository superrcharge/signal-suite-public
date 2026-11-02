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
	"backend/internal/shared/response"
)

func TestPhaseErrorsAreCoded(t *testing.T) {
	tests := []struct {
		err        *Error
		wantCode   string
		wantStatus int
	}{
		{ErrOperationPhasesRequired, "OPERATION_PHASES_REQUIRED", http.StatusBadRequest},
		{ErrOperationPhaseNameInvalid, "OPERATION_PHASE_NAME_INVALID", http.StatusBadRequest},
		{ErrOperationPhaseNameExists, "OPERATION_PHASE_NAME_EXISTS", http.StatusConflict},
		{ErrOperationUnknownPhase([]string{"ghost"}), "OPERATION_UNKNOWN_PHASE", http.StatusBadRequest},
		{ErrParticipantUnknownAsset([]string{"ghost"}), "PARTICIPANT_UNKNOWN_ASSET", http.StatusBadRequest},
	}
	for _, tt := range tests {
		var coded response.CodedError = tt.err
		if coded.GetCode() != tt.wantCode || coded.GetStatus() != tt.wantStatus || coded.Error() == "" {
			t.Errorf("%s = %q / %d / %q; want %d", tt.wantCode, coded.GetCode(), coded.GetStatus(), coded.Error(), tt.wantStatus)
		}
	}
	if !strings.Contains(ErrParticipantUnknownAsset([]string{"a1", "a2"}).Message, "a1, a2") ||
		!strings.Contains(ErrOperationUnknownPhase([]string{"p9"}).Message, "p9") {
		t.Error("the unknown-asset and unknown-phase messages must name the offending ids")
	}
}

func TestDefaultPhaseNames(t *testing.T) {
	want := []string{"Phase I", "Phase II", "Phase III", "Phase IV"}
	if !slices.Equal(DefaultPhaseNames, want) {
		t.Errorf("DefaultPhaseNames = %v; migration 051 backfills %v", DefaultPhaseNames, want)
	}
}

func TestCreateOperationSeedsDefaultPhases(t *testing.T) {
	var created *Operation
	repo := &MockRepository{CreateFunc: func(_ context.Context, o *Operation) error {
		o.ID = "op-9"
		created = o
		return nil
	}}
	svc := NewService(repo)
	if status, err := svc.CreateOperation(context.Background(), &dto.CreateOperationRequest{Name: "Exercise"}, &dto.CreateOperationResponse{}); status != http.StatusCreated || err != nil {
		t.Fatalf("status = %d, err = %v", status, err)
	}
	if !slices.Equal(created.PhaseNames, DefaultPhaseNames) {
		t.Errorf("phase names handed to the repository = %v; want %v", created.PhaseNames, DefaultPhaseNames)
	}
	// The package variable must not be the slice the repository received, or a
	// caller that edited it would rename every later operation's phases.
	created.PhaseNames[0] = "changed"
	if DefaultPhaseNames[0] != "Phase I" {
		t.Error("CreateOperation shared DefaultPhaseNames instead of copying it")
	}
}

func phaseList(names ...string) []*Phase {
	out := make([]*Phase, len(names))
	for i, n := range names {
		out[i] = &Phase{ID: "ph-" + strings.ToLower(strings.ReplaceAll(n, " ", "")), OperationID: "op-1", Position: i, Name: n}
	}
	return out
}

func ids(phases []*Phase) []string {
	out := make([]string, len(phases))
	for i, p := range phases {
		out[i] = p.ID
	}
	return out
}

func rowsOf(spec ...string) []AssetPhaseRow {
	// "participant/asset/phase"
	out := make([]AssetPhaseRow, len(spec))
	for i, s := range spec {
		f := strings.Split(s, "/")
		out[i] = AssetPhaseRow{ParticipantID: f[0], AssetID: f[1], PhaseID: f[2]}
	}
	return out
}

func TestCarryForwardAssetRows(t *testing.T) {
	existing := phaseList("One", "Two", "Three")
	rows := rowsOf("p/a/ph-one", "p/b/ph-one", "p/a/ph-two", "q/c/ph-three")

	t.Run("a new phase copies the one before it in the new order", func(t *testing.T) {
		fresh := &Phase{ID: "new", Position: 2, Name: "New"}
		order := []*Phase{existing[0], existing[1], fresh, existing[2]}
		got := carryForwardAssetRows(order, map[string]bool{"new": true}, rows)
		want := rowsOf("p/a/new")
		if !slices.Equal(got, want) {
			t.Errorf("got %v; want %v (the rows of Two, not of One or Three)", got, want)
		}
	})
	t.Run("a new first phase copies nothing", func(t *testing.T) {
		fresh := &Phase{ID: "new", Name: "New"}
		order := []*Phase{fresh, existing[0], existing[1], existing[2]}
		if got := carryForwardAssetRows(order, map[string]bool{"new": true}, rows); len(got) != 0 {
			t.Errorf("got %v; want nothing", got)
		}
	})
	t.Run("the phase before is read from the new order, not the old", func(t *testing.T) {
		// Three now follows One, so a new phase between them starts as One was.
		fresh := &Phase{ID: "new", Name: "New"}
		order := []*Phase{existing[0], fresh, existing[2]}
		got := carryForwardAssetRows(order, map[string]bool{"new": true}, rows)
		if !slices.Equal(got, rowsOf("p/a/new", "p/b/new")) {
			t.Errorf("got %v; want One's two rows", got)
		}
	})
	t.Run("two new phases in a row chain", func(t *testing.T) {
		a := &Phase{ID: "na", Name: "NA"}
		b := &Phase{ID: "nb", Name: "NB"}
		order := []*Phase{existing[0], a, b}
		got := carryForwardAssetRows(order, map[string]bool{"na": true, "nb": true}, rows)
		if !slices.Equal(got, rowsOf("p/a/na", "p/b/na", "p/a/nb", "p/b/nb")) {
			t.Errorf("got %v; want the second new phase to repeat the first", got)
		}
	})
	t.Run("no new phase, no rows", func(t *testing.T) {
		if got := carryForwardAssetRows(existing, map[string]bool{}, rows); len(got) != 0 {
			t.Errorf("got %v; want nothing", got)
		}
	})
	t.Run("a phase with no rows copies none", func(t *testing.T) {
		fresh := &Phase{ID: "new", Name: "New"}
		order := []*Phase{{ID: "empty"}, fresh}
		if got := carryForwardAssetRows(order, map[string]bool{"new": true}, rows); len(got) != 0 {
			t.Errorf("got %v; want nothing", got)
		}
	})
}

// savedPhases is what ReplacePhases was last called with.
type savedPhases struct {
	phases  []*Phase
	carried []AssetPhaseRow
	by      string
	calls   int
}

func phaseRepoFor(existing []*Phase, parts []*Participant) (*MockRepository, *savedPhases) {
	saved := &savedPhases{}
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, id string) (*Operation, error) {
			return &Operation{ID: id, Name: "Exercise One"}, nil
		},
		FindPhasesFunc:       func(context.Context, string) ([]*Phase, error) { return existing, nil },
		FindParticipantsFunc: func(context.Context, string) ([]*Participant, error) { return parts, nil },
		ReplacePhasesFunc: func(_ context.Context, _ string, phases []*Phase, carried []AssetPhaseRow, by string, _ time.Time) error {
			saved.phases, saved.carried, saved.by = phases, carried, by
			saved.calls++
			return nil
		},
	}
	return repo, saved
}

func inputs(spec ...string) []dto.PhaseInput {
	// "id:name", or just "name" for a new phase
	out := make([]dto.PhaseInput, len(spec))
	for i, s := range spec {
		if id, name, ok := strings.Cut(s, ":"); ok {
			out[i] = dto.PhaseInput{ID: id, Name: name}
		} else {
			out[i] = dto.PhaseInput{Name: s}
		}
	}
	return out
}

func TestSavePhases(t *testing.T) {
	existing := phaseList("Phase I", "Phase II", "Phase III")
	parts := []*Participant{{ID: "p1", AssetPhases: map[string][]string{
		"a": {"ph-phasei", "ph-phaseii"},
		"b": {"ph-phaseii", "ph-phaseiii"},
	}}}
	save := func(repo *MockRepository, in ...dto.PhaseInput) (*dto.SavePhasesResponse, int, error) {
		svc := NewService(repo)
		rec := &recorder{}
		svc.SetAudit(rec)
		resp := &dto.SavePhasesResponse{}
		status, err := svc.SavePhases(context.Background(), &dto.SavePhasesRequest{OperationID: "op-1", Phases: in, UpdatedBy: "mike"}, resp)
		return resp, status, err
	}

	t.Run("keeps and renames in place", func(t *testing.T) {
		repo, saved := phaseRepoFor(existing, parts)
		resp, status, err := save(repo, inputs("ph-phasei: Insertion ", "ph-phaseii:Phase II", "ph-phaseiii:Phase III")...)
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if saved.calls != 1 || saved.phases[0].Name != "Insertion" || saved.phases[0].ID != "ph-phasei" {
			t.Errorf("saved %+v; want Phase I kept under its id and renamed, name trimmed", saved.phases[0])
		}
		if len(saved.carried) != 0 || saved.by != "mike" {
			t.Errorf("carried = %v, by = %q; a rename carries nothing", saved.carried, saved.by)
		}
		if len(resp.Phases) != 3 || resp.Phases[0].Name != "Insertion" || resp.Phases[0].Position != 0 {
			t.Errorf("response = %+v", resp.Phases)
		}
	})

	t.Run("reorders by array index", func(t *testing.T) {
		repo, saved := phaseRepoFor(existing, parts)
		resp, status, err := save(repo, inputs("ph-phaseiii:Phase III", "ph-phasei:Phase I", "ph-phaseii:Phase II")...)
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if !slices.Equal(ids(saved.phases), []string{"ph-phaseiii", "ph-phasei", "ph-phaseii"}) {
			t.Errorf("order = %v", ids(saved.phases))
		}
		for i, ph := range resp.Phases {
			if ph.Position != i || ph.OperationID != "op-1" {
				t.Errorf("phase %d = %+v; want position = index", i, ph)
			}
		}
	})

	t.Run("inserts a new phase and copies the previous one's rows", func(t *testing.T) {
		repo, saved := phaseRepoFor(existing, parts)
		resp, status, err := save(repo, inputs("ph-phasei:Phase I", "ph-phaseii:Phase II", "Surge", "ph-phaseiii:Phase III")...)
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		newID := resp.Phases[2].ID
		if newID == "" || strings.HasPrefix(newID, "ph-") {
			t.Fatalf("new phase id = %q; want a generated one", newID)
		}
		want := []AssetPhaseRow{{"p1", "b", newID}}
		want = append([]AssetPhaseRow{{"p1", "a", newID}}, want...)
		if !slices.Equal(saved.carried, want) {
			t.Errorf("carried = %v; want Phase II's rows (a and b) under %s", saved.carried, newID)
		}
	})

	t.Run("a new first phase copies nothing", func(t *testing.T) {
		repo, saved := phaseRepoFor(existing, parts)
		_, status, err := save(repo, inputs("Staging", "ph-phasei:Phase I", "ph-phaseii:Phase II", "ph-phaseiii:Phase III")...)
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if len(saved.carried) != 0 {
			t.Errorf("carried = %v; want none", saved.carried)
		}
	})

	t.Run("a phase left out is deleted", func(t *testing.T) {
		repo, saved := phaseRepoFor(existing, parts)
		rec := &recorder{}
		svc := NewService(repo)
		svc.SetAudit(rec)
		resp := &dto.SavePhasesResponse{}
		status, err := svc.SavePhases(context.Background(), &dto.SavePhasesRequest{
			OperationID: "op-1", UpdatedBy: "mike",
			Phases: inputs("ph-phasei:Phase I", "ph-phaseiii:Phase III"),
		}, resp)
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if !slices.Equal(ids(saved.phases), []string{"ph-phasei", "ph-phaseiii"}) || len(resp.Phases) != 2 {
			t.Errorf("saved = %v; the repository is handed only the survivors", ids(saved.phases))
		}
		if len(rec.events) != 1 || rec.events[0].ResourceType != "operation" || rec.events[0].Action != "update" {
			t.Fatalf("audit = %+v", rec.events)
		}
		change, _ := rec.events[0].Changes["phases"].(map[string]any)
		if change["old"] != "Phase I, Phase II, Phase III" || change["new"] != "Phase I, Phase III" {
			t.Errorf("audit change = %v; want the name lists before and after", change)
		}
	})

	t.Run("an unchanged list writes nothing", func(t *testing.T) {
		repo, saved := phaseRepoFor(existing, parts)
		resp, status, err := save(repo, inputs("ph-phasei:Phase I", "ph-phaseii:Phase II", "ph-phaseiii:Phase III")...)
		if status != http.StatusOK || err != nil || saved.calls != 0 || len(resp.Phases) != 3 {
			t.Errorf("status = %d, err = %v, writes = %d; want a 200 and no write", status, err, saved.calls)
		}
	})

	t.Run("refusals", func(t *testing.T) {
		tooLong := strings.Repeat("x", 61)
		tests := []struct {
			name       string
			in         []dto.PhaseInput
			wantErr    string
			wantStatus int
		}{
			{"empty list", nil, "OPERATION_PHASES_REQUIRED", http.StatusBadRequest},
			{"blank name", inputs("ph-phasei:   "), "OPERATION_PHASE_NAME_INVALID", http.StatusBadRequest},
			{"name over 60", inputs(tooLong), "OPERATION_PHASE_NAME_INVALID", http.StatusBadRequest},
			{"duplicate names, case-insensitive", inputs("ph-phasei:Alpha", "alpha "), "OPERATION_PHASE_NAME_EXISTS", http.StatusConflict},
			{"unknown id", inputs("ph-phasei:Phase I", "ph-ghost:Ghost"), "OPERATION_UNKNOWN_PHASE", http.StatusBadRequest},
			{"the same id twice", inputs("ph-phasei:A", "ph-phasei:B"), "OPERATION_UNKNOWN_PHASE", http.StatusBadRequest},
		}
		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				repo, saved := phaseRepoFor(existing, parts)
				_, status, err := save(repo, tt.in...)
				var coded *Error
				if !errors.As(err, &coded) || coded.Code != tt.wantErr || status != tt.wantStatus {
					t.Errorf("status = %d, err = %v; want %d %s", status, err, tt.wantStatus, tt.wantErr)
				}
				if saved.calls != 0 {
					t.Error("a refused save must write nothing")
				}
			})
		}
	})

	t.Run("a phase id from another operation is unknown", func(t *testing.T) {
		repo, _ := phaseRepoFor(existing, parts)
		_, status, err := save(repo, inputs("ph-of-another-op:Phase I")...)
		if status != http.StatusBadRequest || err == nil || !strings.Contains(err.Error(), "ph-of-another-op") {
			t.Errorf("status = %d, err = %v; want 400 naming the id", status, err)
		}
	})

	t.Run("unknown operation", func(t *testing.T) {
		repo, _ := phaseRepoFor(existing, parts)
		repo.FindByIDFunc = func(context.Context, string) (*Operation, error) { return nil, ErrOperationNotFound }
		_, status, err := save(repo, inputs("Phase I")...)
		if status != http.StatusNotFound || !errors.Is(err, ErrOperationNotFound) {
			t.Errorf("status = %d, err = %v; want 404 OPERATION_NOT_FOUND", status, err)
		}
	})

	t.Run("a repository failure is internal", func(t *testing.T) {
		repo, _ := phaseRepoFor(existing, parts)
		repo.ReplacePhasesFunc = func(context.Context, string, []*Phase, []AssetPhaseRow, string, time.Time) error {
			return errors.New("boom")
		}
		_, status, err := save(repo, inputs("Phase I")...)
		if status != http.StatusInternalServerError || !errors.Is(err, ErrOperationInternalError) {
			t.Errorf("status = %d, err = %v; want 500", status, err)
		}
	})

	t.Run("a repository name collision keeps its code", func(t *testing.T) {
		repo, _ := phaseRepoFor(existing, parts)
		repo.ReplacePhasesFunc = func(context.Context, string, []*Phase, []AssetPhaseRow, string, time.Time) error {
			return ErrOperationPhaseNameExists
		}
		_, status, err := save(repo, inputs("Phase I")...)
		if status != http.StatusConflict || !errors.Is(err, ErrOperationPhaseNameExists) {
			t.Errorf("status = %d, err = %v; want 409", status, err)
		}
	})
}

func TestGetOperationCarriesPhasesAndAssetPhases(t *testing.T) {
	repo := &MockRepository{
		FindByIDFunc:   func(_ context.Context, id string) (*Operation, error) { return &Operation{ID: id, Name: "Ex"}, nil },
		FindPhasesFunc: func(context.Context, string) ([]*Phase, error) { return phaseList("Phase I", "Phase II"), nil },
		FindParticipantsFunc: func(context.Context, string) ([]*Participant, error) {
			return []*Participant{
				{OrganizationKey: "green", PlatformIDs: []string{"pl-1"}, TransportIDs: []string{"tr-1"},
					AssetPhases: map[string][]string{"pl-1": {"ph-phasei"}}},
				{OrganizationKey: "blue"},
			}, nil
		},
	}
	resp := &dto.GetOperationResponse{}
	if _, err := NewService(repo).GetOperation(context.Background(), &dto.GetOperationRequest{ID: "op-1"}, resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Phases) != 2 || resp.Phases[1].Name != "Phase II" || resp.Phases[1].Position != 1 {
		t.Errorf("phases = %+v", resp.Phases)
	}
	green, blue := resp.Participants[0].AssetPhases, resp.Participants[1].AssetPhases
	if !slices.Equal(green["pl-1"], []string{"ph-phasei"}) || green["tr-1"] == nil || len(green["tr-1"]) != 0 {
		t.Errorf("green = %v; want pl-1 in Phase I and tr-1 as an empty list, not null", green)
	}
	if blue == nil || len(blue) != 0 {
		t.Errorf("blue = %v; want an empty object, never null", blue)
	}

	empty := &MockRepository{FindByIDFunc: repo.FindByIDFunc}
	resp = &dto.GetOperationResponse{}
	if _, err := NewService(empty).GetOperation(context.Background(), &dto.GetOperationRequest{ID: "op-1"}, resp); err != nil {
		t.Fatal(err)
	}
	if resp.Phases == nil {
		t.Error("phases must be [] not null")
	}
}

// assetRepo is an in-memory check-in store addressed by id, with the three
// phases of a typical operation, for the writes that carry asset_phases.
func assetRepo() (*MockRepository, map[string]*Participant) {
	repo, store, _ := idRepo()
	phases := phaseList("Phase I", "Phase II", "Phase III")
	repo.FindPhasesFunc = func(context.Context, string) ([]*Phase, error) { return phases, nil }
	return repo, store
}

func TestParticipantAssetPhases(t *testing.T) {
	const (
		p1, p2, p3 = "ph-phasei", "ph-phaseii", "ph-phaseiii"
	)
	allPhases := []string{p1, p2, p3}
	ctx := context.Background()

	create := func(svc *Service, req *dto.CreateParticipantRequest) (*dto.CreateParticipantResponse, int, error) {
		req.OperationID, req.UpdatedBy = "op-1", "mike"
		if req.Adhoc == nil && req.OrganizationKey == "" {
			req.Adhoc = &dto.AdhocOrganization{Name: "Task Force Kilo"}
		}
		resp := &dto.CreateParticipantResponse{}
		status, err := svc.CreateParticipant(ctx, req, resp)
		return resp, status, err
	}
	patch := func(svc *Service, pid string, req *dto.UpdateParticipantByIDRequest) (*dto.UpdateParticipantByIDResponse, int, error) {
		req.OperationID, req.ParticipantID, req.UpdatedBy = "op-1", pid, "mike"
		resp := &dto.UpdateParticipantByIDResponse{}
		status, err := svc.UpdateParticipantByID(ctx, req, resp)
		return resp, status, err
	}

	t.Run("a first check-in with no map puts every asset in every phase", func(t *testing.T) {
		repo, store := assetRepo()
		resp, status, err := create(NewService(repo), &dto.CreateParticipantRequest{
			PlatformIDs: []string{"pl-1"}, EquipmentIDs: []string{"eq-1"}, TransportIDs: []string{"tr-1"},
		})
		if status != http.StatusCreated || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		for _, a := range []string{"pl-1", "eq-1", "tr-1"} {
			if !slices.Equal(store[resp.Participant.ID].AssetPhases[a], allPhases) || !slices.Equal(resp.Participant.AssetPhases[a], allPhases) {
				t.Errorf("%s stored %v, returned %v; want every phase", a, store[resp.Participant.ID].AssetPhases[a], resp.Participant.AssetPhases[a])
			}
		}
	})

	t.Run("a sent map is stored, ordered by phase, and an omitted asset goes in every phase", func(t *testing.T) {
		repo, store := assetRepo()
		resp, status, err := create(NewService(repo), &dto.CreateParticipantRequest{
			PlatformIDs: []string{"pl-1", "pl-2"}, EquipmentIDs: []string{"eq-1"},
			AssetPhases: map[string][]string{"pl-1": {p3, p1}},
		})
		if status != http.StatusCreated || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		got := store[resp.Participant.ID].AssetPhases
		if !slices.Equal(got["pl-1"], []string{p1, p3}) {
			t.Errorf("pl-1 = %v; want [Phase I, Phase III] in phase order", got["pl-1"])
		}
		if !slices.Equal(got["pl-2"], allPhases) || !slices.Equal(got["eq-1"], allPhases) {
			t.Errorf("pl-2 = %v, eq-1 = %v; an asset the map omits belongs to every phase", got["pl-2"], got["eq-1"])
		}
	})

	t.Run("an empty list means brought, in no phase", func(t *testing.T) {
		repo, store := assetRepo()
		resp, status, err := create(NewService(repo), &dto.CreateParticipantRequest{
			PlatformIDs: []string{"pl-1"}, AssetPhases: map[string][]string{"pl-1": {}},
		})
		if status != http.StatusCreated || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if got := store[resp.Participant.ID].AssetPhases["pl-1"]; len(got) != 0 {
			t.Errorf("pl-1 = %v; want none", got)
		}
		if got, ok := resp.Participant.AssetPhases["pl-1"]; !ok || got == nil || len(got) != 0 {
			t.Errorf("response pl-1 = %v (present %v); want an empty list", got, ok)
		}
	})

	t.Run("an empty object benches nothing it does not name", func(t *testing.T) {
		repo, store := assetRepo()
		resp, _, _ := create(NewService(repo), &dto.CreateParticipantRequest{
			PlatformIDs: []string{"pl-1"}, AssetPhases: map[string][]string{},
		})
		if !slices.Equal(store[resp.Participant.ID].AssetPhases["pl-1"], allPhases) {
			t.Errorf("pl-1 = %v; an empty map names no asset, so every phase", store[resp.Participant.ID].AssetPhases["pl-1"])
		}
	})

	t.Run("refuses an asset the check-in does not bring", func(t *testing.T) {
		repo, _ := assetRepo()
		_, status, err := create(NewService(repo), &dto.CreateParticipantRequest{
			PlatformIDs: []string{"pl-1"}, AssetPhases: map[string][]string{"pl-1": {p1}, "ghost": {p1}, "wf-1": {p2}},
		})
		var coded *Error
		if status != http.StatusBadRequest || !errors.As(err, &coded) || coded.Code != "PARTICIPANT_UNKNOWN_ASSET" ||
			!strings.Contains(coded.Message, "ghost, wf-1") {
			t.Errorf("status = %d, err = %v; want 400 PARTICIPANT_UNKNOWN_ASSET naming ghost and wf-1", status, err)
		}
	})

	t.Run("refuses a phase the operation does not have", func(t *testing.T) {
		repo, store := assetRepo()
		_, status, err := create(NewService(repo), &dto.CreateParticipantRequest{
			PlatformIDs: []string{"pl-1"}, AssetPhases: map[string][]string{"pl-1": {p1, "ph-ghost"}},
		})
		var coded *Error
		if status != http.StatusBadRequest || !errors.As(err, &coded) || coded.Code != "OPERATION_UNKNOWN_PHASE" ||
			!strings.Contains(coded.Message, "ph-ghost") {
			t.Errorf("status = %d, err = %v; want 400 OPERATION_UNKNOWN_PHASE naming ph-ghost", status, err)
		}
		if len(store) != 0 {
			t.Error("a refused write must store nothing")
		}
	})

	// seed checks one in with pl-1 in Phase I only and eq-1 in Phase II and III.
	seed := func(t *testing.T) (*Service, *recorder, map[string]*Participant, string) {
		repo, store := assetRepo()
		svc := NewService(repo)
		rec := &recorder{}
		svc.SetAudit(rec)
		resp, status, err := create(svc, &dto.CreateParticipantRequest{
			PlatformIDs: []string{"pl-1"}, EquipmentIDs: []string{"eq-1"},
			AssetPhases: map[string][]string{"pl-1": {p1}, "eq-1": {p2, p3}},
		})
		if status != http.StatusCreated || err != nil {
			t.Fatalf("seed: status = %d, err = %v", status, err)
		}
		return svc, rec, store, resp.Participant.ID
	}

	t.Run("no map leaves the stored rows alone, and an unchanged save writes nothing", func(t *testing.T) {
		svc, rec, store, pid := seed(t)
		events := len(rec.events)
		resp, status, err := patch(svc, pid, &dto.UpdateParticipantByIDRequest{PlatformIDs: []string{"pl-1"}, EquipmentIDs: []string{"eq-1"}})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if !slices.Equal(store[pid].AssetPhases["pl-1"], []string{p1}) || !slices.Equal(resp.Participant.AssetPhases["eq-1"], []string{p2, p3}) {
			t.Errorf("stored = %v; the rows must stand", store[pid].AssetPhases)
		}
		if len(rec.events) != events {
			t.Error("a save that changes nothing must record nothing")
		}
	})

	t.Run("a newly added asset with no map goes in every phase, and a removed one loses its rows", func(t *testing.T) {
		svc, rec, store, pid := seed(t)
		resp, status, err := patch(svc, pid, &dto.UpdateParticipantByIDRequest{
			PlatformIDs: []string{"pl-1"}, TransportIDs: []string{"tr-1"}, // eq-1 removed, tr-1 added
		})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		got := store[pid].AssetPhases
		if !slices.Equal(got["tr-1"], allPhases) {
			t.Errorf("tr-1 = %v; a new asset starts in every phase", got["tr-1"])
		}
		if _, ok := got["eq-1"]; ok {
			t.Errorf("eq-1 still has rows %v after it left the lists", got["eq-1"])
		}
		if !slices.Equal(got["pl-1"], []string{p1}) {
			t.Errorf("pl-1 = %v; an asset that stayed keeps its phases", got["pl-1"])
		}
		if _, ok := resp.Participant.AssetPhases["eq-1"]; ok {
			t.Error("the response still lists eq-1")
		}
		last := rec.events[len(rec.events)-1]
		if _, ok := last.Changes["asset_phases"]; !ok {
			t.Errorf("audit changes = %v; want asset_phases recorded", last.Changes)
		}
	})

	t.Run("a map-only change is a change, recorded by phase name", func(t *testing.T) {
		svc, rec, store, pid := seed(t)
		_, status, err := patch(svc, pid, &dto.UpdateParticipantByIDRequest{
			PlatformIDs: []string{"pl-1"}, EquipmentIDs: []string{"eq-1"},
			AssetPhases: map[string][]string{"pl-1": {p1, p2}, "eq-1": {}},
		})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if !slices.Equal(store[pid].AssetPhases["pl-1"], []string{p1, p2}) || len(store[pid].AssetPhases["eq-1"]) != 0 {
			t.Errorf("stored = %v", store[pid].AssetPhases)
		}
		last := rec.events[len(rec.events)-1]
		if len(last.Changes) != 1 {
			t.Fatalf("changes = %v; want only asset_phases", last.Changes)
		}
		change, _ := last.Changes["asset_phases"].(map[string]any)
		if change["old"] != "eq-1: Phase II, Phase III; pl-1: Phase I" || change["new"] != "eq-1: none; pl-1: Phase I, Phase II" {
			t.Errorf("audit change = %v; want names, naming only what moved", change)
		}
	})

	t.Run("a sent map naming an asset that just left the lists is refused", func(t *testing.T) {
		svc, _, _, pid := seed(t)
		_, status, err := patch(svc, pid, &dto.UpdateParticipantByIDRequest{
			PlatformIDs: []string{"pl-1"}, AssetPhases: map[string][]string{"eq-1": {p1}},
		})
		if status != http.StatusBadRequest || err == nil || !strings.Contains(err.Error(), "eq-1") {
			t.Errorf("status = %d, err = %v; want 400 naming eq-1", status, err)
		}
	})

	t.Run("the stale lock still refuses", func(t *testing.T) {
		svc, _, store, pid := seed(t)
		_, status, err := patch(svc, pid, &dto.UpdateParticipantByIDRequest{
			PlatformIDs: []string{"pl-1"}, EquipmentIDs: []string{"eq-1"},
			AssetPhases:       map[string][]string{"pl-1": {p2}},
			ExpectedUpdatedAt: "2001-01-01T00:00:00Z",
		})
		if status != http.StatusConflict || !errors.Is(err, ErrParticipantStale) {
			t.Errorf("status = %d, err = %v; want 409 PARTICIPANT_STALE", status, err)
		}
		if !slices.Equal(store[pid].AssetPhases["pl-1"], []string{p1}) {
			t.Error("a stale write must not touch the rows")
		}
	})

	t.Run("the keyed PUT takes the map too", func(t *testing.T) {
		repo, store := assetRepo()
		participants := map[string]*Participant{}
		repo.FindParticipantFunc = func(_ context.Context, _, key string) (*Participant, error) {
			if p, ok := participants[key]; ok {
				cp := *p
				return &cp, nil
			}
			return nil, ErrParticipantNotFound
		}
		repo.CreateParticipantFunc = func(_ context.Context, p *Participant) error {
			p.ID = "part-k"
			cp := *p
			participants[p.OrganizationKey] = &cp
			store[p.ID] = &cp
			return nil
		}
		repo.UpdateParticipantFunc = func(_ context.Context, p *Participant) error {
			cp := *p
			participants[p.OrganizationKey] = &cp
			return nil
		}
		svc := NewService(repo)
		svc.SetOrganizationLookup(orgsOf("green"))
		save := func(req *dto.SaveParticipantRequest) (int, error) {
			req.OperationID, req.OrganizationKey = "op-1", "green"
			return svc.SaveParticipant(ctx, req, &dto.SaveParticipantResponse{})
		}

		if status, err := save(&dto.SaveParticipantRequest{PlatformIDs: []string{"pl-1"}}); status != http.StatusCreated || err != nil {
			t.Fatalf("first save: %d, %v", status, err)
		}
		if !slices.Equal(participants["green"].AssetPhases["pl-1"], allPhases) {
			t.Errorf("pl-1 = %v; a first save with no map is every phase", participants["green"].AssetPhases["pl-1"])
		}
		if status, err := save(&dto.SaveParticipantRequest{PlatformIDs: []string{"pl-1"}, AssetPhases: map[string][]string{"pl-1": {p2}}}); status != http.StatusOK || err != nil {
			t.Fatalf("map save: %d, %v", status, err)
		}
		if !slices.Equal(participants["green"].AssetPhases["pl-1"], []string{p2}) {
			t.Errorf("pl-1 = %v; want [Phase II]", participants["green"].AssetPhases["pl-1"])
		}
		status, err := save(&dto.SaveParticipantRequest{PlatformIDs: []string{"pl-1"}, AssetPhases: map[string][]string{"nope": {p1}}})
		if status != http.StatusBadRequest || err == nil {
			t.Errorf("status = %d, err = %v; want 400 for an asset it does not bring", status, err)
		}
		status, err = save(&dto.SaveParticipantRequest{PlatformIDs: []string{"pl-1"}, AssetPhases: map[string][]string{"pl-1": {"ph-ghost"}}})
		if status != http.StatusBadRequest || err == nil {
			t.Errorf("status = %d, err = %v; want 400 for an unknown phase", status, err)
		}
		// Stale on the keyed route, with a map present.
		status, err = save(&dto.SaveParticipantRequest{PlatformIDs: []string{"pl-1"}, AssetPhases: map[string][]string{"pl-1": {p3}}, ExpectedUpdatedAt: "2001-01-01T00:00:00Z"})
		if status != http.StatusConflict || !errors.Is(err, ErrParticipantStale) {
			t.Errorf("status = %d, err = %v; want 409 stale", status, err)
		}
	})
}

func TestResolveAssetPhasesKeepsPhaseOrder(t *testing.T) {
	phases := phaseList("A", "B", "C")
	got := resolveAssetPhases([]string{"x"}, nil, nil, map[string][]string{"x": {"ph-c", "ph-a", "ph-c", "ph-gone"}}, phases)
	if !slices.Equal(got["x"], []string{"ph-a", "ph-c"}) {
		t.Errorf("x = %v; want [ph-a ph-c]: phase order, no repeats, unknown ids dropped", got["x"])
	}
}

func TestSameAssetPhasesTreatsNoRowsAndNoKeyAlike(t *testing.T) {
	if !sameAssetPhases(map[string][]string{"a": {}}, map[string][]string{}) {
		t.Error("an empty list and an absent key are the same in the table")
	}
	if sameAssetPhases(map[string][]string{"a": {"p"}}, map[string][]string{}) || sameAssetPhases(map[string][]string{}, map[string][]string{"a": {"p"}}) {
		t.Error("a row on one side only is a difference, in either direction")
	}
	if sameAssetPhases(map[string][]string{"a": {"p"}}, map[string][]string{"a": {"q"}}) {
		t.Error("different phases are a difference")
	}
}

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
)

type savedPlan struct {
	phaseID string
	plan    PhasePlan
	by      string
	calls   int
}

// planRepo is an operation with three phases, two sites (ISB, MSS) and three
// participants whose ids sort a1 < b2 < c3. phase is what the first phase
// already holds; each call builds its own, because a save edits the phase.
func planRepo(stored PhasePlan) (*MockRepository, *savedPlan) {
	saved := &savedPlan{}
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, id string) (*Operation, error) {
			return &Operation{ID: id, Name: "Exercise One"}, nil
		},
		FindPhasesFunc: func(context.Context, string) ([]*Phase, error) {
			phases := phaseList("Phase I", "Phase II", "Phase III")
			phases[0].Plan.SupportedParticipantID = stored.SupportedParticipantID
			return phases, nil
		},
		FindPhasePlansFunc: func(context.Context, string) (map[string]PhasePlan, error) {
			return map[string]PhasePlan{"ph-phasei": {Placements: stored.Placements, Requirements: stored.Requirements}}, nil
		},
		FindSitesFunc: func(context.Context, string) ([]*Site, error) { return siteList("ISB", "MSS"), nil },
		FindParticipantsFunc: func(context.Context, string) ([]*Participant, error) {
			return []*Participant{
				{ID: "a1", OrganizationKey: "brown", Organization: OrgSummary{Name: "Task Force Brown", ShortLabel: "TF BROWN"}},
				{ID: "b2", OrganizationKey: "orange", Organization: OrgSummary{Name: "Task Force Orange"}},
				{ID: "c3", Organization: OrgSummary{Name: "Allied Partner", Adhoc: true}, AdhocName: "Allied Partner"},
			}, nil
		},
		ReplacePhasePlanFunc: func(_ context.Context, _, phaseID string, plan PhasePlan, by string, _ time.Time) error {
			saved.phaseID, saved.plan, saved.by = phaseID, plan, by
			saved.calls++
			return nil
		},
	}
	return repo, saved
}

func ptr(s string) *string { return &s }

func TestSavePhasePlan(t *testing.T) {
	save := func(repo *MockRepository, rec *recorder, phaseID string, in dto.SavePhasePlanRequest) (*dto.SavePhasePlanResponse, int, error) {
		svc := NewService(repo)
		svc.SetAudit(rec)
		in.OperationID, in.PhaseID, in.UpdatedBy = "op-1", phaseID, "mike"
		resp := &dto.SavePhasePlanResponse{}
		status, err := svc.SavePhasePlan(context.Background(), &in, resp)
		return resp, status, err
	}

	t.Run("stores the plan and answers with the phase", func(t *testing.T) {
		repo, saved := planRepo(PhasePlan{})
		rec := &recorder{}
		resp, status, err := save(repo, rec, "ph-phasei", dto.SavePhasePlanRequest{
			SupportedParticipantID: ptr(" a1 "),
			Placements:             map[string]string{"a1": "st-isb", "b2": "st-mss"},
			Requirements:           []dto.RequirementInput{{A: "a1", B: "b2"}},
		})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if saved.calls != 1 || saved.phaseID != "ph-phasei" || saved.by != "mike" ||
			saved.plan.SupportedParticipantID != "a1" || len(saved.plan.Placements) != 2 || len(saved.plan.Requirements) != 1 {
			t.Errorf("saved = %+v", saved)
		}
		if saved.plan.Requirements[0].ID == "" {
			t.Error("a new requirement needs a generated id")
		}
		if resp.ID != "ph-phasei" || resp.Name != "Phase I" || resp.SupportedParticipantID == nil || *resp.SupportedParticipantID != "a1" ||
			resp.Placements["b2"] != "st-mss" || len(resp.Requirements) != 1 || resp.Requirements[0].A != "a1" || resp.Requirements[0].B != "b2" {
			t.Errorf("response = %+v; want the phase as GET returns it", resp)
		}
		if len(rec.events) != 1 || rec.events[0].ResourceType != "operation" || rec.events[0].Action != "update" || rec.events[0].ResourceName != "Exercise One" {
			t.Fatalf("audit = %+v", rec.events)
		}
		change, _ := rec.events[0].Changes["phase_plan"].(map[string]any)
		if change["old"] != "Phase I: supports none; placed none; requirements none" {
			t.Errorf("old = %q", change["old"])
		}
		want := "Phase I: supports TF BROWN; placed TF BROWN at ISB, Task Force Orange at MSS; requirements TF BROWN - Task Force Orange"
		if change["new"] != want {
			t.Errorf("new = %q;\nwant %q (names, not ids)", change["new"], want)
		}
	})

	t.Run("pairs are ordered, deduplicated and sorted", func(t *testing.T) {
		repo, saved := planRepo(PhasePlan{})
		_, status, err := save(repo, &recorder{}, "ph-phasei", dto.SavePhasePlanRequest{
			Requirements: []dto.RequirementInput{{A: "c3", B: "a1"}, {A: "b2", B: "a1"}, {A: "a1", B: "c3"}, {A: "a1", B: "b2"}},
		})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		var got [][2]string
		for _, rq := range saved.plan.Requirements {
			got = append(got, [2]string{rq.A, rq.B})
		}
		if !slices.Equal(got, [][2]string{{"a1", "b2"}, {"a1", "c3"}}) {
			t.Errorf("pairs = %v; want a < b, repeats collapsed, sorted", got)
		}
	})

	t.Run("a pair already stored keeps its id", func(t *testing.T) {
		repo, saved := planRepo(PhasePlan{Requirements: []Requirement{{ID: "rq-keep", A: "a1", B: "b2"}}})
		_, status, err := save(repo, &recorder{}, "ph-phasei", dto.SavePhasePlanRequest{
			Requirements: []dto.RequirementInput{{A: "b2", B: "a1"}, {A: "a1", B: "c3"}},
		})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if saved.plan.Requirements[0].ID != "rq-keep" || saved.plan.Requirements[1].ID == "rq-keep" || saved.plan.Requirements[1].ID == "" {
			t.Errorf("requirements = %+v; the old pair keeps rq-keep, the new one gets its own", saved.plan.Requirements)
		}
	})

	t.Run("placements are replaced, not merged", func(t *testing.T) {
		repo, saved := planRepo(PhasePlan{Placements: map[string]string{"a1": "st-isb", "b2": "st-isb"}})
		_, status, err := save(repo, &recorder{}, "ph-phasei", dto.SavePhasePlanRequest{
			Placements: map[string]string{"b2": "st-mss"},
		})
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if len(saved.plan.Placements) != 1 || saved.plan.Placements["b2"] != "st-mss" {
			t.Errorf("placements = %v; want only b2 at MSS, a1 unplaced", saved.plan.Placements)
		}
	})

	t.Run("supported may be null or blank to clear it", func(t *testing.T) {
		for name, supported := range map[string]*string{"null": nil, "blank": ptr("  ")} {
			t.Run(name, func(t *testing.T) {
				repo, saved := planRepo(PhasePlan{SupportedParticipantID: "a1"})
				resp, status, err := save(repo, &recorder{}, "ph-phasei", dto.SavePhasePlanRequest{SupportedParticipantID: supported})
				if status != http.StatusOK || err != nil || saved.calls != 1 || saved.plan.SupportedParticipantID != "" {
					t.Fatalf("status = %d, err = %v, saved = %+v", status, err, saved)
				}
				if resp.SupportedParticipantID != nil {
					t.Errorf("supported = %v; want null", *resp.SupportedParticipantID)
				}
			})
		}
	})

	t.Run("an unchanged plan writes nothing and records nothing", func(t *testing.T) {
		stored := PhasePlan{
			SupportedParticipantID: "a1",
			Placements:             map[string]string{"a1": "st-isb"},
			Requirements:           []Requirement{{ID: "rq-1", A: "a1", B: "b2"}},
		}
		repo, saved := planRepo(stored)
		rec := &recorder{}
		resp, status, err := save(repo, rec, "ph-phasei", dto.SavePhasePlanRequest{
			SupportedParticipantID: ptr("a1"),
			Placements:             map[string]string{"a1": "st-isb"},
			Requirements:           []dto.RequirementInput{{A: "b2", B: "a1"}},
		})
		if status != http.StatusOK || err != nil || saved.calls != 0 || len(rec.events) != 0 {
			t.Errorf("status = %d, err = %v, writes = %d, events = %d; want a 200 and nothing else", status, err, saved.calls, len(rec.events))
		}
		if resp.Requirements[0].ID != "rq-1" || resp.Placements["a1"] != "st-isb" {
			t.Errorf("response = %+v; want the stored plan", resp)
		}
	})

	t.Run("an empty plan over an empty phase writes nothing", func(t *testing.T) {
		repo, saved := planRepo(PhasePlan{})
		_, status, err := save(repo, &recorder{}, "ph-phasei", dto.SavePhasePlanRequest{})
		if status != http.StatusOK || err != nil || saved.calls != 0 {
			t.Errorf("status = %d, err = %v, writes = %d", status, err, saved.calls)
		}
	})

	t.Run("refusals", func(t *testing.T) {
		tests := []struct {
			name       string
			phaseID    string
			in         dto.SavePhasePlanRequest
			wantErr    string
			wantStatus int
		}{
			{"a pair of one participant", "ph-phasei", dto.SavePhasePlanRequest{Requirements: []dto.RequirementInput{{A: "a1", B: "a1"}}}, "OPERATION_REQUIREMENT_SELF", http.StatusBadRequest},
			{"a pair of one participant after trimming", "ph-phasei", dto.SavePhasePlanRequest{Requirements: []dto.RequirementInput{{A: "a1", B: " a1 "}}}, "OPERATION_REQUIREMENT_SELF", http.StatusBadRequest},
			{"a pair with an unknown participant", "ph-phasei", dto.SavePhasePlanRequest{Requirements: []dto.RequirementInput{{A: "a1", B: "ghost"}}}, "PARTICIPANT_NOT_FOUND", http.StatusNotFound},
			{"an unknown participant placed", "ph-phasei", dto.SavePhasePlanRequest{Placements: map[string]string{"ghost": "st-isb"}}, "PARTICIPANT_NOT_FOUND", http.StatusNotFound},
			{"an unknown site", "ph-phasei", dto.SavePhasePlanRequest{Placements: map[string]string{"a1": "st-ghost"}}, "OPERATION_UNKNOWN_SITE", http.StatusBadRequest},
			{"a blank site", "ph-phasei", dto.SavePhasePlanRequest{Placements: map[string]string{"a1": ""}}, "OPERATION_UNKNOWN_SITE", http.StatusBadRequest},
			{"an unknown phase", "ph-ghost", dto.SavePhasePlanRequest{}, "OPERATION_UNKNOWN_PHASE", http.StatusBadRequest},
			{"an unknown supported participant", "ph-phasei", dto.SavePhasePlanRequest{SupportedParticipantID: ptr("ghost")}, "PARTICIPANT_NOT_FOUND", http.StatusNotFound},
		}
		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				repo, saved := planRepo(PhasePlan{})
				rec := &recorder{}
				_, status, err := save(repo, rec, tt.phaseID, tt.in)
				var coded *Error
				if !errors.As(err, &coded) || coded.Code != tt.wantErr || status != tt.wantStatus {
					t.Errorf("status = %d, err = %v; want %d %s", status, err, tt.wantStatus, tt.wantErr)
				}
				if saved.calls != 0 || len(rec.events) != 0 {
					t.Error("a refused save must write and record nothing")
				}
			})
		}
	})

	t.Run("an unknown site names the id", func(t *testing.T) {
		repo, _ := planRepo(PhasePlan{})
		_, _, err := save(repo, &recorder{}, "ph-phasei", dto.SavePhasePlanRequest{Placements: map[string]string{"a1": "st-ghost"}})
		if err == nil || !strings.Contains(err.Error(), "st-ghost") {
			t.Errorf("err = %v; want it to name st-ghost", err)
		}
	})

	t.Run("unknown operation", func(t *testing.T) {
		repo, _ := planRepo(PhasePlan{})
		repo.FindByIDFunc = func(context.Context, string) (*Operation, error) { return nil, ErrOperationNotFound }
		_, status, err := save(repo, &recorder{}, "ph-phasei", dto.SavePhasePlanRequest{})
		if status != http.StatusNotFound || !errors.Is(err, ErrOperationNotFound) {
			t.Errorf("status = %d, err = %v; want 404 OPERATION_NOT_FOUND", status, err)
		}
	})

	t.Run("a repository failure is internal", func(t *testing.T) {
		repo, _ := planRepo(PhasePlan{})
		repo.ReplacePhasePlanFunc = func(context.Context, string, string, PhasePlan, string, time.Time) error { return errors.New("boom") }
		_, status, err := save(repo, &recorder{}, "ph-phasei", dto.SavePhasePlanRequest{SupportedParticipantID: ptr("a1")})
		if status != http.StatusInternalServerError || !errors.Is(err, ErrOperationInternalError) {
			t.Errorf("status = %d, err = %v; want 500", status, err)
		}
	})

	t.Run("a coded repository error keeps its code", func(t *testing.T) {
		repo, _ := planRepo(PhasePlan{})
		repo.ReplacePhasePlanFunc = func(context.Context, string, string, PhasePlan, string, time.Time) error {
			return ErrOperationUnknownSite(nil)
		}
		_, status, err := save(repo, &recorder{}, "ph-phasei", dto.SavePhasePlanRequest{SupportedParticipantID: ptr("a1")})
		if status != http.StatusBadRequest || err == nil {
			t.Errorf("status = %d, err = %v; want 400", status, err)
		}
	})
}

// A plan row cannot outlive its participant or site: the foreign keys cascade
// the placements and requirements and null the phase's supported participant,
// which a mock cannot show firing and which migration 052 declares. What the
// service owns is the other half: a stored plan that still names a participant
// the operation has since lost is replaced wholesale by the next write, never
// merged into it.
func TestNextWriteReplacesAStalePlan(t *testing.T) {
	repo, saved := planRepo(PhasePlan{
		Placements:   map[string]string{"gone": "st-isb"},
		Requirements: []Requirement{{ID: "rq-old", A: "a1", B: "gone"}},
	})
	status, err := NewService(repo).SavePhasePlan(context.Background(), &dto.SavePhasePlanRequest{
		OperationID: "op-1", PhaseID: "ph-phasei", Placements: map[string]string{"a1": "st-isb"},
	}, &dto.SavePhasePlanResponse{})
	if status != http.StatusOK || err != nil {
		t.Fatalf("status = %d, err = %v", status, err)
	}
	if saved.calls != 1 || len(saved.plan.Requirements) != 0 || saved.plan.Placements["gone"] != "" || saved.plan.Placements["a1"] != "st-isb" {
		t.Errorf("saved = %+v; want the stale rows gone", saved)
	}
}

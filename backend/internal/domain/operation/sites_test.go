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

func TestSiteAndPlanErrorsAreCoded(t *testing.T) {
	tests := []struct {
		err        *Error
		wantCode   string
		wantStatus int
	}{
		{ErrOperationSiteNameInvalid, "OPERATION_SITE_NAME_INVALID", http.StatusBadRequest},
		{ErrOperationSiteNameExists, "OPERATION_SITE_NAME_EXISTS", http.StatusConflict},
		{ErrOperationUnknownSite([]string{"ghost"}), "OPERATION_UNKNOWN_SITE", http.StatusBadRequest},
		{ErrOperationRequirementSelf, "OPERATION_REQUIREMENT_SELF", http.StatusBadRequest},
		{ErrRFINotFound, "RFI_NOT_FOUND", http.StatusNotFound},
		{ErrRFIQuestionInvalid, "RFI_QUESTION_INVALID", http.StatusBadRequest},
		{ErrRFICommentInvalid, "RFI_COMMENT_INVALID", http.StatusBadRequest},
		{ErrRFIResolved, "RFI_RESOLVED", http.StatusConflict},
		{ErrRFINotPoster, "RFI_NOT_POSTER", http.StatusForbidden},
	}
	for _, tt := range tests {
		var coded response.CodedError = tt.err
		if coded.GetCode() != tt.wantCode || coded.GetStatus() != tt.wantStatus || coded.Error() == "" {
			t.Errorf("%s = %q / %d / %q; want %d", tt.wantCode, coded.GetCode(), coded.GetStatus(), coded.Error(), tt.wantStatus)
		}
	}
	if !strings.Contains(ErrOperationUnknownSite([]string{"s1", "s2"}).Message, "s1, s2") {
		t.Error("the unknown-site message must name the offending ids")
	}
}

func siteList(names ...string) []*Site {
	out := make([]*Site, len(names))
	for i, n := range names {
		out[i] = &Site{ID: "st-" + strings.ToLower(n), OperationID: "op-1", Position: i, Name: n}
	}
	return out
}

func siteIDs(sites []*Site) []string {
	out := make([]string, len(sites))
	for i, s := range sites {
		out[i] = s.ID
	}
	return out
}

func siteInputs(spec ...string) []dto.SiteInput {
	// "id:name", or just "name" for a new site
	out := make([]dto.SiteInput, len(spec))
	for i, s := range spec {
		if id, name, ok := strings.Cut(s, ":"); ok {
			out[i] = dto.SiteInput{ID: id, Name: name}
		} else {
			out[i] = dto.SiteInput{Name: s}
		}
	}
	return out
}

type savedSites struct {
	sites []*Site
	by    string
	calls int
}

func siteRepoFor(existing []*Site) (*MockRepository, *savedSites) {
	saved := &savedSites{}
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, id string) (*Operation, error) {
			return &Operation{ID: id, Name: "Exercise One"}, nil
		},
		FindSitesFunc: func(context.Context, string) ([]*Site, error) { return existing, nil },
		ReplaceSitesFunc: func(_ context.Context, _ string, sites []*Site, by string, _ time.Time) error {
			saved.sites, saved.by = sites, by
			saved.calls++
			return nil
		},
	}
	return repo, saved
}

func TestSaveSites(t *testing.T) {
	existing := siteList("ISB", "MSS", "HLZ")
	save := func(repo *MockRepository, rec *recorder, in ...dto.SiteInput) (*dto.SaveSitesResponse, int, error) {
		svc := NewService(repo)
		svc.SetAudit(rec)
		resp := &dto.SaveSitesResponse{}
		status, err := svc.SaveSites(context.Background(), &dto.SaveSitesRequest{OperationID: "op-1", Sites: in, UpdatedBy: "mike"}, resp)
		return resp, status, err
	}

	t.Run("keeps and renames in place", func(t *testing.T) {
		repo, saved := siteRepoFor(existing)
		resp, status, err := save(repo, &recorder{}, siteInputs("st-isb: Intermediate Base ", "st-mss:MSS", "st-hlz:HLZ")...)
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if saved.calls != 1 || saved.sites[0].Name != "Intermediate Base" || saved.sites[0].ID != "st-isb" || saved.by != "mike" {
			t.Errorf("saved %+v by %q; want ISB kept under its id and renamed, name trimmed", saved.sites[0], saved.by)
		}
		if len(resp.Sites) != 3 || resp.Sites[0].Name != "Intermediate Base" || resp.Sites[0].OperationID != "op-1" {
			t.Errorf("response = %+v", resp.Sites)
		}
	})

	t.Run("reorders by array index", func(t *testing.T) {
		repo, saved := siteRepoFor(existing)
		resp, status, err := save(repo, &recorder{}, siteInputs("st-hlz:HLZ", "st-isb:ISB", "st-mss:MSS")...)
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if !slices.Equal(siteIDs(saved.sites), []string{"st-hlz", "st-isb", "st-mss"}) {
			t.Errorf("order = %v", siteIDs(saved.sites))
		}
		for i, st := range resp.Sites {
			if st.Position != i {
				t.Errorf("site %d = %+v; want position = index", i, st)
			}
		}
	})

	t.Run("swapping two names is one request", func(t *testing.T) {
		repo, saved := siteRepoFor(existing)
		_, status, err := save(repo, &recorder{}, siteInputs("st-isb:MSS", "st-mss:ISB", "st-hlz:HLZ")...)
		if status != http.StatusOK || err != nil || saved.calls != 1 {
			t.Errorf("status = %d, err = %v, writes = %d; want a 200 and one write", status, err, saved.calls)
		}
	})

	t.Run("inserts a new site under a generated id", func(t *testing.T) {
		repo, saved := siteRepoFor(existing)
		resp, status, err := save(repo, &recorder{}, siteInputs("st-isb:ISB", "The X", "st-mss:MSS", "st-hlz:HLZ")...)
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		id := resp.Sites[1].ID
		if id == "" || strings.HasPrefix(id, "st-") || saved.sites[1].ID != id || resp.Sites[1].Name != "The X" {
			t.Errorf("new site = %+v; want a generated id and the name", resp.Sites[1])
		}
	})

	t.Run("a site left out is deleted and audited", func(t *testing.T) {
		repo, saved := siteRepoFor(existing)
		rec := &recorder{}
		resp, status, err := save(repo, rec, siteInputs("st-isb:ISB", "st-hlz:HLZ")...)
		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if !slices.Equal(siteIDs(saved.sites), []string{"st-isb", "st-hlz"}) || len(resp.Sites) != 2 {
			t.Errorf("saved = %v; the repository is handed only the survivors", siteIDs(saved.sites))
		}
		if len(rec.events) != 1 || rec.events[0].ResourceType != "operation" || rec.events[0].Action != "update" {
			t.Fatalf("audit = %+v", rec.events)
		}
		change, _ := rec.events[0].Changes["sites"].(map[string]any)
		if change["old"] != "ISB, MSS, HLZ" || change["new"] != "ISB, HLZ" {
			t.Errorf("audit change = %v; want the name lists before and after", change)
		}
	})

	t.Run("zero sites is allowed and clears the list", func(t *testing.T) {
		repo, saved := siteRepoFor(existing)
		resp, status, err := save(repo, &recorder{})
		if status != http.StatusOK || err != nil || saved.calls != 1 || len(saved.sites) != 0 {
			t.Fatalf("status = %d, err = %v, writes = %d", status, err, saved.calls)
		}
		if resp.Sites == nil || len(resp.Sites) != 0 {
			t.Errorf("sites = %v; want [] not null", resp.Sites)
		}
	})

	t.Run("an unchanged list writes nothing and records nothing", func(t *testing.T) {
		repo, saved := siteRepoFor(existing)
		rec := &recorder{}
		resp, status, err := save(repo, rec, siteInputs("st-isb:ISB", "st-mss:MSS", "st-hlz:HLZ")...)
		if status != http.StatusOK || err != nil || saved.calls != 0 || len(resp.Sites) != 3 || len(rec.events) != 0 {
			t.Errorf("status = %d, err = %v, writes = %d, events = %d; want a 200 and nothing else", status, err, saved.calls, len(rec.events))
		}
	})

	t.Run("an empty list over no sites writes nothing", func(t *testing.T) {
		repo, saved := siteRepoFor(nil)
		_, status, err := save(repo, &recorder{})
		if status != http.StatusOK || err != nil || saved.calls != 0 {
			t.Errorf("status = %d, err = %v, writes = %d", status, err, saved.calls)
		}
	})

	t.Run("refusals", func(t *testing.T) {
		tests := []struct {
			name       string
			in         []dto.SiteInput
			wantErr    string
			wantStatus int
		}{
			{"blank name", siteInputs("st-isb:   "), "OPERATION_SITE_NAME_INVALID", http.StatusBadRequest},
			{"name over 60", siteInputs(strings.Repeat("x", 61)), "OPERATION_SITE_NAME_INVALID", http.StatusBadRequest},
			{"duplicate names, case-insensitive", siteInputs("st-isb:Alpha", "alpha "), "OPERATION_SITE_NAME_EXISTS", http.StatusConflict},
			{"unknown id", siteInputs("st-isb:ISB", "st-ghost:Ghost"), "OPERATION_UNKNOWN_SITE", http.StatusBadRequest},
			{"the same id twice", siteInputs("st-isb:A", "st-isb:B"), "OPERATION_UNKNOWN_SITE", http.StatusBadRequest},
		}
		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				repo, saved := siteRepoFor(existing)
				rec := &recorder{}
				_, status, err := save(repo, rec, tt.in...)
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

	t.Run("a site id from another operation is unknown", func(t *testing.T) {
		repo, _ := siteRepoFor(existing)
		_, status, err := save(repo, &recorder{}, siteInputs("st-of-another-op:ISB")...)
		if status != http.StatusBadRequest || err == nil || !strings.Contains(err.Error(), "st-of-another-op") {
			t.Errorf("status = %d, err = %v; want 400 naming the id", status, err)
		}
	})

	t.Run("unknown operation", func(t *testing.T) {
		repo, _ := siteRepoFor(existing)
		repo.FindByIDFunc = func(context.Context, string) (*Operation, error) { return nil, ErrOperationNotFound }
		_, status, err := save(repo, &recorder{}, siteInputs("ISB")...)
		if status != http.StatusNotFound || !errors.Is(err, ErrOperationNotFound) {
			t.Errorf("status = %d, err = %v; want 404 OPERATION_NOT_FOUND", status, err)
		}
	})

	t.Run("a repository failure is internal", func(t *testing.T) {
		repo, _ := siteRepoFor(existing)
		repo.ReplaceSitesFunc = func(context.Context, string, []*Site, string, time.Time) error { return errors.New("boom") }
		_, status, err := save(repo, &recorder{}, siteInputs("ISB")...)
		if status != http.StatusInternalServerError || !errors.Is(err, ErrOperationInternalError) {
			t.Errorf("status = %d, err = %v; want 500", status, err)
		}
	})

	t.Run("a repository name collision keeps its code", func(t *testing.T) {
		repo, _ := siteRepoFor(existing)
		repo.ReplaceSitesFunc = func(context.Context, string, []*Site, string, time.Time) error { return ErrOperationSiteNameExists }
		_, status, err := save(repo, &recorder{}, siteInputs("ISB")...)
		if status != http.StatusConflict || !errors.Is(err, ErrOperationSiteNameExists) {
			t.Errorf("status = %d, err = %v; want 409", status, err)
		}
	})
}

func TestGetOperationCarriesSitesAndPhasePlans(t *testing.T) {
	phases := phaseList("Phase I", "Phase II")
	phases[0].Plan.SupportedParticipantID = "p-1"
	repo := &MockRepository{
		FindByIDFunc:   func(_ context.Context, id string) (*Operation, error) { return &Operation{ID: id, Name: "Ex"}, nil },
		FindPhasesFunc: func(context.Context, string) ([]*Phase, error) { return phases, nil },
		FindSitesFunc:  func(context.Context, string) ([]*Site, error) { return siteList("ISB"), nil },
		FindPhasePlansFunc: func(context.Context, string) (map[string]PhasePlan, error) {
			return map[string]PhasePlan{"ph-phasei": {
				Placements:   map[string]string{"p-1": "st-isb"},
				Requirements: []Requirement{{ID: "rq-1", A: "p-1", B: "p-2"}},
			}}, nil
		},
	}
	resp := &dto.GetOperationResponse{}
	if _, err := NewService(repo).GetOperation(context.Background(), &dto.GetOperationRequest{ID: "op-1"}, resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Sites) != 1 || resp.Sites[0].Name != "ISB" || resp.Sites[0].Position != 0 {
		t.Errorf("sites = %+v", resp.Sites)
	}
	one, two := resp.Phases[0], resp.Phases[1]
	if one.SupportedParticipantID == nil || *one.SupportedParticipantID != "p-1" ||
		one.Placements["p-1"] != "st-isb" || len(one.Requirements) != 1 || one.Requirements[0].A != "p-1" || one.Requirements[0].ID != "rq-1" {
		t.Errorf("phase one = %+v; want its plan", one)
	}
	if two.SupportedParticipantID != nil || two.Placements == nil || len(two.Placements) != 0 || two.Requirements == nil || len(two.Requirements) != 0 {
		t.Errorf("phase two = %+v; want null supported and empty, non-null placements and requirements", two)
	}

	empty := &MockRepository{FindByIDFunc: repo.FindByIDFunc}
	resp = &dto.GetOperationResponse{}
	if _, err := NewService(empty).GetOperation(context.Background(), &dto.GetOperationRequest{ID: "op-1"}, resp); err != nil {
		t.Fatal(err)
	}
	if resp.Sites == nil || len(resp.Sites) != 0 {
		t.Error("sites must be [] not null")
	}
}

func TestGetOperationLoadsPlansOnceNotPerPhase(t *testing.T) {
	calls := 0
	repo := &MockRepository{
		FindByIDFunc:   func(_ context.Context, id string) (*Operation, error) { return &Operation{ID: id}, nil },
		FindPhasesFunc: func(context.Context, string) ([]*Phase, error) { return phaseList("A", "B", "C", "D", "E"), nil },
		FindPhasePlansFunc: func(context.Context, string) (map[string]PhasePlan, error) {
			calls++
			return nil, nil
		},
	}
	if _, err := NewService(repo).GetOperation(context.Background(), &dto.GetOperationRequest{ID: "op-1"}, &dto.GetOperationResponse{}); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Errorf("plans were loaded %d times for 5 phases; want one batched read", calls)
	}
}

func TestSavePhasesKeepsEachPlanOnTheResponse(t *testing.T) {
	existing := phaseList("Phase I", "Phase II")
	existing[0].Plan.SupportedParticipantID = "p-1"
	repo, _ := phaseRepoFor(existing, nil)
	repo.FindPhasePlansFunc = func(context.Context, string) (map[string]PhasePlan, error) {
		return map[string]PhasePlan{"ph-phasei": {Placements: map[string]string{"p-1": "st-isb"}}}, nil
	}
	resp := &dto.SavePhasesResponse{}
	_, err := NewService(repo).SavePhases(context.Background(), &dto.SavePhasesRequest{
		OperationID: "op-1", Phases: inputs("ph-phaseii:Phase II", "ph-phasei:Renamed", "Surge"),
	}, resp)
	if err != nil {
		t.Fatal(err)
	}
	renamed, surge := resp.Phases[1], resp.Phases[2]
	if renamed.SupportedParticipantID == nil || *renamed.SupportedParticipantID != "p-1" || renamed.Placements["p-1"] != "st-isb" {
		t.Errorf("renamed phase = %+v; the replace does not touch its plan, so the response must show it", renamed)
	}
	if surge.SupportedParticipantID != nil || len(surge.Placements) != 0 || surge.Requirements == nil {
		t.Errorf("new phase = %+v; want an empty plan", surge)
	}
}

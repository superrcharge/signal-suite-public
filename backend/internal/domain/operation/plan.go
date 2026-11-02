package operation

import (
	"context"
	"net/http"
	"slices"
	"sort"
	"strings"
	"time"

	"backend/internal/domain/operation/dto"
	"backend/internal/shared/contracts"

	"github.com/google/uuid"
)

// unitLabel is how the audit log names a participant: the short label when it
// has one, else the name, as the frontend's participantLabel does, falling back
// to the id for one that has since gone.
func unitLabel(byID map[string]*Participant, id string) string {
	p, ok := byID[id]
	if !ok {
		return id
	}
	for _, v := range []string{p.Organization.ShortLabel, p.Organization.Name, p.OrganizationKey, p.AdhocName} {
		if v != "" {
			return v
		}
	}
	return id
}

// normalisePlan checks a plan request against the operation's own participants
// and sites and returns the plan to store. Each requirement pair is ordered so
// A < B and repeated pairs collapse to one, a pair that was already stored
// keeps its id, and the rest get a new one. Everything a person could have
// mistyped is refused rather than dropped: an unknown participant, an unknown
// site, a pair of one participant.
func normalisePlan(req *dto.SavePhasePlanRequest, participants map[string]*Participant, sites []*Site, stored []Requirement) (PhasePlan, error) {
	hasSite := make(map[string]bool, len(sites))
	for _, st := range sites {
		hasSite[st.ID] = true
	}
	var plan PhasePlan

	if req.SupportedParticipantID != nil {
		id := strings.TrimSpace(*req.SupportedParticipantID)
		if id != "" {
			if participants[id] == nil {
				return PhasePlan{}, ErrParticipantNotFound
			}
			plan.SupportedParticipantID = id
		}
	}

	plan.Placements = make(map[string]string, len(req.Placements))
	keys := make([]string, 0, len(req.Placements))
	for p := range req.Placements {
		keys = append(keys, p)
	}
	sort.Strings(keys)
	var badSites []string
	for _, p := range keys {
		id := strings.TrimSpace(p)
		if participants[id] == nil {
			return PhasePlan{}, ErrParticipantNotFound
		}
		site := strings.TrimSpace(req.Placements[p])
		if !hasSite[site] {
			if !slices.Contains(badSites, site) {
				badSites = append(badSites, site)
			}
			continue
		}
		plan.Placements[id] = site
	}
	if len(badSites) > 0 {
		return PhasePlan{}, ErrOperationUnknownSite(badSites)
	}

	ids := make(map[[2]string]string, len(stored))
	for _, rq := range stored {
		ids[[2]string{rq.A, rq.B}] = rq.ID
	}
	seen := map[[2]string]bool{}
	for _, in := range req.Requirements {
		a, b := strings.TrimSpace(in.A), strings.TrimSpace(in.B)
		if a == b {
			return PhasePlan{}, ErrOperationRequirementSelf
		}
		if participants[a] == nil || participants[b] == nil {
			return PhasePlan{}, ErrParticipantNotFound
		}
		if a > b {
			a, b = b, a
		}
		pair := [2]string{a, b}
		if seen[pair] {
			continue
		}
		seen[pair] = true
		id := ids[pair]
		if id == "" {
			id = uuid.NewString()
		}
		plan.Requirements = append(plan.Requirements, Requirement{ID: id, A: a, B: b})
	}
	sort.Slice(plan.Requirements, func(i, j int) bool {
		x, y := plan.Requirements[i], plan.Requirements[j]
		if x.A != y.A {
			return x.A < y.A
		}
		return x.B < y.B
	})
	return plan, nil
}

// samePlan reports whether two plans say the same thing, ignoring requirement
// ids: the supported participant, the placements and the set of pairs.
func samePlan(a, b PhasePlan) bool {
	if a.SupportedParticipantID != b.SupportedParticipantID || len(a.Placements) != len(b.Placements) {
		return false
	}
	for p, site := range a.Placements {
		if b.Placements[p] != site {
			return false
		}
	}
	if len(a.Requirements) != len(b.Requirements) {
		return false
	}
	pairs := make(map[[2]string]bool, len(a.Requirements))
	for _, rq := range a.Requirements {
		pairs[[2]string{rq.A, rq.B}] = true
	}
	for _, rq := range b.Requirements {
		if !pairs[[2]string{rq.A, rq.B}] {
			return false
		}
	}
	return true
}

// planSummary renders a phase's plan for the audit log with names rather than
// ids, which mean nothing to a reader of it: the phase, who it supports, where
// each unit sits and which pairs must talk, each list sorted.
func planSummary(phase string, plan PhasePlan, participants map[string]*Participant, sites []*Site) string {
	siteName := make(map[string]string, len(sites))
	for _, st := range sites {
		siteName[st.ID] = st.Name
	}
	supported := "none"
	if plan.SupportedParticipantID != "" {
		supported = unitLabel(participants, plan.SupportedParticipantID)
	}
	placed := make([]string, 0, len(plan.Placements))
	for p, site := range plan.Placements {
		name := siteName[site]
		if name == "" {
			name = site
		}
		placed = append(placed, unitLabel(participants, p)+" at "+name)
	}
	sort.Strings(placed)
	pairs := make([]string, 0, len(plan.Requirements))
	for _, rq := range plan.Requirements {
		x, y := unitLabel(participants, rq.A), unitLabel(participants, rq.B)
		if x > y {
			x, y = y, x
		}
		pairs = append(pairs, x+" - "+y)
	}
	sort.Strings(pairs)
	list := func(v []string) string {
		if len(v) == 0 {
			return "none"
		}
		return strings.Join(v, ", ")
	}
	return phase + ": supports " + supported + "; placed " + list(placed) + "; requirements " + list(pairs)
}

// SavePhasePlan replaces one phase's plan: the participant it supports, where
// each unit sits and which pairs must talk. It answers with the phase as the
// operation read returns it. A plan that changes nothing writes nothing and
// records nothing.
func (s *Service) SavePhasePlan(ctx context.Context, req *dto.SavePhasePlanRequest, resp *dto.SavePhasePlanResponse) (int, error) {
	op, status, err := s.findOperation(ctx, req.OperationID)
	if err != nil {
		return status, err
	}

	phases, err := s.repo.FindPhases(ctx, req.OperationID)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	var phase *Phase
	for _, ph := range phases {
		if ph.ID == req.PhaseID {
			phase = ph
		}
	}
	if phase == nil {
		err := ErrOperationUnknownPhase([]string{req.PhaseID})
		return err.Status, err
	}
	if err := s.attachPlans(ctx, req.OperationID, []*Phase{phase}); err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}

	parts, err := s.repo.FindParticipants(ctx, req.OperationID)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	byID := make(map[string]*Participant, len(parts))
	for _, p := range parts {
		byID[p.ID] = p
	}
	sites, err := s.repo.FindSites(ctx, req.OperationID)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}

	plan, err := normalisePlan(req, byID, sites, phase.Plan.Requirements)
	if err != nil {
		return errStatus(err), err
	}

	if samePlan(phase.Plan, plan) {
		*resp = toPhaseResponse(phase)
		return http.StatusOK, nil
	}

	if err := s.repo.ReplacePhasePlan(ctx, req.OperationID, req.PhaseID, plan, req.UpdatedBy, time.Now().UTC()); err != nil {
		return writeErr(err)
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "operation",
		ResourceID:   op.ID,
		ResourceName: op.Name,
		Action:       "update",
		Changes: map[string]any{
			"phase_plan": map[string]any{
				"old": planSummary(phase.Name, phase.Plan, byID, sites),
				"new": planSummary(phase.Name, plan, byID, sites),
			},
		},
	})

	phase.Plan = plan
	*resp = toPhaseResponse(phase)
	return http.StatusOK, nil
}

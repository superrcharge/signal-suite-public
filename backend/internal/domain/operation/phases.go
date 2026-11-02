package operation

import (
	"context"
	"net/http"
	"slices"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"backend/internal/domain/operation/dto"
	"backend/internal/shared/contracts"

	"github.com/google/uuid"
)

func toPhaseResponse(ph *Phase) dto.PhaseResponse {
	resp := dto.PhaseResponse{
		ID: ph.ID, OperationID: ph.OperationID, Position: ph.Position, Name: ph.Name,
		Placements:   map[string]string{},
		Requirements: make([]dto.RequirementResponse, 0, len(ph.Plan.Requirements)),
	}
	if ph.Plan.SupportedParticipantID != "" {
		id := ph.Plan.SupportedParticipantID
		resp.SupportedParticipantID = &id
	}
	for p, site := range ph.Plan.Placements {
		resp.Placements[p] = site
	}
	for _, rq := range ph.Plan.Requirements {
		resp.Requirements = append(resp.Requirements, dto.RequirementResponse{ID: rq.ID, A: rq.A, B: rq.B})
	}
	return resp
}

func toPhaseResponses(phases []*Phase) []dto.PhaseResponse {
	out := make([]dto.PhaseResponse, 0, len(phases))
	for _, ph := range phases {
		out = append(out, toPhaseResponse(ph))
	}
	return out
}

// attachPlans fills each phase's placements and requirements, with the same two
// queries however many phases there are. The supported participant is already
// on the phase, read with the row.
func (s *Service) attachPlans(ctx context.Context, operationID string, phases []*Phase) error {
	plans, err := s.repo.FindPhasePlans(ctx, operationID)
	if err != nil {
		return err
	}
	for _, ph := range phases {
		plan := plans[ph.ID]
		ph.Plan.Placements = plan.Placements
		ph.Plan.Requirements = plan.Requirements
	}
	return nil
}

// participantAssets is every asset id a check-in brings, across the platform,
// equipment and transport lists, in that order and without repeats. These are
// the only ids a phase can hold; waveforms and services belong to the assets.
func participantAssets(platformIDs, equipmentIDs, transportIDs []string) []string {
	out := make([]string, 0, len(platformIDs)+len(equipmentIDs)+len(transportIDs))
	for _, list := range [][]string{platformIDs, equipmentIDs, transportIDs} {
		for _, id := range list {
			if !slices.Contains(out, id) {
				out = append(out, id)
			}
		}
	}
	return out
}

// assetPhaseRows flattens each participant's map into rows, in a fixed order:
// participants as given, assets sorted, phases as the map holds them.
func assetPhaseRows(parts []*Participant) []AssetPhaseRow {
	var rows []AssetPhaseRow
	for _, p := range parts {
		assets := make([]string, 0, len(p.AssetPhases))
		for a := range p.AssetPhases {
			assets = append(assets, a)
		}
		sort.Strings(assets)
		for _, a := range assets {
			for _, ph := range p.AssetPhases[a] {
				rows = append(rows, AssetPhaseRow{ParticipantID: p.ID, AssetID: a, PhaseID: ph})
			}
		}
	}
	return rows
}

// carryForwardAssetRows is the rule for what a new phase starts with: the
// asset rows of the phase immediately before it in the NEW order, so a phase
// added after Phase III begins as Phase III was and the planner only removes
// what leaves. A new phase at position 0 has nothing before it and copies
// nothing. Two new phases in a row chain: the second copies what the first
// copied, since it is the phase immediately before it.
//
// order is the whole new list with every id set, fresh names the ids that did
// not exist before, and rows are the operation's current asset rows. It
// returns only the rows to insert, one per copied row, for the fresh phases.
func carryForwardAssetRows(order []*Phase, fresh map[string]bool, rows []AssetPhaseRow) []AssetPhaseRow {
	type key struct{ participant, asset string }
	byPhase := map[string][]key{}
	for _, r := range rows {
		byPhase[r.PhaseID] = append(byPhase[r.PhaseID], key{r.ParticipantID, r.AssetID})
	}

	var out []AssetPhaseRow
	prev := ""
	for i, ph := range order {
		if fresh[ph.ID] && i > 0 {
			copied := byPhase[prev]
			byPhase[ph.ID] = copied
			for _, k := range copied {
				out = append(out, AssetPhaseRow{ParticipantID: k.participant, AssetID: k.asset, PhaseID: ph.ID})
			}
		}
		prev = ph.ID
	}
	return out
}

// normalisePhaseNames trims every name and checks the request as a whole:
// at least one phase, each name 1 to 60 characters, none repeated apart from
// case. 409 for the repeat, because the list conflicts with itself rather than
// being malformed.
func normalisePhaseNames(in []dto.PhaseInput) ([]string, error) {
	if len(in) == 0 {
		return nil, ErrOperationPhasesRequired
	}
	names := make([]string, len(in))
	seen := make(map[string]bool, len(in))
	for i, p := range in {
		n := strings.TrimSpace(p.Name)
		if n == "" || utf8.RuneCountInString(n) > MaxPhaseNameLength {
			return nil, ErrOperationPhaseNameInvalid
		}
		if seen[strings.ToLower(n)] {
			return nil, ErrOperationPhaseNameExists
		}
		seen[strings.ToLower(n)] = true
		names[i] = n
	}
	return names, nil
}

func phaseNameList(phases []*Phase) string {
	names := make([]string, len(phases))
	for i, ph := range phases {
		names[i] = ph.Name
	}
	return strings.Join(names, ", ")
}

// SavePhases replaces the operation's whole ordered phase list. An entry with
// an id keeps that phase (renamed, repositioned), one without is inserted, one
// the list leaves out is deleted along with its asset rows, and a new phase
// starts as the one before it was, see carryForwardAssetRows.
func (s *Service) SavePhases(ctx context.Context, req *dto.SavePhasesRequest, resp *dto.SavePhasesResponse) (int, error) {
	op, status, err := s.findOperation(ctx, req.OperationID)
	if err != nil {
		return status, err
	}
	names, err := normalisePhaseNames(req.Phases)
	if err != nil {
		return errStatus(err), err
	}

	existing, err := s.repo.FindPhases(ctx, req.OperationID)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	if err := s.attachPlans(ctx, req.OperationID, existing); err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	have := make(map[string]*Phase, len(existing))
	for _, ph := range existing {
		have[ph.ID] = ph
	}

	// An id that is not this operation's, or that appears twice, cannot be
	// placed: a repeat would be two phases claiming one row.
	var unknown []string
	order := make([]*Phase, len(req.Phases))
	fresh := map[string]bool{}
	used := map[string]bool{}
	for i, in := range req.Phases {
		id := strings.TrimSpace(in.ID)
		switch {
		case id == "":
			id = uuid.NewString()
			fresh[id] = true
		case have[id] == nil || used[id]:
			unknown = append(unknown, id)
		}
		used[id] = true
		order[i] = &Phase{ID: id, OperationID: req.OperationID, Position: i, Name: names[i]}
		// A kept phase keeps its plan, which the replace never touches, so the
		// response can show it.
		if kept := have[id]; kept != nil {
			order[i].Plan = kept.Plan
		}
	}
	if len(unknown) > 0 {
		err := ErrOperationUnknownPhase(unknown)
		return err.Status, err
	}

	if samePhases(existing, order) {
		resp.Phases = toPhaseResponses(existing)
		return http.StatusOK, nil
	}

	parts, err := s.repo.FindParticipants(ctx, req.OperationID)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	carried := carryForwardAssetRows(order, fresh, assetPhaseRows(parts))

	if err := s.repo.ReplacePhases(ctx, req.OperationID, order, carried, req.UpdatedBy, time.Now().UTC()); err != nil {
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
			"phases": map[string]any{"old": phaseNameList(existing), "new": phaseNameList(order)},
		},
	})

	resp.Phases = toPhaseResponses(order)
	return http.StatusOK, nil
}

// samePhases reports whether the request would change nothing: the same ids,
// in the same order, with the same names.
func samePhases(old, next []*Phase) bool {
	if len(old) != len(next) {
		return false
	}
	for i := range old {
		if old[i].ID != next[i].ID || old[i].Name != next[i].Name {
			return false
		}
	}
	return true
}

// phaseOrder maps a phase id to its index in the operation's order.
func phaseOrder(phases []*Phase) map[string]int {
	m := make(map[string]int, len(phases))
	for i, ph := range phases {
		m[ph.ID] = i
	}
	return m
}

// checkAssetPhases refuses a sent asset_phases map that names an asset the
// check-in does not bring, or a phase the operation does not have. Both
// messages carry the offending ids, sorted.
func checkAssetPhases(sent map[string][]string, assets []string, phases []*Phase) error {
	var badAssets []string
	for a := range sent {
		if !slices.Contains(assets, a) {
			badAssets = append(badAssets, a)
		}
	}
	if len(badAssets) > 0 {
		sort.Strings(badAssets)
		return ErrParticipantUnknownAsset(badAssets)
	}
	order := phaseOrder(phases)
	var badPhases []string
	for _, ids := range sent {
		for _, id := range ids {
			if _, ok := order[id]; !ok && !slices.Contains(badPhases, id) {
				badPhases = append(badPhases, id)
			}
		}
	}
	if len(badPhases) > 0 {
		sort.Strings(badPhases)
		return ErrOperationUnknownPhase(badPhases)
	}
	return nil
}

// resolveAssetPhases is the map a check-in is stored with after a write: one
// key per asset it now brings, its phase ids in phase order.
//
// With no sent map the stored rows stand, except that an asset that was not in
// the lists before is new and goes into every phase. With a sent map each key
// is taken as sent, and an asset it leaves out goes into every phase, so a
// client that knows nothing about phases can never bench an asset by accident.
// An empty list is kept as empty: brought, in no phase.
func resolveAssetPhases(after, before []string, previous, sent map[string][]string, phases []*Phase) map[string][]string {
	order := phaseOrder(phases)
	every := make([]string, len(phases))
	for i, ph := range phases {
		every[i] = ph.ID
	}
	inOrder := func(ids []string) []string {
		out := make([]string, 0, len(ids))
		for _, id := range ids {
			if _, ok := order[id]; ok && !slices.Contains(out, id) {
				out = append(out, id)
			}
		}
		sort.SliceStable(out, func(i, j int) bool { return order[out[i]] < order[out[j]] })
		return out
	}

	out := make(map[string][]string, len(after))
	for _, a := range after {
		switch {
		case sent != nil:
			if ids, ok := sent[a]; ok {
				out[a] = inOrder(ids)
			} else {
				out[a] = slices.Clone(every)
			}
		case slices.Contains(before, a):
			out[a] = inOrder(previous[a])
		default:
			out[a] = slices.Clone(every)
		}
	}
	return out
}

// sameAssetPhases compares two maps by what they put in phases: a key mapped to
// nothing and a key that is absent are the same, as they are in the table.
func sameAssetPhases(a, b map[string][]string) bool {
	for k, v := range a {
		if !slices.Equal(v, b[k]) && (len(v) > 0 || len(b[k]) > 0) {
			return false
		}
	}
	for k, v := range b {
		if len(v) > 0 && len(a[k]) == 0 {
			return false
		}
	}
	return true
}

// diffAssetPhases adds an "asset_phases" entry to changes, in the audit log's
// {old, new} shape, naming only the assets whose phases moved and the phases by
// name, since a phase id means nothing to a reader of the log.
func diffAssetPhases(changes map[string]any, old, updated map[string][]string, phases []*Phase) {
	if sameAssetPhases(old, updated) {
		return
	}
	names := make(map[string]string, len(phases))
	for _, ph := range phases {
		names[ph.ID] = ph.Name
	}
	moved := map[string]bool{}
	for k := range old {
		moved[k] = true
	}
	for k := range updated {
		moved[k] = true
	}
	var ids []string
	for k := range moved {
		if !slices.Equal(nonNil(old[k]), nonNil(updated[k])) {
			ids = append(ids, k)
		}
	}
	sort.Strings(ids)
	render := func(m map[string][]string) string {
		parts := make([]string, 0, len(ids))
		for _, a := range ids {
			var ns []string
			for _, id := range m[a] {
				if n, ok := names[id]; ok {
					ns = append(ns, n)
				}
			}
			if len(ns) == 0 {
				parts = append(parts, a+": none")
				continue
			}
			parts = append(parts, a+": "+strings.Join(ns, ", "))
		}
		return strings.Join(parts, "; ")
	}
	changes["asset_phases"] = map[string]any{"old": render(old), "new": render(updated)}
}

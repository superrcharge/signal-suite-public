package waveform

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"backend/internal/domain/waveform/dto"
	"backend/internal/shared/contracts"
)

type Service struct {
	repo   Repository
	audit  contracts.AuditRecorder
	assets []contracts.WaveformAssets
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetAudit(a contracts.AuditRecorder) { s.audit = a }

// AddWaveformAssets wires a domain that carries waveform abbrevs, so a delete
// can refuse to strand one and a rename can be carried to the carriers.
//
// A slice rather than a single field, and appended rather than set, because two
// domains carry them - equipment and platforms - and both must be consulted.
// Registering none is the unit-test case and stays legal: every call site below
// tolerates an empty slice, which is also what keeps `go test ./...` honest
// without a database.
func (s *Service) AddWaveformAssets(a contracts.WaveformAssets) {
	s.assets = append(s.assets, a)
}

// usageFor collects the assets carrying one abbrev, across every wired domain.
//
// Returns an error rather than swallowing one: a usage lookup that failed has
// not established that the waveform is unused, and treating it as "unused"
// would turn an outage into a silent data loss. The nets guard makes the same
// choice, and its test pins it.
func (s *Service) usageFor(ctx context.Context, abbrev string) ([]string, error) {
	usage, err := s.usageMap(ctx)
	if err != nil {
		return nil, err
	}
	return usage[strings.ToLower(strings.TrimSpace(abbrev))], nil
}

// usageMap merges every wired asset domain into one map.
//
// The delete guard and the usage endpoint both read this, deliberately. They
// answer the same question - what carries this abbrev - and two code paths
// answering one question is the drift contracts.WaveformAssets names by hand as
// the reason it returns a whole map rather than a per-abbrev lookup. The guard
// discards all but one key; that is cheap, and cheaper than a second reading.
func (s *Service) usageMap(ctx context.Context) (map[string][]string, error) {
	merged := map[string][]string{}
	for _, a := range s.assets {
		usage, err := a.WaveformUsage(ctx)
		if err != nil {
			return nil, err
		}
		for abbrev, names := range usage {
			merged[abbrev] = append(merged[abbrev], names...)
		}
	}
	return merged, nil
}

// WaveformUsage reports which assets carry each waveform in the library.
//
// The capability an earlier commit deleted with the Waveforms browse tab, brought
// back where a librarian is already standing rather than as a second matrix.
func (s *Service) WaveformUsage(ctx context.Context, resp *dto.UsageResponse) (int, error) {
	usage, err := s.usageMap(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrWaveformInternalError
	}
	resp.Usage = usage
	resp.Total = len(usage)
	return http.StatusOK, nil
}

// recordAudit is nil-tolerant because AuditRecorder is injected after
// construction, so a caller that builds a Service without wiring it - every
// unit test in this package - must not panic on a write.
func (s *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, in)
}

// diffWaveform reports changed fields in the {field: {old, new}} shape the audit
// log expects. UpdatedBy and UpdatedAt are skipped: they change on every write
// and would drown the real diff.
func diffWaveform(old, updated *Waveform) map[string]any {
	changes := map[string]any{}

	addStr := func(field, before, after string) {
		if before != after {
			changes[field] = map[string]any{"old": before, "new": after}
		}
	}

	addStr("abbrev", old.Abbrev, updated.Abbrev)
	addStr("name", old.Name, updated.Name)
	addStr("description", old.Description, updated.Description)

	return changes
}

func toResponse(w *Waveform) dto.WaveformResponse {
	return dto.WaveformResponse{
		ID:          w.ID,
		Abbrev:      w.Abbrev,
		Name:        w.Name,
		Description: w.Description,
		CreatedBy:   w.CreatedBy,
		UpdatedBy:   w.UpdatedBy,
		CreatedAt:   w.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   w.UpdatedAt.Format(time.RFC3339),
	}
}

func (s *Service) ListWaveforms(ctx context.Context, resp *dto.ListWaveformsResponse) (int, error) {
	items, err := s.repo.FindAll(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrWaveformInternalError
	}
	resp.Waveforms = make([]dto.WaveformResponse, 0, len(items))
	for _, w := range items {
		resp.Waveforms = append(resp.Waveforms, toResponse(w))
	}
	resp.Total = len(resp.Waveforms)
	return http.StatusOK, nil
}

func (s *Service) CreateWaveform(ctx context.Context, req *dto.CreateWaveformRequest, resp *dto.CreateWaveformResponse) (int, error) {
	abbrev := strings.TrimSpace(req.Abbrev)
	exists, err := s.repo.AbbrevExists(ctx, abbrev)
	if err != nil {
		return http.StatusInternalServerError, ErrWaveformInternalError
	}
	if exists {
		return http.StatusConflict, ErrWaveformAbbrevExists
	}

	now := time.Now().UTC()
	w := &Waveform{
		Abbrev:      abbrev,
		Name:        strings.TrimSpace(req.Name),
		Description: strings.TrimSpace(req.Description),
		CreatedBy:   req.CreatedBy,
		UpdatedBy:   req.UpdatedBy,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := s.repo.Create(ctx, w); err != nil {
		return http.StatusInternalServerError, ErrWaveformInternalError
	}

	// Re-fetch to get the DB-generated ID
	items, err := s.repo.FindAll(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrWaveformInternalError
	}
	var created *Waveform
	for _, item := range items {
		if strings.EqualFold(item.Abbrev, abbrev) {
			created = item
			resp.Waveform = toResponse(item)
			break
		}
	}

	// Guarded on created: the ID comes from that re-fetch, and an event with an
	// empty ResourceID is worse than none, being unjoinable to the row it
	// describes. Reaching here with created == nil already means the response is
	// empty too, so it is a pre-existing failure this does not paper over.
	if created != nil {
		s.recordAudit(ctx, contracts.AuditEventInput{
			ActorID:      req.ActorID,
			ActorName:    req.CreatedBy,
			ResourceType: "waveform",
			ResourceID:   created.ID,
			ResourceName: created.Abbrev,
			Action:       "create",
		})
	}

	return http.StatusCreated, nil
}

func (s *Service) UpdateWaveform(ctx context.Context, req *dto.UpdateWaveformRequest, resp *dto.UpdateWaveformResponse) (int, error) {
	w, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if errors.Is(err, ErrWaveformNotFound) {
			return http.StatusNotFound, ErrWaveformNotFound
		}
		return http.StatusInternalServerError, ErrWaveformInternalError
	}

	// Copied before any field is touched: w is a pointer into the repo result
	// and every branch below mutates it in place, so a diff taken afterwards
	// against w itself would compare the row to itself and report no changes.
	before := *w

	if req.Abbrev != nil {
		abbrev := strings.TrimSpace(*req.Abbrev)
		exists, err := s.repo.AbbrevExistsExcluding(ctx, abbrev, req.ID)
		if err != nil {
			return http.StatusInternalServerError, ErrWaveformInternalError
		}
		if exists {
			return http.StatusConflict, ErrWaveformAbbrevExists
		}

		// A pure case change is not a rename. AbbrevExistsExcluding compares on
		// lower(), so `anw2` -> `ANW2` gets this far; cascading it would rewrite
		// every carrying asset to say the same thing it already says.
		if !strings.EqualFold(before.Abbrev, abbrev) {
			// Carriers first, library row second. The two live in different
			// domains behind different repositories, so there is no transaction
			// spanning them - which makes the ORDER the safety property. Fail
			// here and every asset still points at a name that exists; do it the
			// other way round and a failure strands them all, which is the exact
			// state this guard exists to prevent.
			for _, a := range s.assets {
				if _, err := a.RenameWaveform(ctx, before.Abbrev, abbrev); err != nil {
					return http.StatusInternalServerError, ErrWaveformInternalError
				}
			}
		}
		w.Abbrev = abbrev
	}
	if req.Name != nil {
		w.Name = strings.TrimSpace(*req.Name)
	}
	if req.Description != nil {
		w.Description = strings.TrimSpace(*req.Description)
	}

	w.UpdatedBy = req.UpdatedBy
	w.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, w); err != nil {
		return http.StatusInternalServerError, ErrWaveformInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "waveform",
		ResourceID:   w.ID,
		ResourceName: w.Abbrev,
		Action:       "update",
		Changes:      diffWaveform(&before, w),
	})

	resp.Waveform = toResponse(w)
	return http.StatusOK, nil
}

func (s *Service) DeleteWaveform(ctx context.Context, req *dto.DeleteWaveformRequest) (int, error) {
	// The record is read for two reasons: a delete of something that never
	// existed should 404 rather than silently succeed, and the audit event needs
	// the abbrev, which is unrecoverable once the row is gone.
	existing, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if errors.Is(err, ErrWaveformNotFound) {
			return http.StatusNotFound, ErrWaveformNotFound
		}
		return http.StatusInternalServerError, ErrWaveformInternalError
	}

	// Assets store the abbrev as text, not as a foreign key, so nothing in the
	// database refuses this and the check has to be made here. Deleting a
	// carried waveform would leave every carrier naming something unlookupable.
	used, err := s.usageFor(ctx, existing.Abbrev)
	if err != nil {
		return http.StatusInternalServerError, ErrWaveformInternalError
	}
	if len(used) > 0 {
		return http.StatusConflict, ErrWaveformInUse(used)
	}

	if err := s.repo.Delete(ctx, req.ID); err != nil {
		return http.StatusInternalServerError, ErrWaveformInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "waveform",
		ResourceID:   existing.ID,
		ResourceName: existing.Abbrev,
		Action:       "delete",
	})

	return http.StatusNoContent, nil
}

// KnownWaveformAbbrevs satisfies contracts.WaveformLookup, letting an asset
// domain reject an abbrev the library does not declare without importing this
// one. The mirror of AddWaveformAssets: together they close both directions,
// so neither a waveform nor the asset naming it can move out from under the
// other.
func (s *Service) KnownWaveformAbbrevs(ctx context.Context) (map[string]struct{}, error) {
	all, err := s.repo.FindAll(ctx)
	if err != nil {
		return nil, err
	}
	known := make(map[string]struct{}, len(all))
	for _, w := range all {
		known[strings.ToLower(strings.TrimSpace(w.Abbrev))] = struct{}{}
	}
	return known, nil
}

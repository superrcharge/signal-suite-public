package platform

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"backend/internal/domain/platform/dto"
	"backend/internal/shared/contracts"
)

type Service struct {
	repo     Repository
	audit    contracts.AuditRecorder
	waveform contracts.WaveformLookup
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetAudit(a contracts.AuditRecorder) { s.audit = a }

// SetWaveformLookup wires the waveform library so a platform cannot be stored
// naming an abbrev nothing declares.
func (s *Service) SetWaveformLookup(l contracts.WaveformLookup) { s.waveform = l }

// checkWaveforms rejects abbrevs the library does not declare, preserving the
// caller's spelling in the message so the user sees what they typed.
//
// Nil-tolerant: the lookup is injected after construction, so a Service built
// without it - every unit test in this package - skips the check rather than
// panicking, the same shape as recordAudit. That means the check is only as
// live as main.go's wiring, which is why there is a test asserting the wiring
// rather than only the rule.
func (s *Service) checkWaveforms(ctx context.Context, abbrevs []string) error {
	if s.waveform == nil || len(abbrevs) == 0 {
		return nil
	}
	known, err := s.waveform.KnownWaveformAbbrevs(ctx)
	if err != nil {
		return ErrPlatformInternalError
	}
	var unknown []string
	for _, a := range abbrevs {
		if _, ok := known[strings.ToLower(strings.TrimSpace(a))]; !ok {
			unknown = append(unknown, a)
		}
	}
	if len(unknown) > 0 {
		return ErrPlatformUnknownWaveform(unknown)
	}
	return nil
}

// recordAudit is nil-tolerant because AuditRecorder is injected after
// construction, so a Service built without it - every unit test in this
// package - must not panic on a write.
func (s *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, in)
}

// diffPlatform reports changed fields in the {field: {old, new}} shape the
// audit log expects. The two lists are reported joined, so a reader of the log
// sees "L16, MADL" -> "L16" rather than two opaque arrays.
func diffPlatform(old, updated *Platform) map[string]any {
	changes := map[string]any{}

	addStr := func(field, before, after string) {
		if before != after {
			changes[field] = map[string]any{"old": before, "new": after}
		}
	}
	addList := func(field string, before, after []string) {
		if !slices.Equal(before, after) {
			changes[field] = map[string]any{
				"old": strings.Join(before, ", "),
				"new": strings.Join(after, ", "),
			}
		}
	}

	addStr("designation", old.Designation, updated.Designation)
	addStr("popular_name", old.PopularName, updated.PopularName)
	addStr("category", old.Category, updated.Category)
	addStr("kind", old.Kind, updated.Kind)
	addStr("operator", old.Operator, updated.Operator)
	addList("waveform_abbrevs", old.WaveformAbbrevs, updated.WaveformAbbrevs)
	addList("equipment_ids", old.EquipmentIDs, updated.EquipmentIDs)
	addStr("notes", old.Notes, updated.Notes)

	return changes
}

func toResponse(p *Platform) dto.PlatformResponse {
	return dto.PlatformResponse{
		ID:              p.ID,
		Designation:     p.Designation,
		PopularName:     p.PopularName,
		Category:        p.Category,
		Kind:            p.Kind,
		Operator:        p.Operator,
		WaveformAbbrevs: nonNil(p.WaveformAbbrevs),
		EquipmentIDs:    nonNil(p.EquipmentIDs),
		Notes:           p.Notes,
		CreatedBy:       p.CreatedBy,
		UpdatedBy:       p.UpdatedBy,
		CreatedAt:       p.CreatedAt.Format(time.RFC3339),
		UpdatedAt:       p.UpdatedAt.Format(time.RFC3339),
	}
}

func resolveCategory(v string) (string, error) {
	c := NormaliseCategory(v)
	if !IsValidVocab(c) {
		return "", ErrPlatformInvalidCategory
	}
	return c, nil
}

func resolveKind(v string) (string, error) {
	k := NormaliseKind(v)
	if !IsValidVocab(k) {
		return "", ErrPlatformInvalidKind
	}
	return k, nil
}

func (s *Service) ListPlatforms(ctx context.Context, resp *dto.ListPlatformsResponse) (int, error) {
	items, err := s.repo.FindAll(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrPlatformInternalError
	}
	resp.Platforms = make([]dto.PlatformResponse, 0, len(items))
	for _, p := range items {
		resp.Platforms = append(resp.Platforms, toResponse(p))
	}
	resp.Total = len(resp.Platforms)
	return http.StatusOK, nil
}

func (s *Service) CreatePlatform(ctx context.Context, req *dto.CreatePlatformRequest, resp *dto.CreatePlatformResponse) (int, error) {
	designation := strings.TrimSpace(req.Designation)

	category, err := resolveCategory(req.Category)
	if err != nil {
		return http.StatusBadRequest, err
	}
	kind, err := resolveKind(req.Kind)
	if err != nil {
		return http.StatusBadRequest, err
	}

	abbrevs := NormaliseAbbrevs(req.WaveformAbbrevs)
	if err := s.checkWaveforms(ctx, abbrevs); err != nil {
		return errStatus(err), err
	}

	exists, err := s.repo.DesignationExists(ctx, designation)
	if err != nil {
		return http.StatusInternalServerError, ErrPlatformInternalError
	}
	if exists {
		return http.StatusConflict, ErrPlatformDesignationExists
	}

	now := time.Now().UTC()
	p := &Platform{
		Designation:     designation,
		PopularName:     strings.TrimSpace(req.PopularName),
		Category:        category,
		Kind:            kind,
		Operator:        strings.TrimSpace(req.Operator),
		WaveformAbbrevs: abbrevs,
		EquipmentIDs:    NormaliseIDs(req.EquipmentIDs),
		Notes:           strings.TrimSpace(req.Notes),
		CreatedBy:       req.CreatedBy,
		UpdatedBy:       req.UpdatedBy,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if err := s.repo.Create(ctx, p); err != nil {
		return http.StatusInternalServerError, ErrPlatformInternalError
	}

	// Re-fetch to get the DB-generated ID.
	items, err := s.repo.FindAll(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrPlatformInternalError
	}
	var created *Platform
	for _, item := range items {
		if strings.EqualFold(item.Designation, designation) {
			created = item
			resp.Platform = toResponse(item)
			break
		}
	}

	// Guarded on created: an event with an empty ResourceID is unjoinable to
	// the row it describes.
	if created != nil {
		s.recordAudit(ctx, contracts.AuditEventInput{
			ActorID:      req.ActorID,
			ActorName:    req.CreatedBy,
			ResourceType: "platform",
			ResourceID:   created.ID,
			ResourceName: created.Designation,
			Action:       "create",
		})
	}

	return http.StatusCreated, nil
}

func (s *Service) UpdatePlatform(ctx context.Context, req *dto.UpdatePlatformRequest, resp *dto.UpdatePlatformResponse) (int, error) {
	p, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if errors.Is(err, ErrPlatformNotFound) {
			return http.StatusNotFound, ErrPlatformNotFound
		}
		return http.StatusInternalServerError, ErrPlatformInternalError
	}

	// Copied before any field is touched: p is a pointer into the repo result
	// and every branch below mutates it in place.
	before := *p

	if req.Designation != nil {
		designation := strings.TrimSpace(*req.Designation)
		exists, err := s.repo.DesignationExistsExcluding(ctx, designation, req.ID)
		if err != nil {
			return http.StatusInternalServerError, ErrPlatformInternalError
		}
		if exists {
			return http.StatusConflict, ErrPlatformDesignationExists
		}
		p.Designation = designation
	}
	if req.PopularName != nil {
		p.PopularName = strings.TrimSpace(*req.PopularName)
	}
	if req.Category != nil {
		category, err := resolveCategory(*req.Category)
		if err != nil {
			return http.StatusBadRequest, err
		}
		p.Category = category
	}
	if req.Kind != nil {
		kind, err := resolveKind(*req.Kind)
		if err != nil {
			return http.StatusBadRequest, err
		}
		p.Kind = kind
	}
	if req.Operator != nil {
		p.Operator = strings.TrimSpace(*req.Operator)
	}
	if req.WaveformAbbrevs != nil {
		abbrevs := NormaliseAbbrevs(*req.WaveformAbbrevs)
		if err := s.checkWaveforms(ctx, abbrevs); err != nil {
			return errStatus(err), err
		}
		p.WaveformAbbrevs = abbrevs
	}
	if req.EquipmentIDs != nil {
		p.EquipmentIDs = NormaliseIDs(*req.EquipmentIDs)
	}
	if req.Notes != nil {
		p.Notes = strings.TrimSpace(*req.Notes)
	}

	p.UpdatedBy = req.UpdatedBy
	p.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, p); err != nil {
		return http.StatusInternalServerError, ErrPlatformInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "platform",
		ResourceID:   p.ID,
		ResourceName: p.Designation,
		Action:       "update",
		Changes:      diffPlatform(&before, p),
	})

	resp.Platform = toResponse(p)
	return http.StatusOK, nil
}

func (s *Service) DeletePlatform(ctx context.Context, req *dto.DeletePlatformRequest) (int, error) {
	// Read first: a delete of something that never existed should 404, and the
	// audit event needs the designation, which is gone once the row is.
	existing, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if errors.Is(err, ErrPlatformNotFound) {
			return http.StatusNotFound, ErrPlatformNotFound
		}
		return http.StatusInternalServerError, ErrPlatformInternalError
	}

	if err := s.repo.Delete(ctx, req.ID); err != nil {
		return http.StatusInternalServerError, ErrPlatformInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "platform",
		ResourceID:   existing.ID,
		ResourceName: existing.Designation,
		Action:       "delete",
	})

	return http.StatusNoContent, nil
}

// WaveformUsage and RenameWaveform satisfy contracts.WaveformAssets, the same
// pass-through shape the equipment service uses and for the same reason: the
// rule belongs in SQL, where one statement covers every row.
func (s *Service) WaveformUsage(ctx context.Context) (map[string][]string, error) {
	return s.repo.WaveformUsage(ctx)
}

func (s *Service) RenameWaveform(ctx context.Context, from, to string) (int, error) {
	return s.repo.RenameWaveform(ctx, from, to)
}

// errStatus reads the status off a domain error, so a caller can return the
// pair without restating which error maps to which code in a second place.
func errStatus(err error) int {
	var e *Error
	if errors.As(err, &e) {
		return e.Status
	}
	return http.StatusInternalServerError
}

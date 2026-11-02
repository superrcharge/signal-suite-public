package organization

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"backend/internal/domain/organization/dto"
	"backend/internal/shared/branch"
	"backend/internal/shared/contracts"
)

type Service struct {
	repo    Repository
	audit   contracts.AuditRecorder
	section contracts.SectionLister
	usage   contracts.OrganizationUsage
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetAudit(a contracts.AuditRecorder) { s.audit = a }

// SetSectionLister wires the sections so an organization cannot be mapped to a
// squadron that does not exist.
func (s *Service) SetSectionLister(l contracts.SectionLister) { s.section = l }

// SetOrganizationUsage wires the operations side so a delete can name the
// operations that still carry the organization.
func (s *Service) SetOrganizationUsage(u contracts.OrganizationUsage) { s.usage = u }

// recordAudit is nil-tolerant because AuditRecorder is injected after
// construction, so a Service built without it - every unit test in this
// package - must not panic on a write.
func (s *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, in)
}

// checkSection rejects a section key no section declares. Nil-tolerant like
// recordAudit: the lister is injected after construction, so an unwired Service
// accepts any key and the foreign key is left to refuse it.
func (s *Service) checkSection(ctx context.Context, key string) error {
	if s.section == nil || key == "" {
		return nil
	}
	keys, err := s.section.GetSectionKeys(ctx)
	if err != nil {
		return ErrOrganizationInternalError
	}
	if !slices.Contains(keys, key) {
		return ErrOrganizationUnknownSection
	}
	return nil
}

// resolveBranch maps a branch, or an alias for one, to its abbreviation. Blank
// is allowed and means "not a service component".
func resolveBranch(v string) (string, error) {
	if strings.TrimSpace(v) == "" {
		return "", nil
	}
	b, ok := branch.NormaliseOne(v)
	if !ok {
		return "", ErrOrganizationInvalidBranch
	}
	return b, nil
}

// diffOrganization reports changed fields in the {field: {old, new}} shape the
// audit log expects.
func diffOrganization(old, updated *Organization) map[string]any {
	changes := map[string]any{}
	add := func(field, before, after string) {
		if before != after {
			changes[field] = map[string]any{"old": before, "new": after}
		}
	}
	add("name", old.Name, updated.Name)
	add("short_label", old.ShortLabel, updated.ShortLabel)
	add("branch", old.Branch, updated.Branch)
	add("color", old.Color, updated.Color)
	add("section_key", old.SectionKey, updated.SectionKey)
	add("notes", old.Notes, updated.Notes)
	return changes
}

func toResponse(o *Organization) dto.OrganizationResponse {
	return dto.OrganizationResponse{
		Key:        o.Key,
		Name:       o.Name,
		ShortLabel: o.ShortLabel,
		Branch:     o.Branch,
		Color:      o.Color,
		SectionKey: o.SectionKey,
		Notes:      o.Notes,
		CreatedBy:  o.CreatedBy,
		UpdatedBy:  o.UpdatedBy,
		CreatedAt:  o.CreatedAt.Format(time.RFC3339),
		UpdatedAt:  o.UpdatedAt.Format(time.RFC3339),

		OperationCount: o.OperationCount,
	}
}

func (s *Service) ListOrganizations(ctx context.Context, resp *dto.ListOrganizationsResponse) (int, error) {
	items, err := s.repo.FindAll(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrOrganizationInternalError
	}
	resp.Organizations = make([]dto.OrganizationResponse, 0, len(items))
	for _, o := range items {
		resp.Organizations = append(resp.Organizations, toResponse(o))
	}
	resp.Total = len(resp.Organizations)
	return http.StatusOK, nil
}

func (s *Service) CreateOrganization(ctx context.Context, req *dto.CreateOrganizationRequest, resp *dto.CreateOrganizationResponse) (int, error) {
	key, ok := NormaliseKey(req.Key)
	if !ok {
		return http.StatusBadRequest, ErrOrganizationInvalidKey
	}
	b, err := resolveBranch(req.Branch)
	if err != nil {
		return http.StatusBadRequest, err
	}
	sectionKey := strings.TrimSpace(req.SectionKey)
	if err := s.checkSection(ctx, sectionKey); err != nil {
		return errStatus(err), err
	}
	name := strings.TrimSpace(req.Name)

	exists, err := s.repo.KeyExists(ctx, key)
	if err != nil {
		return http.StatusInternalServerError, ErrOrganizationInternalError
	}
	if exists {
		return http.StatusConflict, ErrOrganizationKeyExists
	}
	exists, err = s.repo.NameExists(ctx, name)
	if err != nil {
		return http.StatusInternalServerError, ErrOrganizationInternalError
	}
	if exists {
		return http.StatusConflict, ErrOrganizationNameExists
	}

	now := time.Now().UTC()
	o := &Organization{
		Key:        key,
		Name:       name,
		ShortLabel: strings.TrimSpace(req.ShortLabel),
		Branch:     b,
		Color:      strings.TrimSpace(req.Color),
		SectionKey: sectionKey,
		Notes:      strings.TrimSpace(req.Notes),
		CreatedBy:  req.CreatedBy,
		UpdatedBy:  req.UpdatedBy,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	if err := s.repo.Create(ctx, o); err != nil {
		var coded *Error
		if errors.As(err, &coded) {
			return coded.Status, coded
		}
		return http.StatusInternalServerError, ErrOrganizationInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.CreatedBy,
		ResourceType: "organization",
		ResourceID:   o.Key,
		ResourceName: o.Name,
		Action:       "create",
	})

	resp.Organization = toResponse(o)
	return http.StatusCreated, nil
}

func (s *Service) UpdateOrganization(ctx context.Context, req *dto.UpdateOrganizationRequest, resp *dto.UpdateOrganizationResponse) (int, error) {
	o, err := s.repo.FindByKey(ctx, req.Key)
	if err != nil {
		if errors.Is(err, ErrOrganizationNotFound) {
			return http.StatusNotFound, ErrOrganizationNotFound
		}
		return http.StatusInternalServerError, ErrOrganizationInternalError
	}

	// Copied before any field is touched: o is a pointer into the repo result
	// and every branch below mutates it in place.
	before := *o

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		exists, err := s.repo.NameExistsExcluding(ctx, name, req.Key)
		if err != nil {
			return http.StatusInternalServerError, ErrOrganizationInternalError
		}
		if exists {
			return http.StatusConflict, ErrOrganizationNameExists
		}
		o.Name = name
	}
	if req.ShortLabel != nil {
		o.ShortLabel = strings.TrimSpace(*req.ShortLabel)
	}
	if req.Branch != nil {
		b, err := resolveBranch(*req.Branch)
		if err != nil {
			return http.StatusBadRequest, err
		}
		o.Branch = b
	}
	if req.Color != nil {
		o.Color = strings.TrimSpace(*req.Color)
	}
	if req.SectionKey != nil {
		sectionKey := strings.TrimSpace(*req.SectionKey)
		if err := s.checkSection(ctx, sectionKey); err != nil {
			return errStatus(err), err
		}
		o.SectionKey = sectionKey
	}
	if req.Notes != nil {
		o.Notes = strings.TrimSpace(*req.Notes)
	}

	changes := diffOrganization(&before, o)
	if len(changes) == 0 {
		// Nothing changed: no write, no audit event, no new updated_at.
		resp.Organization = toResponse(o)
		return http.StatusOK, nil
	}

	o.UpdatedBy = req.UpdatedBy
	o.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, o); err != nil {
		var coded *Error
		if errors.As(err, &coded) {
			return coded.Status, coded
		}
		return http.StatusInternalServerError, ErrOrganizationInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "organization",
		ResourceID:   o.Key,
		ResourceName: o.Name,
		Action:       "update",
		Changes:      changes,
	})

	resp.Organization = toResponse(o)
	return http.StatusOK, nil
}

func (s *Service) DeleteOrganization(ctx context.Context, req *dto.DeleteOrganizationRequest) (int, error) {
	// Read first: a delete of something that never existed should 404, and the
	// audit event needs the name, which is gone once the row is.
	existing, err := s.repo.FindByKey(ctx, req.Key)
	if err != nil {
		if errors.Is(err, ErrOrganizationNotFound) {
			return http.StatusNotFound, ErrOrganizationNotFound
		}
		return http.StatusInternalServerError, ErrOrganizationInternalError
	}

	if s.usage != nil {
		ops, err := s.usage.OperationsUsingOrganization(ctx, existing.Key)
		if err != nil {
			return http.StatusInternalServerError, ErrOrganizationInternalError
		}
		if len(ops) > 0 {
			e := ErrOrganizationInUse(ops)
			return e.Status, e
		}
	}

	if err := s.repo.Delete(ctx, req.Key); err != nil {
		var coded *Error
		if errors.As(err, &coded) {
			return coded.Status, coded
		}
		return http.StatusInternalServerError, ErrOrganizationInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "organization",
		ResourceID:   existing.Key,
		ResourceName: existing.Name,
		Action:       "delete",
	})

	return http.StatusNoContent, nil
}

// OrganizationsByKeys satisfies contracts.OrganizationLookup. A key naming no
// organization is absent from the result.
func (s *Service) OrganizationsByKeys(ctx context.Context, keys []string) (map[string]contracts.OrganizationInfo, error) {
	items, err := s.repo.FindByKeys(ctx, keys)
	if err != nil {
		return nil, err
	}
	out := make(map[string]contracts.OrganizationInfo, len(items))
	for _, o := range items {
		out[o.Key] = contracts.OrganizationInfo{
			Key:        o.Key,
			Name:       o.Name,
			ShortLabel: o.ShortLabel,
			Branch:     o.Branch,
			Color:      o.Color,
		}
	}
	return out, nil
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

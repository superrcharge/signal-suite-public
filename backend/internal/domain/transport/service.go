package transport

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"backend/internal/domain/transport/dto"
	"backend/internal/shared/contracts"
)

type Service struct {
	repo  Repository
	audit contracts.AuditRecorder
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetAudit(a contracts.AuditRecorder) { s.audit = a }

// recordAudit is nil-tolerant because AuditRecorder is injected after
// construction, so a caller that builds a Service without wiring it - every
// unit test in this package - must not panic on a write.
func (s *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, in)
}

// diffTransport reports changed fields in the {field: {old, new}} shape the audit
// log expects. UpdatedBy and UpdatedAt are skipped: they change on every write
// and would drown the real diff.
func diffTransport(old, updated *Transport) map[string]any {
	changes := map[string]any{}

	addStr := func(field, before, after string) {
		if before != after {
			changes[field] = map[string]any{"old": before, "new": after}
		}
	}

	addStr("name", old.Name, updated.Name)
	addStr("kind", old.Kind, updated.Kind)
	addStr("provider", old.Provider, updated.Provider)
	addStr("description", old.Description, updated.Description)

	return changes
}

func toResponse(t *Transport) dto.TransportResponse {
	return dto.TransportResponse{
		ID:          t.ID,
		Name:        t.Name,
		Kind:        t.Kind,
		Provider:    t.Provider,
		Description: t.Description,
		CreatedBy:   t.CreatedBy,
		UpdatedBy:   t.UpdatedBy,
		CreatedAt:   t.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   t.UpdatedAt.Format(time.RFC3339),
	}
}

// resolveKind normalises then shape-checks. Membership in DefaultKinds is
// deliberately not required: the vocabulary is open, so a kind nobody
// anticipated is accepted as long as it is well formed.
func resolveKind(kind string) (string, error) {
	k := NormaliseKind(kind)
	if !IsValidKind(k) {
		return "", ErrTransportInvalidKind
	}
	return k, nil
}

func (s *Service) ListTransports(ctx context.Context, resp *dto.ListTransportsResponse) (int, error) {
	items, err := s.repo.FindAll(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrTransportInternalError
	}
	resp.Transports = make([]dto.TransportResponse, 0, len(items))
	for _, t := range items {
		resp.Transports = append(resp.Transports, toResponse(t))
	}
	resp.Total = len(resp.Transports)
	return http.StatusOK, nil
}

func (s *Service) CreateTransport(ctx context.Context, req *dto.CreateTransportRequest, resp *dto.CreateTransportResponse) (int, error) {
	name := strings.TrimSpace(req.Name)

	kind, err := resolveKind(req.Kind)
	if err != nil {
		return http.StatusBadRequest, ErrTransportInvalidKind
	}

	exists, err := s.repo.NameExists(ctx, name)
	if err != nil {
		return http.StatusInternalServerError, ErrTransportInternalError
	}
	if exists {
		return http.StatusConflict, ErrTransportNameExists
	}

	now := time.Now().UTC()
	t := &Transport{
		Name:        name,
		Kind:        kind,
		Provider:    strings.TrimSpace(req.Provider),
		Description: strings.TrimSpace(req.Description),
		CreatedBy:   req.CreatedBy,
		UpdatedBy:   req.UpdatedBy,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := s.repo.Create(ctx, t); err != nil {
		return http.StatusInternalServerError, ErrTransportInternalError
	}

	// Re-fetch to get the DB-generated ID
	items, err := s.repo.FindAll(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrTransportInternalError
	}
	var created *Transport
	for _, item := range items {
		if strings.EqualFold(item.Name, name) {
			created = item
			resp.Transport = toResponse(item)
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
			ResourceType: "transport",
			ResourceID:   created.ID,
			ResourceName: created.Name,
			Action:       "create",
		})
	}

	return http.StatusCreated, nil
}

func (s *Service) UpdateTransport(ctx context.Context, req *dto.UpdateTransportRequest, resp *dto.UpdateTransportResponse) (int, error) {
	t, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if errors.Is(err, ErrTransportNotFound) {
			return http.StatusNotFound, ErrTransportNotFound
		}
		return http.StatusInternalServerError, ErrTransportInternalError
	}

	// Copied before any field is touched: t is a pointer into the repo result
	// and every branch below mutates it in place, so a diff taken afterwards
	// against t itself would compare the row to itself and report no changes.
	before := *t

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		exists, err := s.repo.NameExistsExcluding(ctx, name, req.ID)
		if err != nil {
			return http.StatusInternalServerError, ErrTransportInternalError
		}
		if exists {
			return http.StatusConflict, ErrTransportNameExists
		}
		t.Name = name
	}
	if req.Kind != nil {
		kind, err := resolveKind(*req.Kind)
		if err != nil {
			return http.StatusBadRequest, ErrTransportInvalidKind
		}
		t.Kind = kind
	}
	if req.Provider != nil {
		t.Provider = strings.TrimSpace(*req.Provider)
	}
	if req.Description != nil {
		t.Description = strings.TrimSpace(*req.Description)
	}

	t.UpdatedBy = req.UpdatedBy
	t.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, t); err != nil {
		return http.StatusInternalServerError, ErrTransportInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "transport",
		ResourceID:   t.ID,
		ResourceName: t.Name,
		Action:       "update",
		Changes:      diffTransport(&before, t),
	})

	resp.Transport = toResponse(t)
	return http.StatusOK, nil
}

func (s *Service) DeleteTransport(ctx context.Context, req *dto.DeleteTransportRequest) (int, error) {
	// The record is read for two reasons: a delete of something that never
	// existed should 404 rather than silently succeed, and the audit event needs
	// the name, which is unrecoverable once the row is gone.
	existing, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if errors.Is(err, ErrTransportNotFound) {
			return http.StatusNotFound, ErrTransportNotFound
		}
		return http.StatusInternalServerError, ErrTransportInternalError
	}

	if err := s.repo.Delete(ctx, req.ID); err != nil {
		return http.StatusInternalServerError, ErrTransportInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "transport",
		ResourceID:   existing.ID,
		ResourceName: existing.Name,
		Action:       "delete",
	})

	return http.StatusNoContent, nil
}

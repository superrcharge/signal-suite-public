package audit

import (
	"context"
	"log"
	"net/http"
	"time"

	"backend/internal/domain/audit/dto"
	"backend/internal/shared/contracts"

	"github.com/google/uuid"
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Record persists one audit event, implementing contracts.AuditRecorder.
// Best-effort: if the insert fails we log a warning but do not propagate
// the error. The caller has already performed the underlying mutation
// and we don't want to roll it back over an audit log failure. A
// missing audit row is recoverable (we'll notice); a rolled-back delete
// that silently succeeded is not.
func (s *Service) Record(ctx context.Context, in contracts.AuditEventInput) {
	e := &Event{
		ID:           uuid.New().String(),
		ResourceType: in.ResourceType,
		ResourceID:   in.ResourceID,
		Action:       in.Action,
		Changes:      in.Changes,
		CreatedAt:    time.Now().UTC(),
	}
	if in.ActorID != "" {
		id := in.ActorID
		e.ActorID = &id
	}
	if in.ActorName != "" {
		name := in.ActorName
		e.ActorName = &name
	}
	if in.ActorEmail != "" {
		email := in.ActorEmail
		e.ActorEmail = &email
	}
	if in.ResourceName != "" {
		name := in.ResourceName
		e.ResourceName = &name
	}

	if err := s.repo.Insert(ctx, e); err != nil {
		log.Printf("audit: failed to record %s/%s/%s: %v",
			in.ResourceType, in.Action, in.ResourceID, err)
	}
}

// ListEvents returns paginated audit events with optional filters.
// Admin-only; the HTTP route enforces that via RequireRole("admin").
func (s *Service) ListEvents(ctx context.Context, req *dto.ListEventsRequest, resp *dto.ListEventsResponse) (int, error) {
	page := req.Page
	if page < 1 {
		page = 1
	}
	limit := req.Limit
	if limit <= 0 {
		limit = 50
	}

	filters := Filters{
		ResourceType: req.ResourceType,
		ResourceID:   req.ResourceID,
		ActorID:      req.ActorID,
		Action:       req.Action,
	}
	if req.Since != "" {
		if t, err := time.Parse(time.RFC3339, req.Since); err == nil {
			filters.Since = t
		}
	}
	if req.Until != "" {
		if t, err := time.Parse(time.RFC3339, req.Until); err == nil {
			filters.Until = t
		}
	}

	events, total, err := s.repo.FindAll(ctx, filters, page, limit)
	if err != nil {
		return http.StatusInternalServerError, ErrAuditInternalError
	}

	totalPages := total / limit
	if total%limit != 0 {
		totalPages++
	}
	if totalPages < 1 {
		totalPages = 1
	}

	resp.Events = toEventResponseList(events)
	resp.Total = total
	resp.Page = page
	resp.TotalPages = totalPages
	return http.StatusOK, nil
}

func toEventResponse(e *Event) dto.EventResponse {
	return dto.EventResponse{
		ID:           e.ID,
		ActorID:      e.ActorID,
		ActorName:    e.ActorName,
		ActorEmail:   e.ActorEmail,
		ResourceType: e.ResourceType,
		ResourceID:   e.ResourceID,
		ResourceName: e.ResourceName,
		Action:       e.Action,
		Changes:      e.Changes,
		CreatedAt:    e.CreatedAt,
	}
}

func toEventResponseList(events []*Event) []dto.EventResponse {
	out := make([]dto.EventResponse, len(events))
	for i, e := range events {
		out[i] = toEventResponse(e)
	}
	return out
}

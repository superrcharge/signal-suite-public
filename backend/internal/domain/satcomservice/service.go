package satcomservice

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"backend/internal/domain/satcomservice/dto"
	"backend/internal/shared/contracts"
)

// Service is the layer, SatcomService is the entity.
//
// It reads usage but does not guard on it, and the difference is the point.
// Nothing enforces a reference to a service - no FK, no cascade, and
// TestDeleteServiceIsNotGuarded pins that a delete stays unrefused - so the
// lookup below exists to TELL a librarian what offers an entry, not to stop
// them removing it. The waveform side guards because the compatibility matrix
// depends on every carried name being lookupable; a service has no such
// consumer. 
type Service struct {
	repo   Repository
	audit  contracts.AuditRecorder
	assets contracts.ServiceAssets
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (svc *Service) SetAudit(a contracts.AuditRecorder) { svc.audit = a }

// SetServiceAssets wires the domain that carries service abbrevs. One provider,
// not two: platforms carry no services, so equipment is the whole of it.
func (svc *Service) SetServiceAssets(a contracts.ServiceAssets) { svc.assets = a }

// ServiceUsage reports which catalog terminals offer each service in the
// library - the capability an earlier commit deleted with the Services browse tab.
//
// Nil-tolerant, like recordAudit: the provider is injected after construction,
// so a Service built without it - every unit test in this package - reports no
// usage rather than panicking.
func (svc *Service) ServiceUsage(ctx context.Context, resp *dto.UsageResponse) (int, error) {
	resp.Usage = map[string][]string{}
	if svc.assets != nil {
		usage, err := svc.assets.ServiceUsage(ctx)
		if err != nil {
			return http.StatusInternalServerError, ErrServiceInternalError
		}
		resp.Usage = usage
	}
	resp.Total = len(resp.Usage)
	return http.StatusOK, nil
}

func (svc *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if svc.audit == nil {
		return
	}
	svc.audit.Record(ctx, in)
}

func toResponse(s *SatcomService) dto.ServiceResponse {
	return dto.ServiceResponse{
		ID:          s.ID,
		Abbrev:      s.Abbrev,
		Name:        s.Name,
		Description: s.Description,
		CreatedBy:   s.CreatedBy,
		UpdatedBy:   s.UpdatedBy,
		CreatedAt:   s.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   s.UpdatedAt.Format(time.RFC3339),
	}
}

// diffService reports the fields that changed, in the {field: {old, new}} shape
// the audit log expects. UpdatedBy and UpdatedAt are skipped: they change on
// every write and would drown the real diff.
func diffService(old, updated *SatcomService) map[string]any {
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

func (svc *Service) ListServices(ctx context.Context, resp *dto.ListServicesResponse) (int, error) {
	items, err := svc.repo.FindAll(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrServiceInternalError
	}
	resp.Services = make([]dto.ServiceResponse, 0, len(items))
	for _, s := range items {
		resp.Services = append(resp.Services, toResponse(s))
	}
	resp.Total = len(resp.Services)
	return http.StatusOK, nil
}

func (svc *Service) CreateService(ctx context.Context, req *dto.CreateServiceRequest, resp *dto.CreateServiceResponse) (int, error) {
	abbrev := strings.TrimSpace(req.Abbrev)
	exists, err := svc.repo.AbbrevExists(ctx, abbrev)
	if err != nil {
		return http.StatusInternalServerError, ErrServiceInternalError
	}
	if exists {
		return http.StatusConflict, ErrServiceAbbrevExists
	}

	now := time.Now().UTC()
	s := &SatcomService{
		Abbrev:      abbrev,
		Name:        strings.TrimSpace(req.Name),
		Description: strings.TrimSpace(req.Description),
		CreatedBy:   req.CreatedBy,
		UpdatedBy:   req.UpdatedBy,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := svc.repo.Create(ctx, s); err != nil {
		// The AbbrevExists check above loses to a concurrent create; the unique
		// index catches it, and this reports it as the conflict it is.
		if errors.Is(err, ErrServiceAbbrevExists) {
			return http.StatusConflict, ErrServiceAbbrevExists
		}
		return http.StatusInternalServerError, ErrServiceInternalError
	}

	// Create fills in s.ID via RETURNING, so the response is the row that was
	// written rather than one found by searching for it afterwards.
	resp.Service = toResponse(s)

	svc.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.CreatedBy,
		ResourceType: "service",
		ResourceID:   s.ID,
		ResourceName: s.Abbrev,
		Action:       "create",
	})

	return http.StatusCreated, nil
}

func (svc *Service) UpdateService(ctx context.Context, req *dto.UpdateServiceRequest, resp *dto.UpdateServiceResponse) (int, error) {
	s, err := svc.repo.FindByID(ctx, req.ID)
	if err != nil {
		if errors.Is(err, ErrServiceNotFound) {
			return http.StatusNotFound, ErrServiceNotFound
		}
		return http.StatusInternalServerError, ErrServiceInternalError
	}

	before := *s

	if req.Abbrev != nil {
		abbrev := strings.TrimSpace(*req.Abbrev)
		exists, err := svc.repo.AbbrevExistsExcluding(ctx, abbrev, req.ID)
		if err != nil {
			return http.StatusInternalServerError, ErrServiceInternalError
		}
		if exists {
			return http.StatusConflict, ErrServiceAbbrevExists
		}
		s.Abbrev = abbrev
	}
	if req.Name != nil {
		s.Name = strings.TrimSpace(*req.Name)
	}
	if req.Description != nil {
		s.Description = strings.TrimSpace(*req.Description)
	}

	s.UpdatedBy = req.UpdatedBy
	s.UpdatedAt = time.Now().UTC()

	if err := svc.repo.Update(ctx, s); err != nil {
		if errors.Is(err, ErrServiceAbbrevExists) {
			return http.StatusConflict, ErrServiceAbbrevExists
		}
		return http.StatusInternalServerError, ErrServiceInternalError
	}

	svc.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "service",
		ResourceID:   s.ID,
		ResourceName: s.Abbrev,
		Action:       "update",
		Changes:      diffService(&before, s),
	})

	resp.Service = toResponse(s)
	return http.StatusOK, nil
}

func (svc *Service) DeleteService(ctx context.Context, req *dto.DeleteServiceRequest) (int, error) {
	existing, err := svc.repo.FindByID(ctx, req.ID)
	if err != nil {
		if errors.Is(err, ErrServiceNotFound) {
			return http.StatusNotFound, ErrServiceNotFound
		}
		return http.StatusInternalServerError, ErrServiceInternalError
	}

	if err := svc.repo.Delete(ctx, req.ID); err != nil {
		return http.StatusInternalServerError, ErrServiceInternalError
	}

	svc.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "service",
		ResourceID:   existing.ID,
		ResourceName: existing.Abbrev,
		Action:       "delete",
	})

	return http.StatusNoContent, nil
}

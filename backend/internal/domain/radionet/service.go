package radionet

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"backend/internal/domain/radionet/dto"
	"backend/internal/shared/contracts"

	"github.com/google/uuid"
)

type Service struct {
	repo  Repository
	audit contracts.AuditRecorder
	usage contracts.NetUsage
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetAudit(a contracts.AuditRecorder) { s.audit = a }

// SetNetUsage wires the PACE domain so a delete can refuse to strip a net off a
// wheel that is in use.
func (s *Service) SetNetUsage(u contracts.NetUsage) { s.usage = u }

// CountNetsInSection satisfies contracts.NetSectionCounter: a section delete
// asks it first, and refuses while the squadron still has nets.
func (s *Service) CountNetsInSection(ctx context.Context, section string) (int, error) {
	return s.repo.CountBySection(ctx, section)
}

func (s *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, in)
}

func (s *Service) ListNets(ctx context.Context, req *dto.ListNetsRequest, resp *dto.ListNetsResponse) (int, error) {
	section := strings.TrimSpace(req.Section)

	exists, err := s.repo.SectionExists(ctx, section)
	if err != nil {
		return http.StatusInternalServerError, ErrNetInternalError
	}
	if !exists {
		return http.StatusNotFound, ErrSectionNotFound
	}

	items, err := s.repo.FindBySection(ctx, section)
	if err != nil {
		return http.StatusInternalServerError, ErrNetInternalError
	}
	resp.Nets = toNetResponseList(items)
	resp.Total = len(resp.Nets)
	return http.StatusOK, nil
}

func (s *Service) CreateNet(ctx context.Context, req *dto.CreateNetRequest, resp *dto.CreateNetResponse) (int, error) {
	section := strings.TrimSpace(req.Section)
	name := strings.TrimSpace(req.Name)

	exists, err := s.repo.SectionExists(ctx, section)
	if err != nil {
		return http.StatusInternalServerError, ErrNetInternalError
	}
	if !exists {
		return http.StatusNotFound, ErrSectionNotFound
	}

	unit := strings.TrimSpace(req.FreqUnit)
	if unit == "" {
		unit = FreqUnitMHz
	}
	if !IsValidFreqUnit(unit) {
		return http.StatusBadRequest, ErrInvalidFreqUnit
	}

	radioType := strings.TrimSpace(req.RadioType)
	if radioType == "" {
		radioType = RadioTypeBoth
	}
	if !IsValidRadioType(radioType) {
		return http.StatusBadRequest, ErrInvalidRadioType
	}

	// Unique per squadron, not globally: two squadrons may each run a FIRES.
	taken, err := s.repo.NameExists(ctx, section, name)
	if err != nil {
		return http.StatusInternalServerError, ErrNetInternalError
	}
	if taken {
		return http.StatusConflict, ErrNetNameExists
	}

	now := time.Now().UTC()
	n := &Net{
		ID:          uuid.New().String(),
		Section:     section,
		Name:        name,
		NetID:       strings.TrimSpace(req.NetID),
		RadioType:   radioType,
		TxFreq:      strings.TrimSpace(req.TxFreq),
		RxFreq:      strings.TrimSpace(req.RxFreq),
		FreqUnit:    unit,
		ROIP:        req.ROIP,
		Description: strings.TrimSpace(req.Description),
		Notes:       strings.TrimSpace(req.Notes),
		CreatedBy:   req.CreatedBy,
		UpdatedBy:   req.UpdatedBy,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := s.repo.Create(ctx, n); err != nil {
		if errors.Is(err, ErrNetNameExists) {
			return http.StatusConflict, ErrNetNameExists
		}
		return http.StatusInternalServerError, ErrNetInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.CreatedBy,
		ResourceType: "net",
		ResourceID:   n.ID,
		ResourceName: n.Name,
		Action:       "create",
	})

	resp.Net = toNetResponse(n)
	return http.StatusCreated, nil
}

func (s *Service) UpdateNet(ctx context.Context, req *dto.UpdateNetRequest, resp *dto.UpdateNetResponse) (int, error) {
	existing, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if errors.Is(err, ErrNetNotFound) {
			return http.StatusNotFound, ErrNetNotFound
		}
		return http.StatusInternalServerError, ErrNetInternalError
	}

	before := *existing
	n := existing

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		taken, err := s.repo.NameExistsExcluding(ctx, existing.Section, name, req.ID)
		if err != nil {
			return http.StatusInternalServerError, ErrNetInternalError
		}
		if taken {
			return http.StatusConflict, ErrNetNameExists
		}
		n.Name = name
	}
	if req.NetID != nil {
		n.NetID = strings.TrimSpace(*req.NetID)
	}
	if req.RadioType != nil {
		radioType := strings.TrimSpace(*req.RadioType)
		if !IsValidRadioType(radioType) {
			return http.StatusBadRequest, ErrInvalidRadioType
		}
		n.RadioType = radioType
	}
	if req.TxFreq != nil {
		n.TxFreq = strings.TrimSpace(*req.TxFreq)
	}
	if req.RxFreq != nil {
		n.RxFreq = strings.TrimSpace(*req.RxFreq)
	}
	if req.FreqUnit != nil {
		unit := strings.TrimSpace(*req.FreqUnit)
		if !IsValidFreqUnit(unit) {
			return http.StatusBadRequest, ErrInvalidFreqUnit
		}
		n.FreqUnit = unit
	}
	if req.ROIP != nil {
		n.ROIP = *req.ROIP
	}
	if req.Description != nil {
		n.Description = strings.TrimSpace(*req.Description)
	}
	if req.Notes != nil {
		n.Notes = strings.TrimSpace(*req.Notes)
	}

	n.UpdatedBy = req.UpdatedBy
	n.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, n); err != nil {
		if errors.Is(err, ErrNetNameExists) {
			return http.StatusConflict, ErrNetNameExists
		}
		return http.StatusInternalServerError, ErrNetInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "net",
		ResourceID:   n.ID,
		ResourceName: n.Name,
		Action:       "update",
		Changes:      diffNet(&before, n),
	})

	resp.Net = toNetResponse(n)
	return http.StatusOK, nil
}

func (s *Service) DeleteNet(ctx context.Context, req *dto.DeleteNetRequest) (int, error) {
	existing, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if errors.Is(err, ErrNetNotFound) {
			return http.StatusNotFound, ErrNetNotFound
		}
		return http.StatusInternalServerError, ErrNetInternalError
	}

	// A net sitting on a wheel must not vanish out from under a printed comms
	// card. The FK is ON DELETE RESTRICT so the database refuses regardless;
	// this check exists to return a useful message naming the wheels.
	if s.usage != nil {
		count, err := s.usage.CountAssignmentsForNet(ctx, req.ID)
		if err != nil {
			return http.StatusInternalServerError, ErrNetInternalError
		}
		if count > 0 {
			plans, err := s.usage.PlansUsingNet(ctx, req.ID)
			if err != nil {
				// The count already told us it is in use; a failure to name the
				// wheels must not downgrade that into a successful delete.
				plans = nil
			}
			return http.StatusConflict, ErrNetInUse(plans)
		}
	}

	if err := s.repo.Delete(ctx, req.ID); err != nil {
		return http.StatusInternalServerError, ErrNetInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "net",
		ResourceID:   existing.ID,
		ResourceName: existing.Name,
		Action:       "delete",
	})

	return http.StatusNoContent, nil
}

// NetsByIDs satisfies contracts.NetLookup so the PACE domain can validate a
// channel assignment without importing this package.
func (s *Service) NetsByIDs(ctx context.Context, ids []string) (map[string]contracts.NetInfo, error) {
	raw, err := s.repo.InfoByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make(map[string]contracts.NetInfo, len(raw))
	for id, info := range raw {
		out[id] = contracts.NetInfo{Section: info.Section, RadioType: info.RadioType}
	}
	return out, nil
}

package kit

import (
	"context"
	"net/http"
	"time"

	"backend/internal/domain/kit/dto"
	"backend/internal/shared/contracts"
	"backend/internal/shared/csvtable"
	"backend/internal/shared/response"

	"github.com/google/uuid"
)

const defaultLimit = 50

type Service struct {
	repo          Repository
	sectionLister contracts.SectionLister
	audit         contracts.AuditRecorder
}

func NewService(repo Repository, sectionLister contracts.SectionLister) *Service {
	return &Service{repo: repo, sectionLister: sectionLister}
}

// SetAudit injects the audit sink. Setter injection because audit.Service
// is constructed after the kit service in main.go and we want to keep the
// constructor signatures stable. Audit is best-effort so the service
// nil-checks every call site.
func (s *Service) SetAudit(a contracts.AuditRecorder) {
	s.audit = a
}

func (s *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, in)
}

// CountKitsInSection implements contracts.KitSectionReassigner. Used by
// the section domain to check whether a section can be safely deleted.
func (s *Service) CountKitsInSection(ctx context.Context, section string) (int, error) {
	return s.repo.CountBySection(ctx, section)
}

// ReassignKitsToSection implements contracts.KitSectionReassigner. Moves
// all kits from `from` to `to` (empty string = NULL). Returns row count.
func (s *Service) ReassignKitsToSection(ctx context.Context, from, to string) (int, error) {
	return s.repo.ReassignSection(ctx, from, to)
}

func (s *Service) CreateKit(ctx context.Context, req *dto.CreateKitRequest, resp *dto.CreateKitResponse) (int, error) {
	status := req.Status
	if status == "" {
		status = StatusAvailable
	}

	now := time.Now().UTC()
	k := &Kit{
		ID:         uuid.New().String(),
		Name:       req.Name,
		Type:       req.Type,
		Status:     status,
		Black:      req.Black,
		Secret:      req.Secret,
		TopSecret:       req.TopSecret,
		Section:    req.Section,
		Owner:      req.Owner,
		OwnerEmail: req.OwnerEmail,
		OwnerPhone: req.OwnerPhone,
		Location:   req.Location,
		Notes:      req.Notes,
		UpdatedBy:  req.UpdatedBy,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	if err := s.repo.Create(ctx, k); err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, coded
		}
		return http.StatusInternalServerError, ErrKitInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "kit",
		ResourceID:   k.ID,
		ResourceName: k.Name,
		Action:       "create",
	})

	resp.Kit = toKitResponse(k)
	return http.StatusCreated, nil
}

func (s *Service) GetKit(ctx context.Context, req *dto.GetKitRequest, resp *dto.GetKitResponse) (int, error) {
	k, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrKitInternalError
	}

	resp.Kit = toKitResponse(k)
	return http.StatusOK, nil
}

func (s *Service) ListKits(ctx context.Context, req *dto.ListKitsRequest, resp *dto.ListKitsResponse) (int, error) {
	page := req.Page
	if page < 1 {
		page = 1
	}
	limit := req.Limit
	if limit < 0 {
		limit = defaultLimit
	}
	// limit == 0 means "return all rows" - pass through to the repository.

	kits, total, statusCounts, err := s.repo.FindAll(ctx, req.Types, req.Sections, req.Search, page, limit)
	if err != nil {
		return http.StatusInternalServerError, ErrKitInternalError
	}

	var totalPages int
	if limit == 0 {
		totalPages = 1
	} else {
		totalPages = total / limit
		if total%limit != 0 {
			totalPages++
		}
		if totalPages < 1 {
			totalPages = 1
		}
	}

	resp.Kits = toKitResponseList(kits)
	resp.Total = total
	resp.Page = page
	resp.TotalPages = totalPages
	resp.StatusCounts = statusCounts
	return http.StatusOK, nil
}

func (s *Service) UpdateKit(ctx context.Context, req *dto.UpdateKitRequest, resp *dto.UpdateKitResponse) (int, error) {
	k, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrKitInternalError
	}

	// Snapshot the old values so we can diff post-update for audit.
	old := *k

	if req.Name != nil {
		k.Name = *req.Name
	}
	if req.Type != nil {
		k.Type = *req.Type
	}
	if req.Status != nil {
		k.Status = *req.Status
	}
	if req.Black != nil {
		k.Black = *req.Black
	}
	if req.Secret != nil {
		k.Secret = *req.Secret
	}
	if req.TopSecret != nil {
		k.TopSecret = *req.TopSecret
	}
	if req.Section != nil {
		k.Section = *req.Section
	}
	if req.Owner != nil {
		k.Owner = req.Owner
	}
	if req.OwnerEmail != nil {
		k.OwnerEmail = req.OwnerEmail
	}
	if req.OwnerPhone != nil {
		k.OwnerPhone = req.OwnerPhone
	}
	if req.Location != nil {
		k.Location = *req.Location
	}
	if req.Notes != nil {
		k.Notes = *req.Notes
	}
	k.UpdatedBy = req.UpdatedBy
	k.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, k); err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrKitInternalError
	}

	if changes := diffKit(&old, k); len(changes) > 0 {
		s.recordAudit(ctx, contracts.AuditEventInput{
			ActorID:      req.ActorID,
			ActorName:    req.UpdatedBy,
			ResourceType: "kit",
			ResourceID:   k.ID,
			ResourceName: k.Name,
			Action:       "update",
			Changes:      changes,
		})
	}

	resp.Kit = toKitResponse(k)
	return http.StatusOK, nil
}

func (s *Service) DeleteKit(ctx context.Context, req *dto.DeleteKitRequest) (int, error) {
	// Look up the kit before deleting so the audit row can carry its name.
	// Best-effort: if the lookup fails we still attempt the delete and
	// fall back to a nameless audit row.
	resourceName := ""
	if k, err := s.repo.FindByID(ctx, req.ID); err == nil && k != nil {
		resourceName = k.Name
	}

	if err := s.repo.Delete(ctx, req.ID); err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrKitInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.ActorName,
		ResourceType: "kit",
		ResourceID:   req.ID,
		ResourceName: resourceName,
		Action:       "delete",
	})

	return http.StatusNoContent, nil
}

// ExportableColumns is the full set of column keys the CSV export supports, in
// canonical output order. Derived from csvTable so it cannot drift from what the
// exporter actually emits.
var ExportableColumns = csvTable.Keys()

// ExportFilter narrows an export. An empty field means "no filter on that
// dimension"; values are not validated, so an unknown section, status or type
// reaches SQL and matches nothing.
//
// Named fields rather than a row of []string parameters - see the identical
// type in the terminal service for why.
type ExportFilter struct {
	Sections []string
	Statuses []string
	Types    []string
}

// ExportKits returns a CSV body filtered by the given filter. Output order
// follows the table, not the caller.
func (s *Service) ExportKits(ctx context.Context, f ExportFilter, columns []string) (string, error) {
	bound, err := s.bindCSV(ctx)
	if err != nil {
		return "", ErrKitInternalError
	}
	kits, err := s.repo.FindForExport(ctx, f)
	if err != nil {
		return "", ErrKitInternalError
	}
	return bound.Export(kits, columns)
}

// GetImportTemplate returns the section-aware import template. columns selects
// which of them it carries; empty means all. Required columns are always present.
func (s *Service) GetImportTemplate(ctx context.Context, columns []string) (string, error) {
	bound, err := s.bindCSV(ctx)
	if err != nil {
		return "", err
	}
	return bound.Template(columns)
}

func (s *Service) ImportKits(ctx context.Context, req *dto.ImportKitsRequest, resp *dto.ImportKitsResponse) (int, error) {
	bound, err := s.bindCSV(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrKitInternalError
	}

	existingNames, err := s.repo.FindAllNames(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrKitInternalError
	}

	parsed, err := bound.Parse(req.CSV, existingNames)
	if err != nil {
		return response.StatusFromError(err), err
	}

	now := time.Now().UTC()
	for _, k := range parsed.Rows {
		k.ID = uuid.New().String()
		k.UpdatedBy = req.UpdatedBy
		k.CreatedAt = now
		k.UpdatedAt = now
	}

	if len(parsed.Rows) > 0 {
		if err := s.repo.BulkCreate(ctx, parsed.Rows); err != nil {
			return http.StatusInternalServerError, ErrKitInternalError
		}

		// One audit row per imported kit so resource-level history stays coherent
		// with manual creates.
		for _, k := range parsed.Rows {
			s.recordAudit(ctx, contracts.AuditEventInput{
				ActorID:      req.ActorID,
				ActorName:    req.UpdatedBy,
				ResourceType: "kit",
				ResourceID:   k.ID,
				ResourceName: k.Name,
				Action:       "create",
				Changes:      map[string]any{"via": "import"},
			})
		}
	}

	resp.Imported = len(parsed.Rows)
	resp.Errors = make([]dto.ImportRowError, 0, len(parsed.Errors))
	for _, re := range parsed.Errors {
		resp.Errors = append(resp.Errors, dto.ImportRowError{Row: re.Row, Name: re.Name, Errors: re.Errors})
	}
	resp.Message = csvtable.ImportMessage(csvTable.Noun, csvTable.NounPlural, len(parsed.Rows), len(parsed.Errors))

	return csvtable.ImportStatus(len(parsed.Rows), len(parsed.Errors)), nil
}

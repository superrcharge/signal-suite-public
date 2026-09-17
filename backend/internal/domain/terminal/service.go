package terminal

import (
	"context"
	"net/http"
	"strings"
	"time"

	"backend/internal/domain/terminal/dto"
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
// is constructed after the terminal service in main.go and we want to
// keep the constructor signatures stable. Audit is best-effort so the
// service nil-checks every call site.
func (s *Service) SetAudit(a contracts.AuditRecorder) {
	s.audit = a
}

func (s *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, in)
}

// canonicalTag registers a saved tag in the catalog and returns the spelling
// the catalog uses, so exactly one casing exists per tag across the whole app.
// Nil and whitespace-only tags never reach the catalog; they clear the column.
//
// The catalog write is best-effort, deliberately: on failure this returns the
// value the user typed and the terminal saves normally. The terminal row is
// what the user asked to change, while the catalog is a management list and a
// filter index, so failing the save to protect the catalog would trade a real
// loss for a cosmetic one. Same reasoning as recordAudit above.
func (s *Service) canonicalTag(ctx context.Context, tag *string) *string {
	normalized := normalizeTag(tag)
	if normalized == nil {
		return nil
	}
	canonical, err := s.repo.CanonicalizeTags(ctx, []string{*normalized})
	if err != nil {
		return normalized
	}
	if name, ok := canonical[strings.ToLower(*normalized)]; ok {
		return &name
	}
	return normalized
}

// canonicalizeRowTags rewrites a batch of terminals to the catalog's spelling
// in one round trip. Import calls this rather than canonicalTag per row, which
// would be one query per line of the CSV.
func (s *Service) canonicalizeRowTags(ctx context.Context, rows []*Terminal) {
	names := make([]string, 0, len(rows))
	for _, t := range rows {
		t.Tag = normalizeTag(t.Tag)
		if t.Tag != nil {
			names = append(names, *t.Tag)
		}
	}
	if len(names) == 0 {
		return
	}
	canonical, err := s.repo.CanonicalizeTags(ctx, names)
	if err != nil {
		return
	}
	for _, t := range rows {
		if t.Tag == nil {
			continue
		}
		if name, ok := canonical[strings.ToLower(*t.Tag)]; ok {
			t.Tag = &name
		}
	}
}

// isStarshield reports whether the model is a Starshield variant (mini/hp) -
// the only family that can carry a PoP pin.
func isStarshield(model *string) bool {
	return model != nil && (*model == ModelMini || *model == ModelHP)
}

// CountTerminalsInSection implements contracts.TerminalSectionReassigner.
// Used by the section domain to check whether a section can be safely deleted.
func (s *Service) CountTerminalsInSection(ctx context.Context, section string) (int, error) {
	return s.repo.CountBySection(ctx, section)
}

// ReassignTerminalsToSection implements contracts.TerminalSectionReassigner.
// Moves all terminals from `from` to `to` (empty string = NULL). Returns row count.
func (s *Service) ReassignTerminalsToSection(ctx context.Context, from, to string) (int, error) {
	return s.repo.ReassignSection(ctx, from, to)
}

func (s *Service) CreateTerminal(ctx context.Context, req *dto.CreateTerminalRequest, resp *dto.CreateTerminalResponse) (int, error) {
	status := req.Status
	if status == "" {
		status = StatusAvailable
	}

	now := time.Now().UTC()
	t := &Terminal{
		ID:         uuid.New().String(),
		Name:       req.Name,
		Model:      req.Model,
		Kit:        req.Kit,
		Pim:        req.Pim,
		Serial:     req.Serial,
		Section:    req.Section,
		Status:     status,
		Owner:      req.Owner,
		OwnerEmail: req.OwnerEmail,
		OwnerPhone: req.OwnerPhone,
		PopPin:     normalizePopPin(req.PopPin),
		Notes:      req.Notes,
		Tag:        s.canonicalTag(ctx, req.Tag),
		UpdatedBy:  req.UpdatedBy,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	// PoP pins only apply to Starshield terminals.
	if !isStarshield(t.Model) {
		t.PopPin = nil
	}

	if err := s.repo.Create(ctx, t); err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, coded
		}
		return http.StatusInternalServerError, ErrTerminalInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "terminal",
		ResourceID:   t.ID,
		ResourceName: t.Name,
		Action:       "create",
	})

	resp.Terminal = toTerminalResponse(t)
	return http.StatusCreated, nil
}

func (s *Service) GetTerminal(ctx context.Context, req *dto.GetTerminalRequest, resp *dto.GetTerminalResponse) (int, error) {
	t, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrTerminalInternalError
	}

	resp.Terminal = toTerminalResponse(t)
	return http.StatusOK, nil
}

// ListTags returns the distinct tag strings currently in use,
// alphabetically sorted. Powers the tag filter chip set in the UI.
func (s *Service) ListTags(ctx context.Context) ([]string, error) {
	return s.repo.FindAllTags(ctx)
}

// ListTagCatalog returns every tag catalog entry, each carrying the number of
// terminals using it. Used by the Settings panel for tag management.
func (s *Service) ListTagCatalog(ctx context.Context) ([]*TagEntry, error) {
	entries, err := s.repo.ListTagCatalog(ctx)
	if err != nil {
		return nil, ErrTerminalInternalError
	}
	if entries == nil {
		entries = []*TagEntry{}
	}
	return entries, nil
}

// CreateTagEntry adds a new named tag to the catalog.
func (s *Service) CreateTagEntry(ctx context.Context, name string) (*TagEntry, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, &Error{Code: "TAG_NAME_REQUIRED", Message: "tag name is required", Status: http.StatusBadRequest}
	}
	entry, err := s.repo.CreateTagEntry(ctx, name)
	if err != nil {
		if coded, ok := err.(*Error); ok {
			return nil, coded
		}
		return nil, ErrTerminalInternalError
	}
	return entry, nil
}

// DeleteTagEntry removes a tag from the catalog and clears it from every
// terminal carrying it, so the filter buttons stay accurate.
//
// Each cleared terminal gets its own audit event, in the same shape
// diffTerminal produces for a drawer edit, so the audit log renders the two
// identically. Without this the bulk path was the one way to change terminal
// data and leave no trace: thirty drawer edits wrote thirty events, and one
// delete that touched the same thirty terminals wrote none.
func (s *Service) DeleteTagEntry(ctx context.Context, name, actorID, actorName string) error {
	cleared, err := s.repo.ClearTagFromTerminals(ctx, name)
	if err != nil {
		return ErrTerminalInternalError
	}
	if err := s.repo.DeleteTagEntry(ctx, name); err != nil {
		// ErrTagNotFound is a real answer about the request, not an internal
		// fault, so it travels to the handler as the 404 it is.
		if coded, ok := err.(*Error); ok {
			return coded
		}
		return ErrTerminalInternalError
	}
	for _, c := range cleared {
		s.recordAudit(ctx, contracts.AuditEventInput{
			ActorID:      actorID,
			ActorName:    actorName,
			ResourceType: "terminal",
			ResourceID:   c.ID,
			ResourceName: c.Name,
			Action:       "update",
			Changes:      map[string]any{"tag": map[string]any{"old": c.Tag, "new": ""}},
		})
	}
	return nil
}

func (s *Service) ListTerminals(ctx context.Context, req *dto.ListTerminalsRequest, resp *dto.ListTerminalsResponse) (int, error) {
	page := req.Page
	if page < 1 {
		page = 1
	}
	limit := req.Limit
	if limit < 0 {
		limit = defaultLimit
	}
	// limit == 0 means "return all rows" - pass through to the repository.

	terminals, total, statusCounts, err := s.repo.FindAll(ctx, req.Sections, req.Models, req.Search, req.Tag, page, limit)
	if err != nil {
		return http.StatusInternalServerError, ErrTerminalInternalError
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

	resp.Terminals = toTerminalResponseList(terminals)
	resp.Total = total
	resp.Page = page
	resp.TotalPages = totalPages
	resp.StatusCounts = statusCounts
	return http.StatusOK, nil
}

func (s *Service) UpdateTerminal(ctx context.Context, req *dto.UpdateTerminalRequest, resp *dto.UpdateTerminalResponse) (int, error) {
	t, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrTerminalInternalError
	}

	// Snapshot the old values so we can diff post-update for audit.
	old := *t

	if req.Name != nil {
		t.Name = *req.Name
	}
	if req.Model != nil {
		t.Model = req.Model
	}
	if req.Kit != nil {
		t.Kit = *req.Kit
	}
	if req.Pim != nil {
		t.Pim = *req.Pim
	}
	if req.Serial != nil {
		t.Serial = *req.Serial
	}
	if req.Section != nil {
		t.Section = *req.Section
	}
	if req.Status != nil {
		t.Status = *req.Status
	}
	if req.Owner != nil {
		t.Owner = req.Owner
	}
	if req.OwnerEmail != nil {
		t.OwnerEmail = req.OwnerEmail
	}
	if req.OwnerPhone != nil {
		t.OwnerPhone = req.OwnerPhone
	}
	if req.Notes != nil {
		t.Notes = *req.Notes
	}
	if req.PopPin != nil {
		t.PopPin = normalizePopPin(req.PopPin)
	}
	if req.Tag != nil {
		// Canonicalized before diffTerminal runs, so a save that only changes
		// casing produces no diff entry and an audited change records the
		// spelling that actually reached the column.
		t.Tag = s.canonicalTag(ctx, req.Tag)
	}
	// PoP pins only apply to Starshield terminals. Runs after the pointer
	// applies (and before diffTerminal) so a model change away from mini/hp
	// clears a stale pin - including single-field inline model edits - and
	// the clear is captured in the audit diff.
	if !isStarshield(t.Model) {
		t.PopPin = nil
	}
	t.UpdatedBy = req.UpdatedBy
	t.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, t); err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrTerminalInternalError
	}

	if changes := diffTerminal(&old, t); len(changes) > 0 {
		s.recordAudit(ctx, contracts.AuditEventInput{
			ActorID:      req.ActorID,
			ActorName:    req.UpdatedBy,
			ResourceType: "terminal",
			ResourceID:   t.ID,
			ResourceName: t.Name,
			Action:       "update",
			Changes:      changes,
		})
	}

	resp.Terminal = toTerminalResponse(t)
	return http.StatusOK, nil
}

func (s *Service) DeleteTerminal(ctx context.Context, req *dto.DeleteTerminalRequest) (int, error) {
	// Look up the terminal before deleting so the audit row can carry
	// its name. Best-effort: if the lookup fails we still attempt the
	// delete and fall back to a nameless audit row.
	resourceName := ""
	if t, err := s.repo.FindByID(ctx, req.ID); err == nil && t != nil {
		resourceName = t.Name
	}

	if err := s.repo.Delete(ctx, req.ID); err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrTerminalInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.ActorName,
		ResourceType: "terminal",
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
// dimension"; values are not validated, so an unknown section, status or model
// reaches SQL and matches nothing.
//
// Named fields rather than a row of []string parameters. Three same-typed
// slices next to a columns slice is a call site where two arguments can be
// transposed with no compiler complaint - the same class of silent wrongness
// the placeholder counter in FindForExport used to allow.
type ExportFilter struct {
	Sections []string
	Statuses []string
	Models   []string
}

// ExportTerminals returns a CSV body filtered by the given filter. columns must
// be a subset of ExportableColumns; empty defaults to all. Output order follows
// the table, not the caller, so exports are stable across calls.
func (s *Service) ExportTerminals(ctx context.Context, f ExportFilter, columns []string) (string, error) {
	bound, err := s.bindCSV(ctx)
	if err != nil {
		return "", ErrTerminalInternalError
	}
	terminals, err := s.repo.FindForExport(ctx, f)
	if err != nil {
		return "", ErrTerminalInternalError
	}
	return bound.Export(terminals, columns)
}

// GetImportTemplate returns the section-aware import template. columns selects
// which of them the template carries; empty means all of them. Required columns
// are always present whatever the caller asked for - see csvtable.Bound.Template.
func (s *Service) GetImportTemplate(ctx context.Context, columns []string) (string, error) {
	bound, err := s.bindCSV(ctx)
	if err != nil {
		return "", err
	}
	return bound.Template(columns)
}

func (s *Service) ImportTerminals(ctx context.Context, req *dto.ImportTerminalsRequest, resp *dto.ImportTerminalsResponse) (int, error) {
	bound, err := s.bindCSV(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrTerminalInternalError
	}

	existingNames, err := s.repo.FindAllNames(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrTerminalInternalError
	}

	parsed, err := bound.Parse(req.CSV, existingNames)
	if err != nil {
		return response.StatusFromError(err), err
	}

	// Fields the file has no business supplying. Parse builds the record from the
	// user's cells; identity and provenance are stamped here.
	now := time.Now().UTC()
	for _, t := range parsed.Rows {
		t.ID = uuid.New().String()
		t.UpdatedBy = req.UpdatedBy
		t.CreatedAt = now
		t.UpdatedAt = now
	}

	// The CSV path never called normalizeTag - csvtable only trims cells - so
	// this is where an imported tag is trimmed, registered and collapsed onto
	// the catalog's casing. Before BulkCreate, so the canonical value is what
	// gets written rather than something a later save has to repair.
	s.canonicalizeRowTags(ctx, parsed.Rows)

	if len(parsed.Rows) > 0 {
		if err := s.repo.BulkCreate(ctx, parsed.Rows); err != nil {
			return http.StatusInternalServerError, ErrTerminalInternalError
		}

		// One audit row per imported terminal so resource-level history stays
		// coherent with manual creates. Marked action=create with a via: "import"
		// hint in changes for filtering.
		for _, t := range parsed.Rows {
			s.recordAudit(ctx, contracts.AuditEventInput{
				ActorID:      req.ActorID,
				ActorName:    req.UpdatedBy,
				ResourceType: "terminal",
				ResourceID:   t.ID,
				ResourceName: t.Name,
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

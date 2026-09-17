package contract

import (
	"context"
	"net/http"
	"time"

	"backend/internal/domain/contract/dto"
	"backend/internal/shared/contracts"

	"github.com/google/uuid"
)

const defaultLimit = 30

const dateFmt = "2006-01-02"

func toContractResponse(c *Contract) dto.ContractResponse {
	r := dto.ContractResponse{
		ID:               c.ID,
		Title:            c.Title,
		Company:          c.Company,
		POCName:          c.POCName,
		POCEmail:         c.POCEmail,
		POCPhone:         c.POCPhone,
		ExecutionQuarter: c.ExecutionQuarter,
		FiscalYear:       c.FiscalYear,
		Notes:            c.Notes,
		LogformNumber:    c.LogformNumber,
		LogformURL:       c.LogformURL,
		UpdatedBy:        c.UpdatedBy,
		CreatedAt:        c.CreatedAt.Format(dateFmt),
		UpdatedAt:        c.UpdatedAt.Format(dateFmt),
	}
	if c.POPStart != nil {
		s := c.POPStart.Format(dateFmt)
		r.POPStart = &s
	}
	if c.POPEnd != nil {
		s := c.POPEnd.Format(dateFmt)
		r.POPEnd = &s
	}
	return r
}

type Service struct {
	repo  Repository
	audit contracts.AuditRecorder
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetAudit(a contracts.AuditRecorder) {
	s.audit = a
}

func (s *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, in)
}

func (s *Service) CreateContract(ctx context.Context, req *dto.CreateContractRequest, resp *dto.CreateContractResponse) (int, error) {
	popStart, err := parseDate(req.POPStart)
	if err != nil {
		return http.StatusBadRequest, &Error{Code: "CONTRACT_INVALID_DATE", Message: "pop_start must be in YYYY-MM-DD format", Status: http.StatusBadRequest}
	}
	popEnd, err := parseDate(req.POPEnd)
	if err != nil {
		return http.StatusBadRequest, &Error{Code: "CONTRACT_INVALID_DATE", Message: "pop_end must be in YYYY-MM-DD format", Status: http.StatusBadRequest}
	}

	now := time.Now().UTC()
	c := &Contract{
		ID:               uuid.New().String(),
		Title:            req.Title,
		Company:          req.Company,
		POCName:          req.POCName,
		POCEmail:         req.POCEmail,
		POCPhone:         req.POCPhone,
		POPStart:         popStart,
		POPEnd:           popEnd,
		ExecutionQuarter: req.ExecutionQuarter,
		FiscalYear:       req.FiscalYear,
		Notes:            req.Notes,
		LogformNumber:    req.LogformNumber,
		LogformURL:       req.LogformURL,
		UpdatedBy:        req.UpdatedBy,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if err := s.repo.Create(ctx, c); err != nil {
		return http.StatusInternalServerError, ErrContractInternalError
	}

	resp.Contract = toContractResponse(c)

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "contract",
		ResourceID:   c.ID,
		ResourceName: c.Title,
		Action:       "create",
	})

	return http.StatusCreated, nil
}

func (s *Service) GetContract(ctx context.Context, req *dto.GetContractRequest, resp *dto.GetContractResponse) (int, error) {
	c, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if err == ErrContractNotFound {
			return http.StatusNotFound, ErrContractNotFound
		}
		return http.StatusInternalServerError, ErrContractInternalError
	}
	resp.Contract = toContractResponse(c)
	return http.StatusOK, nil
}

func (s *Service) ListContracts(ctx context.Context, req *dto.ListContractsRequest, resp *dto.ListContractsResponse) (int, error) {
	page := req.Page
	if page < 1 {
		page = 1
	}
	limit := req.Limit
	if limit < 1 {
		limit = defaultLimit
	}

	cs, total, counts, err := s.repo.FindAll(ctx, req.FiscalYear, req.Search, page, limit, req.SortBy, req.SortDir)
	if err != nil {
		return http.StatusInternalServerError, ErrContractInternalError
	}

	totalPages := (total + limit - 1) / limit
	if totalPages < 1 {
		totalPages = 1
	}

	items := make([]dto.ContractResponse, 0, len(cs))
	for _, c := range cs {
		items = append(items, toContractResponse(c))
	}

	resp.Contracts = items
	resp.Total = total
	resp.Page = page
	resp.TotalPages = totalPages
	resp.Counts = dto.ContractCountsResponse{
		Total:      counts.Total,
		Expiring30: counts.Expiring30,
		Expiring60: counts.Expiring60,
		Expiring90: counts.Expiring90,
	}
	return http.StatusOK, nil
}

// diffContract reports changed fields in the {field: {old, new}} shape the audit
// log expects. UpdatedBy and UpdatedAt are skipped: they change on every write
// and would drown the real diff.
//
// Before this existed, contract updates recorded an event with no Changes at
// all, so the log said someone edited a contract without saying what - on the
// one domain where the edited values are POP dates, vendor and funding quarter,
// which is the whole reason to keep a history.
func diffContract(old, updated *Contract) map[string]any {
	changes := map[string]any{}

	addStr := func(field, before, after string) {
		if before != after {
			changes[field] = map[string]any{"old": before, "new": after}
		}
	}

	// A nil pointer and a pointer to "" are different in the column (NULL vs
	// empty string) but identical to a reader, so both render as empty. The
	// alternative is a diff entry reporting a change nobody made.
	addPtr := func(field string, before, after *string) {
		b, a := "", ""
		if before != nil {
			b = *before
		}
		if after != nil {
			a = *after
		}
		addStr(field, b, a)
	}

	// Date only, not RFC3339. POP boundaries are day-granular, and a full
	// timestamp makes a one-day move unreadable in a single-line diff.
	addDate := func(field string, before, after *time.Time) {
		b, a := "", ""
		if before != nil {
			b = before.Format("2006-01-02")
		}
		if after != nil {
			a = after.Format("2006-01-02")
		}
		addStr(field, b, a)
	}

	addStr("title", old.Title, updated.Title)
	addStr("company", old.Company, updated.Company)
	addPtr("poc_name", old.POCName, updated.POCName)
	addPtr("poc_email", old.POCEmail, updated.POCEmail)
	addPtr("poc_phone", old.POCPhone, updated.POCPhone)
	addDate("pop_start", old.POPStart, updated.POPStart)
	addDate("pop_end", old.POPEnd, updated.POPEnd)
	addPtr("execution_quarter", old.ExecutionQuarter, updated.ExecutionQuarter)
	addStr("fiscal_year", old.FiscalYear, updated.FiscalYear)
	addStr("notes", old.Notes, updated.Notes)
	addPtr("logform_number", old.LogformNumber, updated.LogformNumber)
	addPtr("logform_url", old.LogformURL, updated.LogformURL)

	return changes
}

func (s *Service) UpdateContract(ctx context.Context, req *dto.UpdateContractRequest, resp *dto.UpdateContractResponse) (int, error) {
	c, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if err == ErrContractNotFound {
			return http.StatusNotFound, ErrContractNotFound
		}
		return http.StatusInternalServerError, ErrContractInternalError
	}

	// Copied before any field is touched: c is a pointer into the repo result and
	// every branch below mutates it in place, so a diff taken afterwards would
	// compare the row to itself and report no changes.
	before := *c

	if req.Title != nil {
		c.Title = *req.Title
	}
	if req.Company != nil {
		c.Company = *req.Company
	}
	if req.POCName != nil {
		c.POCName = req.POCName
	}
	if req.POCEmail != nil {
		c.POCEmail = req.POCEmail
	}
	if req.POCPhone != nil {
		c.POCPhone = req.POCPhone
	}
	if req.FiscalYear != nil {
		c.FiscalYear = *req.FiscalYear
	}
	if req.Notes != nil {
		c.Notes = *req.Notes
	}
	if req.LogformNumber != nil {
		c.LogformNumber = req.LogformNumber
	}
	if req.LogformURL != nil {
		c.LogformURL = req.LogformURL
	}
	if req.ExecutionQuarter != nil {
		if *req.ExecutionQuarter == "" {
			c.ExecutionQuarter = nil
		} else {
			c.ExecutionQuarter = req.ExecutionQuarter
		}
	}

	// Date fields: explicit empty string = clear; non-nil string = set; nil = unchanged.
	if req.POPStart != nil {
		popStart, err := parseDate(req.POPStart)
		if err != nil {
			return http.StatusBadRequest, &Error{Code: "CONTRACT_INVALID_DATE", Message: "pop_start must be in YYYY-MM-DD format", Status: http.StatusBadRequest}
		}
		c.POPStart = popStart
	}
	if req.POPEnd != nil {
		popEnd, err := parseDate(req.POPEnd)
		if err != nil {
			return http.StatusBadRequest, &Error{Code: "CONTRACT_INVALID_DATE", Message: "pop_end must be in YYYY-MM-DD format", Status: http.StatusBadRequest}
		}
		c.POPEnd = popEnd
	}

	c.UpdatedBy = req.UpdatedBy
	c.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, c); err != nil {
		return http.StatusInternalServerError, ErrContractInternalError
	}

	resp.Contract = toContractResponse(c)

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "contract",
		ResourceID:   c.ID,
		ResourceName: c.Title,
		Action:       "update",
		Changes:      diffContract(&before, c),
	})

	return http.StatusOK, nil
}

func (s *Service) DeleteContract(ctx context.Context, req *dto.DeleteContractRequest, _ *struct{}) (int, error) {
	c, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if err == ErrContractNotFound {
			return http.StatusNotFound, ErrContractNotFound
		}
		return http.StatusInternalServerError, ErrContractInternalError
	}

	if err := s.repo.Delete(ctx, req.ID); err != nil {
		return http.StatusInternalServerError, ErrContractInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.ActorName,
		ResourceType: "contract",
		ResourceID:   req.ID,
		ResourceName: c.Title,
		Action:       "delete",
	})

	return http.StatusNoContent, nil
}

func (s *Service) ListFiscalYears(ctx context.Context, resp *dto.ListFiscalYearsResponse) (int, error) {
	years, err := s.repo.FindFiscalYears(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrContractInternalError
	}
	if years == nil {
		years = []string{}
	}
	resp.FiscalYears = years
	return http.StatusOK, nil
}

// ExportableColumns is the full ordered set of columns the CSV export supports.
// Derived from csvTable so it cannot describe something the exporter does not do.
var ExportableColumns = csvTable.Keys()

// ExportContracts returns a CSV body filtered by fiscal years. Empty
// fiscalYears means all. columns must be a subset of ExportableColumns; empty
// defaults to all. Output order follows the table, not the caller.
func (s *Service) ExportContracts(ctx context.Context, fiscalYears, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrContractInternalError
	}
	contracts, err := s.repo.FindForExport(ctx, fiscalYears)
	if err != nil {
		return "", ErrContractInternalError
	}
	return bound.Export(contracts, columns)
}

package satcomservice

import (
	"context"
	"strings"
	"time"

	"backend/internal/shared/csvtable"
)

// csvTable is the single declaration the CSV export, the import template and the
// importer all read. Services are a flat reference library, so this is the
// simplest shape a table takes: no dynamic vocabulary, no cross-column rule.
var csvTable = csvtable.Table[SatcomService]{
	Domain:      "SERVICE",
	Noun:        "service",
	NounPlural:  "services",
	FilePrefix:  "signal-suite-services",
	Identity:    "abbrev",
	ExampleRows: 2,
	New:         func() *SatcomService { return &SatcomService{} },

	Preamble: []string{
		"REQUIRED: abbrev (case-insensitive unique) and name.",
		"Delete every # line and the EXAMPLE rows. Keep the header row below.",
	},

	Columns: []csvtable.Column[SatcomService]{
		{
			Key: "id", Label: "ID", RejectOnImport: true,
			Get: csvtable.Str(func(s *SatcomService) string { return s.ID }),
		},
		{
			// Abbrev is the identity, not name: it is what the PACE sheet and the
			// equipment editor chips key on, and what the uniqueness constraint is
			// built around.
			Key: "abbrev", Label: "Abbreviation", Required: true,
			Get:     csvtable.Str(func(s *SatcomService) string { return s.Abbrev }),
			Set:     csvtable.SetStr(func(s *SatcomService, v string) { s.Abbrev = strings.TrimSpace(v) }),
			Example: []string{"EXSVC", "EXSVC2"},
		},
		{
			Key: "name", Label: "Name", Required: true,
			Get:     csvtable.Str(func(s *SatcomService) string { return s.Name }),
			Set:     csvtable.SetStr(func(s *SatcomService, v string) { s.Name = strings.TrimSpace(v) }),
			Example: []string{"Example Service", "Example Service Two"},
		},
		{
			Key: "description", Label: "Description",
			Get:     csvtable.Str(func(s *SatcomService) string { return s.Description }),
			Set:     csvtable.SetStr(func(s *SatcomService, v string) { s.Description = strings.TrimSpace(v) }),
			Example: []string{"Delete me"},
		},

		// Server-owned.
		{
			Key: "created_by", Label: "Created By",
			Get: csvtable.Str(func(s *SatcomService) string { return s.CreatedBy }),
		},
		{
			Key: "updated_by", Label: "Updated By",
			Get: csvtable.Str(func(s *SatcomService) string { return s.UpdatedBy }),
		},
		{
			Key: "updated_at", Label: "Updated At",
			Get: csvtable.RFC3339(func(s *SatcomService) time.Time { return s.UpdatedAt }),
		},
		{
			Key: "created_at", Label: "Created At",
			Get: csvtable.RFC3339(func(s *SatcomService) time.Time { return s.CreatedAt }),
		},
	},
}

// CSVColumns is the wire shape of this domain's columns, for the generated
// frontend manifest.
func CSVColumns() []csvtable.ColumnMeta { return csvTable.Meta() }

// ExportableColumns is the full ordered column set, derived from csvTable.
var ExportableColumns = csvTable.Keys()

func boundCSV() (*csvtable.Bound[SatcomService], error) { return csvTable.Bind(nil) }

// ExportServices returns the whole library as CSV. There is no filter facet: a
// service library is a flat global list with nothing to narrow it by.
func (s *Service) ExportServices(ctx context.Context, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrServiceInternalError
	}
	items, err := s.repo.FindAll(ctx)
	if err != nil {
		return "", ErrServiceInternalError
	}
	return bound.Export(items, columns)
}

// GetImportTemplate returns the import template, optionally narrowed to columns.
func (s *Service) GetImportTemplate(_ context.Context, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrServiceInternalError
	}
	return bound.Template(columns)
}

// ImportServices bulk-creates from a CSV body, reporting per-row errors.
//
// Rows go in one at a time rather than through a bulk path: a reference library
// is dozens of rows, Create already carries the uniqueness handling, and a row
// that fails at the database becomes a row error, which is the same partial
// success model the caller already handles.
func (s *Service) ImportServices(ctx context.Context, csvBody, actor string) (int, *csvtable.ParseResult[SatcomService], error) {
	bound, err := boundCSV()
	if err != nil {
		return 0, nil, ErrServiceInternalError
	}

	existing, err := s.repo.FindAll(ctx)
	if err != nil {
		return 0, nil, ErrServiceInternalError
	}
	abbrevs := make([]string, 0, len(existing))
	for _, item := range existing {
		abbrevs = append(abbrevs, item.Abbrev)
	}

	parsed, err := bound.Parse(csvBody, abbrevs)
	if err != nil {
		return 0, nil, err
	}

	now := time.Now().UTC()
	created := make([]*SatcomService, 0, len(parsed.Rows))
	for i, item := range parsed.Rows {
		item.CreatedBy = actor
		item.UpdatedBy = actor
		item.CreatedAt = now
		item.UpdatedAt = now
		if err := s.repo.Create(ctx, item); err != nil {
			parsed.Errors = append(parsed.Errors, csvtable.RowError{
				Row:    i + 2,
				Name:   item.Abbrev,
				Errors: []string{"could not be saved"},
			})
			continue
		}
		created = append(created, item)
	}
	parsed.Rows = created

	return csvtable.ImportStatus(len(parsed.Rows), len(parsed.Errors)), parsed, nil
}

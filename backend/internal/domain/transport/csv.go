package transport

import (
	"context"
	"strings"
	"time"

	"backend/internal/shared/csvtable"
)

// csvTable is the single declaration the CSV export, the import template and the
// importer all read.
//
// Transport differs from the other two reference libraries in one way that
// matters: kind is an open vocabulary, not a closed one. DefaultKinds is a
// starting suggestion, and a squadron running a path nobody anticipated adds its
// own rather than filing it under "other". So the column carries no Enum, and
// leans on NormaliseKind instead to stop the list filling with the same kind
// spelled three ways.
var csvTable = csvtable.Table[Transport]{
	Domain:      "TRANSPORT",
	Noun:        "transport",
	NounPlural:  "transports",
	FilePrefix:  "signal-suite-transports",
	Identity:    "name",
	ExampleRows: 2,
	New:         func() *Transport { return &Transport{} },

	Preamble: []string{
		"REQUIRED: name (case-insensitive unique).",
		"Kind is open: the four below are suggestions, not a closed list.",
		"Delete every # line and the EXAMPLE rows. Keep the header row below.",
	},

	Columns: []csvtable.Column[Transport]{
		{
			Key: "id", Label: "ID", RejectOnImport: true,
			Get: csvtable.Str(func(t *Transport) string { return t.ID }),
		},
		{
			Key: "name", Label: "Name", Required: true,
			Get:     csvtable.Str(func(t *Transport) string { return t.Name }),
			Set:     csvtable.SetStr(func(t *Transport, v string) { t.Name = strings.TrimSpace(v) }),
			Example: []string{"EXAMPLE FIBRE RUN", "EXAMPLE CELL LINK"},
		},
		{
			// Normalised rather than validated against a closed set. An empty kind
			// becomes "other" instead of a row error, matching what the drawer does,
			// so a file that does not care about the category still imports.
			Key: "kind", Label: "Kind",
			Note:    "Kind (open list, suggestions): fiber | cellular | manet | other",
			Get:     csvtable.Str(func(t *Transport) string { return t.Kind }),
			Set:     csvtable.SetStr(func(t *Transport, v string) { t.Kind = NormaliseKind(v) }),
			Example: []string{"fiber", "cellular"},
		},
		{
			Key: "provider", Label: "Provider",
			Get:     csvtable.Str(func(t *Transport) string { return t.Provider }),
			Set:     csvtable.SetStr(func(t *Transport, v string) { t.Provider = strings.TrimSpace(v) }),
			Example: []string{"Example Telecom"},
		},
		{
			Key: "description", Label: "Description",
			Get:     csvtable.Str(func(t *Transport) string { return t.Description }),
			Set:     csvtable.SetStr(func(t *Transport, v string) { t.Description = strings.TrimSpace(v) }),
			Example: []string{"Delete me"},
		},

		// Server-owned.
		{
			Key: "created_by", Label: "Created By",
			Get: csvtable.Str(func(t *Transport) string { return t.CreatedBy }),
		},
		{
			Key: "updated_by", Label: "Updated By",
			Get: csvtable.Str(func(t *Transport) string { return t.UpdatedBy }),
		},
		{
			Key: "updated_at", Label: "Updated At",
			Get: csvtable.RFC3339(func(t *Transport) time.Time { return t.UpdatedAt }),
		},
		{
			Key: "created_at", Label: "Created At",
			Get: csvtable.RFC3339(func(t *Transport) time.Time { return t.CreatedAt }),
		},
	},
}

// CSVColumns is the wire shape of this domain's columns, for the generated
// frontend manifest.
func CSVColumns() []csvtable.ColumnMeta { return csvTable.Meta() }

// ExportableColumns is the full ordered column set, derived from csvTable.
var ExportableColumns = csvTable.Keys()

func boundCSV() (*csvtable.Bound[Transport], error) { return csvTable.Bind(nil) }

// ExportTransports returns the whole library as CSV.
func (s *Service) ExportTransports(ctx context.Context, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrTransportInternalError
	}
	items, err := s.repo.FindAll(ctx)
	if err != nil {
		return "", ErrTransportInternalError
	}
	return bound.Export(items, columns)
}

// GetImportTemplate returns the import template, optionally narrowed to columns.
func (s *Service) GetImportTemplate(_ context.Context, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrTransportInternalError
	}
	return bound.Template(columns)
}

// ImportTransports bulk-creates from a CSV body, reporting per-row errors. See
// the note on the waveform importer for why rows go in one at a time.
func (s *Service) ImportTransports(ctx context.Context, csvBody, actor string) (int, *csvtable.ParseResult[Transport], error) {
	bound, err := boundCSV()
	if err != nil {
		return 0, nil, ErrTransportInternalError
	}

	existing, err := s.repo.FindAll(ctx)
	if err != nil {
		return 0, nil, ErrTransportInternalError
	}
	names := make([]string, 0, len(existing))
	for _, item := range existing {
		names = append(names, item.Name)
	}

	parsed, err := bound.Parse(csvBody, names)
	if err != nil {
		return 0, nil, err
	}

	now := time.Now().UTC()
	created := make([]*Transport, 0, len(parsed.Rows))
	for i, item := range parsed.Rows {
		if item.Kind == "" {
			item.Kind = NormaliseKind("")
		}
		item.CreatedBy = actor
		item.UpdatedBy = actor
		item.CreatedAt = now
		item.UpdatedAt = now
		if err := s.repo.Create(ctx, item); err != nil {
			parsed.Errors = append(parsed.Errors, csvtable.RowError{
				Row:    i + 2,
				Name:   item.Name,
				Errors: []string{"could not be saved"},
			})
			continue
		}
		created = append(created, item)
	}
	parsed.Rows = created

	return csvtable.ImportStatus(len(parsed.Rows), len(parsed.Errors)), parsed, nil
}

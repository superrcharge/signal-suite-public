package waveform

import (
	"context"
	"strings"
	"time"

	"backend/internal/shared/csvtable"
)

// csvTable is the single declaration the CSV export, the import template and the
// importer all read. Waveforms are a flat reference library, so this is the
// simplest shape a table takes: no dynamic vocabulary, no cross-column rule.
var csvTable = csvtable.Table[Waveform]{
	Domain:      "WAVEFORM",
	Noun:        "waveform",
	NounPlural:  "waveforms",
	FilePrefix:  "signal-suite-waveforms",
	Identity:    "abbrev",
	ExampleRows: 2,
	New:         func() *Waveform { return &Waveform{} },

	Preamble: []string{
		"REQUIRED: abbrev (case-insensitive unique) and name.",
		"Delete every # line and the EXAMPLE rows. Keep the header row below.",
	},

	Columns: []csvtable.Column[Waveform]{
		{
			Key: "id", Label: "ID", RejectOnImport: true,
			Get: csvtable.Str(func(w *Waveform) string { return w.ID }),
		},
		{
			// Abbrev is the identity, not name: it is what the PACE sheet and the
			// equipment editor chips key on, and it is what the uniqueness
			// constraint is built around.
			Key: "abbrev", Label: "Abbreviation", Required: true,
			Get:     csvtable.Str(func(w *Waveform) string { return w.Abbrev }),
			Set:     csvtable.SetStr(func(w *Waveform, v string) { w.Abbrev = strings.TrimSpace(v) }),
			Example: []string{"EXWF", "EXWF2"},
		},
		{
			Key: "name", Label: "Name", Required: true,
			Get:     csvtable.Str(func(w *Waveform) string { return w.Name }),
			Set:     csvtable.SetStr(func(w *Waveform, v string) { w.Name = strings.TrimSpace(v) }),
			Example: []string{"Example Waveform", "Example Waveform Two"},
		},
		{
			Key: "description", Label: "Description",
			Get:     csvtable.Str(func(w *Waveform) string { return w.Description }),
			Set:     csvtable.SetStr(func(w *Waveform, v string) { w.Description = strings.TrimSpace(v) }),
			Example: []string{"Delete me"},
		},

		// Server-owned.
		{
			Key: "created_by", Label: "Created By",
			Get: csvtable.Str(func(w *Waveform) string { return w.CreatedBy }),
		},
		{
			Key: "updated_by", Label: "Updated By",
			Get: csvtable.Str(func(w *Waveform) string { return w.UpdatedBy }),
		},
		{
			Key: "updated_at", Label: "Updated At",
			Get: csvtable.RFC3339(func(w *Waveform) time.Time { return w.UpdatedAt }),
		},
		{
			Key: "created_at", Label: "Created At",
			Get: csvtable.RFC3339(func(w *Waveform) time.Time { return w.CreatedAt }),
		},
	},
}

// CSVColumns is the wire shape of this domain's columns, for the generated
// frontend manifest.
func CSVColumns() []csvtable.ColumnMeta { return csvTable.Meta() }

// ExportableColumns is the full ordered column set, derived from csvTable.
var ExportableColumns = csvTable.Keys()

func boundCSV() (*csvtable.Bound[Waveform], error) { return csvTable.Bind(nil) }

// ExportWaveforms returns the whole library as CSV. There is no filter facet:
// a waveform library is a flat global list with nothing to narrow it by.
func (s *Service) ExportWaveforms(ctx context.Context, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrWaveformInternalError
	}
	items, err := s.repo.FindAll(ctx)
	if err != nil {
		return "", ErrWaveformInternalError
	}
	return bound.Export(items, columns)
}

// GetImportTemplate returns the import template, optionally narrowed to columns.
func (s *Service) GetImportTemplate(_ context.Context, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrWaveformInternalError
	}
	return bound.Template(columns)
}

// ImportWaveforms bulk-creates from a CSV body, reporting per-row errors.
//
// Rows are inserted one at a time rather than through a bulk path. A reference
// library is dozens of rows, not thousands, and Create already carries the
// uniqueness handling; a row that fails at the database becomes a row error,
// which is the same partial-success model the caller already handles.
func (s *Service) ImportWaveforms(ctx context.Context, csvBody, actor string) (int, *csvtable.ParseResult[Waveform], error) {
	bound, err := boundCSV()
	if err != nil {
		return 0, nil, ErrWaveformInternalError
	}

	existing, err := s.repo.FindAll(ctx)
	if err != nil {
		return 0, nil, ErrWaveformInternalError
	}
	abbrevs := make([]string, 0, len(existing))
	for _, w := range existing {
		abbrevs = append(abbrevs, w.Abbrev)
	}

	parsed, err := bound.Parse(csvBody, abbrevs)
	if err != nil {
		return 0, nil, err
	}

	now := time.Now().UTC()
	created := make([]*Waveform, 0, len(parsed.Rows))
	for i, w := range parsed.Rows {
		w.CreatedBy = actor
		w.UpdatedBy = actor
		w.CreatedAt = now
		w.UpdatedAt = now
		if err := s.repo.Create(ctx, w); err != nil {
			parsed.Errors = append(parsed.Errors, csvtable.RowError{
				Row:    i + 2,
				Name:   w.Abbrev,
				Errors: []string{"could not be saved"},
			})
			continue
		}
		created = append(created, w)
	}
	parsed.Rows = created

	return csvtable.ImportStatus(len(parsed.Rows), len(parsed.Errors)), parsed, nil
}

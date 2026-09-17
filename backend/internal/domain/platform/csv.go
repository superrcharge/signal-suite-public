package platform

import (
	"context"
	"strings"
	"time"

	"backend/internal/shared/csvtable"
)

// listSep joins the two array columns into one cell. A semicolon, because a
// waveform name can carry a comma and the cell would then need quoting that a
// person editing the sheet by hand will get wrong.
const listSep = ";"

func splitList(v string) []string { return strings.Split(v, listSep) }

// csvTable is the single declaration the CSV export, the import template and
// the importer all read.
//
// This covers the platforms themselves, one row per record. The compatibility
// MATRIX is a cross-tab - waveforms against every asset - which csvtable does
// not express, since it is row-per-record by construction. The matrix's export
// path is its print route; the data behind it exports here.
var csvTable = csvtable.Table[Platform]{
	Domain:      "PLATFORM",
	Noun:        "platform",
	NounPlural:  "platforms",
	FilePrefix:  "signal-suite-platforms",
	Identity:    "designation",
	ExampleRows: 2,
	New:         func() *Platform { return &Platform{} },

	Preamble: []string{
		"REQUIRED: designation (case-insensitive unique).",
		"Category and kind are open: the values below are suggestions, not a closed list.",
		"Waveform abbrevs and equipment ids are separated by ; within one cell.",
		"Delete every # line and the EXAMPLE rows. Keep the header row below.",
	},

	Columns: []csvtable.Column[Platform]{
		{
			Key: "id", Label: "ID", RejectOnImport: true,
			Get: csvtable.Str(func(p *Platform) string { return p.ID }),
		},
		{
			Key: "designation", Label: "Designation", Required: true,
			Get:     csvtable.Str(func(p *Platform) string { return p.Designation }),
			Set:     csvtable.SetStr(func(p *Platform, v string) { p.Designation = strings.TrimSpace(v) }),
			Example: []string{"EXAMPLE F-35A", "EXAMPLE DDG-51"},
		},
		{
			Key: "popular_name", Label: "Popular Name",
			Get:     csvtable.Str(func(p *Platform) string { return p.PopularName }),
			Set:     csvtable.SetStr(func(p *Platform, v string) { p.PopularName = strings.TrimSpace(v) }),
			Example: []string{"Lightning II", "Arleigh Burke"},
		},
		{
			// Normalised rather than validated against a closed set, matching
			// what the drawer does.
			Key: "category", Label: "Category",
			Note:    "Category (open list, suggestions): organic | joint | coalition",
			Get:     csvtable.Str(func(p *Platform) string { return p.Category }),
			Set:     csvtable.SetStr(func(p *Platform, v string) { p.Category = NormaliseCategory(v) }),
			Example: []string{"joint", "coalition"},
		},
		{
			Key: "kind", Label: "Kind",
			Note:    "Kind (open list, suggestions): aircraft | ship | ground vehicle | ground station",
			Get:     csvtable.Str(func(p *Platform) string { return p.Kind }),
			Set:     csvtable.SetStr(func(p *Platform, v string) { p.Kind = NormaliseKind(v) }),
			Example: []string{"aircraft", "ship"},
		},
		{
			Key: "operator", Label: "Operator",
			Get:     csvtable.Str(func(p *Platform) string { return p.Operator }),
			Set:     csvtable.SetStr(func(p *Platform, v string) { p.Operator = strings.TrimSpace(v) }),
			Example: []string{"USAF", "USN"},
		},
		{
			Key: "waveform_abbrevs", Label: "Waveforms",
			Note:    "Waveform abbrevs, ; separated. Each must already exist in the waveform library; a row naming one that does not is rejected.",
			Get:     csvtable.List(listSep, func(p *Platform) []string { return p.WaveformAbbrevs }),
			Set:     csvtable.SetStr(func(p *Platform, v string) { p.WaveformAbbrevs = NormaliseAbbrevs(splitList(v)) }),
			Example: []string{"L16;MADL", "L16"},
		},
		{
			Key: "equipment_ids", Label: "Carried Equipment IDs",
			Note:    "Equipment catalog ids of radios carried, ; separated. Usually left blank on import.",
			Get:     csvtable.List(listSep, func(p *Platform) []string { return p.EquipmentIDs }),
			Set:     csvtable.SetStr(func(p *Platform, v string) { p.EquipmentIDs = NormaliseIDs(splitList(v)) }),
			Example: []string{""},
		},
		{
			Key: "notes", Label: "Notes",
			Get:     csvtable.Str(func(p *Platform) string { return p.Notes }),
			Set:     csvtable.SetStr(func(p *Platform, v string) { p.Notes = strings.TrimSpace(v) }),
			Example: []string{"Delete me"},
		},

		// Server-owned.
		{
			Key: "created_by", Label: "Created By",
			Get: csvtable.Str(func(p *Platform) string { return p.CreatedBy }),
		},
		{
			Key: "updated_by", Label: "Updated By",
			Get: csvtable.Str(func(p *Platform) string { return p.UpdatedBy }),
		},
		{
			Key: "updated_at", Label: "Updated At",
			Get: csvtable.RFC3339(func(p *Platform) time.Time { return p.UpdatedAt }),
		},
		{
			Key: "created_at", Label: "Created At",
			Get: csvtable.RFC3339(func(p *Platform) time.Time { return p.CreatedAt }),
		},
	},
}

// CSVColumns is the wire shape of this domain's columns, for the generated
// frontend manifest.
func CSVColumns() []csvtable.ColumnMeta { return csvTable.Meta() }

// ExportableColumns is the full ordered column set, derived from csvTable.
var ExportableColumns = csvTable.Keys()

func boundCSV() (*csvtable.Bound[Platform], error) { return csvTable.Bind(nil) }

// ExportPlatforms returns the whole library as CSV.
func (s *Service) ExportPlatforms(ctx context.Context, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrPlatformInternalError
	}
	items, err := s.repo.FindAll(ctx)
	if err != nil {
		return "", ErrPlatformInternalError
	}
	return bound.Export(items, columns)
}

// GetImportTemplate returns the import template, optionally narrowed to columns.
func (s *Service) GetImportTemplate(_ context.Context, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrPlatformInternalError
	}
	return bound.Template(columns)
}

// ImportPlatforms bulk-creates from a CSV body, reporting per-row errors. See
// the note on the waveform importer for why rows go in one at a time.
func (s *Service) ImportPlatforms(ctx context.Context, csvBody, actor string) (int, *csvtable.ParseResult[Platform], error) {
	bound, err := boundCSV()
	if err != nil {
		return 0, nil, ErrPlatformInternalError
	}

	existing, err := s.repo.FindAll(ctx)
	if err != nil {
		return 0, nil, ErrPlatformInternalError
	}
	designations := make([]string, 0, len(existing))
	for _, item := range existing {
		designations = append(designations, item.Designation)
	}

	parsed, err := bound.Parse(csvBody, designations)
	if err != nil {
		return 0, nil, err
	}

	// Read once for the whole file rather than per row: the library is small and
	// does not change mid-import, and a lookup per row would turn a 200-row
	// restore into 200 queries.
	var known map[string]struct{}
	if s.waveform != nil {
		known, err = s.waveform.KnownWaveformAbbrevs(ctx)
		if err != nil {
			return 0, nil, ErrPlatformInternalError
		}
	}

	now := time.Now().UTC()
	created := make([]*Platform, 0, len(parsed.Rows))
	for i, item := range parsed.Rows {
		// A column absent from the file never ran its Set, so the defaults the
		// drawer would apply are applied here too.
		if item.Category == "" {
			item.Category = NormaliseCategory("")
		}
		if item.Kind == "" {
			item.Kind = NormaliseKind("")
		}
		var rowErrs []string
		if !IsValidVocab(item.Category) {
			rowErrs = append(rowErrs, ErrPlatformInvalidCategory.Message)
		}
		if !IsValidVocab(item.Kind) {
			rowErrs = append(rowErrs, ErrPlatformInvalidKind.Message)
		}
		// Per row, not per file, and deliberately: a restore that loads
		// platforms before waveforms would otherwise fail wholesale, where a row
		// error lets the operator fix those rows and re-run with the rest
		// already landed. Category and kind above are rejected the same way.
		if known != nil {
			var unknown []string
			for _, a := range item.WaveformAbbrevs {
				if _, ok := known[strings.ToLower(strings.TrimSpace(a))]; !ok {
					unknown = append(unknown, a)
				}
			}
			if len(unknown) > 0 {
				rowErrs = append(rowErrs, ErrPlatformUnknownWaveform(unknown).Message)
			}
		}
		if len(rowErrs) > 0 {
			parsed.Errors = append(parsed.Errors, csvtable.RowError{
				Row: i + 2, Name: item.Designation, Errors: rowErrs,
			})
			continue
		}
		item.CreatedBy = actor
		item.UpdatedBy = actor
		item.CreatedAt = now
		item.UpdatedAt = now
		if err := s.repo.Create(ctx, item); err != nil {
			parsed.Errors = append(parsed.Errors, csvtable.RowError{
				Row:    i + 2,
				Name:   item.Designation,
				Errors: []string{"could not be saved"},
			})
			continue
		}
		created = append(created, item)
	}
	parsed.Rows = created

	return csvtable.ImportStatus(len(parsed.Rows), len(parsed.Errors)), parsed, nil
}

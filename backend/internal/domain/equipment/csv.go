package equipment

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"time"

	"backend/internal/shared/csvtable"
)

// csvTable is the single declaration the CSV export, the import template and the
// importer all read.
//
// Equipment is the one domain where CSV genuinely cannot carry the whole record.
// Everything a datasheet shows - frequency bands, standard and physical and RF
// specs, SWAP figures, features, compatible services and waveforms - lives in
// the data JSONB column, and a nested structure does not go in a cell without
// inventing a convention nobody would want to fill in by hand.
//
// So a CSV import creates a correctly named and typed record with an empty
// datasheet, for bulk-seeding a catalog from a spreadsheet of nomenclatures.
// The specs are filled in afterwards in the 3-pane editor. That is a real
// limitation rather than an oversight, which is why the template says so on its
// first line and why the domain doc does too. A JSON import is the honest tool
// for round-tripping a full record and is deliberately out of scope here.
var csvTable = csvtable.Table[Equipment]{
	Domain:      "EQUIPMENT",
	Noun:        "equipment record",
	NounPlural:  "equipment records",
	FilePrefix:  "signal-suite-equipment",
	Identity:    "id",
	ExampleRows: 2,
	New:         func() *Equipment { return &Equipment{} },

	Preamble: []string{
		"This template creates catalog entries with an EMPTY datasheet. Bands, specs,",
		"SWAP and features live in a nested structure a CSV cannot carry - fill them",
		"in afterwards in the equipment editor.",
		"REQUIRED: id (a lowercase slug, unique), nomenclature and terminal_type.",
		"Delete every # line and the EXAMPLE rows. Keep the header row below.",
	},

	Columns: []csvtable.Column[Equipment]{
		{
			// The exception to the id rule everywhere else in the app: an equipment
			// id is a user-authored slug and is required on create, so it has a real
			// parser and belongs in the template. Nothing special-cases the name
			// "id" - the behaviour falls out of the column carrying a Set.
			Key: "id", Label: "ID", Required: true,
			Note:    "ID: lowercase slug, unique, e.g. an-prc-158",
			Get:     csvtable.Str(func(e *Equipment) string { return e.ID }),
			Set:     csvtable.SetStr(func(e *Equipment, v string) { e.ID = strings.ToLower(strings.TrimSpace(v)) }),
			Example: []string{"example-radio-1", "example-terminal-1"},
		},
		{
			Key: "nomenclature", Label: "Nomenclature", Required: true,
			Get:     csvtable.Str(func(e *Equipment) string { return e.Nomenclature }),
			Set:     csvtable.SetStr(func(e *Equipment, v string) { e.Nomenclature = strings.TrimSpace(v) }),
			Example: []string{"AN/EXAMPLE-1", "AN/EXAMPLE-2"},
		},
		{
			Key: "terminal_type", Label: "Type", Required: true,
			Enum: []string{TerminalTypeSATCOM, TerminalTypeRadio}, EnumFold: true,
			Note:    "Type: satcom | radio",
			Get:     csvtable.Str(func(e *Equipment) string { return e.TerminalType }),
			Set:     csvtable.SetStr(func(e *Equipment, v string) { e.TerminalType = strings.ToLower(strings.TrimSpace(v)) }),
			Example: []string{"radio", "satcom"},
		},
		{
			Key: "nickname", Label: "Nickname",
			Get:     csvtable.PtrStr(func(e *Equipment) *string { return e.Nickname }),
			Set:     csvtable.SetPtrStr(func(e *Equipment, v *string) { e.Nickname = v }),
			Example: []string{"Example"},
		},
		{
			Key: "make", Label: "Make",
			Get:     csvtable.PtrStr(func(e *Equipment) *string { return e.Make }),
			Set:     csvtable.SetPtrStr(func(e *Equipment, v *string) { e.Make = v }),
			Example: []string{"Example Systems"},
		},
		{
			Key: "one_liner", Label: "One-liner",
			Get:     csvtable.PtrStr(func(e *Equipment) *string { return e.OneLiner }),
			Set:     csvtable.SetPtrStr(func(e *Equipment, v *string) { e.OneLiner = v }),
			Example: []string{"Delete me"},
		},
		{
			Key: "doc_number", Label: "Doc #",
			Get:     csvtable.PtrStr(func(e *Equipment) *string { return e.DocNumber }),
			Set:     csvtable.SetPtrStr(func(e *Equipment, v *string) { e.DocNumber = v }),
			Example: []string{"DOC-0001"},
		},
		{
			// Pipe-joined rather than comma, because a comma would need quoting in
			// every row that has more than one mode.
			Key: "operational_mode", Label: "Operational Mode",
			Note:    "Operational Mode: pipe-separated, e.g. fixed|on the move",
			Get:     csvtable.List("|", func(e *Equipment) []string { return e.OperationalMode }),
			Set: func(e *Equipment, v string) error {
				e.OperationalMode = splitModes(v)
				return nil
			},
			Example: []string{"fixed|on the move", "fixed"},
		},
		{
			// Export-only: a photo is uploaded, not named in a spreadsheet.
			Key: "photo_url", Label: "Photo URL",
			Get: csvtable.PtrStr(func(e *Equipment) *string { return e.PhotoURL }),
		},
		{
			// Export-only, and the reason this domain's CSV is a seed rather than a
			// backup. Rendered as compact JSON so an export at least carries the
			// specs somewhere a human can read them.
			Key: "data", Label: "Datasheet (JSON)",
			Note: "",
			Get: func(e *Equipment) string {
				if len(e.Data) == 0 {
					return ""
				}
				var buf bytes.Buffer
				if err := json.Compact(&buf, e.Data); err != nil {
					return ""
				}
				return buf.String()
			},
		},

		// Server-owned.
		{
			Key: "created_by", Label: "Created By",
			Get: csvtable.Str(func(e *Equipment) string { return e.CreatedBy }),
		},
		{
			Key: "updated_by", Label: "Updated By",
			Get: csvtable.Str(func(e *Equipment) string { return e.UpdatedBy }),
		},
		{
			Key: "updated_at", Label: "Updated At",
			Get: csvtable.RFC3339(func(e *Equipment) time.Time { return e.UpdatedAt }),
		},
		{
			Key: "created_at", Label: "Created At",
			Get: csvtable.RFC3339(func(e *Equipment) time.Time { return e.CreatedAt }),
		},
	},
}

// splitModes parses the pipe-separated operational_mode cell, dropping blanks so
// a trailing separator does not become an empty mode.
func splitModes(v string) []string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	parts := strings.Split(v, "|")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// CSVColumns is the wire shape of this domain's columns, for the generated
// frontend manifest.
func CSVColumns() []csvtable.ColumnMeta { return csvTable.Meta() }

// ExportableColumns is the full ordered column set, derived from csvTable.
var ExportableColumns = csvTable.Keys()

func boundCSV() (*csvtable.Bound[Equipment], error) { return csvTable.Bind(nil) }

// ExportEquipment returns the catalog as CSV, filtered the same way the list
// endpoint is.
func (s *Service) ExportEquipment(ctx context.Context, terminalType, search string, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrEquipmentInternalError
	}
	items, err := s.repo.FindAll(ctx, terminalType, search)
	if err != nil {
		return "", ErrEquipmentInternalError
	}
	return bound.Export(items, columns)
}

// GetImportTemplate returns the import template, optionally narrowed to columns.
func (s *Service) GetImportTemplate(_ context.Context, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrEquipmentInternalError
	}
	return bound.Template(columns)
}

// ImportEquipment bulk-creates catalog entries with an empty datasheet.
//
// actorRadioOnly reproduces the per-record narrowing the create path performs:
// the catalog holds both satcom and radio equipment separated by a column rather
// than by route, so RequireRole cannot express "radio only" and the check has to
// happen per row. Without it, CSV would be a way around a permission boundary
// the drawer enforces.
func (s *Service) ImportEquipment(ctx context.Context, csvBody, actor string, actorRadioOnly bool) (int, *csvtable.ParseResult[Equipment], error) {
	bound, err := boundCSV()
	if err != nil {
		return 0, nil, ErrEquipmentInternalError
	}

	existing, err := s.repo.FindAll(ctx, "", "")
	if err != nil {
		return 0, nil, ErrEquipmentInternalError
	}
	ids := make([]string, 0, len(existing))
	for _, e := range existing {
		ids = append(ids, e.ID)
	}

	parsed, err := bound.Parse(csvBody, ids)
	if err != nil {
		return 0, nil, err
	}

	now := time.Now().UTC()
	created := make([]*Equipment, 0, len(parsed.Rows))
	for i, e := range parsed.Rows {
		if actorRadioOnly && e.TerminalType != TerminalTypeRadio {
			parsed.Errors = append(parsed.Errors, csvtable.RowError{
				Row:    i + 2,
				Name:   e.ID,
				Errors: []string{ErrRadioScopeOnly.Message},
			})
			continue
		}

		// An imported record starts with no datasheet. See the note on csvTable.
		e.Data = json.RawMessage("{}")
		e.CreatedBy = actor
		e.UpdatedBy = actor
		e.CreatedAt = now
		e.UpdatedAt = now
		if err := s.repo.Create(ctx, e); err != nil {
			parsed.Errors = append(parsed.Errors, csvtable.RowError{
				Row:    i + 2,
				Name:   e.ID,
				Errors: []string{"could not be saved"},
			})
			continue
		}
		created = append(created, e)
	}
	parsed.Rows = created

	return csvtable.ImportStatus(len(parsed.Rows), len(parsed.Errors)), parsed, nil
}

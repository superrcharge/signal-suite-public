package terminal

import (
	"context"
	"time"

	"backend/internal/shared/assetstatus"
	"backend/internal/shared/csvtable"
)

// csvTable is the single declaration the CSV export, the import template and the
// importer all read. It replaces three things that used to be maintained by
// hand and independently: ExportableColumns, a 50-case value switch, and a
// template whose header row was a string literal with no link to either.
//
// Column order here is the canonical output order. Export and template both emit
// in this order whatever the caller asks for, so the same selection always
// renders the same bytes.
var csvTable = csvtable.Table[Terminal]{
	Domain:      "TERMINAL",
	Noun:        "terminal",
	NounPlural:  "terminals",
	FilePrefix:  "signal-suite-terminals",
	Identity:    "name",
	ExampleRows: 3,
	New:         func() *Terminal { return &Terminal{} },

	// Tight on purpose - every line beyond the minimum costs the reader time.
	// REQUIRED is uppercased because CSV comments cannot be bold. The EXAMPLE
	// names must not collide with seed data; see domains/terminal.md.
	Preamble: []string{
		"REQUIRED: name (case-insensitive unique). Everything else is optional.",
		"Delete every # line and the EXAMPLE rows. Keep the header row below.",
	},

	Columns: []csvtable.Column[Terminal]{
		{
			// Exported first and by default. Nothing else in a row is a stable
			// handle: name is the field most likely to have been edited between
			// two exports, so without id a CSV cannot be correlated with the API,
			// with an audit entry, or with an export taken last week.
			//
			// RejectOnImport because import creates. A file carrying an id came
			// from an export and the user meant to update those rows; without this
			// they would instead get a duplicate-name error on every line, which is
			// accurate and tells them nothing.
			Key: "id", Label: "ID", RejectOnImport: true,
			Get: csvtable.Str(func(t *Terminal) string { return t.ID }),
		},
		{
			Key: "name", Label: "Terminal Name", Required: true,
			Get:     csvtable.Str(func(t *Terminal) string { return t.Name }),
			Set:     csvtable.SetStr(func(t *Terminal, v string) { t.Name = v }),
			Example: []string{"EXAMPLE STARSHIELD", "EXAMPLE PARADIGM", "EXAMPLE MINIMAL"},
		},
		{
			Key: "model", Label: "Model", Enum: ValidModels,
			Note:    "Model - Starshield: mini | hp    Paradigm: hornet | ragno    OneWeb: ow7 | ow10 | ow11",
			Get:     csvtable.PtrStr(func(t *Terminal) *string { return t.Model }),
			Set:     csvtable.SetPtrStr(func(t *Terminal, v *string) { t.Model = v }),
			Example: []string{"mini", "hornet"},
		},
		{
			Key: "kit", Label: "Kit #",
			Get:     csvtable.Str(func(t *Terminal) string { return t.Kit }),
			Set:     csvtable.SetStr(func(t *Terminal, v string) { t.Kit = v }),
			Example: []string{"KIT-X-001"},
		},
		{
			Key: "pim", Label: "PIM #",
			Get:     csvtable.Str(func(t *Terminal) string { return t.Pim }),
			Set:     csvtable.SetStr(func(t *Terminal, v string) { t.Pim = v }),
			Example: []string{"", "PIM-X-001"},
		},
		{
			Key: "serial", Label: "Serial #",
			Get:     csvtable.Str(func(t *Terminal) string { return t.Serial }),
			Set:     csvtable.SetStr(func(t *Terminal, v string) { t.Serial = v }),
			Example: []string{"SN-EXAMPLE-001", "SN-EXAMPLE-002"},
		},
		{
			// The one vocabulary that cannot live in this file: section keys are
			// another domain's data and change at runtime.
			Key: "section", Label: "Section", DynamicEnum: "sections",
			Note:    "Sections",
			Get:     csvtable.Str(func(t *Terminal) string { return t.Section }),
			Set:     csvtable.SetStr(func(t *Terminal, v string) { t.Section = v }),
			Example: []string{"asqd", "asqd"},
		},
		{
			Key: "status", Label: "Status", Enum: ValidStatuses, Default: StatusAvailable,
			Note:    assetstatus.CSVNote(),
			Get:     csvtable.Str(func(t *Terminal) string { return t.Status }),
			Set:     csvtable.SetStr(func(t *Terminal, v string) { t.Status = v }),
			Example: []string{"available", "available"},
		},
		{
			Key: "owner", Label: "Assigned To",
			Get:     csvtable.PtrStr(func(t *Terminal) *string { return t.Owner }),
			Set:     csvtable.SetPtrStr(func(t *Terminal, v *string) { t.Owner = v }),
			Example: []string{"SGT Example", "SGT Example"},
		},
		{
			Key: "owner_email", Label: "Owner Email",
			Get:     csvtable.PtrStr(func(t *Terminal) *string { return t.OwnerEmail }),
			Set:     csvtable.SetPtrStr(func(t *Terminal, v *string) { t.OwnerEmail = v }),
			Example: []string{"example@example.mil", "example@example.mil"},
		},
		{
			Key: "owner_phone", Label: "Owner Phone",
			Get:     csvtable.PtrStr(func(t *Terminal) *string { return t.OwnerPhone }),
			Set:     csvtable.SetPtrStr(func(t *Terminal, v *string) { t.OwnerPhone = v }),
			Example: []string{"DSN 312-555-0000", "DSN 312-555-0000"},
		},
		{
			Key: "pop_pin", Label: "PoP Pinned To", Enum: ValidPopPins,
			Note:    "PoP pin (Starshield only): us-east | us-west | germany | uk | australia",
			Get:     csvtable.PtrStr(func(t *Terminal) *string { return t.PopPin }),
			Set:     csvtable.SetPtrStr(func(t *Terminal, v *string) { t.PopPin = v }),
			Example: []string{"us-east"},
		},
		{
			Key: "notes", Label: "Notes",
			Get:     csvtable.Str(func(t *Terminal) string { return t.Notes }),
			Set:     csvtable.SetStr(func(t *Terminal, v string) { t.Notes = v }),
			Example: []string{"Delete me", "Delete me"},
		},
		{
			Key: "tag", Label: "Tag",
			Get:     csvtable.PtrStr(func(t *Terminal) *string { return t.Tag }),
			Set:     csvtable.SetPtrStr(func(t *Terminal, v *string) { t.Tag = v }),
			Example: []string{"Operation Example", "Operation Example"},
		},

		// Server-owned: no Set, so they are exported but never templated and
		// never read back from a file.
		{
			Key: "updated_by", Label: "Updated By",
			Get: csvtable.Str(func(t *Terminal) string { return t.UpdatedBy }),
		},
		{
			Key: "updated_at", Label: "Updated At",
			Get: csvtable.RFC3339(func(t *Terminal) time.Time { return t.UpdatedAt }),
		},
		{
			Key: "created_at", Label: "Created At",
			Get: csvtable.RFC3339(func(t *Terminal) time.Time { return t.CreatedAt }),
		},
	},

	// The rule no single column can see. It reads the raw cells rather than the
	// parsed row so an invalid model together with a pop_pin reports both
	// problems, which is what the hand-written importer did.
	Check: func(t *Terminal, row csvtable.Row) []string {
		pin := row["pop_pin"]
		if pin == "" {
			return nil
		}
		if m := row["model"]; m != ModelMini && m != ModelHP {
			return []string{"pop_pin only applies to Starshield terminals (model mini or hp)"}
		}
		return nil
	},
}

// bindCSV resolves the section vocabulary for this request. Section keys are the
// only value set the table cannot hold itself.
func (s *Service) bindCSV(ctx context.Context) (*csvtable.Bound[Terminal], error) {
	keys, err := s.sectionLister.GetSectionKeys(ctx)
	if err != nil {
		return nil, err
	}
	return csvTable.Bind(csvtable.Vocab{"sections": keys})
}

// CSVColumns is the wire shape of this domain's CSV columns, in canonical order.
// Consumed by the csvregistry package, which emits the manifest the frontend
// column picker reads, so the picker cannot describe a different set of columns
// from the one the exporter emits.
func CSVColumns() []csvtable.ColumnMeta { return csvTable.Meta() }

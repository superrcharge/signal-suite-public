package kit

import (
	"context"
	"strings"
	"time"

	"backend/internal/shared/assetstatus"
	"backend/internal/shared/csvtable"
)

// csvTable is the single declaration the CSV export, the import template and the
// importer all read. See the terminal package for the shape; kit differs only in
// having two required columns and three boolean network flags.
var csvTable = csvtable.Table[Kit]{
	Domain:      "KIT",
	Noun:        "kit",
	NounPlural:  "kits",
	FilePrefix:  "signal-suite-kits",
	Identity:    "name",
	ExampleRows: 2,
	New:         func() *Kit { return &Kit{} },

	Preamble: []string{
		"REQUIRED: name (case-insensitive unique) and type. Everything else is optional.",
		"Delete every # line and the EXAMPLE rows. Keep the header row below.",
	},

	Columns: []csvtable.Column[Kit]{
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
			Get: csvtable.Str(func(k *Kit) string { return k.ID }),
		},
		{
			Key: "name", Label: "Kit Name", Required: true,
			Get:     csvtable.Str(func(k *Kit) string { return k.Name }),
			Set:     csvtable.SetStr(func(k *Kit, v string) { k.Name = v }),
			Example: []string{"EXAMPLE REMOTE", "EXAMPLE MINIMAL"},
		},
		{
			// Accepted case-insensitively and stored lowercase, which is what the
			// hand-written importer did with strings.ToLower before validating.
			Key: "type", Label: "Type", Required: true, Enum: ValidTypes, EnumFold: true,
			Note:    "Type: remote | ifk | atk",
			Get:     csvtable.Str(func(k *Kit) string { return k.Type }),
			Set:     csvtable.SetStr(func(k *Kit, v string) { k.Type = strings.ToLower(v) }),
			Example: []string{"remote", "ifk"},
		},
		{
			Key: "status", Label: "Status", Enum: ValidStatuses, Default: StatusAvailable,
			Note:    assetstatus.CSVNote(),
			Get:     csvtable.Str(func(k *Kit) string { return k.Status }),
			Set:     csvtable.SetStr(func(k *Kit, v string) { k.Status = v }),
			Example: []string{"available"},
		},
		{
			Key: "black", Label: "BLACK",
			Note:    "Networks (BLACK, SECRET, TS): true | false  (blank = false)",
			Get:     csvtable.Bool(func(k *Kit) bool { return k.Black }),
			Set:     csvtable.SetBool(func(k *Kit, v bool) { k.Black = v }),
			Example: []string{"true"},
		},
		{
			Key: "secret", Label: "SECRET",
			Get:     csvtable.Bool(func(k *Kit) bool { return k.Secret }),
			Set:     csvtable.SetBool(func(k *Kit, v bool) { k.Secret = v }),
			Example: []string{"false"},
		},
		{
			Key: "topsecret", Label: "TS",
			Get:     csvtable.Bool(func(k *Kit) bool { return k.TopSecret }),
			Set:     csvtable.SetBool(func(k *Kit, v bool) { k.TopSecret = v }),
			Example: []string{"false"},
		},
		{
			Key: "section", Label: "Section", DynamicEnum: "sections",
			Note:    "Sections",
			Get:     csvtable.Str(func(k *Kit) string { return k.Section }),
			Set:     csvtable.SetStr(func(k *Kit, v string) { k.Section = v }),
			Example: []string{"asqd"},
		},
		{
			Key: "owner", Label: "Assigned To",
			Get:     csvtable.PtrStr(func(k *Kit) *string { return k.Owner }),
			Set:     csvtable.SetPtrStr(func(k *Kit, v *string) { k.Owner = v }),
			Example: []string{"SGT Example"},
		},
		{
			Key: "owner_email", Label: "Owner Email",
			Get:     csvtable.PtrStr(func(k *Kit) *string { return k.OwnerEmail }),
			Set:     csvtable.SetPtrStr(func(k *Kit, v *string) { k.OwnerEmail = v }),
			Example: []string{"example@example.mil"},
		},
		{
			Key: "owner_phone", Label: "Owner Phone",
			Get:     csvtable.PtrStr(func(k *Kit) *string { return k.OwnerPhone }),
			Set:     csvtable.SetPtrStr(func(k *Kit, v *string) { k.OwnerPhone = v }),
			Example: []string{"DSN 312-555-0000"},
		},
		{
			Key: "location", Label: "Location",
			Get:     csvtable.Str(func(k *Kit) string { return k.Location }),
			Set:     csvtable.SetStr(func(k *Kit, v string) { k.Location = v }),
			Example: []string{"Bldg 100"},
		},
		{
			Key: "notes", Label: "Notes",
			Get:     csvtable.Str(func(k *Kit) string { return k.Notes }),
			Set:     csvtable.SetStr(func(k *Kit, v string) { k.Notes = v }),
			Example: []string{"Delete me"},
		},

		// Server-owned: no Set, so exported but never templated or imported.
		{
			Key: "updated_by", Label: "Updated By",
			Get: csvtable.Str(func(k *Kit) string { return k.UpdatedBy }),
		},
		{
			Key: "updated_at", Label: "Updated At",
			Get: csvtable.RFC3339(func(k *Kit) time.Time { return k.UpdatedAt }),
		},
		{
			Key: "created_at", Label: "Created At",
			Get: csvtable.RFC3339(func(k *Kit) time.Time { return k.CreatedAt }),
		},
	},
}

// bindCSV resolves the section vocabulary for this request.
func (s *Service) bindCSV(ctx context.Context) (*csvtable.Bound[Kit], error) {
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

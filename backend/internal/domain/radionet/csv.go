package radionet

import (
	"context"
	"strings"
	"time"

	"backend/internal/shared/csvtable"
)

// csvTable is the single declaration the CSV export, the import template and the
// importer all read.
//
// Section is exported but has no Set. Nets are a per-squadron library and the
// squadron is the write target rather than a field of the row: the service
// stamps it from the URL after parsing, so a file cannot smuggle rows into
// another squadron by editing a column. That is also why it is not the identity
// - name is, scoped to the section being imported into.
var csvTable = csvtable.Table[Net]{
	Domain:      "NET",
	Noun:        "net",
	NounPlural:  "nets",
	FilePrefix:  "signal-suite-nets",
	Identity:    "name",
	ExampleRows: 2,
	New:         func() *Net { return &Net{} },

	Preamble: []string{
		"REQUIRED: name (case-insensitive unique within this squadron and theater) and radio_type.",
		"theater is conus | oconus | both; blank means conus.",
		"Rows import into the squadron named in the URL. The section column is",
		"exported for reference and ignored on import.",
		"Delete the EXAMPLE rows and keep the header row. These # lines can stay: import skips them.",
	},

	Columns: []csvtable.Column[Net]{
		{
			Key: "id", Label: "ID", RejectOnImport: true,
			Get: csvtable.Str(func(n *Net) string { return n.ID }),
		},
		{
			// No Set: see the note above. Exported so a file taken from one
			// squadron says which one it came from.
			Key: "section", Label: "Squadron",
			Get: csvtable.Str(func(n *Net) string { return n.Section }),
		},
		{
			Key: "name", Label: "Net Name", Required: true,
			Get:     csvtable.Str(func(n *Net) string { return n.Name }),
			Set:     csvtable.SetStr(func(n *Net, v string) { n.Name = strings.TrimSpace(v) }),
			Example: []string{"EXAMPLE NET", "EXAMPLE NET TWO"},
		},
		{
			Key: "net_id", Label: "Channel #",
			Get:     csvtable.Str(func(n *Net) string { return n.NetID }),
			Set:     csvtable.SetStr(func(n *Net, v string) { n.NetID = strings.TrimSpace(v) }),
			Example: []string{"N01", "W01"},
		},
		{
			Key: "radio_type", Label: "Radio", Required: true, Enum: ValidRadioTypes, EnumFold: true,
			Note:    "Radio: jem | mpu5 | both  (both is a real answer, not a fallback)",
			Get:     csvtable.Str(func(n *Net) string { return n.RadioType }),
			Set:     csvtable.SetStr(func(n *Net, v string) { n.RadioType = strings.ToLower(strings.TrimSpace(v)) }),
			Example: []string{"jem", "mpu5"},
		},
		{
			// Default rather than a service fallback: csvtable substitutes it for
			// a blank cell and for a file with no theater column at all, so a
			// file written before theaters existed still imports as CONUS.
			Key: "theater", Label: "Theater",
			Enum: ValidTheaters, EnumFold: true, Default: TheaterCONUS,
			Note:    "Theater: conus | oconus | both  (blank = conus)",
			Get:     csvtable.Str(func(n *Net) string { return n.Theater }),
			Set:     csvtable.SetStr(func(n *Net, v string) { n.Theater = strings.ToLower(strings.TrimSpace(v)) }),
			Example: []string{"conus", "both"},
		},
		{
			// Freeform on purpose: a net is recorded as a range or a placeholder
			// word at least as often as a single figure, so a numeric column would
			// reject most real entries.
			Key: "tx_freq", Label: "TX",
			Get:     csvtable.Str(func(n *Net) string { return n.TxFreq }),
			Set:     csvtable.SetStr(func(n *Net, v string) { n.TxFreq = strings.TrimSpace(v) }),
			Example: []string{"30.5", "1.4"},
		},
		{
			Key: "rx_freq", Label: "RX",
			Get:     csvtable.Str(func(n *Net) string { return n.RxFreq }),
			Set:     csvtable.SetStr(func(n *Net, v string) { n.RxFreq = strings.TrimSpace(v) }),
			Example: []string{"30.5", "1.4"},
		},
		{
			// Case-sensitive by design: "mhz" is rejected so a printed wheel reads
			// consistently. Not folded, unlike radio_type.
			Key: "freq_unit", Label: "Unit", Enum: ValidFreqUnits,
			Note:    "Unit: MHz | GHz  (case matters - it prints as written)",
			Get:     csvtable.Str(func(n *Net) string { return n.FreqUnit }),
			Set:     csvtable.SetStr(func(n *Net, v string) { n.FreqUnit = strings.TrimSpace(v) }),
			Example: []string{"MHz", "GHz"},
		},
		{
			Key: "roip", Label: "ROIP",
			Note:    "ROIP: true | false  (blank = false)",
			Get:     csvtable.Bool(func(n *Net) bool { return n.ROIP }),
			Set:     csvtable.SetBool(func(n *Net, v bool) { n.ROIP = v }),
			Example: []string{"false", "true"},
		},
		{
			Key: "description", Label: "Description",
			Get:     csvtable.Str(func(n *Net) string { return n.Description }),
			Set:     csvtable.SetStr(func(n *Net, v string) { n.Description = strings.TrimSpace(v) }),
			Example: []string{"Delete me"},
		},
		{
			Key: "notes", Label: "Notes",
			Get:     csvtable.Str(func(n *Net) string { return n.Notes }),
			Set:     csvtable.SetStr(func(n *Net, v string) { n.Notes = strings.TrimSpace(v) }),
			Example: []string{"Delete me"},
		},

		// Server-owned.
		{
			Key: "created_by", Label: "Created By",
			Get: csvtable.Str(func(n *Net) string { return n.CreatedBy }),
		},
		{
			Key: "updated_by", Label: "Updated By",
			Get: csvtable.Str(func(n *Net) string { return n.UpdatedBy }),
		},
		{
			Key: "updated_at", Label: "Updated At",
			Get: csvtable.RFC3339(func(n *Net) time.Time { return n.UpdatedAt }),
		},
		{
			Key: "created_at", Label: "Created At",
			Get: csvtable.RFC3339(func(n *Net) time.Time { return n.CreatedAt }),
		},
	},
}

// CSVColumns is the wire shape of this domain's columns, for the generated
// frontend manifest.
func CSVColumns() []csvtable.ColumnMeta { return csvTable.Meta() }

// ExportableColumns is the full ordered column set, derived from csvTable.
var ExportableColumns = csvTable.Keys()

func boundCSV() (*csvtable.Bound[Net], error) { return csvTable.Bind(nil) }

// ExportNets returns one squadron's nets as CSV.
//
// Scoped to a section rather than offering a squadron facet: there is no
// "all nets" query and never has been, because a net belongs to the squadron
// that maintains it. Adding a cross-section read for the sake of a filter chip
// would invent a view the domain does not have.
func (s *Service) ExportNets(ctx context.Context, section string, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrNetInternalError
	}
	exists, err := s.repo.SectionExists(ctx, section)
	if err != nil {
		return "", ErrNetInternalError
	}
	if !exists {
		return "", ErrSectionNotFound
	}
	nets, err := s.repo.FindBySection(ctx, section)
	if err != nil {
		return "", ErrNetInternalError
	}
	return bound.Export(nets, columns)
}

// GetImportTemplate returns the import template, optionally narrowed to columns.
func (s *Service) GetImportTemplate(_ context.Context, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrNetInternalError
	}
	return bound.Template(columns)
}

// ImportNets bulk-creates nets into one squadron, reporting per-row errors.
//
// Uniqueness is checked against that squadron only, matching the create path:
// several squadrons commonly run a net of the same name on different
// frequencies, and one importing must not collide with another.
func (s *Service) ImportNets(ctx context.Context, section, csvBody, actor string) (int, *csvtable.ParseResult[Net], error) {
	bound, err := boundCSV()
	if err != nil {
		return 0, nil, ErrNetInternalError
	}

	exists, err := s.repo.SectionExists(ctx, section)
	if err != nil {
		return 0, nil, ErrNetInternalError
	}
	if !exists {
		return 0, nil, ErrSectionNotFound
	}

	// Parse gets no existing names: a name is taken per theater's list, which
	// Parse cannot judge, so the check runs per row below against the same
	// rule create uses. Parse still refuses a duplicate within the file.
	parsed, err := bound.Parse(csvBody, nil)
	if err != nil {
		return 0, nil, err
	}

	now := time.Now().UTC()
	for i, n := range parsed.Rows {
		// Stamped from the URL, never from the file.
		n.Section = section
		if n.FreqUnit == "" {
			n.FreqUnit = FreqUnitMHz
		}
		taken, err := s.repo.NameExists(ctx, section, n.Theater, n.Name)
		if err != nil {
			return 0, nil, ErrNetInternalError
		}
		if taken {
			parsed.Reject(i, n.Name, "duplicate - name already exists in this theater")
			continue
		}
		n.CreatedBy = actor
		n.UpdatedBy = actor
		n.CreatedAt = now
		n.UpdatedAt = now
		if err := s.repo.Create(ctx, n); err != nil {
			parsed.Reject(i, n.Name, "could not be saved")
			continue
		}
	}

	return parsed.Finish(), parsed, nil
}

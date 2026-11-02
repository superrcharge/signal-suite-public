package organization

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"backend/internal/shared/csvtable"
)

// Column widths, mirrored from dto/request.go and migration 046. Import writes
// through the repository rather than the DTO, so the validator's max= tags never
// run on an uploaded row and the limits have to be enforced here, in the Set
// that reads the cell.
const (
	maxNameLen       = 120
	maxShortLabelLen = 20
	maxColorLen      = 20
	maxNotesLen      = 1000
)

// capped trims v and refuses it when it runs past max characters, so a long cell
// is a row error naming the column rather than a database error after the fact.
func capped(field string, max int, v string) (string, error) {
	v = strings.TrimSpace(v)
	if utf8.RuneCountInString(v) > max {
		return "", fmt.Errorf("%s is longer than %d characters", field, max)
	}
	return v, nil
}

// csvTable is the single declaration the CSV export, the import template and the
// importer all read.
//
// Unlike the other reference libraries, the identity here is the key, which is
// typed by the person rather than minted by the server, so `key` is a settable
// column and there is no `id`. Import creates and never updates: a key is what
// operation participants point at and has no rename, so a row whose key already
// exists is refused as a duplicate rather than quietly rewriting an
// organization that operations are using.
var csvTable = csvtable.Table[Organization]{
	Domain:      "ORGANIZATION",
	Noun:        "organization",
	NounPlural:  "organizations",
	FilePrefix:  "signal-suite-organizations",
	Identity:    "key",
	LabelKey:    "key",
	ExampleRows: 2,
	New:         func() *Organization { return &Organization{} },

	Preamble: []string{
		"REQUIRED: key (case-insensitive unique, never changes) and name (case-insensitive unique).",
		"Key is a lowercase slug of letters, digits and underscores that starts with a letter or digit, at most 50 characters.",
		"Branch is one value from its list below, or blank for an organization that is not a service component.",
		"Section key links the organization to one of our own squadrons and must already exist; only one organization can link a section.",
		"Import only adds organizations. A key that already exists is skipped as a duplicate, because operations point at it.",
		"Delete the EXAMPLE rows and keep the header row. These # lines can stay: import skips them.",
	},

	Columns: []csvtable.Column[Organization]{
		{
			Key: "key", Label: "Key", Required: true,
			Get: csvtable.Str(func(o *Organization) string { return o.Key }),
			Set: func(o *Organization, v string) error {
				if strings.TrimSpace(v) == "" {
					o.Key = ""
					return nil
				}
				k, ok := NormaliseKey(v)
				if !ok {
					return errors.New(ErrOrganizationInvalidKey.Message)
				}
				o.Key = k
				return nil
			},
			Example: []string{"example_air_wing", "example_partner"},
		},
		{
			Key: "name", Label: "Name", Required: true,
			Get: csvtable.Str(func(o *Organization) string { return o.Name }),
			Set: func(o *Organization, v string) (err error) {
				o.Name, err = capped("name", maxNameLen, v)
				return err
			},
			Example: []string{"EXAMPLE AIR WING", "EXAMPLE PARTNER NATION"},
		},
		{
			Key: "short_label", Label: "Short Label",
			Note: "Short label: the badge an operation's participant rows show, at most 20 characters.",
			Get:  csvtable.Str(func(o *Organization) string { return o.ShortLabel }),
			Set: func(o *Organization, v string) (err error) {
				o.ShortLabel, err = capped("short label", maxShortLabelLen, v)
				return err
			},
			Example: []string{"EAW", "EPN"},
		},
		{
			// Closed, and rejected per row naming the value. Branch names ("Navy",
			// "Air Force") are accepted and stored as abbreviations, as the form
			// and the platform importer do.
			Key: "branch", Label: "Branch",
			Note: "Branch (closed list, or blank): USA | USMC | USN | USAF | USSF | USCG | OGA. OGA = other government agency, inside the government but outside the military.",
			Get:  csvtable.Str(func(o *Organization) string { return o.Branch }),
			Set: func(o *Organization, v string) error {
				b, err := resolveBranch(v)
				if err != nil {
					return fmt.Errorf("%q is not a branch; use USA, USMC, USN, USAF, USSF, USCG, OGA or leave it blank", strings.TrimSpace(v))
				}
				o.Branch = b
				return nil
			},
			Example: []string{"USAF", ""},
		},
		{
			Key: "color", Label: "Color",
			Note: "Color: a hex colour such as #3b82f6, at most 20 characters, or blank.",
			Get:  csvtable.Str(func(o *Organization) string { return o.Color }),
			Set: func(o *Organization, v string) (err error) {
				o.Color, err = capped("color", maxColorLen, v)
				return err
			},
			Example: []string{"#3b82f6", ""},
		},
		{
			Key: "section_key", Label: "Section Key",
			Note: "Section key: the squadron this organization is, which must already exist and not be linked by another organization. Blank for an outside organization.",
			Get:  csvtable.Str(func(o *Organization) string { return o.SectionKey }),
			Set: func(o *Organization, v string) (err error) {
				o.SectionKey, err = capped("section key", maxKeyLen, v)
				return err
			},
			Example: []string{""},
		},
		{
			Key: "notes", Label: "Notes",
			Get: csvtable.Str(func(o *Organization) string { return o.Notes }),
			Set: func(o *Organization, v string) (err error) {
				o.Notes, err = capped("notes", maxNotesLen, v)
				return err
			},
			Example: []string{"Delete me"},
		},

		// Server-owned.
		{
			Key: "created_by", Label: "Created By",
			Get: csvtable.Str(func(o *Organization) string { return o.CreatedBy }),
		},
		{
			Key: "updated_by", Label: "Updated By",
			Get: csvtable.Str(func(o *Organization) string { return o.UpdatedBy }),
		},
		{
			Key: "updated_at", Label: "Updated At",
			Get: csvtable.RFC3339(func(o *Organization) time.Time { return o.UpdatedAt }),
		},
		{
			Key: "created_at", Label: "Created At",
			Get: csvtable.RFC3339(func(o *Organization) time.Time { return o.CreatedAt }),
		},
	},
}

// CSVColumns is the wire shape of this domain's columns, for the generated
// frontend manifest.
func CSVColumns() []csvtable.ColumnMeta { return csvTable.Meta() }

// ExportableColumns is the full ordered column set, derived from csvTable.
var ExportableColumns = csvTable.Keys()

func boundCSV() (*csvtable.Bound[Organization], error) { return csvTable.Bind(nil) }

// ExportOrganizations returns the whole library as CSV.
func (s *Service) ExportOrganizations(ctx context.Context, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrOrganizationInternalError
	}
	items, err := s.repo.FindAll(ctx)
	if err != nil {
		return "", ErrOrganizationInternalError
	}
	return bound.Export(items, columns)
}

// GetImportTemplate returns the import template, optionally narrowed to columns.
func (s *Service) GetImportTemplate(_ context.Context, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrOrganizationInternalError
	}
	return bound.Template(columns)
}

// ImportOrganizations bulk-creates from a CSV body, reporting per-row errors.
//
// Rows go in one at a time rather than in one transaction, so a file with one
// bad row still lands the rest and the operator re-runs only what failed. The
// key is checked by the parser against the stored keys; the rules that live in
// other places - the name, which is unique case-insensitively, and the section
// link, which must exist and be unclaimed - are checked here, per row, the way
// the create route checks them.
func (s *Service) ImportOrganizations(ctx context.Context, csvBody, actor string) (int, *csvtable.ParseResult[Organization], error) {
	bound, err := boundCSV()
	if err != nil {
		return 0, nil, ErrOrganizationInternalError
	}

	existing, err := s.repo.FindAll(ctx)
	if err != nil {
		return 0, nil, ErrOrganizationInternalError
	}
	keys := make([]string, 0, len(existing))
	names := make(map[string]struct{}, len(existing))
	sections := make(map[string]struct{}, len(existing))
	for _, o := range existing {
		keys = append(keys, o.Key)
		names[strings.ToLower(o.Name)] = struct{}{}
		if o.SectionKey != "" {
			sections[o.SectionKey] = struct{}{}
		}
	}

	parsed, err := bound.Parse(csvBody, keys)
	if err != nil {
		return 0, nil, err
	}

	// Read once for the whole file rather than per row, as the platform importer
	// does for waveforms. Nil when the lister is not wired, which accepts any
	// section and leaves the foreign key to refuse it, as checkSection does.
	var known map[string]struct{}
	if s.section != nil {
		list, err := s.section.GetSectionKeys(ctx)
		if err != nil {
			return 0, nil, ErrOrganizationInternalError
		}
		known = make(map[string]struct{}, len(list))
		for _, k := range list {
			known[k] = struct{}{}
		}
	}

	now := time.Now().UTC()
	for i, item := range parsed.Rows {
		var rowErrs []string
		lowerName := strings.ToLower(item.Name)
		if _, taken := names[lowerName]; taken {
			rowErrs = append(rowErrs, "duplicate - name already exists")
		}
		if item.SectionKey != "" {
			if known != nil {
				if _, ok := known[item.SectionKey]; !ok {
					rowErrs = append(rowErrs, fmt.Sprintf("section_key %q is not a section", item.SectionKey))
				}
			}
			if _, taken := sections[item.SectionKey]; taken {
				rowErrs = append(rowErrs, fmt.Sprintf("section_key %q is already linked by another organization", item.SectionKey))
			}
		}
		if len(rowErrs) > 0 {
			parsed.Reject(i, item.Key, rowErrs...)
			continue
		}

		item.CreatedBy = actor
		item.UpdatedBy = actor
		item.CreatedAt = now
		item.UpdatedAt = now
		if err := s.repo.Create(ctx, item); err != nil {
			var coded *Error
			if errors.As(err, &coded) {
				parsed.Reject(i, item.Key, coded.Message)
			} else {
				parsed.Reject(i, item.Key, "could not be saved")
			}
			continue
		}
		// Claimed only once the row has landed, so a row refused above does not
		// make a later, valid one look like a duplicate of it.
		names[lowerName] = struct{}{}
		if item.SectionKey != "" {
			sections[item.SectionKey] = struct{}{}
		}
	}

	return parsed.Finish(), parsed, nil
}

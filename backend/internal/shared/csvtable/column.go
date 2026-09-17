package csvtable

import "strings"

// Column is one CSV column, declared once and read by all three operations.
type Column[T any] struct {
	// Key is the header cell and the token accepted in ?columns=. Lowercase
	// snake_case, matching the database column where one exists. One spelling,
	// so the export and the query parameter cannot disagree about a name.
	Key string

	// Label is what a column picker shows. Empty falls back to Key.
	Label string

	// Get renders this column for one row. Mandatory. Making it a field rather
	// than a switch case means the compiler catches an omission, where the old
	// switch just fell through to "".
	Get func(*T) string

	// Set parses one cell into the row being built. A nil Set means the column
	// is server-owned: absent from the template, and ignored on import even if
	// a file carries it. This is the single switch that makes a column
	// export-only, so there is no second flag to keep in agreement.
	Set func(*T, string) error

	// Required means a blank cell is a row error, and the column is force-included
	// in every template regardless of what the caller selected. See Bound.Template
	// for why that is not merely a convenience.
	Required bool

	// Default is substituted for a blank cell before Set runs. Terminal's status
	// uses it, which is why a blank status still imports as "available".
	Default string

	// Enum is the closed set of accepted cells, checked before Set runs. Empty
	// means no membership check.
	Enum []string

	// EnumFold compares Enum case-insensitively.
	EnumFold bool

	// DynamicEnum names a vocabulary supplied per request, for a column whose
	// legal values live in another domain's table - section keys being the only
	// current case. Bind fails when the vocabulary is missing rather than letting
	// the column quietly accept anything.
	DynamicEnum string

	// Note is this column's template comment line, without the leading "# ".
	// Printed only when the column is actually in the template, so a template
	// built without pop_pin does not spend a line explaining pop_pin.
	//
	// A column with a DynamicEnum leaves this empty and gets a line built from
	// the bound vocabulary instead.
	Note string

	// Example holds this column's cell in each EXAMPLE row. Short slices pad with
	// blanks, which is what makes "every example row has exactly as many fields
	// as the header" structural rather than a hand-counted string of commas. That
	// arity bug is real: kit and terminal each carry a round-trip test for it.
	Example []string

	// RejectOnImport makes a file carrying this header a hard failure instead of
	// a silent ignore. Set on id. See ErrImportHasServerColumn.
	RejectOnImport bool
}

// templatable reports whether a human can supply this column.
func (c *Column[T]) templatable() bool { return c.Set != nil }

func (c *Column[T]) label() string {
	if c.Label != "" {
		return c.Label
	}
	return c.Key
}

// Table is a domain's whole CSV contract, declared as a package-level var beside
// the model the way ExportableColumns is today.
type Table[T any] struct {
	// Domain prefixes every error code: "TERMINAL" gives
	// TERMINAL_INVALID_EXPORT_COLUMN, matching what ships now.
	Domain string

	// Noun and NounPlural build the import result message.
	Noun, NounPlural string

	// FilePrefix is the download filename stem: "signal-suite-terminals" produces
	// signal-suite-terminals-20260824.csv.
	FilePrefix string

	// Columns in canonical output order. Export and template both emit in this
	// order whatever order the caller asked for, so two exports of the same
	// selection are byte-identical.
	Columns []Column[T]

	// Identity is the key of the column that must be unique, compared
	// case-insensitively against both stored rows and the rest of the file. Its
	// absence from an uploaded header is a hard failure. Empty means the domain
	// has no unique key - contracts, where two rows may legitimately share a
	// title across fiscal years.
	Identity string

	// LabelKey is the column whose value names a row in an error. Defaults to
	// Identity. A domain with no Identity sets this so its errors still say which
	// row went wrong.
	LabelKey string

	// Preamble is the template's leading comment lines, before the per-column notes.
	Preamble []string

	// New allocates the row that import writes into. Nil makes the table
	// export-only: Parse refuses, which is a structural guarantee rather than a
	// convention someone has to remember.
	New func() *T

	// Check runs after every column on a row and returns the errors no single
	// column can see - terminal's "pop_pin only applies to Starshield". It
	// receives the raw cells as well as the built row, because that is what the
	// current code does: an invalid model together with a pop_pin reports both
	// problems rather than one.
	Check func(*T, Row) []string

	// ExampleRows is how many EXAMPLE rows the template prints.
	ExampleRows int
}

// Row is one CSV record keyed by header name, already trimmed.
type Row map[string]string

// Vocab supplies the request-time values of DynamicEnum columns.
type Vocab map[string][]string

// ColumnMeta is the non-generic projection of a column, for handing to a client
// so a picker is generated from this declaration rather than hand-copied.
type ColumnMeta struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Required    bool   `json:"required"`
	Templatable bool   `json:"templatable"`
	Note        string `json:"note,omitempty"`
}

// Keys returns every column key in canonical order.
func (t *Table[T]) Keys() []string {
	keys := make([]string, len(t.Columns))
	for i := range t.Columns {
		keys[i] = t.Columns[i].Key
	}
	return keys
}

// Meta returns the wire shape of every column, in canonical order.
func (t *Table[T]) Meta() []ColumnMeta {
	out := make([]ColumnMeta, len(t.Columns))
	for i := range t.Columns {
		c := &t.Columns[i]
		out[i] = ColumnMeta{
			Key:         c.Key,
			Label:       c.label(),
			Required:    c.Required,
			Templatable: c.templatable(),
			Note:        c.Note,
		}
	}
	return out
}

// column finds a column by key.
func (t *Table[T]) column(key string) *Column[T] {
	for i := range t.Columns {
		if t.Columns[i].Key == key {
			return &t.Columns[i]
		}
	}
	return nil
}

// labelKey is the column naming a row in errors.
func (t *Table[T]) labelKey() string {
	if t.LabelKey != "" {
		return t.LabelKey
	}
	return t.Identity
}

// Bound is a Table with its request-time vocabularies resolved. Export, Template
// and Parse all hang off it, so a dynamic column validates identically in all
// three rather than only in the one that remembered to check.
type Bound[T any] struct {
	tbl   *Table[T]
	vocab Vocab
}

// Bind resolves the table's dynamic vocabularies. It fails when a column names a
// vocabulary that was not supplied, because the alternative is that column
// silently accepting anything.
func (t *Table[T]) Bind(v Vocab) (*Bound[T], error) {
	for i := range t.Columns {
		c := &t.Columns[i]
		if c.DynamicEnum == "" {
			continue
		}
		if _, ok := v[c.DynamicEnum]; !ok {
			return nil, ErrUnknownVocabulary(t.Domain, c.Key, c.DynamicEnum)
		}
	}
	return &Bound[T]{tbl: t, vocab: v}, nil
}

// Table exposes the underlying declaration.
func (b *Bound[T]) Table() *Table[T] { return b.tbl }

// Meta returns the wire shape of every column, in canonical order.
func (b *Bound[T]) Meta() []ColumnMeta { return b.tbl.Meta() }

// allowed returns the accepted values for a column: its static Enum, or the
// bound vocabulary when it declares a dynamic one.
func (b *Bound[T]) allowed(c *Column[T]) []string {
	if c.DynamicEnum != "" {
		return b.vocab[c.DynamicEnum]
	}
	return c.Enum
}

// permits reports whether a cell is in a column's accepted set. A column with no
// accepted set permits everything.
func (b *Bound[T]) permits(c *Column[T], cell string) bool {
	allowed := b.allowed(c)
	if len(allowed) == 0 {
		return true
	}
	for _, a := range allowed {
		if a == cell || (c.EnumFold && strings.EqualFold(a, cell)) {
			return true
		}
	}
	return false
}

// resolve turns a requested column selection into canonical order, rejecting
// unknown keys. An empty selection means every column, matching what the export
// endpoints already do with an absent ?columns=.
func (b *Bound[T]) resolve(requested []string) ([]string, error) {
	if len(requested) == 0 {
		return b.tbl.Keys(), nil
	}
	chosen := make(map[string]bool, len(requested))
	for _, key := range requested {
		if b.tbl.column(key) == nil {
			return nil, ErrInvalidExportColumn(b.tbl.Domain, key, b.tbl.Keys())
		}
		chosen[key] = true
	}
	// Canonical order, not the caller's, so the same selection always renders the
	// same bytes however the query string was written.
	var out []string
	for _, key := range b.tbl.Keys() {
		if chosen[key] {
			out = append(out, key)
		}
	}
	return out, nil
}

package csvtable

import (
	"fmt"
	"strings"
)

// Template renders the import template: comment lines, a header row, and the
// EXAMPLE rows.
//
// An empty columns slice means every templatable column. Server-owned columns
// are dropped silently rather than rejected - asking for updated_at in a template
// is not an error, it is just not something a person can supply, and erroring
// would force clients to maintain a second column list, which is precisely the
// drift this package exists to remove.
//
// Required columns are always present. A template missing one produces a file
// that cannot import, so the three options were: emit it anyway and hand the
// user a broken file, reject with an error and push the rule out to every
// client, or put the column back. The third is the only one that is both correct
// and keeps the rule in one place. When the caller actually deselected a
// required column, one extra comment line says so, because silently overriding
// someone teaches them nothing. A picker renders required columns checked and
// disabled, so that line is only ever seen by a hand-built URL or a stale
// client, which is exactly who needs telling.
func (b *Bound[T]) Template(columns []string) (string, error) {
	requested, err := b.resolve(columns)
	if err != nil {
		return "", err
	}

	keep := make(map[string]bool, len(requested))
	for _, key := range requested {
		if b.tbl.column(key).templatable() {
			keep[key] = true
		}
	}

	var addedBack []string
	for i := range b.tbl.Columns {
		c := &b.tbl.Columns[i]
		if c.Required && c.templatable() && !keep[c.Key] {
			keep[c.Key] = true
			addedBack = append(addedBack, c.Key)
		}
	}

	var cols []*Column[T]
	for i := range b.tbl.Columns {
		if c := &b.tbl.Columns[i]; keep[c.Key] {
			cols = append(cols, c)
		}
	}
	if len(cols) == 0 {
		return "", ErrInvalidExportColumn(b.tbl.Domain, "(none templatable)", b.tbl.Keys())
	}

	var lines []string
	for _, p := range b.tbl.Preamble {
		lines = append(lines, "# "+p)
	}
	if len(addedBack) > 0 {
		lines = append(lines, fmt.Sprintf(
			"# %s added back: a file without it cannot be imported.",
			strings.Join(addedBack, ", ")))
	}
	// Notes follow the columns they describe, so a template built without a
	// column does not spend a line explaining it.
	for _, c := range cols {
		if note := b.note(c); note != "" {
			lines = append(lines, "# "+note)
		}
	}

	header := make([]string, len(cols))
	for i, c := range cols {
		header[i] = c.Key
	}
	lines = append(lines, strings.Join(header, ","))

	// Every example row is built column-by-column, so it always has exactly as
	// many fields as the header. Hand-typed example rows drift out of arity the
	// moment a column moves, and encoding/csv rejects the whole template when
	// they do - a trap both existing domains carry a test for.
	for r := 0; r < b.tbl.ExampleRows; r++ {
		cells := make([]string, len(cols))
		for i, c := range cols {
			if r < len(c.Example) {
				cells[i] = c.Example[r]
			}
		}
		lines = append(lines, strings.Join(cells, ","))
	}

	return strings.Join(lines, "\n"), nil
}

// note is a column's template comment. A column with a dynamic vocabulary builds
// its line from the bound values rather than restating them in the declaration,
// where they would go stale the moment a section was added. Its Note is read as
// the prefix in that case, so a column labelled "Section" in a picker can still
// head its template line with "Sections".
func (b *Bound[T]) note(c *Column[T]) string {
	if c.DynamicEnum == "" {
		return c.Note
	}
	prefix := c.Note
	if prefix == "" {
		prefix = c.label()
	}
	return prefix + ": " + strings.Join(b.vocab[c.DynamicEnum], " | ")
}

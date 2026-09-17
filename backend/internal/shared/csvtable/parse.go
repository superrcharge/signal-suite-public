package csvtable

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"
)

// RowError is one rejected row: which line, what it was called, and everything
// wrong with it. Every problem on a row is collected rather than stopping at the
// first, so a user fixes their file in one pass instead of ten.
type RowError struct {
	Row    int
	Name   string
	Errors []string
}

// ParseResult is the outcome of reading an uploaded file.
type ParseResult[T any] struct {
	Rows   []*T
	Errors []RowError
}

// Parse reads an uploaded CSV body into rows, collecting per-row errors.
//
// existing is the set of identity values already stored, compared
// case-insensitively. Rows are checked against it and against each other, so a
// file that duplicates itself is caught without a database round trip per row.
func (b *Bound[T]) Parse(raw string, existing []string) (*ParseResult[T], error) {
	t := b.tbl
	if t.New == nil {
		return nil, ErrImportNotSupported(t.Domain)
	}

	lines := filterLines(raw)
	if len(lines) < 2 {
		return nil, ErrInvalidCSV(t.Domain)
	}

	r := csv.NewReader(strings.NewReader(strings.Join(lines, "\n")))
	headers, err := r.Read()
	if err != nil {
		return nil, ErrInvalidCSV(t.Domain)
	}
	for i, h := range headers {
		headers[i] = strings.TrimSpace(strings.ToLower(h))
	}

	present := make(map[string]bool, len(headers))
	for _, h := range headers {
		present[h] = true
	}

	// A server-owned column that must not be silently ignored. See
	// ErrImportHasServerColumn for why this one is loud when the others are not.
	for i := range t.Columns {
		c := &t.Columns[i]
		if c.RejectOnImport && present[c.Key] {
			return nil, ErrImportHasServerColumn(t.Domain, c.Key)
		}
	}

	if t.Identity != "" && !present[t.Identity] {
		return nil, ErrMissingIdentityColumn(t.Domain, t.Identity)
	}

	taken := make(map[string]bool, len(existing))
	for _, e := range existing {
		taken[strings.ToLower(e)] = true
	}
	seen := make(map[string]bool)

	result := &ParseResult[T]{Errors: []RowError{}}
	rowNum := 1
	for {
		fields, err := r.Read()
		if err != nil {
			break
		}
		rowNum++

		row := make(Row, len(headers))
		for i, h := range headers {
			if i < len(fields) {
				row[h] = strings.TrimSpace(fields[i])
			}
		}

		item := t.New()
		errs := b.applyRow(item, row, present)

		// Check runs even when a column failed, because the rules it encodes are
		// about the raw cells. Terminal reports an invalid model and a misplaced
		// pop_pin together rather than making the user resubmit to find the second.
		if t.Check != nil {
			errs = append(errs, t.Check(item, row)...)
		}

		if t.Identity != "" {
			errs = append(errs, b.checkIdentity(row, taken, seen)...)
		}

		if len(errs) > 0 {
			result.Errors = append(result.Errors, RowError{
				Row:    rowNum,
				Name:   b.rowLabel(row),
				Errors: errs,
			})
			continue
		}
		result.Rows = append(result.Rows, item)
	}

	return result, nil
}

// applyRow runs every settable column against one record.
func (b *Bound[T]) applyRow(item *T, row Row, present map[string]bool) []string {
	var errs []string
	for i := range b.tbl.Columns {
		c := &b.tbl.Columns[i]
		if c.Set == nil {
			continue
		}

		cell, given := row[c.Key], present[c.Key]
		if cell == "" && c.Default != "" {
			cell = c.Default
		}

		if cell == "" {
			if c.Required {
				errs = append(errs, fmt.Sprintf("%s is required", c.Key))
				continue
			}
			// An absent column and a blank cell both mean "not supplied". Still run
			// Set so nullable fields land as NULL rather than keeping a zero value.
			if !given {
				if err := c.Set(item, ""); err != nil {
					errs = append(errs, fmt.Sprintf("invalid %s: %s", c.Key, err))
				}
				continue
			}
		}

		if cell != "" && !b.permits(c, cell) {
			errs = append(errs, fmt.Sprintf(
				"invalid %s %q - valid values: %s",
				c.Key, cell, strings.Join(b.allowed(c), ", ")))
			continue
		}

		// Same shape as the enum message above, so every cell-level problem reads
		// the same way regardless of which check rejected it.
		if err := c.Set(item, cell); err != nil {
			errs = append(errs, fmt.Sprintf("invalid %s %q - %s", c.Key, cell, err))
		}
	}
	return errs
}

// checkIdentity rejects a row whose identity is already stored or already used
// earlier in the same file. Import creates, so either is a conflict.
func (b *Bound[T]) checkIdentity(row Row, taken, seen map[string]bool) []string {
	value := row[b.tbl.Identity]
	if value == "" {
		return nil // already reported as required
	}
	lower := strings.ToLower(value)
	switch {
	case taken[lower]:
		return []string{fmt.Sprintf("duplicate - %s already exists", b.tbl.Identity)}
	case seen[lower]:
		return []string{fmt.Sprintf("duplicate - %s appears more than once in this file", b.tbl.Identity)}
	default:
		seen[lower] = true
		return nil
	}
}

// rowLabel names a row in an error message.
func (b *Bound[T]) rowLabel(row Row) string {
	if key := b.tbl.labelKey(); key != "" {
		if v := row[key]; v != "" {
			return v
		}
	}
	return "(blank)"
}

// filterLines drops blank lines and # comments, so a template can be filled in
// and uploaded without deleting its own instructions first.
func filterLines(raw string) []string {
	var lines []string
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimRight(line, "\r")
		if trimmed := strings.TrimSpace(line); trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			lines = append(lines, line)
		}
	}
	return lines
}

// ImportStatus is the HTTP status for an import outcome: 400 when every row
// failed, 207 whenever anything was written. A completely clean import is 207
// too. That is the rule terminals and kits already ship and the frontend already
// reads, so it is preserved rather than tidied.
func ImportStatus(imported, failed int) int {
	if imported == 0 && failed > 0 {
		return http.StatusBadRequest
	}
	return http.StatusMultiStatus
}

// ImportMessage builds "Imported 3 terminals, 1 row skipped." exactly as the two
// existing services build it.
func ImportMessage(noun, plural string, imported, failed int) string {
	parts := []string{fmt.Sprintf("Imported %d %s", imported, pick(imported, noun, plural))}
	if failed > 0 {
		parts = append(parts, fmt.Sprintf("%d %s skipped", failed, pick(failed, "row", "rows")))
	}
	return strings.Join(parts, ", ") + "."
}

func pick(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

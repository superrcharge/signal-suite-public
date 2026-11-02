package csvtable

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
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
//
// Lines runs parallel to Rows: Lines[i] is the line of the file Rows[i] came
// from. A service that rejects a row after parsing reports that line, not its
// position in Rows - Rows holds only the rows that passed, so an index into it
// stops matching the file after the first rejection.
type ParseResult[T any] struct {
	Rows   []*T
	Lines  []int
	Errors []RowError

	rejected map[int]bool
}

// Reject records that Rows[i] failed after parsing - a rule the parser cannot
// see, or a failed save - numbered by the line it came from. The row stays in
// Rows until Finish, so indexes held by the caller's loop stay valid.
//
// It exists because six services each wrote `Row: i + 2`, which is right only
// until the parser rejects a row: Rows holds just the rows that passed, so
// every later number came out short.
func (p *ParseResult[T]) Reject(i int, name string, reasons ...string) {
	if p.rejected == nil {
		p.rejected = make(map[int]bool)
	}
	p.rejected[i] = true
	p.Errors = append(p.Errors, RowError{Row: p.Lines[i], Name: name, Errors: reasons})
}

// Finish drops the rejected rows, keeping Lines aligned with what is left,
// orders the errors by line, and returns the HTTP status for the outcome.
//
// Ordered because service rejections are appended after the parser's, and a
// report that jumps from row 40 back to row 3 reads as two separate lists.
func (p *ParseResult[T]) Finish() int {
	if len(p.rejected) > 0 {
		rows := make([]*T, 0, len(p.Rows)-len(p.rejected))
		lines := make([]int, 0, cap(rows))
		for i, row := range p.Rows {
			if !p.rejected[i] {
				rows = append(rows, row)
				lines = append(lines, p.Lines[i])
			}
		}
		p.Rows, p.Lines, p.rejected = rows, lines, nil
	}
	sort.SliceStable(p.Errors, func(i, j int) bool { return p.Errors[i].Row < p.Errors[j].Row })
	return ImportStatus(len(p.Rows), len(p.Errors))
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

	lines, content := filterLines(raw)
	if content < 2 {
		return nil, ErrInvalidCSV(t.Domain)
	}

	r := csv.NewReader(strings.NewReader(strings.Join(lines, "\n")))
	// Row width is checked below, per row. The reader's own check fails the
	// read, and a failed read used to end the loop: one short row silently
	// dropped itself and every row after it.
	r.FieldsPerRecord = -1
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
	for {
		fields, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			// A malformed row - a stray quote, usually - is reported at the line it
			// starts on and the rest of the file still imports. An unterminated
			// quote can swallow everything after it; that is still one reported
			// row rather than a silent stop.
			line := 0
			var pe *csv.ParseError
			if errors.As(err, &pe) {
				line = pe.StartLine
			}
			result.Errors = append(result.Errors, RowError{
				Row:    line,
				Name:   "(unreadable)",
				Errors: []string{fmt.Sprintf("could not be read: %s", csvErrText(err))},
			})
			continue
		}
		// The line the record starts on, counted in the file as uploaded: comment
		// and blank lines were blanked rather than removed, so this is the row a
		// spreadsheet shows with the template's instructions left in.
		rowNum, _ := r.FieldPos(0)

		// More cells than headers means the extra ones have nowhere to go, and it
		// is nearly always an unquoted comma shifting every later cell one column
		// right. Fewer is fine: trailing blank cells are commonly trimmed by
		// spreadsheet tools, and a missing cell reads as blank.
		if len(fields) > len(headers) {
			result.Errors = append(result.Errors, RowError{
				Row:  rowNum,
				Name: firstNonEmpty(fields),
				Errors: []string{fmt.Sprintf(
					"has %d cells but the header has %d - a comma inside a value needs the value in double quotes",
					len(fields), len(headers))},
			})
			continue
		}

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
		result.Lines = append(result.Lines, rowNum)
	}

	return result, nil
}

// csvErrText is a ParseError's reason without the "record on line N" prefix,
// since the row column already says which line.
func csvErrText(err error) string {
	var pe *csv.ParseError
	if errors.As(err, &pe) {
		return pe.Err.Error()
	}
	return err.Error()
}

// firstNonEmpty names a row that could not be mapped onto the header, where the
// identity column cannot be trusted to hold the identity.
func firstNonEmpty(fields []string) string {
	for _, f := range fields {
		if v := strings.TrimSpace(f); v != "" {
			return v
		}
	}
	return "(blank)"
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

// filterLines blanks # comments, so a template can be filled in and uploaded
// without deleting its own instructions first. It returns every line and the
// count of lines with content.
//
// Blanked, not removed. encoding/csv skips empty lines on its own, so removing
// them bought nothing and cost the line numbers: every row reported short by
// the number of comment lines above it, which on the template is eight, so a
// user told "row 6" looked at the wrong platform.
func filterLines(raw string) ([]string, int) {
	lines := strings.Split(raw, "\n")
	content := 0
	for i, line := range lines {
		line = strings.TrimRight(line, "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			lines[i] = ""
			continue
		}
		lines[i] = line
		content++
	}
	return lines, content
}

// ImportStatus is the HTTP status for an import outcome: 400 when every row
// failed, 207 whenever anything was written. A completely clean import is 207
// too. That is the rule terminals and kits already ship, so it is preserved
// rather than tidied.
//
// The 400 still carries the ordinary success envelope with the full row report,
// because the row reasons are the whole point of the response. A client must
// read the body before treating the status as an error: the frontend's generic
// handler did not, and showed "Import failed" over the list of reasons.
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

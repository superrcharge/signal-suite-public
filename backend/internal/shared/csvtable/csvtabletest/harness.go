// Package csvtabletest runs the structural checks every domain's CSV table must
// pass, so a domain buys the whole guarantee with one call instead of nine
// hand-written near-copies that each drift on their own.
//
// It lives outside a _test.go file for the same reason httptest does: the tests
// that need it are in other packages.
package csvtabletest

import (
	"encoding/csv"
	"slices"
	"strings"
	"testing"

	"backend/internal/shared/csvtable"
)

// Suite asserts everything structural about a bound table.
//
// wantKeys is the full column list written out by hand at the call site. It is
// deliberately not derived from the table: that literal IS the pin. A column
// list that can change without a test changing is how the templates drifted from
// the export lists in the first place.
//
// sample is one representative row, used to check the export round trip. Pass nil
// to skip that check.
func Suite[T any](t *testing.T, b *csvtable.Bound[T], wantKeys []string, sample *T) {
	t.Helper()

	tbl := b.Table()

	t.Run("columns are pinned", func(t *testing.T) {
		if got := tbl.Keys(); !slices.Equal(got, wantKeys) {
			t.Errorf("column drift\n got: %v\nwant: %v\n\n"+
				"If this change is intended, update the literal above and check that the\n"+
				"frontend picker and the import template moved with it.", got, wantKeys)
		}
	})

	t.Run("every column can render", func(t *testing.T) {
		for _, m := range b.Meta() {
			if m.Label == "" {
				t.Errorf("column %q has no label", m.Key)
			}
		}
	})

	t.Run("export emits canonical order", func(t *testing.T) {
		body, err := b.Export(nil, nil)
		if err != nil {
			t.Fatalf("export all: %v", err)
		}
		header := firstRecord(t, body)
		if !slices.Equal(header, wantKeys) {
			t.Errorf("export header\n got: %v\nwant: %v", header, wantKeys)
		}

		// Ask in reverse; the output must not change.
		reversed := slices.Clone(wantKeys)
		slices.Reverse(reversed)
		body, err = b.Export(nil, reversed)
		if err != nil {
			t.Fatalf("export reversed: %v", err)
		}
		if header := firstRecord(t, body); !slices.Equal(header, wantKeys) {
			t.Errorf("a reversed selection changed the output order\n got: %v\nwant: %v", header, wantKeys)
		}
	})

	t.Run("unknown column is rejected", func(t *testing.T) {
		if _, err := b.Export(nil, []string{"definitely_not_a_column"}); err == nil {
			t.Error("expected an error for an unknown export column, got nil")
		}
	})

	if tbl.New == nil {
		t.Run("export-only table refuses import", func(t *testing.T) {
			if _, err := b.Parse("a,b\n1,2", nil); err == nil {
				t.Error("a table with no New must refuse to parse, got nil error")
			}
		})
		return
	}

	t.Run("template is well formed", func(t *testing.T) {
		body, err := b.Template(nil)
		if err != nil {
			t.Fatalf("template: %v", err)
		}
		records := parseAll(t, stripComments(body))
		if len(records) < 2 {
			t.Fatalf("template needs a header and at least one example row, got %d record(s)", len(records))
		}
		// The encoding/csv arity trap: a template whose example rows do not match
		// its header cannot be re-imported, and the failure names a line number
		// rather than the cause.
		for i, rec := range records[1:] {
			if len(rec) != len(records[0]) {
				t.Errorf("example row %d has %d fields, header has %d", i+1, len(rec), len(records[0]))
			}
		}

		for _, m := range b.Meta() {
			inTemplate := slices.Contains(records[0], m.Key)
			switch {
			case m.Required && !inTemplate:
				t.Errorf("required column %q is missing from the template", m.Key)
			case !m.Templatable && inTemplate:
				t.Errorf("server-owned column %q must not be in the template", m.Key)
			}
		}
	})

	t.Run("template keeps required columns when they are deselected", func(t *testing.T) {
		var optional []string
		var required []string
		for _, m := range b.Meta() {
			if m.Required {
				required = append(required, m.Key)
			} else if m.Templatable {
				optional = append(optional, m.Key)
			}
		}
		if len(required) == 0 || len(optional) == 0 {
			t.Skip("table has no required or no optional column to exercise this with")
		}

		body, err := b.Template(optional)
		if err != nil {
			t.Fatalf("template: %v", err)
		}
		header := parseAll(t, stripComments(body))[0]
		for _, key := range required {
			if !slices.Contains(header, key) {
				t.Errorf("required column %q was dropped when it was not selected", key)
			}
		}
		if !strings.Contains(body, "added back") {
			t.Error("a template that re-added a required column must say so in a comment")
		}
	})

	t.Run("the template can be imported", func(t *testing.T) {
		// The check whose absence let the hand-typed template headers drift away
		// from the column lists. If a template cannot feed the importer that reads
		// it, the template is wrong however good it looks.
		body, err := b.Template(nil)
		if err != nil {
			t.Fatalf("template: %v", err)
		}
		records := parseAll(t, stripComments(body))
		if len(records) < 2 {
			t.Fatalf("template has no example row to import")
		}

		var buf strings.Builder
		w := csv.NewWriter(&buf)
		if err := w.WriteAll(records[:2]); err != nil {
			t.Fatalf("rebuild: %v", err)
		}
		w.Flush()

		result, err := b.Parse(buf.String(), nil)
		if err != nil {
			t.Fatalf("parsing the template's own example row failed: %v", err)
		}
		for _, re := range result.Errors {
			t.Errorf("template example row %d (%s) does not satisfy its own importer: %v",
				re.Row, re.Name, re.Errors)
		}
	})

	if sample != nil {
		t.Run("an exported file is refused by import", func(t *testing.T) {
			var rejected string
			for _, m := range b.Meta() {
				if !m.Templatable && m.Key == "id" {
					rejected = m.Key
				}
			}
			if rejected == "" {
				t.Skip("table has no rejected server-owned column")
			}
			body, err := b.Export([]*T{sample}, nil)
			if err != nil {
				t.Fatalf("export: %v", err)
			}
			if _, err := b.Parse(body, nil); err == nil {
				t.Error("an exported file carries id and must be refused, got nil error")
			}
		})
	}
}

func stripComments(body string) string {
	var keep []string
	for _, line := range strings.Split(body, "\n") {
		if trimmed := strings.TrimSpace(line); trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			keep = append(keep, line)
		}
	}
	return strings.Join(keep, "\n")
}

func parseAll(t *testing.T, body string) [][]string {
	t.Helper()
	// FieldsPerRecord -1 so arity problems are reported by this test with a useful
	// message, rather than as an opaque parse error.
	r := csv.NewReader(strings.NewReader(body))
	r.FieldsPerRecord = -1
	records, err := r.ReadAll()
	if err != nil {
		t.Fatalf("not parseable as csv: %v", err)
	}
	if len(records) == 0 {
		t.Fatal("no csv records")
	}
	return records
}

func firstRecord(t *testing.T, body string) []string {
	t.Helper()
	return parseAll(t, body)[0]
}

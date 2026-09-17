package csvtable

import (
	"encoding/csv"
	"strings"
)

// Export renders rows as a CSV body.
//
// An empty columns slice means every column. Whatever the caller asked for is
// emitted in the table's canonical order, so the same selection always produces
// the same bytes regardless of how the query string was written.
func (b *Bound[T]) Export(rows []*T, columns []string) (string, error) {
	headers, err := b.resolve(columns)
	if err != nil {
		return "", err
	}

	getters := make([]func(*T) string, len(headers))
	for i, key := range headers {
		getters[i] = b.tbl.column(key).Get
	}

	var buf strings.Builder
	w := csv.NewWriter(&buf)
	if err := w.Write(headers); err != nil {
		return "", err
	}
	cells := make([]string, len(headers))
	for _, row := range rows {
		for i, get := range getters {
			cells[i] = get(row)
		}
		if err := w.Write(cells); err != nil {
			return "", err
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return "", err
	}
	return buf.String(), nil
}

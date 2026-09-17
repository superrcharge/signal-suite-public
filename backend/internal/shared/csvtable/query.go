package csvtable

import "strings"

// ParseList splits a comma-separated query parameter into trimmed values,
// returning nil for an absent or empty one so callers can test with len().
//
// This is the parseCSVQuery that terminal, kit and contract each carried an
// identical copy of.
func ParseList(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if v := strings.TrimSpace(p); v != "" {
			out = append(out, v)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// Package branch owns the closed branch vocabulary that more than one domain
// uses. It lives here, not in a domain, because domains may not import each
// other; shared code lives under internal/shared.
package branch

import (
	"slices"
	"strings"
)

// Valid is the closed branch vocabulary, in order of precedence: the six armed
// services, then OGA for an agency inside the government but outside the
// military. Closed because the set of branches is not something an exercise
// extends - migration 044 enforces the same list with a CHECK. SOCOM is
// deliberately absent: it is a combatant command, and its platforms belong to
// the service that fields them.
//
// It is a literal, not computed, because scripts/check-docs.mjs reads it to
// hold the glossary to the code.
var Valid = []string{"USA", "USMC", "USN", "USAF", "USSF", "USCG", "OGA"}

// aliases lets an import or a client name a branch the way people say
// it. Keys are upper-cased with whitespace collapsed.
var aliases = map[string]string{
	"ARMY": "USA", "US ARMY": "USA", "ARNG": "USA",
	"MARINES": "USMC", "MARINE CORPS": "USMC", "US MARINE CORPS": "USMC",
	"NAVY": "USN", "US NAVY": "USN",
	"AIR FORCE": "USAF", "US AIR FORCE": "USAF", "ANG": "USAF",
	"SPACE FORCE": "USSF", "US SPACE FORCE": "USSF",
	"COAST GUARD": "USCG", "US COAST GUARD": "USCG",
}

// canon upper-cases v, collapses whitespace and applies an alias.
func canon(v string) string {
	v = strings.Join(strings.Fields(strings.ToUpper(v)), " ")
	if alias, ok := aliases[v]; ok {
		return alias
	}
	return v
}

// Normalise maps each value to its branch, drops blanks and repeats, and
// returns the branches in precedence order. The second result lists the
// values that are not a branch, spelled as given, so a caller can say which.
func Normalise(in []string) (branches []string, unknown []string) {
	have := make(map[string]bool, len(in))
	for _, raw := range in {
		v := canon(raw)
		if v == "" {
			continue
		}
		if !slices.Contains(Valid, v) {
			unknown = append(unknown, strings.TrimSpace(raw))
			continue
		}
		have[v] = true
	}
	branches = make([]string, 0, len(have))
	for _, b := range Valid {
		if have[b] {
			branches = append(branches, b)
		}
	}
	return branches, unknown
}

// NormaliseOne trims, upper-cases and applies an alias to a single value. It
// returns the canonical branch and whether it is one; blank is not.
func NormaliseOne(v string) (string, bool) {
	c := canon(v)
	if c == "" {
		return "", false
	}
	return c, slices.Contains(Valid, c)
}

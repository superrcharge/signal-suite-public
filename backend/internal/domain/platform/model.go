package platform

import (
	"slices"
	"strings"
	"time"

	"backend/internal/shared/branch"
)

// Platform is an external comms platform: an airframe, ship, vehicle or site
// that is not a piece of equipment we hold. It has no SWAP, power or gain, which
// is the whole reason it is not an equipment row - see migration 040.
type Platform struct {
	ID          string
	Designation string
	PopularName string
	// Category is the branch or branches that operate the platform, drawn from
	// Branches and stored in that order. Empty means none has been set.
	Category []string
	// Type is one of Types. Stored lowercased.
	Type            string
	WaveformAbbrevs []string
	EquipmentIDs    []string
	Notes           string
	CreatedBy       string
	UpdatedBy       string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// Branches is the closed category vocabulary, in order of precedence. The
// literal, and the check-docs glossary entry that reads it, now live in
// shared/branch so a second domain can use the list without importing this one.
var Branches = branch.Valid

// Types is the closed platform type vocabulary. It was an open "kind" until
// migration 045: an open list let a free-text value in through import -
// "launch platform", on one row - and every such value became a filter chip on
// the library and the matrix. The same list is the CHECK in 045, widened by
// 050: a UAV is an aircraft nobody talks to from inside it, so it is its own
// type rather than an aircraft, and an operation's matrix can tell the two
// apart.
var Types = []string{"aircraft", "uav", "ship", "ground vehicle", "ground station"}

// NormaliseCategory maps each value to its branch, drops blanks and repeats,
// and returns the branches in precedence order. The second result lists the
// values that are not a branch, spelled as given, so a caller can say which.
func NormaliseCategory(in []string) ([]string, []string) {
	return branch.Normalise(in)
}

// The column default in migration 040. A blank type becomes this rather than
// an error, so a client that does not care still gets a usable row.
const defaultType = "aircraft"

// NormaliseType lowercases, trims, collapses internal whitespace and turns
// underscores into spaces, so "Ship", "ship " and "ground_vehicle" land on a
// listed type; blank becomes "aircraft". ok is false for anything that is not
// one of Types after that.
func NormaliseType(v string) (string, bool) {
	s := strings.Join(strings.Fields(strings.ToLower(strings.ReplaceAll(v, "_", " "))), " ")
	if s == "" {
		return defaultType, true
	}
	return s, slices.Contains(Types, s)
}

// NormaliseAbbrevs trims each abbrev, drops blanks, and drops a repeat that
// differs only by case, keeping the first spelling. Abbrevs are compared
// case-insensitively everywhere they are read, so storing "L16" and "l16" side
// by side would be one waveform listed twice.
func NormaliseAbbrevs(in []string) []string {
	return dedupe(in, strings.ToLower)
}

// NormaliseIDs trims each id, drops blanks and exact repeats. An id naming a
// record that no longer exists is kept: the matrix tolerates a dangling
// reference, and dropping it here would lose data the moment a radio is
// briefly deleted and re-imported.
func NormaliseIDs(in []string) []string {
	return dedupe(in, func(s string) string { return s })
}

func dedupe(in []string, key func(string) string) []string {
	out := make([]string, 0, len(in))
	seen := make(map[string]bool, len(in))
	for _, raw := range in {
		v := strings.TrimSpace(raw)
		if v == "" || seen[key(v)] {
			continue
		}
		seen[key(v)] = true
		out = append(out, v)
	}
	return out
}

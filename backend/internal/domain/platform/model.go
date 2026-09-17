package platform

import (
	"regexp"
	"strings"
	"time"
)

// Platform is an external comms platform: an airframe, ship, vehicle or site
// that is not a piece of equipment we hold. It has no SWAP, power or gain, which
// is the whole reason it is not an equipment row - see migration 040.
type Platform struct {
	ID              string
	Designation     string
	PopularName     string
	Category        string
	Kind            string
	Operator        string
	WaveformAbbrevs []string
	EquipmentIDs    []string
	Notes           string
	CreatedBy       string
	UpdatedBy       string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// DefaultCategories and DefaultKinds are starting vocabularies, not closed
// sets, for the same reason transport kinds are open: a joint exercise brings
// assets nobody anticipated, and filing a coalition UAS under "other" loses the
// distinction the matrix column exists to show. The frontend offers these plus
// every value already in use.
var (
	DefaultCategories = []string{"organic", "joint", "coalition"}
	DefaultKinds      = []string{"aircraft", "ship", "ground vehicle", "ground station"}
)

const (
	// The column defaults in migration 040. A blank value becomes these rather
	// than an error, so a client that does not care still gets a usable row.
	defaultCategory = "joint"
	defaultKind     = "aircraft"

	// Long enough for a descriptive term, short enough that a pasted paragraph
	// is rejected rather than becoming a category.
	MaxVocabLen = 40
	// Letters, digits, spaces and dashes, and nothing that would render as
	// markup on the printed matrix.
	vocabPattern = `^[a-z0-9][a-z0-9 -]*$`
)

var vocabRe = regexp.MustCompile(vocabPattern)

// normaliseVocab lowercases, trims and collapses internal whitespace, so
// "Joint", "joint " and "JOINT" all store as one value. Underscores become
// spaces so "ground_vehicle" and "ground vehicle" are one kind, not two.
func normaliseVocab(v, fallback string) string {
	s := strings.ToLower(strings.TrimSpace(strings.ReplaceAll(v, "_", " ")))
	if s == "" {
		return fallback
	}
	return strings.Join(strings.Fields(s), " ")
}

// NormaliseCategory normalises a category, blank becoming "joint".
func NormaliseCategory(v string) string { return normaliseVocab(v, defaultCategory) }

// NormaliseKind normalises a kind, blank becoming "aircraft".
func NormaliseKind(v string) string { return normaliseVocab(v, defaultKind) }

// IsValidVocab reports whether an already-normalised category or kind is
// storable. A shape check, not a membership check, which is the point of an
// open vocabulary.
func IsValidVocab(v string) bool {
	if v == "" || len(v) > MaxVocabLen {
		return false
	}
	return vocabRe.MatchString(v)
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

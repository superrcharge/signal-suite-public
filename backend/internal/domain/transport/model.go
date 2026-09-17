package transport

import (
	"regexp"
	"strings"
	"time"
)

type Transport struct {
	ID          string
	Name        string
	Kind        string
	Provider    string
	Description string
	CreatedBy   string
	UpdatedBy   string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// DefaultKinds is the starting vocabulary, not a closed set. A squadron running
// a path nobody anticipated adds its own kind rather than filing it under
// "other" and losing the distinction. The frontend offers these four plus every
// kind already in use, so a kind someone adds becomes a suggestion for everyone
// after it.
//
// The consistency this gives up at the edges is bought back by NormaliseKind:
// "Cellular", "cellular " and "CELLULAR" all store as "cellular", so the list
// cannot fill up with the same kind spelled three ways.
var DefaultKinds = []string{"fiber", "cellular", "manet", "other"}

const (
	// Long enough for a descriptive kind, short enough that a pasted paragraph
	// is rejected rather than becoming a category.
	MaxKindLen = 40
	// Letters, digits, spaces and dashes. Enough for "line of sight" or
	// "point-to-point", and nothing that would render as markup on the sheet.
	kindPattern = `^[a-z0-9][a-z0-9 -]*$`
)

var kindRe = regexp.MustCompile(kindPattern)

// NormaliseKind lowercases, trims, and collapses internal whitespace. An empty
// kind becomes "other" rather than an error, so a client that does not care
// about the category still gets a usable row.
func NormaliseKind(kind string) string {
	k := strings.ToLower(strings.TrimSpace(kind))
	if k == "" {
		return "other"
	}
	return strings.Join(strings.Fields(k), " ")
}

// IsValidKind reports whether an already-normalised kind is storable. It is a
// shape check, not a membership check: anything well-formed is allowed, which
// is the point of an open vocabulary.
func IsValidKind(kind string) bool {
	if kind == "" || len(kind) > MaxKindLen {
		return false
	}
	return kindRe.MatchString(kind)
}

// IsDefaultKind reports whether a kind is one of the built-in four. Used only
// for presentation; storage treats every kind the same.
func IsDefaultKind(kind string) bool {
	for _, k := range DefaultKinds {
		if k == kind {
			return true
		}
	}
	return false
}

package organization

import (
	"regexp"
	"strings"
	"time"
)

// Organization is a participant an operation can check in: a service
// component, a squadron, a coalition partner. It is reference data, loaded once
// and rarely changed - see migration 046.
type Organization struct {
	// Key is a lowercase slug and never changes after creation, because
	// operation participants point at it.
	Key        string
	Name       string
	ShortLabel string
	// Branch is one of branch.Valid, or empty when the organization is not a
	// service component. Stored as NULL.
	Branch string
	Color  string
	// SectionKey is the squadron this organization maps to, or empty. Stored
	// as NULL.
	SectionKey string
	Notes      string
	CreatedBy  string
	UpdatedBy  string
	CreatedAt  time.Time
	UpdatedAt  time.Time
	// OperationCount is computed on read, not stored: the number of distinct
	// operations with a participant row naming this key. Ad hoc participants
	// (NULL organization_key, migration 048) count for nothing. Every read in
	// repository.go fills it; Create and Update never write it.
	OperationCount int
}

const maxKeyLen = 50

var keyPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_]*$`)

// NormaliseKey trims and lowercases v and reports whether the result is a
// usable key: a lowercase slug of letters, digits and underscores that does not
// start with an underscore, at most 50 characters. Lowercasing rather than
// refusing upper case means "Green" and "green" are one key, as with every
// other case-insensitive name in the app.
func NormaliseKey(v string) (string, bool) {
	k := strings.ToLower(strings.TrimSpace(v))
	if k == "" || len(k) > maxKeyLen || !keyPattern.MatchString(k) {
		return k, false
	}
	return k, true
}

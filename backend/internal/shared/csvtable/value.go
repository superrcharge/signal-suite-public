package csvtable

import (
	"errors"
	"strconv"
	"strings"
	"time"
)

// The helpers below are the shapes that repeated across the three hand-written
// value switches. They exist so a column declaration stays one expression and so
// nil handling, boolean spelling and timestamp format are decided once rather
// than per domain.

// Str renders a plain string field.
func Str[T any](f func(*T) string) func(*T) string { return f }

// PtrStr renders a nullable string field, nil as empty.
func PtrStr[T any](f func(*T) *string) func(*T) string {
	return func(t *T) string {
		if v := f(t); v != nil {
			return *v
		}
		return ""
	}
}

// Bool renders a boolean as "true" or "false", matching what the kits export
// already emits.
func Bool[T any](f func(*T) bool) func(*T) string {
	return func(t *T) string { return strconv.FormatBool(f(t)) }
}

// List joins a repeated field with sep.
func List[T any](sep string, f func(*T) []string) func(*T) string {
	return func(t *T) string { return strings.Join(f(t), sep) }
}

// RFC3339 renders a timestamp in UTC, the format the existing exports use for
// created_at and updated_at.
func RFC3339[T any](f func(*T) time.Time) func(*T) string {
	return func(t *T) string {
		v := f(t)
		if v.IsZero() {
			return ""
		}
		return v.UTC().Format(time.RFC3339)
	}
}

// DateOnly renders a nullable date as YYYY-MM-DD, matching the contracts export
// for pop_start and pop_end.
func DateOnly[T any](f func(*T) *time.Time) func(*T) string {
	return func(t *T) string {
		if v := f(t); v != nil {
			return v.Format(time.DateOnly)
		}
		return ""
	}
}

// SetStr assigns a trimmed cell straight through.
func SetStr[T any](f func(*T, string)) func(*T, string) error {
	return func(t *T, v string) error {
		f(t, v)
		return nil
	}
}

// SetPtrStr assigns a nullable string, empty becoming nil. This is the
// nullableStr helper that terminal and kit each carried a copy of, and it keeps
// import agreeing with the drawer flow's NULL semantics.
func SetPtrStr[T any](f func(*T, *string)) func(*T, string) error {
	return func(t *T, v string) error {
		if v == "" {
			f(t, nil)
			return nil
		}
		f(t, &v)
		return nil
	}
}

// SetBool parses a boolean cell. Blank is false rather than an error, so a user
// can leave a column empty and mean "no".
//
// The accepted vocabulary is deliberately wider than strconv.ParseBool, which
// rejects "yes" and "no". People filling in a spreadsheet write those, the kits
// importer has always taken them, and narrowing that on a refactor would break
// files that work today.
func SetBool[T any](f func(*T, bool)) func(*T, string) error {
	return func(t *T, v string) error {
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "", "false", "no", "n", "0", "f":
			f(t, false)
			return nil
		case "true", "yes", "y", "1", "t":
			f(t, true)
			return nil
		}
		return errors.New("use true or false")
	}
}

// SetDate parses a YYYY-MM-DD cell into a nullable date.
func SetDate[T any](f func(*T, *time.Time)) func(*T, string) error {
	return func(t *T, v string) error {
		if v == "" {
			f(t, nil)
			return nil
		}
		parsed, err := time.Parse(time.DateOnly, v)
		if err != nil {
			return errors.New("use a date as YYYY-MM-DD")
		}
		f(t, &parsed)
		return nil
	}
}

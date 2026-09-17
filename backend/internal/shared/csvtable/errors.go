package csvtable

import (
	"fmt"
	"net/http"
	"strings"
)

// Error is a coded, status-carrying error. It deliberately mirrors the per-domain
// Error types field for field so that response.Err and response.StatusFromError
// render it identically to the domain errors it replaces - the CodedError
// interface is structural, so nothing has to be registered anywhere.
type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string   { return e.Message }
func (e *Error) GetCode() string { return e.Code }
func (e *Error) GetStatus() int  { return e.Status }

// code builds a domain-prefixed error code: ("TERMINAL", "INVALID_CSV") gives
// TERMINAL_INVALID_CSV, which is the code that already ships today.
func code(domain, suffix string) string {
	return strings.ToUpper(domain) + "_" + suffix
}

// ErrInvalidExportColumn names the unknown column and lists the legal ones. The
// caller asked for something specific, so telling them only "bad column" would
// make them go read the source to find out what is allowed.
func ErrInvalidExportColumn(domain, col string, valid []string) *Error {
	return &Error{
		Code:    code(domain, "INVALID_EXPORT_COLUMN"),
		Message: fmt.Sprintf("unknown export column %q - valid columns: %s", col, strings.Join(valid, ", ")),
		Status:  http.StatusBadRequest,
	}
}

// ErrInvalidCSV covers a body that is not two lines of CSV: no header, no rows,
// or unparseable.
func ErrInvalidCSV(domain string) *Error {
	return &Error{
		Code:    code(domain, "INVALID_CSV"),
		Message: "csv must have a header row and at least one data row",
		Status:  http.StatusBadRequest,
	}
}

// ErrMissingIdentityColumn fires when the uploaded header omits the column that
// identifies a row. Without it there is nothing to deduplicate on and nothing to
// name a row by in an error, so it is a hard failure rather than a row error.
func ErrMissingIdentityColumn(domain, identity string) *Error {
	return &Error{
		Code:    code(domain, "MISSING_"+strings.ToUpper(identity)+"_COLUMN"),
		Message: fmt.Sprintf("csv must have a %q column", identity),
		Status:  http.StatusBadRequest,
	}
}

// ErrImportHasServerColumn rejects a file carrying a server-owned identifier.
//
// This is the one server-owned column that gets rejected rather than ignored.
// A file with an id in it came from an export, and the user editing it plainly
// meant to update those rows. Import creates, so every row would instead fail as
// a duplicate name - technically correct and completely baffling. Say the actual
// thing instead.
func ErrImportHasServerColumn(domain, col string) *Error {
	return &Error{
		Code:    code(domain, "IMPORT_HAS_"+strings.ToUpper(col)),
		Message: fmt.Sprintf(
			"this file has a %q column, so it came from an export - import creates new "+
				"records and cannot update existing ones. Remove the column to import these "+
				"as new records, or edit them in the app instead.", col),
		Status: http.StatusBadRequest,
	}
}

// ErrImportNotSupported is returned by Parse on a table with no New func. Such a
// table is export-only by construction, which is how a domain like PACE is kept
// from growing an import by accident.
func ErrImportNotSupported(domain string) *Error {
	return &Error{
		Code:    code(domain, "IMPORT_NOT_SUPPORTED"),
		Message: "this resource does not support csv import",
		Status:  http.StatusMethodNotAllowed,
	}
}

// ErrUnknownVocabulary is a programming error, not a user error: a column named a
// dynamic vocabulary that Bind was not given. It surfaces as a 500 because the
// alternative - quietly accepting any value for that column - is how a validation
// rule silently stops running.
func ErrUnknownVocabulary(domain, col, vocab string) *Error {
	return &Error{
		Code:    code(domain, "CSV_VOCABULARY_MISSING"),
		Message: fmt.Sprintf("column %q needs the %q vocabulary and it was not supplied", col, vocab),
		Status:  http.StatusInternalServerError,
	}
}

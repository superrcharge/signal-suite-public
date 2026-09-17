package terminal

import (
	"fmt"
	"net/http"
)

// ErrInvalidExportColumn returns a typed 400 error naming the unknown
// column the caller asked for.
func ErrInvalidExportColumn(col string) *Error {
	return &Error{
		Code:    "TERMINAL_INVALID_EXPORT_COLUMN",
		Message: fmt.Sprintf("unknown export column %q - valid columns: %v", col, ExportableColumns),
		Status:  http.StatusBadRequest,
	}
}

type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string   { return e.Message }
func (e *Error) GetCode() string { return e.Code }
func (e *Error) GetStatus() int  { return e.Status }

var (
	ErrTerminalNotFound      = &Error{Code: "TERMINAL_NOT_FOUND", Message: "terminal not found", Status: http.StatusNotFound}
	ErrTerminalNameExists    = &Error{Code: "TERMINAL_NAME_EXISTS", Message: "terminal name already exists", Status: http.StatusConflict}
	ErrTerminalInternalError = &Error{Code: "TERMINAL_INTERNAL_ERROR", Message: "internal server error", Status: http.StatusInternalServerError}
	ErrInvalidCSV            = &Error{Code: "TERMINAL_INVALID_CSV", Message: "invalid CSV: must have a header row and at least one data row", Status: http.StatusBadRequest}
	ErrMissingNameColumn     = &Error{Code: "TERMINAL_MISSING_NAME_COLUMN", Message: "CSV missing required column: name", Status: http.StatusBadRequest}
	ErrTagNameExists         = &Error{Code: "TAG_NAME_EXISTS", Message: "tag name already exists", Status: http.StatusConflict}
	ErrTagNotFound           = &Error{Code: "TAG_NOT_FOUND", Message: "tag not found", Status: http.StatusNotFound}
)

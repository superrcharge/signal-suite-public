package kit

import (
	"fmt"
	"net/http"
)

// ErrInvalidExportColumn returns a typed 400 error naming the unknown
// column the caller asked for.
func ErrInvalidExportColumn(col string) *Error {
	return &Error{
		Code:    "KIT_INVALID_EXPORT_COLUMN",
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
	ErrKitNotFound       = &Error{Code: "KIT_NOT_FOUND", Message: "kit not found", Status: http.StatusNotFound}
	ErrKitNameExists     = &Error{Code: "KIT_NAME_EXISTS", Message: "kit name already exists", Status: http.StatusConflict}
	ErrKitInternalError  = &Error{Code: "KIT_INTERNAL_ERROR", Message: "internal server error", Status: http.StatusInternalServerError}
	ErrInvalidCSV        = &Error{Code: "KIT_INVALID_CSV", Message: "invalid CSV: must have a header row and at least one data row", Status: http.StatusBadRequest}
	ErrMissingNameColumn = &Error{Code: "KIT_MISSING_NAME_COLUMN", Message: "CSV missing required column: name", Status: http.StatusBadRequest}
)

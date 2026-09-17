package transport

import "net/http"

// Error is the domain's coded error, satisfying response.CodedError so the
// shared envelope renders a real code and message. Plain errors.New values fall
// through to INTERNAL_ERROR, which would tell a user "internal server error"
// when what actually happened was a duplicate name.
type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string   { return e.Message }
func (e *Error) GetCode() string { return e.Code }
func (e *Error) GetStatus() int  { return e.Status }

var (
	ErrTransportNotFound = &Error{
		Code:    "TRANSPORT_NOT_FOUND",
		Message: "transport not found",
		Status:  http.StatusNotFound,
	}
	ErrTransportNameExists = &Error{
		Code:    "TRANSPORT_NAME_EXISTS",
		Message: "a transport with that name already exists",
		Status:  http.StatusConflict,
	}
	// Any well-formed kind is accepted, so this fires on shape rather than on
	// membership: something too long, or carrying characters that have no place
	// in a category name.
	ErrTransportInvalidKind = &Error{
		Code:    "TRANSPORT_INVALID_KIND",
		Message: "kind must be 40 characters or fewer, using only letters, numbers, spaces and dashes",
		Status:  http.StatusBadRequest,
	}
	ErrTransportInternalError = &Error{
		Code:    "TRANSPORT_INTERNAL_ERROR",
		Message: "internal server error",
		Status:  http.StatusInternalServerError,
	}
)

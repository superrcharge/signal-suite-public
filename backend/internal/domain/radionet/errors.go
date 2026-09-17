package radionet

import (
	"net/http"
	"strings"
)

// Error is the domain's coded error, satisfying response.CodedError so the
// shared envelope can render a real code and message. A plain errors.New would
// fall through to INTERNAL_ERROR and tell a user "internal server error" when
// what actually happened is that their net name was already taken.
type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string   { return e.Message }
func (e *Error) GetCode() string { return e.Code }
func (e *Error) GetStatus() int  { return e.Status }

// ErrNetInUse names the wheels that would break, so a refused delete tells the
// user where to go rather than only that they cannot.
func ErrNetInUse(plans []string) *Error {
	msg := "net is assigned to a channel wheel and cannot be deleted"
	if len(plans) > 0 {
		msg += " - it is on " + strings.Join(plans, ", ")
	}
	return &Error{Code: "NET_IN_USE", Message: msg, Status: http.StatusConflict}
}

var (
	ErrSectionNotFound = &Error{
		Code:    "NET_SECTION_NOT_FOUND",
		Message: "section not found",
		Status:  http.StatusNotFound,
	}
	ErrNetNotFound = &Error{
		Code:    "NET_NOT_FOUND",
		Message: "net not found",
		Status:  http.StatusNotFound,
	}
	ErrNetNameExists = &Error{
		Code:    "NET_NAME_EXISTS",
		Message: "a net with that name already exists",
		Status:  http.StatusConflict,
	}
	ErrInvalidFreqUnit = &Error{
		Code:    "NET_INVALID_FREQ_UNIT",
		Message: "frequency unit must be MHz or GHz",
		Status:  http.StatusBadRequest,
	}
	ErrInvalidRadioType = &Error{
		Code:    "NET_INVALID_RADIO_TYPE",
		Message: "radio type must be jem, mpu5, or both",
		Status:  http.StatusBadRequest,
	}
	ErrNetInternalError = &Error{
		Code:    "NET_INTERNAL_ERROR",
		Message: "internal server error",
		Status:  http.StatusInternalServerError,
	}
)

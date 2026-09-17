package waveform

import (
	"net/http"
	"strconv"
	"strings"
)

// Error is the domain's coded error, satisfying response.CodedError so the
// shared envelope renders a real code and message. Plain errors.New values fall
// through to INTERNAL_ERROR, which told a user "internal server error" when what
// actually happened was a duplicate abbreviation.
type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string   { return e.Message }
func (e *Error) GetCode() string { return e.Code }
func (e *Error) GetStatus() int  { return e.Status }

var (
	ErrWaveformNotFound = &Error{
		Code:    "WAVEFORM_NOT_FOUND",
		Message: "waveform not found",
		Status:  http.StatusNotFound,
	}
	ErrWaveformAbbrevExists = &Error{
		Code:    "WAVEFORM_ABBREV_EXISTS",
		Message: "a waveform with that abbreviation already exists",
		Status:  http.StatusConflict,
	}
	ErrWaveformInternalError = &Error{
		Code:    "WAVEFORM_INTERNAL_ERROR",
		Message: "internal server error",
		Status:  http.StatusInternalServerError,
	}
)

// ErrWaveformInUse names the assets that carry the abbrev, so a refused delete
// tells the user where to go rather than only that they cannot. A constructor
// rather than a package var, for the same reason ErrNetInUse is one: the
// message is built from the names.
//
// The list is truncated, because a waveform carried by forty radios would
// otherwise produce an error message nobody can read. The count is always
// stated, so a truncated list never understates the problem.
func ErrWaveformInUse(assets []string) *Error {
	msg := "waveform is carried by catalog assets and cannot be deleted"
	if len(assets) > 0 {
		shown := assets
		suffix := ""
		if len(shown) > maxNamedAssets {
			shown = shown[:maxNamedAssets]
			suffix = " and " + strconv.Itoa(len(assets)-maxNamedAssets) + " more"
		}
		msg += " - it is used by " + strings.Join(shown, ", ") + suffix
	}
	return &Error{Code: "WAVEFORM_IN_USE", Message: msg, Status: http.StatusConflict}
}

const maxNamedAssets = 5

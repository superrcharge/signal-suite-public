package platform

import (
	"net/http"
	"strings"
)

// Error is the domain's coded error, satisfying response.CodedError so the
// shared envelope renders a real code and message rather than INTERNAL_ERROR.
type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string   { return e.Message }
func (e *Error) GetCode() string { return e.Code }
func (e *Error) GetStatus() int  { return e.Status }

var (
	ErrPlatformNotFound = &Error{
		Code:    "PLATFORM_NOT_FOUND",
		Message: "platform not found",
		Status:  http.StatusNotFound,
	}
	ErrPlatformDesignationExists = &Error{
		Code:    "PLATFORM_DESIGNATION_EXISTS",
		Message: "a platform with that designation already exists",
		Status:  http.StatusConflict,
	}
	// Category and kind are open vocabularies, so these fire on shape rather
	// than membership.
	ErrPlatformInvalidCategory = &Error{
		Code:    "PLATFORM_INVALID_CATEGORY",
		Message: "category must be 40 characters or fewer, using only letters, numbers, spaces and dashes",
		Status:  http.StatusBadRequest,
	}
	ErrPlatformInvalidKind = &Error{
		Code:    "PLATFORM_INVALID_KIND",
		Message: "kind must be 40 characters or fewer, using only letters, numbers, spaces and dashes",
		Status:  http.StatusBadRequest,
	}
	ErrPlatformInternalError = &Error{
		Code:    "PLATFORM_INTERNAL_ERROR",
		Message: "internal server error",
		Status:  http.StatusInternalServerError,
	}
)

// ErrPlatformUnknownWaveform names the abbrevs the library does not declare.
//
// A constructor, like waveform.ErrWaveformInUse: refusing without saying which
// name was wrong is useless on a platform carrying eight of them. 400 rather
// than 409 - this is a malformed request, not a conflict with existing state.
//
// This rejection reverses a decision migration 040 recorded deliberately, where
// an unknown abbrev was kept so "a waveform being renamed or retired must not
// silently empty a platform's row". That tolerance was buying protection
// against rename and retirement, and the waveform domain now handles both
// directly: a delete that would strand an abbrev is refused, and a rename is
// carried to the carriers. With both in place the tolerance no longer buys
// anything, and it costs the guarantee that the matrix can look every name up.
func ErrPlatformUnknownWaveform(abbrevs []string) *Error {
	return &Error{
		Code:    "PLATFORM_UNKNOWN_WAVEFORM",
		Message: "not in the waveform library: " + strings.Join(abbrevs, ", "),
		Status:  http.StatusBadRequest,
	}
}

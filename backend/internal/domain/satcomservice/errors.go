package satcomservice

import "net/http"

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

// There is deliberately no SERVICE_IN_USE, and TestDeleteServiceIsNotGuarded
// pins that so a future guard has to be a deliberate change rather than a
// drift.
//
// The reason this comment used to give was wrong twice over: it said waveforms
// need a guard "because nets.waveform_abbrev is an enforced reference", and
// migration 030 had already dropped that column. Waveforms now DO have a guard
//, but on the strength of a different argument - the abbrev is carried
// as text by equipment records and by platforms, and the compatibility matrix
// is built on being able to look every carried name up.
//
// Services have no such consumer. A service's only reference is the
// denormalized abbrev inside equipment.data, which surfaces as a removable gray
// chip, and nothing renders a services matrix that a missing library row would
// break. If that changes, this decision is worth revisiting rather
// than inheriting.
var (
	ErrServiceNotFound = &Error{
		Code:    "SERVICE_NOT_FOUND",
		Message: "service not found",
		Status:  http.StatusNotFound,
	}
	ErrServiceAbbrevExists = &Error{
		Code:    "SERVICE_ABBREV_EXISTS",
		Message: "a service with that abbreviation already exists",
		Status:  http.StatusConflict,
	}
	ErrServiceInternalError = &Error{
		Code:    "SERVICE_INTERNAL_ERROR",
		Message: "internal server error",
		Status:  http.StatusInternalServerError,
	}
)

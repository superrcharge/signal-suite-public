package section

import (
	"fmt"
	"net/http"
)

type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string   { return e.Message }
func (e *Error) GetCode() string { return e.Code }
func (e *Error) GetStatus() int  { return e.Status }

var (
	ErrSectionNotFound      = &Error{Code: "SECTION_NOT_FOUND", Message: "section not found", Status: http.StatusNotFound}
	ErrSectionKeyExists     = &Error{Code: "SECTION_KEY_EXISTS", Message: "section key already exists", Status: http.StatusConflict}
	ErrSectionInUse         = &Error{Code: "SECTION_IN_USE", Message: "section has terminals assigned; reassign or clear them first", Status: http.StatusConflict}
	ErrInvalidReassign      = &Error{Code: "SECTION_INVALID_REASSIGN", Message: "cannot reassign a section to itself", Status: http.StatusBadRequest}
	ErrSectionInvalidKey    = &Error{Code: "SECTION_INVALID_KEY", Message: "section key must contain at least one letter or number", Status: http.StatusBadRequest}
	ErrSectionInternalError = &Error{Code: "SECTION_INTERNAL_ERROR", Message: "internal server error", Status: http.StatusInternalServerError}

	// ErrSectionHasPlanning refuses deleting a section that still owns nets or
	// PACE card data. The code is what a client branches on; the message is
	// rebuilt per request by errSectionHasPlanning so it names what is there.
	ErrSectionHasPlanning = &Error{Code: "SECTION_HAS_PLANNING_DATA", Message: "section still has nets or a saved PACE card, so it cannot be deleted", Status: http.StatusConflict}
)

// errSectionHasPlanning names what is blocking the delete, so the dialog that
// shows the message tells the user what is there.
//
// It says "cannot be deleted while they exist" and deliberately not "remove
// them first": nets can be deleted one at a time, but nothing in the app
// deletes a saved PACE card, so an instruction to remove it would send the
// user looking for a control that does not exist.
func errSectionHasPlanning(nets int, pace bool) *Error {
	var what string
	switch {
	case nets > 0 && pace:
		what = netsPhrase(nets) + " and a saved PACE card"
	case nets > 0:
		what = netsPhrase(nets)
	default:
		what = "a saved PACE card"
	}
	return &Error{
		Code:    ErrSectionHasPlanning.Code,
		Message: fmt.Sprintf("section still has %s; a squadron's nets and PACE card are never moved to another section, so it cannot be deleted while they exist", what),
		Status:  ErrSectionHasPlanning.Status,
	}
}

func netsPhrase(n int) string {
	if n == 1 {
		return "1 net"
	}
	return fmt.Sprintf("%d nets", n)
}

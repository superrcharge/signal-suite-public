package organization

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
	ErrOrganizationNotFound = &Error{
		Code:    "ORGANIZATION_NOT_FOUND",
		Message: "organization not found",
		Status:  http.StatusNotFound,
	}
	ErrOrganizationKeyExists = &Error{
		Code:    "ORGANIZATION_KEY_EXISTS",
		Message: "an organization with that key already exists",
		Status:  http.StatusConflict,
	}
	ErrOrganizationNameExists = &Error{
		Code:    "ORGANIZATION_NAME_EXISTS",
		Message: "an organization with that name already exists",
		Status:  http.StatusConflict,
	}
	ErrOrganizationInvalidKey = &Error{
		Code:    "ORGANIZATION_INVALID_KEY",
		Message: "key must be lowercase letters, digits and underscores, start with a letter or digit, and be at most 50 characters",
		Status:  http.StatusBadRequest,
	}
	ErrOrganizationInvalidBranch = &Error{
		Code:    "ORGANIZATION_INVALID_BRANCH",
		Message: "branch must be one of USA, USMC, USN, USAF, USSF, USCG, OGA, or blank",
		Status:  http.StatusBadRequest,
	}
	ErrOrganizationUnknownSection = &Error{
		Code:    "ORGANIZATION_UNKNOWN_SECTION",
		Message: "section does not exist",
		Status:  http.StatusBadRequest,
	}
	// A section can belong to only one organization, so a second claim on it is
	// a conflict with existing state rather than a malformed request.
	ErrOrganizationSectionTaken = &Error{
		Code:    "ORGANIZATION_SECTION_TAKEN",
		Message: "another organization already uses that section",
		Status:  http.StatusConflict,
	}
	ErrOrganizationInternalError = &Error{
		Code:    "ORGANIZATION_INTERNAL_ERROR",
		Message: "internal server error",
		Status:  http.StatusInternalServerError,
	}
)

// ErrOrganizationInUse names the operations that still carry the organization.
//
// A constructor, like platform.ErrPlatformUnknownWaveform: "in use" with no
// operation named sends the user hunting. operations may be empty, which is the
// database-backstop case where the foreign key refused but the usage lookup
// was not wired, and the message then says so without a list.
func ErrOrganizationInUse(operations []string) *Error {
	msg := "organization is checked in to an operation"
	if len(operations) > 0 {
		msg = "organization is checked in to: " + strings.Join(operations, ", ")
	}
	return &Error{
		Code:    "ORGANIZATION_IN_USE",
		Message: msg,
		Status:  http.StatusConflict,
	}
}

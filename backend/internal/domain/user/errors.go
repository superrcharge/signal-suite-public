package user

import (
	"net/http"
	"strings"
)

type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string {
	return e.Message
}

func (e *Error) GetCode() string {
	return e.Code
}

func (e *Error) GetStatus() int {
	return e.Status
}

var (
	ErrUserNotFound  = &Error{Code: "USER_NOT_FOUND", Message: "user not found", Status: http.StatusNotFound}
	ErrForbidden     = &Error{Code: "USER_FORBIDDEN", Message: "access denied", Status: http.StatusForbidden}
	ErrInvalidName   = &Error{Code: "USER_INVALID_NAME", Message: "name is required", Status: http.StatusBadRequest}
	ErrInvalidTheme  = &Error{Code: "USER_INVALID_THEME", Message: "theme must be 'light' or 'dark'", Status: http.StatusBadRequest}
	ErrInvalidUserID = &Error{Code: "USER_INVALID_ID", Message: "user id is required", Status: http.StatusBadRequest}
	ErrInvalidJSON   = &Error{Code: "USER_INVALID_JSON", Message: "invalid json", Status: http.StatusBadRequest}
	// Message is derived from ValidRoles so adding a role cannot leave a stale list here.
	ErrInvalidRole       = &Error{Code: "USER_INVALID_ROLE", Message: "role must be one of: " + strings.Join(ValidRoles, ", "), Status: http.StatusBadRequest}
	ErrCannotModifySelf  = &Error{Code: "USER_CANNOT_MODIFY_SELF", Message: "you cannot change your own role", Status: http.StatusForbidden}
	ErrLastAdmin         = &Error{Code: "USER_LAST_ADMIN", Message: "cannot demote the last remaining admin - promote another user to admin first", Status: http.StatusConflict}
	ErrUserInternalError = &Error{Code: "USER_INTERNAL_ERROR", Message: "internal server error", Status: http.StatusInternalServerError}
)

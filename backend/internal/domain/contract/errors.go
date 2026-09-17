package contract

import "net/http"

type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string   { return e.Message }
func (e *Error) GetCode() string { return e.Code }
func (e *Error) GetStatus() int  { return e.Status }

var (
	ErrContractNotFound      = &Error{Code: "CONTRACT_NOT_FOUND", Message: "contract not found", Status: http.StatusNotFound}
	ErrContractInternalError = &Error{Code: "CONTRACT_INTERNAL_ERROR", Message: "internal server error", Status: http.StatusInternalServerError}
)

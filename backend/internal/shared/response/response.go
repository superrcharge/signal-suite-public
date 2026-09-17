package response

import (
	"net/http"

	"backend/internal/shared/validator"
)

type APIResponse struct {
	Success bool   `json:"success"`
	Data    any    `json:"data,omitempty"`
	Error   *Error `json:"error,omitempty"`
}

type Error struct {
	Code    string                      `json:"code"`
	Message string                      `json:"message"`
	Details []validator.ValidationError `json:"details,omitempty"`
}

type CodedError interface {
	error
	GetCode() string
	GetStatus() int
}

func Success(data any) APIResponse {
	return APIResponse{
		Success: true,
		Data:    data,
	}
}

func Err(err error) APIResponse {
	if validationErrs, ok := err.(*validator.ValidationErrors); ok {
		return APIResponse{
			Success: false,
			Error: &Error{
				Code:    "VALIDATION_ERROR",
				Message: "validation failed",
				Details: validationErrs.Errors,
			},
		}
	}

	if coded, ok := err.(CodedError); ok {
		return APIResponse{
			Success: false,
			Error: &Error{
				Code:    coded.GetCode(),
				Message: coded.Error(),
			},
		}
	}

	return APIResponse{
		Success: false,
		Error: &Error{
			Code:    "INTERNAL_ERROR",
			Message: "internal server error",
		},
	}
}

func StatusFromError(err error) int {
	if _, ok := err.(*validator.ValidationErrors); ok {
		return http.StatusBadRequest
	}
	if coded, ok := err.(CodedError); ok {
		return coded.GetStatus()
	}
	return http.StatusInternalServerError
}

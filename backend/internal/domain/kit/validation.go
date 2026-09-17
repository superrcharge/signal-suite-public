package kit

import (
	"backend/internal/shared/assetstatus"
	"backend/internal/shared/validator"

	playgroundValidator "github.com/go-playground/validator/v10"
)

func NewValidator() *validator.Validator {
	v := validator.New()

	v.RegisterMessage("required", func(fe playgroundValidator.FieldError) string {
		switch fe.Field() {
		case "Name":
			return "kit name is required"
		case "Type":
			return "kit type is required"
		case "ID":
			return "kit ID is required"
		case "CSV":
			return "csv content is required"
		default:
			return fe.Field() + " is required"
		}
	})

	v.RegisterMessage("min", func(fe playgroundValidator.FieldError) string {
		if fe.Field() == "Name" {
			return "kit name cannot be empty"
		}
		return fe.Field() + " cannot be empty"
	})

	v.RegisterMessage("max", func(fe playgroundValidator.FieldError) string {
		if fe.Field() == "Name" {
			return "kit name cannot exceed 100 characters"
		}
		return fe.Field() + " is too long"
	})

	v.RegisterMessage("oneof", func(fe playgroundValidator.FieldError) string {
		switch fe.Field() {
		case "Status":
			return assetstatus.Message()
		case "Type":
			return "type must be one of: remote, ifk, atk"
		}
		return fe.Field() + " must be one of: " + fe.Param()
	})

	v.RegisterMessage("uuid", func(fe playgroundValidator.FieldError) string {
		return "invalid kit ID format"
	})

	return v
}

package user

import (
	"backend/internal/shared/validator"

	playgroundValidator "github.com/go-playground/validator/v10"
)

func NewValidator() *validator.Validator {
	v := validator.New()

	v.RegisterMessage("required", func(fe playgroundValidator.FieldError) string {
		switch fe.Field() {
		case "Email":
			return "email address is required"
		case "Name":
			return "user name is required"
		case "Theme":
			return "theme preference is required"
		case "ID":
			return "user ID is required"
		default:
			return fe.Field() + " is required"
		}
	})

	v.RegisterMessage("email", func(fe playgroundValidator.FieldError) string {
		return "please provide a valid email address"
	})

	v.RegisterMessage("oneof", func(fe playgroundValidator.FieldError) string {
		if fe.Field() == "Theme" {
			return "theme must be either 'light' or 'dark'"
		}
		return fe.Field() + " must be one of: " + fe.Param()
	})

	v.RegisterMessage("uuid", func(fe playgroundValidator.FieldError) string {
		if fe.Field() == "ID" {
			return "invalid user ID format"
		}
		return fe.Field() + " must be a valid UUID"
	})

	v.RegisterMessage("min", func(fe playgroundValidator.FieldError) string {
		if fe.Field() == "Name" {
			return "name cannot be empty"
		}
		return fe.Field() + " must be at least " + fe.Param()
	})

	v.RegisterMessage("max", func(fe playgroundValidator.FieldError) string {
		if fe.Field() == "Name" {
			return "name cannot exceed 100 characters"
		}
		return fe.Field() + " must be at most " + fe.Param()
	})

	return v
}

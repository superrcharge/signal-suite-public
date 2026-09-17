package terminal

import (
	"slices"

	"backend/internal/shared/assetstatus"
	"backend/internal/shared/validator"

	playgroundValidator "github.com/go-playground/validator/v10"
)

func NewValidator() *validator.Validator {
	v := validator.New()

	// "" is the client's clear signal for pop_pin (a nil pointer means "field
	// not provided" on PATCH), so it must pass validation; normalizePopPin
	// turns it into NULL. `omitempty` alone can't express this: a non-nil
	// *string pointing to "" still counts as "has value".
	_ = v.RegisterValidation("pop_pin", func(fl playgroundValidator.FieldLevel) bool {
		pin := fl.Field().String()
		return pin == "" || slices.Contains(ValidPopPins, pin)
	})

	v.RegisterMessage("pop_pin", func(fe playgroundValidator.FieldError) string {
		return "pop_pin must be one of: us-east, us-west, germany, uk, australia"
	})

	v.RegisterMessage("required", func(fe playgroundValidator.FieldError) string {
		switch fe.Field() {
		case "Name":
			return "terminal name is required"
		case "ID":
			return "terminal ID is required"
		case "CSV":
			return "csv content is required"
		default:
			return fe.Field() + " is required"
		}
	})

	v.RegisterMessage("min", func(fe playgroundValidator.FieldError) string {
		if fe.Field() == "Name" {
			return "terminal name cannot be empty"
		}
		return fe.Field() + " cannot be empty"
	})

	v.RegisterMessage("max", func(fe playgroundValidator.FieldError) string {
		if fe.Field() == "Name" {
			return "terminal name cannot exceed 100 characters"
		}
		return fe.Field() + " is too long"
	})

	v.RegisterMessage("oneof", func(fe playgroundValidator.FieldError) string {
		switch fe.Field() {
		case "Status":
			return assetstatus.Message()
		case "Model":
			return "model must be one of: mini, hp, hornet, ragno, ow7, ow10, ow11"
		}
		return fe.Field() + " must be one of: " + fe.Param()
	})

	v.RegisterMessage("uuid", func(fe playgroundValidator.FieldError) string {
		return "invalid terminal ID format"
	})

	return v
}

package equipment

import (
	"backend/internal/shared/validator"

	playgroundValidator "github.com/go-playground/validator/v10"
)

func NewValidator() *validator.Validator {
	v := validator.New()

	v.RegisterMessage("required", func(fe playgroundValidator.FieldError) string {
		switch fe.Field() {
		case "ID":
			return "equipment ID is required"
		case "Nomenclature":
			return "nomenclature is required"
		case "TerminalType":
			return "terminal_type is required"
		default:
			return fe.Field() + " is required"
		}
	})

	v.RegisterMessage("oneof", func(fe playgroundValidator.FieldError) string {
		return "terminal_type must be one of: satcom, radio"
	})

	v.RegisterMessage("max", func(fe playgroundValidator.FieldError) string {
		return fe.Field() + " is too long"
	})

	return v
}

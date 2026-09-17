package satcomservice

import (
	"backend/internal/shared/validator"

	playgroundValidator "github.com/go-playground/validator/v10"
)

func NewValidator() *validator.Validator {
	v := validator.New()

	v.RegisterMessage("required", func(fe playgroundValidator.FieldError) string {
		switch fe.Field() {
		case "ID":
			return "service ID is required"
		case "Abbrev":
			return "abbrev is required"
		default:
			return fe.Field() + " is required"
		}
	})

	v.RegisterMessage("max", func(fe playgroundValidator.FieldError) string {
		return fe.Field() + " is too long"
	})

	return v
}

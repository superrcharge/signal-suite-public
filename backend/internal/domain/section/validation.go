package section

import (
	"backend/internal/shared/validator"

	playgroundValidator "github.com/go-playground/validator/v10"
)

func NewValidator() *validator.Validator {
	v := validator.New()

	v.RegisterMessage("required", func(fe playgroundValidator.FieldError) string {
		switch fe.Field() {
		case "Key":
			return "section key is required"
		case "Label":
			return "section label is required"
		case "Color":
			return "section color is required"
		default:
			return fe.Field() + " is required"
		}
	})

	v.RegisterMessage("min", func(fe playgroundValidator.FieldError) string {
		return fe.Field() + " cannot be empty"
	})

	v.RegisterMessage("max", func(fe playgroundValidator.FieldError) string {
		switch fe.Field() {
		case "Key":
			return "section key cannot exceed 50 characters"
		case "Label":
			return "section label cannot exceed 100 characters"
		case "Color":
			return "section color cannot exceed 20 characters"
		default:
			return fe.Field() + " is too long"
		}
	})

	return v
}

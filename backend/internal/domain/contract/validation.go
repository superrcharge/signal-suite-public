package contract

import (
	"backend/internal/shared/validator"

	playgroundValidator "github.com/go-playground/validator/v10"
)

func NewValidator() *validator.Validator {
	v := validator.New()

	v.RegisterMessage("required", func(fe playgroundValidator.FieldError) string {
		switch fe.Field() {
		case "Title":
			return "contract title is required"
		case "Company":
			return "company is required"
		case "FiscalYear":
			return "fiscal year is required"
		case "ID":
			return "contract ID is required"
		default:
			return fe.Field() + " is required"
		}
	})

	v.RegisterMessage("max", func(fe playgroundValidator.FieldError) string {
		return fe.Field() + " is too long"
	})

	v.RegisterMessage("uuid", func(fe playgroundValidator.FieldError) string {
		return "invalid contract ID format"
	})

	return v
}

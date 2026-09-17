package pace

import (
	"backend/internal/shared/validator"

	playgroundValidator "github.com/go-playground/validator/v10"
)

func NewValidator() *validator.Validator {
	v := validator.New()

	v.RegisterMessage("required", func(fe playgroundValidator.FieldError) string {
		switch fe.Field() {
		case "Section":
			return "section is required"
		case "RadioType":
			return "radio type is required"
		case "NetID":
			return "each channel must name a net"
		case "ChannelNumber":
			return "channel number is required"
		default:
			return fe.Field() + " is required"
		}
	})

	v.RegisterMessage("max", func(fe playgroundValidator.FieldError) string {
		// The row caps are a count, not a length. Saying "too long" about a
		// list of nine LTAC rows would send the squadron looking for a long
		// string that is not there.
		switch fe.Field() {
		case "LTACRows":
			return "the LTAC table holds at most " + fe.Param() + " rows"
		case "TACSATRows":
			return "the TACSAT table holds at most " + fe.Param() + " rows"
		case "TmnRows":
			return "the TACTICAL MISSION NETWORK box holds at most " + fe.Param() + " rows"
		default:
			return fe.Field() + " is too long"
		}
	})

	v.RegisterMessage("min", func(fe playgroundValidator.FieldError) string {
		return fe.Field() + " is below the minimum of " + fe.Param()
	})

	return v
}

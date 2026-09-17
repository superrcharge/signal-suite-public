package validator

import (
	"github.com/go-playground/validator/v10"
)

type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

type ValidationErrors struct {
	Errors []ValidationError `json:"errors"`
}

func (v *ValidationErrors) Error() string {
	if len(v.Errors) > 0 {
		return v.Errors[0].Message
	}
	return "validation failed"
}

type MessageFunc func(fe validator.FieldError) string

type Validator struct {
	v        *validator.Validate
	messages map[string]MessageFunc
}

func New() *Validator {
	return &Validator{
		v:        validator.New(validator.WithRequiredStructEnabled()),
		messages: make(map[string]MessageFunc),
	}
}

func (val *Validator) RegisterValidation(tag string, fn validator.Func) error {
	return val.v.RegisterValidation(tag, fn)
}

func (val *Validator) RegisterMessage(tag string, fn MessageFunc) {
	val.messages[tag] = fn
}

func (val *Validator) Validate(out any) error {
	err := val.v.Struct(out)
	if err == nil {
		return nil
	}

	validationErrors, ok := err.(validator.ValidationErrors)
	if !ok {
		return err
	}

	var errors []ValidationError
	for _, e := range validationErrors {
		errors = append(errors, ValidationError{
			Field:   ToSnakeCase(e.Field()),
			Message: val.buildMessage(e),
		})
	}

	return &ValidationErrors{Errors: errors}
}

func (val *Validator) buildMessage(e validator.FieldError) string {
	if fn, ok := val.messages[e.Tag()]; ok {
		return fn(e)
	}
	return defaultMessage(e)
}

func defaultMessage(e validator.FieldError) string {
	switch e.Tag() {
	case "required":
		return e.Field() + " is required"
	case "email":
		return e.Field() + " must be a valid email"
	case "min":
		return e.Field() + " must be at least " + e.Param()
	case "max":
		return e.Field() + " must be at most " + e.Param()
	case "oneof":
		return e.Field() + " must be one of: " + e.Param()
	case "uuid":
		return e.Field() + " must be a valid UUID"
	default:
		return e.Field() + " is invalid"
	}
}

func ToSnakeCase(s string) string {
	var result []byte
	for i, c := range s {
		if c >= 'A' && c <= 'Z' {
			if i > 0 {
				result = append(result, '_')
			}
			result = append(result, byte(c+32)) // #nosec G115 -- ASCII-range rune by guard above
		} else if c < 0x80 {
			result = append(result, byte(c)) // #nosec G115 -- ASCII-range rune
		} else {
			result = append(result, []byte(string(c))...)
		}
	}
	return string(result)
}

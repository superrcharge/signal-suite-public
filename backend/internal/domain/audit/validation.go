package audit

import "backend/internal/shared/validator"

// NewValidator returns a validator for audit DTOs. No custom rules yet;
// kept as its own constructor for consistency with other domains.
func NewValidator() *validator.Validator {
	return validator.New()
}

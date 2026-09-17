package terminal

import (
	"errors"
	"testing"

	"backend/internal/domain/terminal/dto"
	"backend/internal/shared/validator"
)

func TestValidator_PopPin(t *testing.T) {
	v := NewValidator()
	const id = "550e8400-e29b-41d4-a716-446655440000"

	tests := []struct {
		name    string
		popPin  *string
		wantErr bool
	}{
		{name: "nil pointer (field not provided) passes", popPin: nil, wantErr: false},
		{name: "empty string (clear signal) passes", popPin: strPtr(""), wantErr: false},
		{name: "valid slug passes", popPin: strPtr(PopPinUSEast), wantErr: false},
		{name: "invalid slug fails", popPin: strPtr("mars"), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := v.Validate(&dto.UpdateTerminalRequest{ID: id, PopPin: tt.popPin})
			if !tt.wantErr {
				if err != nil {
					t.Fatalf("expected no error, got %v", err)
				}
				return
			}
			var vErrs *validator.ValidationErrors
			if !errors.As(err, &vErrs) {
				t.Fatalf("expected ValidationErrors, got %v", err)
			}
			want := "pop_pin must be one of: us-east, us-west, germany, uk, australia"
			if len(vErrs.Errors) != 1 || vErrs.Errors[0].Field != "pop_pin" || vErrs.Errors[0].Message != want {
				t.Fatalf("unexpected validation errors: %+v", vErrs.Errors)
			}
		})
	}
}

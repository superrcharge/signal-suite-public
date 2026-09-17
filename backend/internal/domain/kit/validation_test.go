package kit

import (
	"errors"
	"testing"

	"backend/internal/domain/kit/dto"
	"backend/internal/shared/validator"
)

func TestValidator_CreateType(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		name    string
		req     *dto.CreateKitRequest
		wantErr bool
		field   string
		message string
	}{
		{
			name:    "valid remote passes",
			req:     &dto.CreateKitRequest{Name: "K1", Type: TypeRemote},
			wantErr: false,
		},
		{
			name:    "missing type fails",
			req:     &dto.CreateKitRequest{Name: "K1"},
			wantErr: true,
			field:   "type",
			message: "kit type is required",
		},
		{
			name:    "invalid type fails",
			req:     &dto.CreateKitRequest{Name: "K1", Type: "widget"},
			wantErr: true,
			field:   "type",
			message: "type must be one of: remote, ifk, atk",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := v.Validate(tt.req)
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
			found := false
			for _, e := range vErrs.Errors {
				if e.Field == tt.field && e.Message == tt.message {
					found = true
				}
			}
			if !found {
				t.Fatalf("expected error field=%q message=%q, got %+v", tt.field, tt.message, vErrs.Errors)
			}
		})
	}
}

func TestValidator_UpdateStatus(t *testing.T) {
	v := NewValidator()
	const id = "550e8400-e29b-41d4-a716-446655440000"

	// Invalid status on update fails.
	err := v.Validate(&dto.UpdateKitRequest{ID: id, Status: strPtr("bogus")})
	var vErrs *validator.ValidationErrors
	if !errors.As(err, &vErrs) {
		t.Fatalf("expected ValidationErrors, got %v", err)
	}
	want := "status must be one of: available, alert, alert-blue, alert-green, on-mission, reserved, inop"
	found := false
	for _, e := range vErrs.Errors {
		if e.Field == "status" && e.Message == want {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected status oneof error, got %+v", vErrs.Errors)
	}

	// Nil status pointer (not provided) passes.
	if err := v.Validate(&dto.UpdateKitRequest{ID: id}); err != nil {
		t.Fatalf("expected no error for omitted status, got %v", err)
	}
}

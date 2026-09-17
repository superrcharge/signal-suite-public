package user

import (
	"testing"

	"backend/internal/domain/user/dto"
	"backend/internal/shared/validator"
)

func TestValidator_GetUserRequest(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		name        string
		req         *dto.GetUserRequest
		expectError bool
		expectedMsg string
	}{
		{
			name:        "valid uuid",
			req:         &dto.GetUserRequest{ID: "550e8400-e29b-41d4-a716-446655440000"},
			expectError: false,
		},
		{
			name:        "missing id",
			req:         &dto.GetUserRequest{ID: ""},
			expectError: true,
			expectedMsg: "user ID is required",
		},
		{
			name:        "invalid uuid format",
			req:         &dto.GetUserRequest{ID: "not-a-uuid"},
			expectError: true,
			expectedMsg: "invalid user ID format",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := v.Validate(tt.req)

			if tt.expectError {
				if err == nil {
					t.Error("expected validation error, got nil")
					return
				}

				validationErr, ok := err.(*validator.ValidationErrors)
				if !ok {
					t.Errorf("expected *validator.ValidationErrors, got %T", err)
					return
				}

				if tt.expectedMsg != "" {
					found := false
					for _, e := range validationErr.Errors {
						if e.Message == tt.expectedMsg {
							found = true
							break
						}
					}
					if !found {
						t.Errorf("expected message %q, not found in errors: %v", tt.expectedMsg, validationErr.Errors)
					}
				}
			} else {
				if err != nil {
					t.Errorf("expected no error, got %v", err)
				}
			}
		})
	}
}

func TestValidator_UpdatePreferencesRequest(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		name        string
		req         *dto.UpdatePreferencesRequest
		expectError bool
		expectedMsg string
	}{
		{
			name: "valid light theme",
			req: &dto.UpdatePreferencesRequest{
				ID:    "550e8400-e29b-41d4-a716-446655440000",
				Theme: "light",
			},
			expectError: false,
		},
		{
			name: "valid dark theme",
			req: &dto.UpdatePreferencesRequest{
				ID:    "550e8400-e29b-41d4-a716-446655440000",
				Theme: "dark",
			},
			expectError: false,
		},
		{
			name: "invalid theme",
			req: &dto.UpdatePreferencesRequest{
				ID:    "550e8400-e29b-41d4-a716-446655440000",
				Theme: "blue",
			},
			expectError: true,
			expectedMsg: "theme must be either 'light' or 'dark'",
		},
		{
			name: "missing theme",
			req: &dto.UpdatePreferencesRequest{
				ID: "550e8400-e29b-41d4-a716-446655440000",
			},
			expectError: true,
			expectedMsg: "theme preference is required",
		},
		{
			name: "invalid uuid",
			req: &dto.UpdatePreferencesRequest{
				ID:    "invalid",
				Theme: "dark",
			},
			expectError: true,
			expectedMsg: "invalid user ID format",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := v.Validate(tt.req)

			if tt.expectError {
				if err == nil {
					t.Error("expected validation error, got nil")
					return
				}

				validationErr, ok := err.(*validator.ValidationErrors)
				if !ok {
					t.Errorf("expected *validator.ValidationErrors, got %T", err)
					return
				}

				if tt.expectedMsg != "" {
					found := false
					for _, e := range validationErr.Errors {
						if e.Message == tt.expectedMsg {
							found = true
							break
						}
					}
					if !found {
						t.Errorf("expected message %q, not found in errors: %v", tt.expectedMsg, validationErr.Errors)
					}
				}
			} else {
				if err != nil {
					t.Errorf("expected no error, got %v", err)
				}
			}
		})
	}
}

func TestValidator_ListUsersRequest(t *testing.T) {
	v := NewValidator()

	tests := []struct {
		name        string
		req         *dto.ListUsersRequest
		expectError bool
	}{
		{
			name:        "valid request",
			req:         &dto.ListUsersRequest{Limit: 20, Offset: 0},
			expectError: false,
		},
		{
			name:        "valid max limit",
			req:         &dto.ListUsersRequest{Limit: 100, Offset: 0},
			expectError: false,
		},
		{
			name:        "limit too high",
			req:         &dto.ListUsersRequest{Limit: 101, Offset: 0},
			expectError: true,
		},
		{
			name:        "limit too low",
			req:         &dto.ListUsersRequest{Limit: 0, Offset: 0},
			expectError: true,
		},
		{
			name:        "negative offset",
			req:         &dto.ListUsersRequest{Limit: 20, Offset: -1},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := v.Validate(tt.req)

			if tt.expectError {
				if err == nil {
					t.Error("expected validation error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("expected no error, got %v", err)
				}
			}
		})
	}
}

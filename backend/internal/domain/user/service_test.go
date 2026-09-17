package user

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"backend/internal/domain/user/dto"
)

func TestService_GetUser(t *testing.T) {
	existingUser := &User{
		ID:          "550e8400-e29b-41d4-a716-446655440000",
		Email:       "test@example.com",
		Name:        "Test User",
		Preferences: Preferences{Theme: ThemeLight},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	tests := []struct {
		name           string
		req            *dto.GetUserRequest
		mockRepo       *MockRepository
		expectedStatus int
		expectedErr    error
	}{
		{
			name: "success",
			req:  &dto.GetUserRequest{ID: existingUser.ID},
			mockRepo: &MockRepository{
				FindByIDFunc: func(ctx context.Context, id string) (*User, error) {
					return existingUser, nil
				},
			},
			expectedStatus: http.StatusOK,
			expectedErr:    nil,
		},
		{
			name: "user not found",
			req:  &dto.GetUserRequest{ID: "nonexistent-id"},
			mockRepo: &MockRepository{
				FindByIDFunc: func(ctx context.Context, id string) (*User, error) {
					return nil, ErrUserNotFound
				},
			},
			expectedStatus: http.StatusNotFound,
			expectedErr:    ErrUserNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewService(tt.mockRepo)
			resp := &dto.GetUserResponse{}

			status, err := svc.GetUser(context.Background(), tt.req, resp)

			if status != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, status)
			}

			if tt.expectedErr != nil {
				if err == nil {
					t.Errorf("expected error %v, got nil", tt.expectedErr)
				}
			} else {
				if err != nil {
					t.Errorf("expected no error, got %v", err)
				}
				if resp.User.ID != existingUser.ID {
					t.Errorf("expected ID %s, got %s", existingUser.ID, resp.User.ID)
				}
			}
		})
	}
}

func TestService_ListUsers(t *testing.T) {
	users := []*User{
		{ID: "1", Email: "user1@example.com", Name: "User 1", Preferences: Preferences{Theme: ThemeLight}},
		{ID: "2", Email: "user2@example.com", Name: "User 2", Preferences: Preferences{Theme: ThemeDark}},
	}

	tests := []struct {
		name           string
		req            *dto.ListUsersRequest
		mockRepo       *MockRepository
		expectedStatus int
		expectedTotal  int
		expectedErr    error
	}{
		{
			name: "success",
			req:  &dto.ListUsersRequest{Limit: 20, Offset: 0},
			mockRepo: &MockRepository{
				FindAllFunc: func(ctx context.Context, limit, offset int) ([]*User, int, error) {
					return users, 2, nil
				},
			},
			expectedStatus: http.StatusOK,
			expectedTotal:  2,
			expectedErr:    nil,
		},
		{
			name: "empty list",
			req:  &dto.ListUsersRequest{Limit: 20, Offset: 0},
			mockRepo: &MockRepository{
				FindAllFunc: func(ctx context.Context, limit, offset int) ([]*User, int, error) {
					return []*User{}, 0, nil
				},
			},
			expectedStatus: http.StatusOK,
			expectedTotal:  0,
			expectedErr:    nil,
		},
		{
			name: "repository error",
			req:  &dto.ListUsersRequest{Limit: 20, Offset: 0},
			mockRepo: &MockRepository{
				FindAllFunc: func(ctx context.Context, limit, offset int) ([]*User, int, error) {
					return nil, 0, errors.New("database error")
				},
			},
			expectedStatus: http.StatusInternalServerError,
			expectedErr:    ErrUserInternalError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewService(tt.mockRepo)
			resp := &dto.ListUsersResponse{}

			status, err := svc.ListUsers(context.Background(), tt.req, resp)

			if status != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, status)
			}

			if tt.expectedErr != nil {
				if err == nil {
					t.Errorf("expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("expected no error, got %v", err)
				}
				if resp.Total != tt.expectedTotal {
					t.Errorf("expected total %d, got %d", tt.expectedTotal, resp.Total)
				}
			}
		})
	}
}

func TestService_UpdatePreferences(t *testing.T) {
	existingUser := &User{
		ID:          "550e8400-e29b-41d4-a716-446655440000",
		Email:       "test@example.com",
		Name:        "Test User",
		Preferences: Preferences{Theme: ThemeLight},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	tests := []struct {
		name           string
		req            *dto.UpdatePreferencesRequest
		mockRepo       *MockRepository
		expectedStatus int
		expectedTheme  string
		expectedErr    error
	}{
		{
			name: "success",
			req: &dto.UpdatePreferencesRequest{
				ID:    existingUser.ID,
				Theme: ThemeDark,
			},
			mockRepo: &MockRepository{
				FindByIDFunc: func(ctx context.Context, id string) (*User, error) {
					return &User{
						ID:          existingUser.ID,
						Email:       existingUser.Email,
						Name:        existingUser.Name,
						Preferences: existingUser.Preferences,
						CreatedAt:   existingUser.CreatedAt,
						UpdatedAt:   existingUser.UpdatedAt,
					}, nil
				},
				UpdateFunc: func(ctx context.Context, user *User) error {
					return nil
				},
			},
			expectedStatus: http.StatusOK,
			expectedTheme:  ThemeDark,
			expectedErr:    nil,
		},
		{
			name: "user not found",
			req: &dto.UpdatePreferencesRequest{
				ID:    "nonexistent-id",
				Theme: ThemeDark,
			},
			mockRepo: &MockRepository{
				FindByIDFunc: func(ctx context.Context, id string) (*User, error) {
					return nil, ErrUserNotFound
				},
			},
			expectedStatus: http.StatusNotFound,
			expectedErr:    ErrUserNotFound,
		},
		{
			name: "update error",
			req: &dto.UpdatePreferencesRequest{
				ID:    existingUser.ID,
				Theme: ThemeDark,
			},
			mockRepo: &MockRepository{
				FindByIDFunc: func(ctx context.Context, id string) (*User, error) {
					return existingUser, nil
				},
				UpdateFunc: func(ctx context.Context, user *User) error {
					return errors.New("database error")
				},
			},
			expectedStatus: http.StatusInternalServerError,
			expectedErr:    ErrUserInternalError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewService(tt.mockRepo)
			resp := &dto.UpdatePreferencesResponse{}

			status, err := svc.UpdatePreferences(context.Background(), tt.req, resp)

			if status != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, status)
			}

			if tt.expectedErr != nil {
				if err == nil {
					t.Errorf("expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("expected no error, got %v", err)
				}
				if resp.User.Preferences.Theme != tt.expectedTheme {
					t.Errorf("expected theme %s, got %s", tt.expectedTheme, resp.User.Preferences.Theme)
				}
			}
		})
	}
}

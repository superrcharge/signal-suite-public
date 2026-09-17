package user

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"backend/internal/auth"
	"backend/internal/domain/user/dto"
	"backend/internal/middleware"
	"backend/internal/shared/response"

	"github.com/gofiber/fiber/v3"
)

// defaultTestAdmin is used in functional tests to bypass authorization checks
var defaultTestAdmin = &User{
	ID:    "test-admin-id",
	Email: "admin@test.com",
	Name:  "Test Admin",
	Roles: []string{"admin"},
}

func setupTestApp(handler *Handler, svc *Service) *fiber.App {
	app := fiber.New()

	// Inject default admin user for functional tests (bypasses authorization)
	app.Use(func(c fiber.Ctx) error {
		c.Locals(middleware.UserLocalsKey, defaultTestAdmin)
		return c.Next()
	})

	// Create auth middleware with auth disabled for tests
	authMiddleware := middleware.NewAuthMiddleware(&auth.Config{Mode: auth.ModeNone}, svc)
	RegisterRoutes(app, handler, authMiddleware)
	return app
}

// setupTestAppWithAuth creates an app with a middleware that injects the given user into context
func setupTestAppWithAuth(handler *Handler, svc *Service, currentUser *User) *fiber.App {
	app := fiber.New()

	// Inject current user into context (simulates authenticated user)
	app.Use(func(c fiber.Ctx) error {
		if currentUser != nil {
			c.Locals(middleware.UserLocalsKey, currentUser)
		}
		return c.Next()
	})

	// Register routes without auth middleware (we inject user manually above)
	api := app.Group("/api/v1")
	users := api.Group("/users")
	users.Get("/:id", handler.GetUser)
	users.Patch("/:id/preferences", handler.UpdatePreferences)

	return app
}

func TestHandler_GetUser(t *testing.T) {
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
		userID         string
		mockRepo       *MockRepository
		expectedStatus int
		expectedCode   string
	}{
		{
			name:   "success",
			userID: existingUser.ID,
			mockRepo: &MockRepository{
				FindByIDFunc: func(ctx context.Context, id string) (*User, error) {
					return existingUser, nil
				},
			},
			expectedStatus: http.StatusOK,
		},
		{
			name:           "invalid uuid",
			userID:         "invalid-uuid",
			mockRepo:       &MockRepository{},
			expectedStatus: http.StatusBadRequest,
			expectedCode:   "VALIDATION_ERROR",
		},
		{
			name:   "user not found",
			userID: "550e8400-e29b-41d4-a716-446655440001",
			mockRepo: &MockRepository{
				FindByIDFunc: func(ctx context.Context, id string) (*User, error) {
					return nil, ErrUserNotFound
				},
			},
			expectedStatus: http.StatusNotFound,
			expectedCode:   "USER_NOT_FOUND",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewService(tt.mockRepo)
			validator := NewValidator()
			handler := NewHandler(svc, validator, false)
			app := setupTestApp(handler, svc)

			req := httptest.NewRequest(http.MethodGet, "/api/v1/users/"+tt.userID, nil)

			resp, err := app.Test(req)
			if err != nil {
				t.Fatalf("failed to test request: %v", err)
			}
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode != tt.expectedStatus {
				body, _ := io.ReadAll(resp.Body)
				t.Errorf("expected status %d, got %d. Body: %s", tt.expectedStatus, resp.StatusCode, string(body))
			}

			if tt.expectedCode != "" {
				body, _ := io.ReadAll(resp.Body)
				var apiResp response.APIResponse
				if err := json.Unmarshal(body, &apiResp); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if apiResp.Error == nil || apiResp.Error.Code != tt.expectedCode {
					t.Errorf("expected error code %s, got %v", tt.expectedCode, apiResp.Error)
				}
			}
		})
	}
}

func TestHandler_ListUsers(t *testing.T) {
	users := []*User{
		{ID: "1", Email: "user1@example.com", Name: "User 1", Preferences: Preferences{Theme: ThemeLight}},
		{ID: "2", Email: "user2@example.com", Name: "User 2", Preferences: Preferences{Theme: ThemeDark}},
	}

	tests := []struct {
		name           string
		query          string
		mockRepo       *MockRepository
		expectedStatus int
		expectedTotal  int
	}{
		{
			name:  "success with defaults",
			query: "",
			mockRepo: &MockRepository{
				FindAllFunc: func(ctx context.Context, limit, offset int) ([]*User, int, error) {
					return users, 2, nil
				},
			},
			expectedStatus: http.StatusOK,
			expectedTotal:  2,
		},
		{
			name:  "success with custom pagination",
			query: "?limit=10&offset=5",
			mockRepo: &MockRepository{
				FindAllFunc: func(ctx context.Context, limit, offset int) ([]*User, int, error) {
					if limit != 10 || offset != 5 {
						t.Errorf("expected limit=10, offset=5, got limit=%d, offset=%d", limit, offset)
					}
					return users, 2, nil
				},
			},
			expectedStatus: http.StatusOK,
			expectedTotal:  2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewService(tt.mockRepo)
			validator := NewValidator()
			handler := NewHandler(svc, validator, false)
			app := setupTestApp(handler, svc)

			req := httptest.NewRequest(http.MethodGet, "/api/v1/users"+tt.query, nil)

			resp, err := app.Test(req)
			if err != nil {
				t.Fatalf("failed to test request: %v", err)
			}
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode != tt.expectedStatus {
				body, _ := io.ReadAll(resp.Body)
				t.Errorf("expected status %d, got %d. Body: %s", tt.expectedStatus, resp.StatusCode, string(body))
			}

			if tt.expectedStatus == http.StatusOK {
				body, _ := io.ReadAll(resp.Body)
				var apiResp struct {
					Success bool                  `json:"success"`
					Data    dto.ListUsersResponse `json:"data"`
				}
				if err := json.Unmarshal(body, &apiResp); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if apiResp.Data.Total != tt.expectedTotal {
					t.Errorf("expected total %d, got %d", tt.expectedTotal, apiResp.Data.Total)
				}
			}
		})
	}
}

func TestHandler_UpdatePreferences(t *testing.T) {
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
		userID         string
		body           interface{}
		mockRepo       *MockRepository
		expectedStatus int
		expectedCode   string
	}{
		{
			name:   "success",
			userID: existingUser.ID,
			body: map[string]string{
				"theme": "dark",
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
		},
		{
			name:           "invalid uuid",
			userID:         "invalid-uuid",
			body:           map[string]string{"theme": "dark"},
			mockRepo:       &MockRepository{},
			expectedStatus: http.StatusBadRequest,
			expectedCode:   "VALIDATION_ERROR",
		},
		{
			name:   "invalid theme",
			userID: existingUser.ID,
			body: map[string]string{
				"theme": "blue",
			},
			mockRepo:       &MockRepository{},
			expectedStatus: http.StatusBadRequest,
			expectedCode:   "VALIDATION_ERROR",
		},
		{
			name:   "user not found",
			userID: "550e8400-e29b-41d4-a716-446655440001",
			body: map[string]string{
				"theme": "dark",
			},
			mockRepo: &MockRepository{
				FindByIDFunc: func(ctx context.Context, id string) (*User, error) {
					return nil, ErrUserNotFound
				},
			},
			expectedStatus: http.StatusNotFound,
			expectedCode:   "USER_NOT_FOUND",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewService(tt.mockRepo)
			validator := NewValidator()
			handler := NewHandler(svc, validator, false)
			app := setupTestApp(handler, svc)

			bodyBytes, _ := json.Marshal(tt.body)
			req := httptest.NewRequest(http.MethodPatch, "/api/v1/users/"+tt.userID+"/preferences", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req)
			if err != nil {
				t.Fatalf("failed to test request: %v", err)
			}
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode != tt.expectedStatus {
				body, _ := io.ReadAll(resp.Body)
				t.Errorf("expected status %d, got %d. Body: %s", tt.expectedStatus, resp.StatusCode, string(body))
			}

			if tt.expectedCode != "" {
				body, _ := io.ReadAll(resp.Body)
				var apiResp response.APIResponse
				if err := json.Unmarshal(body, &apiResp); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if apiResp.Error == nil || apiResp.Error.Code != tt.expectedCode {
					t.Errorf("expected error code %s, got %v", tt.expectedCode, apiResp.Error)
				}
			}
		})
	}
}

// TestHandler_GetUser_Authorization tests the ownership verification for GetUser
func TestHandler_GetUser_Authorization(t *testing.T) {
	targetUser := &User{
		ID:          "550e8400-e29b-41d4-a716-446655440000",
		Email:       "target@example.com",
		Name:        "Target User",
		Roles:       []string{"user"},
		Preferences: Preferences{Theme: ThemeLight},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	tests := []struct {
		name           string
		currentUser    *User
		targetUserID   string
		mockRepo       *MockRepository
		expectedStatus int
		expectedCode   string
	}{
		{
			name: "user can access own profile",
			currentUser: &User{
				ID:    targetUser.ID,
				Email: "target@example.com",
				Name:  "Target User",
				Roles: []string{"user"},
			},
			targetUserID: targetUser.ID,
			mockRepo: &MockRepository{
				FindByIDFunc: func(ctx context.Context, id string) (*User, error) {
					return targetUser, nil
				},
			},
			expectedStatus: http.StatusOK,
		},
		{
			name: "admin can access any user profile",
			currentUser: &User{
				ID:    "550e8400-e29b-41d4-a716-446655440001",
				Email: "admin@example.com",
				Name:  "Admin User",
				Roles: []string{"admin"},
			},
			targetUserID: targetUser.ID,
			mockRepo: &MockRepository{
				FindByIDFunc: func(ctx context.Context, id string) (*User, error) {
					return targetUser, nil
				},
			},
			expectedStatus: http.StatusOK,
		},
		{
			name: "non-admin cannot access other user profile",
			currentUser: &User{
				ID:    "550e8400-e29b-41d4-a716-446655440002",
				Email: "other@example.com",
				Name:  "Other User",
				Roles: []string{"user"},
			},
			targetUserID:   targetUser.ID,
			mockRepo:       &MockRepository{},
			expectedStatus: http.StatusForbidden,
			expectedCode:   "USER_FORBIDDEN",
		},
		{
			name:           "unauthenticated user cannot access profile",
			currentUser:    nil,
			targetUserID:   targetUser.ID,
			mockRepo:       &MockRepository{},
			expectedStatus: http.StatusForbidden,
			expectedCode:   "USER_FORBIDDEN",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewService(tt.mockRepo)
			validator := NewValidator()
			handler := NewHandler(svc, validator, false)
			app := setupTestAppWithAuth(handler, svc, tt.currentUser)

			req := httptest.NewRequest(http.MethodGet, "/api/v1/users/"+tt.targetUserID, nil)

			resp, err := app.Test(req)
			if err != nil {
				t.Fatalf("failed to test request: %v", err)
			}
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode != tt.expectedStatus {
				body, _ := io.ReadAll(resp.Body)
				t.Errorf("expected status %d, got %d. Body: %s", tt.expectedStatus, resp.StatusCode, string(body))
			}

			if tt.expectedCode != "" {
				body, _ := io.ReadAll(resp.Body)
				var apiResp response.APIResponse
				if err := json.Unmarshal(body, &apiResp); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if apiResp.Error == nil || apiResp.Error.Code != tt.expectedCode {
					t.Errorf("expected error code %s, got %v", tt.expectedCode, apiResp.Error)
				}
			}
		})
	}
}

// TestHandler_UpdatePreferences_Authorization tests the ownership verification for UpdatePreferences
func TestHandler_UpdatePreferences_Authorization(t *testing.T) {
	targetUser := &User{
		ID:          "550e8400-e29b-41d4-a716-446655440000",
		Email:       "target@example.com",
		Name:        "Target User",
		Roles:       []string{"user"},
		Preferences: Preferences{Theme: ThemeLight},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	tests := []struct {
		name           string
		currentUser    *User
		targetUserID   string
		body           interface{}
		mockRepo       *MockRepository
		expectedStatus int
		expectedCode   string
	}{
		{
			name: "user can update own preferences",
			currentUser: &User{
				ID:    targetUser.ID,
				Email: "target@example.com",
				Name:  "Target User",
				Roles: []string{"user"},
			},
			targetUserID: targetUser.ID,
			body:         map[string]string{"theme": "dark"},
			mockRepo: &MockRepository{
				FindByIDFunc: func(ctx context.Context, id string) (*User, error) {
					return targetUser, nil
				},
				UpdateFunc: func(ctx context.Context, user *User) error {
					return nil
				},
			},
			expectedStatus: http.StatusOK,
		},
		{
			name: "admin can update any user preferences",
			currentUser: &User{
				ID:    "550e8400-e29b-41d4-a716-446655440001",
				Email: "admin@example.com",
				Name:  "Admin User",
				Roles: []string{"admin"},
			},
			targetUserID: targetUser.ID,
			body:         map[string]string{"theme": "dark"},
			mockRepo: &MockRepository{
				FindByIDFunc: func(ctx context.Context, id string) (*User, error) {
					return targetUser, nil
				},
				UpdateFunc: func(ctx context.Context, user *User) error {
					return nil
				},
			},
			expectedStatus: http.StatusOK,
		},
		{
			name: "non-admin cannot update other user preferences",
			currentUser: &User{
				ID:    "550e8400-e29b-41d4-a716-446655440002",
				Email: "other@example.com",
				Name:  "Other User",
				Roles: []string{"user"},
			},
			targetUserID:   targetUser.ID,
			body:           map[string]string{"theme": "dark"},
			mockRepo:       &MockRepository{},
			expectedStatus: http.StatusForbidden,
			expectedCode:   "USER_FORBIDDEN",
		},
		{
			name:           "unauthenticated user cannot update preferences",
			currentUser:    nil,
			targetUserID:   targetUser.ID,
			body:           map[string]string{"theme": "dark"},
			mockRepo:       &MockRepository{},
			expectedStatus: http.StatusForbidden,
			expectedCode:   "USER_FORBIDDEN",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewService(tt.mockRepo)
			validator := NewValidator()
			handler := NewHandler(svc, validator, false)
			app := setupTestAppWithAuth(handler, svc, tt.currentUser)

			bodyBytes, _ := json.Marshal(tt.body)
			req := httptest.NewRequest(http.MethodPatch, "/api/v1/users/"+tt.targetUserID+"/preferences", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req)
			if err != nil {
				t.Fatalf("failed to test request: %v", err)
			}
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode != tt.expectedStatus {
				body, _ := io.ReadAll(resp.Body)
				t.Errorf("expected status %d, got %d. Body: %s", tt.expectedStatus, resp.StatusCode, string(body))
			}

			if tt.expectedCode != "" {
				body, _ := io.ReadAll(resp.Body)
				var apiResp response.APIResponse
				if err := json.Unmarshal(body, &apiResp); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if apiResp.Error == nil || apiResp.Error.Code != tt.expectedCode {
					t.Errorf("expected error code %s, got %v", tt.expectedCode, apiResp.Error)
				}
			}
		})
	}
}

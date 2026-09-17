# PATTERN:testing-backend

## Name
Backend Unit Testing

## Intent
Write comprehensive unit tests for each layer (handler, service, validation, helpers) using Go's standard testing package with table-driven tests and mocks.

## Context
Apply when:
- Implementing new domain functionality
- Modifying existing business logic
- Fixing bugs (test-first approach)
- Reviewing code coverage

## Solution

### Test File Organization

Each domain has corresponding test files alongside the implementation:

```
internal/domain/user/
├── handler.go
├── handler_test.go      # Handler HTTP tests
├── service.go
├── service_test.go      # Service business logic tests
├── validation.go
├── validation_test.go   # Validation rule tests
├── helpers.go
├── helpers_test.go      # Helper function tests
├── repository.go
├── repository_mock.go   # Mock for testing
```

### Mock Repository Pattern

Create a mock that implements the Repository interface with configurable functions:

```go
// repository_mock.go
type MockRepository struct {
    CreateFunc      func(ctx context.Context, user *User) error
    FindByIDFunc    func(ctx context.Context, id string) (*User, error)
    FindByEmailFunc func(ctx context.Context, email string) (*User, error)
    FindAllFunc     func(ctx context.Context, limit, offset int) ([]*User, int, error)
    UpdateFunc      func(ctx context.Context, user *User) error
    DeleteFunc      func(ctx context.Context, id string) error
}

func (m *MockRepository) Create(ctx context.Context, user *User) error {
    if m.CreateFunc != nil {
        return m.CreateFunc(ctx, user)
    }
    return nil
}

func (m *MockRepository) FindByID(ctx context.Context, id string) (*User, error) {
    if m.FindByIDFunc != nil {
        return m.FindByIDFunc(ctx, id)
    }
    return nil, ErrUserNotFound
}

// ... implement all interface methods
```

### Service Tests

Use table-driven tests with mock repository:

```go
func TestService_CreateUser(t *testing.T) {
    tests := []struct {
        name           string
        req            *dto.CreateUserRequest
        mockRepo       *MockRepository
        expectedStatus int
        expectedErr    error
    }{
        {
            name: "success",
            req: &dto.CreateUserRequest{
                Email: "test@example.com",
                Name:  "Test User",
            },
            mockRepo: &MockRepository{
                FindByEmailFunc: func(ctx context.Context, email string) (*User, error) {
                    return nil, ErrUserNotFound
                },
                CreateFunc: func(ctx context.Context, user *User) error {
                    return nil
                },
            },
            expectedStatus: http.StatusCreated,
            expectedErr:    nil,
        },
        {
            name: "email already exists",
            req: &dto.CreateUserRequest{
                Email: "existing@example.com",
                Name:  "Test User",
            },
            mockRepo: &MockRepository{
                FindByEmailFunc: func(ctx context.Context, email string) (*User, error) {
                    return &User{ID: "existing-id", Email: email}, nil
                },
            },
            expectedStatus: http.StatusConflict,
            expectedErr:    ErrEmailExists,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            svc := NewService(tt.mockRepo)
            resp := &dto.CreateUserResponse{}

            status, err := svc.CreateUser(context.Background(), tt.req, resp)

            if status != tt.expectedStatus {
                t.Errorf("expected status %d, got %d", tt.expectedStatus, status)
            }

            if tt.expectedErr != nil {
                if err == nil {
                    t.Errorf("expected error %v, got nil", tt.expectedErr)
                }
            } else if err != nil {
                t.Errorf("expected no error, got %v", err)
            }
        })
    }
}
```

### Handler Tests

Use Fiber's test utilities for HTTP layer testing:

```go
func setupTestApp(handler *Handler) *fiber.App {
    app := fiber.New()
    RegisterRoutes(app, handler)
    return app
}

func TestHandler_CreateUser(t *testing.T) {
    tests := []struct {
        name           string
        body           interface{}
        mockRepo       *MockRepository
        expectedStatus int
        expectedCode   string
    }{
        {
            name: "success",
            body: map[string]string{
                "email": "test@example.com",
                "name":  "Test User",
            },
            mockRepo: &MockRepository{
                FindByEmailFunc: func(ctx context.Context, email string) (*User, error) {
                    return nil, ErrUserNotFound
                },
                CreateFunc: func(ctx context.Context, user *User) error {
                    return nil
                },
            },
            expectedStatus: http.StatusCreated,
        },
        {
            name: "validation error - missing email",
            body: map[string]string{
                "name": "Test User",
            },
            mockRepo:       &MockRepository{},
            expectedStatus: http.StatusBadRequest,
            expectedCode:   "VALIDATION_ERROR",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            svc := NewService(tt.mockRepo)
            validator := NewValidator()
            handler := NewHandler(svc, validator)
            app := setupTestApp(handler)

            bodyBytes, _ := json.Marshal(tt.body)
            req := httptest.NewRequest(http.MethodPost, "/api/v1/users", bytes.NewReader(bodyBytes))
            req.Header.Set("Content-Type", "application/json")

            resp, err := app.Test(req)
            if err != nil {
                t.Fatalf("failed to test request: %v", err)
            }
            defer resp.Body.Close()

            if resp.StatusCode != tt.expectedStatus {
                body, _ := io.ReadAll(resp.Body)
                t.Errorf("expected status %d, got %d. Body: %s",
                    tt.expectedStatus, resp.StatusCode, string(body))
            }

            if tt.expectedCode != "" {
                body, _ := io.ReadAll(resp.Body)
                var apiResp response.APIResponse
                json.Unmarshal(body, &apiResp)
                if apiResp.Error == nil || apiResp.Error.Code != tt.expectedCode {
                    t.Errorf("expected error code %s, got %v", tt.expectedCode, apiResp.Error)
                }
            }
        })
    }
}
```

### Validation Tests

Test custom validation rules and messages:

```go
// Note: Field names are converted to snake_case in ValidationErrors
func TestValidator_CreateUserRequest(t *testing.T) {
    v := NewValidator()

    tests := []struct {
        name           string
        req            *dto.CreateUserRequest
        expectError    bool
        expectedFields []string  // Use snake_case field names
        expectedMsg    string
    }{
        {
            name: "valid request",
            req: &dto.CreateUserRequest{
                Email: "test@example.com",
                Name:  "Test User",
            },
            expectError: false,
        },
        {
            name: "missing email",
            req: &dto.CreateUserRequest{
                Name: "Test User",
            },
            expectError:    true,
            expectedFields: []string{"email"},  // snake_case
            expectedMsg:    "email address is required",
        },
        {
            name: "invalid email format",
            req: &dto.CreateUserRequest{
                Email: "not-an-email",
                Name:  "Test User",
            },
            expectError:    true,
            expectedFields: []string{"email"},  // snake_case
            expectedMsg:    "please provide a valid email address",
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

                for _, field := range tt.expectedFields {
                    found := false
                    for _, e := range validationErr.Errors {
                        if e.Field == field {
                            found = true
                            if tt.expectedMsg != "" && e.Message != tt.expectedMsg {
                                t.Errorf("expected message %q, got %q", tt.expectedMsg, e.Message)
                            }
                            break
                        }
                    }
                    if !found {
                        t.Errorf("expected error for field %s, not found", field)
                    }
                }
            } else if err != nil {
                t.Errorf("expected no error, got %v", err)
            }
        })
    }
}
```

### Helper Tests

Test data transformation functions:

```go
func TestToUserResponse(t *testing.T) {
    now := time.Now()
    user := &User{
        ID:          "550e8400-e29b-41d4-a716-446655440000",
        Email:       "test@example.com",
        Name:        "Test User",
        Preferences: Preferences{Theme: ThemeDark},
        CreatedAt:   now,
        UpdatedAt:   now,
    }

    resp := toUserResponse(user)

    if resp.ID != user.ID {
        t.Errorf("expected ID %s, got %s", user.ID, resp.ID)
    }
    if resp.Email != user.Email {
        t.Errorf("expected Email %s, got %s", user.Email, resp.Email)
    }
    // ... verify all fields
}

func TestToUserResponseList(t *testing.T) {
    users := []*User{
        {ID: "1", Email: "user1@example.com", Name: "User 1"},
        {ID: "2", Email: "user2@example.com", Name: "User 2"},
    }

    responses := toUserResponseList(users)

    if len(responses) != len(users) {
        t.Fatalf("expected %d responses, got %d", len(users), len(responses))
    }

    for i, resp := range responses {
        if resp.ID != users[i].ID {
            t.Errorf("response[%d]: expected ID %s, got %s", i, users[i].ID, resp.ID)
        }
    }
}

func TestToUserResponseList_Empty(t *testing.T) {
    responses := toUserResponseList([]*User{})
    if len(responses) != 0 {
        t.Errorf("expected empty slice, got %d items", len(responses))
    }
}
```

### Running Tests

```bash
# Run all tests in a domain
go test ./internal/domain/user/...

# Run with verbose output
go test -v ./internal/domain/user/...

# Run specific test
go test -v -run TestService_CreateUser ./internal/domain/user/

# Run with coverage
go test -cover ./internal/domain/user/...

# Generate coverage report
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out

# Run all backend tests
go test ./...
```

## Examples

### Good Example
```go
// Table-driven test with clear structure
func TestService_GetUser(t *testing.T) {
    tests := []struct {
        name           string
        req            *dto.GetUserRequest
        mockRepo       *MockRepository
        expectedStatus int
        expectedErr    error
    }{
        {
            name: "success",
            // ... test case
        },
        {
            name: "user not found",
            // ... test case
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // ... test logic
        })
    }
}
```

### Anti-Pattern
```go
// BAD: Single test without table-driven approach
func TestGetUser(t *testing.T) {
    // Hard to add new cases
    // Duplicated setup code
    svc := NewService(mockRepo)
    resp := &dto.GetUserResponse{}
    status, err := svc.GetUser(ctx, req, resp)
    if status != 200 {
        t.Error("failed")
    }
}

// BAD: No mock - testing real database
func TestService_CreateUser_Real(t *testing.T) {
    db := connectToRealDB()  // WRONG: Tests should be isolated
    repo := NewRepository(db)
    svc := NewService(repo)
    // ...
}

// BAD: Testing implementation details
func TestService_Internal(t *testing.T) {
    // Testing private methods or internal state
    svc := NewService(mockRepo)
    if svc.repo == nil {  // WRONG: Test behavior, not internals
        t.Error("repo is nil")
    }
}
```

## Consequences

**Benefits:**
- Tests are isolated via mocks (no database required)
- Table-driven tests are easy to extend
- Each layer has focused tests
- Custom validation messages are verified
- Fiber's `app.Test()` enables realistic HTTP testing

**Trade-offs:**
- Boilerplate for mock implementations
- Test maintenance when interfaces change
- Setup overhead for handler tests

## Related Patterns
- [PATTERN:api-design] - Handler structure being tested
- [PATTERN:error-handling] - Error responses to verify
- [PATTERN:validation] - Validation rules to test
- [PATTERN:domain-structure] - Where tests live

## Checklist
- [ ] Mock repository implements full interface
- [ ] Service tests cover success and error paths
- [ ] Handler tests verify HTTP status codes and response bodies
- [ ] Validation tests verify custom messages
- [ ] Helper tests verify data transformations
- [ ] Tests use table-driven approach
- [ ] Tests run in isolation (no external dependencies)
- [ ] `go test ./...` passes

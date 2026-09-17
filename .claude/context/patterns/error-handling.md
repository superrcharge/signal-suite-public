# PATTERN:error-handling

## Name
Domain-Specific Error Handling

## Intent
Define typed errors per domain that carry HTTP status codes and machine-readable codes for consistent API responses.

## Context
Apply when building APIs where:
- Errors need to be distinguishable by type
- API responses need consistent error format
- Each domain has specific error conditions

## Solution

### Domain Error Type

Each domain defines its own error type implementing `CodedError`:

```go
// internal/domain/user/errors.go
package user

import "net/http"

type Error struct {
    Code    string
    Message string
    Status  int
}

func (e *Error) Error() string {
    return e.Message
}

func (e *Error) GetCode() string {
    return e.Code
}

func (e *Error) GetStatus() int {
    return e.Status
}

var (
    ErrUserNotFound = &Error{
        Code:    "USER_NOT_FOUND",
        Message: "user not found",
        Status:  http.StatusNotFound,
    }
    ErrEmailExists = &Error{
        Code:    "USER_EMAIL_EXISTS",
        Message: "email already exists",
        Status:  http.StatusConflict,
    }
)
```

### CodedError Interface

The shared response package defines the interface:

```go
// internal/shared/response/response.go
type CodedError interface {
    error
    GetCode() string
    GetStatus() int
}
```

### Error Response Handling

```go
func Err(err error) APIResponse {
    // Check for validation errors first
    if validationErrs, ok := err.(*validator.ValidationErrors); ok {
        return APIResponse{
            Success: false,
            Error: &Error{
                Code:    "VALIDATION_ERROR",
                Message: "validation failed",
                Details: validationErrs.Errors,
            },
        }
    }

    // Check for domain errors
    if coded, ok := err.(CodedError); ok {
        return APIResponse{
            Success: false,
            Error: &Error{
                Code:    coded.GetCode(),
                Message: coded.Error(),
            },
        }
    }

    // Fallback for unknown errors
    return APIResponse{
        Success: false,
        Error: &Error{
            Code:    "INTERNAL_ERROR",
            Message: "internal server error",
        },
    }
}

func StatusFromError(err error) int {
    if _, ok := err.(*validator.ValidationErrors); ok {
        return http.StatusBadRequest
    }
    if coded, ok := err.(CodedError); ok {
        return coded.GetStatus()
    }
    return http.StatusInternalServerError
}
```

### Usage in Service

```go
func (s *Service) GetUser(ctx context.Context, req *dto.GetUserRequest, resp *dto.GetUserResponse) (int, error) {
    user, err := s.repo.FindByID(ctx, req.ID)
    if err != nil {
        // Repository returns domain error
        return ErrUserNotFound.Status, ErrUserNotFound
    }

    *resp = toUserResponse(user)
    return http.StatusOK, nil
}
```

### Usage in Repository

```go
func (r *Repository) FindByID(ctx context.Context, id string) (*User, error) {
    // ...
    if errors.Is(err, pgx.ErrNoRows) {
        return nil, ErrUserNotFound  // Return domain error
    }
    return nil, err
}
```

## Examples

### Good Example
```go
// Domain owns its errors
var ErrUserNotFound = &Error{
    Code:    "USER_NOT_FOUND",
    Message: "user not found",
    Status:  http.StatusNotFound,
}

// Service returns domain error
func (s *Service) GetUser(...) (int, error) {
    user, err := s.repo.FindByID(ctx, req.ID)
    if err != nil {
        return ErrUserNotFound.Status, ErrUserNotFound
    }
    // ...
}
```

### Anti-Pattern
```go
// BAD: Generic errors without codes
func (s *Service) GetUser(...) error {
    user, err := s.repo.FindByID(ctx, req.ID)
    if err != nil {
        return fmt.Errorf("user not found")  // No code, no status
    }
}

// BAD: Importing shared errors into domain
import "backend/internal/shared/errors"
return errors.ErrNotFound  // Breaks domain isolation
```

## Consequences

**Benefits:**
- Each domain owns its error definitions
- Errors are type-safe and inspectable
- Consistent API error responses
- Easy to add domain-specific error details

**Trade-offs:**
- Boilerplate error definitions per domain
- Need to implement interface methods

## Related Patterns
- [PATTERN:domain-structure] - Where errors live
- [PATTERN:api-design] - How errors are returned
- [PATTERN:validation] - Validation error handling

## Checklist
- [ ] Each domain has `errors.go` with typed errors
- [ ] Errors implement `CodedError` interface (Error, GetCode, GetStatus)
- [ ] Error codes follow `DOMAIN_ERROR_NAME` convention
- [ ] HTTP status codes are appropriate (404, 409, 400, etc.)
- [ ] Services return `(status, error)` tuple

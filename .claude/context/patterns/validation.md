# PATTERN:validation

## Name
Domain-Owned Request Validation

## Intent
Validate requests using struct tags with domain-specific custom rules and messages.

## Context
Apply when:
- Request DTOs need validation
- Validation messages should be domain-specific
- Custom validation rules are needed per domain

## Solution

### DTO Struct Tags

Use `go-playground/validator` tags on DTOs:

```go
// internal/domain/user/dto/request.go
type CreateUserRequest struct {
    Email string `json:"email" validate:"required,email"`
    Name  string `json:"name" validate:"required,min=1,max=100"`
}

type UpdatePreferencesRequest struct {
    ID    string `validate:"required,uuid"`
    Theme string `json:"theme" validate:"required,oneof=light dark"`
}
```

### Domain Validator

Each domain creates its own validator with custom messages:

```go
// internal/domain/user/validation.go
package user

import (
    "backend/internal/shared/validator"
    playgroundValidator "github.com/go-playground/validator/v10"
)

func NewValidator() *validator.Validator {
    v := validator.New()

    // Custom messages per field
    v.RegisterMessage("required", func(fe playgroundValidator.FieldError) string {
        switch fe.Field() {
        case "Email":
            return "email address is required"
        case "Name":
            return "user name is required"
        case "Theme":
            return "theme preference is required"
        default:
            return fe.Field() + " is required"
        }
    })

    v.RegisterMessage("email", func(fe playgroundValidator.FieldError) string {
        return "please provide a valid email address"
    })

    v.RegisterMessage("oneof", func(fe playgroundValidator.FieldError) string {
        if fe.Field() == "Theme" {
            return "theme must be either 'light' or 'dark'"
        }
        return fe.Field() + " must be one of: " + fe.Param()
    })

    return v
}
```

### Shared Validator Base

The shared package provides extensible base:

```go
// internal/shared/validator/validator.go
type MessageFunc func(fe validator.FieldError) string

type Validator struct {
    v        *validator.Validate
    messages map[string]MessageFunc
}

func New() *Validator { ... }

func (val *Validator) RegisterValidation(tag string, fn validator.Func) error
func (val *Validator) RegisterMessage(tag string, fn MessageFunc)
func (val *Validator) Validate(out any) error
```

### Handler Usage

```go
func (h *Handler) CreateUser(c fiber.Ctx) error {
    req := &dto.CreateUserRequest{}
    if err := c.Bind().JSON(req); err != nil {
        return c.Status(http.StatusBadRequest).JSON(response.Err(err))
    }

    // Validate with domain validator
    if err := h.validator.Validate(req); err != nil {
        return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
    }

    // Service receives validated data
    resp := &dto.CreateUserResponse{}
    status, err := h.service.CreateUser(c.Context(), req, resp)
    // ...
}
```

### Validation Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "validation failed",
    "details": [
      {"field": "email", "message": "please provide a valid email address"},
      {"field": "name", "message": "user name is required"}
    ]
  }
}
```

### Wiring in main.go

```go
userValidator := user.NewValidator()
userHandler := user.NewHandler(userService, userValidator)
```

## Examples

### Good Example
```go
// Domain-specific validation messages
v.RegisterMessage("required", func(fe playgroundValidator.FieldError) string {
    switch fe.Field() {
    case "Email":
        return "email address is required"
    case "Name":
        return "user name is required"
    default:
        return fe.Field() + " is required"
    }
})
```

### Anti-Pattern
```go
// BAD: Manual validation in handler
func (h *Handler) CreateUser(c fiber.Ctx) error {
    req := &dto.CreateUserRequest{}
    c.Bind().JSON(req)

    if req.Email == "" {
        return c.Status(400).JSON(...)
    }
    if req.Name == "" {
        return c.Status(400).JSON(...)
    }
    // Verbose, inconsistent, error-prone
}
```

### Custom Validation Rule
```go
// Register custom validation
v.RegisterValidation("allowed_domain", func(fl validator.FieldLevel) bool {
    email := fl.Field().String()
    return strings.HasSuffix(email, "@company.com")
})

v.RegisterMessage("allowed_domain", func(fe playgroundValidator.FieldError) string {
    return "email must be a company email address"
})

// Use in DTO
type CreateUserRequest struct {
    Email string `validate:"required,email,allowed_domain"`
}
```

## Consequences

**Benefits:**
- Declarative validation via struct tags
- Domain owns its validation rules and messages
- Consistent validation error format
- Easy to add custom rules

**Trade-offs:**
- Requires validator dependency
- Boilerplate for custom messages
- Learning curve for complex rules

## Related Patterns
- [PATTERN:api-design] - Handler validation flow
- [PATTERN:error-handling] - Validation error responses
- [PATTERN:domain-structure] - Where validation.go lives

## Checklist
- [ ] DTOs have validation tags
- [ ] Domain has `validation.go` with custom messages
- [ ] Handler validates before calling service
- [ ] Validation errors return field-specific details
- [ ] Custom rules registered for domain-specific logic

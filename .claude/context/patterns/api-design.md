# PATTERN:api-design

## Name
REST API Design (Go Fiber)

## Intent
Define consistent API structure with clear separation between HTTP handling and business logic.

## Context
Apply when building REST APIs with Go Fiber v3.

## Solution

### Handler Pattern

Handlers are responsible for:
1. Extracting request data (params, query, body)
2. Validating input via struct tags
3. Calling the service
4. Returning the response

```go
func (h *Handler) GetUser(c fiber.Ctx) error {
    // 1. Extract request data
    req := &dto.GetUserRequest{ID: c.Params("id")}

    // 2. Validate
    if err := h.validator.Validate(req); err != nil {
        return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
    }

    // 3. Call service
    resp := &dto.GetUserResponse{}
    status, err := h.service.GetUser(c.Context(), req, resp)
    if err != nil {
        return c.Status(status).JSON(response.Err(err))
    }

    // 4. Return response
    return c.Status(status).JSON(response.Success(resp))
}
```

### Service Signature Pattern

Services return HTTP status and error, write to response pointer:

```go
func (s *Service) GetUser(ctx context.Context, req *dto.GetUserRequest, resp *dto.GetUserResponse) (int, error)
```

**Why this pattern:**
- Service determines appropriate HTTP status (404, 409, 201, etc.)
- Response DTO is populated in place (no allocation on success path)
- Errors are domain-typed with status codes
- Handler remains thin and consistent

### Route Registration

```go
func RegisterRoutes(app *fiber.App, handler *Handler) {
    users := app.Group("/api/v1/users")

    users.Post("/", handler.CreateUser)
    users.Get("/", handler.ListUsers)
    users.Get("/:id", handler.GetUser)
    users.Patch("/:id/preferences", handler.UpdatePreferences)
}
```

### Standard Response Format

```go
type APIResponse struct {
    Success bool   `json:"success"`
    Data    any    `json:"data,omitempty"`
    Error   *Error `json:"error,omitempty"`
}

type Error struct {
    Code    string            `json:"code"`
    Message string            `json:"message"`
    Details []ValidationError `json:"details,omitempty"`
}
```

### Fiber v3 Specifics

```go
// Handler signature (value type, not pointer)
func(c fiber.Ctx) error

// Generic query parsing
limit := fiber.Query(c, "limit", 20)

// JSON binding
if err := c.Bind().JSON(req); err != nil { ... }

// Context extraction for services
status, err := h.service.Method(c.Context(), req, resp)
```

## Examples

### Good Example
```go
func (h *Handler) CreateUser(c fiber.Ctx) error {
    req := &dto.CreateUserRequest{}
    if err := c.Bind().JSON(req); err != nil {
        return c.Status(http.StatusBadRequest).JSON(response.Err(err))
    }

    if err := h.validator.Validate(req); err != nil {
        return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
    }

    resp := &dto.CreateUserResponse{}
    status, err := h.service.CreateUser(c.Context(), req, resp)
    if err != nil {
        return c.Status(status).JSON(response.Err(err))
    }

    return c.Status(status).JSON(response.Success(resp))
}
```

### Anti-Pattern
```go
// BAD: Business logic in handler
func (h *Handler) CreateUser(c fiber.Ctx) error {
    var req CreateUserRequest
    c.Bind().JSON(&req)

    // WRONG: Business logic should be in service
    if existingUser, _ := h.repo.FindByEmail(req.Email); existingUser != nil {
        return c.Status(409).JSON(...)
    }

    user := &User{Email: req.Email}
    h.repo.Create(user)  // WRONG: Direct repo access

    return c.JSON(user)
}
```

## Consequences

**Benefits:**
- Handlers are thin and testable
- Business logic centralized in services
- Consistent response format
- Clear error propagation

**Trade-offs:**
- Slightly verbose handler code
- Service signature requires understanding

## Related Patterns
- [PATTERN:domain-structure] - Folder organization
- [PATTERN:error-handling] - Error types
- [PATTERN:validation] - Request validation

## Checklist
- [ ] Handlers only extract, validate, call service, respond
- [ ] Services return `(int, error)` with status codes
- [ ] All responses use `response.Success()` or `response.Err()`
- [ ] Routes registered via `RegisterRoutes()` function
- [ ] API versioned (`/api/v1/...`)

# PATTERN:domain-structure

## Name
Domain-Driven Folder Structure

## Intent
Organize code by business domain to enable clean separation of concerns, avoid circular imports, and support future microservice extraction.

## Context
Apply when building a backend service that:
- Has multiple business domains (users, orders, payments, etc.)
- Needs clear boundaries between domains
- May need to extract domains into separate services later

## Solution

### Folder Structure
```
backend/
├── main.go                          # DI wiring, server bootstrap
├── config/
│   └── config.go                    # Environment configuration
├── internal/
│   ├── domain/
│   │   └── {domain}/                # One folder per business domain
│   │       ├── model.go             # Domain entities
│   │       ├── errors.go            # Domain-specific errors
│   │       ├── dto/
│   │       │   ├── request.go       # Request DTOs
│   │       │   └── response.go      # Response DTOs
│   │       ├── repository.go        # Interface + implementation
│   │       ├── service.go           # Business logic
│   │       ├── handler.go           # HTTP handlers
│   │       ├── routes.go            # Route registration
│   │       ├── validation.go        # Domain validator with custom rules
│   │       └── helpers.go           # Internal helper functions
│   │
│   ├── shared/
│   │   ├── contracts/               # Cross-domain service interfaces ONLY
│   │   ├── response/                # Standard API response wrapper
│   │   └── validator/               # Base validator types
│   │
│   ├── infrastructure/
│   │   └── database/                # Database connection setup
│   │
│   └── middleware/                  # HTTP middleware
```

### Key Rules

1. **Domain isolation**: Each domain folder is self-contained
2. **No cross-domain imports**: Domains never import each other directly
3. **Cross-domain calls via contracts**: Use interfaces in `shared/contracts/`
4. **DTOs per domain**: Each domain owns its request/response types
5. **Private helpers**: Helper functions in `helpers.go` are unexported

### Layer Responsibilities

| Layer | Responsibility | Imports |
|-------|---------------|---------|
| `handler.go` | Parse request, validate, call service, return response | dto, service, validator |
| `service.go` | Business logic, orchestration | repository, model, dto |
| `repository.go` | Data access, persistence | model |
| `model.go` | Domain entities | (none) |
| `errors.go` | Domain-specific error types | (none) |

## Examples

### Good Example
```go
// internal/domain/user/service.go
package user

type Service struct {
    repo Repository
}

func NewService(repo Repository) *Service {
    return &Service{repo: repo}
}

func (s *Service) GetUser(ctx context.Context, req *dto.GetUserRequest, resp *dto.GetUserResponse) (int, error) {
    user, err := s.repo.FindByID(ctx, req.ID)
    if err != nil {
        return ErrUserNotFound.Status, ErrUserNotFound
    }
    *resp = toUserResponse(user)
    return http.StatusOK, nil
}
```

### Anti-Pattern
```go
// BAD: Domain importing another domain directly
package order

import "backend/internal/domain/user"  // WRONG!

func (s *Service) CreateOrder(...) {
    user := user.GetUserByID(id)  // Direct coupling
}
```

### Correct Cross-Domain Call
```go
// shared/contracts/user.go
type IUserService interface {
    GetUser(ctx context.Context, req *userdto.GetUserRequest, resp *userdto.GetUserResponse) (int, error)
}

// domain/order/service.go
type Service struct {
    userService contracts.IUserService  // Inject interface
}
```

## Consequences

**Benefits:**
- Clear boundaries enable independent development
- Easy to extract domains to microservices
- No circular import issues
- Each domain is testable in isolation

**Trade-offs:**
- More files and folders
- Cross-domain calls require interfaces
- Initial setup overhead

## Related Patterns
- [PATTERN:api-design] - API endpoint conventions
- [PATTERN:error-handling] - Domain error types
- [PATTERN:validation] - Request validation

## Checklist
- [ ] Each domain has its own folder under `internal/domain/`
- [ ] No imports between domain packages
- [ ] Cross-domain interfaces in `shared/contracts/`
- [ ] DTOs defined per domain
- [ ] Helper functions are unexported

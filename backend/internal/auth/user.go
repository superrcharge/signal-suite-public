package auth

import "github.com/gofiber/fiber/v3"

// User represents an authenticated identity extracted from JWT claims.
// ID is the Entra object identifier (oid claim); Name is the display name
// with preferred_username fallback; Email is the email claim with upn
// fallback. This is identity only - authorization (roles) lives elsewhere
// in the local users table.
type User struct {
	ID    string
	Name  string
	Email string
}

const userLocalsKey = "auth.user"

// SetUser stores an authenticated identity on the Fiber request locals.
// The middleware calls this after a successful JWT verification.
func SetUser(c fiber.Ctx, u *User) {
	c.Locals(userLocalsKey, u)
}

// UserFromCtx returns the authenticated identity attached to the request,
// or nil if no identity is present (auth disabled, or not yet verified).
func UserFromCtx(c fiber.Ctx) *User {
	if u, ok := c.Locals(userLocalsKey).(*User); ok {
		return u
	}
	return nil
}

package user

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	users := app.Group("/api/v1/users")

	// All user routes require authentication
	users.Use(auth.RequireAuth())

	// Current user endpoint
	users.Get("/me", handler.GetCurrentUser)

	// Admin-only endpoints.
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	admin := auth.RequireRole("admin")
	users.Get("/", admin, handler.ListUsers)
	users.Patch("/:id/role", admin, handler.UpdateRole)

	// User-accessible endpoints
	users.Get("/:id", handler.GetUser)
	users.Patch("/:id/preferences", handler.UpdatePreferences)
}

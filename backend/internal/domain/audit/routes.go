package audit

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	audit := app.Group("/api/v1/audit")
	audit.Use(auth.RequireAuth())

	// Admin-only: the audit log surfaces security-relevant events
	// (role changes, deletions) that rank-and-file users shouldn't see.
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	audit.Get("/", auth.RequireRole("admin"), handler.ListEvents)
}

package section

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	sections := app.Group("/api/v1/sections")
	sections.Use(auth.RequireAuth())

	// Reads open to any authenticated user; writes require admin or editor.
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	writer := auth.RequireRole("admin", "editor")
	sections.Get("/", handler.ListSections)
	sections.Post("/", writer, handler.CreateSection)
	sections.Patch("/:key", writer, handler.UpdateSection)
	sections.Delete("/:key", writer, handler.DeleteSection)
}

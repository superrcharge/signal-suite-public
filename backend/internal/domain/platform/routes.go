package platform

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	// The template carries no user data and is registered on the raw app before
	// the group's RequireAuth, because a prefix-matched Use would gate it.
	app.Get("/api/v1/platforms/import/template", handler.GetImportTemplate)

	// Export is read-only, so any authenticated user reaches it.
	app.Get("/api/v1/export/platforms", auth.RequireAuth(), handler.ExportPlatforms)

	g := app.Group("/api/v1/platforms")
	g.Use(auth.RequireAuth())

	g.Get("/", handler.ListPlatforms)

	// Platforms are joint planning reference data - the input to a PACE across
	// a joint force - so they are gated to PACE's own writers, the same set
	// transports use. Stated as PACE's writer set rather than "any writer": the
	// two pick out the same four roles today and stop agreeing the moment a
	// sixth role exists. See transport/routes.go for the longer argument.
	//
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	writer := auth.RequireRole("admin", "editor", "rto", "planner")
	g.Post("/import", writer, handler.ImportPlatforms)
	g.Post("/", writer, handler.CreatePlatform)
	g.Patch("/:id", writer, handler.UpdatePlatform)
	g.Delete("/:id", writer, handler.DeletePlatform)
}

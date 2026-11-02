package organization

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	// The template carries no user data and is registered on the raw app before
	// the group's RequireAuth, because a prefix-matched Use would gate it.
	app.Get("/api/v1/organizations/import/template", handler.GetImportTemplate)

	// Export is read-only, so any authenticated user reaches it.
	app.Get("/api/v1/export/organizations", auth.RequireAuth(), handler.ExportOrganizations)

	g := app.Group("/api/v1/organizations")
	g.Use(auth.RequireAuth())

	g.Get("/", handler.ListOrganizations)

	// Organizations are reference data the planning side of an operation
	// checks in against, so they are gated to the same writer set as platforms
	// and transports: PACE's. Stated as that set rather than "any writer", for
	// the reason transport/routes.go gives.
	//
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	writer := auth.RequireRole("admin", "editor", "rto", "planner")
	g.Post("/import", writer, handler.ImportOrganizations)
	g.Post("/", writer, handler.CreateOrganization)
	g.Patch("/:key", writer, handler.UpdateOrganization)
	g.Delete("/:key", writer, handler.DeleteOrganization)
}

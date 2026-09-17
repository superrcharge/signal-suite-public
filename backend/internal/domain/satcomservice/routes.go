package satcomservice

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	// The template carries no user data and is registered on the raw app before
	// the group's RequireAuth, because a prefix-matched Use would gate it.
	app.Get("/api/v1/services/import/template", handler.GetImportTemplate)

	// Export is read-only, so any authenticated user reaches it.
	app.Get("/api/v1/export/services", auth.RequireAuth(), handler.ExportServices)

	g := app.Group("/api/v1/services")
	g.Use(auth.RequireAuth())

	g.Get("/", handler.ListServices)
	// Static before param - see the note in waveform/routes.go.
	g.Get("/usage", handler.GetServiceUsage)

	// Services are SATCOM reference data, so rto is not a writer here. It sits
	// on the radio side of the split and has no SATCOM write anywhere else -
	// the waveform routes include it for the mirror-image reason.
	//
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	writer := auth.RequireRole("admin", "editor")
	g.Post("/import", writer, handler.ImportServices)
	g.Post("/", writer, handler.CreateService)
	g.Patch("/:id", writer, handler.UpdateService)
	g.Delete("/:id", writer, handler.DeleteService)
}

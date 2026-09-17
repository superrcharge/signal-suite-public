package terminal

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	// Both templates are registered FIRST, before any group exists.
	//
	// This has to be first, not merely "on the raw app". Fiber matches a group's
	// Use() by path prefix in registration order, so
	// /api/v1/terminals/import/template registered after
	// app.Group("/api/v1/terminals").Use(RequireAuth) is gated by it - which is
	// how an earlier release shipped a route that existed and still answered 401. The 401
	// rather than a 404 is what made it look like the route was missing.
	//
	// Terminals predate the per-resource CSV scheme, so both path shapes point at
	// the same handler. Not redirects: an old client and a new one get identical
	// bytes. The legacy path stays because it is a plain link a user may have
	// bookmarked; the per-resource path is what every other domain uses and what
	// the frontend CSV registry names.
	app.Get("/api/v1/import/template", handler.GetImportTemplate)           // legacy
	app.Get("/api/v1/terminals/import/template", handler.GetImportTemplate) // per-resource

	terminals := app.Group("/api/v1/terminals")
	terminals.Use(auth.RequireAuth())

	// Reads are open to any authenticated user regardless of role.
	terminals.Get("/", handler.ListTerminals)
	terminals.Get("/tags", handler.ListTags)
	terminals.Get("/:id", handler.GetTerminal)

	// Writes require admin or editor. Viewers get 403.
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	writer := auth.RequireRole("admin", "editor")
	terminals.Post("/", writer, handler.CreateTerminal)
	terminals.Patch("/:id", writer, handler.UpdateTerminal)
	terminals.Delete("/:id", writer, handler.DeleteTerminal)

	// Tag catalog - Settings panel management (view/create/delete).
	// GET is open to any authenticated user; writes require editor+.
	tagCatalog := app.Group("/api/v1/tags")
	tagCatalog.Use(auth.RequireAuth())
	tagCatalog.Get("/", handler.ListTagCatalog)
	tagCatalog.Post("/", writer, handler.CreateTagEntry)
	tagCatalog.Delete("/:name", writer, handler.DeleteTagEntry)

	imp := app.Group("/api/v1/import")
	imp.Use(auth.RequireAuth())
	imp.Post("/", writer, handler.ImportTerminals) // legacy

	terminalsImport := app.Group("/api/v1/terminals/import")
	terminalsImport.Use(auth.RequireAuth())
	terminalsImport.Post("/", writer, handler.ImportTerminals)

	// Export is read-only - anyone authenticated can download a CSV.
	//
	// Registered on the raw app, never through an /api/v1/export group. Fiber
	// matches a group's Use by prefix at request time, so a group declared here
	// runs RequireAuth on every domain's export route, not only this one. Three
	// packages each declared that group once, which put four verifications and
	// four user upserts on a single GET, because RequireAuth has no
	// already-authenticated short circuit.
	app.Get("/api/v1/export/terminals", auth.RequireAuth(), handler.ExportTerminals)
}

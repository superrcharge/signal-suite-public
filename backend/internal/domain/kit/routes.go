package kit

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	// Template is a static CSV file with no user data - no auth required.
	// Registered on the raw app BEFORE the group's auth middleware so the
	// prefix-matched RequireAuth (added by kits.Use below) doesn't gate it.
	// It terminates the handler chain, so later-registered auth never runs.
	app.Get("/api/v1/kits/import/template", handler.GetImportTemplate)

	kits := app.Group("/api/v1/kits")
	kits.Use(auth.RequireAuth())

	// Reads are open to any authenticated user regardless of role.
	kits.Get("/", handler.ListKits)
	kits.Get("/:id", handler.GetKit)

	// Writes require admin or editor. Viewers get 403.
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	writer := auth.RequireRole("admin", "editor")
	kits.Post("/", writer, handler.CreateKit)
	kits.Patch("/:id", writer, handler.UpdateKit)
	kits.Delete("/:id", writer, handler.DeleteKit)

	// Import is a write operation.
	kits.Post("/import", writer, handler.ImportKits)

	// Export is read-only - anyone authenticated can download a CSV.
	// Registered on the raw app rather than an /api/v1/export group: see the
	// note in terminal/routes.go for why a group on that prefix stacks.
	app.Get("/api/v1/export/kits", auth.RequireAuth(), handler.ExportKits)
}

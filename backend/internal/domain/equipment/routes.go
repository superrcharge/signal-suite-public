package equipment

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	// Template carries no user data and is registered before the group's
	// RequireAuth, because a prefix-matched Use would gate it. The literal
	// "import" never collides with :id below, but the route-shape test pins
	// that rather than leaving it to reading order.
	app.Get("/api/v1/equipment/import/template", handler.GetImportTemplate)

	// Export is read-only, so any authenticated user reaches it.
	app.Get("/api/v1/export/equipment", auth.RequireAuth(), handler.ExportEquipment)

	g := app.Group("/api/v1/equipment")
	g.Use(auth.RequireAuth())

	g.Get("/", handler.ListEquipment)
	g.Get("/:id/photo", handler.GetPhoto)
	g.Get("/:id", handler.GetEquipment)

	// rto is admitted at the route layer, then narrowed per-record in the
	// service: the catalog holds both satcom and radio equipment, separated
	// by the terminal_type column rather than by route, so RequireRole alone
	// cannot express "radio only". See ErrRadioScopeOnly.
	//
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	writer := auth.RequireRole("admin", "editor", "rto")
	g.Post("/import", writer, handler.ImportEquipment)
	g.Post("/", writer, handler.CreateEquipment)
	g.Patch("/:id", writer, handler.UpdateEquipment)
	g.Delete("/:id", writer, handler.DeleteEquipment)
	g.Post("/:id/photo", writer, handler.UploadPhoto)
}

package contract

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	g := app.Group("/api/v1/contracts")
	g.Use(auth.RequireAuth())

	g.Get("/", handler.ListContracts)
	g.Get("/fiscal-years", handler.ListFiscalYears)
	g.Get("/:id", handler.GetContract)

	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	writer := auth.RequireRole("admin", "editor")
	g.Post("/", writer, handler.CreateContract)
	g.Patch("/:id", writer, handler.UpdateContract)
	g.Delete("/:id", writer, handler.DeleteContract)

	// Export is read-only - anyone authenticated can download a CSV.
	// Registered on the raw app rather than an /api/v1/export group: see the
	// note in terminal/routes.go for why a group on that prefix stacks.
	app.Get("/api/v1/export/contracts", auth.RequireAuth(), handler.ExportContracts)
}

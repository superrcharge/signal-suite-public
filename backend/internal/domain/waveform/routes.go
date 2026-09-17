package waveform

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	// The template carries no user data and is registered on the raw app before
	// the group's RequireAuth, because a prefix-matched Use would gate it. Same
	// ordering trap kit documents.
	app.Get("/api/v1/waveforms/import/template", handler.GetImportTemplate)

	// Export is read-only, so any authenticated user reaches it. Registered on
	// the raw app rather than an /api/v1/export group: see the note in
	// terminal/routes.go. Registering inline does not by itself avoid the
	// stacking, because a group declared in any other package still matches
	// this path by prefix - what avoids it is no package declaring one.
	app.Get("/api/v1/export/waveforms", auth.RequireAuth(), handler.ExportWaveforms)

	g := app.Group("/api/v1/waveforms")
	g.Use(auth.RequireAuth())

	g.Get("/", handler.ListWaveforms)
	// Static before param. Nothing in this package registers GET /:id, so there
	// is no collision today and Fiber matches per method anyway - but the
	// ordering is what keeps that true if one is ever added, and it is what
	// contract/routes.go and terminal/routes.go already do.
	g.Get("/usage", handler.GetWaveformUsage)

	// Waveforms are radio reference data, so rto writes them alongside
	// admin and editor. No per-record scoping is needed here: the whole
	// domain sits on the radio side of the split.
	//
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	writer := auth.RequireRole("admin", "editor", "rto")
	g.Post("/import", writer, handler.ImportWaveforms)
	g.Post("/", writer, handler.CreateWaveform)
	g.Patch("/:id", writer, handler.UpdateWaveform)
	g.Delete("/:id", writer, handler.DeleteWaveform)
}

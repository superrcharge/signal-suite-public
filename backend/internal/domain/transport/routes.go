package transport

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	// The template carries no user data and is registered on the raw app before
	// the group's RequireAuth, because a prefix-matched Use would gate it.
	app.Get("/api/v1/transports/import/template", handler.GetImportTemplate)

	// Export is read-only, so any authenticated user reaches it.
	app.Get("/api/v1/export/transports", auth.RequireAuth(), handler.ExportTransports)

	g := app.Group("/api/v1/transports")
	g.Use(auth.RequireAuth())

	g.Get("/", handler.ListTransports)

	// Transports are named by PACE tiers, so they are gated to match PACE's
	// own writers - the people who need to add a path are the people building
	// the card that names it.
	//
	// This used to read "catalogue reference data on the equipment side of the
	// split", excluding rto for the reason services exclude it. That premise was
	// simply wrong: nothing in domain/equipment references transports at all,
	// and the only consumer is TierSourceTransport in pace/model.go. rto was not
	// an exception being withheld, it was a misfiling. Services keep their
	// exclusion, because services genuinely are SATCOM reference data hanging
	// off equipment records.
	//
	// Note this currently admits every role except viewer, which makes it look
	// equivalent to "any writer". Keep it stated as PACE's writer set: the two
	// pick out the same four roles today and stop agreeing the moment a sixth
	// role exists - a SATCOM-only role would inherit transport write for free
	// under "any writer" and is correctly excluded here.
	//
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	writer := auth.RequireRole("admin", "editor", "rto", "planner")
	g.Post("/import", writer, handler.ImportTransports)
	g.Post("/", writer, handler.CreateTransport)
	g.Patch("/:id", writer, handler.UpdateTransport)
	g.Delete("/:id", writer, handler.DeleteTransport)
}

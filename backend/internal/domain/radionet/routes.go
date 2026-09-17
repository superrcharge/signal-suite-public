package radionet

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	// Template carries no user data and is registered before the group's
	// RequireAuth, because a prefix-matched Use would gate it.
	app.Get("/api/v1/nets/import/template", handler.GetImportTemplate)

	// Export is per-squadron. Section is a path segment here rather than a
	// query filter because it is not a filter: a net belongs to the squadron
	// that maintains it, and there is no cross-section list to narrow.
	app.Get("/api/v1/export/nets/:section", auth.RequireAuth(), handler.ExportNets)

	g := app.Group("/api/v1/nets")
	g.Use(auth.RequireAuth())

	// Scoped by squadron: nets are a per-squadron library, so there is no
	// endpoint that lists or creates one without naming its owner.
	g.Get("/:section", handler.ListNets)

	// rto and planner write nets alongside admin and editor: the Nets Library
	// is the radio side of the catalog split, and the PACE Planner is the
	// product both roles maintain. planner is the narrower of the two - it
	// writes nets and PACE and only reads the catalog - which is why the
	// frontend's canWriteRadio had to split into canWritePace for these two
	// domains.
	//
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	writer := auth.RequireRole("admin", "editor", "rto", "planner")
	g.Post("/:section", writer, handler.CreateNet)

	// Section stays in the path on import for the same reason it does on create:
	// it is the write target, so a file cannot redirect rows to another squadron.
	g.Post("/:section/import", writer, handler.ImportNets)

	// Update and delete key off the net's own id, which already carries its
	// section. Section is deliberately not updatable: a net does not move
	// between squadrons, it is recreated.
	g.Patch("/id/:id", writer, handler.UpdateNet)
	g.Delete("/id/:id", writer, handler.DeleteNet)
}

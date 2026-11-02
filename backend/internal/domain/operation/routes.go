package operation

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	g := app.Group("/api/v1/operations")
	g.Use(auth.RequireAuth())

	g.Get("/", handler.ListOperations)
	g.Get("/:id", handler.GetOperation)
	g.Get("/:id/participants/:org_key", handler.GetParticipant)
	g.Get("/:id/rfis", handler.ListRFIs)

	// Operations are joint planning data, so writes are gated to PACE's writer
	// set, the same one platforms, transports and organizations use. Stated as
	// that set rather than "any writer", for the reason transport/routes.go
	// gives.
	//
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	writer := auth.RequireRole("admin", "editor", "rto", "planner")
	g.Post("/", writer, handler.CreateOperation)
	g.Patch("/:id", writer, handler.UpdateOperation)
	g.Delete("/:id", writer, handler.DeleteOperation)
	g.Put("/:id/phases", writer, handler.SavePhases)
	g.Put("/:id/phases/:phase_id/plan", writer, handler.SavePhasePlan)
	g.Put("/:id/sites", writer, handler.SaveSites)
	// RFIs: the writer gate is the first check, and resolving adds a second in
	// the service, that the caller is the user who posted the RFI.
	g.Post("/:id/rfis", writer, handler.CreateRFI)
	g.Post("/:id/rfis/:rfi_id/comments", writer, handler.AddRFIComment)
	g.Post("/:id/rfis/:rfi_id/resolve", writer, handler.ResolveRFI)
	g.Put("/:id/participants/:org_key", writer, handler.SaveParticipant)
	g.Delete("/:id/participants/:org_key", writer, handler.DeleteParticipant)

	// Id-keyed participant routes, the only way to address an ad hoc ("Other")
	// participant, which has no organization key. Same shape as radionet's
	// /nets/id/:id. "id" is a literal segment, so it cannot collide with the
	// keyed routes, whose second segment is an organization key.
	g.Post("/:id/participants", writer, handler.CreateParticipant)
	g.Patch("/:id/participants/id/:pid", writer, handler.UpdateParticipantByID)
	g.Delete("/:id/participants/id/:pid", writer, handler.DeleteParticipantByID)
}

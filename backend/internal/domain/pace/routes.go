package pace

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	// Export only: a channel row is meaningless without a plan and a net that
	// already exist, so there is no template and no import. csvTable enforces
	// that structurally rather than by convention.
	app.Get("/api/v1/export/pace-channels/:section", auth.RequireAuth(), handler.ExportChannels)

	g := app.Group("/api/v1/pace")
	g.Use(auth.RequireAuth())

	// The whole card in one read and one save. The editor is a single page with
	// a single Save, so granular per-channel endpoints would exist only to be
	// called in a batch anyway.
	g.Get("/:section", handler.GetCard)

	// rto and planner write alongside admin and editor -- the PACE Planner is
	// the product both roles maintain. See radionet/routes.go for why planner
	// reaches only these two domains.
	//
	// Gate before handler: Fiber runs only Handlers[0], so a trailing gate
	// would never execute. See .claude/context/authz.md.
	writer := auth.RequireRole("admin", "editor", "rto", "planner")
	g.Put("/:section", writer, handler.SaveCard)

	// The emblem is its own pair of endpoints: the editor sends it on selection
	// rather than folding it into the card draft, so the whole-card save never
	// carries it and can never clear it.
	// Readable by anyone who can read the card: the container is private, so
	// this is the only way a browser can get the image at all.
	g.Get("/:section/emblem", handler.GetEmblem)
	g.Post("/:section/emblem", writer, handler.UploadEmblem)
	g.Delete("/:section/emblem", writer, handler.DeleteEmblem)
}

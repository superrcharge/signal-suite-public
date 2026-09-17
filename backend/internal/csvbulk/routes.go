package csvbulk

import (
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(app *fiber.App, handler *Handler, auth *middleware.AuthMiddleware) {
	// POST, but both are reads. See the BundleRequest doc comment for why a query
	// string will not carry a nine-dataset column selection.
	//
	// RequireAuth and nothing more, which is exactly what every single-dataset
	// export carries. TestExportRoutesAreAuthOnly fails if one of them ever gains
	// a role gate this endpoint would bypass.
	//
	// The template bundle IS authenticated, unlike the nine single template
	// routes. Those are open because /api/v1/import/template is a plain link a
	// user may have bookmarked; a POST carrying a dataset selection is not a
	// bookmarkable link, so that reason does not transfer.
	app.Post("/api/v1/export/bundle", auth.RequireAuth(), handler.ExportBundle)
	app.Post("/api/v1/template/bundle", auth.RequireAuth(), handler.TemplateBundle)
}

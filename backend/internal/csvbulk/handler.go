package csvbulk

import (
	"net/http"
	"time"

	"backend/internal/shared/csvtable"
	"backend/internal/shared/csvtable/csvhttp"
	"backend/internal/shared/response"
	"backend/internal/shared/validator"

	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	registry  *Registry
	validator *validator.Validator
	// now is injectable so a test can pin the filename and the zip's entry
	// timestamps, which is what makes a byte-comparison of a bundle possible.
	now func() time.Time
}

func NewHandler(registry *Registry, v *validator.Validator) *Handler {
	return &Handler{registry: registry, validator: v, now: time.Now}
}

// SetClock replaces the time source. Tests only.
func (h *Handler) SetClock(now func() time.Time) { h.now = now }

// ExportBundle returns one zip holding several datasets' CSV exports.
func (h *Handler) ExportBundle(c fiber.Ctx) error {
	return h.bundle(c, false)
}

// TemplateBundle returns one zip holding several datasets' import templates.
func (h *Handler) TemplateBundle(c fiber.Ctx) error {
	return h.bundle(c, true)
}

func (h *Handler) bundle(c fiber.Ctx, template bool) error {
	var req BundleRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(&Error{
			Code:    "CSV_BUNDLE_INVALID_BODY",
			Message: "could not read the request body",
			Status:  http.StatusBadRequest,
		}))
	}
	if err := h.validator.Validate(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	now := h.now()
	stamp := now.UTC().Format("20060102")

	entries, err := h.registry.build(c.Context(), req.Datasets, template, stamp)
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	body, err := csvtable.Zip(entries, now)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(response.Err(&Error{
			Code:    "CSV_BUNDLE_INTERNAL_ERROR",
			Message: "could not build the archive",
			Status:  http.StatusInternalServerError,
		}))
	}

	if template {
		return csvhttp.SendTemplateZip(c, body)
	}
	return csvhttp.SendZip(c, "signal-suite-export", body, now)
}

package terminal

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"backend/internal/domain/terminal/dto"
	"backend/internal/middleware"
	"backend/internal/shared/csvtable"
	"backend/internal/shared/response"
	"backend/internal/shared/validator"

	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	service   *Service
	validator *validator.Validator
}

func NewHandler(service *Service, validator *validator.Validator) *Handler {
	return &Handler{service: service, validator: validator}
}

func (h *Handler) CreateTerminal(c fiber.Ctx) error {
	req := &dto.CreateTerminalRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.CreateTerminalResponse{}
	status, err := h.service.CreateTerminal(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) GetTerminal(c fiber.Ctx) error {
	req := &dto.GetTerminalRequest{ID: c.Params("id")}

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.GetTerminalResponse{}
	status, err := h.service.GetTerminal(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) ListTerminals(c fiber.Ctx) error {
	req := &dto.ListTerminalsRequest{
		Sections: csvtable.ParseList(c.Query("sections")),
		Models:   csvtable.ParseList(c.Query("model")),
		Search:   c.Query("search"),
		Tag:      c.Query("tag"),
		Page:     fiber.Query(c, "page", 1),
		Limit:    fiber.Query(c, "limit", 50),
	}

	resp := &dto.ListTerminalsResponse{}
	status, err := h.service.ListTerminals(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

// ListTags returns the distinct, alphabetically-sorted tag strings
// currently in use across terminals. Used by the frontend tag filter
// chip set so the available tags rebuild as data changes.
func (h *Handler) ListTags(c fiber.Ctx) error {
	tags, err := h.service.ListTags(c.Context())
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(response.Err(err))
	}
	if tags == nil {
		tags = []string{}
	}
	return c.Status(http.StatusOK).JSON(response.Success(map[string]any{"tags": tags}))
}

// ListTagCatalog returns all entries from the tags catalog table.
// Used by the Settings panel to list, create, and delete tags.
func (h *Handler) ListTagCatalog(c fiber.Ctx) error {
	entries, err := h.service.ListTagCatalog(c.Context())
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(response.Err(err))
	}
	out := make([]dto.TagCatalogEntryResponse, 0, len(entries))
	for _, e := range entries {
		out = append(out, dto.TagCatalogEntryResponse{
			Name:          e.Name,
			CreatedAt:     e.CreatedAt.Format(time.RFC3339),
			TerminalCount: e.TerminalCount,
		})
	}
	return c.Status(http.StatusOK).JSON(response.Success(map[string]any{"tags": out}))
}

// CreateTagEntry adds a named tag to the catalog.
func (h *Handler) CreateTagEntry(c fiber.Ctx) error {
	var body struct {
		Name string `json:"name"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	entry, err := h.service.CreateTagEntry(c.Context(), body.Name)
	if err != nil {
		if coded, ok := err.(*Error); ok {
			return c.Status(coded.Status).JSON(response.Err(coded))
		}
		return c.Status(http.StatusInternalServerError).JSON(response.Err(err))
	}
	// TerminalCount is 0 by construction: a tag that was just inserted into the
	// catalog is on no terminals. Emitting it keeps the field required on the
	// client rather than optional-and-sometimes-absent.
	return c.Status(http.StatusCreated).JSON(response.Success(dto.TagCatalogEntryResponse{
		Name:          entry.Name,
		CreatedAt:     entry.CreatedAt.Format(time.RFC3339),
		TerminalCount: 0,
	}))
}

// DeleteTagEntry removes a tag from the catalog and clears it from all terminals.
func (h *Handler) DeleteTagEntry(c fiber.Ctx) error {
	// Fiber hands back the raw path segment, still percent-encoded, so a tag
	// with a space in it arrived here as "Operation%20Verify" and matched
	// nothing. Every realistic tag has a space in it, so deleting one from
	// Settings was a no-op - and silently so, because the repository used to
	// discard RowsAffected and answer 204. The button reported success and the
	// tag stayed in the list.
	//
	// PathUnescape fails only on malformed encoding; falling back to the raw
	// value there just lets the name miss and 404, which is the right answer
	// for a name that cannot be decoded.
	name := c.Params("name")
	if decoded, err := url.PathUnescape(name); err == nil {
		name = decoded
	}
	if strings.TrimSpace(name) == "" {
		return c.Status(http.StatusBadRequest).JSON(response.Err(ErrTagNotFound))
	}
	if err := h.service.DeleteTagEntry(c.Context(), name, currentUserID(c), currentUserName(c)); err != nil {
		if coded, ok := err.(*Error); ok {
			return c.Status(coded.Status).JSON(response.Err(coded))
		}
		return c.Status(http.StatusInternalServerError).JSON(response.Err(err))
	}
	return c.SendStatus(http.StatusNoContent)
}

func (h *Handler) UpdateTerminal(c fiber.Ctx) error {
	req := &dto.UpdateTerminalRequest{ID: c.Params("id")}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.UpdateTerminalResponse{}
	status, err := h.service.UpdateTerminal(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) DeleteTerminal(c fiber.Ctx) error {
	req := &dto.DeleteTerminalRequest{
		ID:        c.Params("id"),
		ActorID:   currentUserID(c),
		ActorName: currentUserName(c),
	}

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	status, err := h.service.DeleteTerminal(c.Context(), req)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.SendStatus(status)
}

func (h *Handler) GetImportTemplate(c fiber.Ctx) error {
	// ?columns= partitions the template the same way it partitions an export.
	// Absent means every importable column, which is what every existing caller
	// sends and why the bare template is unchanged.
	columns := csvtable.ParseList(c.Query("columns"))

	csvContent, err := h.service.GetImportTemplate(c.Context(), columns)
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", `attachment; filename="signal-suite-import-template.csv"`)
	return c.SendString(csvContent)
}

// ExportTerminals streams a filtered CSV of terminals. Filters come from
// query params:
//
//	sections=a,b,c    - only these section keys (empty = all)
//	statuses=x,y      - only these status values (empty = all)
//	models=ow7,ow10   - only these models (empty = all)
//	columns=name,kit  - column subset (empty = all, canonical order)
//
// `model` is accepted alongside `models` and merged with it. The list endpoint
// spells it in the singular and the dashboard deep-links `?model=mini,hp`, and
// an unrecognised query param is dropped in silence - so without the alias the
// singular produced a full export that looked filtered.
//
// Browser gets a Content-Disposition so clicking the Export button
// downloads a file directly.
func (h *Handler) ExportTerminals(c fiber.Ctx) error {
	filter := ExportFilter{
		Sections: csvtable.ParseList(c.Query("sections")),
		Statuses: csvtable.ParseList(c.Query("statuses")),
		Models: append(
			csvtable.ParseList(c.Query("models")),
			csvtable.ParseList(c.Query("model"))...,
		),
	}
	columns := csvtable.ParseList(c.Query("columns"))

	csvContent, err := h.service.ExportTerminals(c.Context(), filter, columns)
	if err != nil {
		if coded, ok := err.(*Error); ok {
			return c.Status(coded.Status).JSON(response.Err(coded))
		}
		return c.Status(http.StatusInternalServerError).JSON(response.Err(err))
	}

	filename := fmt.Sprintf("signal-suite-terminals-%s.csv", time.Now().UTC().Format("20060102"))
	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, filename))
	return c.SendString(csvContent)
}

func (h *Handler) ImportTerminals(c fiber.Ctx) error {
	req := &dto.ImportTerminalsRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.ImportTerminalsResponse{}
	status, err := h.service.ImportTerminals(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

// currentUserName extracts the authenticated user's display name from context.
// Falls back to empty string if auth is disabled or user is not set.
func currentUserName(c fiber.Ctx) string {
	u := middleware.GetCurrentUser(c)
	if u == nil {
		return ""
	}
	return u.GetName()
}

// currentUserID extracts the authenticated user's local UUID from
// context, for use as the audit actor_id. Empty when auth is disabled.
func currentUserID(c fiber.Ctx) string {
	u := middleware.GetCurrentUser(c)
	if u == nil {
		return ""
	}
	return u.GetID()
}

package kit

import (
	"fmt"
	"net/http"
	"time"

	"backend/internal/domain/kit/dto"
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

func (h *Handler) CreateKit(c fiber.Ctx) error {
	req := &dto.CreateKitRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.CreateKitResponse{}
	status, err := h.service.CreateKit(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) GetKit(c fiber.Ctx) error {
	req := &dto.GetKitRequest{ID: c.Params("id")}

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.GetKitResponse{}
	status, err := h.service.GetKit(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) ListKits(c fiber.Ctx) error {
	req := &dto.ListKitsRequest{
		Types:    csvtable.ParseList(c.Query("type")),
		Sections: csvtable.ParseList(c.Query("sections")),
		Search:   c.Query("search"),
		Page:     fiber.Query(c, "page", 1),
		Limit:    fiber.Query(c, "limit", 50),
	}

	resp := &dto.ListKitsResponse{}
	status, err := h.service.ListKits(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) UpdateKit(c fiber.Ctx) error {
	req := &dto.UpdateKitRequest{ID: c.Params("id")}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.UpdateKitResponse{}
	status, err := h.service.UpdateKit(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) DeleteKit(c fiber.Ctx) error {
	req := &dto.DeleteKitRequest{
		ID:        c.Params("id"),
		ActorID:   currentUserID(c),
		ActorName: currentUserName(c),
	}

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	status, err := h.service.DeleteKit(c.Context(), req)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.SendStatus(status)
}

func (h *Handler) GetImportTemplate(c fiber.Ctx) error {
	// ?columns= partitions the template the same way it partitions an export.
	columns := csvtable.ParseList(c.Query("columns"))

	csvContent, err := h.service.GetImportTemplate(c.Context(), columns)
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", `attachment; filename="signal-suite-kit-import-template.csv"`)
	return c.SendString(csvContent)
}

// ExportKits streams a filtered CSV of kits. Filters come from query params:
//
//	sections=a,b,c    - only these section keys (empty = all)
//	statuses=x,y      - only these status values (empty = all)
//	types=remote,ifk  - only these kit types (empty = all)
//	columns=name,type - column subset (empty = all, canonical order)
//
// `type` is accepted alongside `types` and merged with it, matching the
// singular the list endpoint and the sidebar deep-links already use. An
// unrecognised query param is dropped in silence, so without the alias the
// singular produced a full export that looked filtered.
//
// Browser gets a Content-Disposition so clicking the Export button
// downloads a file directly.
func (h *Handler) ExportKits(c fiber.Ctx) error {
	filter := ExportFilter{
		Sections: csvtable.ParseList(c.Query("sections")),
		Statuses: csvtable.ParseList(c.Query("statuses")),
		Types: append(
			csvtable.ParseList(c.Query("types")),
			csvtable.ParseList(c.Query("type"))...,
		),
	}
	columns := csvtable.ParseList(c.Query("columns"))

	csvContent, err := h.service.ExportKits(c.Context(), filter, columns)
	if err != nil {
		if coded, ok := err.(*Error); ok {
			return c.Status(coded.Status).JSON(response.Err(coded))
		}
		return c.Status(http.StatusInternalServerError).JSON(response.Err(err))
	}

	filename := fmt.Sprintf("signal-suite-kits-%s.csv", time.Now().UTC().Format("20060102"))
	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, filename))
	return c.SendString(csvContent)
}

func (h *Handler) ImportKits(c fiber.Ctx) error {
	req := &dto.ImportKitsRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.ImportKitsResponse{}
	status, err := h.service.ImportKits(c.Context(), req, resp)
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

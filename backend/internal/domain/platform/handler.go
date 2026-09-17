package platform

import (
	"net/http"
	"time"

	"backend/internal/domain/platform/dto"
	"backend/internal/middleware"
	"backend/internal/shared/csvtable"
	"backend/internal/shared/csvtable/csvhttp"
	"backend/internal/shared/response"
	"backend/internal/shared/validator"

	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	service   *Service
	validator *validator.Validator
}

func NewHandler(service *Service, v *validator.Validator) *Handler {
	return &Handler{service: service, validator: v}
}

func currentUserName(c fiber.Ctx) string {
	u := middleware.GetCurrentUser(c)
	if u == nil {
		return ""
	}
	return u.GetName()
}

// currentUserID is the local user UUID the audit log keys events by, kept
// separate from the display name.
func currentUserID(c fiber.Ctx) string {
	u := middleware.GetCurrentUser(c)
	if u == nil {
		return ""
	}
	return u.GetID()
}

func (h *Handler) ListPlatforms(c fiber.Ctx) error {
	resp := &dto.ListPlatformsResponse{}
	status, err := h.service.ListPlatforms(c.Context(), resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) CreatePlatform(c fiber.Ctx) error {
	req := &dto.CreatePlatformRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.CreatedBy = currentUserName(c)
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.CreatePlatformResponse{}
	status, err := h.service.CreatePlatform(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) UpdatePlatform(c fiber.Ctx) error {
	req := &dto.UpdatePlatformRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.ID = c.Params("id")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.UpdatePlatformResponse{}
	status, err := h.service.UpdatePlatform(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) DeletePlatform(c fiber.Ctx) error {
	req := &dto.DeletePlatformRequest{
		ID:        c.Params("id"),
		UpdatedBy: currentUserName(c),
		ActorID:   currentUserID(c),
	}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	status, err := h.service.DeletePlatform(c.Context(), req)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.SendStatus(status)
}

// ExportPlatforms returns the whole library as CSV. Read-only, so any
// authenticated user reaches it.
func (h *Handler) ExportPlatforms(c fiber.Ctx) error {
	body, err := h.service.ExportPlatforms(c.Context(), csvtable.ParseList(c.Query("columns")))
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	return csvhttp.SendCSV(c, csvTable.FilePrefix, body, time.Now())
}

// GetImportTemplate returns the import template, optionally narrowed to the
// columns the caller selected.
func (h *Handler) GetImportTemplate(c fiber.Ctx) error {
	body, err := h.service.GetImportTemplate(c.Context(), csvtable.ParseList(c.Query("columns")))
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	return csvhttp.SendTemplate(c, csvTable.FilePrefix, body)
}

// ImportPlatforms bulk-creates from an uploaded CSV body. 207 whenever
// anything was written, 400 when every row failed, matching the other
// libraries.
func (h *Handler) ImportPlatforms(c fiber.Ctx) error {
	var req csvhttp.ImportRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(ErrPlatformInternalError))
	}
	if err := h.validator.Validate(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	status, parsed, err := h.service.ImportPlatforms(c.Context(), req.CSV, currentUserName(c))
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(
		csvhttp.BuildImportResponse(csvTable.Noun, csvTable.NounPlural, parsed)))
}

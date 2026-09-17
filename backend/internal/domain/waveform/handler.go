package waveform

import (
	"net/http"
	"time"

	"backend/internal/domain/waveform/dto"
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

// GetWaveformUsage reports which catalog assets carry each waveform.
//
// A read, so it sits behind RequireAuth and no writer gate - the same reasoning
// as the export route.
func (h *Handler) GetWaveformUsage(c fiber.Ctx) error {
	resp := &dto.UsageResponse{}
	status, err := h.service.WaveformUsage(c.Context(), resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) ListWaveforms(c fiber.Ctx) error {
	resp := &dto.ListWaveformsResponse{}
	status, err := h.service.ListWaveforms(c.Context(), resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) CreateWaveform(c fiber.Ctx) error {
	req := &dto.CreateWaveformRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.CreatedBy = currentUserName(c)
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.CreateWaveformResponse{}
	status, err := h.service.CreateWaveform(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) UpdateWaveform(c fiber.Ctx) error {
	req := &dto.UpdateWaveformRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.ID = c.Params("id")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.UpdateWaveformResponse{}
	status, err := h.service.UpdateWaveform(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) DeleteWaveform(c fiber.Ctx) error {
	req := &dto.DeleteWaveformRequest{
		ID:        c.Params("id"),
		UpdatedBy: currentUserName(c),
		ActorID:   currentUserID(c),
	}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	status, err := h.service.DeleteWaveform(c.Context(), req)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.SendStatus(status)
}

// ExportWaveforms returns the whole library as CSV. Read-only, so any
// authenticated user reaches it.
func (h *Handler) ExportWaveforms(c fiber.Ctx) error {
	body, err := h.service.ExportWaveforms(c.Context(), csvtable.ParseList(c.Query("columns")))
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

// ImportWaveforms bulk-creates from an uploaded CSV body. 207 whenever anything
// was written, 400 when every row failed, matching terminals and kits.
func (h *Handler) ImportWaveforms(c fiber.Ctx) error {
	var req csvhttp.ImportRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(ErrWaveformInternalError))
	}
	if err := h.validator.Validate(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	status, parsed, err := h.service.ImportWaveforms(c.Context(), req.CSV, currentUserName(c))
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(
		csvhttp.BuildImportResponse(csvTable.Noun, csvTable.NounPlural, parsed)))
}

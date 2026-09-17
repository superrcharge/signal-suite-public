package satcomservice

import (
	"net/http"
	"time"

	"backend/internal/domain/satcomservice/dto"
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

// GetServiceUsage reports which catalog terminals offer each service. A read,
// so it sits behind RequireAuth with no writer gate.
func (h *Handler) GetServiceUsage(c fiber.Ctx) error {
	resp := &dto.UsageResponse{}
	status, err := h.service.ServiceUsage(c.Context(), resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) ListServices(c fiber.Ctx) error {
	resp := &dto.ListServicesResponse{}
	status, err := h.service.ListServices(c.Context(), resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) CreateService(c fiber.Ctx) error {
	req := &dto.CreateServiceRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.CreatedBy = currentUserName(c)
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.CreateServiceResponse{}
	status, err := h.service.CreateService(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) UpdateService(c fiber.Ctx) error {
	req := &dto.UpdateServiceRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.ID = c.Params("id")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.UpdateServiceResponse{}
	status, err := h.service.UpdateService(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) DeleteService(c fiber.Ctx) error {
	req := &dto.DeleteServiceRequest{
		ID:        c.Params("id"),
		UpdatedBy: currentUserName(c),
		ActorID:   currentUserID(c),
	}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	status, err := h.service.DeleteService(c.Context(), req)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.SendStatus(status)
}

// ExportServices returns the whole library as CSV. Read-only, so any authenticated
// user reaches it.
func (h *Handler) ExportServices(c fiber.Ctx) error {
	body, err := h.service.ExportServices(c.Context(), csvtable.ParseList(c.Query("columns")))
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

// ImportServices bulk-creates from an uploaded CSV body. 207 whenever anything was
// written, 400 when every row failed, matching terminals and kits.
func (h *Handler) ImportServices(c fiber.Ctx) error {
	var req csvhttp.ImportRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(ErrServiceInternalError))
	}
	if err := h.validator.Validate(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	status, parsed, err := h.service.ImportServices(c.Context(), req.CSV, currentUserName(c))
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(
		csvhttp.BuildImportResponse(csvTable.Noun, csvTable.NounPlural, parsed)))
}

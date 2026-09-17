package radionet

import (
	"net/http"
	"time"

	"backend/internal/domain/radionet/dto"
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

func currentUserID(c fiber.Ctx) string {
	u := middleware.GetCurrentUser(c)
	if u == nil {
		return ""
	}
	return u.GetID()
}

func (h *Handler) ListNets(c fiber.Ctx) error {
	req := &dto.ListNetsRequest{Section: c.Params("section")}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.ListNetsResponse{}
	status, err := h.service.ListNets(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) CreateNet(c fiber.Ctx) error {
	req := &dto.CreateNetRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	// Ownership comes from the route, never the body -- a client cannot file a
	// net under a squadron it is not addressing.
	req.Section = c.Params("section")
	req.CreatedBy = currentUserName(c)
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.CreateNetResponse{}
	status, err := h.service.CreateNet(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) UpdateNet(c fiber.Ctx) error {
	req := &dto.UpdateNetRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.ID = c.Params("id")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.UpdateNetResponse{}
	status, err := h.service.UpdateNet(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) DeleteNet(c fiber.Ctx) error {
	req := &dto.DeleteNetRequest{
		ID:        c.Params("id"),
		UpdatedBy: currentUserName(c),
		ActorID:   currentUserID(c),
	}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	status, err := h.service.DeleteNet(c.Context(), req)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.SendStatus(status)
}

// ExportNets returns one squadron's nets as CSV. Read-only, so any
// authenticated user reaches it.
func (h *Handler) ExportNets(c fiber.Ctx) error {
	body, err := h.service.ExportNets(c.Context(), c.Params("section"),
		csvtable.ParseList(c.Query("columns")))
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	return csvhttp.SendCSV(c, csvTable.FilePrefix+"-"+c.Params("section"), body, time.Now())
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

// ImportNets bulk-creates nets into the squadron named in the path. The section
// is the write target, not a column, so it never comes from the file.
func (h *Handler) ImportNets(c fiber.Ctx) error {
	var req csvhttp.ImportRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(ErrNetInternalError))
	}
	if err := h.validator.Validate(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	status, parsed, err := h.service.ImportNets(c.Context(), c.Params("section"), req.CSV, currentUserName(c))
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(
		csvhttp.BuildImportResponse(csvTable.Noun, csvTable.NounPlural, parsed)))
}

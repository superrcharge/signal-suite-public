package section

import (
	"net/http"

	"backend/internal/domain/section/dto"
	"backend/internal/middleware"
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

func (h *Handler) CreateSection(c fiber.Ctx) error {
	req := &dto.CreateSectionRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	if u := middleware.GetCurrentUser(c); u != nil {
		req.ActorID = u.GetID()
		req.ActorName = u.GetName()
	}

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.CreateSectionResponse{}
	status, err := h.service.CreateSection(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) ListSections(c fiber.Ctx) error {
	resp := &dto.ListSectionsResponse{}
	status, err := h.service.ListSections(c.Context(), resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) UpdateSection(c fiber.Ctx) error {
	req := &dto.UpdateSectionRequest{Key: c.Params("key")}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	if u := middleware.GetCurrentUser(c); u != nil {
		req.ActorID = u.GetID()
		req.ActorName = u.GetName()
	}

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.UpdateSectionResponse{}
	status, err := h.service.UpdateSection(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) DeleteSection(c fiber.Ctx) error {
	req := &dto.DeleteSectionRequest{
		Key:        c.Params("key"),
		ReassignTo: c.Query("reassign_to"),
	}

	if u := middleware.GetCurrentUser(c); u != nil {
		req.ActorID = u.GetID()
		req.ActorName = u.GetName()
	}

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.DeleteSectionResponse{}
	status, err := h.service.DeleteSection(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

package audit

import (
	"backend/internal/domain/audit/dto"
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

func (h *Handler) ListEvents(c fiber.Ctx) error {
	req := &dto.ListEventsRequest{
		ResourceType: c.Query("resource_type"),
		ResourceID:   c.Query("resource_id"),
		ActorID:      c.Query("actor_id"),
		Action:       c.Query("action"),
		Since:        c.Query("since"),
		Until:        c.Query("until"),
		Page:         fiber.Query(c, "page", 1),
		Limit:        fiber.Query(c, "limit", 50),
	}

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.ListEventsResponse{}
	status, err := h.service.ListEvents(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

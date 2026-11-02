package operation

import (
	"net/http"

	"backend/internal/domain/operation/dto"
	"backend/internal/middleware"
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

func (h *Handler) ListOperations(c fiber.Ctx) error {
	resp := &dto.ListOperationsResponse{}
	status, err := h.service.ListOperations(c.Context(), resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) GetOperation(c fiber.Ctx) error {
	req := &dto.GetOperationRequest{ID: c.Params("id")}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	resp := &dto.GetOperationResponse{}
	status, err := h.service.GetOperation(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) CreateOperation(c fiber.Ctx) error {
	req := &dto.CreateOperationRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.CreatedBy = currentUserName(c)
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.CreateOperationResponse{}
	status, err := h.service.CreateOperation(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) UpdateOperation(c fiber.Ctx) error {
	req := &dto.UpdateOperationRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.ID = c.Params("id")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.UpdateOperationResponse{}
	status, err := h.service.UpdateOperation(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) DeleteOperation(c fiber.Ctx) error {
	req := &dto.DeleteOperationRequest{
		ID:        c.Params("id"),
		UpdatedBy: currentUserName(c),
		ActorID:   currentUserID(c),
	}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	status, err := h.service.DeleteOperation(c.Context(), req)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.SendStatus(status)
}

func (h *Handler) GetParticipant(c fiber.Ctx) error {
	req := &dto.GetParticipantRequest{
		OperationID:     c.Params("id"),
		OrganizationKey: c.Params("org_key"),
	}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.GetParticipantResponse{}
	status, err := h.service.GetParticipant(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

// SaveParticipant is an upsert: 201 when the organization was not yet checked
// in, 200 when an existing check-in was replaced.
func (h *Handler) SaveParticipant(c fiber.Ctx) error {
	req := &dto.SaveParticipantRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.OperationID = c.Params("id")
	req.OrganizationKey = c.Params("org_key")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.SaveParticipantResponse{}
	status, err := h.service.SaveParticipant(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) DeleteParticipant(c fiber.Ctx) error {
	req := &dto.DeleteParticipantRequest{
		OperationID:     c.Params("id"),
		OrganizationKey: c.Params("org_key"),
		UpdatedBy:       currentUserName(c),
		ActorID:         currentUserID(c),
	}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	status, err := h.service.DeleteParticipant(c.Context(), req)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.SendStatus(status)
}

// CreateParticipant checks an organization in, library or ad hoc: 201.
func (h *Handler) CreateParticipant(c fiber.Ctx) error {
	req := &dto.CreateParticipantRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.OperationID = c.Params("id")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.CreateParticipantResponse{}
	status, err := h.service.CreateParticipant(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) UpdateParticipantByID(c fiber.Ctx) error {
	req := &dto.UpdateParticipantByIDRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.OperationID = c.Params("id")
	req.ParticipantID = c.Params("pid")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.UpdateParticipantByIDResponse{}
	status, err := h.service.UpdateParticipantByID(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) DeleteParticipantByID(c fiber.Ctx) error {
	req := &dto.DeleteParticipantByIDRequest{
		OperationID:   c.Params("id"),
		ParticipantID: c.Params("pid"),
		UpdatedBy:     currentUserName(c),
		ActorID:       currentUserID(c),
	}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	status, err := h.service.DeleteParticipantByID(c.Context(), req)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.SendStatus(status)
}

// SavePhases replaces the operation's whole ordered phase list: 200.
func (h *Handler) SavePhases(c fiber.Ctx) error {
	req := &dto.SavePhasesRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.OperationID = c.Params("id")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.SavePhasesResponse{}
	status, err := h.service.SavePhases(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

// SaveSites replaces the operation's whole ordered site list: 200.
func (h *Handler) SaveSites(c fiber.Ctx) error {
	req := &dto.SaveSitesRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.OperationID = c.Params("id")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.SaveSitesResponse{}
	status, err := h.service.SaveSites(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

// SavePhasePlan replaces one phase's plan: 200 with the phase.
func (h *Handler) SavePhasePlan(c fiber.Ctx) error {
	req := &dto.SavePhasePlanRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.OperationID = c.Params("id")
	req.PhaseID = c.Params("phase_id")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.SavePhasePlanResponse{}
	status, err := h.service.SavePhasePlan(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

// ListRFIs returns the operation's RFIs with their threads: 200.
func (h *Handler) ListRFIs(c fiber.Ctx) error {
	resp := &dto.ListRFIsResponse{}
	status, err := h.service.ListRFIs(c.Context(), c.Params("id"), resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

// CreateRFI posts an RFI as one of the operation's units: 201.
func (h *Handler) CreateRFI(c fiber.Ctx) error {
	req := &dto.CreateRFIRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.OperationID = c.Params("id")
	req.CreatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.RFIResponse{}
	status, err := h.service.CreateRFI(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

// AddRFIComment replies to an open RFI: 201 with the RFI.
func (h *Handler) AddRFIComment(c fiber.Ctx) error {
	req := &dto.AddRFICommentRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.OperationID = c.Params("id")
	req.RFIID = c.Params("rfi_id")
	req.CreatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.RFIResponse{}
	status, err := h.service.AddRFIComment(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

// ResolveRFI closes an RFI, for the user who posted it only: 200 with the RFI.
func (h *Handler) ResolveRFI(c fiber.Ctx) error {
	req := &dto.ResolveRFIRequest{
		OperationID: c.Params("id"),
		RFIID:       c.Params("rfi_id"),
		ResolvedBy:  currentUserName(c),
		ActorID:     currentUserID(c),
	}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.RFIResponse{}
	status, err := h.service.ResolveRFI(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

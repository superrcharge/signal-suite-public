package user

import (
	"net/http"
	"time"

	"backend/internal/domain/user/dto"
	"backend/internal/middleware"
	"backend/internal/shared/response"
	"backend/internal/shared/validator"

	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	service     *Service
	validator   *validator.Validator
	authEnabled bool
}

func NewHandler(service *Service, validator *validator.Validator, authEnabled bool) *Handler {
	return &Handler{service: service, validator: validator, authEnabled: authEnabled}
}

func (h *Handler) GetUser(c fiber.Ctx) error {
	req := &dto.GetUserRequest{ID: c.Params("id")}

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	// Authorization: user can only view their own profile or must be admin
	if !h.canAccessUser(c, req.ID) {
		return c.Status(http.StatusForbidden).JSON(response.Err(ErrForbidden))
	}

	resp := &dto.GetUserResponse{}
	status, err := h.service.GetUser(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) ListUsers(c fiber.Ctx) error {
	req := &dto.ListUsersRequest{
		Limit:  fiber.Query(c, "limit", 20),
		Offset: fiber.Query(c, "offset", 0),
	}

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.ListUsersResponse{}
	status, err := h.service.ListUsers(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) UpdatePreferences(c fiber.Ctx) error {
	req := &dto.UpdatePreferencesRequest{ID: c.Params("id")}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	// Authorization: user can only update their own preferences or must be admin
	if !h.canAccessUser(c, req.ID) {
		return c.Status(http.StatusForbidden).JSON(response.Err(ErrForbidden))
	}

	resp := &dto.UpdatePreferencesResponse{}
	status, err := h.service.UpdatePreferences(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) UpdateRole(c fiber.Ctx) error {
	req := &dto.UpdateRoleRequest{ID: c.Params("id")}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	// Actor ID is taken from the authenticated user, never trusted from
	// the request body. This is what the self-demote guardrail compares
	// against in the service layer.
	if actor := middleware.GetCurrentUser(c); actor != nil {
		req.ActorID = actor.GetID()
	}

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.UpdateRoleResponse{}
	status, err := h.service.UpdateRole(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(status).JSON(response.Success(resp))
}

// canAccessUser checks if the current user can access another user's data.
// Access is allowed if:
// - The user is accessing their own data (by ID match)
// - The user has admin role
func (h *Handler) canAccessUser(c fiber.Ctx, targetUserID string) bool {
	currentUser, ok := middleware.GetCurrentUser(c).(*User)
	if !ok || currentUser == nil {
		return false
	}
	// Allow access to own data or if admin
	return currentUser.ID == targetUserID || currentUser.IsAdmin()
}

func (h *Handler) GetCurrentUser(c fiber.Ctx) error {
	if !h.authEnabled {
		// Auth is bypassed - return the dev admin so the UI functions fully.
		// Checked before Locals, because the middleware now attaches the same
		// identity as a middleware.AuthUser that is not a *User, so the type
		// assertion below would otherwise turn every dev request into a 500.
		// The id and name are the middleware's, so the actor a dev write
		// records is the user the UI says is signed in.
		now := time.Now().UTC()
		return c.Status(http.StatusOK).JSON(response.Success(&dto.GetUserResponse{
			User: dto.UserResponse{
				ID:          middleware.DevUserID,
				Email:       middleware.DevUserEmail,
				Name:        middleware.DevUserName,
				Roles:       []string{"admin"},
				Preferences: dto.PreferencesResponse{Theme: "dark"},
				CreatedAt:   now,
				UpdatedAt:   now,
			},
		}))
	}
	authUser := middleware.GetCurrentUser(c)
	if authUser == nil {
		return c.Status(http.StatusUnauthorized).JSON(response.Err(ErrUserNotFound))
	}

	// Type assert to get full user info
	currentUser, ok := authUser.(*User)
	if !ok {
		return c.Status(http.StatusInternalServerError).JSON(response.Err(ErrUserInternalError))
	}

	resp := &dto.GetUserResponse{
		User: toUserResponse(currentUser),
	}
	return c.Status(http.StatusOK).JSON(response.Success(resp))
}

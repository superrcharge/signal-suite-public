package user

import (
	"context"
	"net/http"
	"time"

	"backend/internal/auth"
	"backend/internal/domain/user/dto"
	"backend/internal/middleware"
	"backend/internal/shared/contracts"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

type Service struct {
	repo  Repository
	audit contracts.AuditRecorder
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// SetAudit injects the audit sink. Best-effort; audit is nil-safe.
func (s *Service) SetAudit(a contracts.AuditRecorder) {
	s.audit = a
}

func (s *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, in)
}

func (s *Service) GetUser(ctx context.Context, req *dto.GetUserRequest, resp *dto.GetUserResponse) (int, error) {
	user, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrUserInternalError
	}

	resp.User = toUserResponse(user)
	return http.StatusOK, nil
}

func (s *Service) ListUsers(ctx context.Context, req *dto.ListUsersRequest, resp *dto.ListUsersResponse) (int, error) {
	users, total, err := s.repo.FindAll(ctx, req.Limit, req.Offset)
	if err != nil {
		return http.StatusInternalServerError, ErrUserInternalError
	}

	counts, err := s.repo.CountAllByRole(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrUserInternalError
	}

	// Seed every known role at zero so a role nobody currently holds still
	// renders a cell rather than disappearing from the strip.
	roleCounts := make(map[string]int, len(ValidRoles)+len(counts))
	for _, role := range ValidRoles {
		roleCounts[role] = 0
	}
	for role, n := range counts {
		roleCounts[role] = n
	}

	resp.Users = toUserResponseList(users)
	resp.Total = total
	resp.RoleCounts = roleCounts

	return http.StatusOK, nil
}

// UpdateRole changes a target user's role. Enforces two guardrails:
// (1) an admin cannot change their own role (prevents accidental lockout
// of the acting admin), and (2) the last admin in the system cannot be
// demoted (ensures the system always has at least one admin). Both
// constraints are enforced server-side regardless of any UI gating.
func (s *Service) UpdateRole(ctx context.Context, req *dto.UpdateRoleRequest, resp *dto.UpdateRoleResponse) (int, error) {
	if req.ActorID != "" && req.ID == req.ActorID {
		return ErrCannotModifySelf.Status, ErrCannotModifySelf
	}

	target, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrUserInternalError
	}

	// If the target is currently admin and would no longer be after the
	// change, block when they are the only admin remaining.
	targetIsAdmin := target.HasRole(RoleAdmin)
	becomingAdmin := req.Role == RoleAdmin
	if targetIsAdmin && !becomingAdmin {
		adminCount, err := s.repo.CountByRole(ctx, RoleAdmin)
		if err != nil {
			return http.StatusInternalServerError, ErrUserInternalError
		}
		if adminCount <= 1 {
			return ErrLastAdmin.Status, ErrLastAdmin
		}
	}

	oldRole := ""
	if len(target.Roles) > 0 {
		oldRole = target.Roles[0]
	}

	target.Roles = []string{req.Role}
	target.UpdatedAt = time.Now()

	if err := s.repo.Update(ctx, target); err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrUserInternalError
	}

	// Role changes are a security-relevant event. Capture the old/new
	// role plus the actor so the audit log can answer "who promoted X
	// and when."
	actorName := ""
	if req.ActorID != "" {
		if actor, err := s.repo.FindByID(ctx, req.ActorID); err == nil && actor != nil {
			actorName = actor.Name
		}
	}
	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    actorName,
		ResourceType: "user",
		ResourceID:   target.ID,
		ResourceName: target.Name,
		Action:       "role_change",
		Changes: map[string]any{
			"role": map[string]any{"old": oldRole, "new": req.Role},
		},
	})

	resp.User = toUserResponse(target)
	return http.StatusOK, nil
}

func (s *Service) UpdatePreferences(ctx context.Context, req *dto.UpdatePreferencesRequest, resp *dto.UpdatePreferencesResponse) (int, error) {
	user, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrUserInternalError
	}

	user.Preferences.Theme = req.Theme
	user.UpdatedAt = time.Now()

	if err := s.repo.Update(ctx, user); err != nil {
		return http.StatusInternalServerError, ErrUserInternalError
	}

	resp.User = toUserResponse(user)
	return http.StatusOK, nil
}

// SyncFromToken creates or updates a user from a verified Entra
// identity. Implements middleware.UserSyncer.
//
// Authentication identity (oid, email, name) comes from the verified
// JWT - the IdP is the source of truth for who a user is. Authorization
// (the roles array) is locally owned: existing users keep whatever role
// the app has assigned them; new users are bootstrapped via
// first-user-wins (the very first user becomes admin; everyone else
// defaults to viewer, so self-registration grants read-only access and
// nothing more). A later admin action, not another login, changes
// someone's role.
func (s *Service) SyncFromToken(c fiber.Ctx, identity *auth.User) (middleware.AuthUser, error) {
	ctx := c.Context()
	now := time.Now()

	existing, err := s.repo.FindByOIDCSubject(ctx, identity.ID)
	if err != nil && err != ErrUserNotFound {
		return nil, err
	}

	if existing != nil {
		// Refresh identity fields only. Do not touch Roles.
		needsUpdate := existing.Email != identity.Email || existing.Name != identity.Name
		if needsUpdate {
			existing.Email = identity.Email
			existing.Name = identity.Name
			existing.UpdatedAt = now
		}
		existing.LastLoginAt = &now

		if err := s.repo.Upsert(ctx, existing); err != nil {
			return nil, err
		}
		return existing, nil
	}

	// Brand-new user: determine role via first-user-wins bootstrap.
	count, err := s.repo.Count(ctx)
	if err != nil {
		return nil, err
	}
	defaultRole := RoleViewer
	if count == 0 {
		defaultRole = RoleAdmin
	}

	subject := identity.ID
	user := &User{
		ID:          uuid.New().String(),
		OIDCSubject: &subject,
		Email:       identity.Email,
		Name:        identity.Name,
		Roles:       []string{defaultRole},
		Preferences: DefaultPreferences(),
		LastLoginAt: &now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := s.repo.Upsert(ctx, user); err != nil {
		return nil, err
	}

	return user, nil
}

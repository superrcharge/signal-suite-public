package dto

type GetUserRequest struct {
	ID string `validate:"required,uuid"`
}

type ListUsersRequest struct {
	Limit  int `validate:"min=1,max=100"`
	Offset int `validate:"min=0"`
}

type UpdatePreferencesRequest struct {
	ID    string `validate:"required,uuid"`
	Theme string `json:"theme" validate:"required,oneof=light dark"`
}

// UpdateRoleRequest changes a user's role. Admin-only. ActorID is set by
// the handler from the authenticated user's local ID and is used by the
// service to enforce the self-demote guardrail.
type UpdateRoleRequest struct {
	ID string `validate:"required,uuid"`
	// Keep the oneof list in sync with user.ValidRoles - struct tags cannot
	// reference a variable, so a test asserts the two match.
	Role    string `json:"role" validate:"required,oneof=admin editor viewer rto planner"`
	ActorID string `json:"-"`
}

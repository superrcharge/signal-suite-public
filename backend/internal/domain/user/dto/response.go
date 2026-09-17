package dto

import "time"

type UserResponse struct {
	ID          string              `json:"id"`
	Email       string              `json:"email"`
	Name        string              `json:"name"`
	Roles       []string            `json:"roles"`
	Preferences PreferencesResponse `json:"preferences"`
	LastLoginAt *time.Time          `json:"last_login_at,omitempty"`
	CreatedAt   time.Time           `json:"created_at"`
	UpdatedAt   time.Time           `json:"updated_at"`
}

type PreferencesResponse struct {
	Theme string `json:"theme"`
}

type GetUserResponse struct {
	User UserResponse `json:"user"`
}

type ListUsersResponse struct {
	Users []UserResponse `json:"users"`
	Total int            `json:"total"`
	// RoleCounts is keyed by role name and covers every user, not just the
	// requested page - the Users page stat strip cannot derive it from Users
	// because that is paginated and limit is capped at 100. Every known role
	// is present, zero included, so the strip renders stable cells.
	RoleCounts map[string]int `json:"role_counts"`
}

type UpdatePreferencesResponse struct {
	User UserResponse `json:"user"`
}

type UpdateRoleResponse struct {
	User UserResponse `json:"user"`
}

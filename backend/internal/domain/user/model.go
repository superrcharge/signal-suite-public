package user

import "time"

type User struct {
	ID          string
	OIDCSubject *string
	Email       string
	Name        string
	Roles       []string
	Preferences Preferences
	LastLoginAt *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Preferences struct {
	Theme string
}

const (
	ThemeLight = "light"
	ThemeDark  = "dark"
)

// Locally-owned authorization roles. Authentication is federated to
// Entra ID; the role assigned to each user is managed by the application
// and persisted in the users.roles column. See SyncFromToken for the
// first-user-wins bootstrap and default behavior for new logins.
//
// RoleRTO is scoped rather than global: it grants writes to the radio side
// of the catalog only - waveforms, and equipment records whose terminal_type
// is "radio". Because terminal_type is a column rather than a route
// boundary, that restriction cannot be enforced by RequireRole alone and is
// completed per-record in the equipment service. See .claude/context/authz.md.
const (
	RoleAdmin  = "admin"
	RoleEditor = "editor"
	RoleViewer = "viewer"
	RoleRTO    = "rto"
	// RolePlanner writes nets and PACE cards and reads the catalog. Like
	// RoleRTO it is scoped rather than global, and it is a role alongside rto
	// rather than a narrowing of it: rto keeps writing everything it did.
	//
	// It carries no read restriction. Reads are open to any authenticated user
	// across every domain here, which routes.go and authz_test.go both state
	// outright, and this role is not the first exception to that. What makes it
	// a planning-shaped app is the frontend showing it only the surfaces it
	// uses.
	RolePlanner = "planner"
)

// ValidRoles is the canonical ordered list of roles accepted by the
// authorization system. The `oneof` tag on dto.UpdateRoleRequest.Role must
// match it exactly; TestUpdateRoleTagMatchesValidRoles enforces that, since
// struct tags cannot be built from a variable.
var ValidRoles = []string{RoleAdmin, RoleEditor, RoleViewer, RoleRTO, RolePlanner}

func DefaultPreferences() Preferences {
	return Preferences{Theme: ThemeLight}
}

// GetID returns the user's local UUID, satisfying middleware.AuthUser
func (u *User) GetID() string { return u.ID }

// GetName returns the user's display name, satisfying middleware.AuthUser
func (u *User) GetName() string { return u.Name }

// HasRole checks if user has a specific role
func (u *User) HasRole(role string) bool {
	for _, r := range u.Roles {
		if r == role {
			return true
		}
	}
	return false
}

// IsAdmin checks if user has admin role
func (u *User) IsAdmin() bool {
	return u.HasRole(RoleAdmin)
}

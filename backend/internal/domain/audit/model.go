package audit

import "time"

// Resource types captured by the audit log. Kept as string constants
// rather than a Go enum so the values match the JSON column directly
// and query filters stay greppable.
const (
	ResourceTerminal = "terminal"
	ResourceSection  = "section"
	ResourceUser     = "user"
)

// Action verbs. role_change is distinct from update so that user-facing
// authorization changes are trivially findable in the log.
const (
	ActionCreate     = "create"
	ActionUpdate     = "update"
	ActionDelete     = "delete"
	ActionRoleChange = "role_change"
)

// Event is one row of the audit log. Actor and resource identity are
// snapshotted at write time - renaming or deleting the underlying
// records should never retroactively change a history entry.
type Event struct {
	ID           string
	ActorID      *string
	ActorName    *string
	ActorEmail   *string
	ResourceType string
	ResourceID   string
	ResourceName *string // snapshotted so deleted resources stay legible
	Action       string
	Changes      map[string]any // arbitrary JSONB; typically {field: {old, new}}
	CreatedAt    time.Time
}

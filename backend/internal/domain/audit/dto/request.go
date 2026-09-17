package dto

// ListEventsRequest carries optional filters for the audit log listing.
// All fields are optional; missing = no filter on that dimension.
type ListEventsRequest struct {
	ResourceType string // e.g. "terminal", "section", "user"
	ResourceID   string // specific resource (typically UUID or section key)
	ActorID      string // specific actor's local user ID
	Action       string // e.g. "update", "delete"
	Since        string // RFC3339 timestamp; events >= this time
	Until        string // RFC3339 timestamp; events < this time
	Page         int    `validate:"min=0"`
	Limit        int    `validate:"min=0,max=200"`
}

package dto

type CreateSectionRequest struct {
	Key   string `json:"key"   validate:"required,min=1,max=50"`
	Label string `json:"label" validate:"required,min=1,max=100"`
	Color string `json:"color" validate:"required,min=1,max=20"`
	// PaceEnabled defaults to false for a new section: a comms card is a
	// deliberate choice about who produces one, not something every section gets.
	PaceEnabled bool   `json:"pace_enabled"`
	ActorID     string `json:"-"` // set by handler from auth context, for audit
	ActorName   string `json:"-"`
}

type UpdateSectionRequest struct {
	Key   string  `validate:"required,min=1,max=50"`
	Label *string `json:"label" validate:"omitempty,min=1,max=100"`
	Color *string `json:"color" validate:"omitempty,min=1,max=20"`
	// Pointer so "leave it alone" and "turn it off" are different requests.
	PaceEnabled *bool  `json:"pace_enabled"`
	ActorID     string `json:"-"`
	ActorName   string `json:"-"`
}

// DeleteSectionRequest carries the key to delete plus an optional
// reassignment target for terminals currently in that section.
// ReassignTo values:
//   - "" (empty / unset): no reassignment; service fails with
//     ErrSectionInUse if any terminals are still in the section
//   - "__none__": clear the section on all affected terminals (NULL)
//   - any other string: move all terminals to that section key first
type DeleteSectionRequest struct {
	Key        string `validate:"required,min=1,max=50"`
	ReassignTo string
	ActorID    string `json:"-"`
	ActorName  string `json:"-"`
}

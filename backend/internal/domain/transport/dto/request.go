package dto

type CreateTransportRequest struct {
	Name        string `json:"name"        validate:"required,min=1,max=120"`
	Kind        string `json:"kind"`
	Provider    string `json:"provider"    validate:"omitempty,max=120"`
	Description string `json:"description" validate:"omitempty,max=500"`

	CreatedBy string `json:"-"`
	UpdatedBy string `json:"-"`
	// ActorID is the local user UUID, which is what the audit log keys events
	// by. Separate from CreatedBy/UpdatedBy, which carry the display name.
	ActorID string `json:"-"`
}

type UpdateTransportRequest struct {
	ID          string  `json:"-"           validate:"required"`
	Name        *string `json:"name"        validate:"omitempty,min=1,max=120"`
	Kind        *string `json:"kind"`
	Provider    *string `json:"provider"    validate:"omitempty,max=120"`
	Description *string `json:"description" validate:"omitempty,max=500"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type DeleteTransportRequest struct {
	ID string `json:"-" validate:"required"`
	// Carried so the delete event records who did it. A delete is the one
	// mutation whose row is gone afterwards, so an unattributed one is
	// unrecoverable rather than merely incomplete.
	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

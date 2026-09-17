package dto

type CreateWaveformRequest struct {
	Abbrev      string `json:"abbrev"      validate:"required,min=1,max=50"`
	Name        string `json:"name"`
	Description string `json:"description"`

	CreatedBy string `json:"-"`
	UpdatedBy string `json:"-"`
	// ActorID is the local user UUID, which is what the audit log keys events
	// by. Separate from CreatedBy/UpdatedBy, which carry the display name.
	ActorID string `json:"-"`
}

type UpdateWaveformRequest struct {
	ID          string  `json:"-"           validate:"required"`
	Abbrev      *string `json:"abbrev"      validate:"omitempty,min=1,max=50"`
	Name        *string `json:"name"`
	Description *string `json:"description"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type DeleteWaveformRequest struct {
	ID string `json:"-" validate:"required"`
	// Carried so the delete event records who did it. A delete is the one
	// mutation whose row is gone afterwards, so an unattributed one is
	// unrecoverable rather than merely incomplete.
	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

package dto

type CreateOrganizationRequest struct {
	Key        string `json:"key"         validate:"required,min=1,max=50"`
	Name       string `json:"name"        validate:"required,min=1,max=120"`
	ShortLabel string `json:"short_label" validate:"omitempty,max=20"`
	Branch     string `json:"branch"      validate:"omitempty,max=8"`
	Color      string `json:"color"       validate:"omitempty,max=20"`
	SectionKey string `json:"section_key" validate:"omitempty,max=50"`
	Notes      string `json:"notes"       validate:"omitempty,max=1000"`

	CreatedBy string `json:"-"`
	UpdatedBy string `json:"-"`
	// ActorID is the local user UUID, which is what the audit log keys events
	// by. Separate from CreatedBy/UpdatedBy, which carry the display name.
	ActorID string `json:"-"`
}

// UpdateOrganizationRequest has no key field in the body: the key is the
// identity and never changes.
type UpdateOrganizationRequest struct {
	Key        string  `json:"-"           validate:"required"`
	Name       *string `json:"name"        validate:"omitempty,min=1,max=120"`
	ShortLabel *string `json:"short_label" validate:"omitempty,max=20"`
	Branch     *string `json:"branch"      validate:"omitempty,max=8"`
	Color      *string `json:"color"       validate:"omitempty,max=20"`
	SectionKey *string `json:"section_key" validate:"omitempty,max=50"`
	Notes      *string `json:"notes"       validate:"omitempty,max=1000"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type DeleteOrganizationRequest struct {
	Key string `json:"-" validate:"required"`
	// Carried so the delete event records who did it.
	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

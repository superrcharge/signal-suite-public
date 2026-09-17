package dto

type CreatePlatformRequest struct {
	Designation     string   `json:"designation"      validate:"required,min=1,max=60"`
	PopularName     string   `json:"popular_name"     validate:"omitempty,max=120"`
	Category        string   `json:"category"`
	Kind            string   `json:"kind"`
	Operator        string   `json:"operator"         validate:"omitempty,max=120"`
	WaveformAbbrevs []string `json:"waveform_abbrevs" validate:"max=64,dive,max=40"`
	EquipmentIDs    []string `json:"equipment_ids"    validate:"max=64,dive,max=64"`
	Notes           string   `json:"notes"            validate:"omitempty,max=1000"`

	CreatedBy string `json:"-"`
	UpdatedBy string `json:"-"`
	// ActorID is the local user UUID, which is what the audit log keys events
	// by. Separate from CreatedBy/UpdatedBy, which carry the display name.
	ActorID string `json:"-"`
}

type UpdatePlatformRequest struct {
	ID              string    `json:"-"                validate:"required"`
	Designation     *string   `json:"designation"      validate:"omitempty,min=1,max=60"`
	PopularName     *string   `json:"popular_name"     validate:"omitempty,max=120"`
	Category        *string   `json:"category"`
	Kind            *string   `json:"kind"`
	Operator        *string   `json:"operator"         validate:"omitempty,max=120"`
	WaveformAbbrevs *[]string `json:"waveform_abbrevs" validate:"omitempty,max=64,dive,max=40"`
	EquipmentIDs    *[]string `json:"equipment_ids"    validate:"omitempty,max=64,dive,max=64"`
	Notes           *string   `json:"notes"            validate:"omitempty,max=1000"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type DeletePlatformRequest struct {
	ID string `json:"-" validate:"required"`
	// Carried so the delete event records who did it.
	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

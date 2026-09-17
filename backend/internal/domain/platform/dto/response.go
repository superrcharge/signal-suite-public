package dto

type PlatformResponse struct {
	ID              string   `json:"id"`
	Designation     string   `json:"designation"`
	PopularName     string   `json:"popular_name"`
	Category        string   `json:"category"`
	Kind            string   `json:"kind"`
	Operator        string   `json:"operator"`
	WaveformAbbrevs []string `json:"waveform_abbrevs"`
	EquipmentIDs    []string `json:"equipment_ids"`
	Notes           string   `json:"notes"`
	CreatedBy       string   `json:"created_by"`
	UpdatedBy       string   `json:"updated_by"`
	CreatedAt       string   `json:"created_at"`
	UpdatedAt       string   `json:"updated_at"`
}

type CreatePlatformResponse struct {
	Platform PlatformResponse `json:"platform"`
}

type UpdatePlatformResponse struct {
	Platform PlatformResponse `json:"platform"`
}

type ListPlatformsResponse struct {
	Platforms []PlatformResponse `json:"platforms"`
	Total     int                `json:"total"`
}

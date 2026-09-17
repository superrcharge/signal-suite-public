package dto

type ServiceResponse struct {
	ID          string `json:"id"`
	Abbrev      string `json:"abbrev"`
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedBy   string `json:"created_by"`
	UpdatedBy   string `json:"updated_by"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type CreateServiceResponse struct {
	Service ServiceResponse `json:"service"`
}

type UpdateServiceResponse struct {
	Service ServiceResponse `json:"service"`
}

type ListServicesResponse struct {
	Services []ServiceResponse `json:"services"`
	Total    int               `json:"total"`
}

// UsageResponse maps a normalised abbrev to the terminals offering it. Same
// shape and same rules as the waveform library's: keys lowercased and trimmed,
// and an abbrev nothing offers is ABSENT rather than present-and-empty, so a
// reader treats a missing key as zero and never as "not loaded yet".
type UsageResponse struct {
	Usage map[string][]string `json:"usage"`
	// Entries offered by at least one terminal, not the library size.
	Total int `json:"total"`
}

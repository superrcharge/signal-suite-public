package dto

type OperationResponse struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Acronym string `json:"acronym"`
	Status  string `json:"status"`
	// StartDate and EndDate are YYYY-MM-DD, or "" when not set, never null.
	StartDate        string `json:"start_date"`
	EndDate          string `json:"end_date"`
	Notes            string `json:"notes"`
	CreatedBy        string `json:"created_by"`
	UpdatedBy        string `json:"updated_by"`
	CreatedAt        string `json:"created_at"`
	UpdatedAt        string `json:"updated_at"`
	ParticipantCount int    `json:"participant_count"`
	// OpenRFICount is the number of RFIs still open on the operation.
	OpenRFICount int `json:"open_rfi_count"`
}

type OrgSummaryResponse struct {
	Key        string `json:"key"`
	Name       string `json:"name"`
	ShortLabel string `json:"short_label"`
	Branch     string `json:"branch"`
	Color      string `json:"color"`
	// Adhoc is true for an "Other" organization that exists only on this
	// participant row; its key is then "".
	Adhoc bool `json:"adhoc"`
}

type ParticipantResponse struct {
	ID              string             `json:"id"`
	OperationID     string             `json:"operation_id"`
	OrganizationKey string             `json:"organization_key"`
	Organization    OrgSummaryResponse `json:"organization"`
	EquipmentIDs    []string           `json:"equipment_ids"`
	PlatformIDs     []string           `json:"platform_ids"`
	WaveformAbbrevs []string           `json:"waveform_abbrevs"`
	ServiceAbbrevs  []string           `json:"service_abbrevs"`
	TransportIDs    []string           `json:"transport_ids"`
	POCName         string             `json:"poc_name"`
	POCPhone        string             `json:"poc_phone"`
	POCEmail        string             `json:"poc_email"`
	Notes           string             `json:"notes"`
	CreatedBy       string             `json:"created_by"`
	UpdatedBy       string             `json:"updated_by"`
	CreatedAt       string             `json:"created_at"`
	UpdatedAt       string             `json:"updated_at"`
	// AssetPhases maps each asset id the participant brought to the ids of the
	// phases it is present in, in phase order. An asset in no phase maps to [].
	// Never null.
	AssetPhases map[string][]string `json:"asset_phases"`
}

type PhaseResponse struct {
	ID          string `json:"id"`
	OperationID string `json:"operation_id"`
	Position    int    `json:"position"`
	Name        string `json:"name"`
	// SupportedParticipantID is null when the phase supports no one.
	SupportedParticipantID *string `json:"supported_participant_id"`
	// Placements maps a participant id to the site id it sits at in this phase.
	// Never null.
	Placements map[string]string `json:"placements"`
	// Requirements are the pairs that must talk, each with a < b. Never null.
	Requirements []RequirementResponse `json:"requirements"`
}

type RequirementResponse struct {
	ID string `json:"id"`
	A  string `json:"a"`
	B  string `json:"b"`
}

type SiteResponse struct {
	ID          string `json:"id"`
	OperationID string `json:"operation_id"`
	Position    int    `json:"position"`
	Name        string `json:"name"`
}

type ListOperationsResponse struct {
	Operations []OperationResponse `json:"operations"`
	Total      int                 `json:"total"`
}

type GetOperationResponse struct {
	Operation    OperationResponse     `json:"operation"`
	Participants []ParticipantResponse `json:"participants"`
	// Phases is the operation's phases in order, never null.
	Phases []PhaseResponse `json:"phases"`
	// Sites is the operation's locations in order, never null.
	Sites []SiteResponse `json:"sites"`
}

type SaveSitesResponse struct {
	Sites []SiteResponse `json:"sites"`
}

// SavePhasePlanResponse is the phase as GET /operations/:id returns it, bare.
type SavePhasePlanResponse = PhaseResponse

type SavePhasesResponse struct {
	Phases []PhaseResponse `json:"phases"`
}

type CreateOperationResponse struct {
	Operation OperationResponse `json:"operation"`
}

type UpdateOperationResponse struct {
	Operation OperationResponse `json:"operation"`
}

type GetParticipantResponse struct {
	Participant ParticipantResponse `json:"participant"`
}

type SaveParticipantResponse struct {
	Participant ParticipantResponse `json:"participant"`
}

type CreateParticipantResponse struct {
	Participant ParticipantResponse `json:"participant"`
}

type UpdateParticipantByIDResponse struct {
	Participant ParticipantResponse `json:"participant"`
}

type RFICommentResponse struct {
	ID          string `json:"id"`
	RFIID       string `json:"rfi_id"`
	Body        string `json:"body"`
	CreatedBy   string `json:"created_by"`
	CreatedByID string `json:"created_by_id"`
	CreatedAt   string `json:"created_at"`
}

type RFIResponse struct {
	ID          string `json:"id"`
	OperationID string `json:"operation_id"`
	// ParticipantID is null once the unit the RFI was raised as is removed.
	ParticipantID *string `json:"participant_id"`
	Question      string  `json:"question"`
	Status        string  `json:"status"`
	CreatedBy     string  `json:"created_by"`
	CreatedByID   string  `json:"created_by_id"`
	ResolvedBy    string  `json:"resolved_by"`
	// ResolvedAt is null while the RFI is open.
	ResolvedAt *string `json:"resolved_at"`
	CreatedAt  string  `json:"created_at"`
	UpdatedAt  string  `json:"updated_at"`
	// Comments are the replies, oldest first. Never null.
	Comments []RFICommentResponse `json:"comments"`
}

// ListRFIsResponse lists open RFIs newest first, then resolved ones, never null.
type ListRFIsResponse struct {
	RFIs []RFIResponse `json:"rfis"`
}

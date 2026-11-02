package dto

type CreateOperationRequest struct {
	Name string `json:"name" validate:"required,min=1,max=120"`
	// Acronym is optional; trimmed and upper-cased on write.
	Acronym string `json:"acronym" validate:"omitempty,max=20"`
	// Blank means planning.
	Status string `json:"status" validate:"omitempty,max=20"`
	// StartDate and EndDate are YYYY-MM-DD, or blank for not set.
	StartDate string `json:"start_date" validate:"omitempty,max=10"`
	EndDate   string `json:"end_date"   validate:"omitempty,max=10"`
	Notes     string `json:"notes"      validate:"omitempty,max=4000"`

	CreatedBy string `json:"-"`
	UpdatedBy string `json:"-"`
	// ActorID is the local user UUID, which is what the audit log keys events
	// by. Separate from CreatedBy/UpdatedBy, which carry the display name.
	ActorID string `json:"-"`
}

type UpdateOperationRequest struct {
	ID   string  `json:"-"          validate:"required"`
	Name *string `json:"name"       validate:"omitempty,min=1,max=120"`
	// A present blank acronym clears it.
	Acronym *string `json:"acronym"   validate:"omitempty,max=20"`
	Status  *string `json:"status"     validate:"omitempty,max=20"`
	// A present blank date clears it.
	StartDate *string `json:"start_date" validate:"omitempty,max=10"`
	EndDate   *string `json:"end_date"   validate:"omitempty,max=10"`
	Notes     *string `json:"notes"      validate:"omitempty,max=4000"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type DeleteOperationRequest struct {
	ID string `json:"-" validate:"required"`
	// Carried so the delete event records who did it.
	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type GetOperationRequest struct {
	ID string `json:"-" validate:"required"`
}

// SaveParticipantRequest is the body of PUT /operations/:id/participants/:org_key.
// It replaces the whole check-in: all four lists and the contact fields are
// stored as sent, which is why ExpectedUpdatedAt exists.
type SaveParticipantRequest struct {
	OperationID     string `json:"-" validate:"required"`
	OrganizationKey string `json:"-" validate:"required"`

	EquipmentIDs    []string `json:"equipment_ids"    validate:"max=64,dive,max=64"`
	PlatformIDs     []string `json:"platform_ids"     validate:"max=32,dive,max=64"`
	WaveformAbbrevs []string `json:"waveform_abbrevs" validate:"max=64,dive,max=64"`
	ServiceAbbrevs  []string `json:"service_abbrevs"  validate:"max=64,dive,max=64"`
	TransportIDs    []string `json:"transport_ids"    validate:"max=32,dive,max=80"`
	POCName         string   `json:"poc_name"         validate:"omitempty,max=120"`
	POCPhone        string   `json:"poc_phone"        validate:"omitempty,max=40"`
	POCEmail        string   `json:"poc_email"        validate:"omitempty,max=255"`
	Notes           string   `json:"notes"            validate:"omitempty,max=4000"`

	// AssetPhases maps an asset id to the ids of the phases it is present in. Nil
	// (absent or null) leaves the stored rows alone; an empty object or a map
	// replaces them. An asset in the lists but missing from a sent map is placed
	// in every phase, and an empty list for one means "brought, in no phase".
	AssetPhases map[string][]string `json:"asset_phases" validate:"max=64,dive,keys,max=64,endkeys,max=64,dive,max=64"`

	// ExpectedUpdatedAt is the updated_at the client last read, formatted as
	// the response formats it. When set and not equal to the stored value the
	// save is refused with PARTICIPANT_STALE. Omit it for a first save.
	ExpectedUpdatedAt string `json:"expected_updated_at" validate:"omitempty,max=40"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type GetParticipantRequest struct {
	OperationID     string `json:"-" validate:"required"`
	OrganizationKey string `json:"-" validate:"required"`
}

type DeleteParticipantRequest struct {
	OperationID     string `json:"-" validate:"required"`
	OrganizationKey string `json:"-" validate:"required"`
	UpdatedBy       string `json:"-"`
	ActorID         string `json:"-"`
}

// AdhocOrganization is an "Other" partner named only inside one operation. It
// is never added to the organization library.
type AdhocOrganization struct {
	Name       string `json:"name"        validate:"required,max=120"`
	ShortLabel string `json:"short_label" validate:"omitempty,max=20"`
	Branch     string `json:"branch"      validate:"omitempty,max=8"`
	Color      string `json:"color"       validate:"omitempty,max=20"`
}

// CreateParticipantRequest is the body of POST /operations/:id/participants.
// Exactly one of OrganizationKey and Adhoc names who is joining.
type CreateParticipantRequest struct {
	OperationID string `json:"-" validate:"required"`

	OrganizationKey string             `json:"organization_key" validate:"omitempty,max=50"`
	Adhoc           *AdhocOrganization `json:"adhoc"            validate:"omitempty"`

	EquipmentIDs    []string `json:"equipment_ids"    validate:"max=64,dive,max=64"`
	PlatformIDs     []string `json:"platform_ids"     validate:"max=32,dive,max=64"`
	WaveformAbbrevs []string `json:"waveform_abbrevs" validate:"max=64,dive,max=64"`
	ServiceAbbrevs  []string `json:"service_abbrevs"  validate:"max=64,dive,max=64"`
	TransportIDs    []string `json:"transport_ids"    validate:"max=32,dive,max=80"`
	POCName         string   `json:"poc_name"         validate:"omitempty,max=120"`
	POCPhone        string   `json:"poc_phone"        validate:"omitempty,max=40"`
	POCEmail        string   `json:"poc_email"        validate:"omitempty,max=255"`
	Notes           string   `json:"notes"            validate:"omitempty,max=4000"`

	// AssetPhases maps an asset id to the ids of the phases it is present in. Nil
	// (absent or null) leaves the stored rows alone; an empty object or a map
	// replaces them. An asset in the lists but missing from a sent map is placed
	// in every phase, and an empty list for one means "brought, in no phase".
	AssetPhases map[string][]string `json:"asset_phases" validate:"max=64,dive,keys,max=64,endkeys,max=64,dive,max=64"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

// UpdateParticipantByIDRequest is the body of
// PATCH /operations/:id/participants/id/:pid. Like the PUT it replaces the
// four lists and the contact fields as sent; the identity cannot change.
type UpdateParticipantByIDRequest struct {
	OperationID   string `json:"-" validate:"required"`
	ParticipantID string `json:"-" validate:"required"`

	EquipmentIDs    []string `json:"equipment_ids"    validate:"max=64,dive,max=64"`
	PlatformIDs     []string `json:"platform_ids"     validate:"max=32,dive,max=64"`
	WaveformAbbrevs []string `json:"waveform_abbrevs" validate:"max=64,dive,max=64"`
	ServiceAbbrevs  []string `json:"service_abbrevs"  validate:"max=64,dive,max=64"`
	TransportIDs    []string `json:"transport_ids"    validate:"max=32,dive,max=80"`
	POCName         string   `json:"poc_name"         validate:"omitempty,max=120"`
	POCPhone        string   `json:"poc_phone"        validate:"omitempty,max=40"`
	POCEmail        string   `json:"poc_email"        validate:"omitempty,max=255"`
	Notes           string   `json:"notes"            validate:"omitempty,max=4000"`

	// AssetPhases maps an asset id to the ids of the phases it is present in. Nil
	// (absent or null) leaves the stored rows alone; an empty object or a map
	// replaces them. An asset in the lists but missing from a sent map is placed
	// in every phase, and an empty list for one means "brought, in no phase".
	AssetPhases map[string][]string `json:"asset_phases" validate:"max=64,dive,keys,max=64,endkeys,max=64,dive,max=64"`

	ExpectedUpdatedAt string `json:"expected_updated_at" validate:"omitempty,max=40"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type DeleteParticipantByIDRequest struct {
	OperationID   string `json:"-" validate:"required"`
	ParticipantID string `json:"-" validate:"required"`
	UpdatedBy     string `json:"-"`
	ActorID       string `json:"-"`
}

// PhaseInput is one entry of a phase replace-all. A blank ID inserts a new
// phase; an ID keeps (and renames or repositions) that phase.
type PhaseInput struct {
	// ID needs no length tag: one that is not an id of this operation's is
	// refused as an unknown phase, whatever its length.
	ID string `json:"id"`
	// Name is trimmed and checked to 1..60 characters by the service; the cap
	// here only bounds an absurd body.
	Name string `json:"name" validate:"max=200"`
}

// SavePhasesRequest is the body of PUT /operations/:id/phases: the whole
// ordered phase list, positions being the array index.
type SavePhasesRequest struct {
	OperationID string       `json:"-"      validate:"required"`
	Phases      []PhaseInput `json:"phases" validate:"max=32,dive"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

// SiteInput is one entry of a site replace-all. A blank ID inserts a new site;
// an ID keeps (and renames or repositions) that site.
type SiteInput struct {
	// ID needs no length tag, for the reason PhaseInput.ID does not.
	ID string `json:"id"`
	// Name is trimmed and checked to 1..60 characters by the service; the cap
	// here only bounds an absurd body.
	Name string `json:"name" validate:"max=200"`
}

// SaveSitesRequest is the body of PUT /operations/:id/sites: the whole ordered
// site list, positions being the array index. Unlike phases, zero is allowed.
type SaveSitesRequest struct {
	OperationID string      `json:"-"     validate:"required"`
	Sites       []SiteInput `json:"sites" validate:"max=64,dive"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

// RequirementInput is one pair of participants that must talk. The service
// orders it so a < b, so either order is accepted.
type RequirementInput struct {
	A string `json:"a" validate:"max=64"`
	B string `json:"b" validate:"max=64"`
}

// SavePhasePlanRequest is the body of PUT /operations/:id/phases/:phase_id/plan.
// It replaces the phase's whole plan.
type SavePhasePlanRequest struct {
	OperationID string `json:"-" validate:"required"`
	PhaseID     string `json:"-" validate:"required"`

	// SupportedParticipantID is null or blank for none.
	SupportedParticipantID *string `json:"supported_participant_id" validate:"omitempty,max=64"`
	// Placements maps a participant id to the site id it sits at.
	Placements   map[string]string  `json:"placements"   validate:"max=256,dive,keys,max=64,endkeys,max=64"`
	Requirements []RequirementInput `json:"requirements" validate:"max=2048,dive"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

// CreateRFIRequest is the body of POST /operations/:id/rfis. The question is
// trimmed and checked to 1..2000 characters by the service.
type CreateRFIRequest struct {
	OperationID   string `json:"-"              validate:"required"`
	ParticipantID string `json:"participant_id" validate:"required,max=64"`
	Question      string `json:"question"       validate:"required,max=2000"`

	CreatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

// AddRFICommentRequest is the body of POST /operations/:id/rfis/:rfi_id/comments.
type AddRFICommentRequest struct {
	OperationID string `json:"-"    validate:"required"`
	RFIID       string `json:"-"    validate:"required"`
	Body        string `json:"body" validate:"required,max=2000"`

	CreatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

// ResolveRFIRequest is POST /operations/:id/rfis/:rfi_id/resolve, which has no
// body. ActorID is compared with the id the RFI was posted under.
type ResolveRFIRequest struct {
	OperationID string `json:"-" validate:"required"`
	RFIID       string `json:"-" validate:"required"`

	ResolvedBy string `json:"-"`
	ActorID    string `json:"-"`
}

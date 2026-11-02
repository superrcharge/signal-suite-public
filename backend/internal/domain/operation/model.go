package operation

import "time"

// ValidStatuses is the closed operation status vocabulary, in lifecycle order.
// A literal, not computed, because scripts/check-docs.mjs reads it to hold the
// glossary to the code, and migration 047's CHECK carries the same list. The
// column and the API field are kept, but the UI never shows or sets a status.
var ValidStatuses = []string{"planning", "active", "complete"}

// defaultStatus is the column default in migration 047. A blank status becomes
// this rather than an error.
const defaultStatus = "planning"

// DefaultPhaseNames are the phases a new operation starts with, in order.
// Migration 051's backfill VALUES mirror this list, so change them together.
var DefaultPhaseNames = []string{"Phase I", "Phase II", "Phase III", "Phase IV"}

// MaxPhaseNameLength is operation_phases.name's VARCHAR(60).
const MaxPhaseNameLength = 60

// MaxSiteNameLength is operation_sites.name's VARCHAR(60).
const MaxSiteNameLength = 60

// DateFormat is how a date crosses the API: YYYY-MM-DD, no time or zone, the
// same shape the contract domain uses for its dates.
const DateFormat = "2006-01-02"

// Operation is a named effort the enterprise plans together: the thing
// organizations check in to. See migration 047.
type Operation struct {
	ID   string
	Name string
	// Acronym is optional and stored upper-case; "" for none.
	Acronym string
	Status  string
	// StartDate and EndDate are nil when not set.
	StartDate *time.Time
	EndDate   *time.Time
	Notes     string
	CreatedBy string
	UpdatedBy string
	CreatedAt time.Time
	UpdatedAt time.Time
	// ParticipantCount is read with the row by the repository; it is not a
	// column.
	ParticipantCount int
	// PhaseNames is written, never read: the phases Create inserts in the same
	// transaction as the operation. Not a column, like ParticipantCount.
	PhaseNames []string
	// OpenRFICount is the number of RFIs still open, read with the row by the
	// repository; it is not a column, like ParticipantCount.
	OpenRFICount int
}

// ValidRFIStatuses is the closed RFI status vocabulary. A literal, not
// computed, because scripts/check-docs.mjs reads it to hold the glossary to
// the code, and migration 054's CHECK carries the same list.
var ValidRFIStatuses = []string{"open", "resolved"}

// MaxRFIQuestionLength and MaxRFICommentLength are counted in characters.
const (
	MaxRFIQuestionLength = 2000
	MaxRFICommentLength  = 2000
)

// RFI is a request for information one unit raises to the others on an
// operation. See migration 054.
type RFI struct {
	ID          string
	OperationID string
	// ParticipantID is the unit the RFI was raised as; nil once that unit is
	// removed from the operation.
	ParticipantID *string
	Question      string
	Status        string
	// CreatedBy is the display name; CreatedByID is the local user id, the only
	// thing resolving checks.
	CreatedBy   string
	CreatedByID string
	ResolvedBy  string
	// ResolvedAt is nil while the RFI is open.
	ResolvedAt *time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
	// Comments are the replies, oldest first. Read with the RFI by the
	// repository; not a column.
	Comments []*RFIComment
}

// RFIComment is one reply in an RFI's flat thread.
type RFIComment struct {
	ID          string
	RFIID       string
	Body        string
	CreatedBy   string
	CreatedByID string
	CreatedAt   time.Time
}

// Phase is one named, ordered stage of an operation. See migration 051.
type Phase struct {
	ID          string
	OperationID string
	// Position is the index in the operation's order, from 0.
	Position int
	Name     string
	// Plan is the phase's picture: who it supports, where each unit sits and
	// which pairs must talk. Zero for a phase nothing has planned. FindPhases
	// leaves the placements and requirements empty; Service.attachPlans fills
	// them in.
	Plan PhasePlan
}

// Site is one named place on an operation's ordered list of locations, where a
// unit can sit in a phase. See migration 052.
type Site struct {
	ID          string
	OperationID string
	// Position is the index in the operation's order, from 0.
	Position int
	Name     string
}

// Requirement says two participants must be able to talk in a phase. A and B
// are participant ids with A < B, so one pair is one requirement.
type Requirement struct {
	ID string
	A  string
	B  string
}

// PhasePlan is what an operation says about one phase beyond its name. See
// migration 052.
type PhasePlan struct {
	// SupportedParticipantID is the participant the phase supports (the UI's
	// "tier select"), "" for none.
	SupportedParticipantID string
	// Placements maps a participant id to the site id it sits at in this phase.
	// A participant absent from the map is not placed.
	Placements   map[string]string
	Requirements []Requirement
}

// AssetPhaseRow says one asset of one participant is present in one phase.
type AssetPhaseRow struct {
	ParticipantID string
	AssetID       string
	PhaseID       string
}

// OrgSummary is the slice of an organization a participant row displays,
// joined in by the participant queries so a reader never makes a second call.
type OrgSummary struct {
	Key        string
	Name       string
	ShortLabel string
	Branch     string
	Color      string
	// Adhoc marks an "Other" organization that lives on the participant row
	// (migration 048); Key is then empty.
	Adhoc bool
}

// Participant is one organization's check-in to one operation.
type Participant struct {
	ID              string
	OperationID     string
	OrganizationKey string
	Organization    OrgSummary
	// AdhocName and the three fields after it describe an "Other" organization
	// and are set only when OrganizationKey is empty. AdhocBranch is "" for none.
	AdhocName       string
	AdhocShortLabel string
	AdhocBranch     string
	AdhocColor      string
	// Equipment ids are catalog slugs, satcom and radio alike. An id naming a
	// record that was later deleted is kept, as on a platform.
	EquipmentIDs []string
	// PlatformIDs are Platform Library ids, kept when the platform is later
	// deleted, like EquipmentIDs. No foreign key (migration 049).
	PlatformIDs     []string
	WaveformAbbrevs []string
	ServiceAbbrevs  []string
	TransportIDs    []string
	POCName         string
	POCPhone        string
	POCEmail        string
	Notes           string
	CreatedBy       string
	UpdatedBy       string
	CreatedAt       time.Time
	UpdatedAt       time.Time
	// AssetPhases maps an asset id (a platform, a catalog record or a transport
	// the participant brought) to the ids of the phases it is present in, in
	// phase order. Read with the row by the repository; on a write, a non-nil
	// map replaces the stored rows in the same transaction and nil leaves them.
	AssetPhases map[string][]string
}

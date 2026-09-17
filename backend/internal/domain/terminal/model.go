package terminal

import (
	"time"

	"backend/internal/shared/assetstatus"
)

// TagEntry is a catalog entry from the tags table. The catalog is the
// canonical spelling of every tag in the system: terminals store whatever
// casing it holds, so "Op Alpha" and "op alpha" are one tag rather than two.
type TagEntry struct {
	Name      string
	CreatedAt time.Time
	// TerminalCount is how many terminals carry this tag, matched
	// case-insensitively the same way filtering and delete match it. Zero is a
	// real answer rather than a missing one: a tag pre-created in Settings for
	// an upcoming operation sits at 0 until terminals are assigned to it.
	TerminalCount int
}

// ClearedTerminal identifies a terminal whose tag a catalog delete removed.
// Carries enough to write the audit event the equivalent drawer edit would.
type ClearedTerminal struct {
	ID   string
	Name string
	Tag  string
}

type Terminal struct {
	ID         string
	Name       string
	Model      *string
	Kit        string
	Pim        string
	Serial     string
	Section    string
	Status     string
	Owner      *string
	OwnerEmail *string
	OwnerPhone *string
	// PopPin is the point of presence a Starshield (mini/hp) terminal is
	// pinned to. NULL = not pinned. Always NULL for non-Starshield models -
	// the service clears it whenever the model isn't mini/hp.
	PopPin *string
	Notes  string
	// Tag is a grouping label spanning sections (e.g. an operation or
	// exercise name). Nullable. Free-form to type, but the value stored here
	// is always the tags catalog's spelling - see Service.canonicalTag.
	Tag       *string
	UpdatedBy string
	CreatedAt time.Time
	UpdatedAt time.Time
}

const (
	ModelMini   = "mini"
	ModelHP     = "hp"
	ModelHornet = "hornet"
	ModelRagno  = "ragno"
	ModelOW7    = "ow7"
	ModelOW10   = "ow10"
	ModelOW11   = "ow11"

	// Statuses are shared with the kit domain and owned by assetstatus.
	// Aliased here so terminal code reads in its own vocabulary while
	// there is still only one definition;.
	StatusAvailable  = assetstatus.Available
	StatusAlert      = assetstatus.Alert
	StatusAlertBlue  = assetstatus.AlertBlue
	StatusAlertGreen = assetstatus.AlertGreen
	StatusOnMission  = assetstatus.OnMission
	StatusReserved   = assetstatus.Reserved
	StatusInop       = assetstatus.Inop

	PopPinUSEast    = "us-east"
	PopPinUSWest    = "us-west"
	PopPinGermany   = "germany"
	PopPinUK        = "uk"
	PopPinAustralia = "australia"
)

// ValidModels is the closed set of terminal models, in the family order the
// import template lists them: Starshield, Paradigm, OneWeb.
var ValidModels = []string{
	ModelMini,
	ModelHP,
	ModelHornet,
	ModelRagno,
	ModelOW7,
	ModelOW10,
	ModelOW11,
}

var ValidPopPins = []string{
	PopPinUSEast,
	PopPinUSWest,
	PopPinGermany,
	PopPinUK,
	PopPinAustralia,
}

// ValidStatuses is the terminal/kit shared set. Not restated here: see
// assetstatus for why one list serves both domains.
var ValidStatuses = assetstatus.Valid

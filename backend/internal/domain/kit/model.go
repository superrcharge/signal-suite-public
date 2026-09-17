package kit

import (
	"time"

	"backend/internal/shared/assetstatus"
)

// Kit is a top-level asset record, parallel to Terminal. Kits are grouped
// by Type (the sidebar filter dimension) and carry three independent
// network-classification booleans, shown as BLACK / SECRET / TS and stored
// in the columns black / secret / topsecret.
type Kit struct {
	ID     string
	Name   string
	Type   string
	Status string
	// Network classifications. Independent booleans, not a managed catalog.
	Black bool
	Secret bool
	TopSecret  bool
	// Section is the FK to sections(key). Empty string = unassigned (NULL).
	Section string
	// Owner/OwnerEmail/OwnerPhone are the "assigned to" fields. Nullable.
	Owner      *string
	OwnerEmail *string
	OwnerPhone *string
	Location   string
	Notes      string
	UpdatedBy  string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

const (
	TypeRemote = "remote"
	TypeIFK    = "ifk"
	TypeATK    = "atk"

	// Statuses are shared with the terminal domain and owned by
	// assetstatus. Aliased here so kit code reads in its own vocabulary
	// while there is still only one definition;.
	StatusAvailable  = assetstatus.Available
	StatusAlert      = assetstatus.Alert
	StatusAlertBlue  = assetstatus.AlertBlue
	StatusAlertGreen = assetstatus.AlertGreen
	StatusOnMission  = assetstatus.OnMission
	StatusReserved   = assetstatus.Reserved
	StatusInop       = assetstatus.Inop
)

var ValidTypes = []string{
	TypeRemote,
	TypeIFK,
	TypeATK,
}

// ValidStatuses is the terminal/kit shared set. Not restated here: see
// assetstatus for why one list serves both domains.
var ValidStatuses = assetstatus.Valid

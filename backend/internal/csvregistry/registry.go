// Package csvregistry is the one place that knows every domain's CSV table.
//
// It exists so the column lists can be emitted as a single generated file that
// the frontend imports directly. Before this, each domain's column list was
// retyped by hand in a .tsx dialog with a comment asking the next person to keep
// them in sync, and nothing checked that they had. Contracts drifted two columns
// and nobody found out until a user got a file with headers the picker had never
// offered.
//
// Importing the generated JSON rather than checking it means the drift cannot
// happen at all: there is one list, and the frontend reads it. Labels stay on
// the frontend, because "Assigned To" and "Kit #" are UI copy and do not belong
// in Go.
package csvregistry

import (
	"encoding/json"

	"backend/internal/domain/contract"
	"backend/internal/domain/equipment"
	"backend/internal/domain/kit"
	"backend/internal/domain/pace"
	"backend/internal/domain/platform"
	"backend/internal/domain/radionet"
	"backend/internal/domain/satcomservice"
	"backend/internal/domain/terminal"
	"backend/internal/domain/transport"
	"backend/internal/domain/waveform"
	"backend/internal/shared/csvtable"
)

// Domain is one resource's CSV column contract, in canonical output order.
type Domain struct {
	// Resource is the URL segment: "terminals", "kits", "contracts".
	Resource string `json:"resource"`
	// Columns in canonical order. Templatable false means server-owned.
	Columns []csvtable.ColumnMeta `json:"columns"`
	// Import is false for an export-only domain, which is also why it has no
	// template. The frontend uses this to decide which controls to render.
	Import bool `json:"import"`
}

// All returns every domain's columns, ordered by resource so the generated file
// is stable across runs.
func All() []Domain {
	return []Domain{
		{Resource: "contracts", Columns: contract.CSVColumns(), Import: false},
		{Resource: "equipment", Columns: equipment.CSVColumns(), Import: true},
		{Resource: "kits", Columns: kit.CSVColumns(), Import: true},
		{Resource: "nets", Columns: radionet.CSVColumns(), Import: true},
		{Resource: "pace-channels", Columns: pace.CSVColumns(), Import: false},
		{Resource: "platforms", Columns: platform.CSVColumns(), Import: true},
		{Resource: "services", Columns: satcomservice.CSVColumns(), Import: true},
		{Resource: "terminals", Columns: terminal.CSVColumns(), Import: true},
		{Resource: "transports", Columns: transport.CSVColumns(), Import: true},
		{Resource: "waveforms", Columns: waveform.CSVColumns(), Import: true},
	}
}

// JSON renders the manifest exactly as the committed file holds it: indented,
// newline-terminated, so a diff shows one line per changed column.
func JSON() ([]byte, error) {
	out, err := json.MarshalIndent(All(), "", "  ")
	if err != nil {
		return nil, err
	}
	return append(out, '\n'), nil
}

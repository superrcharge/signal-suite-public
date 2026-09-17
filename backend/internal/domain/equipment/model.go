package equipment

import (
	"encoding/json"
	"time"
)

const (
	TerminalTypeSATCOM = "satcom"
	TerminalTypeRadio  = "radio"
)

type Equipment struct {
	ID              string
	Nomenclature    string
	Nickname        *string
	OneLiner        *string
	DocNumber       *string
	PhotoURL        *string
	Make            *string
	TerminalType    string
	OperationalMode []string
	Data            json.RawMessage
	CreatedBy       string
	UpdatedBy       string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

package dto

import "encoding/json"

type CreateEquipmentRequest struct {
	ID              string          `json:"id"               validate:"required,min=1,max=100"`
	Nomenclature    string          `json:"nomenclature"     validate:"required,min=1,max=200"`
	Nickname        *string         `json:"nickname"`
	OneLiner        *string         `json:"one_liner"`
	DocNumber       *string         `json:"doc_number"`
	PhotoURL        *string         `json:"photo_url"`
	Make            *string         `json:"make"`
	TerminalType    string          `json:"terminal_type"    validate:"required,oneof=satcom radio"`
	OperationalMode []string        `json:"operational_mode"`
	Data            json.RawMessage `json:"data"`

	CreatedBy string `json:"-"`
	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
	// ActorRadioOnly is set by the handler from the caller's roles, never
	// from the body. True when the caller may write radio records only.
	ActorRadioOnly bool `json:"-"`
}

type UpdateEquipmentRequest struct {
	Nomenclature    *string         `json:"nomenclature"  validate:"omitempty,min=1,max=200"`
	Nickname        *string         `json:"nickname"`
	OneLiner        *string         `json:"one_liner"`
	DocNumber       *string         `json:"doc_number"`
	PhotoURL        *string         `json:"photo_url"`
	Make            *string         `json:"make"`
	TerminalType    *string         `json:"terminal_type" validate:"omitempty,oneof=satcom radio"`
	OperationalMode []string        `json:"operational_mode"`
	Data            json.RawMessage `json:"data"`

	ID        string `json:"-" validate:"required"`
	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
	// ActorRadioOnly is set by the handler from the caller's roles, never
	// from the body. True when the caller may write radio records only.
	ActorRadioOnly bool `json:"-"`
}

type GetEquipmentRequest struct {
	ID string `json:"-" validate:"required"`
}

type DeleteEquipmentRequest struct {
	ID        string `json:"-" validate:"required"`
	ActorID   string `json:"-"`
	ActorName string `json:"-"`
	// ActorRadioOnly is set by the handler from the caller's roles, never
	// from the body. True when the caller may write radio records only.
	ActorRadioOnly bool `json:"-"`
}

type ListEquipmentRequest struct {
	TerminalType string `json:"-"` // "satcom" | "radio" | "" (all)
	Search       string `json:"-"`
}

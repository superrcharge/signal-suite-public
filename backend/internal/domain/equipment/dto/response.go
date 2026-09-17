package dto

import "encoding/json"

type EquipmentResponse struct {
	ID              string          `json:"id"`
	Nomenclature    string          `json:"nomenclature"`
	Nickname        *string         `json:"nickname,omitempty"`
	OneLiner        *string         `json:"one_liner,omitempty"`
	DocNumber       *string         `json:"doc_number,omitempty"`
	PhotoURL        *string         `json:"photo_url,omitempty"`
	Make            *string         `json:"make,omitempty"`
	TerminalType    string          `json:"terminal_type"`
	OperationalMode []string        `json:"operational_mode"`
	Data            json.RawMessage `json:"data"`
	CreatedBy       string          `json:"created_by"`
	UpdatedBy       string          `json:"updated_by"`
	CreatedAt       string          `json:"created_at"`
	UpdatedAt       string          `json:"updated_at"`
}

type CreateEquipmentResponse struct {
	Equipment EquipmentResponse `json:"equipment"`
}

type GetEquipmentResponse struct {
	Equipment EquipmentResponse `json:"equipment"`
}

type UpdateEquipmentResponse struct {
	Equipment EquipmentResponse `json:"equipment"`
}

type ListEquipmentResponse struct {
	Equipment []EquipmentResponse `json:"equipment"`
	Total     int                 `json:"total"`
}

package dto

import "time"

type TerminalResponse struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Model      *string   `json:"model,omitempty"`
	Kit        string    `json:"kit"`
	Pim        string    `json:"pim"`
	Serial     string    `json:"serial"`
	Section    string    `json:"section"`
	Status     string    `json:"status"`
	Owner      *string   `json:"owner,omitempty"`
	OwnerEmail *string   `json:"owner_email,omitempty"`
	OwnerPhone *string   `json:"owner_phone,omitempty"`
	PopPin     *string   `json:"pop_pin,omitempty"`
	Notes      string    `json:"notes"`
	Tag        *string   `json:"tag,omitempty"`
	UpdatedBy  string    `json:"updated_by"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type CreateTerminalResponse struct {
	Terminal TerminalResponse `json:"terminal"`
}

type GetTerminalResponse struct {
	Terminal TerminalResponse `json:"terminal"`
}

type ListTerminalsResponse struct {
	Terminals    []TerminalResponse `json:"terminals"`
	Total        int                `json:"total"`
	Page         int                `json:"page"`
	TotalPages   int                `json:"total_pages"`
	StatusCounts map[string]int     `json:"status_counts"`
}

type UpdateTerminalResponse struct {
	Terminal TerminalResponse `json:"terminal"`
}

type ImportRowError struct {
	Row    int      `json:"row"`
	Name   string   `json:"name"`
	Errors []string `json:"errors"`
}

type ImportTerminalsResponse struct {
	Imported int              `json:"imported"`
	Errors   []ImportRowError `json:"errors"`
	Message  string           `json:"message"`
}

// TagCatalogEntryResponse is one row of the tags catalog on the wire. It has a
// single definition because the list and create endpoints have to agree on it -
// they previously built an anonymous struct and a bare map respectively, which
// is how they came to disagree about which fields exist.
type TagCatalogEntryResponse struct {
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
	// TerminalCount is how many terminals carry this tag. Never omitempty:
	// an unused tag must report 0 rather than drop the field, or the Settings
	// list cannot tell "no terminals" from "count not supplied".
	TerminalCount int `json:"terminal_count"`
}

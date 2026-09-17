package dto

import "time"

type KitResponse struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Type       string    `json:"type"`
	Status     string    `json:"status"`
	Black      bool      `json:"black"`
	Secret      bool      `json:"secret"`
	TopSecret       bool      `json:"topsecret"`
	Section    string    `json:"section"`
	Owner      *string   `json:"owner,omitempty"`
	OwnerEmail *string   `json:"owner_email,omitempty"`
	OwnerPhone *string   `json:"owner_phone,omitempty"`
	Location   string    `json:"location"`
	Notes      string    `json:"notes"`
	UpdatedBy  string    `json:"updated_by"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type CreateKitResponse struct {
	Kit KitResponse `json:"kit"`
}

type GetKitResponse struct {
	Kit KitResponse `json:"kit"`
}

type ListKitsResponse struct {
	Kits         []KitResponse  `json:"kits"`
	Total        int            `json:"total"`
	Page         int            `json:"page"`
	TotalPages   int            `json:"total_pages"`
	StatusCounts map[string]int `json:"status_counts"`
}

type UpdateKitResponse struct {
	Kit KitResponse `json:"kit"`
}

type ImportRowError struct {
	Row    int      `json:"row"`
	Name   string   `json:"name"`
	Errors []string `json:"errors"`
}

type ImportKitsResponse struct {
	Imported int              `json:"imported"`
	Errors   []ImportRowError `json:"errors"`
	Message  string           `json:"message"`
}

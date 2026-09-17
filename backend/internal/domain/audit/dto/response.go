package dto

import "time"

type EventResponse struct {
	ID           string         `json:"id"`
	ActorID      *string        `json:"actor_id,omitempty"`
	ActorName    *string        `json:"actor_name,omitempty"`
	ActorEmail   *string        `json:"actor_email,omitempty"`
	ResourceType string         `json:"resource_type"`
	ResourceID   string         `json:"resource_id"`
	ResourceName *string        `json:"resource_name,omitempty"`
	Action       string         `json:"action"`
	Changes      map[string]any `json:"changes,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
}

type ListEventsResponse struct {
	Events     []EventResponse `json:"events"`
	Total      int             `json:"total"`
	Page       int             `json:"page"`
	TotalPages int             `json:"total_pages"`
}

package dto

type TransportResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Provider    string `json:"provider"`
	Description string `json:"description"`
	CreatedBy   string `json:"created_by"`
	UpdatedBy   string `json:"updated_by"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type CreateTransportResponse struct {
	Transport TransportResponse `json:"transport"`
}

type UpdateTransportResponse struct {
	Transport TransportResponse `json:"transport"`
}

type ListTransportsResponse struct {
	Transports []TransportResponse `json:"transports"`
	Total      int                 `json:"total"`
}

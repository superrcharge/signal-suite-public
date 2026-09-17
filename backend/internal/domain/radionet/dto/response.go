package dto

type NetResponse struct {
	ID          string `json:"id"`
	Section     string `json:"section"`
	Name        string `json:"name"`
	NetID       string `json:"net_id"`
	RadioType   string `json:"radio_type"`
	TxFreq      string `json:"tx_freq"`
	RxFreq      string `json:"rx_freq"`
	FreqUnit    string `json:"freq_unit"`
	ROIP        bool   `json:"roip"`
	Description string `json:"description"`
	Notes       string `json:"notes"`
	CreatedBy   string `json:"created_by"`
	UpdatedBy   string `json:"updated_by"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type CreateNetResponse struct {
	Net NetResponse `json:"net"`
}

type UpdateNetResponse struct {
	Net NetResponse `json:"net"`
}

type ListNetsResponse struct {
	Nets  []NetResponse `json:"nets"`
	Total int           `json:"total"`
}

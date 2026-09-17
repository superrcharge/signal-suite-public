package dto

type CreateNetRequest struct {
	// Owning squadron. Comes from the route, not the body.
	Section     string `json:"-"               validate:"required"`
	Name        string `json:"name"            validate:"required,min=1,max=100"`
	NetID       string `json:"net_id"          validate:"omitempty,max=50"`
	RadioType   string `json:"radio_type"      validate:"omitempty,max=10"`
	TxFreq      string `json:"tx_freq"         validate:"omitempty,max=60"`
	RxFreq      string `json:"rx_freq"         validate:"omitempty,max=60"`
	FreqUnit    string `json:"freq_unit"       validate:"omitempty,max=4"`
	ROIP        bool   `json:"roip"`
	Description string `json:"description"     validate:"omitempty,max=250"`
	Notes       string `json:"notes"           validate:"omitempty,max=250"`

	CreatedBy string `json:"-"`
	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type UpdateNetRequest struct {
	ID          string  `json:"-"               validate:"required,uuid"`
	Name        *string `json:"name"            validate:"omitempty,min=1,max=100"`
	NetID       *string `json:"net_id"          validate:"omitempty,max=50"`
	RadioType   *string `json:"radio_type"      validate:"omitempty,max=10"`
	TxFreq      *string `json:"tx_freq"         validate:"omitempty,max=60"`
	RxFreq      *string `json:"rx_freq"         validate:"omitempty,max=60"`
	FreqUnit    *string `json:"freq_unit"       validate:"omitempty,max=4"`
	ROIP        *bool   `json:"roip"`
	Description *string `json:"description"     validate:"omitempty,max=250"`
	Notes       *string `json:"notes"           validate:"omitempty,max=250"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type DeleteNetRequest struct {
	ID string `json:"-" validate:"required,uuid"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type ListNetsRequest struct {
	Section string `json:"-" validate:"required"`
}

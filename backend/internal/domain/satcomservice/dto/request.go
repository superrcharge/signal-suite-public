package dto

type CreateServiceRequest struct {
	Abbrev       string `json:"abbrev"        validate:"required,min=1,max=50"`
	Name         string `json:"name"          validate:"omitempty,max=100"`
	Description  string `json:"description"   validate:"omitempty,max=250"`
	OwnedBy      string `json:"owned_by"      validate:"omitempty,max=120"`
	OwnerCountry string `json:"owner_country" validate:"omitempty,max=60"`

	CreatedBy string `json:"-"`
	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type UpdateServiceRequest struct {
	ID           string  `json:"-"             validate:"required,uuid"`
	Abbrev       *string `json:"abbrev"        validate:"omitempty,min=1,max=50"`
	Name         *string `json:"name"          validate:"omitempty,max=100"`
	Description  *string `json:"description"   validate:"omitempty,max=250"`
	OwnedBy      *string `json:"owned_by"      validate:"omitempty,max=120"`
	OwnerCountry *string `json:"owner_country" validate:"omitempty,max=60"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type DeleteServiceRequest struct {
	ID string `json:"-" validate:"required,uuid"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

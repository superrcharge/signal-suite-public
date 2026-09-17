package dto

type CreateTerminalRequest struct {
	Name       string  `json:"name"        validate:"required,min=1,max=100"`
	Model      *string `json:"model"       validate:"omitempty,oneof=mini hp hornet ragno ow7 ow10 ow11"`
	Kit        string  `json:"kit"`
	Pim        string  `json:"pim"`
	Serial     string  `json:"serial"`
	Section    string  `json:"section"`
	Status     string  `json:"status"      validate:"omitempty,oneof=available alert alert-blue alert-green on-mission reserved inop"`
	Owner      *string `json:"owner"`
	OwnerEmail *string `json:"owner_email"`
	OwnerPhone *string `json:"owner_phone"`
	PopPin     *string `json:"pop_pin"     validate:"omitempty,pop_pin"`
	Notes      string  `json:"notes"       validate:"omitempty,max=250"`
	Tag        *string `json:"tag"         validate:"omitempty,max=100"`
	UpdatedBy  string  `json:"-"` // set by handler from auth context (display name)
	ActorID    string  `json:"-"` // set by handler from auth context (local user UUID, for audit)
}

type GetTerminalRequest struct {
	ID string `validate:"required,uuid"`
}

type ListTerminalsRequest struct {
	Sections []string
	Models   []string
	Search   string
	Tag      string
	Page     int
	Limit    int
}

type UpdateTerminalRequest struct {
	ID         string  `validate:"required,uuid"`
	Name       *string `json:"name"        validate:"omitempty,min=1,max=100"`
	Model      *string `json:"model"       validate:"omitempty,oneof=mini hp hornet ragno ow7 ow10 ow11"`
	Kit        *string `json:"kit"`
	Pim        *string `json:"pim"`
	Serial     *string `json:"serial"`
	Section    *string `json:"section"`
	Status     *string `json:"status"      validate:"omitempty,oneof=available alert alert-blue alert-green on-mission reserved inop"`
	Owner      *string `json:"owner"`
	OwnerEmail *string `json:"owner_email"`
	OwnerPhone *string `json:"owner_phone"`
	PopPin     *string `json:"pop_pin"     validate:"omitempty,pop_pin"`
	Notes      *string `json:"notes"       validate:"omitempty,max=250"`
	Tag        *string `json:"tag"         validate:"omitempty,max=100"`
	UpdatedBy  string  `json:"-"`
	ActorID    string  `json:"-"`
}

type DeleteTerminalRequest struct {
	ID        string `validate:"required,uuid"`
	ActorID   string `json:"-"`
	ActorName string `json:"-"`
}

type ImportTerminalsRequest struct {
	CSV       string `json:"csv" validate:"required"`
	UpdatedBy string `json:"-"` // set by handler from auth context (display name)
	ActorID   string `json:"-"` // set by handler from auth context (local user UUID, for audit)
}

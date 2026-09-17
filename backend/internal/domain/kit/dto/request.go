package dto

type CreateKitRequest struct {
	Name       string  `json:"name"        validate:"required,min=1,max=100"`
	Type       string  `json:"type"        validate:"required,oneof=remote ifk atk"`
	Status     string  `json:"status"      validate:"omitempty,oneof=available alert alert-blue alert-green on-mission reserved inop"`
	Black      bool    `json:"black"`
	Secret      bool    `json:"secret"`
	TopSecret       bool    `json:"topsecret"`
	Section    string  `json:"section"`
	Owner      *string `json:"owner"`
	OwnerEmail *string `json:"owner_email"`
	OwnerPhone *string `json:"owner_phone"`
	Location   string  `json:"location"    validate:"omitempty,max=200"`
	Notes      string  `json:"notes"       validate:"omitempty,max=250"`
	UpdatedBy  string  `json:"-"` // set by handler from auth context (display name)
	ActorID    string  `json:"-"` // set by handler from auth context (local user UUID, for audit)
}

type GetKitRequest struct {
	ID string `validate:"required,uuid"`
}

type ListKitsRequest struct {
	Types    []string
	Sections []string
	Search   string
	Page     int
	Limit    int
}

type UpdateKitRequest struct {
	ID         string  `validate:"required,uuid"`
	Name       *string `json:"name"        validate:"omitempty,min=1,max=100"`
	Type       *string `json:"type"        validate:"omitempty,oneof=remote ifk atk"`
	Status     *string `json:"status"      validate:"omitempty,oneof=available alert alert-blue alert-green on-mission reserved inop"`
	Black      *bool   `json:"black"`
	Secret      *bool   `json:"secret"`
	TopSecret       *bool   `json:"topsecret"`
	Section    *string `json:"section"`
	Owner      *string `json:"owner"`
	OwnerEmail *string `json:"owner_email"`
	OwnerPhone *string `json:"owner_phone"`
	Location   *string `json:"location"    validate:"omitempty,max=200"`
	Notes      *string `json:"notes"       validate:"omitempty,max=250"`
	UpdatedBy  string  `json:"-"`
	ActorID    string  `json:"-"`
}

type DeleteKitRequest struct {
	ID        string `validate:"required,uuid"`
	ActorID   string `json:"-"`
	ActorName string `json:"-"`
}

type ImportKitsRequest struct {
	CSV       string `json:"csv" validate:"required"`
	UpdatedBy string `json:"-"` // set by handler from auth context (display name)
	ActorID   string `json:"-"` // set by handler from auth context (local user UUID, for audit)
}

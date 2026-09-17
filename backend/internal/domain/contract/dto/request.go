package dto

type CreateContractRequest struct {
	Title            string  `json:"title"            validate:"required,min=1,max=200"`
	Company          string  `json:"company"          validate:"required,min=1,max=200"`
	POCName          *string `json:"poc_name"`
	POCEmail         *string `json:"poc_email"`
	POCPhone         *string `json:"poc_phone"`
	POPStart         *string `json:"pop_start"`         // "2006-01-02" or omitted
	POPEnd           *string `json:"pop_end"`           // "2006-01-02" or omitted
	ExecutionQuarter *string `json:"execution_quarter"` // Q1|Q2|Q3|Q4 or omitted
	FiscalYear       string  `json:"fiscal_year"          validate:"required,min=1,max=4"`
	Notes            string  `json:"notes"                validate:"omitempty,max=250"`
	LogformNumber    *string `json:"logform_number"       validate:"omitempty,max=20"`
	LogformURL       *string `json:"logform_url"          validate:"omitempty,max=2000"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type UpdateContractRequest struct {
	Title            *string `json:"title"            validate:"omitempty,min=1,max=200"`
	Company          *string `json:"company"          validate:"omitempty,min=1,max=200"`
	POCName          *string `json:"poc_name"`
	POCEmail         *string `json:"poc_email"`
	POCPhone         *string `json:"poc_phone"`
	POPStart         *string `json:"pop_start"`
	POPEnd           *string `json:"pop_end"`
	ExecutionQuarter *string `json:"execution_quarter"`
	FiscalYear       *string `json:"fiscal_year"          validate:"omitempty,min=1,max=4"`
	Notes            *string `json:"notes"                validate:"omitempty,max=250"`
	LogformNumber    *string `json:"logform_number"       validate:"omitempty,max=20"`
	LogformURL       *string `json:"logform_url"          validate:"omitempty,max=2000"`

	ID        string `json:"-" validate:"required,uuid"`
	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

type GetContractRequest struct {
	ID string `json:"-" validate:"required,uuid"`
}

type DeleteContractRequest struct {
	ID        string `json:"-" validate:"required,uuid"`
	ActorID   string `json:"-"`
	ActorName string `json:"-"`
}

type ListContractsRequest struct {
	FiscalYear string `json:"-"`
	Search     string `json:"-"`
	Page       int    `json:"-"`
	Limit      int    `json:"-"`
	SortBy     string `json:"-"` // "pop_end" | "execution_quarter" | "" (default)
	SortDir    string `json:"-"` // "asc" | "desc"
}

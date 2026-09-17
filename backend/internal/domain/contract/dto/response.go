package dto

type ContractResponse struct {
	ID               string  `json:"id"`
	Title            string  `json:"title"`
	Company          string  `json:"company"`
	POCName          *string `json:"poc_name,omitempty"`
	POCEmail         *string `json:"poc_email,omitempty"`
	POCPhone         *string `json:"poc_phone,omitempty"`
	POPStart         *string `json:"pop_start,omitempty"` // "2006-01-02"
	POPEnd           *string `json:"pop_end,omitempty"`   // "2006-01-02"
	ExecutionQuarter *string `json:"execution_quarter,omitempty"`
	FiscalYear       string  `json:"fiscal_year"`
	Notes            string  `json:"notes"`
	LogformNumber    *string `json:"logform_number,omitempty"`
	LogformURL       *string `json:"logform_url,omitempty"`
	UpdatedBy        string  `json:"updated_by"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
}

type ContractCountsResponse struct {
	Total      int `json:"total"`
	Expiring30 int `json:"expiring_30"`
	Expiring60 int `json:"expiring_60"`
	Expiring90 int `json:"expiring_90"`
}

type CreateContractResponse struct {
	Contract ContractResponse `json:"contract"`
}

type GetContractResponse struct {
	Contract ContractResponse `json:"contract"`
}

type ListContractsResponse struct {
	Contracts  []ContractResponse     `json:"contracts"`
	Total      int                    `json:"total"`
	Page       int                    `json:"page"`
	TotalPages int                    `json:"total_pages"`
	Counts     ContractCountsResponse `json:"counts"`
}

type UpdateContractResponse struct {
	Contract ContractResponse `json:"contract"`
}

type ListFiscalYearsResponse struct {
	FiscalYears []string `json:"fiscal_years"`
}

package contract

import "time"

type Contract struct {
	ID               string
	Title            string
	Company          string
	POCName          *string
	POCEmail         *string
	POCPhone         *string
	POPStart         *time.Time
	POPEnd           *time.Time
	ExecutionQuarter *string // Q1|Q2|Q3|Q4
	FiscalYear       string  // e.g. FY26
	Notes            string
	LogformNumber    *string
	LogformURL       *string
	UpdatedBy        string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// ContractCounts holds aggregate deadline counts computed at query time.
type ContractCounts struct {
	Total      int `json:"total"`
	Expiring30 int `json:"expiring_30"` // pop_end <= today+30
	Expiring60 int `json:"expiring_60"` // pop_end in 31–60 days
	Expiring90 int `json:"expiring_90"` // pop_end in 61–90 days
}

const (
	QuarterQ1 = "Q1"
	QuarterQ2 = "Q2"
	QuarterQ3 = "Q3"
	QuarterQ4 = "Q4"
)

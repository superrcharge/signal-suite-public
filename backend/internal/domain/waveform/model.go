package waveform

import "time"

type Waveform struct {
	ID          string
	Abbrev      string
	Name        string
	Description string
	CreatedBy   string
	UpdatedBy   string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

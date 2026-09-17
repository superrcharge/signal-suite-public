package satcomservice

import "time"

// SatcomService is a library entry, not the service layer below it. The package
// is satcomservice rather than service for the same reason radionet is not net:
// service.Service reads as nothing at all, and the entity would collide with the
// layer type. The stutter here is the lesser evil.
type SatcomService struct {
	ID          string
	Abbrev      string
	Name        string
	Description string
	CreatedBy   string
	UpdatedBy   string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

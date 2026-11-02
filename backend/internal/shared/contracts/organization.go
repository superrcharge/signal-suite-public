package contracts

import "context"

// OrganizationInfo is the slice of an organization another domain needs.
type OrganizationInfo struct {
	Key, Name, ShortLabel, Branch, Color string
}

// OrganizationLookup lets a domain confirm that organization keys name real rows. Implemented by organization.Service.
//
// Keyed by organization key; a key absent from the map names no organization.
type OrganizationLookup interface {
	OrganizationsByKeys(ctx context.Context, keys []string) (map[string]OrganizationInfo, error)
}

// OrganizationUsage is the mirror: which operations reference an organization, so the library can refuse a delete that would orphan a check-in. Implemented by operation.Service.
//
// Together the two close both directions of the reference, the same way
// NetLookup and NetUsage do for nets and wheels.
type OrganizationUsage interface {
	// OperationsUsingOrganization returns the names of the operations the
	// organization is checked in to.
	OperationsUsingOrganization(ctx context.Context, key string) ([]string, error)
}

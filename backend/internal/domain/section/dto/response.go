package dto

type SectionResponse struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Color string `json:"color"`
	// PaceEnabled gates the squadron's comms card and its Nets library. Always
	// present rather than omitempty: the frontend treats absence as false, and a
	// false that is missing from the payload is indistinguishable from a field
	// the backend forgot.
	PaceEnabled bool `json:"pace_enabled"`
}

type CreateSectionResponse struct {
	Section SectionResponse `json:"section"`
}

type ListSectionsResponse struct {
	Sections []SectionResponse `json:"sections"`
}

type UpdateSectionResponse struct {
	Section SectionResponse `json:"section"`
}

// DeleteSectionResponse returns details of what happened alongside the
// delete. Reassigned is the number of terminals moved; To is the
// destination section key (empty string means they were cleared to NULL).
type DeleteSectionResponse struct {
	Reassigned int    `json:"reassigned"`
	To         string `json:"to,omitempty"`
}

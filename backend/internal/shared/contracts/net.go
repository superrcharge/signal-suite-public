package contracts

import "context"

// NetInfo is the slice of a net the PACE domain needs in order to validate a
// channel assignment.
type NetInfo struct {
	// Owning squadron. Nets are a per-squadron library, so a channel may only
	// use a net belonging to its own squadron.
	Section string
	// jem | mpu5 | both.
	RadioType string
	// conus | oconus | both. A card belongs to one theater; a net may serve
	// either or both.
	Theater string
}

// TheaterCarries reports whether a net declared for netTheater may sit on a
// card of cardTheater. "both" matches either.
//
// One home for the rule, because both domains apply it: the PACE domain refuses
// a save that breaks it, and the nets domain is where the value is declared.
// The radio rule (CarriedBy) predates this package and is restated per domain;
// two readings of one rule drift apart, which is the failure #236 closed, so
// this one is not.
func TheaterCarries(netTheater, cardTheater string) bool {
	return netTheater == "both" || netTheater == cardTheater
}

// NetLookup lets the PACE domain validate a channel assignment without
// importing the nets domain.
//
// Keyed by net id; an id absent from the map is a net that does not exist.
// Three facts are needed: the net must be real, it must belong to the squadron
// whose card is being saved, and it must be carried by the radio whose wheel it
// is being put on.
type NetLookup interface {
	NetsByIDs(ctx context.Context, ids []string) (map[string]NetInfo, error)
}

// NetUsage answers "is this net on any wheel, and which?" so the nets library
// can refuse a delete that would strip a net off a live comms card.
//
// The mirror of NetLookup: together they close both directions of the
// reference, so neither a net nor the channel using it can be removed out from
// under the other.
type NetUsage interface {
	CountAssignmentsForNet(ctx context.Context, netID string) (int, error)
	PlansUsingNet(ctx context.Context, netID string) ([]string, error)
}

package contracts

import "context"

type SectionLister interface {
	GetSectionKeys(ctx context.Context) ([]string, error)
}

// NetSectionCounter and PaceSectionChecker are what a section delete asks
// before it touches anything.
//
// Terminals and kits have contracts that count AND move, because a delete
// reassigns them. Nets and a squadron's PACE card are the other kind: they are
// that squadron's own planning, so moving them would merge two squadrons' data
// and clearing them would destroy it. These only report, and anything they
// report refuses the delete.
//
// Two interfaces rather than one, because the answers differ in kind. A net
// count is something a user can go and find - "3 nets". PACE data spans five
// tables, and a row count across them means nothing to a reader, so it is a
// yes or no.
type NetSectionCounter interface {
	CountNetsInSection(ctx context.Context, section string) (int, error)
}

type PaceSectionChecker interface {
	SectionHasPaceData(ctx context.Context, section string) (bool, error)
}

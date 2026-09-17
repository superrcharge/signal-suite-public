package contracts

import "context"

// KitSectionReassigner lets the section domain check whether kits are
// still referencing a section, and bulk-move them to a different section
// (or to NULL) as part of a safe section delete. Implemented by the kit
// service; consumed by the section service. Parallel to
// TerminalSectionReassigner - section deletes must reassign both.
type KitSectionReassigner interface {
	CountKitsInSection(ctx context.Context, section string) (int, error)
	ReassignKitsToSection(ctx context.Context, from, to string) (int, error)
}

package contracts

import "context"

// TerminalSectionReassigner lets the section domain check whether
// terminals are still referencing a section, and bulk-move them to a
// different section (or to NULL) as part of a safe section delete.
// Implemented by the terminal service; consumed by the section service.
type TerminalSectionReassigner interface {
	CountTerminalsInSection(ctx context.Context, section string) (int, error)
	ReassignTerminalsToSection(ctx context.Context, from, to string) (int, error)
}

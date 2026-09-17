package contracts

import "context"

// AuditEventInput is the shape passed to AuditRecorder.Record.
// Defined here (not in the audit package) so that the terminal, user,
// and section domains can depend on the contract without importing the
// audit package itself.
type AuditEventInput struct {
	ActorID      string
	ActorName    string
	ActorEmail   string
	ResourceType string
	ResourceID   string
	ResourceName string
	Action       string
	Changes      map[string]any
}

// AuditRecorder is the sink used by mutation-producing domains
// (terminal, section, user) to emit audit events. Implementations
// must be safe to call even on hot paths - Record is best-effort
// and never returns an error, so callers don't branch on its result.
type AuditRecorder interface {
	Record(ctx context.Context, in AuditEventInput)
}

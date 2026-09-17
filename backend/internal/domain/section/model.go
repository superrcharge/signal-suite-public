package section

type Section struct {
	Key   string
	Label string
	Color string
	// PaceEnabled is whether this squadron runs a JEM/MPU5 comms card. It gates
	// both the PACE card and the per-squadron Nets library, which is why one
	// column delivers both. Was a hardcoded list of five in the frontend until
	// HQ made it change.
	PaceEnabled bool
}

package contracts

import "context"

// WaveformAssets answers "which assets carry this waveform, and follow it when
// it is renamed" so the waveform library can refuse a delete that would strand
// an abbrev, and keep the carriers in step with a rename.
//
// Implemented twice - by the equipment service and the platform service - and
// consumed by the waveform service, the same shape as the two section
// reassigners. Neither provider needs anything back from waveforms, so unlike
// NetLookup/NetUsage this is a one-way pair rather than a mutual one.
//
// # Why one map rather than a per-abbrev lookup
//
// Usage is returned for the whole library in one call, and the delete guard
// indexes into that map rather than asking a narrower question. Two methods
// answering one question is how two readings of one rule drift apart, which is
// the failure an earlier fix closed on the CSV registry. The cost is bounded by the
// catalog's size - tens of library rows against tens of equipment records and
// platforms - so the whole map is cheaper than the round trip that would save
// it. Revisit if the catalog ever grows by an order of magnitude.
type WaveformAssets interface {
	// WaveformUsage maps a normalised abbrev to the display labels of the assets
	// carrying it. Keys are lowercased and trimmed, matching the frontend
	// matrix's norm() and the waveforms_abbrev_lower_idx the library is unique
	// under. An abbrev nothing carries is absent rather than present-and-empty.
	WaveformUsage(ctx context.Context) (map[string][]string, error)

	// RenameWaveform rewrites every carried copy of `from` to `to`, matching
	// case-insensitively, and reports how many assets changed.
	//
	// Assets store the abbrev as text rather than as a foreign key, so a rename
	// has to be carried to them explicitly or it orphans them. Callers must run
	// this BEFORE renaming the library row: a failure then leaves every asset
	// pointing at a name that still exists, which is the recoverable direction.
	RenameWaveform(ctx context.Context, from, to string) (int, error)
}

// WaveformLookup is the mirror of WaveformAssets: it lets an asset domain
// reject an abbrev the library does not declare, without importing the waveform
// domain. Implemented by the waveform service, consumed by the platform service.
//
// Together the two close both directions of the reference, the same way
// NetLookup and NetUsage do for nets and wheels: neither a waveform nor the
// asset naming it can be removed or renamed out from under the other.
type WaveformLookup interface {
	// KnownWaveformAbbrevs is the set of abbrevs the library declares,
	// normalised the same way as WaveformUsage's keys.
	KnownWaveformAbbrevs(ctx context.Context) (map[string]struct{}, error)
}

// ServiceAssets is the waveform pair's SATCOM-side counterpart, and it is
// deliberately smaller.
//
// One method, not three: a service has no rename cascade and no delete guard -
// TestDeleteServiceIsNotGuarded pins that on purpose - so the only question
// anything asks of the asset side is which terminals offer each service.
//
// And ONE implementer, where WaveformAssets has two. Platforms carry waveforms
// and radios; they carry no services at all, so equipment is the whole of the
// SATCOM-side reference. That asymmetry is the domain's, not an omission here.
type ServiceAssets interface {
	// Asset labels by normalised abbrev, same shape and same normalisation as
	// WaveformUsage: lowercased, trimmed, and absent rather than
	// present-and-empty when nothing carries it.
	ServiceUsage(ctx context.Context) (map[string][]string, error)
}

// Package pace owns a squadron's comms card: the JEM and MPU5 channel plans and
// the net assigned to each wheel position.
//
// Channel plans and their assignments are always read and saved together -- the
// card is the unit of work, not the individual channel -- so they live in one
// domain rather than being split.
package pace

import "time"

// The radios a channel plan can describe. A net may declare itself carried by
// "both", but a plan is always for one specific radio.
const (
	RadioJEM  = "jem"
	RadioMPU5 = "mpu5"
)

// The two frequency tables on the sheet's middle band. A row belongs to exactly
// one of them, which is what the block CHECK constraint enforces.
const (
	BlockLTAC   = "ltac"
	BlockTACSAT = "tacsat"
)

// ValidRadios is the closed set, in the order the card renders them.
var ValidRadios = []string{RadioJEM, RadioMPU5}

func IsValidRadio(r string) bool {
	for _, v := range ValidRadios {
		if v == r {
			return true
		}
	}
	return false
}

// DefaultChannelCount is the position count a new plan starts with.
const DefaultChannelCount = 16

// The fields of each row that can be marked as changed.
//
// A mark is presentation only: it prints that value red, so the person a
// revised card is handed to can see what moved since the version they last had.
// Nothing compares versions -- the squadron sets and clears marks by hand.
//
// Each row carries its own marks rather than the card holding one list of
// positional keys, because the band tables are a delete-and-reinsert with a
// server-assigned position: "LTAC row 2" would mark the wrong row the moment one
// above it was deleted. The order here is the order a row's marks are stored in.
var (
	HeaderHighlights  = []string{"title", "date", "version"}
	PlanHighlights    = []string{"label"}
	ChannelHighlights = []string{"net", "tx", "rx"}
	FreqRowHighlights = []string{"name", "channel", "up", "down", "sat", "crypto"}
	TmnHighlights  = []string{"label", "value"}
	TierHighlights    = []string{"name", "service", "detail"}
)

// ChannelPlan is one wheel.
type ChannelPlan struct {
	ID           string
	Section      string
	RadioType    string
	Label        string
	ChannelCount int
	Notes        string
	UpdatedBy    string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	// Marked fields, from PlanHighlights.
	Highlights []string

	Assignments []*ChannelAssignment
}

// ChannelAssignment is one net on one position.
//
// The override fields are the exception, not the rule: a net carries its own
// frequency, and moving it between channels is meant to carry that frequency
// along. An override covers the case where this squadron runs the same net on a
// different frequency.
type ChannelAssignment struct {
	PlanID           string
	ChannelNumber    int
	NetID            string
	TxFreqOverride   string
	RxFreqOverride   string
	FreqUnitOverride string
	LabelOverride    string
	// Marked fields, from ChannelHighlights. A mark can sit on a frequency the
	// channel inherits from its net, not only on an override: what changed on
	// the sheet is the printed value, wherever it came from.
	Highlights []string

	// Populated on read by joining nets. The pace domain cannot import
	// radionet, so this is a local read model rather than a shared type.
	Net *NetRef
}

// NetRef is the slice of a net the card needs in order to render.
type NetRef struct {
	ID        string
	Name      string
	NetID     string
	RadioType string
	TxFreq    string
	RxFreq    string
	FreqUnit  string

	// Carried over IP rather than RF alone. Read only to drive the ICE
	// designator on the card; nothing here writes it - radionet owns the flag.
	ROIP bool
}

// EffectiveTx returns the frequency this channel actually runs on: the override
// when one is set, otherwise the net's own.
func (a *ChannelAssignment) EffectiveTx() string {
	if a.TxFreqOverride != "" {
		return a.TxFreqOverride
	}
	if a.Net != nil {
		return a.Net.TxFreq
	}
	return ""
}

func (a *ChannelAssignment) EffectiveRx() string {
	if a.RxFreqOverride != "" {
		return a.RxFreqOverride
	}
	if a.Net != nil {
		return a.Net.RxFreq
	}
	return ""
}

func (a *ChannelAssignment) EffectiveUnit() string {
	if a.FreqUnitOverride != "" {
		return a.FreqUnitOverride
	}
	if a.Net != nil {
		return a.Net.FreqUnit
	}
	return ""
}

// IsOverridden reports whether this channel departs from the net's own values,
// so the editor can show that the difference is deliberate.
func (a *ChannelAssignment) IsOverridden() bool {
	return a.TxFreqOverride != "" || a.RxFreqOverride != "" || a.FreqUnitOverride != ""
}

// CardHeader is what the sheet prints above the wheels.
//
// EffectiveDate is nullable and that nullability is the flag: nil means the
// sheet shows no date. A separate boolean could contradict it.
type CardHeader struct {
	ID            string
	Section       string
	Title         string
	EffectiveDate *time.Time
	// EmblemURL is the squadron's emblem, drawn in both wheel hubs. Empty means
	// no emblem, and the sheet falls back to a generated placeholder.
	EmblemURL string
	// Version is a free-text label ("v2") printed after the date. Empty means
	// none, the same convention as EmblemURL.
	Version string
	// Marked fields, from HeaderHighlights.
	Highlights []string
	UpdatedBy  string
}

// FreqRow is one line of the LTAC or TACSAT table. Every field is free-form
// text the squadron types: these are printed values, not references to a net.
//
// Position is the row's zero-based place in its block, assigned by the server
// from list order rather than sent by the client.
type FreqRow struct {
	Position int
	Name     string
	// Free-form, like every other field here: a channel is as often "1-16" or
	// "A" as it is a single number. Printed by the TACSAT table only.
	Channel string
	Up      string
	Down    string
	Sat     string
	Crypto  string
	// Marked fields, from FreqRowHighlights.
	Highlights []string
}

// TmnRow is one line of the TACTICAL MISSION NETWORK box: a label and its value.
type TmnRow struct {
	Position int
	Label    string
	Value    string
	// Marked fields, from TmnHighlights.
	Highlights []string
}

// The four PACE tiles, in the order the sheet prints them.
var TierLetters = []string{"P", "A", "C", "E"}

// What a tier points at. A tier is a terminal from the catalog, an entry from
// the Transport Library, a line of free text, or nothing yet.
const (
	TierSourceEquipment = "equipment"
	TierSourceTransport = "transport"
	TierSourceCustom    = "custom"
	TierSourceNone      = "none"
)

var ValidTierSources = []string{
	TierSourceEquipment, TierSourceTransport, TierSourceCustom, TierSourceNone,
}

func IsValidTierLetter(l string) bool {
	for _, v := range TierLetters {
		if v == l {
			return true
		}
	}
	return false
}

func IsValidTierSource(s string) bool {
	for _, v := range ValidTierSources {
		if v == s {
			return true
		}
	}
	return false
}

// Tier is one PACE tile.
//
// Both ID fields are held rather than one polymorphic reference, because the
// two point at different tables and a single column would need a discriminator
// to be read at all. Whichever does not match Source is cleared on write, so a
// tier that changed source never carries a stale reference.
type Tier struct {
	Letter        string
	Source        string
	EquipmentID   string
	TransportID   string
	ServiceAbbrev string
	CustomLabel   string
	Detail        string
	// Marked fields, from TierHighlights. "name" is the tile's title, whichever
	// source that title came from.
	Highlights []string

	// Populated on read by joining equipment and transports. The pace domain
	// cannot import either, so these are local read-model fields rather than
	// shared types, the same way NetRef works for channels.
	EquipmentNomenclature string
	// The catalog nickname, which is what the tile titles itself with. Empty
	// for a record that has none, which is why the client falls back to the
	// nomenclature rather than printing a blank title.
	EquipmentNickname string
	EquipmentPhotoURL string
	TransportName     string
	ServiceCIR        string
	ServiceMIR        string
}

// CommsCard is one squadron's whole card: the header, both wheels, and the
// sheet's middle band, read and saved together.
//
// The band rows hang off the card the same way Plans does, because the card is
// the unit of work in this domain -- one read, one save.
type CommsCard struct {
	Section    string
	Header     *CardHeader
	Plans      []*ChannelPlan
	LTACRows   []*FreqRow
	TACSATRows []*FreqRow
	TmnRows []*TmnRow
	Tiers      []*Tier
}

// PlanFor returns the plan for a radio, or nil when the squadron has none yet.
func (c *CommsCard) PlanFor(radio string) *ChannelPlan {
	for _, p := range c.Plans {
		if p.RadioType == radio {
			return p
		}
	}
	return nil
}

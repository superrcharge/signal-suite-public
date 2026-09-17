package dto

// NetSummary is the slice of a net the card needs to render a channel.
type NetSummary struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	NetID     string `json:"net_id"`
	RadioType string `json:"radio_type"`

	// The card renders an ICE designator beside a ROIP net's name. It was
	// absent from this projection while the radionet DTOs carried it, so the
	// Nets Library could show the flag and a printed comms card could not.
	ROIP bool `json:"roip"`
}

// ChannelResponse carries the frequency already resolved -- override applied
// where set, the net's own otherwise -- so no consumer has to re-implement that
// precedence.
type ChannelResponse struct {
	ChannelNumber int        `json:"channel_number"`
	Net           NetSummary `json:"net"`
	TxFreq        string     `json:"tx_freq"`
	RxFreq        string     `json:"rx_freq"`
	FreqUnit      string     `json:"freq_unit"`
	LabelOverride string     `json:"label_override"`
	IsOverridden  bool       `json:"is_overridden"`
	// Every highlights list in this payload is always an array, never null,
	// naming the fields of its own row that print as changed.
	Highlights []string `json:"highlights"`
}

type PlanResponse struct {
	ID           string            `json:"id"`
	RadioType    string            `json:"radio_type"`
	Label        string            `json:"label"`
	ChannelCount int               `json:"channel_count"`
	Notes        string            `json:"notes"`
	UpdatedBy    string            `json:"updated_by"`
	UpdatedAt    string            `json:"updated_at"`
	Highlights   []string          `json:"highlights"`
	Channels     []ChannelResponse `json:"channels"`
}

// CardResponse is a squadron's whole card in one payload, so the sheet, the
// editor and the print route each make exactly one request.
type CardResponse struct {
	Section string `json:"section"`
	Title   string `json:"title"`
	// Empty when unset -- the sheet shows no date subtext.
	EffectiveDate string `json:"effective_date"`
	// Empty when the squadron has uploaded no emblem, which is the sheet's
	// signal to draw its generated placeholder instead.
	EmblemURL string `json:"emblem_url"`
	// Printed after the date. Empty prints nothing.
	Version    string         `json:"version"`
	Highlights []string       `json:"highlights"`
	Plans      []PlanResponse `json:"plans"`

	// Always an array, never null: a null would force every consumer to guard,
	// and the sheet renders nothing either way, so the difference would go
	// unnoticed right up until it did not.
	LTACRows   []FreqRowResponse   `json:"ltac_rows"`
	TACSATRows []FreqRowResponse   `json:"tacsat_rows"`
	TmnRows []TmnRowResponse `json:"tmn_rows"`

	// Always exactly four, in P A C E order, even for a squadron that has saved
	// none. Padding on read is what keeps the response shape constant so no
	// consumer has to handle a partially configured card.
	Tiers []TierResponse `json:"tiers"`
}

type GetCardResponse struct {
	Card CardResponse `json:"card"`
}

type SaveCardResponse struct {
	Card CardResponse `json:"card"`
}

// FreqRowResponse is one printed line of the LTAC or TACSAT table. up and down
// are the sheet's column headings; the columns behind them are up_freq and
// down_freq.
type FreqRowResponse struct {
	Name       string   `json:"name"`
	Channel    string   `json:"channel"`
	Up         string   `json:"up"`
	Down       string   `json:"down"`
	Sat        string   `json:"sat"`
	Crypto     string   `json:"crypto"`
	Highlights []string `json:"highlights"`
}

// TmnRowResponse is one line of the TACTICAL MISSION NETWORK box.
type TmnRowResponse struct {
	Label      string   `json:"label"`
	Value      string   `json:"value"`
	Highlights []string `json:"highlights"`
}

// TierResponse is one PACE tile, with its references already resolved.
//
// The equipment nomenclature, photo and service rates are joined in by the
// repository so the sheet renders from one payload. Resolving them on the
// client would cost the print route a second round trip, and the print route
// fires window.print() as soon as it has what it needs.
type TierResponse struct {
	Tier          string   `json:"tier"`
	Source        string   `json:"source"`
	EquipmentID   string   `json:"equipment_id"`
	TransportID   string   `json:"transport_id"`
	ServiceAbbrev string   `json:"service_abbrev"`
	CustomLabel   string   `json:"custom_label"`
	Detail        string   `json:"detail"`
	Highlights    []string `json:"highlights"`

	EquipmentNomenclature string `json:"equipment_nomenclature"`
	// The catalog nickname ("Falcon"), which is what the tile titles itself
	// with. Empty for a record that has none, and the client falls back to the
	// nomenclature rather than printing a blank title.
	EquipmentNickname string `json:"equipment_nickname"`
	EquipmentPhotoURL string `json:"equipment_photo_url"`
	TransportName     string `json:"transport_name"`
	// Empty when the tier has no equipment, or no service matching
	// service_abbrev on that equipment record. Always empty for a radio, whose
	// capability is a waveform and carries no committed rates.
	ServiceCIR string `json:"service_cir"`
	ServiceMIR string `json:"service_mir"`
}

package dto

// SaveCardRequest is the whole comms card in one payload.
//
// The editor is one page with one Save, so the write surface is a whole-card
// replace rather than granular per-channel endpoints. A radio omitted from
// Plans is left untouched; a radio present with an empty Channels list clears
// that wheel.
type SaveCardRequest struct {
	Section string `json:"-"      validate:"required"`
	Title   string `json:"title"  validate:"omitempty,max=200"`
	// RFC3339 date (YYYY-MM-DD). Empty clears it, which is how the editor's
	// "Include date" checkbox turns the subtext off.
	EffectiveDate string `json:"effective_date" validate:"omitempty,len=10"`
	// Free text printed after the date ("v2"). Empty prints nothing.
	Version string `json:"version" validate:"omitempty,max=20"`
	// The header's changed-marks. Every highlights list in this payload names
	// fields of its own row; the allowed names are in pace/model.go, and an
	// unknown one is a coded 400 naming the row. The cap is loose on purpose --
	// a repeat is de-duplicated on write, not refused.
	Highlights []string `json:"highlights" validate:"omitempty,max=16,dive,max=20"`
	// max is the number of radios a card has (pace.ValidRadios), which is the
	// most a payload can legitimately carry -- a repeat is refused as a duplicate
	// radio. The cap is here rather than only in the service because one save is
	// one transaction: a payload of a hundred thousand plans would hold the write
	// lock long enough to stall every other squadron's save.
	Plans []SavePlanInput `json:"plans" validate:"required,max=2,dive"`

	// The sheet's middle band. The caps are the number of lines the band has
	// room for on a fixed 816px page: past them the PACE tiles are pushed off
	// the paper, so an over-long list is a 400 rather than a silent truncation.
	LTACRows   []SaveFreqRowInput   `json:"ltac_rows"   validate:"omitempty,max=8,dive"`
	TACSATRows []SaveFreqRowInput   `json:"tacsat_rows" validate:"omitempty,max=8,dive"`
	TmnRows []SaveTmnRowInput `json:"tmn_rows" validate:"omitempty,max=6,dive"`

	// The four PACE tiles. Absent entirely means "unchanged", which is what lets
	// an older client keep saving channel edits without wiping tiers it never
	// knew about. Present means replace all four, so the cap is the tier count.
	Tiers []SaveTierInput `json:"tiers" validate:"omitempty,max=4,dive"`

	UpdatedBy string `json:"-"`
	ActorID   string `json:"-"`
}

// SaveTierInput is one PACE tile. Which reference field matters is decided by
// Source; the others are cleared on write rather than trusted.
type SaveTierInput struct {
	Tier          string   `json:"tier"           validate:"required,len=1"`
	Source        string   `json:"source"         validate:"required,max=12"`
	EquipmentID   string   `json:"equipment_id"   validate:"omitempty,max=80"`
	TransportID   string   `json:"transport_id"   validate:"omitempty,max=80"`
	ServiceAbbrev string   `json:"service_abbrev" validate:"omitempty,max=40"`
	CustomLabel   string   `json:"custom_label"   validate:"omitempty,max=120"`
	Detail        string   `json:"detail"         validate:"omitempty,max=200"`
	Highlights    []string `json:"highlights"   validate:"omitempty,max=16,dive,max=20"`
}

// SaveFreqRowInput is one line of the LTAC or TACSAT table. Which block it
// belongs to is the array it arrives in, and its position is that array's
// order, so neither is a field the client sends.
//
// The JSON names are up and down while the columns are up_freq and down_freq:
// up and down are what the sheet prints above them.
type SaveFreqRowInput struct {
	Name       string   `json:"name"    validate:"omitempty,max=80"`
	Channel    string   `json:"channel" validate:"omitempty,max=40"`
	Up         string   `json:"up"     validate:"omitempty,max=80"`
	Down       string   `json:"down"   validate:"omitempty,max=80"`
	Sat        string   `json:"sat"    validate:"omitempty,max=80"`
	Crypto     string   `json:"crypto" validate:"omitempty,max=80"`
	Highlights []string `json:"highlights" validate:"omitempty,max=16,dive,max=20"`
}

// SaveTmnRowInput is one line of the TACTICAL MISSION NETWORK box.
type SaveTmnRowInput struct {
	Label      string   `json:"label"      validate:"omitempty,max=80"`
	Value      string   `json:"value"      validate:"omitempty,max=160"`
	Highlights []string `json:"highlights" validate:"omitempty,max=16,dive,max=20"`
}

type SavePlanInput struct {
	RadioType    string             `json:"radio_type"    validate:"required,max=20"`
	Label        string             `json:"label"         validate:"omitempty,max=60"`
	ChannelCount int                `json:"channel_count" validate:"omitempty,min=1,max=64"`
	Notes        string             `json:"notes"         validate:"omitempty,max=250"`
	Highlights   []string           `json:"highlights"    validate:"omitempty,max=16,dive,max=20"`
	Channels     []SaveChannelInput `json:"channels"      validate:"dive"`
}

type SaveChannelInput struct {
	ChannelNumber int `json:"channel_number"     validate:"required,min=1"`
	// The net's UUID primary key, not its human-facing net_id label. Validated
	// as a uuid like every other id across these domains, so a malformed value
	// is a 400 here rather than a confusing 404 from the net lookup.
	NetID            string   `json:"net_id"             validate:"required,uuid"`
	TxFreqOverride   string   `json:"tx_freq_override"   validate:"omitempty,max=60"`
	RxFreqOverride   string   `json:"rx_freq_override"   validate:"omitempty,max=60"`
	FreqUnitOverride string   `json:"freq_unit_override" validate:"omitempty,max=4"`
	LabelOverride    string   `json:"label_override"     validate:"omitempty,max=60"`
	Highlights       []string `json:"highlights"       validate:"omitempty,max=16,dive,max=20"`
}

type GetCardRequest struct {
	Section string `json:"-" validate:"required"`
}

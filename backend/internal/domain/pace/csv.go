package pace

import (
	"context"
	"strconv"

	"backend/internal/shared/csvtable"
)

// channelRow is one wheel position, flattened.
//
// A csvtable.Table is declared over a row type, not a model, and this is the
// case that makes the distinction worth having. A comms card is a composite -
// two channel plans, their assignments, the LTAC and TACSAT frequency tables,
// the TACTICAL MISSION NETWORK rows, the four PACE tiers and a header - and none of that
// fits one CSV shape. Rather than bend the aggregate to look like a table, the
// export builds a purpose-made flat row and the card stays as it is.
//
// What this file therefore does NOT carry: the freq tables, the tmn rows, the
// tiers, and the header. The resource is named pace-channels rather than pace so
// that omission is visible in the URL instead of implied by it. Those are
// separate resources if they are ever wanted, not a reshaping of this one.
type channelRow struct {
	Section       string
	RadioType     string
	PlanLabel     string
	ChannelNumber int

	NetName    string
	NetID      string
	NetRadio   string
	TxFreq     string
	RxFreq     string
	FreqUnit   string
	Overridden bool
	Label      string
}

// csvTable is export-only. New is nil, so Parse refuses by construction: a
// channel row is meaningless without a plan and a net that already exist, and a
// CSV would bypass every cross-domain check the editor performs. That is a
// structural guarantee rather than a convention someone has to remember.
var csvTable = csvtable.Table[channelRow]{
	Domain:     "PACE",
	Noun:       "channel",
	NounPlural: "channels",
	FilePrefix: "signal-suite-pace-channels",
	LabelKey:   "net_name",

	Columns: []csvtable.Column[channelRow]{
		{
			Key: "section", Label: "Squadron",
			Get: csvtable.Str(func(r *channelRow) string { return r.Section }),
		},
		{
			Key: "radio_type", Label: "Radio",
			Get: csvtable.Str(func(r *channelRow) string { return r.RadioType }),
		},
		{
			Key: "plan_label", Label: "Wheel",
			Get: csvtable.Str(func(r *channelRow) string { return r.PlanLabel }),
		},
		{
			Key: "channel_number", Label: "Channel",
			Get: func(r *channelRow) string { return strconv.Itoa(r.ChannelNumber) },
		},
		{
			Key: "net_name", Label: "Net Name",
			Get: csvtable.Str(func(r *channelRow) string { return r.NetName }),
		},
		{
			// Kept off the printed dial deliberately, which makes a column the only
			// place it is exposed. See the accessible-table note in domains/pace.md.
			Key: "net_id", Label: "Channel #",
			Get: csvtable.Str(func(r *channelRow) string { return r.NetID }),
		},
		{
			Key: "net_radio_type", Label: "Net Carried By",
			Get: csvtable.Str(func(r *channelRow) string { return r.NetRadio }),
		},
		{
			// Effective values: the override when one is set, otherwise the net's
			// own. A reader of this file wants what the channel actually runs on.
			Key: "tx_freq", Label: "TX",
			Get: csvtable.Str(func(r *channelRow) string { return r.TxFreq }),
		},
		{
			Key: "rx_freq", Label: "RX",
			Get: csvtable.Str(func(r *channelRow) string { return r.RxFreq }),
		},
		{
			Key: "freq_unit", Label: "Unit",
			Get: csvtable.Str(func(r *channelRow) string { return r.FreqUnit }),
		},
		{
			// Says whether the frequencies above depart from the net's own, so the
			// difference reads as deliberate rather than as stale data.
			Key: "is_overridden", Label: "Overridden",
			Get: csvtable.Bool(func(r *channelRow) bool { return r.Overridden }),
		},
		{
			Key: "label_override", Label: "Label Override",
			Get: csvtable.Str(func(r *channelRow) string { return r.Label }),
		},
	},
}

// CSVColumns is the wire shape of this domain's columns, for the generated
// frontend manifest.
func CSVColumns() []csvtable.ColumnMeta { return csvTable.Meta() }

// ExportableColumns is the full ordered column set, derived from csvTable.
var ExportableColumns = csvTable.Keys()

func boundCSV() (*csvtable.Bound[channelRow], error) { return csvTable.Bind(nil) }

// flattenCard turns a card into one row per assigned wheel position.
//
// Unassigned positions are skipped. A wheel is mostly empty on a typical card,
// and a file padded with blank rows for positions nobody planned is harder to
// read than one that lists what is actually assigned.
func flattenCard(card *CommsCard) []*channelRow {
	if card == nil {
		return nil
	}
	var rows []*channelRow
	for _, plan := range card.Plans {
		for _, a := range plan.Assignments {
			if a.NetID == "" {
				continue
			}
			row := &channelRow{
				Section:       plan.Section,
				RadioType:     plan.RadioType,
				PlanLabel:     plan.Label,
				ChannelNumber: a.ChannelNumber,
				TxFreq:        a.EffectiveTx(),
				RxFreq:        a.EffectiveRx(),
				FreqUnit:      a.EffectiveUnit(),
				Overridden:    a.IsOverridden(),
				Label:         a.LabelOverride,
			}
			if a.Net != nil {
				row.NetName = a.Net.Name
				row.NetID = a.Net.NetID
				row.NetRadio = a.Net.RadioType
			}
			rows = append(rows, row)
		}
	}
	return rows
}

// ExportChannels returns one squadron's assigned wheel positions as CSV.
//
// Section is required rather than optional: a card belongs to a squadron, and
// there is no all-squadrons card to export.
func (s *Service) ExportChannels(ctx context.Context, section string, columns []string) (string, error) {
	bound, err := boundCSV()
	if err != nil {
		return "", ErrPaceInternalError
	}
	exists, err := s.repo.SectionExists(ctx, section)
	if err != nil {
		return "", ErrPaceInternalError
	}
	if !exists {
		return "", ErrSectionNotFound
	}
	card, err := s.repo.FindCard(ctx, section)
	if err != nil {
		return "", ErrPaceInternalError
	}
	return bound.Export(flattenCard(card), columns)
}

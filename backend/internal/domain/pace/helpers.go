package pace

import (
	"strings"
	"time"

	"backend/internal/domain/pace/dto"
)

// badHighlight returns the first key in `in` that `allowed` does not name, or
// "" when every key is one. The check and the mapping are separate so the
// service can refuse with a message naming the row before anything is built.
func badHighlight(allowed, in []string) string {
	for _, k := range in {
		k = strings.TrimSpace(k)
		ok := false
		for _, a := range allowed {
			if a == k {
				ok = true
				break
			}
		}
		if !ok {
			return k
		}
	}
	return ""
}

// keepHighlights returns the marks in allowed's order, each once.
//
// Never nil: every highlights column is NOT NULL, and pgx writes a nil slice
// as NULL, so a row with no marks has to be an empty array on the way in.
func keepHighlights(allowed, in []string) []string {
	want := map[string]bool{}
	for _, k := range in {
		want[strings.TrimSpace(k)] = true
	}
	out := make([]string, 0, len(want))
	for _, a := range allowed {
		if want[a] {
			out = append(out, a)
		}
	}
	return out
}

// orEmpty is the read-side half of the same rule: a row built without marks
// serialises as [] rather than null, so no consumer has to guard.
func orEmpty(in []string) []string {
	if in == nil {
		return []string{}
	}
	return in
}

func toChannelResponse(a *ChannelAssignment) dto.ChannelResponse {
	net := dto.NetSummary{ID: a.NetID}
	if a.Net != nil {
		net = dto.NetSummary{
			ID:        a.Net.ID,
			Name:      a.Net.Name,
			NetID:     a.Net.NetID,
			RadioType: a.Net.RadioType,
			ROIP:      a.Net.ROIP,
		}
	}
	return dto.ChannelResponse{
		ChannelNumber: a.ChannelNumber,
		Net:           net,
		// Resolved here rather than by each consumer, so the sheet, the editor
		// and the print route cannot disagree about override precedence.
		TxFreq:        a.EffectiveTx(),
		RxFreq:        a.EffectiveRx(),
		FreqUnit:      a.EffectiveUnit(),
		LabelOverride: a.LabelOverride,
		IsOverridden:  a.IsOverridden(),
		Highlights:    orEmpty(a.Highlights),
	}
}

func toPlanResponse(p *ChannelPlan) dto.PlanResponse {
	channels := make([]dto.ChannelResponse, 0, len(p.Assignments))
	for _, a := range p.Assignments {
		channels = append(channels, toChannelResponse(a))
	}
	updatedAt := ""
	if !p.UpdatedAt.IsZero() {
		updatedAt = p.UpdatedAt.Format(time.RFC3339)
	}
	return dto.PlanResponse{
		ID:           p.ID,
		RadioType:    p.RadioType,
		Label:        p.Label,
		ChannelCount: p.ChannelCount,
		Notes:        p.Notes,
		UpdatedBy:    p.UpdatedBy,
		UpdatedAt:    updatedAt,
		Highlights:   orEmpty(p.Highlights),
		Channels:     channels,
	}
}

// toCardResponse always emits both radios, in ValidRadios order, scaffolding an
// empty plan for one the squadron has not configured. A card with no rows is a
// wheel with sixteen empty channels, not a missing wheel, so the UI never has
// to special-case "not set up yet".
func toCardResponse(card *CommsCard) dto.CardResponse {
	out := dto.CardResponse{
		Section:    card.Section,
		Highlights: []string{},
		Plans:      make([]dto.PlanResponse, 0, len(ValidRadios)),
	}
	if h := card.Header; h != nil {
		out.Title = h.Title
		out.EmblemURL = h.EmblemURL
		out.Version = h.Version
		out.Highlights = orEmpty(h.Highlights)
		if h.EffectiveDate != nil {
			// Date only. The column is a DATE; sending a timestamp would imply
			// a precision the field does not have.
			out.EffectiveDate = h.EffectiveDate.Format("2006-01-02")
		}
	}
	out.LTACRows = freqRowResponses(card.LTACRows)
	out.TACSATRows = freqRowResponses(card.TACSATRows)
	out.TmnRows = tmnRowResponses(card.TmnRows)
	out.Tiers = tierResponses(card.Tiers)
	for _, radio := range ValidRadios {
		if p := card.PlanFor(radio); p != nil {
			out.Plans = append(out.Plans, toPlanResponse(p))
			continue
		}
		out.Plans = append(out.Plans, dto.PlanResponse{
			RadioType:    radio,
			ChannelCount: DefaultChannelCount,
			Highlights:   []string{},
			Channels:     []dto.ChannelResponse{},
		})
	}
	return out
}

// The band mappings, both directions. Position is not carried either way: on
// the way in the server assigns it from list order, and on the way out the rows
// are already ordered by it.
//
// The response slices are always allocated, never nil, so a card with no rows
// serialises as [] rather than null and no consumer has to guard.
func freqRowResponses(rows []*FreqRow) []dto.FreqRowResponse {
	out := make([]dto.FreqRowResponse, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.FreqRowResponse{
			Name:       r.Name,
			Channel:    r.Channel,
			Up:         r.Up,
			Down:       r.Down,
			Sat:        r.Sat,
			Crypto:     r.Crypto,
			Highlights: orEmpty(r.Highlights),
		})
	}
	return out
}

func tmnRowResponses(rows []*TmnRow) []dto.TmnRowResponse {
	out := make([]dto.TmnRowResponse, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.TmnRowResponse{Label: r.Label, Value: r.Value, Highlights: orEmpty(r.Highlights)})
	}
	return out
}

func freqRowsFrom(in []dto.SaveFreqRowInput) []*FreqRow {
	out := make([]*FreqRow, 0, len(in))
	for i, r := range in {
		out = append(out, &FreqRow{
			Position:   i,
			Name:       strings.TrimSpace(r.Name),
			Channel:    strings.TrimSpace(r.Channel),
			Up:         strings.TrimSpace(r.Up),
			Down:       strings.TrimSpace(r.Down),
			Sat:        strings.TrimSpace(r.Sat),
			Crypto:     strings.TrimSpace(r.Crypto),
			Highlights: keepHighlights(FreqRowHighlights, r.Highlights),
		})
	}
	return out
}

// tierResponses maps the four tiles out. The repository pads to all four
// letters on read, so this does not pad again; a short slice here would mean
// the load skipped its padding, and hiding that would make the bug invisible.
func tierResponses(tiers []*Tier) []dto.TierResponse {
	out := make([]dto.TierResponse, 0, len(tiers))
	for _, t := range tiers {
		out = append(out, dto.TierResponse{
			Tier:                  t.Letter,
			Source:                t.Source,
			EquipmentID:           t.EquipmentID,
			TransportID:           t.TransportID,
			ServiceAbbrev:         t.ServiceAbbrev,
			CustomLabel:           t.CustomLabel,
			Detail:                t.Detail,
			Highlights:            orEmpty(t.Highlights),
			EquipmentNomenclature: t.EquipmentNomenclature,
			EquipmentNickname:     t.EquipmentNickname,
			EquipmentPhotoURL:     t.EquipmentPhotoURL,
			TransportName:         t.TransportName,
			ServiceCIR:            t.ServiceCIR,
			ServiceMIR:            t.ServiceMIR,
		})
	}
	return out
}

// tiersFrom maps the four tiles in, clearing the reference that does not match
// the chosen source. A tier switched from equipment to custom keeps no
// equipment_id, so the stale row cannot resurface if it is switched back.
func tiersFrom(in []dto.SaveTierInput) []*Tier {
	out := make([]*Tier, 0, len(in))
	for _, t := range in {
		source := strings.TrimSpace(t.Source)
		tier := &Tier{
			Letter:      strings.ToUpper(strings.TrimSpace(t.Tier)),
			Source:      source,
			CustomLabel: strings.TrimSpace(t.CustomLabel),
			Detail:      strings.TrimSpace(t.Detail),
			Highlights:  keepHighlights(TierHighlights, t.Highlights),
		}
		switch source {
		case TierSourceEquipment:
			tier.EquipmentID = strings.TrimSpace(t.EquipmentID)
			tier.ServiceAbbrev = strings.TrimSpace(t.ServiceAbbrev)
		case TierSourceTransport:
			tier.TransportID = strings.TrimSpace(t.TransportID)
		case TierSourceCustom:
			// Nothing to carry but the label, already set above.
		}
		// A tier that is not custom keeps no custom label, for the same reason
		// the ID fields are cleared: one source, one meaning.
		if source != TierSourceCustom {
			tier.CustomLabel = ""
		}
		out = append(out, tier)
	}
	return out
}

func tmnRowsFrom(in []dto.SaveTmnRowInput) []*TmnRow {
	out := make([]*TmnRow, 0, len(in))
	for i, r := range in {
		out = append(out, &TmnRow{
			Position:   i,
			Label:      strings.TrimSpace(r.Label),
			Value:      strings.TrimSpace(r.Value),
			Highlights: keepHighlights(TmnHighlights, r.Highlights),
		})
	}
	return out
}

// diffCard summarises a save for the audit log. Channel-by-channel detail would
// drown the entry, so this records the shape of each wheel: how many channels
// carry a net, and the caption.
//
// touched is the set of radios the request actually carried. A radio the request
// omitted is left untouched by the write, so reporting it would claim its wheel
// had been emptied when nothing went near it. A radio that IS present with an
// empty channel list is a real clear, and still gets logged.
func diffCard(before, after *CommsCard, touched map[string]bool) map[string]any {
	changes := map[string]any{}

	// The version is logged because it is what a recipient quotes back ("the v3
	// card"). The changed-marks are not: they are presentation, set and cleared
	// by hand, and logging each toggle would bury the edits they describe.
	bTitle, aTitle := "", ""
	bVersion, aVersion := "", ""
	var bDate, aDate string
	if before.Header != nil {
		bTitle = before.Header.Title
		bVersion = before.Header.Version
		if before.Header.EffectiveDate != nil {
			bDate = before.Header.EffectiveDate.Format("2006-01-02")
		}
	}
	if after.Header != nil {
		aTitle = after.Header.Title
		aVersion = after.Header.Version
		if after.Header.EffectiveDate != nil {
			aDate = after.Header.EffectiveDate.Format("2006-01-02")
		}
	}
	if bTitle != aTitle {
		changes["title"] = map[string]any{"old": bTitle, "new": aTitle}
	}
	if bDate != aDate {
		changes["effective_date"] = map[string]any{"old": bDate, "new": aDate}
	}
	if bVersion != aVersion {
		changes["version"] = map[string]any{"old": bVersion, "new": aVersion}
	}

	for _, radio := range ValidRadios {
		if !touched[radio] {
			continue
		}
		b, a := before.PlanFor(radio), after.PlanFor(radio)
		bCount, aCount := 0, 0
		bLabel, aLabel := "", ""
		if b != nil {
			bCount, bLabel = len(b.Assignments), b.Label
		}
		if a != nil {
			aCount, aLabel = len(a.Assignments), a.Label
		}
		if bCount != aCount {
			changes[radio+"_assigned_channels"] = map[string]any{"old": bCount, "new": aCount}
		}
		if bLabel != aLabel {
			changes[radio+"_label"] = map[string]any{"old": bLabel, "new": aLabel}
		}
	}
	return changes
}

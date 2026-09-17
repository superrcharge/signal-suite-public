package radionet

import (
	"time"

	"backend/internal/domain/radionet/dto"
)

func toNetResponse(n *Net) dto.NetResponse {
	return dto.NetResponse{
		ID:          n.ID,
		Section:     n.Section,
		Name:        n.Name,
		NetID:       n.NetID,
		RadioType:   n.RadioType,
		TxFreq:      n.TxFreq,
		RxFreq:      n.RxFreq,
		FreqUnit:    n.FreqUnit,
		ROIP:        n.ROIP,
		Description: n.Description,
		Notes:       n.Notes,
		CreatedBy:   n.CreatedBy,
		UpdatedBy:   n.UpdatedBy,
		CreatedAt:   n.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   n.UpdatedAt.Format(time.RFC3339),
	}
}

func toNetResponseList(items []*Net) []dto.NetResponse {
	out := make([]dto.NetResponse, 0, len(items))
	for _, n := range items {
		out = append(out, toNetResponse(n))
	}
	return out
}

// diffNet reports the fields that changed, in the {field: {old, new}} shape the
// audit log expects. UpdatedBy and UpdatedAt are skipped: they change on every
// write and would drown the real diff.
func diffNet(old, updated *Net) map[string]any {
	changes := map[string]any{}

	addStr := func(field, before, after string) {
		if before != after {
			changes[field] = map[string]any{"old": before, "new": after}
		}
	}

	addStr("name", old.Name, updated.Name)
	addStr("net_id", old.NetID, updated.NetID)
	addStr("radio_type", old.RadioType, updated.RadioType)
	addStr("tx_freq", old.TxFreq, updated.TxFreq)
	addStr("rx_freq", old.RxFreq, updated.RxFreq)
	addStr("freq_unit", old.FreqUnit, updated.FreqUnit)

	if old.ROIP != updated.ROIP {
		changes["roip"] = map[string]any{"old": old.ROIP, "new": updated.ROIP}
	}
	addStr("description", old.Description, updated.Description)
	addStr("notes", old.Notes, updated.Notes)

	return changes
}

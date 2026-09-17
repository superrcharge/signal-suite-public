package terminal

import (
	"strings"

	"backend/internal/domain/terminal/dto"
)

func toTerminalResponse(t *Terminal) dto.TerminalResponse {
	return dto.TerminalResponse{
		ID:         t.ID,
		Name:       t.Name,
		Model:      t.Model,
		Kit:        t.Kit,
		Pim:        t.Pim,
		Serial:     t.Serial,
		Section:    t.Section,
		Status:     t.Status,
		Owner:      t.Owner,
		OwnerEmail: t.OwnerEmail,
		OwnerPhone: t.OwnerPhone,
		PopPin:     t.PopPin,
		Notes:      t.Notes,
		Tag:        t.Tag,
		UpdatedBy:  t.UpdatedBy,
		CreatedAt:  t.CreatedAt,
		UpdatedAt:  t.UpdatedAt,
	}
}

// normalizeTag trims whitespace; an empty string after trimming becomes
// nil so the column always stores either a meaningful value or NULL
// (no whitespace-only or empty-string tags polluting the distinct list).
func normalizeTag(tag *string) *string {
	if tag == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*tag)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// normalizePopPin trims whitespace; an empty string after trimming becomes
// nil so the column always stores either a valid slug or NULL - "" is the
// client's clear signal, same convention as tag.
func normalizePopPin(pin *string) *string {
	if pin == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*pin)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func toTerminalResponseList(terminals []*Terminal) []dto.TerminalResponse {
	result := make([]dto.TerminalResponse, len(terminals))
	for i, t := range terminals {
		result[i] = toTerminalResponse(t)
	}
	return result
}

// diffTerminal returns a JSONB-ready map of changed user-facing fields
// with old/new values, suitable for the audit log. Skips UpdatedBy and
// UpdatedAt because they change on every update by definition and would
// pollute the diff. A nil map means no user-facing changes (e.g., the
// caller hit the endpoint with identical values).
func diffTerminal(old, new *Terminal) map[string]any {
	out := make(map[string]any)

	if old.Name != new.Name {
		out["name"] = map[string]any{"old": old.Name, "new": new.Name}
	}
	if ptrStrDiff(old.Model, new.Model) {
		out["model"] = map[string]any{"old": derefStr(old.Model), "new": derefStr(new.Model)}
	}
	if old.Kit != new.Kit {
		out["kit"] = map[string]any{"old": old.Kit, "new": new.Kit}
	}
	if old.Pim != new.Pim {
		out["pim"] = map[string]any{"old": old.Pim, "new": new.Pim}
	}
	if old.Serial != new.Serial {
		out["serial"] = map[string]any{"old": old.Serial, "new": new.Serial}
	}
	if old.Section != new.Section {
		out["section"] = map[string]any{"old": old.Section, "new": new.Section}
	}
	if old.Status != new.Status {
		out["status"] = map[string]any{"old": old.Status, "new": new.Status}
	}
	if ptrStrDiff(old.Owner, new.Owner) {
		out["owner"] = map[string]any{"old": derefStr(old.Owner), "new": derefStr(new.Owner)}
	}
	if ptrStrDiff(old.OwnerEmail, new.OwnerEmail) {
		out["owner_email"] = map[string]any{"old": derefStr(old.OwnerEmail), "new": derefStr(new.OwnerEmail)}
	}
	if ptrStrDiff(old.OwnerPhone, new.OwnerPhone) {
		out["owner_phone"] = map[string]any{"old": derefStr(old.OwnerPhone), "new": derefStr(new.OwnerPhone)}
	}
	if ptrStrDiff(old.PopPin, new.PopPin) {
		out["pop_pin"] = map[string]any{"old": derefStr(old.PopPin), "new": derefStr(new.PopPin)}
	}
	if old.Notes != new.Notes {
		out["notes"] = map[string]any{"old": old.Notes, "new": new.Notes}
	}
	if ptrStrDiff(old.Tag, new.Tag) {
		out["tag"] = map[string]any{"old": derefStr(old.Tag), "new": derefStr(new.Tag)}
	}

	if len(out) == 0 {
		return nil
	}
	return out
}

func ptrStrDiff(a, b *string) bool {
	if a == nil && b == nil {
		return false
	}
	if a == nil || b == nil {
		return true
	}
	return *a != *b
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

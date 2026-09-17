package kit

import (
	"backend/internal/domain/kit/dto"
)

func toKitResponse(k *Kit) dto.KitResponse {
	return dto.KitResponse{
		ID:         k.ID,
		Name:       k.Name,
		Type:       k.Type,
		Status:     k.Status,
		Black:      k.Black,
		Secret:      k.Secret,
		TopSecret:       k.TopSecret,
		Section:    k.Section,
		Owner:      k.Owner,
		OwnerEmail: k.OwnerEmail,
		OwnerPhone: k.OwnerPhone,
		Location:   k.Location,
		Notes:      k.Notes,
		UpdatedBy:  k.UpdatedBy,
		CreatedAt:  k.CreatedAt,
		UpdatedAt:  k.UpdatedAt,
	}
}

func toKitResponseList(kits []*Kit) []dto.KitResponse {
	result := make([]dto.KitResponse, len(kits))
	for i, k := range kits {
		result[i] = toKitResponse(k)
	}
	return result
}

// diffKit returns a JSONB-ready map of changed user-facing fields with
// old/new values, suitable for the audit log. Skips UpdatedBy and
// UpdatedAt because they change on every update by definition and would
// pollute the diff. A nil map means no user-facing changes.
func diffKit(old, new *Kit) map[string]any {
	out := make(map[string]any)

	if old.Name != new.Name {
		out["name"] = map[string]any{"old": old.Name, "new": new.Name}
	}
	if old.Type != new.Type {
		out["type"] = map[string]any{"old": old.Type, "new": new.Type}
	}
	if old.Status != new.Status {
		out["status"] = map[string]any{"old": old.Status, "new": new.Status}
	}
	if old.Black != new.Black {
		out["black"] = map[string]any{"old": old.Black, "new": new.Black}
	}
	if old.Secret != new.Secret {
		out["secret"] = map[string]any{"old": old.Secret, "new": new.Secret}
	}
	if old.TopSecret != new.TopSecret {
		out["topsecret"] = map[string]any{"old": old.TopSecret, "new": new.TopSecret}
	}
	if old.Section != new.Section {
		out["section"] = map[string]any{"old": old.Section, "new": new.Section}
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
	if old.Location != new.Location {
		out["location"] = map[string]any{"old": old.Location, "new": new.Location}
	}
	if old.Notes != new.Notes {
		out["notes"] = map[string]any{"old": old.Notes, "new": new.Notes}
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

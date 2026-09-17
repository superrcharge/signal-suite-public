package section

import (
	"context"
	"net/http"
	"regexp"
	"strings"

	"backend/internal/domain/section/dto"
	"backend/internal/shared/contracts"
)

// ReassignToNone is the sentinel DeleteSectionRequest.ReassignTo value
// that clears the section on all affected terminals (sets
// terminals.section = NULL). Any other non-empty value is treated as a
// destination section key.
const ReassignToNone = "__none__"

type Service struct {
	repo         Repository
	reassign     contracts.TerminalSectionReassigner
	reassignKits contracts.KitSectionReassigner
	nets         contracts.NetSectionCounter
	pace         contracts.PaceSectionChecker
	audit        contracts.AuditRecorder
}

// NewService wires the section service. reassign is injected later via
// SetReassigner because terminal.Service and section.Service reference
// each other through shared/contracts interfaces and main.go has to
// construct them in some order.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// SetReassigner injects the terminal-side cross-domain contract. Must
// be called before DELETE requests are served; CreateSection and
// ListSections do not depend on it.
func (s *Service) SetReassigner(r contracts.TerminalSectionReassigner) {
	s.reassign = r
}

// SetKitReassigner injects the kit-side cross-domain contract. Kits also
// FK sections, so a section delete must count + reassign them alongside
// terminals. Injected via setter for the same reason as SetReassigner.
func (s *Service) SetKitReassigner(r contracts.KitSectionReassigner) {
	s.reassignKits = r
}

// SetNetCounter and SetPaceChecker inject the two domains a delete asks
// before touching anything. Unlike terminals and kits they are never moved:
// a squadron's nets and PACE card are its own planning, so their presence
// refuses the delete. See contracts.NetSectionCounter.
func (s *Service) SetNetCounter(n contracts.NetSectionCounter) {
	s.nets = n
}

func (s *Service) SetPaceChecker(p contracts.PaceSectionChecker) {
	s.pace = p
}

// SetAudit injects the audit sink. Best-effort; audit is nil-safe.
func (s *Service) SetAudit(a contracts.AuditRecorder) {
	s.audit = a
}

func (s *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, in)
}

// nonAlnum matches everything a section key may not contain. Compiled once:
// slugifyKey runs on every section create.
var nonAlnum = regexp.MustCompile(`[^a-z0-9]`)

// slugifyKey turns a section label into its key: lowercase, whitespace
// collapsed away (no hyphen), and every remaining non-alphanumeric dropped, so
// "H SQD" becomes "hsqd" and "R&D" becomes "rd".
//
// The strip is the half this used to be missing while its comment already
// claimed parity with the frontend. labelToKey in terminal-drawer.tsx (and its
// copy in kit-drawer.tsx) has always ended in .replace(/[^a-z0-9]/g, ”), and
// because both drawers slugify client-side and POST the finished key, the UI
// never exposed the gap - but curl, a script or any future caller could store a
// key like "r&d". That key then flows unencoded into PATCH /sections/${key} and
// DELETE /sections/${key} in section-service.ts, into navigate('/nets/${key}'),
// and into a CSV zip entry filename in csvbulk. Keeping the two slugifiers
// identical is what stops a key ever needing to be escaped.
//
// Returns "" for input with nothing alphanumeric in it, which the caller
// rejects rather than writing a blank primary key.
func slugifyKey(raw string) string {
	return nonAlnum.ReplaceAllString(strings.ToLower(strings.Join(strings.Fields(raw), "")), "")
}

func (s *Service) CreateSection(ctx context.Context, req *dto.CreateSectionRequest, resp *dto.CreateSectionResponse) (int, error) {
	key := slugifyKey(req.Key)
	if key == "" {
		return http.StatusBadRequest, ErrSectionInvalidKey
	}

	_, err := s.repo.FindByKey(ctx, key)
	if err == nil {
		return http.StatusConflict, ErrSectionKeyExists
	}
	if err != ErrSectionNotFound {
		return http.StatusInternalServerError, ErrSectionInternalError
	}

	sec := &Section{
		Key:         key,
		Label:       strings.ToUpper(req.Label),
		Color:       req.Color,
		PaceEnabled: req.PaceEnabled,
	}

	if err := s.repo.Create(ctx, sec); err != nil {
		return http.StatusInternalServerError, ErrSectionInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.ActorName,
		ResourceType: "section",
		ResourceID:   sec.Key,
		ResourceName: sec.Label,
		Action:       "create",
	})

	resp.Section = toSectionResponse(sec)
	return http.StatusCreated, nil
}

func (s *Service) ListSections(ctx context.Context, resp *dto.ListSectionsResponse) (int, error) {
	sections, err := s.repo.FindAll(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrSectionInternalError
	}

	resp.Sections = toSectionResponseList(sections)
	return http.StatusOK, nil
}

// GetSectionKeys implements contracts.SectionLister for cross-domain use.
func (s *Service) GetSectionKeys(ctx context.Context) ([]string, error) {
	sections, err := s.repo.FindAll(ctx)
	if err != nil {
		return nil, err
	}
	keys := make([]string, len(sections))
	for i, sec := range sections {
		keys[i] = sec.Key
	}
	return keys, nil
}

// UpdateSection patches the label and/or color of an existing section.
// The key is immutable (it's a natural key used as a foreign key by
// terminals.section); a rename-label without changing the key is the
// intended operation.
func (s *Service) UpdateSection(ctx context.Context, req *dto.UpdateSectionRequest, resp *dto.UpdateSectionResponse) (int, error) {
	existing, err := s.repo.FindByKey(ctx, req.Key)
	if err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrSectionInternalError
	}

	oldLabel, oldColor, oldPace := existing.Label, existing.Color, existing.PaceEnabled

	if req.Label != nil {
		existing.Label = strings.ToUpper(strings.TrimSpace(*req.Label))
	}
	if req.Color != nil {
		existing.Color = *req.Color
	}
	if req.PaceEnabled != nil {
		existing.PaceEnabled = *req.PaceEnabled
	}

	if err := s.repo.Update(ctx, existing); err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrSectionInternalError
	}

	changes := map[string]any{}
	if oldLabel != existing.Label {
		changes["label"] = map[string]any{"old": oldLabel, "new": existing.Label}
	}
	if oldColor != existing.Color {
		changes["color"] = map[string]any{"old": oldColor, "new": existing.Color}
	}
	// Worth auditing: turning this off takes a squadron's comms card and nets
	// library out of the app for everyone, with no deploy and no other trace.
	if oldPace != existing.PaceEnabled {
		changes["pace_enabled"] = map[string]any{"old": oldPace, "new": existing.PaceEnabled}
	}
	if len(changes) > 0 {
		s.recordAudit(ctx, contracts.AuditEventInput{
			ActorID:      req.ActorID,
			ActorName:    req.ActorName,
			ResourceType: "section",
			ResourceID:   existing.Key,
			ResourceName: existing.Label,
			Action:       "update",
			Changes:      changes,
		})
	}

	resp.Section = toSectionResponse(existing)
	return http.StatusOK, nil
}

// DeleteSection removes a section, with optional bulk reassignment of
// any terminals and kits that reference it.
//
// First, whatever req.ReassignTo says: a section that still has nets or a
// saved PACE card is refused with ErrSectionHasPlanning, before anything is
// moved. Then, by req.ReassignTo:
//
//   - empty: fail with ErrSectionInUse if any terminals or kits still
//     reference the section. The client can retry with a reassignment.
//   - ReassignToNone ("__none__"): set section = NULL on every affected
//     terminal and kit, then delete the section.
//   - any other string: must be a valid existing section key; moves
//     all affected terminals and kits to that section, then deletes this one.
//
// The reassignment and delete are not transactional at the repository level.
// That is safe only because every foreign key to sections that a delete does
// not handle is checked before the first reassignment: terminals and kits are
// moved, and nets and the PACE tables refuse up front. A new table keyed on
// sections must join one of those two groups, or a delete will fail at the
// database after moving terminals, which is what this did before the refusal.
func (s *Service) DeleteSection(ctx context.Context, req *dto.DeleteSectionRequest, resp *dto.DeleteSectionResponse) (int, error) {
	if s.reassign == nil {
		return http.StatusInternalServerError, ErrSectionInternalError
	}

	// Verify the section exists so we return a clean 404 even when
	// the delete path would otherwise return a silent rowsaffected=0.
	if _, err := s.repo.FindByKey(ctx, req.Key); err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrSectionInternalError
	}

	reassignTarget := strings.TrimSpace(req.ReassignTo)

	// Reassign to itself makes no sense; catch it explicitly.
	if reassignTarget == req.Key {
		return ErrInvalidReassign.Status, ErrInvalidReassign
	}

	// Validate destination section exists if one was specified.
	if reassignTarget != "" && reassignTarget != ReassignToNone {
		if _, err := s.repo.FindByKey(ctx, reassignTarget); err != nil {
			if coded, ok := err.(*Error); ok {
				return coded.Status, err
			}
			return http.StatusInternalServerError, ErrSectionInternalError
		}
	}

	// Nets and a saved PACE card refuse the delete, and first: checked any
	// later, the refusal would come after terminals and kits had already been
	// moved. A lookup that fails has not shown the section is empty, so it is a
	// 500 rather than permission - the same choice the waveform and net guards
	// make.
	netCount := 0
	if s.nets != nil {
		n, err := s.nets.CountNetsInSection(ctx, req.Key)
		if err != nil {
			return http.StatusInternalServerError, ErrSectionInternalError
		}
		netCount = n
	}
	hasPace := false
	if s.pace != nil {
		p, err := s.pace.SectionHasPaceData(ctx, req.Key)
		if err != nil {
			return http.StatusInternalServerError, ErrSectionInternalError
		}
		hasPace = p
	}
	if netCount > 0 || hasPace {
		refusal := errSectionHasPlanning(netCount, hasPace)
		return refusal.Status, refusal
	}

	termCount, err := s.reassign.CountTerminalsInSection(ctx, req.Key)
	if err != nil {
		return http.StatusInternalServerError, ErrSectionInternalError
	}

	// Kits also FK sections and must be reassigned on delete. The kit
	// reassigner is nil-guarded so section deletes still work in setups
	// where it hasn't been wired (e.g. unit tests).
	kitCount := 0
	if s.reassignKits != nil {
		kitCount, err = s.reassignKits.CountKitsInSection(ctx, req.Key)
		if err != nil {
			return http.StatusInternalServerError, ErrSectionInternalError
		}
	}

	// No reassignment requested and assets still use it - block.
	if termCount+kitCount > 0 && reassignTarget == "" {
		return ErrSectionInUse.Status, ErrSectionInUse
	}

	to := reassignTarget
	if to == ReassignToNone {
		to = "" // repository contract: empty = NULL
	}

	reassigned := 0
	if termCount > 0 {
		moved, err := s.reassign.ReassignTerminalsToSection(ctx, req.Key, to)
		if err != nil {
			return http.StatusInternalServerError, ErrSectionInternalError
		}
		reassigned += moved
	}
	if kitCount > 0 && s.reassignKits != nil {
		moved, err := s.reassignKits.ReassignKitsToSection(ctx, req.Key, to)
		if err != nil {
			return http.StatusInternalServerError, ErrSectionInternalError
		}
		reassigned += moved
	}

	// Snapshot the section label before delete so the audit row carries it.
	var resourceName string
	if existing, err := s.repo.FindByKey(ctx, req.Key); err == nil && existing != nil {
		resourceName = existing.Label
	}

	if err := s.repo.Delete(ctx, req.Key); err != nil {
		if coded, ok := err.(*Error); ok {
			return coded.Status, err
		}
		return http.StatusInternalServerError, ErrSectionInternalError
	}

	changes := map[string]any{}
	if reassigned > 0 {
		// Count spans both terminals and kits reassigned off this section.
		changes["reassigned_assets"] = reassigned
		if reassignTarget != "" && reassignTarget != ReassignToNone {
			changes["reassigned_to"] = reassignTarget
		} else {
			changes["reassigned_to"] = nil
		}
	}
	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.ActorName,
		ResourceType: "section",
		ResourceID:   req.Key,
		ResourceName: resourceName,
		Action:       "delete",
		Changes:      changes,
	})

	resp.Reassigned = reassigned
	if reassignTarget != ReassignToNone {
		resp.To = reassignTarget
	}
	return http.StatusOK, nil
}

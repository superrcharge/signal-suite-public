package pace

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"backend/internal/domain/pace/dto"
	"backend/internal/shared/contracts"

	"github.com/google/uuid"
)

type Service struct {
	repo  Repository
	audit contracts.AuditRecorder
	nets  contracts.NetLookup
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetAudit(a contracts.AuditRecorder) { s.audit = a }

// SetNetLookup wires the nets library so a save can reject a channel naming a
// net that does not exist, or one the radio does not carry.
func (s *Service) SetNetLookup(n contracts.NetLookup) { s.nets = n }

// SectionHasPaceData satisfies contracts.PaceSectionChecker: a section delete
// asks it first, and refuses while the squadron still has any PACE card data.
func (s *Service) SectionHasPaceData(ctx context.Context, section string) (bool, error) {
	return s.repo.SectionHasData(ctx, section)
}

func (s *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, in)
}

// GetCard returns a squadron's whole card. A squadron with nothing saved yet
// gets an empty scaffold rather than a 404 -- there is no "create plan" step.
func (s *Service) GetCard(ctx context.Context, req *dto.GetCardRequest, resp *dto.GetCardResponse) (int, error) {
	section := strings.TrimSpace(req.Section)

	exists, err := s.repo.SectionExists(ctx, section)
	if err != nil {
		return http.StatusInternalServerError, ErrPaceInternalError
	}
	if !exists {
		return http.StatusNotFound, ErrSectionNotFound
	}

	card, err := s.repo.FindCard(ctx, section)
	if err != nil {
		return http.StatusInternalServerError, ErrPaceInternalError
	}

	resp.Card = toCardResponse(card)
	return http.StatusOK, nil
}

// SaveCard replaces the card in one transaction. The editor is one page with one
// Save, so the write is a whole-card replace rather than granular per-channel
// endpoints.
func (s *Service) SaveCard(ctx context.Context, req *dto.SaveCardRequest, resp *dto.SaveCardResponse) (int, error) {
	section := strings.TrimSpace(req.Section)

	exists, err := s.repo.SectionExists(ctx, section)
	if err != nil {
		return http.StatusInternalServerError, ErrPaceInternalError
	}
	if !exists {
		return http.StatusNotFound, ErrSectionNotFound
	}

	before, err := s.repo.FindCard(ctx, section)
	if err != nil {
		return http.StatusInternalServerError, ErrPaceInternalError
	}

	if err := checkHighlights(req); err != nil {
		return http.StatusBadRequest, err
	}

	header := &CardHeader{
		ID:         uuid.New().String(), // only used when the row is new
		Section:    section,
		Title:      strings.TrimSpace(req.Title),
		Version:    strings.TrimSpace(req.Version),
		Highlights: keepHighlights(HeaderHighlights, req.Highlights),
		UpdatedBy:  req.UpdatedBy,
	}
	if raw := strings.TrimSpace(req.EffectiveDate); raw != "" {
		d, err := time.Parse("2006-01-02", raw)
		if err != nil {
			return http.StatusBadRequest, ErrInvalidDate
		}
		header.EffectiveDate = &d
	}
	// An empty string leaves EffectiveDate nil, which clears the column. That is
	// what the editor's "Include date" checkbox does when unticked.

	// The tier checks, in the same shape as the radio checks below: a coded 400
	// per rule rather than a bare status. Unlike the band, an absent tiers array
	// means "unchanged" rather than "clear", so nil is passed through untouched
	// and the repository skips the tier write entirely.
	if req.Tiers != nil {
		seenTier := map[string]bool{}
		for _, in := range req.Tiers {
			letter := strings.ToUpper(strings.TrimSpace(in.Tier))
			source := strings.TrimSpace(in.Source)
			if !IsValidTierLetter(letter) || !IsValidTierSource(source) {
				return http.StatusBadRequest, ErrInvalidTierSource
			}
			if seenTier[letter] {
				return http.StatusBadRequest, ErrDuplicateTier
			}
			seenTier[letter] = true

			// A source that names a reference must carry it. Without this the
			// tile renders a terminal with no terminal behind it.
			switch source {
			case TierSourceEquipment:
				if strings.TrimSpace(in.EquipmentID) == "" {
					return http.StatusBadRequest, tierMissingRef(letter, source)
				}
			case TierSourceTransport:
				if strings.TrimSpace(in.TransportID) == "" {
					return http.StatusBadRequest, tierMissingRef(letter, source)
				}
			case TierSourceCustom:
				if strings.TrimSpace(in.CustomLabel) == "" {
					return http.StatusBadRequest, tierMissingRef(letter, source)
				}
			}
		}
	}

	card := &CommsCard{
		Section: section,
		Header:  header,
		Plans:   []*ChannelPlan{},
		// The band is a whole-band replace: what the request carries is what
		// the squadron ends up with, so an omitted array clears its block.
		LTACRows:   freqRowsFrom(req.LTACRows),
		TACSATRows: freqRowsFrom(req.TACSATRows),
		TmnRows: tmnRowsFrom(req.TmnRows),
	}
	// nil, not an empty slice, when the request omitted tiers: the repository
	// reads nil as "leave the stored tiers alone".
	if req.Tiers != nil {
		card.Tiers = tiersFrom(req.Tiers)
	}
	// The radios this request actually carries. A save is a partial replace, so
	// this set is both the duplicate guard and what the audit diff is limited to.
	touched := map[string]bool{}
	for _, in := range req.Plans {
		radio := strings.TrimSpace(in.RadioType)
		if !IsValidRadio(radio) {
			return http.StatusBadRequest, ErrInvalidRadio
		}
		if touched[radio] {
			return http.StatusBadRequest, ErrDuplicateRadio
		}
		touched[radio] = true

		count := in.ChannelCount
		if count == 0 {
			count = DefaultChannelCount
		}

		plan := &ChannelPlan{
			ID:           uuid.New().String(), // only used when the row is new
			Section:      section,
			RadioType:    radio,
			Label:        strings.TrimSpace(in.Label),
			ChannelCount: count,
			Notes:        strings.TrimSpace(in.Notes),
			UpdatedBy:    req.UpdatedBy,
			Highlights:   keepHighlights(PlanHighlights, in.Highlights),
			Assignments:  []*ChannelAssignment{},
		}

		seen := map[int]bool{}
		for _, ch := range in.Channels {
			if ch.ChannelNumber < 1 || ch.ChannelNumber > count {
				return http.StatusBadRequest, ErrChannelOutOfRange
			}
			if seen[ch.ChannelNumber] {
				return http.StatusBadRequest, ErrDuplicateChannel
			}
			seen[ch.ChannelNumber] = true

			plan.Assignments = append(plan.Assignments, &ChannelAssignment{
				ChannelNumber:    ch.ChannelNumber,
				NetID:            strings.TrimSpace(ch.NetID),
				TxFreqOverride:   strings.TrimSpace(ch.TxFreqOverride),
				RxFreqOverride:   strings.TrimSpace(ch.RxFreqOverride),
				FreqUnitOverride: strings.TrimSpace(ch.FreqUnitOverride),
				LabelOverride:    strings.TrimSpace(ch.LabelOverride),
				Highlights:       keepHighlights(ChannelHighlights, ch.Highlights),
			})
		}

		card.Plans = append(card.Plans, plan)
	}

	if status, err := s.checkNets(ctx, card); err != nil {
		return status, err
	}

	if err := s.repo.SaveCard(ctx, card); err != nil {
		return http.StatusInternalServerError, ErrPaceInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "pace_section",
		ResourceID:   section,
		ResourceName: section,
		Action:       "update",
		Changes:      diffCard(before, card, touched),
	})

	saved, err := s.repo.FindCard(ctx, section)
	if err != nil {
		return http.StatusInternalServerError, ErrPaceInternalError
	}
	resp.Card = toCardResponse(saved)
	return http.StatusOK, nil
}

// SetEmblem stores the squadron's emblem URL.
//
// The emblem is written on its own rather than through SaveCard: the editor
// uploads it on selection and never carries it in the card draft, so routing it
// through the whole-card replace would clear an emblem every save.
func (s *Service) SetEmblem(ctx context.Context, section, url string) (int, error) {
	return s.writeEmblem(ctx, section, url)
}

// ClearEmblem drops the stored emblem. The empty string is the "no emblem"
// value, so clearing is a write rather than a delete.
func (s *Service) ClearEmblem(ctx context.Context, section string) (int, error) {
	return s.writeEmblem(ctx, section, "")
}

func (s *Service) writeEmblem(ctx context.Context, section, url string) (int, error) {
	section = strings.TrimSpace(section)

	exists, err := s.repo.SectionExists(ctx, section)
	if err != nil {
		return http.StatusInternalServerError, ErrPaceInternalError
	}
	if !exists {
		return http.StatusNotFound, ErrSectionNotFound
	}

	if err := s.repo.SetEmblemURL(ctx, section, url); err != nil {
		return http.StatusInternalServerError, ErrPaceInternalError
	}
	return http.StatusOK, nil
}

// checkHighlights refuses a changed-mark naming a field its row does not have.
//
// Unknown names are refused rather than dropped: silently discarding one would
// save a card that prints a value in black the squadron asked to be red, which
// is exactly the change the recipient was meant to notice. The message names
// the row the way the editor labels it.
func checkHighlights(req *dto.SaveCardRequest) error {
	check := func(where string, allowed, in []string) error {
		if k := badHighlight(allowed, in); k != "" {
			return invalidHighlight(where, k)
		}
		return nil
	}

	if err := check("card header", HeaderHighlights, req.Highlights); err != nil {
		return err
	}
	for _, p := range req.Plans {
		radio := strings.ToUpper(strings.TrimSpace(p.RadioType))
		if err := check(radio+" wheel", PlanHighlights, p.Highlights); err != nil {
			return err
		}
		for _, ch := range p.Channels {
			if err := check(fmt.Sprintf("%s channel %d", radio, ch.ChannelNumber), ChannelHighlights, ch.Highlights); err != nil {
				return err
			}
		}
	}
	for i, r := range req.LTACRows {
		if err := check(fmt.Sprintf("LTAC row %d", i+1), FreqRowHighlights, r.Highlights); err != nil {
			return err
		}
	}
	for i, r := range req.TACSATRows {
		if err := check(fmt.Sprintf("TACSAT row %d", i+1), FreqRowHighlights, r.Highlights); err != nil {
			return err
		}
	}
	for i, r := range req.TmnRows {
		if err := check(fmt.Sprintf("TACTICAL MISSION NETWORK row %d", i+1), TmnHighlights, r.Highlights); err != nil {
			return err
		}
	}
	for _, t := range req.Tiers {
		if err := check("tier "+strings.ToUpper(strings.TrimSpace(t.Tier)), TierHighlights, t.Highlights); err != nil {
			return err
		}
	}
	return nil
}

// checkNets rejects a channel naming a net that does not exist, or one this
// radio does not carry. The second half is the payoff for the nets library's
// radio_type: it makes assigning an MPU5-only net to a JEM channel impossible
// rather than merely discouraged.
func (s *Service) checkNets(ctx context.Context, card *CommsCard) (int, error) {
	if s.nets == nil {
		return http.StatusOK, nil
	}

	ids := []string{}
	for _, p := range card.Plans {
		for _, a := range p.Assignments {
			ids = append(ids, a.NetID)
		}
	}
	if len(ids) == 0 {
		return http.StatusOK, nil
	}

	info, err := s.nets.NetsByIDs(ctx, ids)
	if err != nil {
		return http.StatusInternalServerError, ErrPaceInternalError
	}

	for _, p := range card.Plans {
		for _, a := range p.Assignments {
			net, ok := info[a.NetID]
			if !ok {
				return http.StatusBadRequest, ErrUnknownNet
			}
			// Nets are a per-squadron library. A card may only use its own
			// squadron's nets, so one squadron editing FIRES can never reach
			// another's card.
			if net.Section != card.Section {
				return http.StatusBadRequest, ErrNetWrongSection
			}
			// "both" belongs on either wheel; anything else must match.
			if net.RadioType != "both" && net.RadioType != p.RadioType {
				return http.StatusBadRequest, ErrNetWrongRadio
			}
		}
	}
	return http.StatusOK, nil
}

// CountAssignmentsForNet and PlansUsingNet satisfy contracts.NetUsage, letting
// the nets library refuse a delete that would strip a net off a live wheel.
func (s *Service) CountAssignmentsForNet(ctx context.Context, netID string) (int, error) {
	return s.repo.CountAssignmentsForNet(ctx, netID)
}

func (s *Service) PlansUsingNet(ctx context.Context, netID string) ([]string, error) {
	return s.repo.PlansUsingNet(ctx, netID)
}

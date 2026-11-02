package operation

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"backend/internal/domain/operation/dto"
	"backend/internal/shared/branch"
	"backend/internal/shared/contracts"
)

type Service struct {
	repo     Repository
	audit    contracts.AuditRecorder
	org      contracts.OrganizationLookup
	waveform contracts.WaveformLookup
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetAudit(a contracts.AuditRecorder) { s.audit = a }

// SetOrganizationLookup wires the organizations library so a check-in cannot
// name an organization that does not exist.
func (s *Service) SetOrganizationLookup(l contracts.OrganizationLookup) { s.org = l }

// SetWaveformLookup wires the waveform library so a check-in cannot name an
// abbrev nothing declares.
func (s *Service) SetWaveformLookup(l contracts.WaveformLookup) { s.waveform = l }

// recordAudit is nil-tolerant because AuditRecorder is injected after
// construction, so a Service built without it - every unit test in this
// package - must not panic on a write.
func (s *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, in)
}

// checkWaveforms rejects abbrevs the library does not declare, preserving the
// caller's spelling in the message. Nil-tolerant like platform's: the lookup is
// injected after construction, so an unwired Service skips the check, which is
// why a root-level test asserts the wiring rather than only the rule.
func (s *Service) checkWaveforms(ctx context.Context, abbrevs []string) error {
	if s.waveform == nil || len(abbrevs) == 0 {
		return nil
	}
	known, err := s.waveform.KnownWaveformAbbrevs(ctx)
	if err != nil {
		return ErrOperationInternalError
	}
	var unknown []string
	for _, a := range abbrevs {
		if _, ok := known[strings.ToLower(strings.TrimSpace(a))]; !ok {
			unknown = append(unknown, a)
		}
	}
	if len(unknown) > 0 {
		return ErrParticipantUnknownWaveform(unknown)
	}
	return nil
}

// checkOrganization confirms the key names a real organization. Nil-tolerant
// for the same reason as checkWaveforms; the foreign key is then the only thing
// left to refuse an unknown key.
func (s *Service) checkOrganization(ctx context.Context, key string) error {
	if s.org == nil {
		return nil
	}
	found, err := s.org.OrganizationsByKeys(ctx, []string{key})
	if err != nil {
		return ErrOperationInternalError
	}
	if _, ok := found[key]; !ok {
		return ErrParticipantUnknownOrganization
	}
	return nil
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func dedupe(in []string, key func(string) string) []string {
	out := make([]string, 0, len(in))
	seen := make(map[string]bool, len(in))
	for _, raw := range in {
		v := strings.TrimSpace(raw)
		if v == "" || seen[key(v)] {
			continue
		}
		seen[key(v)] = true
		out = append(out, v)
	}
	return out
}

// normaliseAbbrevs trims, drops blanks and drops a repeat differing only by
// case, keeping the first spelling: abbrevs are compared case-insensitively
// everywhere they are read.
func normaliseAbbrevs(in []string) []string { return dedupe(in, strings.ToLower) }

// normaliseIDs trims, drops blanks and exact repeats. An id naming a record
// that no longer exists is kept, as platform's NormaliseIDs does.
// normaliseAcronym trims and upper-cases an operation acronym.
func normaliseAcronym(s string) string { return strings.ToUpper(strings.TrimSpace(s)) }

func normaliseIDs(in []string) []string { return dedupe(in, func(s string) string { return s }) }

// resolveStatus lowercases and trims; blank becomes the default.
func resolveStatus(v string) (string, error) {
	st := strings.ToLower(strings.TrimSpace(v))
	if st == "" {
		return defaultStatus, nil
	}
	if !slices.Contains(ValidStatuses, st) {
		return "", ErrOperationInvalidStatus
	}
	return st, nil
}

// parseDate parses YYYY-MM-DD; blank is nil.
func parseDate(v string) (*time.Time, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil, nil
	}
	t, err := time.Parse(DateFormat, v)
	if err != nil {
		return nil, ErrOperationInvalidDates
	}
	return &t, nil
}

func checkDateOrder(start, end *time.Time) error {
	if start != nil && end != nil && end.Before(*start) {
		return ErrOperationInvalidDates
	}
	return nil
}

func fmtDate(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format(DateFormat)
}

func fmtTime(t time.Time) string { return t.Format(time.RFC3339) }

func toResponse(o *Operation) dto.OperationResponse {
	return dto.OperationResponse{
		ID:               o.ID,
		Name:             o.Name,
		Acronym:          o.Acronym,
		Status:           o.Status,
		StartDate:        fmtDate(o.StartDate),
		EndDate:          fmtDate(o.EndDate),
		Notes:            o.Notes,
		CreatedBy:        o.CreatedBy,
		UpdatedBy:        o.UpdatedBy,
		CreatedAt:        fmtTime(o.CreatedAt),
		UpdatedAt:        fmtTime(o.UpdatedAt),
		ParticipantCount: o.ParticipantCount,
		OpenRFICount:     o.OpenRFICount,
	}
}

// responseAssetPhases is the participant's asset_phases as the API shows it: one
// key per asset it brings, [] for one that sits in no phase, never null.
func responseAssetPhases(p *Participant) map[string][]string {
	out := map[string][]string{}
	for _, a := range participantAssets(p.PlatformIDs, p.EquipmentIDs, p.TransportIDs) {
		out[a] = nonNil(p.AssetPhases[a])
	}
	return out
}

func toParticipantResponse(p *Participant) dto.ParticipantResponse {
	return dto.ParticipantResponse{
		ID:              p.ID,
		OperationID:     p.OperationID,
		OrganizationKey: p.OrganizationKey,
		Organization: dto.OrgSummaryResponse{
			Key:        p.OrganizationKey,
			Name:       p.Organization.Name,
			ShortLabel: p.Organization.ShortLabel,
			Branch:     p.Organization.Branch,
			Color:      p.Organization.Color,
			Adhoc:      p.Organization.Adhoc,
		},
		EquipmentIDs:    nonNil(p.EquipmentIDs),
		PlatformIDs:     nonNil(p.PlatformIDs),
		WaveformAbbrevs: nonNil(p.WaveformAbbrevs),
		ServiceAbbrevs:  nonNil(p.ServiceAbbrevs),
		TransportIDs:    nonNil(p.TransportIDs),
		POCName:         p.POCName,
		POCPhone:        p.POCPhone,
		POCEmail:        p.POCEmail,
		Notes:           p.Notes,
		CreatedBy:       p.CreatedBy,
		UpdatedBy:       p.UpdatedBy,
		CreatedAt:       fmtTime(p.CreatedAt),
		UpdatedAt:       fmtTime(p.UpdatedAt),
		AssetPhases:     responseAssetPhases(p),
	}
}

// diffOperation reports changed fields in the {field: {old, new}} shape the
// audit log expects. Dates render as YYYY-MM-DD so a one-day move stays
// readable.
func diffOperation(old, updated *Operation) map[string]any {
	changes := map[string]any{}
	add := func(field, before, after string) {
		if before != after {
			changes[field] = map[string]any{"old": before, "new": after}
		}
	}
	add("name", old.Name, updated.Name)
	add("acronym", old.Acronym, updated.Acronym)
	add("status", old.Status, updated.Status)
	add("start_date", fmtDate(old.StartDate), fmtDate(updated.StartDate))
	add("end_date", fmtDate(old.EndDate), fmtDate(updated.EndDate))
	add("notes", old.Notes, updated.Notes)
	return changes
}

// diffParticipant covers the four lists and the contact fields. The lists are
// reported joined, so a reader of the log sees "L16" -> "L16, MADL".
func diffParticipant(old, updated *Participant) map[string]any {
	changes := map[string]any{}
	addStr := func(field, before, after string) {
		if before != after {
			changes[field] = map[string]any{"old": before, "new": after}
		}
	}
	addList := func(field string, before, after []string) {
		if !slices.Equal(nonNil(before), nonNil(after)) {
			changes[field] = map[string]any{
				"old": strings.Join(before, ", "),
				"new": strings.Join(after, ", "),
			}
		}
	}
	addList("platform_ids", old.PlatformIDs, updated.PlatformIDs)
	addList("equipment_ids", old.EquipmentIDs, updated.EquipmentIDs)
	addList("waveform_abbrevs", old.WaveformAbbrevs, updated.WaveformAbbrevs)
	addList("service_abbrevs", old.ServiceAbbrevs, updated.ServiceAbbrevs)
	addList("transport_ids", old.TransportIDs, updated.TransportIDs)
	addStr("poc_name", old.POCName, updated.POCName)
	addStr("poc_phone", old.POCPhone, updated.POCPhone)
	addStr("poc_email", old.POCEmail, updated.POCEmail)
	addStr("notes", old.Notes, updated.Notes)
	return changes
}

// errStatus reads the status off a domain error, so a caller can return the
// pair without restating which error maps to which code in a second place.
func errStatus(err error) int {
	var e *Error
	if errors.As(err, &e) {
		return e.Status
	}
	return http.StatusInternalServerError
}

// writeErr maps a repository failure: a coded error keeps its own status,
// anything else is an internal error.
func writeErr(err error) (int, error) {
	var e *Error
	if errors.As(err, &e) {
		return e.Status, e
	}
	return http.StatusInternalServerError, ErrOperationInternalError
}

func (s *Service) ListOperations(ctx context.Context, resp *dto.ListOperationsResponse) (int, error) {
	items, err := s.repo.FindAll(ctx)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	resp.Operations = make([]dto.OperationResponse, 0, len(items))
	for _, o := range items {
		resp.Operations = append(resp.Operations, toResponse(o))
	}
	resp.Total = len(resp.Operations)
	return http.StatusOK, nil
}

// findOperation reads an operation, mapping not found to a 404. A nil result
// with no error is treated as not found, so a repository double that returns
// nothing cannot cause a nil dereference.
func (s *Service) findOperation(ctx context.Context, id string) (*Operation, int, error) {
	o, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, ErrOperationNotFound) {
			return nil, http.StatusNotFound, ErrOperationNotFound
		}
		return nil, http.StatusInternalServerError, ErrOperationInternalError
	}
	if o == nil {
		return nil, http.StatusNotFound, ErrOperationNotFound
	}
	return o, http.StatusOK, nil
}

func (s *Service) GetOperation(ctx context.Context, req *dto.GetOperationRequest, resp *dto.GetOperationResponse) (int, error) {
	o, status, err := s.findOperation(ctx, req.ID)
	if err != nil {
		return status, err
	}
	parts, err := s.repo.FindParticipants(ctx, req.ID)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	phases, err := s.repo.FindPhases(ctx, req.ID)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	if err := s.attachPlans(ctx, req.ID, phases); err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	resp.Phases = toPhaseResponses(phases)
	sites, err := s.repo.FindSites(ctx, req.ID)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	resp.Sites = toSiteResponses(sites)
	resp.Operation = toResponse(o)
	resp.Operation.ParticipantCount = len(parts)
	resp.Participants = make([]dto.ParticipantResponse, 0, len(parts))
	for _, p := range parts {
		resp.Participants = append(resp.Participants, toParticipantResponse(p))
	}
	return http.StatusOK, nil
}

func (s *Service) CreateOperation(ctx context.Context, req *dto.CreateOperationRequest, resp *dto.CreateOperationResponse) (int, error) {
	status, err := resolveStatus(req.Status)
	if err != nil {
		return http.StatusBadRequest, err
	}
	start, err := parseDate(req.StartDate)
	if err != nil {
		return http.StatusBadRequest, err
	}
	end, err := parseDate(req.EndDate)
	if err != nil {
		return http.StatusBadRequest, err
	}
	if err := checkDateOrder(start, end); err != nil {
		return http.StatusBadRequest, err
	}

	name := strings.TrimSpace(req.Name)
	exists, err := s.repo.NameExists(ctx, name)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	if exists {
		return http.StatusConflict, ErrOperationNameExists
	}

	now := time.Now().UTC()
	o := &Operation{
		Name:      name,
		Acronym:   normaliseAcronym(req.Acronym),
		Status:    status,
		StartDate: start,
		EndDate:   end,
		Notes:     strings.TrimSpace(req.Notes),
		CreatedBy: req.CreatedBy,
		UpdatedBy: req.UpdatedBy,
		CreatedAt: now,
		UpdatedAt: now,
		// Seeded in the repository's transaction with the operation itself.
		PhaseNames: slices.Clone(DefaultPhaseNames),
	}
	if err := s.repo.Create(ctx, o); err != nil {
		return writeErr(err)
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.CreatedBy,
		ResourceType: "operation",
		ResourceID:   o.ID,
		ResourceName: o.Name,
		Action:       "create",
	})

	resp.Operation = toResponse(o)
	return http.StatusCreated, nil
}

func (s *Service) UpdateOperation(ctx context.Context, req *dto.UpdateOperationRequest, resp *dto.UpdateOperationResponse) (int, error) {
	o, status, err := s.findOperation(ctx, req.ID)
	if err != nil {
		return status, err
	}

	// Copied before any field is touched: o is a pointer into the repo result
	// and every branch below mutates it in place.
	before := *o

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		exists, err := s.repo.NameExistsExcluding(ctx, name, req.ID)
		if err != nil {
			return http.StatusInternalServerError, ErrOperationInternalError
		}
		if exists {
			return http.StatusConflict, ErrOperationNameExists
		}
		o.Name = name
	}
	if req.Acronym != nil {
		o.Acronym = normaliseAcronym(*req.Acronym)
	}
	if req.Status != nil {
		st, err := resolveStatus(*req.Status)
		if err != nil {
			return http.StatusBadRequest, err
		}
		o.Status = st
	}
	if req.StartDate != nil {
		d, err := parseDate(*req.StartDate)
		if err != nil {
			return http.StatusBadRequest, err
		}
		o.StartDate = d
	}
	if req.EndDate != nil {
		d, err := parseDate(*req.EndDate)
		if err != nil {
			return http.StatusBadRequest, err
		}
		o.EndDate = d
	}
	if err := checkDateOrder(o.StartDate, o.EndDate); err != nil {
		return http.StatusBadRequest, err
	}
	if req.Notes != nil {
		o.Notes = strings.TrimSpace(*req.Notes)
	}

	changes := diffOperation(&before, o)
	if len(changes) == 0 {
		resp.Operation = toResponse(o)
		return http.StatusOK, nil
	}

	o.UpdatedBy = req.UpdatedBy
	o.UpdatedAt = time.Now().UTC()
	if err := s.repo.Update(ctx, o); err != nil {
		return writeErr(err)
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "operation",
		ResourceID:   o.ID,
		ResourceName: o.Name,
		Action:       "update",
		Changes:      changes,
	})

	resp.Operation = toResponse(o)
	return http.StatusOK, nil
}

func (s *Service) DeleteOperation(ctx context.Context, req *dto.DeleteOperationRequest) (int, error) {
	// Read first: a delete of something that never existed should 404, and the
	// audit event needs the name, which is gone once the row is.
	existing, status, err := s.findOperation(ctx, req.ID)
	if err != nil {
		return status, err
	}
	if err := s.repo.Delete(ctx, req.ID); err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "operation",
		ResourceID:   existing.ID,
		ResourceName: existing.Name,
		Action:       "delete",
	})
	return http.StatusNoContent, nil
}

// findParticipant reads one check-in; (nil, nil) means not checked in.
func (s *Service) findParticipant(ctx context.Context, operationID, orgKey string) (*Participant, error) {
	p, err := s.repo.FindParticipant(ctx, operationID, orgKey)
	if err != nil {
		if errors.Is(err, ErrParticipantNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return p, nil
}

func normaliseOrgKey(v string) string { return strings.ToLower(strings.TrimSpace(v)) }

func (s *Service) GetParticipant(ctx context.Context, req *dto.GetParticipantRequest, resp *dto.GetParticipantResponse) (int, error) {
	p, err := s.findParticipant(ctx, req.OperationID, normaliseOrgKey(req.OrganizationKey))
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	if p == nil {
		return http.StatusNotFound, ErrParticipantNotFound
	}
	resp.Participant = toParticipantResponse(p)
	return http.StatusOK, nil
}

// SaveParticipant is an upsert keyed by (operation, organization): 201 when the
// organization was not yet checked in, 200 when an existing check-in was
// replaced. A save that changes nothing writes nothing and records nothing.
func (s *Service) SaveParticipant(ctx context.Context, req *dto.SaveParticipantRequest, resp *dto.SaveParticipantResponse) (int, error) {
	op, status, err := s.findOperation(ctx, req.OperationID)
	if err != nil {
		return status, err
	}

	orgKey := normaliseOrgKey(req.OrganizationKey)
	if err := s.checkOrganization(ctx, orgKey); err != nil {
		return errStatus(err), err
	}
	abbrevs := normaliseAbbrevs(req.WaveformAbbrevs)
	if err := s.checkWaveforms(ctx, abbrevs); err != nil {
		return errStatus(err), err
	}

	existing, err := s.findParticipant(ctx, req.OperationID, orgKey)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}

	// A client that names the version it read must still be looking at it. When
	// the row is gone entirely the version it read no longer exists either.
	if expected := strings.TrimSpace(req.ExpectedUpdatedAt); expected != "" {
		if existing == nil || expected != fmtTime(existing.UpdatedAt) {
			return http.StatusConflict, ErrParticipantStale
		}
	}

	next := &Participant{
		OperationID:     req.OperationID,
		OrganizationKey: orgKey,
		EquipmentIDs:    normaliseIDs(req.EquipmentIDs),
		PlatformIDs:     normaliseIDs(req.PlatformIDs),
		WaveformAbbrevs: abbrevs,
		ServiceAbbrevs:  normaliseAbbrevs(req.ServiceAbbrevs),
		TransportIDs:    normaliseIDs(req.TransportIDs),
		POCName:         strings.TrimSpace(req.POCName),
		POCPhone:        strings.TrimSpace(req.POCPhone),
		POCEmail:        strings.TrimSpace(req.POCEmail),
		Notes:           strings.TrimSpace(req.Notes),
		UpdatedBy:       req.UpdatedBy,
	}

	phases, err := s.resolveAssetPhases(ctx, next, existing, req.AssetPhases)
	if err != nil {
		return errStatus(err), err
	}

	now := time.Now().UTC()

	if existing == nil {
		next.CreatedBy = req.UpdatedBy
		next.CreatedAt = now
		next.UpdatedAt = now
		if err := s.repo.CreateParticipant(ctx, next); err != nil {
			return writeErr(err)
		}
		s.fillSummary(ctx, next)

		s.recordAudit(ctx, contracts.AuditEventInput{
			ActorID:      req.ActorID,
			ActorName:    req.UpdatedBy,
			ResourceType: "operation_participant",
			ResourceID:   next.ID,
			ResourceName: participantLabel(op, next),
			Action:       "create",
		})
		resp.Participant = toParticipantResponse(next)
		return http.StatusCreated, nil
	}

	changes := diffParticipant(existing, next)
	diffAssetPhases(changes, existing.AssetPhases, next.AssetPhases, phases)
	if len(changes) == 0 {
		resp.Participant = toParticipantResponse(existing)
		return http.StatusOK, nil
	}

	next.ID = existing.ID
	next.Organization = existing.Organization
	next.CreatedBy = existing.CreatedBy
	next.CreatedAt = existing.CreatedAt
	next.UpdatedAt = now
	if err := s.repo.UpdateParticipant(ctx, next); err != nil {
		return writeErr(err)
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "operation_participant",
		ResourceID:   next.ID,
		ResourceName: participantLabel(op, next),
		Action:       "update",
		Changes:      changes,
	})
	resp.Participant = toParticipantResponse(next)
	return http.StatusOK, nil
}

// resolveAssetPhases validates a sent asset_phases map against the check-in's
// own lists as they will be after this write and the operation's phases, then
// sets next.AssetPhases to the map to store. before is the stored check-in, nil
// on a first save. It returns the operation's phases for the audit diff.
func (s *Service) resolveAssetPhases(ctx context.Context, next, before *Participant, sent map[string][]string) ([]*Phase, error) {
	phases, err := s.repo.FindPhases(ctx, next.OperationID)
	if err != nil {
		return nil, ErrOperationInternalError
	}
	after := participantAssets(next.PlatformIDs, next.EquipmentIDs, next.TransportIDs)
	if sent != nil {
		if err := checkAssetPhases(sent, after, phases); err != nil {
			return nil, err
		}
	}
	var wasBrought []string
	var previous map[string][]string
	if before != nil {
		wasBrought = participantAssets(before.PlatformIDs, before.EquipmentIDs, before.TransportIDs)
		previous = before.AssetPhases
	}
	next.AssetPhases = resolveAssetPhases(after, wasBrought, previous, sent, phases)
	return phases, nil
}

// fillSummary reads the organization's display fields for a freshly created
// check-in, so the response carries them without a second request. A lookup
// that is not wired or fails leaves the summary at its key only: the write
// already succeeded and the next read joins it in.
func (s *Service) fillSummary(ctx context.Context, p *Participant) {
	p.Organization = OrgSummary{Key: p.OrganizationKey}
	if s.org == nil {
		return
	}
	found, err := s.org.OrganizationsByKeys(ctx, []string{p.OrganizationKey})
	if err != nil {
		return
	}
	if info, ok := found[p.OrganizationKey]; ok {
		p.Organization = OrgSummary{Key: info.Key, Name: info.Name, ShortLabel: info.ShortLabel, Branch: info.Branch, Color: info.Color}
	}
}

// participantLabel is the audit log's resource name: the operation and the
// organization it concerns, since the check-in has no name of its own.
func participantLabel(op *Operation, p *Participant) string {
	org := p.Organization.Name
	if org == "" {
		org = p.OrganizationKey
	}
	if org == "" {
		org = p.AdhocName
	}
	return op.Name + " - " + org
}

func (s *Service) DeleteParticipant(ctx context.Context, req *dto.DeleteParticipantRequest) (int, error) {
	orgKey := normaliseOrgKey(req.OrganizationKey)
	existing, err := s.findParticipant(ctx, req.OperationID, orgKey)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	if existing == nil {
		return http.StatusNotFound, ErrParticipantNotFound
	}
	op, status, err := s.findOperation(ctx, req.OperationID)
	if err != nil {
		return status, err
	}

	if err := s.repo.DeleteParticipant(ctx, req.OperationID, orgKey); err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "operation_participant",
		ResourceID:   existing.ID,
		ResourceName: participantLabel(op, existing),
		Action:       "delete",
	})
	return http.StatusNoContent, nil
}

// OperationsUsingOrganization satisfies contracts.OrganizationUsage: the names
// of the operations an organization is checked in to.
func (s *Service) OperationsUsingOrganization(ctx context.Context, key string) ([]string, error) {
	return s.repo.OperationsUsingOrganization(ctx, key)
}

// adhocSummary is the synthesised summary of an "Other" organization.
func adhocSummary(p *Participant) OrgSummary {
	return OrgSummary{
		Name: p.AdhocName, ShortLabel: p.AdhocShortLabel,
		Branch: p.AdhocBranch, Color: p.AdhocColor, Adhoc: true,
	}
}

// CreateParticipant checks an organization in by naming either a library
// organization or an ad hoc one. Unlike SaveParticipant it never upserts: a
// second check-in of the same identity is a conflict.
func (s *Service) CreateParticipant(ctx context.Context, req *dto.CreateParticipantRequest, resp *dto.CreateParticipantResponse) (int, error) {
	op, status, err := s.findOperation(ctx, req.OperationID)
	if err != nil {
		return status, err
	}

	orgKey := normaliseOrgKey(req.OrganizationKey)
	if (orgKey == "") == (req.Adhoc == nil) {
		return http.StatusBadRequest, ErrParticipantIdentityRequired
	}

	next := &Participant{
		OperationID:     req.OperationID,
		OrganizationKey: orgKey,
		EquipmentIDs:    normaliseIDs(req.EquipmentIDs),
		PlatformIDs:     normaliseIDs(req.PlatformIDs),
		WaveformAbbrevs: normaliseAbbrevs(req.WaveformAbbrevs),
		ServiceAbbrevs:  normaliseAbbrevs(req.ServiceAbbrevs),
		TransportIDs:    normaliseIDs(req.TransportIDs),
		POCName:         strings.TrimSpace(req.POCName),
		POCPhone:        strings.TrimSpace(req.POCPhone),
		POCEmail:        strings.TrimSpace(req.POCEmail),
		Notes:           strings.TrimSpace(req.Notes),
		CreatedBy:       req.UpdatedBy,
		UpdatedBy:       req.UpdatedBy,
	}

	if req.Adhoc != nil {
		name := strings.TrimSpace(req.Adhoc.Name)
		if name == "" {
			return http.StatusBadRequest, ErrParticipantIdentityRequired
		}
		next.AdhocName = name
		next.AdhocShortLabel = strings.TrimSpace(req.Adhoc.ShortLabel)
		next.AdhocColor = strings.TrimSpace(req.Adhoc.Color)
		if b := strings.TrimSpace(req.Adhoc.Branch); b != "" {
			canon, ok := branch.NormaliseOne(b)
			if !ok {
				return http.StatusBadRequest, ErrParticipantInvalidBranch
			}
			next.AdhocBranch = canon
		}
	} else if err := s.checkOrganization(ctx, orgKey); err != nil {
		return errStatus(err), err
	}
	if err := s.checkWaveforms(ctx, next.WaveformAbbrevs); err != nil {
		return errStatus(err), err
	}
	if _, err := s.resolveAssetPhases(ctx, next, nil, req.AssetPhases); err != nil {
		return errStatus(err), err
	}

	now := time.Now().UTC()
	next.CreatedAt = now
	next.UpdatedAt = now
	if err := s.repo.CreateParticipant(ctx, next); err != nil {
		return writeErr(err)
	}
	if req.Adhoc != nil {
		next.Organization = adhocSummary(next)
	} else {
		s.fillSummary(ctx, next)
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "operation_participant",
		ResourceID:   next.ID,
		ResourceName: participantLabel(op, next),
		Action:       "create",
	})
	resp.Participant = toParticipantResponse(next)
	return http.StatusCreated, nil
}

// findParticipantByID reads one check-in by its own id; (nil, nil) means no
// such row.
func (s *Service) findParticipantByID(ctx context.Context, operationID, participantID string) (*Participant, error) {
	p, err := s.repo.FindParticipantByID(ctx, operationID, participantID)
	if err != nil {
		if errors.Is(err, ErrParticipantNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return p, nil
}

// UpdateParticipantByID replaces the lists and contact fields of one check-in,
// addressed by its id. A change-free save writes and records nothing.
func (s *Service) UpdateParticipantByID(ctx context.Context, req *dto.UpdateParticipantByIDRequest, resp *dto.UpdateParticipantByIDResponse) (int, error) {
	op, status, err := s.findOperation(ctx, req.OperationID)
	if err != nil {
		return status, err
	}
	abbrevs := normaliseAbbrevs(req.WaveformAbbrevs)
	if err := s.checkWaveforms(ctx, abbrevs); err != nil {
		return errStatus(err), err
	}

	existing, err := s.findParticipantByID(ctx, req.OperationID, req.ParticipantID)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	if existing == nil {
		// A client holding a version of a row that is gone is stale, as in the
		// keyed save; one that names no version simply has the wrong id.
		if strings.TrimSpace(req.ExpectedUpdatedAt) != "" {
			return http.StatusConflict, ErrParticipantStale
		}
		return http.StatusNotFound, ErrParticipantNotFound
	}
	if expected := strings.TrimSpace(req.ExpectedUpdatedAt); expected != "" && expected != fmtTime(existing.UpdatedAt) {
		return http.StatusConflict, ErrParticipantStale
	}

	next := *existing
	next.EquipmentIDs = normaliseIDs(req.EquipmentIDs)
	next.PlatformIDs = normaliseIDs(req.PlatformIDs)
	next.WaveformAbbrevs = abbrevs
	next.ServiceAbbrevs = normaliseAbbrevs(req.ServiceAbbrevs)
	next.TransportIDs = normaliseIDs(req.TransportIDs)
	next.POCName = strings.TrimSpace(req.POCName)
	next.POCPhone = strings.TrimSpace(req.POCPhone)
	next.POCEmail = strings.TrimSpace(req.POCEmail)
	next.Notes = strings.TrimSpace(req.Notes)
	next.UpdatedBy = req.UpdatedBy

	phases, err := s.resolveAssetPhases(ctx, &next, existing, req.AssetPhases)
	if err != nil {
		return errStatus(err), err
	}

	changes := diffParticipant(existing, &next)
	diffAssetPhases(changes, existing.AssetPhases, next.AssetPhases, phases)
	if len(changes) == 0 {
		resp.Participant = toParticipantResponse(existing)
		return http.StatusOK, nil
	}

	next.UpdatedAt = time.Now().UTC()
	if err := s.repo.UpdateParticipant(ctx, &next); err != nil {
		return writeErr(err)
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "operation_participant",
		ResourceID:   next.ID,
		ResourceName: participantLabel(op, &next),
		Action:       "update",
		Changes:      changes,
	})
	resp.Participant = toParticipantResponse(&next)
	return http.StatusOK, nil
}

func (s *Service) DeleteParticipantByID(ctx context.Context, req *dto.DeleteParticipantByIDRequest) (int, error) {
	existing, err := s.findParticipantByID(ctx, req.OperationID, req.ParticipantID)
	if err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}
	if existing == nil {
		return http.StatusNotFound, ErrParticipantNotFound
	}
	op, status, err := s.findOperation(ctx, req.OperationID)
	if err != nil {
		return status, err
	}

	if err := s.repo.DeleteParticipantByID(ctx, req.OperationID, req.ParticipantID); err != nil {
		return http.StatusInternalServerError, ErrOperationInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "operation_participant",
		ResourceID:   existing.ID,
		ResourceName: participantLabel(op, existing),
		Action:       "delete",
	})
	return http.StatusNoContent, nil
}

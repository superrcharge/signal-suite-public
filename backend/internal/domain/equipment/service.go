package equipment

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"backend/internal/domain/equipment/dto"
	"backend/internal/shared/contracts"
)

const timeFmt = time.RFC3339

func toResponse(e *Equipment) dto.EquipmentResponse {
	modes := e.OperationalMode
	if modes == nil {
		modes = []string{}
	}
	data := e.Data
	if len(data) == 0 {
		data = json.RawMessage("{}")
	}
	return dto.EquipmentResponse{
		ID:              e.ID,
		Nomenclature:    e.Nomenclature,
		Nickname:        e.Nickname,
		OneLiner:        e.OneLiner,
		DocNumber:       e.DocNumber,
		PhotoURL:        e.PhotoURL,
		Make:            e.Make,
		TerminalType:    e.TerminalType,
		OperationalMode: modes,
		Data:            data,
		CreatedBy:       e.CreatedBy,
		UpdatedBy:       e.UpdatedBy,
		CreatedAt:       e.CreatedAt.UTC().Format(timeFmt),
		UpdatedAt:       e.UpdatedAt.UTC().Format(timeFmt),
	}
}

// BlobStore is the subset of the blob client the service needs to keep photo
// storage in step with the catalog. Satisfied by *blob.Client.
type BlobStore interface {
	Delete(ctx context.Context, blobName string) error
	BlobNameFromURL(rawURL string) (string, error)
}

type Service struct {
	repo  Repository
	audit contracts.AuditRecorder
	blobs BlobStore
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) SetAudit(a contracts.AuditRecorder) {
	s.audit = a
}

// SetBlobStore injects the photo store. Setter injection mirrors SetAudit;
// nil means blob storage is not configured and photo cleanup is skipped.
func (s *Service) SetBlobStore(b BlobStore) {
	s.blobs = b
}

// deleteBlobByURL removes the blob a photo URL points at. Returns nil when
// there is nothing to do: no store configured, no URL, or a URL that belongs
// to some other container (legacy or migrated data must not block a delete).
func (s *Service) deleteBlobByURL(ctx context.Context, rawURL string) error {
	if s.blobs == nil || rawURL == "" {
		return nil
	}
	name, err := s.blobs.BlobNameFromURL(rawURL)
	if err != nil {
		log.Printf("warning: equipment photo %q is not in the configured container, skipping delete: %v", rawURL, err)
		return nil
	}
	return s.blobs.Delete(ctx, name)
}

func (s *Service) recordAudit(ctx context.Context, in contracts.AuditEventInput) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, in)
}

func (s *Service) ListEquipment(ctx context.Context, req *dto.ListEquipmentRequest, resp *dto.ListEquipmentResponse) (int, error) {
	items, err := s.repo.FindAll(ctx, req.TerminalType, req.Search)
	if err != nil {
		return http.StatusInternalServerError, ErrEquipmentInternalError
	}
	out := make([]dto.EquipmentResponse, 0, len(items))
	for _, e := range items {
		out = append(out, toResponse(e))
	}
	resp.Equipment = out
	resp.Total = len(out)
	return http.StatusOK, nil
}

func (s *Service) GetEquipment(ctx context.Context, req *dto.GetEquipmentRequest, resp *dto.GetEquipmentResponse) (int, error) {
	e, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if err == ErrEquipmentNotFound {
			return http.StatusNotFound, ErrEquipmentNotFound
		}
		return http.StatusInternalServerError, ErrEquipmentInternalError
	}
	resp.Equipment = toResponse(e)
	return http.StatusOK, nil
}

func (s *Service) CreateEquipment(ctx context.Context, req *dto.CreateEquipmentRequest, resp *dto.CreateEquipmentResponse) (int, error) {
	// A scoped radio writer may only introduce radio records.
	if req.ActorRadioOnly && req.TerminalType != TerminalTypeRadio {
		return ErrRadioScopeOnly.Status, ErrRadioScopeOnly
	}

	id := strings.ToLower(strings.TrimSpace(req.ID))

	exists, err := s.repo.ExistsID(ctx, id)
	if err != nil {
		return http.StatusInternalServerError, ErrEquipmentInternalError
	}
	if exists {
		return http.StatusConflict, ErrEquipmentIDExists
	}

	data := req.Data
	if len(data) == 0 {
		data = json.RawMessage("{}")
	}

	modes := req.OperationalMode
	if modes == nil {
		modes = []string{}
	}

	now := time.Now().UTC()
	e := &Equipment{
		ID:              id,
		Nomenclature:    req.Nomenclature,
		Nickname:        req.Nickname,
		OneLiner:        req.OneLiner,
		DocNumber:       req.DocNumber,
		PhotoURL:        req.PhotoURL,
		Make:            req.Make,
		TerminalType:    req.TerminalType,
		OperationalMode: modes,
		Data:            data,
		CreatedBy:       req.CreatedBy,
		UpdatedBy:       req.UpdatedBy,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if err := s.repo.Create(ctx, e); err != nil {
		return http.StatusInternalServerError, ErrEquipmentInternalError
	}

	resp.Equipment = toResponse(e)

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "equipment",
		ResourceID:   e.ID,
		ResourceName: e.Nomenclature,
		Action:       "create",
	})

	return http.StatusCreated, nil
}

// diffEquipment reports changed fields in the {field: {old, new}} shape the
// audit log expects. UpdatedBy and UpdatedAt are skipped: they change on every
// write and would drown the real diff.
//
// Before this existed, equipment updates recorded an event with no Changes at
// all, so the log said someone edited a catalogue entry without saying what.
func diffEquipment(old, updated *Equipment) map[string]any {
	changes := map[string]any{}

	addStr := func(field, before, after string) {
		if before != after {
			changes[field] = map[string]any{"old": before, "new": after}
		}
	}

	// NULL and "" are different in the column but identical to a reader, so both
	// render as empty rather than as a change nobody made.
	addPtr := func(field string, before, after *string) {
		b, a := "", ""
		if before != nil {
			b = *before
		}
		if after != nil {
			a = *after
		}
		addStr(field, b, a)
	}

	addStr("nomenclature", old.Nomenclature, updated.Nomenclature)
	addPtr("nickname", old.Nickname, updated.Nickname)
	addPtr("one_liner", old.OneLiner, updated.OneLiner)
	addPtr("doc_number", old.DocNumber, updated.DocNumber)
	addPtr("photo_url", old.PhotoURL, updated.PhotoURL)
	addPtr("make", old.Make, updated.Make)
	addStr("terminal_type", old.TerminalType, updated.TerminalType)
	addStr("operational_mode",
		strings.Join(old.OperationalMode, ", "),
		strings.Join(updated.OperationalMode, ", "))

	// Data is the spec sheet: a JSON document of dozens of nested keys whose
	// structural diff belongs in the datasheet view, not a one-line audit entry.
	// Recorded as moved-or-not, which is what a reader can act on here.
	if string(old.Data) != string(updated.Data) {
		changes["data"] = map[string]any{"old": "spec sheet", "new": "spec sheet (edited)"}
	}

	return changes
}

func (s *Service) UpdateEquipment(ctx context.Context, req *dto.UpdateEquipmentRequest, resp *dto.UpdateEquipmentResponse) (int, error) {
	e, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if err == ErrEquipmentNotFound {
			return http.StatusNotFound, ErrEquipmentNotFound
		}
		return http.StatusInternalServerError, ErrEquipmentInternalError
	}

	// Copied before any field is touched: e is a pointer into the repo result and
	// every branch below mutates it in place, so a diff taken afterwards would
	// compare the row to itself and report no changes.
	before := *e

	// A scoped radio writer may only touch radio records, and may not move one
	// across the boundary. Both halves matter: without the second check, an rto
	// caller could flip a record to satcom and keep editing it from then on.
	if req.ActorRadioOnly {
		if e.TerminalType != TerminalTypeRadio {
			return ErrRadioScopeOnly.Status, ErrRadioScopeOnly
		}
		if req.TerminalType != nil && *req.TerminalType != TerminalTypeRadio {
			return ErrRadioScopeOnly.Status, ErrRadioScopeOnly
		}
	}

	// Captured before mutation so a superseded photo can be cleaned up once the
	// row is safely updated.
	var supersededPhoto string
	if e.PhotoURL != nil {
		supersededPhoto = *e.PhotoURL
	}

	if req.Nomenclature != nil {
		e.Nomenclature = *req.Nomenclature
	}
	if req.Nickname != nil {
		e.Nickname = req.Nickname
	}
	if req.OneLiner != nil {
		e.OneLiner = req.OneLiner
	}
	if req.DocNumber != nil {
		e.DocNumber = req.DocNumber
	}
	if req.PhotoURL != nil {
		e.PhotoURL = req.PhotoURL
	}
	if req.Make != nil {
		e.Make = req.Make
	}
	if req.TerminalType != nil {
		e.TerminalType = *req.TerminalType
	}
	if req.OperationalMode != nil {
		e.OperationalMode = req.OperationalMode
	}
	if len(req.Data) > 0 {
		e.Data = req.Data
	}

	e.UpdatedBy = req.UpdatedBy
	e.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, e); err != nil {
		return http.StatusInternalServerError, ErrEquipmentInternalError
	}

	// The photo was replaced, so the previous blob is now unreferenced. Guarded
	// on an actual change because this is the generic edit path - without the
	// comparison, renaming a nickname would delete the photo. Best effort: the
	// caller's update already committed and must not fail over a stale
	// predecessor.
	if req.PhotoURL != nil && supersededPhoto != "" && *req.PhotoURL != supersededPhoto {
		if err := s.deleteBlobByURL(ctx, supersededPhoto); err != nil {
			log.Printf("warning: equipment %s: superseded photo not deleted, now orphaned: %v", e.ID, err)
		}
	}

	resp.Equipment = toResponse(e)

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.UpdatedBy,
		ResourceType: "equipment",
		ResourceID:   e.ID,
		ResourceName: e.Nomenclature,
		Action:       "update",
		Changes:      diffEquipment(&before, e),
	})

	return http.StatusOK, nil
}

func (s *Service) DeleteEquipment(ctx context.Context, req *dto.DeleteEquipmentRequest, _ *struct{}) (int, error) {
	e, err := s.repo.FindByID(ctx, req.ID)
	if err != nil {
		if err == ErrEquipmentNotFound {
			return http.StatusNotFound, ErrEquipmentNotFound
		}
		return http.StatusInternalServerError, ErrEquipmentInternalError
	}

	// A scoped radio writer may only delete radio records.
	if req.ActorRadioOnly && e.TerminalType != TerminalTypeRadio {
		return ErrRadioScopeOnly.Status, ErrRadioScopeOnly
	}

	// Remove the photo before the row. The row holds the only reference to the
	// blob, so deleting it first would strand the object with nothing left to
	// locate it by. Blob-first fails safe: the record survives pointing at a
	// missing image, and a retry converges because Delete treats an absent
	// blob as success.
	if e.PhotoURL != nil {
		if err := s.deleteBlobByURL(ctx, *e.PhotoURL); err != nil {
			log.Printf("error: equipment %s: photo delete failed, keeping record: %v", req.ID, err)
			return http.StatusInternalServerError, ErrEquipmentInternalError
		}
	}

	if err := s.repo.Delete(ctx, req.ID); err != nil {
		return http.StatusInternalServerError, ErrEquipmentInternalError
	}

	s.recordAudit(ctx, contracts.AuditEventInput{
		ActorID:      req.ActorID,
		ActorName:    req.ActorName,
		ResourceType: "equipment",
		ResourceID:   req.ID,
		ResourceName: e.Nomenclature,
		Action:       "delete",
	})

	return http.StatusNoContent, nil
}

// WaveformUsage and RenameWaveform satisfy contracts.WaveformAssets, letting the
// waveform library refuse a delete that would strand an abbrev on a catalog
// record, and carry a rename to the records naming it.
//
// Pass-throughs: the rule lives in SQL, where it can be applied to every row in
// one statement. Putting it here would mean loading the catalog into Go to edit
// a string, and the JSONB document is exactly the thing that should not make a
// round trip to be rewritten.
func (s *Service) WaveformUsage(ctx context.Context) (map[string][]string, error) {
	return s.repo.WaveformUsage(ctx)
}

func (s *Service) RenameWaveform(ctx context.Context, from, to string) (int, error) {
	return s.repo.RenameWaveform(ctx, from, to)
}

// ServiceUsage satisfies contracts.ServiceAssets. Same pass-through shape and
// same reasoning as WaveformUsage: the rule belongs in SQL.
func (s *Service) ServiceUsage(ctx context.Context) (map[string][]string, error) {
	return s.repo.ServiceUsage(ctx)
}

package equipment

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"backend/internal/domain/equipment/dto"
	"backend/internal/middleware"
	"backend/internal/shared/csvtable"
	"backend/internal/shared/csvtable/csvhttp"
	"backend/internal/shared/response"
	"backend/internal/shared/validator"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

// PhotoStore is the blob surface the handler needs. Satisfied by *blob.Client.
// An interface rather than the concrete client so the upload failure paths can
// be tested without Azure.
type PhotoStore interface {
	UploadStream(ctx context.Context, blobName, contentType string, r io.Reader) (string, error)
	Download(ctx context.Context, blobName string) (io.ReadCloser, string, error)
	Delete(ctx context.Context, blobName string) error
	BlobNameFromURL(rawURL string) (string, error)
}

type Handler struct {
	service   *Service
	validator *validator.Validator
	blob      PhotoStore // nil when blob storage is not configured
}

func NewHandler(service *Service, validator *validator.Validator, blob PhotoStore) *Handler {
	return &Handler{service: service, validator: validator, blob: blob}
}

func currentUserName(c fiber.Ctx) string {
	u := middleware.GetCurrentUser(c)
	if u == nil {
		return ""
	}
	return u.GetName()
}

func currentUserID(c fiber.Ctx) string {
	u := middleware.GetCurrentUser(c)
	if u == nil {
		return ""
	}
	return u.GetID()
}

// Role names are duplicated here rather than imported from the user domain:
// domains do not depend on one another (see internal/shared/contracts).
// TestRoleNamesMatchUserDomain keeps them honest.
const (
	roleAdmin  = "admin"
	roleEditor = "editor"
	roleRTO    = "rto"
)

// actorRadioOnly reports whether the caller may write radio equipment only.
// The rto role is a scoped writer, so it is restricted - but holding admin
// or editor alongside it lifts the restriction, since those write everything.
// Returns false when no user is attached, which happens with auth disabled
// in local dev; the route gate is the control in that configuration.
func actorRadioOnly(c fiber.Ctx) bool {
	u := middleware.GetCurrentUser(c)
	if u == nil {
		return false
	}
	if u.HasRole(roleAdmin) || u.HasRole(roleEditor) {
		return false
	}
	return u.HasRole(roleRTO)
}

func (h *Handler) ListEquipment(c fiber.Ctx) error {
	req := &dto.ListEquipmentRequest{
		TerminalType: c.Query("type"),
		Search:       c.Query("search"),
	}
	resp := &dto.ListEquipmentResponse{}
	status, err := h.service.ListEquipment(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) GetEquipment(c fiber.Ctx) error {
	req := &dto.GetEquipmentRequest{ID: c.Params("id")}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	resp := &dto.GetEquipmentResponse{}
	status, err := h.service.GetEquipment(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) CreateEquipment(c fiber.Ctx) error {
	req := &dto.CreateEquipmentRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.CreatedBy = currentUserName(c)
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)
	req.ActorRadioOnly = actorRadioOnly(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	resp := &dto.CreateEquipmentResponse{}
	status, err := h.service.CreateEquipment(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) UpdateEquipment(c fiber.Ctx) error {
	req := &dto.UpdateEquipmentRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.ID = c.Params("id")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)
	req.ActorRadioOnly = actorRadioOnly(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	resp := &dto.UpdateEquipmentResponse{}
	status, err := h.service.UpdateEquipment(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) DeleteEquipment(c fiber.Ctx) error {
	req := &dto.DeleteEquipmentRequest{
		ID:             c.Params("id"),
		ActorID:        currentUserID(c),
		ActorName:      currentUserName(c),
		ActorRadioOnly: actorRadioOnly(c),
	}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	status, err := h.service.DeleteEquipment(c.Context(), req, nil)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.SendStatus(status)
}

var allowedPhotoTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

func (h *Handler) UploadPhoto(c fiber.Ctx) error {
	if h.blob == nil {
		return c.Status(http.StatusNotImplemented).JSON(response.Err(errors.New("blob storage not configured")))
	}

	id := c.Params("id")

	// Verify the equipment record exists before touching blob storage.
	// Without this check, a bad ID would orphan the uploaded blob.
	existing := &dto.GetEquipmentResponse{}
	if status, err := h.service.GetEquipment(c.Context(), &dto.GetEquipmentRequest{ID: id}, existing); err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	// Reject a scoped radio writer here rather than letting UpdateEquipment
	// catch it below, so an upload that can never be persisted is not sent to
	// blob storage only to be deleted again on the failure path.
	if actorRadioOnly(c) && existing.Equipment.TerminalType != TerminalTypeRadio {
		return c.Status(ErrRadioScopeOnly.Status).JSON(response.Err(ErrRadioScopeOnly))
	}

	fh, err := c.FormFile("photo")
	if err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(errors.New("field 'photo' required")))
	}

	ct := fh.Header.Get("Content-Type")
	ext, ok := allowedPhotoTypes[ct]
	if !ok {
		// Fall back to file extension when browser omits Content-Type
		ext = strings.ToLower(filepath.Ext(fh.Filename))
		switch ext {
		case ".jpg", ".jpeg":
			ct, ext = "image/jpeg", ".jpg"
		case ".png":
			ct = "image/png"
		case ".webp":
			ct = "image/webp"
		default:
			return c.Status(http.StatusBadRequest).JSON(response.Err(errors.New("unsupported image type; use JPEG, PNG, or WebP")))
		}
	}

	f, err := fh.Open()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(response.Err(err))
	}
	defer func() { _ = f.Close() }()

	blobName := fmt.Sprintf("%s/%s%s", id, uuid.New().String(), ext)
	url, err := h.blob.UploadStream(c.Context(), blobName, ct, f)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(response.Err(err))
	}

	// Persist the new URL on the equipment record
	updateReq := &dto.UpdateEquipmentRequest{
		ID:             id,
		PhotoURL:       &url,
		UpdatedBy:      currentUserName(c),
		ActorID:        currentUserID(c),
		ActorRadioOnly: actorRadioOnly(c),
	}
	if status, err := h.service.UpdateEquipment(c.Context(), updateReq, &dto.UpdateEquipmentResponse{}); err != nil {
		// The row never took the new URL, so nothing references this upload.
		// Remove it rather than leaving a blob no code path can reach.
		if delErr := h.blob.Delete(c.Context(), blobName); delErr != nil {
			log.Printf("warning: equipment %s: failed photo update left orphan %q: %v", id, blobName, delErr)
		}
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(http.StatusOK).JSON(response.Success(map[string]string{"url": url}))
}

func (h *Handler) GetPhoto(c fiber.Ctx) error {
	if h.blob == nil {
		return c.Status(http.StatusNotImplemented).JSON(response.Err(errors.New("blob storage not configured")))
	}

	id := c.Params("id")
	eResp := &dto.GetEquipmentResponse{}
	if status, err := h.service.GetEquipment(c.Context(), &dto.GetEquipmentRequest{ID: id}, eResp); err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	if eResp.Equipment.PhotoURL == nil || *eResp.Equipment.PhotoURL == "" {
		return c.Status(http.StatusNotFound).JSON(response.Err(errors.New("no photo for this equipment record")))
	}

	blobName, err := h.blob.BlobNameFromURL(*eResp.Equipment.PhotoURL)
	if err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	reader, contentType, err := h.blob.Download(c.Context(), blobName)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(response.Err(err))
	}
	data, err := io.ReadAll(reader)
	_ = reader.Close()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(response.Err(err))
	}

	if contentType != "" {
		c.Set("Content-Type", contentType)
	}
	c.Set("Cache-Control", "private, max-age=3600")
	return c.Send(data)
}

// ExportEquipment returns the catalog as CSV, filtered the same way the list
// endpoint is. Read-only, so any authenticated user reaches it.
func (h *Handler) ExportEquipment(c fiber.Ctx) error {
	body, err := h.service.ExportEquipment(c.Context(),
		c.Query("terminal_type"), c.Query("search"),
		csvtable.ParseList(c.Query("columns")))
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	return csvhttp.SendCSV(c, csvTable.FilePrefix, body, time.Now())
}

// GetImportTemplate returns the import template, optionally narrowed to the
// columns the caller selected.
func (h *Handler) GetImportTemplate(c fiber.Ctx) error {
	body, err := h.service.GetImportTemplate(c.Context(), csvtable.ParseList(c.Query("columns")))
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	return csvhttp.SendTemplate(c, csvTable.FilePrefix, body)
}

// ImportEquipment bulk-creates catalog entries. The radio-only narrowing is
// passed through so a scoped writer cannot use CSV to introduce satcom records
// the drawer would refuse them.
func (h *Handler) ImportEquipment(c fiber.Ctx) error {
	var req csvhttp.ImportRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(ErrEquipmentInternalError))
	}
	if err := h.validator.Validate(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	status, parsed, err := h.service.ImportEquipment(c.Context(), req.CSV,
		currentUserName(c), actorRadioOnly(c))
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(
		csvhttp.BuildImportResponse(csvTable.Noun, csvTable.NounPlural, parsed)))
}

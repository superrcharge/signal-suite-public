package pace

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

	"backend/internal/domain/pace/dto"
	"backend/internal/middleware"
	"backend/internal/shared/csvtable"
	"backend/internal/shared/csvtable/csvhttp"
	"backend/internal/shared/response"
	"backend/internal/shared/validator"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

// EmblemStore is the blob surface this handler needs, mirroring
// equipment.PhotoStore. An interface rather than the concrete client so the
// upload failure paths can be tested without Azure.
type EmblemStore interface {
	UploadStream(ctx context.Context, blobName, contentType string, r io.Reader) (string, error)
	Download(ctx context.Context, blobName string) (io.ReadCloser, string, error)
	Delete(ctx context.Context, blobName string) error
	BlobNameFromURL(rawURL string) (string, error)
}

type Handler struct {
	service   *Service
	validator *validator.Validator
	blob      EmblemStore // nil when blob storage is not configured
}

func NewHandler(service *Service, v *validator.Validator, blob EmblemStore) *Handler {
	return &Handler{service: service, validator: v, blob: blob}
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

func (h *Handler) GetCard(c fiber.Ctx) error {
	req := &dto.GetCardRequest{Section: c.Params("section")}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.GetCardResponse{}
	status, err := h.service.GetCard(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) SaveCard(c fiber.Ctx) error {
	req := &dto.SaveCardRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}
	req.Section = c.Params("section")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.SaveCardResponse{}
	status, err := h.service.SaveCard(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

// The emblem accepts exactly what the equipment catalog accepts for photos.
var allowedEmblemTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

// GetEmblem streams the squadron emblem back through the API.
//
// The stored emblem_url is a raw blob URL, and the container is created with
// allowBlobPublicAccess false and publicAccess None, so a browser fetching that
// URL directly is refused and renders its broken-image glyph instead. The sheet
// used to do exactly that: it put the stored URL straight into an SVG <image
// href>, which is why an emblem uploaded successfully still came out looking
// like a missing file, whatever format it was.
//
// This mirrors equipment.GetPhoto, which is why catalog photos never had the
// problem: they are read through the API with the caller's token, not fetched
// from storage by the browser.
func (h *Handler) GetEmblem(c fiber.Ctx) error {
	if h.blob == nil {
		return c.Status(http.StatusNotImplemented).JSON(response.Err(errors.New("blob storage not configured")))
	}

	section := c.Params("section")

	resp := &dto.GetCardResponse{}
	if status, err := h.service.GetCard(c.Context(), &dto.GetCardRequest{Section: section}, resp); err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	stored := resp.Card.EmblemURL
	if stored == "" {
		// Not an error worth logging: a squadron with no emblem is the normal
		// case, and the sheet draws its generated placeholder instead.
		return c.Status(http.StatusNotFound).JSON(response.Err(errors.New("no emblem for this squadron")))
	}

	blobName, err := h.blob.BlobNameFromURL(stored)
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

// UploadEmblem stores one squadron emblem and points the card header at it.
//
// The emblem is uploaded on its own endpoint rather than as part of the card
// save, because the editor sends it the moment a file is chosen and the card
// draft never carries it.
func (h *Handler) UploadEmblem(c fiber.Ctx) error {
	if h.blob == nil {
		return c.Status(http.StatusNotImplemented).JSON(response.Err(errors.New("blob storage not configured")))
	}

	section := c.Params("section")

	fh, err := c.FormFile("emblem")
	if err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(errors.New("field 'emblem' required")))
	}

	ct := fh.Header.Get("Content-Type")
	ext, ok := allowedEmblemTypes[ct]
	if !ok {
		// Fall back to file extension when the browser omits Content-Type.
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

	// A fresh name every time: uploads never overwrite, so a failed persist can
	// be undone by deleting exactly what this request wrote.
	blobName := fmt.Sprintf("pace/%s/%s%s", section, uuid.New().String(), ext)
	url, err := h.blob.UploadStream(c.Context(), blobName, ct, f)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(response.Err(err))
	}

	if status, err := h.service.SetEmblem(c.Context(), section, url); err != nil {
		// The row never took the new URL, so nothing references this upload.
		// Remove it rather than leaving a blob no code path can reach.
		if delErr := h.blob.Delete(c.Context(), blobName); delErr != nil {
			log.Printf("warning: pace %s: failed emblem update left orphan %q: %v", section, blobName, delErr)
		}
		return c.Status(status).JSON(response.Err(err))
	}

	return c.Status(http.StatusOK).JSON(response.Success(map[string]string{"url": url}))
}

// DeleteEmblem clears the stored emblem and removes the blob behind it. The
// column is the only reference to that blob, so dropping it without the delete
// would strand the object permanently.
func (h *Handler) DeleteEmblem(c fiber.Ctx) error {
	if h.blob == nil {
		return c.Status(http.StatusNotImplemented).JSON(response.Err(errors.New("blob storage not configured")))
	}

	section := c.Params("section")

	// Read the current URL before clearing it: afterwards there is nothing left
	// to locate the blob by.
	existing := &dto.GetCardResponse{}
	if status, err := h.service.GetCard(c.Context(), &dto.GetCardRequest{Section: section}, existing); err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	stored := existing.Card.EmblemURL

	if status, err := h.service.ClearEmblem(c.Context(), section); err != nil {
		return c.Status(status).JSON(response.Err(err))
	}

	// Best effort, after the row has committed: a blob that outlives its
	// reference is wasteful, but failing the request would leave the caller
	// believing the emblem is still on the card when it is not.
	if stored != "" {
		if blobName, err := h.blob.BlobNameFromURL(stored); err != nil {
			log.Printf("warning: pace %s: emblem URL %q outside the container, blob left in place: %v", section, stored, err)
		} else if err := h.blob.Delete(c.Context(), blobName); err != nil {
			log.Printf("warning: pace %s: cleared emblem left orphan %q: %v", section, blobName, err)
		}
	}

	return c.SendStatus(http.StatusNoContent)
}

// ExportChannels returns one squadron's assigned wheel positions as CSV.
//
// Named channels rather than card: the file carries the wheel assignments only,
// not the frequency tables, the tmn rows, the tiers or the header. See the
// note on channelRow.
func (h *Handler) ExportChannels(c fiber.Ctx) error {
	section := c.Params("section")
	body, err := h.service.ExportChannels(c.Context(), section,
		csvtable.ParseList(c.Query("columns")))
	if err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}
	return csvhttp.SendCSV(c, csvTable.FilePrefix+"-"+section, body, time.Now())
}

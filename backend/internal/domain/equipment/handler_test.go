package equipment

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path"
	"slices"
	"testing"

	"backend/internal/middleware"
	"backend/internal/shared/contracts"

	"github.com/gofiber/fiber/v3"
)

const photoBase = "https://acct.blob.core.windows.net/equipment-photos/"

// mockPhotoStore records uploads and deletions so the upload failure path can
// be asserted without Azure.
type mockPhotoStore struct {
	uploaded []string
	deleted  []string
}

func (m *mockPhotoStore) UploadStream(_ context.Context, blobName, _ string, r io.Reader) (string, error) {
	_, _ = io.Copy(io.Discard, r)
	m.uploaded = append(m.uploaded, blobName)
	return photoBase + blobName, nil
}

func (m *mockPhotoStore) Download(context.Context, string) (io.ReadCloser, string, error) {
	return io.NopCloser(bytes.NewReader(nil)), "", nil
}

func (m *mockPhotoStore) Delete(_ context.Context, blobName string) error {
	m.deleted = append(m.deleted, blobName)
	return nil
}

func (m *mockPhotoStore) BlobNameFromURL(rawURL string) (string, error) {
	return path.Base(rawURL), nil
}

// Only the route under test is registered: RegisterRoutes needs an
// AuthMiddleware backed by the user service, which this domain does not need.
func setupPhotoApp(h *Handler) *fiber.App {
	app := fiber.New()
	app.Post("/api/v1/equipment/:id/photo", h.UploadPhoto)
	return app
}

func uploadRequest(t *testing.T, id string) *http.Request {
	t.Helper()
	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)
	part, err := w.CreateFormFile("photo", "replacement.jpg")
	if err != nil {
		t.Fatalf("building multipart body: %v", err)
	}
	if _, err := part.Write([]byte("not-a-real-jpeg")); err != nil {
		t.Fatalf("writing photo part: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("closing multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/equipment/"+id+"/photo", body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req
}

func newPhotoHandler(t *testing.T, updateErr error) (*Handler, *mockPhotoStore) {
	t.Helper()
	item := &Equipment{ID: "eq-1", Nomenclature: "AN/PRC-117G", PhotoURL: strPtr(photoOld)}
	repo := &MockRepository{
		FindByIDFunc: func(context.Context, string) (*Equipment, error) { return item, nil },
		UpdateFunc:   func(context.Context, *Equipment) error { return updateErr },
	}
	store := &mockPhotoStore{}
	svc := NewService(repo)
	svc.SetBlobStore(store)
	return NewHandler(svc, NewValidator(), store), store
}

// If the row never takes the new URL, nothing references the upload, so it must
// be removed rather than left as a blob no code path can reach.
func TestUploadPhotoDeletesUploadWhenUpdateFails(t *testing.T) {
	h, store := newPhotoHandler(t, errors.New("database unavailable"))

	resp, err := setupPhotoApp(h).Test(uploadRequest(t, "eq-1"))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusInternalServerError)
	}
	if len(store.uploaded) != 1 {
		t.Fatalf("uploaded = %v, want exactly one blob", store.uploaded)
	}
	if !slices.Equal(store.deleted, store.uploaded) {
		t.Errorf("deleted = %v, want %v (the stranded upload)", store.deleted, store.uploaded)
	}
}

func TestUploadPhotoKeepsNewBlobAndDropsOldOnSuccess(t *testing.T) {
	h, store := newPhotoHandler(t, nil)

	resp, err := setupPhotoApp(h).Test(uploadRequest(t, "eq-1"))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	if len(store.uploaded) != 1 {
		t.Fatalf("uploaded = %v, want exactly one blob", store.uploaded)
	}
	if !slices.Equal(store.deleted, []string{"old.jpg"}) {
		t.Errorf("deleted = %v, want [old.jpg] (the superseded photo only)", store.deleted)
	}
	for _, d := range store.deleted {
		if d == store.uploaded[0] {
			t.Errorf("the newly uploaded blob %q was deleted on a successful upload", d)
		}
	}
}

// ─── DeletePhoto ─────────────────────────────────────────────────────────────

// photoActor is the minimum AuthUser the handler reads roles from.
type photoActor struct{ roles []string }

func (a photoActor) GetID() string   { return "u-1" }
func (a photoActor) GetName() string { return "Test Actor" }
func (a photoActor) HasRole(role string) bool {
	return slices.Contains(a.roles, role)
}

// The route gate is not under test here - TestGatesPrecedeHandlers covers it -
// so a nil actor stands for "auth disabled" and a non-nil one is attached the
// way RequireAuth would.
func deletePhotoApp(h *Handler, actor middleware.AuthUser) *fiber.App {
	app := fiber.New()
	app.Delete("/api/v1/equipment/:id/photo", func(c fiber.Ctx) error {
		if actor != nil {
			c.Locals(middleware.UserLocalsKey, actor)
		}
		return h.DeletePhoto(c)
	})
	return app
}

type deletePhotoFixture struct {
	handler *Handler
	store   *mockPhotoStore
	saved   []*Equipment // every row UpdateEquipment persisted
	audit   *auditLog
}

type auditLog struct{ events []contracts.AuditEventInput }

func (a *auditLog) Record(_ context.Context, in contracts.AuditEventInput) {
	a.events = append(a.events, in)
}

func newDeletePhotoFixture(t *testing.T, item *Equipment, withBlob bool) *deletePhotoFixture {
	t.Helper()
	f := &deletePhotoFixture{store: &mockPhotoStore{}, audit: &auditLog{}}
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, id string) (*Equipment, error) {
			if item == nil || id != item.ID {
				return nil, ErrEquipmentNotFound
			}
			return item, nil
		},
		UpdateFunc: func(_ context.Context, e *Equipment) error {
			row := *e
			f.saved = append(f.saved, &row)
			return nil
		},
	}
	svc := NewService(repo)
	svc.SetAudit(f.audit)
	var store PhotoStore
	if withBlob {
		svc.SetBlobStore(f.store)
		store = f.store
	}
	f.handler = NewHandler(svc, NewValidator(), store)
	return f
}

func deletePhoto(t *testing.T, app *fiber.App, id string) int {
	t.Helper()
	resp, err := app.Test(httptest.NewRequest(http.MethodDelete, "/api/v1/equipment/"+id+"/photo", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	_ = resp.Body.Close()
	return resp.StatusCode
}

func TestDeletePhoto(t *testing.T) {
	withPhoto := func(terminalType string) *Equipment {
		return &Equipment{ID: "eq-1", Nomenclature: "AN/PRC-117G", TerminalType: terminalType, PhotoURL: strPtr(photoOld)}
	}

	t.Run("501 when blob storage is not configured", func(t *testing.T) {
		f := newDeletePhotoFixture(t, withPhoto(TerminalTypeRadio), false)

		if got := deletePhoto(t, deletePhotoApp(f.handler, nil), "eq-1"); got != http.StatusNotImplemented {
			t.Errorf("status = %d, want %d", got, http.StatusNotImplemented)
		}
		if len(f.saved) != 0 {
			t.Errorf("the row was written %d times with no blob store to clean up after it", len(f.saved))
		}
	})

	// The body has to say what the status says. A bare errors.New renders as
	// INTERNAL_ERROR / "internal server error" through the shared envelope, so a
	// dev box with no storage used to report its 501 as a server fault.
	t.Run("501 body names the missing storage, not an internal error", func(t *testing.T) {
		f := newDeletePhotoFixture(t, withPhoto(TerminalTypeRadio), false)
		resp, err := deletePhotoApp(f.handler, nil).Test(httptest.NewRequest(http.MethodDelete, "/api/v1/equipment/eq-1/photo", nil))
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		body, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if !bytes.Contains(body, []byte(ErrPhotoStorageNotConfigured.Code)) || bytes.Contains(body, []byte("INTERNAL_ERROR")) {
			t.Errorf("body = %s, want code %s", body, ErrPhotoStorageNotConfigured.Code)
		}
	})

	t.Run("404 when the record does not exist", func(t *testing.T) {
		f := newDeletePhotoFixture(t, withPhoto(TerminalTypeRadio), true)

		if got := deletePhoto(t, deletePhotoApp(f.handler, nil), "missing"); got != http.StatusNotFound {
			t.Errorf("status = %d, want %d", got, http.StatusNotFound)
		}
	})

	t.Run("404 when the record has no photo", func(t *testing.T) {
		item := withPhoto(TerminalTypeRadio)
		item.PhotoURL = nil
		f := newDeletePhotoFixture(t, item, true)

		if got := deletePhoto(t, deletePhotoApp(f.handler, nil), "eq-1"); got != http.StatusNotFound {
			t.Errorf("status = %d, want %d", got, http.StatusNotFound)
		}
		if len(f.saved) != 0 || len(f.store.deleted) != 0 {
			t.Errorf("saved %d rows and deleted %v for a record with nothing to remove", len(f.saved), f.store.deleted)
		}
	})

	t.Run("an rto caller is refused on a satcom record, and nothing moves", func(t *testing.T) {
		f := newDeletePhotoFixture(t, withPhoto(TerminalTypeSATCOM), true)

		got := deletePhoto(t, deletePhotoApp(f.handler, photoActor{roles: []string{roleRTO}}), "eq-1")
		if got != http.StatusForbidden {
			t.Errorf("status = %d, want %d", got, http.StatusForbidden)
		}
		if len(f.saved) != 0 || len(f.store.deleted) != 0 {
			t.Errorf("a refused removal still saved %d rows and deleted %v", len(f.saved), f.store.deleted)
		}
	})

	// The refusal above would pass if the handler refused rto outright.
	t.Run("an rto caller may remove a radio record's photo", func(t *testing.T) {
		f := newDeletePhotoFixture(t, withPhoto(TerminalTypeRadio), true)

		got := deletePhoto(t, deletePhotoApp(f.handler, photoActor{roles: []string{roleRTO}}), "eq-1")
		if got != http.StatusNoContent {
			t.Errorf("status = %d, want %d", got, http.StatusNoContent)
		}
	})

	t.Run("success clears photo_url and deletes the blob", func(t *testing.T) {
		f := newDeletePhotoFixture(t, withPhoto(TerminalTypeSATCOM), true)

		got := deletePhoto(t, deletePhotoApp(f.handler, photoActor{roles: []string{roleAdmin}}), "eq-1")
		if got != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", got, http.StatusNoContent)
		}
		if len(f.saved) != 1 {
			t.Fatalf("saved %d rows, want exactly one", len(f.saved))
		}
		// NULL, not "": the column has one representation of "no photo".
		if f.saved[0].PhotoURL != nil {
			t.Errorf("photo_url = %q, want NULL", *f.saved[0].PhotoURL)
		}
		if !slices.Equal(f.store.deleted, []string{"old.jpg"}) {
			t.Errorf("deleted = %v, want [old.jpg]", f.store.deleted)
		}
		// Recorded as an ordinary update whose diff names the photo, the same
		// entry a replacement writes.
		if len(f.audit.events) != 1 {
			t.Fatalf("audit events = %d, want 1", len(f.audit.events))
		}
		ev := f.audit.events[0]
		if ev.Action != "update" || ev.ActorName != "Test Actor" {
			t.Errorf("audit = %s by %q, want update by %q", ev.Action, ev.ActorName, "Test Actor")
		}
		want := map[string]any{"old": photoOld, "new": ""}
		if got, ok := ev.Changes["photo_url"].(map[string]any); !ok || got["old"] != want["old"] || got["new"] != want["new"] {
			t.Errorf("audit photo_url change = %v, want %v", ev.Changes["photo_url"], want)
		}
	})
}

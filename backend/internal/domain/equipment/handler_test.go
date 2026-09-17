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

package equipment

import (
	"context"
	"errors"
	"net/http"
	"path"
	"slices"
	"testing"

	"backend/internal/domain/equipment/dto"
)

func strPtr(s string) *string { return &s }

const (
	photoOld = "https://acct.blob.core.windows.net/equipment-photos/eq-1/old.jpg"
	photoNew = "https://acct.blob.core.windows.net/equipment-photos/eq-1/new.jpg"
)

// mockBlobStore records deletions so tests can assert exactly which blobs were
// removed, and calls onCall so side-effect ordering can be checked.
type mockBlobStore struct {
	deleted   []string
	deleteErr error
	nameErr   error
	onCall    func(event string)
}

func (m *mockBlobStore) Delete(_ context.Context, blobName string) error {
	if m.onCall != nil {
		m.onCall("blob.Delete")
	}
	if m.deleteErr != nil {
		return m.deleteErr
	}
	m.deleted = append(m.deleted, blobName)
	return nil
}

func (m *mockBlobStore) BlobNameFromURL(rawURL string) (string, error) {
	if m.nameErr != nil {
		return "", m.nameErr
	}
	return path.Base(rawURL), nil
}

// The photo must be removed before the row, because the row holds the only
// reference to it. A failure part-way through has to leave the blob findable.
func TestDeleteEquipmentPhotoCleanup(t *testing.T) {
	tests := []struct {
		name          string
		photoURL      *string
		blobDeleteErr error
		nameErr       error
		wantStatus    int
		wantErr       bool
		wantEvents    []string
		wantDeleted   []string
	}{
		{
			name:        "photo is deleted before the row",
			photoURL:    strPtr(photoOld),
			wantStatus:  http.StatusNoContent,
			wantEvents:  []string{"blob.Delete", "repo.Delete"},
			wantDeleted: []string{"old.jpg"},
		},
		{
			name:       "record without a photo never touches the blob store",
			photoURL:   nil,
			wantStatus: http.StatusNoContent,
			wantEvents: []string{"repo.Delete"},
		},
		{
			name:          "blob failure keeps the row so a retry can converge",
			photoURL:      strPtr(photoOld),
			blobDeleteErr: errors.New("storage unavailable"),
			wantStatus:    http.StatusInternalServerError,
			wantErr:       true,
			wantEvents:    []string{"blob.Delete"},
		},
		{
			name:       "photo URL outside the container does not block the delete",
			photoURL:   strPtr("https://elsewhere.example/img.jpg"),
			nameErr:    errors.New("URL does not belong to this client's container"),
			wantStatus: http.StatusNoContent,
			wantEvents: []string{"repo.Delete"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var events []string
			item := &Equipment{ID: "eq-1", Nomenclature: "AN/PRC-117G", PhotoURL: tt.photoURL}

			repo := &MockRepository{
				FindByIDFunc: func(context.Context, string) (*Equipment, error) { return item, nil },
				DeleteFunc: func(context.Context, string) error {
					events = append(events, "repo.Delete")
					return nil
				},
			}
			blobs := &mockBlobStore{
				deleteErr: tt.blobDeleteErr,
				nameErr:   tt.nameErr,
				onCall:    func(e string) { events = append(events, e) },
			}
			svc := NewService(repo)
			svc.SetBlobStore(blobs)

			status, err := svc.DeleteEquipment(context.Background(), &dto.DeleteEquipmentRequest{ID: "eq-1"}, nil)

			if tt.wantErr && err == nil {
				t.Fatal("expected an error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if status != tt.wantStatus {
				t.Errorf("status = %d, want %d", status, tt.wantStatus)
			}
			if !slices.Equal(events, tt.wantEvents) {
				t.Errorf("side effects = %v, want %v", events, tt.wantEvents)
			}
			if !slices.Equal(blobs.deleted, tt.wantDeleted) {
				t.Errorf("deleted blobs = %v, want %v", blobs.deleted, tt.wantDeleted)
			}
		})
	}
}

// UpdateEquipment is the generic edit path, so the superseded-photo cleanup has
// to fire on a real replacement and stay dormant for everything else.
func TestUpdateEquipmentSupersededPhoto(t *testing.T) {
	tests := []struct {
		name          string
		existingPhoto *string
		reqPhoto      *string
		reqNickname   *string
		updateErr     error
		noBlobStore   bool
		wantStatus    int
		wantErr       bool
		wantDeleted   []string
	}{
		{
			name:          "replacing the photo deletes the superseded blob",
			existingPhoto: strPtr(photoOld),
			reqPhoto:      strPtr(photoNew),
			wantStatus:    http.StatusOK,
			wantDeleted:   []string{"old.jpg"},
		},
		{
			name:          "editing an unrelated field keeps the photo",
			existingPhoto: strPtr(photoOld),
			reqNickname:   strPtr("Bravo"),
			wantStatus:    http.StatusOK,
		},
		{
			name:          "resubmitting the same URL keeps the photo",
			existingPhoto: strPtr(photoOld),
			reqPhoto:      strPtr(photoOld),
			wantStatus:    http.StatusOK,
		},
		{
			name:          "first photo on a record with none deletes nothing",
			existingPhoto: nil,
			reqPhoto:      strPtr(photoNew),
			wantStatus:    http.StatusOK,
		},
		{
			name:          "failed row update leaves the old photo in place",
			existingPhoto: strPtr(photoOld),
			reqPhoto:      strPtr(photoNew),
			updateErr:     errors.New("database unavailable"),
			wantStatus:    http.StatusInternalServerError,
			wantErr:       true,
		},
		{
			name:          "unconfigured blob storage still allows the update",
			existingPhoto: strPtr(photoOld),
			reqPhoto:      strPtr(photoNew),
			noBlobStore:   true,
			wantStatus:    http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			item := &Equipment{ID: "eq-1", Nomenclature: "AN/PRC-117G", PhotoURL: tt.existingPhoto}
			repo := &MockRepository{
				FindByIDFunc: func(context.Context, string) (*Equipment, error) { return item, nil },
				UpdateFunc:   func(context.Context, *Equipment) error { return tt.updateErr },
			}
			blobs := &mockBlobStore{}
			svc := NewService(repo)
			if !tt.noBlobStore {
				svc.SetBlobStore(blobs)
			}

			req := &dto.UpdateEquipmentRequest{ID: "eq-1", PhotoURL: tt.reqPhoto, Nickname: tt.reqNickname}
			status, err := svc.UpdateEquipment(context.Background(), req, &dto.UpdateEquipmentResponse{})

			if tt.wantErr && err == nil {
				t.Fatal("expected an error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if status != tt.wantStatus {
				t.Errorf("status = %d, want %d", status, tt.wantStatus)
			}
			if !slices.Equal(blobs.deleted, tt.wantDeleted) {
				t.Errorf("deleted blobs = %v, want %v", blobs.deleted, tt.wantDeleted)
			}
		})
	}
}

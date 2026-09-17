package transport

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"backend/internal/domain/transport/dto"
	"backend/internal/shared/response"
)

// Every domain error must carry a code. A plain errors.New falls through to
// INTERNAL_ERROR, which is how a duplicate name would report itself as
// "internal server error" while correctly returning 409.
func TestErrorsAreCoded(t *testing.T) {
	tests := []struct {
		err        *Error
		wantCode   string
		wantStatus int
	}{
		{ErrTransportNotFound, "TRANSPORT_NOT_FOUND", http.StatusNotFound},
		{ErrTransportNameExists, "TRANSPORT_NAME_EXISTS", http.StatusConflict},
		{ErrTransportInvalidKind, "TRANSPORT_INVALID_KIND", http.StatusBadRequest},
		{ErrTransportInternalError, "TRANSPORT_INTERNAL_ERROR", http.StatusInternalServerError},
	}
	for _, tt := range tests {
		var coded response.CodedError = tt.err
		if coded.GetCode() != tt.wantCode {
			t.Errorf("code = %q, want %q", coded.GetCode(), tt.wantCode)
		}
		if coded.GetStatus() != tt.wantStatus {
			t.Errorf("%s status = %d, want %d", tt.wantCode, coded.GetStatus(), tt.wantStatus)
		}
		if coded.Error() == "" {
			t.Errorf("%s has an empty message", tt.wantCode)
		}
	}

	// The envelope must surface the real code, not the INTERNAL_ERROR fallback.
	got := response.Err(ErrTransportNameExists)
	if got.Error == nil || got.Error.Code != "TRANSPORT_NAME_EXISTS" {
		t.Errorf("envelope code = %+v, want TRANSPORT_NAME_EXISTS", got.Error)
	}
}

func TestDefaultKindsAreTheBuiltInFour(t *testing.T) {
	want := []string{"fiber", "cellular", "manet", "other"}
	if len(DefaultKinds) != len(want) {
		t.Fatalf("DefaultKinds = %v, want %v", DefaultKinds, want)
	}
	for i, k := range want {
		if DefaultKinds[i] != k {
			t.Errorf("DefaultKinds[%d] = %q, want %q", i, DefaultKinds[i], k)
		}
	}
	// hf was dropped from the vocabulary. It is still storable as a custom
	// kind, like anything else, but it is no longer offered by default.
	if IsDefaultKind("hf") {
		t.Error("hf is still a default kind")
	}
}

// The vocabulary is open: a kind nobody anticipated is accepted as long as it
// is well formed. This is the behaviour that separates it from a closed set.
func TestKindVocabularyIsOpen(t *testing.T) {
	for _, k := range []string{"satellite", "line of sight", "point-to-point", "5g"} {
		if !IsValidKind(k) {
			t.Errorf("IsValidKind(%q) = false, want true", k)
		}
	}
}

func TestIsValidKindRejectsMalformedKinds(t *testing.T) {
	tooLong := strings.Repeat("a", MaxKindLen+1)
	for _, k := range []string{"", tooLong, "fibre/optic", "<script>", "-leading"} {
		if IsValidKind(k) {
			t.Errorf("IsValidKind(%q) = true, want false", k)
		}
	}
}

// Normalisation is what buys back the consistency an open vocabulary gives up.
// Without it the same kind lands in the list three times, spelled three ways.
func TestNormaliseKindCollapsesSpelling(t *testing.T) {
	cases := map[string]string{
		"Cellular":        "cellular",
		"  CELLULAR  ":    "cellular",
		"line   of sight": "line of sight",
		"":                "other",
		"   ":             "other",
	}
	for in, want := range cases {
		if got := NormaliseKind(in); got != want {
			t.Errorf("NormaliseKind(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestListTransportsReturnsEveryRow(t *testing.T) {
	repo := &MockRepository{
		FindAllFunc: func(_ context.Context) ([]*Transport, error) {
			return []*Transport{
				{ID: "1", Name: "Verizon LTE", Kind: "cellular"},
				{ID: "2", Name: "Post fibre ring", Kind: "fiber"},
			}, nil
		},
	}
	svc := NewService(repo)

	resp := &dto.ListTransportsResponse{}
	status, err := svc.ListTransports(context.Background(), resp)

	if status != http.StatusOK || err != nil {
		t.Fatalf("status = %d, err = %v; want 200 / nil", status, err)
	}
	if resp.Total != 2 || len(resp.Transports) != 2 {
		t.Fatalf("total = %d, len = %d; want 2 / 2", resp.Total, len(resp.Transports))
	}
	if resp.Transports[0].Name != "Verizon LTE" || resp.Transports[0].Kind != "cellular" {
		t.Errorf("first row = %+v", resp.Transports[0])
	}
}

func TestCreateTransportStoresTrimmedValues(t *testing.T) {
	var created *Transport
	repo := &MockRepository{
		CreateFunc: func(_ context.Context, tr *Transport) error {
			created = tr
			return nil
		},
		FindAllFunc: func(_ context.Context) ([]*Transport, error) {
			return []*Transport{{ID: "new", Name: "Verizon LTE", Kind: "cellular"}}, nil
		},
	}
	svc := NewService(repo)

	resp := &dto.CreateTransportResponse{}
	status, err := svc.CreateTransport(context.Background(),
		&dto.CreateTransportRequest{Name: "  Verizon LTE  ", Kind: "cellular", Provider: " Verizon "},
		resp)

	if status != http.StatusCreated || err != nil {
		t.Fatalf("status = %d, err = %v; want 201 / nil", status, err)
	}
	if created == nil {
		t.Fatal("Create was never called")
	}
	if created.Name != "Verizon LTE" || created.Provider != "Verizon" {
		t.Errorf("stored %+v; want trimmed name and provider", created)
	}
	if resp.Transport.ID != "new" {
		t.Errorf("response ID = %q, want the re-fetched ID", resp.Transport.ID)
	}
}

func TestCreateTransportDefaultsKindToOther(t *testing.T) {
	var created *Transport
	repo := &MockRepository{
		CreateFunc: func(_ context.Context, tr *Transport) error {
			created = tr
			return nil
		},
	}
	svc := NewService(repo)

	status, err := svc.CreateTransport(context.Background(),
		&dto.CreateTransportRequest{Name: "Something"}, &dto.CreateTransportResponse{})

	if status != http.StatusCreated || err != nil {
		t.Fatalf("status = %d, err = %v; want 201 / nil", status, err)
	}
	if created.Kind != "other" {
		t.Errorf("kind = %q, want %q", created.Kind, "other")
	}
}

func TestCreateTransportAcceptsAKindOutsideTheDefaults(t *testing.T) {
	var created *Transport
	repo := &MockRepository{
		CreateFunc: func(_ context.Context, tr *Transport) error {
			created = tr
			return nil
		},
	}
	svc := NewService(repo)

	status, err := svc.CreateTransport(context.Background(),
		&dto.CreateTransportRequest{Name: "Starlink", Kind: "Satellite"},
		&dto.CreateTransportResponse{})

	if status != http.StatusCreated || err != nil {
		t.Fatalf("status = %d, err = %v; want 201 / nil", status, err)
	}
	if created.Kind != "satellite" {
		t.Errorf("kind = %q, want %q (normalised, not rejected)", created.Kind, "satellite")
	}
}

func TestCreateTransportRejectsAMalformedKind(t *testing.T) {
	svc := NewService(&MockRepository{})

	status, err := svc.CreateTransport(context.Background(),
		&dto.CreateTransportRequest{Name: "Odd", Kind: "<script>alert(1)</script>"},
		&dto.CreateTransportResponse{})

	if status != http.StatusBadRequest || !errors.Is(err, ErrTransportInvalidKind) {
		t.Errorf("status = %d, err = %v; want 400 / %v", status, err, ErrTransportInvalidKind)
	}
}

func TestCreateTransportRejectsDuplicateName(t *testing.T) {
	repo := &MockRepository{
		NameExistsFunc: func(_ context.Context, _ string) (bool, error) { return true, nil },
	}
	svc := NewService(repo)

	status, err := svc.CreateTransport(context.Background(),
		&dto.CreateTransportRequest{Name: "verizon lte"}, &dto.CreateTransportResponse{})

	if status != http.StatusConflict || !errors.Is(err, ErrTransportNameExists) {
		t.Errorf("status = %d, err = %v; want 409 / %v", status, err, ErrTransportNameExists)
	}
}

func TestUpdateTransportAppliesOnlyTheFieldsSent(t *testing.T) {
	existing := &Transport{
		ID: "1", Name: "Old name", Kind: "fiber", Provider: "Acme", Description: "keep me",
		CreatedAt: time.Now().UTC(),
	}
	var updated *Transport
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, _ string) (*Transport, error) { return existing, nil },
		UpdateFunc: func(_ context.Context, tr *Transport) error {
			updated = tr
			return nil
		},
	}
	svc := NewService(repo)

	newName := "New name"
	status, err := svc.UpdateTransport(context.Background(),
		&dto.UpdateTransportRequest{ID: "1", Name: &newName, UpdatedBy: "mike"},
		&dto.UpdateTransportResponse{})

	if status != http.StatusOK || err != nil {
		t.Fatalf("status = %d, err = %v; want 200 / nil", status, err)
	}
	if updated.Name != "New name" {
		t.Errorf("name = %q, want %q", updated.Name, "New name")
	}
	if updated.Description != "keep me" {
		t.Errorf("description = %q; an omitted field must not be cleared", updated.Description)
	}
	if updated.UpdatedBy != "mike" {
		t.Errorf("updated_by = %q, want %q", updated.UpdatedBy, "mike")
	}
}

func TestUpdateTransportRejectsDuplicateName(t *testing.T) {
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, _ string) (*Transport, error) {
			return &Transport{ID: "1", Name: "Old"}, nil
		},
		NameExistsExcludingFunc: func(_ context.Context, _, _ string) (bool, error) { return true, nil },
	}
	svc := NewService(repo)

	taken := "Verizon LTE"
	status, err := svc.UpdateTransport(context.Background(),
		&dto.UpdateTransportRequest{ID: "1", Name: &taken}, &dto.UpdateTransportResponse{})

	if status != http.StatusConflict || !errors.Is(err, ErrTransportNameExists) {
		t.Errorf("status = %d, err = %v; want 409 / %v", status, err, ErrTransportNameExists)
	}
}

func TestDeleteTransportRemovesTheRow(t *testing.T) {
	var deletedID string
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, id string) (*Transport, error) {
			return &Transport{ID: id}, nil
		},
		DeleteFunc: func(_ context.Context, id string) error {
			deletedID = id
			return nil
		},
	}
	svc := NewService(repo)

	status, err := svc.DeleteTransport(context.Background(), &dto.DeleteTransportRequest{ID: "1"})

	if status != http.StatusNoContent || err != nil {
		t.Fatalf("status = %d, err = %v; want 204 / nil", status, err)
	}
	if deletedID != "1" {
		t.Errorf("deleted %q, want %q", deletedID, "1")
	}
}

func TestDeleteTransportIsNotFoundWhenAbsent(t *testing.T) {
	repo := &MockRepository{
		FindByIDFunc: func(_ context.Context, _ string) (*Transport, error) {
			return nil, ErrTransportNotFound
		},
	}
	svc := NewService(repo)

	status, err := svc.DeleteTransport(context.Background(), &dto.DeleteTransportRequest{ID: "gone"})

	if status != http.StatusNotFound || !errors.Is(err, ErrTransportNotFound) {
		t.Errorf("status = %d, err = %v; want 404 / %v", status, err, ErrTransportNotFound)
	}
}

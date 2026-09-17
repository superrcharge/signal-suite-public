package transport

import (
	"context"
	"strings"
	"testing"
	"time"

	"backend/internal/shared/csvtable"
	"backend/internal/shared/csvtable/csvtabletest"
)

// The full column list, written out by hand. This literal IS the pin.
var wantColumns = []string{
	"id", "name", "kind", "provider", "description",
	"created_by", "updated_by", "updated_at", "created_at",
}

func boundOrFail(t *testing.T) *csvtable.Bound[Transport] {
	t.Helper()
	b, err := boundCSV()
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	return b
}

func csvSampleTransport() *Transport {
	at := time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)
	return &Transport{
		ID: "550e8400-e29b-41d4-a716-446655440000", Name: "EXAMPLE FIBRE RUN",
		Kind: "fiber", Provider: "Example Telecom",
		Description: "A note with a comma, and \"quotes\"",
		CreatedBy:   "tester", UpdatedBy: "tester", CreatedAt: at, UpdatedAt: at,
	}
}

func TestCSVTable(t *testing.T) {
	csvtabletest.Suite(t, boundOrFail(t), wantColumns, csvSampleTransport())
}

// Kind is an open vocabulary, so an unfamiliar one imports rather than failing.
// It is normalised on the way in, which is what stops the list filling up with
// the same kind spelled three ways.
func TestImport_KindIsOpenButNormalised(t *testing.T) {
	var created []*Transport
	svc := NewService(&MockRepository{
		FindAllFunc: func(ctx context.Context) ([]*Transport, error) { return nil, nil },
		CreateFunc: func(ctx context.Context, tr *Transport) error {
			created = append(created, tr)
			return nil
		},
	})

	_, parsed, err := svc.ImportTransports(context.Background(),
		"name,kind\nLINK ONE,  Line Of Sight \nLINK TWO,\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(parsed.Errors) != 0 {
		t.Fatalf("an unfamiliar kind should import, got %+v", parsed.Errors)
	}
	if len(created) != 2 {
		t.Fatalf("want 2 created, got %d", len(created))
	}
	if created[0].Kind != "line of sight" {
		t.Errorf("kind = %q, want it normalised to %q", created[0].Kind, "line of sight")
	}
	// A blank kind is a usable row, not an error.
	if created[1].Kind != "other" {
		t.Errorf("blank kind = %q, want %q", created[1].Kind, "other")
	}
}

func TestImport_RejectsDuplicateName(t *testing.T) {
	svc := NewService(&MockRepository{
		FindAllFunc: func(ctx context.Context) ([]*Transport, error) {
			return []*Transport{{Name: "EXAMPLE FIBRE RUN"}}, nil
		},
		CreateFunc: func(ctx context.Context, tr *Transport) error { return nil },
	})
	_, parsed, err := svc.ImportTransports(context.Background(),
		"name\nexample fibre run\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(parsed.Errors) != 1 || !strings.Contains(parsed.Errors[0].Errors[0], "already exists") {
		t.Errorf("expected a duplicate error, got %+v", parsed.Errors)
	}
}

package satcomservice

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
	"id", "abbrev", "name", "description",
	"created_by", "updated_by", "updated_at", "created_at",
}

func boundOrFail(t *testing.T) *csvtable.Bound[SatcomService] {
	t.Helper()
	b, err := boundCSV()
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	return b
}

func csvSampleService() *SatcomService {
	at := time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)
	return &SatcomService{
		ID: "550e8400-e29b-41d4-a716-446655440000", Abbrev: "EXSVC",
		Name: "Example Service", Description: "A note with a comma, and \"quotes\"",
		CreatedBy: "tester", UpdatedBy: "tester", CreatedAt: at, UpdatedAt: at,
	}
}

func TestCSVTable(t *testing.T) {
	csvtabletest.Suite(t, boundOrFail(t), wantColumns, csvSampleService())
}

func TestImport_RejectsDuplicateAbbrev(t *testing.T) {
	var created []*SatcomService
	svc := NewService(&MockRepository{
		FindAllFunc: func(ctx context.Context) ([]*SatcomService, error) {
			return []*SatcomService{{Abbrev: "EXSVC", Name: "Already here"}}, nil
		},
		CreateFunc: func(ctx context.Context, s *SatcomService) error {
			created = append(created, s)
			return nil
		},
	})

	status, parsed, err := svc.ImportServices(context.Background(),
		"abbrev,name\nexsvc,Duplicate\nNEW,Brand New\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if status != 207 {
		t.Errorf("status = %d, want 207", status)
	}
	if len(created) != 1 || created[0].Abbrev != "NEW" {
		t.Fatalf("expected only NEW created, got %+v", created)
	}
	if len(parsed.Errors) != 1 || !strings.Contains(parsed.Errors[0].Errors[0], "already exists") {
		t.Errorf("expected a duplicate error, got %+v", parsed.Errors)
	}
}

func TestImport_RejectsAnExportedFile(t *testing.T) {
	svc := NewService(&MockRepository{
		FindAllFunc: func(ctx context.Context) ([]*SatcomService, error) { return nil, nil },
	})
	_, _, err := svc.ImportServices(context.Background(), "id,abbrev,name\nx,EXSVC,Example\n", "tester")
	if err == nil {
		t.Fatal("expected a file carrying id to be refused")
	}
}

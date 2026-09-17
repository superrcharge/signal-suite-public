package waveform

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

func boundOrFail(t *testing.T) *csvtable.Bound[Waveform] {
	t.Helper()
	b, err := boundCSV()
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	return b
}

func sampleWaveform() *Waveform {
	at := time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)
	return &Waveform{
		ID: "550e8400-e29b-41d4-a716-446655440000", Abbrev: "EXWF",
		Name: "Example Waveform", Description: "A note with a comma, and \"quotes\"",
		CreatedBy: "tester", UpdatedBy: "tester", CreatedAt: at, UpdatedAt: at,
	}
}

func TestCSVTable(t *testing.T) {
	csvtabletest.Suite(t, boundOrFail(t), wantColumns, sampleWaveform())
}

func TestExport(t *testing.T) {
	svc := NewService(&MockRepository{
		FindAllFunc: func(ctx context.Context) ([]*Waveform, error) {
			return []*Waveform{sampleWaveform()}, nil
		},
	})
	out, err := svc.ExportWaveforms(context.Background(), nil)
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	header, rest, _ := strings.Cut(out, "\n")
	if header != strings.Join(wantColumns, ",") {
		t.Errorf("header = %q", header)
	}
	if !strings.Contains(rest, "EXWF") {
		t.Errorf("row missing the abbrev: %q", rest)
	}
}

// Abbrev is the identity, so a file repeating one already stored is rejected
// rather than creating a second entry the equipment chips cannot tell apart.
func TestImport_RejectsDuplicateAbbrev(t *testing.T) {
	var created []*Waveform
	svc := NewService(&MockRepository{
		FindAllFunc: func(ctx context.Context) ([]*Waveform, error) {
			return []*Waveform{{Abbrev: "EXWF", Name: "Already here"}}, nil
		},
		CreateFunc: func(ctx context.Context, w *Waveform) error {
			created = append(created, w)
			return nil
		},
	})

	status, parsed, err := svc.ImportWaveforms(context.Background(),
		"abbrev,name\nexwf,Duplicate\nNEW,Brand New\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if status != 207 {
		t.Errorf("status = %d, want 207", status)
	}
	if len(created) != 1 || created[0].Abbrev != "NEW" {
		t.Fatalf("expected only NEW to be created, got %+v", created)
	}
	if len(parsed.Errors) != 1 || !strings.Contains(parsed.Errors[0].Errors[0], "already exists") {
		t.Errorf("expected a duplicate error, got %+v", parsed.Errors)
	}
}

func TestImport_RequiresAbbrevAndName(t *testing.T) {
	svc := NewService(&MockRepository{
		FindAllFunc: func(ctx context.Context) ([]*Waveform, error) { return nil, nil },
	})
	_, parsed, err := svc.ImportWaveforms(context.Background(), "abbrev,name\n,\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(parsed.Errors) != 1 {
		t.Fatalf("want 1 row error, got %+v", parsed.Errors)
	}
	if n := len(parsed.Errors[0].Errors); n != 2 {
		t.Errorf("want both abbrev and name reported, got %d: %v", n, parsed.Errors[0].Errors)
	}
}

// A file that came from an export is refused with an explanation rather than
// failing every row as a duplicate.
func TestImport_RejectsAnExportedFile(t *testing.T) {
	svc := NewService(&MockRepository{
		FindAllFunc: func(ctx context.Context) ([]*Waveform, error) { return nil, nil },
	})
	_, _, err := svc.ImportWaveforms(context.Background(), "id,abbrev,name\nx,EXWF,Example\n", "tester")
	if err == nil {
		t.Fatal("expected a file carrying id to be refused")
	}
	if !strings.Contains(err.Error(), "came from an export") {
		t.Errorf("message should explain why, got %q", err.Error())
	}
}

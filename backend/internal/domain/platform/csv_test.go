package platform

import (
	"context"
	"slices"
	"strings"
	"testing"
	"time"

	"backend/internal/shared/csvtable"
	"backend/internal/shared/csvtable/csvtabletest"
)

// The full column list, written out by hand. This literal IS the pin.
var wantColumns = []string{
	"id", "designation", "popular_name", "category", "kind", "operator",
	"waveform_abbrevs", "equipment_ids", "notes",
	"created_by", "updated_by", "updated_at", "created_at",
}

func boundOrFail(t *testing.T) *csvtable.Bound[Platform] {
	t.Helper()
	b, err := boundCSV()
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	return b
}

func csvSamplePlatform() *Platform {
	at := time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)
	return &Platform{
		ID: "550e8400-e29b-41d4-a716-446655440000", Designation: "EXAMPLE F-35A",
		PopularName: "Lightning II", Category: "joint", Kind: "aircraft", Operator: "USAF",
		WaveformAbbrevs: []string{"L16", "MADL"},
		EquipmentIDs:    []string{"r1"},
		Notes:           "A note with a comma, and \"quotes\"",
		CreatedBy:       "tester", UpdatedBy: "tester", CreatedAt: at, UpdatedAt: at,
	}
}

func TestCSVTable(t *testing.T) {
	csvtabletest.Suite(t, boundOrFail(t), wantColumns, csvSamplePlatform())
}

// The two list columns must round-trip through one cell each. A list that
// exports and cannot be read back is an export that silently loses data on the
// next import.
func TestImport_ListColumnsRoundTrip(t *testing.T) {
	var created []*Platform
	svc := NewService(&MockRepository{
		FindAllFunc: func(ctx context.Context) ([]*Platform, error) { return nil, nil },
		CreateFunc: func(ctx context.Context, p *Platform) error {
			created = append(created, p)
			return nil
		},
	})

	_, parsed, err := svc.ImportPlatforms(context.Background(),
		"designation,category,kind,waveform_abbrevs,equipment_ids\n"+
			"F-35A,Joint,,L16; MADL ;l16,r1;r2\n"+
			"TYPE 45,coalition,Ship,,\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(parsed.Errors) != 0 {
		t.Fatalf("unexpected row errors: %+v", parsed.Errors)
	}
	if len(created) != 2 {
		t.Fatalf("want 2 created, got %d", len(created))
	}
	if !slices.Equal(created[0].WaveformAbbrevs, []string{"L16", "MADL"}) {
		t.Errorf("abbrevs = %v, want [L16 MADL]", created[0].WaveformAbbrevs)
	}
	if !slices.Equal(created[0].EquipmentIDs, []string{"r1", "r2"}) {
		t.Errorf("ids = %v, want [r1 r2]", created[0].EquipmentIDs)
	}
	if created[0].Category != "joint" || created[0].Kind != "aircraft" {
		t.Errorf("row 1 category/kind = %q/%q, want joint/aircraft", created[0].Category, created[0].Kind)
	}
	if created[1].Kind != "ship" || len(created[1].WaveformAbbrevs) != 0 {
		t.Errorf("row 2 = %+v, want kind ship and no abbrevs", created[1])
	}
}

func TestImport_RejectsMalformedVocab(t *testing.T) {
	svc := NewService(&MockRepository{
		CreateFunc: func(ctx context.Context, p *Platform) error { return nil },
	})
	_, parsed, err := svc.ImportPlatforms(context.Background(),
		"designation,kind\nX,a/b\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(parsed.Errors) != 1 || len(parsed.Rows) != 0 {
		t.Errorf("want one row error and nothing created, got rows=%d errors=%+v", len(parsed.Rows), parsed.Errors)
	}
}

func TestImport_RejectsDuplicateDesignation(t *testing.T) {
	svc := NewService(&MockRepository{
		FindAllFunc: func(ctx context.Context) ([]*Platform, error) {
			return []*Platform{{Designation: "F-35A"}}, nil
		},
		CreateFunc: func(ctx context.Context, p *Platform) error { return nil },
	})
	_, parsed, err := svc.ImportPlatforms(context.Background(),
		"designation\nf-35a\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(parsed.Errors) != 1 || !strings.Contains(parsed.Errors[0].Errors[0], "already exists") {
		t.Errorf("expected a duplicate error, got %+v", parsed.Errors)
	}
}

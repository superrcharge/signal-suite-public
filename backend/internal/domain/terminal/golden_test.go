package terminal

import (
	"context"
	"testing"
	"time"

	"backend/internal/shared/csvtable/csvtabletest"
)

// Golden fixtures for the CSV surface, captured from the code as it shipped and
// before any csvtable migration. They are the proof that the migration is a
// refactor: the new implementation has to reproduce these bytes exactly.
//
// The dataset is fixed on purpose - timestamps are literals, not time.Now(), or
// the fixture would differ on every run and assert nothing.

func goldenTerminals() []*Terminal {
	created := time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)
	updated := time.Date(2026, 7, 8, 9, 10, 11, 0, time.UTC)

	return []*Terminal{
		{
			// Everything populated, so every getter is exercised.
			ID:         "550e8400-e29b-41d4-a716-446655440000",
			Name:       "GOLDEN STARSHIELD",
			Model:      strPtr(ModelMini),
			Kit:        "KIT-G-001",
			Pim:        "PIM-G-001",
			Serial:     "SN-GOLDEN-001",
			Section:    "asqd",
			Status:     StatusOnMission,
			Owner:      strPtr("SGT Golden"),
			OwnerEmail: strPtr("golden@example.mil"),
			OwnerPhone: strPtr("DSN 312-555-0000"),
			PopPin:     strPtr(PopPinGermany),
			Notes:      "A note with a comma, and \"quotes\"",
			Tag:        strPtr("Operation Golden"),
			UpdatedBy:  "tester",
			CreatedAt:  created,
			UpdatedAt:  updated,
		},
		{
			// Every nullable left nil, so the nil-to-empty rendering is pinned too.
			ID:        "660e8400-e29b-41d4-a716-446655440000",
			Name:      "GOLDEN MINIMAL",
			Status:    StatusAvailable,
			UpdatedBy: "tester",
			CreatedAt: created,
			UpdatedAt: updated,
		},
	}
}

func goldenService() *Service {
	repo := &MockRepository{
		FindForExportFunc: func(ctx context.Context, _ ExportFilter) ([]*Terminal, error) {
			return goldenTerminals(), nil
		},
	}
	svc, _ := newTestService(repo)
	return svc
}

func TestGolden_ExportAll(t *testing.T) {
	out, err := goldenService().ExportTerminals(context.Background(), ExportFilter{}, nil)
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	csvtabletest.Golden(t, "export_all.csv", out)
}

func TestGolden_ExportSubset(t *testing.T) {
	// Deliberately asked for out of canonical order: the output must not follow
	// the caller's order, and the fixture is what proves that stays true.
	out, err := goldenService().ExportTerminals(context.Background(), ExportFilter{},
		[]string{"tag", "name", "pop_pin", "status"})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	csvtabletest.Golden(t, "export_subset.csv", out)
}

func TestGolden_Template(t *testing.T) {
	out, err := goldenService().GetImportTemplate(context.Background(), nil)
	if err != nil {
		t.Fatalf("template: %v", err)
	}
	csvtabletest.Golden(t, "template.csv", out)
}

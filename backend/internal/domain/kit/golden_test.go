package kit

import (
	"context"
	"testing"
	"time"

	"backend/internal/shared/csvtable/csvtabletest"
)

// Golden fixtures for the CSV surface, captured before the csvtable migration.
// See the note in the terminal package: fixed timestamps, one fully-populated
// row and one minimal row, so both the populated and the nil-to-empty rendering
// are pinned.

func goldenKits() []*Kit {
	created := time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)
	updated := time.Date(2026, 7, 8, 9, 10, 11, 0, time.UTC)

	return []*Kit{
		{
			ID:         "550e8400-e29b-41d4-a716-446655440000",
			Name:       "GOLDEN REMOTE",
			Type:       TypeRemote,
			Status:     StatusOnMission,
			Black:      true,
			Secret:      false,
			TopSecret:       true,
			Section:    "asqd",
			Owner:      strPtr("SGT Golden"),
			OwnerEmail: strPtr("golden@example.mil"),
			OwnerPhone: strPtr("DSN 312-555-0000"),
			Location:   "Bay 3, Shelf 2",
			Notes:      "A note with a comma, and \"quotes\"",
			UpdatedBy:  "tester",
			CreatedAt:  created,
			UpdatedAt:  updated,
		},
		{
			ID:        "660e8400-e29b-41d4-a716-446655440000",
			Name:      "GOLDEN MINIMAL",
			Type:      TypeIFK,
			Status:    StatusAvailable,
			UpdatedBy: "tester",
			CreatedAt: created,
			UpdatedAt: updated,
		},
	}
}

func goldenService() *Service {
	repo := &MockRepository{
		FindForExportFunc: func(ctx context.Context, _ ExportFilter) ([]*Kit, error) {
			return goldenKits(), nil
		},
	}
	svc, _ := newTestService(repo)
	return svc
}

func TestGolden_ExportAll(t *testing.T) {
	out, err := goldenService().ExportKits(context.Background(), ExportFilter{}, nil)
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	csvtabletest.Golden(t, "export_all.csv", out)
}

func TestGolden_ExportSubset(t *testing.T) {
	// Asked for out of canonical order on purpose; the output must not follow it.
	out, err := goldenService().ExportKits(context.Background(), ExportFilter{},
		[]string{"topsecret", "name", "black", "type"})
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

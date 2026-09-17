package contract

import (
	"context"
	"testing"
	"time"

	"backend/internal/shared/csvtable/csvtabletest"
)

// Contract's first tests. It was the only domain with no test file at all, which
// is exactly why its export drifted two columns away from the dialog that fronts
// it without anything noticing.
//
// Golden fixtures captured before the csvtable migration. Fixed timestamps, one
// fully-populated row and one minimal row.

func strPtr(s string) *string { return &s }

func goldenContracts() []*Contract {
	created := time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)
	updated := time.Date(2026, 7, 8, 9, 10, 11, 0, time.UTC)
	start := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2027, 9, 30, 0, 0, 0, 0, time.UTC)

	return []*Contract{
		{
			ID:               "550e8400-e29b-41d4-a716-446655440000",
			Title:            "GOLDEN SUSTAINMENT",
			Company:          "Example Systems, Inc.",
			POCName:          strPtr("Jamie Golden"),
			POCEmail:         strPtr("golden@example.com"),
			POCPhone:         strPtr("555-0100"),
			POPStart:         &start,
			POPEnd:           &end,
			ExecutionQuarter: strPtr("Q1"),
			FiscalYear:       "FY27",
			Notes:            "A note with a comma, and \"quotes\"",
			LogformNumber:    strPtr("LF-2026-0001"),
			LogformURL:       strPtr("https://example.test/logform/1"),
			UpdatedBy:        "tester",
			CreatedAt:        created,
			UpdatedAt:        updated,
		},
		{
			ID:         "660e8400-e29b-41d4-a716-446655440000",
			Title:      "GOLDEN MINIMAL",
			Company:    "Example Systems, Inc.",
			FiscalYear: "FY26",
			UpdatedBy:  "tester",
			CreatedAt:  created,
			UpdatedAt:  updated,
		},
	}
}

func goldenService() *Service {
	return NewService(&MockRepository{
		FindForExportFunc: func(ctx context.Context, fiscalYears []string) ([]*Contract, error) {
			return goldenContracts(), nil
		},
	})
}

func TestGolden_ExportAll(t *testing.T) {
	out, err := goldenService().ExportContracts(context.Background(), nil, nil)
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	csvtabletest.Golden(t, "export_all.csv", out)
}

func TestGolden_ExportSubset(t *testing.T) {
	// The two columns the dialog never offered are in this subset deliberately.
	out, err := goldenService().ExportContracts(context.Background(), nil,
		[]string{"logform_url", "title", "logform_number", "fiscal_year"})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	csvtabletest.Golden(t, "export_subset.csv", out)
}

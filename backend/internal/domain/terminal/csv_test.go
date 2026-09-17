package terminal

import (
	"testing"

	"backend/internal/shared/csvtable"
	"backend/internal/shared/csvtable/csvtabletest"
)

// The full column list, written out by hand. It is deliberately not derived from
// csvTable: this literal IS the pin. A column list that can change without a
// test changing is how the template drifted away from the export list in the
// first place.
//
// If this has to change, the frontend picker and the domain doc move with it.
var wantColumns = []string{
	"id", "name", "model", "kit", "pim", "serial", "section", "status",
	"owner", "owner_email", "owner_phone", "pop_pin", "notes", "tag",
	"updated_by", "updated_at", "created_at",
}

func boundCSV(t *testing.T) *csvtable.Bound[Terminal] {
	t.Helper()
	b, err := csvTable.Bind(csvtable.Vocab{"sections": {"asqd", "bsqd"}})
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	return b
}

func TestCSVTable(t *testing.T) {
	csvtabletest.Suite(t, boundCSV(t), wantColumns, miniTerminal())
}

// The section vocabulary is another domain's data, so it can only be wrong at
// runtime. Binding without it must fail rather than leave the column accepting
// anything, which would silently turn off section validation on import.
func TestCSVTable_RequiresTheSectionVocabulary(t *testing.T) {
	if _, err := csvTable.Bind(nil); err == nil {
		t.Fatal("expected binding without the sections vocabulary to fail")
	}
}

func TestExportableColumns_MatchesTheTable(t *testing.T) {
	// ExportableColumns is derived now rather than maintained, but it is still
	// the name the rest of the package uses, so it is worth pinning that the
	// derivation happened.
	if len(ExportableColumns) != len(wantColumns) {
		t.Fatalf("ExportableColumns has %d entries, want %d", len(ExportableColumns), len(wantColumns))
	}
	for i, key := range wantColumns {
		if ExportableColumns[i] != key {
			t.Errorf("ExportableColumns[%d] = %q, want %q", i, ExportableColumns[i], key)
		}
	}
}

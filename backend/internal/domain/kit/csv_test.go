package kit

import (
	"testing"

	"backend/internal/shared/csvtable"
	"backend/internal/shared/csvtable/csvtabletest"
)

// The full column list, written out by hand. This literal IS the pin - see the
// note in the terminal package's csv_test.go.
var wantColumns = []string{
	"id", "name", "type", "status", "black", "secret", "topsecret", "section",
	"owner", "owner_email", "owner_phone", "location", "notes",
	"updated_by", "updated_at", "created_at",
}

func boundCSV(t *testing.T) *csvtable.Bound[Kit] {
	t.Helper()
	b, err := csvTable.Bind(csvtable.Vocab{"sections": {"asqd", "bsqd"}})
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	return b
}

func TestCSVTable(t *testing.T) {
	csvtabletest.Suite(t, boundCSV(t), wantColumns, goldenKits()[0])
}

func TestCSVTable_RequiresTheSectionVocabulary(t *testing.T) {
	if _, err := csvTable.Bind(nil); err == nil {
		t.Fatal("expected binding without the sections vocabulary to fail")
	}
}

// Type is accepted case-insensitively and stored lowercase, which is what the
// hand-written importer did before the migration.
func TestCSVTable_TypeIsFolded(t *testing.T) {
	result, err := boundCSV(t).Parse("name,type\nAlpha,ReMoTe\n", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(result.Errors) != 0 {
		t.Fatalf("mixed-case type should be accepted, got %v", result.Errors)
	}
	if result.Rows[0].Type != TypeRemote {
		t.Errorf("type = %q, want it stored lowercase as %q", result.Rows[0].Type, TypeRemote)
	}
}

// A blank network flag means false rather than an error, so a user can leave the
// column empty and mean no.
func TestCSVTable_BlankBooleanIsFalse(t *testing.T) {
	result, err := boundCSV(t).Parse("name,type,black\nAlpha,remote,\n", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(result.Errors) != 0 {
		t.Fatalf("blank boolean should be accepted, got %v", result.Errors)
	}
	if result.Rows[0].Black {
		t.Error("blank black should import as false")
	}
}

package equipment

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"backend/internal/shared/csvtable"
	"backend/internal/shared/csvtable/csvtabletest"
)

// The full column list, written out by hand. This literal IS the pin.
var wantColumns = []string{
	"id", "nomenclature", "terminal_type", "nickname", "make",
	"one_liner", "doc_number", "operational_mode", "photo_url", "data",
	"created_by", "updated_by", "updated_at", "created_at",
}

func boundOrFail(t *testing.T) *csvtable.Bound[Equipment] {
	t.Helper()
	b, err := boundCSV()
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	return b
}

func csvSampleEquipment() *Equipment {
	at := time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)
	return &Equipment{
		ID: "example-radio-1", Nomenclature: "AN/EXAMPLE-1",
		TerminalType: TerminalTypeRadio, OperationalMode: []string{"fixed", "on the move"},
		Data:      json.RawMessage(`{"bands": [{"name": "UHF"}]}`),
		CreatedBy: "tester", UpdatedBy: "tester", CreatedAt: at, UpdatedAt: at,
	}
}

func TestCSVTable(t *testing.T) {
	csvtabletest.Suite(t, boundOrFail(t), wantColumns, csvSampleEquipment())
}

// Equipment is the one domain whose id is a user-authored slug rather than a
// generated one, so unlike everywhere else it is importable and belongs in the
// template. Nothing special-cases the name - it falls out of the column having
// a parser.
func TestCSVTable_IDIsImportableHere(t *testing.T) {
	for _, m := range boundOrFail(t).Meta() {
		if m.Key == "id" {
			if !m.Templatable {
				t.Error("equipment id is user-authored and must be in the template")
			}
			if !m.Required {
				t.Error("equipment id is required on create")
			}
			return
		}
	}
	t.Fatal("no id column")
}

// The datasheet is export-only. It is the reason this domain's CSV is a seed
// rather than a backup, and it must never look importable.
func TestCSVTable_DatasheetIsExportOnly(t *testing.T) {
	for _, m := range boundOrFail(t).Meta() {
		if m.Key == "data" && m.Templatable {
			t.Fatal("data is nested JSON and cannot be filled in from a spreadsheet")
		}
	}
}

func newImportService(existing []*Equipment, sink *[]*Equipment) *Service {
	return NewService(&MockRepository{
		FindAllFunc: func(ctx context.Context, tt, search string) ([]*Equipment, error) {
			return existing, nil
		},
		CreateFunc: func(ctx context.Context, e *Equipment) error {
			*sink = append(*sink, e)
			return nil
		},
	})
}

// Documented limitation, pinned so it cannot change silently: an imported record
// arrives with an empty datasheet.
func TestImport_CreatesRecordsWithAnEmptyDatasheet(t *testing.T) {
	var created []*Equipment
	svc := newImportService(nil, &created)

	_, parsed, err := svc.ImportEquipment(context.Background(),
		"id,nomenclature,terminal_type\nnew-radio,AN/NEW-1,radio\n", "tester", false)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(parsed.Errors) != 0 {
		t.Fatalf("row should import, got %+v", parsed.Errors)
	}
	if string(created[0].Data) != "{}" {
		t.Errorf("data = %q, want an empty object", created[0].Data)
	}
}

// The permission boundary the drawer enforces per record. Without this, CSV
// would be a way around it.
func TestImport_ScopedRadioWriterCannotIntroduceSatcom(t *testing.T) {
	var created []*Equipment
	svc := newImportService(nil, &created)

	_, parsed, err := svc.ImportEquipment(context.Background(),
		"id,nomenclature,terminal_type\nok-radio,AN/OK,radio\nno-sat,AN/NO,satcom\n",
		"tester", true)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(created) != 1 || created[0].ID != "ok-radio" {
		t.Fatalf("only the radio row should be created, got %+v", created)
	}
	if len(parsed.Errors) != 1 || !strings.Contains(parsed.Errors[0].Errors[0], "radio equipment") {
		t.Errorf("expected the radio-scope refusal, got %+v", parsed.Errors)
	}
}

func TestImport_OperationalModeIsPipeSeparated(t *testing.T) {
	var created []*Equipment
	svc := newImportService(nil, &created)

	_, _, err := svc.ImportEquipment(context.Background(),
		"id,nomenclature,terminal_type,operational_mode\nm,AN/M,radio,fixed| on the move |\n",
		"tester", false)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	got := created[0].OperationalMode
	if len(got) != 2 || got[0] != "fixed" || got[1] != "on the move" {
		t.Errorf("modes = %v, want [fixed, on the move] with the trailing blank dropped", got)
	}
}

func TestImport_RejectsDuplicateID(t *testing.T) {
	var created []*Equipment
	svc := newImportService([]*Equipment{{ID: "taken"}}, &created)

	_, parsed, err := svc.ImportEquipment(context.Background(),
		"id,nomenclature,terminal_type\nTAKEN,AN/DUP,radio\n", "tester", false)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(parsed.Errors) != 1 || !strings.Contains(parsed.Errors[0].Errors[0], "already exists") {
		t.Errorf("expected a duplicate error, got %+v", parsed.Errors)
	}
}

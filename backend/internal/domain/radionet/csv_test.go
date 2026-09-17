package radionet

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
	"id", "section", "name", "net_id", "radio_type",
	"tx_freq", "rx_freq", "freq_unit", "roip", "description", "notes",
	"created_by", "updated_by", "updated_at", "created_at",
}

func boundOrFail(t *testing.T) *csvtable.Bound[Net] {
	t.Helper()
	b, err := boundCSV()
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	return b
}

func csvSampleNet() *Net {
	at := time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)
	return &Net{
		ID: "550e8400-e29b-41d4-a716-446655440000", Section: "asqd",
		Name: "EXAMPLE NET", NetID: "N01", RadioType: RadioTypeJEM,
		TxFreq: "30.5", RxFreq: "30.5", FreqUnit: FreqUnitMHz,
		CreatedBy: "tester", UpdatedBy: "tester", CreatedAt: at, UpdatedAt: at,
	}
}

func TestCSVTable(t *testing.T) {
	csvtabletest.Suite(t, boundOrFail(t), wantColumns, csvSampleNet())
}

// Section is exported so a file says where it came from, but it is never read
// back: the squadron is the write target, taken from the URL.
func TestCSVTable_SectionIsExportOnly(t *testing.T) {
	for _, m := range boundOrFail(t).Meta() {
		if m.Key == "section" && m.Templatable {
			t.Fatal("section must not be importable - it would let a file pick its own squadron")
		}
	}
}

func newImportService(section string, existing []*Net, sink *[]*Net) *Service {
	return NewService(&MockRepository{
		SectionExistsFunc: func(ctx context.Context, s string) (bool, error) { return s == section, nil },
		FindBySectionFunc: func(ctx context.Context, s string) ([]*Net, error) { return existing, nil },
		CreateFunc: func(ctx context.Context, n *Net) error {
			*sink = append(*sink, n)
			return nil
		},
	})
}

// The security-relevant one: a file naming another squadron still imports into
// the squadron in the URL.
func TestImport_SectionComesFromTheURLNotTheFile(t *testing.T) {
	var created []*Net
	svc := newImportService("asqd", nil, &created)

	_, parsed, err := svc.ImportNets(context.Background(), "asqd",
		"section,name,radio_type\nbsqd,SMUGGLED,jem\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(parsed.Errors) != 0 {
		t.Fatalf("row should import, got %+v", parsed.Errors)
	}
	if len(created) != 1 || created[0].Section != "asqd" {
		t.Fatalf("row landed in %q, want asqd", created[0].Section)
	}
}

// Uniqueness is per squadron, matching create: two squadrons commonly run a net
// of the same name on different frequencies.
func TestImport_DuplicateIsScopedToTheSquadron(t *testing.T) {
	var created []*Net
	svc := newImportService("asqd", []*Net{{Name: "SHARED", Section: "asqd"}}, &created)

	_, parsed, err := svc.ImportNets(context.Background(), "asqd",
		"name,radio_type\nshared,jem\nDISTINCT,both\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(created) != 1 || created[0].Name != "DISTINCT" {
		t.Fatalf("expected only DISTINCT created, got %+v", created)
	}
	if len(parsed.Errors) != 1 || !strings.Contains(parsed.Errors[0].Errors[0], "already exists") {
		t.Errorf("expected a duplicate error, got %+v", parsed.Errors)
	}
}

// freq_unit is case-sensitive on purpose: it prints on a wheel as written.
func TestImport_FreqUnitIsCaseSensitive(t *testing.T) {
	var created []*Net
	svc := newImportService("asqd", nil, &created)

	_, parsed, err := svc.ImportNets(context.Background(), "asqd",
		"name,radio_type,freq_unit\nLOWER,jem,mhz\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(parsed.Errors) != 1 {
		t.Fatalf("lowercase mhz should be rejected, got %+v", parsed.Errors)
	}
}

// radio_type is folded, unlike freq_unit, because it is never printed raw.
func TestImport_RadioTypeIsFolded(t *testing.T) {
	var created []*Net
	svc := newImportService("asqd", nil, &created)

	_, parsed, err := svc.ImportNets(context.Background(), "asqd",
		"name,radio_type\nUPPER,JEM\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(parsed.Errors) != 0 {
		t.Fatalf("uppercase JEM should be accepted, got %+v", parsed.Errors)
	}
	if created[0].RadioType != RadioTypeJEM {
		t.Errorf("radio_type = %q, want it stored lowercase", created[0].RadioType)
	}
}

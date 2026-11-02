package platform

import (
	"context"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"backend/internal/shared/csvtable"
	"backend/internal/shared/csvtable/csvtabletest"
)

// The full column list, written out by hand. This literal IS the pin.
var wantColumns = []string{
	"id", "designation", "popular_name", "category", "type",
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
		PopularName: "Lightning II", Category: []string{"USMC", "USN", "USAF"}, Type: "aircraft",
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
		"designation,category,type,waveform_abbrevs,equipment_ids\n"+
			"F-35A,Air Force; usn ;USAF,,L16; MADL ;l16,r1;r2\n"+
			"TYPE 45,,Ship,,\n", "tester")
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
	// A branch name and a lower-case abbrev both land as abbrevs, repeats
	// collapse, and the result is in precedence order.
	if !slices.Equal(created[0].Category, []string{"USN", "USAF"}) || created[0].Type != "aircraft" {
		t.Errorf("row 1 category/type = %v/%q, want [USN USAF]/aircraft", created[0].Category, created[0].Type)
	}
	// No category is a valid row: there is no branch it could default to.
	if len(created[1].Category) != 0 {
		t.Errorf("row 2 category = %v, want empty", created[1].Category)
	}
	if created[1].Type != "ship" || len(created[1].WaveformAbbrevs) != 0 {
		t.Errorf("row 2 = %+v, want type ship and no abbrevs", created[1])
	}
}

// Category is closed, so a value that is not a branch is a row error naming
// it, and the rest of the file still lands.
func TestImport_RejectsACategoryThatIsNotABranch(t *testing.T) {
	var created []*Platform
	svc := NewService(&MockRepository{
		FindAllFunc: func(ctx context.Context) ([]*Platform, error) { return nil, nil },
		CreateFunc: func(ctx context.Context, p *Platform) error {
			created = append(created, p)
			return nil
		},
	})
	_, parsed, err := svc.ImportPlatforms(context.Background(),
		"designation,category\nF-15E,USAF\nTYPE 45,joint\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(created) != 1 || created[0].Designation != "F-15E" {
		t.Fatalf("want only F-15E created, got %+v", created)
	}
	if len(parsed.Errors) != 1 || !strings.Contains(strings.Join(parsed.Errors[0].Errors, " "), "joint") {
		t.Errorf("want one row error naming %q, got %+v", "joint", parsed.Errors)
	}
}

// Type is closed since migration 045: "launch platform" is a row error
// naming the value, and the rest of the file still lands.
func TestImport_RejectsATypeOutsideTheList(t *testing.T) {
	var created []*Platform
	svc := NewService(&MockRepository{
		FindAllFunc: func(ctx context.Context) ([]*Platform, error) { return nil, nil },
		CreateFunc: func(ctx context.Context, p *Platform) error {
			created = append(created, p)
			return nil
		},
	})
	_, parsed, err := svc.ImportPlatforms(context.Background(),
		"designation,type\nML-1,launch platform\nDDG-51,Ship\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(created) != 1 || created[0].Designation != "DDG-51" || created[0].Type != "ship" {
		t.Fatalf("want only DDG-51 created as ship, got %+v", created)
	}
	if len(parsed.Errors) != 1 || !strings.Contains(strings.Join(parsed.Errors[0].Errors, " "), "launch platform") {
		t.Errorf("want one row error naming %q, got %+v", "launch platform", parsed.Errors)
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

// A rejection the service makes after parsing - an unknown waveform here - must
// name the line it came from. The service used to number it `i + 2` off the
// rows that survived parsing, so with the template's comments kept and one
// earlier row refused by the parser, MADL-X was reported on a line holding a
// different platform. The report also has to come back in file order.
func TestImport_ServiceRejectionsNameTheFileLineInOrder(t *testing.T) {
	svc := platformSvc(libraryOf("L16"), nil)
	raw := "# instructions\n# more\n" + // lines 1-2
		"designation,waveform_abbrevs\n" + // 3
		",L16\n" + // 4: parser refuses, designation is required
		"F-35A,L16\n" + // 5
		"F-22A,MADL-X\n" + // 6: service refuses, unknown waveform
		"B-2A,L16\n" // 7

	status, parsed, err := svc.ImportPlatforms(context.Background(), raw, "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if status != http.StatusMultiStatus {
		t.Errorf("status = %d, want 207", status)
	}
	if len(parsed.Errors) != 2 || parsed.Errors[0].Row != 4 || parsed.Errors[1].Row != 6 ||
		parsed.Errors[1].Name != "F-22A" {
		t.Errorf("errors = %+v, want line 4 (blank) then line 6 (F-22A)", parsed.Errors)
	}
	if len(parsed.Rows) != 2 || parsed.Rows[0].Designation != "F-35A" || parsed.Rows[1].Designation != "B-2A" {
		t.Errorf("rows = %+v, want F-35A and B-2A created", parsed.Rows)
	}
}

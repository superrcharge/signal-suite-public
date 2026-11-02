package organization

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"backend/internal/shared/csvtable"
	"backend/internal/shared/csvtable/csvtabletest"
)

// The full column list, written out by hand. This literal IS the pin.
var wantColumns = []string{
	"key", "name", "short_label", "branch", "color", "section_key", "notes",
	"created_by", "updated_by", "updated_at", "created_at",
}

func boundOrFail(t *testing.T) *csvtable.Bound[Organization] {
	t.Helper()
	b, err := boundCSV()
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	return b
}

func csvSampleOrganization() *Organization {
	at := time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)
	return &Organization{
		Key: "example_air_wing", Name: "EXAMPLE AIR WING", ShortLabel: "EAW",
		Branch: "USAF", Color: "#3b82f6", SectionKey: "asqd",
		Notes:     "A note with a comma, and \"quotes\"",
		CreatedBy: "tester", UpdatedBy: "tester", CreatedAt: at, UpdatedAt: at,
	}
}

func TestCSVTable(t *testing.T) {
	csvtabletest.Suite(t, boundOrFail(t), wantColumns, csvSampleOrganization())
}

// importSvc is a service over a repository holding existing, recording every
// row Create is handed. sections nil leaves the lister unwired.
func importSvc(existing []*Organization, sections []string) (*Service, *[]*Organization) {
	var created []*Organization
	svc := NewService(&MockRepository{
		FindAllFunc: func(context.Context) ([]*Organization, error) { return existing, nil },
		CreateFunc: func(_ context.Context, o *Organization) error {
			created = append(created, o)
			return nil
		},
	})
	if sections != nil {
		svc.SetSectionLister(&fakeSections{keys: sections})
	}
	return svc, &created
}

func errText(parsed *csvtable.ParseResult[Organization], i int) string {
	return strings.Join(parsed.Errors[i].Errors, " ")
}

func TestExport_StartsWithTheKeyAndCarriesEveryRow(t *testing.T) {
	svc, _ := importSvc([]*Organization{csvSampleOrganization()}, nil)
	body, err := svc.ExportOrganizations(context.Background(), nil)
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(body), "\n")
	if !strings.HasPrefix(lines[0], "key,name,short_label,branch,color,section_key,notes") {
		t.Errorf("header = %q, want it to start with the key column", lines[0])
	}
	if !strings.HasPrefix(lines[1], "example_air_wing,EXAMPLE AIR WING,EAW,USAF,#3b82f6,asqd,") {
		t.Errorf("row = %q, want the sample organization", lines[1])
	}
}

func TestExport_RejectsAnUnknownColumn(t *testing.T) {
	svc, _ := importSvc(nil, nil)
	if _, err := svc.ExportOrganizations(context.Background(), []string{"operation_count"}); err == nil {
		t.Error("operation_count is computed on read and is not an export column; want an error")
	}
}

func TestTemplate_RoundTripsThroughImport(t *testing.T) {
	svc, created := importSvc(nil, []string{"asqd"})
	tmpl, err := svc.GetImportTemplate(context.Background(), nil)
	if err != nil {
		t.Fatalf("template: %v", err)
	}
	// The template's own example rows must be importable as they stand, or the
	// file a user is handed first fails on its first upload.
	status, parsed, err := svc.ImportOrganizations(context.Background(), tmpl, "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if status != http.StatusMultiStatus || len(parsed.Errors) != 0 || len(*created) != 2 {
		t.Fatalf("status %d, errors %+v, created %d; want 207, none, 2", status, parsed.Errors, len(*created))
	}
}

func TestImport_CreatesNormalisedRows(t *testing.T) {
	svc, created := importSvc(nil, []string{"asqd"})
	status, parsed, err := svc.ImportOrganizations(context.Background(),
		"key,name,short_label,branch,color,section_key,notes\n"+
			"  Army_Aviation ,  Army Aviation ,AVN,Army,#112233,asqd, a note \n"+
			"coalition,Coalition,,,,,\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if status != http.StatusMultiStatus || len(parsed.Errors) != 0 {
		t.Fatalf("status %d, errors %+v; want 207 and none", status, parsed.Errors)
	}
	if len(*created) != 2 {
		t.Fatalf("want 2 created, got %d", len(*created))
	}
	a, c := (*created)[0], (*created)[1]
	if a.Key != "army_aviation" || a.Name != "Army Aviation" || a.Branch != "USA" || a.SectionKey != "asqd" || a.Notes != "a note" {
		t.Errorf("row 1 = %+v, want a lowercased key, trimmed name and notes, and Army stored as USA", a)
	}
	if a.CreatedBy != "tester" || a.UpdatedBy != "tester" || a.CreatedAt.IsZero() {
		t.Errorf("row 1 = %+v, want it stamped with the actor and a time", a)
	}
	if c.Branch != "" || c.SectionKey != "" {
		t.Errorf("row 2 = %+v, want blank branch and section left blank", c)
	}
}

// Branch is closed, so a value that is not one is a row error naming it, and
// the rest of the file still lands.
func TestImport_RejectsABadRowAndKeepsTheRest(t *testing.T) {
	svc, created := importSvc(nil, nil)
	status, parsed, err := svc.ImportOrganizations(context.Background(),
		"key,name,branch\ngood,Good,USAF\nbad branch,Bad Branch,USAF\nbadkey,Bad Key,joint\n_under,Under,\n,Blank,\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if status != http.StatusMultiStatus {
		t.Errorf("status = %d, want 207", status)
	}
	if len(*created) != 1 || (*created)[0].Key != "good" {
		t.Fatalf("want only good created, got %+v", *created)
	}
	if len(parsed.Errors) != 4 {
		t.Fatalf("want 4 row errors, got %+v", parsed.Errors)
	}
	if !strings.Contains(errText(parsed, 0), "key must be lowercase") {
		t.Errorf("row 3 error = %q, want the key rule", errText(parsed, 0))
	}
	if !strings.Contains(errText(parsed, 1), "joint") {
		t.Errorf("row 4 error = %q, want it to name the branch", errText(parsed, 1))
	}
	if !strings.Contains(errText(parsed, 2), "key must be lowercase") {
		t.Errorf("row 5 error = %q, want the key rule", errText(parsed, 2))
	}
	if !strings.Contains(errText(parsed, 3), "key is required") {
		t.Errorf("row 6 error = %q, want key is required", errText(parsed, 3))
	}
}

func TestImport_AllRowsFailingIsA400(t *testing.T) {
	svc, _ := importSvc(nil, nil)
	status, parsed, err := svc.ImportOrganizations(context.Background(), "key,name\nBad Key,X\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if status != http.StatusBadRequest || len(parsed.Errors) != 1 {
		t.Errorf("status %d, errors %+v; want 400 and one error", status, parsed.Errors)
	}
}

// Import creates and never updates: the key is what operation participants
// point at, so an existing one is a duplicate, not an overwrite.
func TestImport_NeverUpdatesAnExistingKey(t *testing.T) {
	svc, created := importSvc([]*Organization{{Key: "green", Name: "Green"}}, nil)
	_, parsed, err := svc.ImportOrganizations(context.Background(),
		"key,name\nGREEN,Renamed\nblue,Blue\nblue,Blue Again\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(*created) != 1 || (*created)[0].Key != "blue" {
		t.Fatalf("want only blue created, got %+v", *created)
	}
	if len(parsed.Errors) != 2 ||
		!strings.Contains(errText(parsed, 0), "key already exists") ||
		!strings.Contains(errText(parsed, 1), "more than once") {
		t.Errorf("errors = %+v, want a stored-key duplicate then an in-file duplicate", parsed.Errors)
	}
}

func TestImport_RejectsADuplicateName(t *testing.T) {
	svc, created := importSvc([]*Organization{{Key: "green", Name: "Green"}}, nil)
	_, parsed, err := svc.ImportOrganizations(context.Background(),
		"key,name\nother,green\nfirst,Same Name\nsecond,same name\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(*created) != 1 || (*created)[0].Key != "first" {
		t.Fatalf("want only first created, got %+v", *created)
	}
	if len(parsed.Errors) != 2 || !strings.Contains(errText(parsed, 0), "name already exists") ||
		!strings.Contains(errText(parsed, 1), "name already exists") {
		t.Errorf("errors = %+v, want two name duplicates", parsed.Errors)
	}
}

func TestImport_ChecksTheSectionLink(t *testing.T) {
	svc, created := importSvc([]*Organization{{Key: "green", Name: "Green", SectionKey: "asqd"}}, []string{"asqd", "bsqd", "csqd"})
	_, parsed, err := svc.ImportOrganizations(context.Background(),
		"key,name,section_key\nnosuch,No Such,zzz\ntaken,Taken,asqd\nfree,Free,bsqd\nrival,Rival,bsqd\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(*created) != 1 || (*created)[0].Key != "free" {
		t.Fatalf("want only free created, got %+v", *created)
	}
	if len(parsed.Errors) != 3 ||
		!strings.Contains(errText(parsed, 0), "is not a section") ||
		!strings.Contains(errText(parsed, 1), "already linked") ||
		!strings.Contains(errText(parsed, 2), "already linked") {
		t.Errorf("errors = %+v, want unknown section, then two already-linked", parsed.Errors)
	}
}

// A refused row must not claim its name or section, or a later valid row would
// be reported as a duplicate of something that never landed.
func TestImport_ARefusedRowDoesNotClaimItsName(t *testing.T) {
	svc, created := importSvc(nil, nil)
	_, parsed, err := svc.ImportOrganizations(context.Background(),
		"key,name,branch\nfirst,Shared,joint\nsecond,Shared,USAF\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(*created) != 1 || (*created)[0].Key != "second" || len(parsed.Errors) != 1 {
		t.Errorf("created %+v, errors %+v; want only second created and one error", *created, parsed.Errors)
	}
}

func TestImport_RefusesAnOverlongCell(t *testing.T) {
	svc, created := importSvc(nil, nil)
	_, parsed, err := svc.ImportOrganizations(context.Background(),
		"key,name,short_label\nlong,Long,"+strings.Repeat("x", 21)+"\n", "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(*created) != 0 || len(parsed.Errors) != 1 || !strings.Contains(errText(parsed, 0), "longer than 20") {
		t.Errorf("created %+v, errors %+v; want a short label length error", *created, parsed.Errors)
	}
}

// A rejection the service makes after parsing must name the line it came from,
// with the template's comment lines kept and an earlier row refused by the
// parser.
func TestImport_ServiceRejectionsNameTheFileLine(t *testing.T) {
	svc, _ := importSvc([]*Organization{{Key: "taken", Name: "Taken"}}, nil)
	raw := "# instructions\n# more\n" + // lines 1-2
		"key,name\n" + // 3
		",Blank\n" + // 4: parser refuses, key is required
		"fine,Fine\n" + // 5
		"other,Taken\n" + // 6: service refuses, name taken
		"last,Last\n" // 7

	status, parsed, err := svc.ImportOrganizations(context.Background(), raw, "tester")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if status != http.StatusMultiStatus {
		t.Errorf("status = %d, want 207", status)
	}
	if len(parsed.Errors) != 2 || parsed.Errors[0].Row != 4 || parsed.Errors[1].Row != 6 || parsed.Errors[1].Name != "other" {
		t.Errorf("errors = %+v, want line 4 (blank key) then line 6 (other)", parsed.Errors)
	}
	if len(parsed.Rows) != 2 || parsed.Rows[0].Key != "fine" || parsed.Rows[1].Key != "last" {
		t.Errorf("rows = %+v, want fine and last created", parsed.Rows)
	}
}

func TestImport_RejectsAFileWithoutTheKeyColumn(t *testing.T) {
	svc, _ := importSvc(nil, nil)
	if _, _, err := svc.ImportOrganizations(context.Background(), "name\nGreen\n", "tester"); err == nil {
		t.Error("a header with no key column must be refused, got nil error")
	}
}

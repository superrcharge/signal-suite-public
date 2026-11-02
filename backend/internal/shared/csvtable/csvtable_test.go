package csvtable_test

import (
	"slices"
	"strings"
	"testing"

	"backend/internal/shared/csvtable"
	"backend/internal/shared/csvtable/csvtabletest"
	"backend/internal/shared/response"
)

// A stand-in domain exercising every column shape the real ones use: an id that
// is exported but refused on import, a required identity, a defaulted enum, a
// dynamic vocabulary, a nullable, a boolean, and a server-owned timestamp.
type widget struct {
	ID      string
	Name    string
	Status  string
	Section string
	Owner   *string
	Active  bool
	Updated string
}

func table() *csvtable.Table[widget] {
	return &csvtable.Table[widget]{
		Domain:      "WIDGET",
		Noun:        "widget",
		NounPlural:  "widgets",
		FilePrefix:  "signal-suite-widgets",
		Identity:    "name",
		ExampleRows: 2,
		New:         func() *widget { return &widget{} },
		Preamble:    []string{"REQUIRED: name."},
		Columns: []csvtable.Column[widget]{
			{
				Key: "id", Label: "ID", RejectOnImport: true,
				Get: csvtable.Str(func(w *widget) string { return w.ID }),
			},
			{
				Key: "name", Label: "Name", Required: true,
				Get:     csvtable.Str(func(w *widget) string { return w.Name }),
				Set:     csvtable.SetStr(func(w *widget, v string) { w.Name = v }),
				Example: []string{"EXAMPLE ONE", "EXAMPLE TWO"},
			},
			{
				Key: "status", Label: "Status", Enum: []string{"on", "off"}, Default: "on",
				Note:    "Status: on | off",
				Get:     csvtable.Str(func(w *widget) string { return w.Status }),
				Set:     csvtable.SetStr(func(w *widget, v string) { w.Status = v }),
				Example: []string{"on"},
			},
			{
				Key: "section", Label: "Section", DynamicEnum: "sections",
				Get:     csvtable.Str(func(w *widget) string { return w.Section }),
				Set:     csvtable.SetStr(func(w *widget, v string) { w.Section = v }),
				Example: []string{"asqd"},
			},
			{
				Key: "owner", Label: "Owner",
				Get: csvtable.PtrStr(func(w *widget) *string { return w.Owner }),
				Set: csvtable.SetPtrStr(func(w *widget, v *string) { w.Owner = v }),
			},
			{
				Key: "active", Label: "Active",
				Get:     csvtable.Bool(func(w *widget) bool { return w.Active }),
				Set:     csvtable.SetBool(func(w *widget, v bool) { w.Active = v }),
				Example: []string{"true"},
			},
			{
				Key: "updated_at", Label: "Updated At",
				Get: csvtable.Str(func(w *widget) string { return w.Updated }),
			},
		},
	}
}

var wantKeys = []string{"id", "name", "status", "section", "owner", "active", "updated_at"}

func bind(t *testing.T) *csvtable.Bound[widget] {
	t.Helper()
	b, err := table().Bind(csvtable.Vocab{"sections": {"asqd", "bsqd"}})
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	return b
}

// The harness is itself under test here: if it stops catching things, every
// domain that relies on it stops being covered.
func TestSuite(t *testing.T) {
	csvtabletest.Suite(t, bind(t), wantKeys, &widget{ID: "w1", Name: "Widget One"})
}

func TestBind_MissingVocabularyIsAnError(t *testing.T) {
	// A dynamic column with no vocabulary would accept anything, so this fails
	// loudly rather than letting a validation rule quietly stop running.
	if _, err := table().Bind(nil); err == nil {
		t.Fatal("expected an error when the sections vocabulary is absent")
	}
}

func TestExport_SubsetKeepsCanonicalOrder(t *testing.T) {
	b := bind(t)
	body, err := b.Export([]*widget{{ID: "w1", Name: "One", Active: true}}, []string{"active", "name"})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	header, _, _ := strings.Cut(body, "\n")
	if header != "name,active" {
		t.Errorf("header = %q, want %q", header, "name,active")
	}
}

func TestExport_UnknownColumnCarriesTheDomainCode(t *testing.T) {
	_, err := bind(t).Export(nil, []string{"nope"})
	if err == nil {
		t.Fatal("expected an error")
	}
	coded, ok := err.(response.CodedError)
	if !ok {
		t.Fatalf("error is not a CodedError: %T", err)
	}
	if coded.GetCode() != "WIDGET_INVALID_EXPORT_COLUMN" {
		t.Errorf("code = %q, want WIDGET_INVALID_EXPORT_COLUMN", coded.GetCode())
	}
	if coded.GetStatus() != 400 {
		t.Errorf("status = %d, want 400", coded.GetStatus())
	}
}

func TestTemplate_DropsServerOwnedAndNotesOnlyWhatItShows(t *testing.T) {
	b := bind(t)
	body, err := b.Template([]string{"name", "owner", "updated_at"})
	if err != nil {
		t.Fatalf("template: %v", err)
	}
	if strings.Contains(body, "updated_at") {
		t.Error("a server-owned column must be dropped from the template, not emitted")
	}
	// status was not selected, so its note has no business being printed.
	if strings.Contains(body, "Status: on | off") {
		t.Error("template explained a column it does not contain")
	}
}

func TestTemplate_BuildsTheDynamicNoteFromTheBoundVocabulary(t *testing.T) {
	body, err := bind(t).Template(nil)
	if err != nil {
		t.Fatalf("template: %v", err)
	}
	if !strings.Contains(body, "Section: asqd | bsqd") {
		t.Errorf("template should list the bound section keys, got:\n%s", body)
	}
}

func TestParse_AppliesDefaultBeforeValidating(t *testing.T) {
	result, err := bind(t).Parse("name,status\nAlpha,\n", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(result.Errors) != 0 {
		t.Fatalf("blank status should default, got errors: %v", result.Errors)
	}
	if result.Rows[0].Status != "on" {
		t.Errorf("status = %q, want the default %q", result.Rows[0].Status, "on")
	}
}

func TestParse_CollectsEveryProblemOnARow(t *testing.T) {
	result, err := bind(t).Parse("name,status,section\n,nope,zsqd\n", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(result.Errors) != 1 {
		t.Fatalf("want 1 row error, got %d", len(result.Errors))
	}
	// One pass should tell the user everything wrong with the row, not the first
	// thing wrong with it.
	if n := len(result.Errors[0].Errors); n != 3 {
		t.Errorf("want 3 problems reported (name, status, section), got %d: %v",
			n, result.Errors[0].Errors)
	}
	if result.Errors[0].Name != "(blank)" {
		t.Errorf("a row with no name should be labelled (blank), got %q", result.Errors[0].Name)
	}
}

func TestParse_DuplicatesAgainstStorageAndAgainstTheFile(t *testing.T) {
	result, err := bind(t).Parse("name\nAlpha\nBravo\nbravo\n", []string{"ALPHA"})
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(result.Rows) != 1 || result.Rows[0].Name != "Bravo" {
		t.Fatalf("want only Bravo imported, got %d row(s)", len(result.Rows))
	}
	if len(result.Errors) != 2 {
		t.Fatalf("want 2 duplicate errors, got %d: %v", len(result.Errors), result.Errors)
	}
	// Case-insensitive both ways: Alpha against stored ALPHA, bravo against Bravo.
	if !strings.Contains(result.Errors[0].Errors[0], "already exists") {
		t.Errorf("first error should be the stored duplicate, got %v", result.Errors[0].Errors)
	}
	if !strings.Contains(result.Errors[1].Errors[0], "more than once") {
		t.Errorf("second error should be the in-file duplicate, got %v", result.Errors[1].Errors)
	}
}

func TestParse_RejectsAFileCarryingID(t *testing.T) {
	_, err := bind(t).Parse("id,name\nw1,Alpha\n", nil)
	if err == nil {
		t.Fatal("expected a file with an id column to be refused")
	}
	if !strings.Contains(err.Error(), "came from an export") {
		t.Errorf("the message should explain why, got %q", err.Error())
	}
}

func TestParse_MissingIdentityColumnIsAHardFailure(t *testing.T) {
	_, err := bind(t).Parse("status\non\n", nil)
	if err == nil {
		t.Fatal("expected a missing name column to be refused")
	}
	coded, ok := err.(response.CodedError)
	if !ok {
		t.Fatalf("error is not a CodedError: %T", err)
	}
	if coded.GetCode() != "WIDGET_MISSING_NAME_COLUMN" {
		t.Errorf("code = %q, want WIDGET_MISSING_NAME_COLUMN", coded.GetCode())
	}
}

func TestParse_IgnoresCommentsAndBlankLines(t *testing.T) {
	// A user should be able to fill in a template and upload it without first
	// deleting the instructions.
	result, err := bind(t).Parse("# a comment\n\nname\nAlpha\n\n# trailing\n", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(result.Rows) != 1 {
		t.Fatalf("want 1 row, got %d", len(result.Rows))
	}
}

// rowsOf is the row numbers an import reported, in order.
func rowsOf(errs []csvtable.RowError) []int {
	out := make([]int, len(errs))
	for i, e := range errs {
		out[i] = e.Row
	}
	return out
}

func TestParse_RowNumbersAreFileLines(t *testing.T) {
	// The template ships with its instructions as # lines and the importer
	// accepts them, so the number a user is given has to be the line in the file
	// they uploaded. Dropping the comments before counting reported every row
	// short by the size of the preamble.
	raw := "# instructions\n# more instructions\n\nname,status\nAlpha,on\n,on\nGamma,bogus\n"
	result, err := bind(t).Parse(raw, nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got, want := rowsOf(result.Errors), []int{6, 7}; !slices.Equal(got, want) {
		t.Errorf("error rows = %v, want %v", got, want)
	}
	if got, want := result.Lines, []int{5}; !slices.Equal(got, want) {
		t.Errorf("lines = %v, want %v", got, want)
	}
}

func TestParse_QuotedNewlineKeepsLaterRowNumbersRight(t *testing.T) {
	raw := "name,status\n\"Al\npha\",on\n,on\n"
	result, err := bind(t).Parse(raw, nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got, want := rowsOf(result.Errors), []int{4}; !slices.Equal(got, want) {
		t.Errorf("error rows = %v, want %v", got, want)
	}
}

func TestParse_ShortRowReadsAsBlankCells(t *testing.T) {
	// Spreadsheet tools trim trailing empty cells. The reader's own width check
	// failed that read, and a failed read ended the loop, dropping the row and
	// every row after it without a word.
	result, err := bind(t).Parse("name,status,owner\nAlpha\nBeta,off,x\n", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(result.Errors) != 0 {
		t.Fatalf("want no errors, got %+v", result.Errors)
	}
	if len(result.Rows) != 2 {
		t.Fatalf("want 2 rows, got %d", len(result.Rows))
	}
	if result.Rows[0].Status != "on" {
		t.Errorf("short row status = %q, want the default", result.Rows[0].Status)
	}
}

func TestParse_LongRowIsARowErrorAndTheRestImport(t *testing.T) {
	result, err := bind(t).Parse("name,status\nAlpha,on,stray\nBeta,on\n", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(result.Rows) != 1 || result.Rows[0].Name != "Beta" {
		t.Fatalf("want only Beta imported, got %+v", result.Rows)
	}
	if len(result.Errors) != 1 || result.Errors[0].Row != 2 ||
		!strings.Contains(result.Errors[0].Errors[0], "double quotes") {
		t.Errorf("want one row-2 error about quoting, got %+v", result.Errors)
	}
}

func TestParse_MalformedQuoteIsARowErrorAndTheRestImport(t *testing.T) {
	result, err := bind(t).Parse("name,status\nAl\"pha,on\nBeta,on\n", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(result.Rows) != 1 || result.Rows[0].Name != "Beta" {
		t.Fatalf("want Beta still imported, got %+v", result.Rows)
	}
	if got, want := result.Lines, []int{3}; !slices.Equal(got, want) {
		t.Errorf("lines = %v, want %v", got, want)
	}
	if len(result.Errors) != 1 || result.Errors[0].Row != 2 {
		t.Errorf("want one error at row 2, got %+v", result.Errors)
	}
}

func TestReject_NumbersByFileLineAndFinishKeepsLinesAligned(t *testing.T) {
	// Line 2 fails in the parser, so Rows starts at line 3. A service rejecting
	// Rows[1] must report line 4 - `i + 2` said 3, which is Alpha.
	result, err := bind(t).Parse("name,status\n,on\nAlpha,on\nBeta,on\nGamma,on\n", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	result.Reject(1, "Beta", "could not be saved")

	if status := result.Finish(); status != 207 {
		t.Errorf("status = %d, want 207", status)
	}
	if got, want := rowsOf(result.Errors), []int{2, 4}; !slices.Equal(got, want) {
		t.Errorf("error rows = %v, want %v, in order", got, want)
	}
	if len(result.Rows) != 2 || result.Rows[0].Name != "Alpha" || result.Rows[1].Name != "Gamma" {
		t.Errorf("rows = %+v, want Alpha and Gamma", result.Rows)
	}
	if got, want := result.Lines, []int{3, 5}; !slices.Equal(got, want) {
		t.Errorf("lines = %v, want %v", got, want)
	}
}

func TestFinish_EveryRowRejectedIs400(t *testing.T) {
	result, err := bind(t).Parse("name\nAlpha\n", nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	result.Reject(0, "Alpha", "could not be saved")
	if status := result.Finish(); status != 400 {
		t.Errorf("status = %d, want 400", status)
	}
}

func TestParse_ExportOnlyTableRefuses(t *testing.T) {
	tbl := table()
	tbl.New = nil
	b, err := tbl.Bind(csvtable.Vocab{"sections": {"asqd"}})
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	_, err = b.Parse("name\nAlpha\n", nil)
	if err == nil {
		t.Fatal("a table with no New must refuse to parse")
	}
	if coded, ok := err.(response.CodedError); !ok || coded.GetStatus() != 405 {
		t.Errorf("want a 405, got %v", err)
	}
}

func TestImportStatus(t *testing.T) {
	// 207 whenever anything was written, including a completely clean import.
	// That is what the two existing importers return and what the frontend reads.
	cases := []struct {
		imported, failed, want int
	}{
		{3, 0, 207},
		{3, 1, 207},
		{0, 2, 400},
		{0, 0, 207},
	}
	for _, c := range cases {
		if got := csvtable.ImportStatus(c.imported, c.failed); got != c.want {
			t.Errorf("ImportStatus(%d, %d) = %d, want %d", c.imported, c.failed, got, c.want)
		}
	}
}

func TestImportMessage(t *testing.T) {
	cases := []struct {
		imported, failed int
		want             string
	}{
		{1, 0, "Imported 1 terminal."},
		{3, 0, "Imported 3 terminals."},
		{3, 1, "Imported 3 terminals, 1 row skipped."},
		{0, 2, "Imported 0 terminals, 2 rows skipped."},
	}
	for _, c := range cases {
		if got := csvtable.ImportMessage("terminal", "terminals", c.imported, c.failed); got != c.want {
			t.Errorf("ImportMessage(%d, %d) = %q, want %q", c.imported, c.failed, got, c.want)
		}
	}
}

func TestParseList(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"", nil},
		{"   ", nil},
		{",,", nil},
		{"a", []string{"a"}},
		{" a , b ,, c ", []string{"a", "b", "c"}},
	}
	for _, c := range cases {
		got := csvtable.ParseList(c.in)
		if len(got) != len(c.want) {
			t.Errorf("ParseList(%q) = %v, want %v", c.in, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("ParseList(%q) = %v, want %v", c.in, got, c.want)
				break
			}
		}
	}
}

package terminal

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gofiber/fiber/v3"

	"backend/internal/shared/validator"
)

// exportFilterFor issues a real GET against the export route and returns the
// filter the service handed to the repository.
//
// A real request rather than a direct handler call, because what is being
// tested is query-param parsing - and an unrecognised param is dropped in
// silence, so a typo here would otherwise look like a passing test.
func exportFilterFor(t *testing.T, query string) ExportFilter {
	t.Helper()

	var got ExportFilter
	repo := &MockRepository{
		FindForExportFunc: func(_ context.Context, f ExportFilter) ([]*Terminal, error) {
			got = f
			return nil, nil
		},
	}
	svc, _ := newTestService(repo)
	h := NewHandler(svc, validator.New())

	app := fiber.New()
	app.Get("/api/v1/export/terminals", h.ExportTerminals)

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/v1/export/terminals"+query, nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	return got
}

func TestExportTerminals_ParsesModels(t *testing.T) {
	got := exportFilterFor(t, "?models=ow7,ow10")

	if !reflect.DeepEqual(got.Models, []string{"ow7", "ow10"}) {
		t.Errorf("models parsed as %v, want [ow7 ow10]", got.Models)
	}
}

// The list endpoint spells it `model` and the dashboard deep-links
// `?model=mini,hp`. An unrecognised param is dropped in silence, so before the
// alias the singular produced a full export that looked filtered.
func TestExportTerminals_AcceptsSingularModelAlias(t *testing.T) {
	got := exportFilterFor(t, "?model=mini,hp")

	if !reflect.DeepEqual(got.Models, []string{"mini", "hp"}) {
		t.Errorf("model parsed as %v, want [mini hp]", got.Models)
	}
}

func TestExportTerminals_MergesBothSpellings(t *testing.T) {
	// Additive rather than one silently winning, so supplying both cannot
	// quietly discard half of what was asked for.
	got := exportFilterFor(t, "?models=ow7&model=mini")

	if !reflect.DeepEqual(got.Models, []string{"ow7", "mini"}) {
		t.Errorf("merged as %v, want [ow7 mini]", got.Models)
	}
}

func TestExportTerminals_NoFilterParams(t *testing.T) {
	got := exportFilterFor(t, "")

	if len(got.Models) != 0 || len(got.Sections) != 0 || len(got.Statuses) != 0 {
		t.Errorf("expected an empty filter, got %+v", got)
	}
}

func TestExportTerminals_ParsesEveryDimension(t *testing.T) {
	// All three together, which is the combination the placeholder bug in
	// FindForExport made wrong: one filter alone cannot detect a mis-bound
	// index.
	got := exportFilterFor(t, "?sections=asqd&statuses=available&models=ow7")

	want := ExportFilter{
		Sections: []string{"asqd"},
		Statuses: []string{"available"},
		Models:   []string{"ow7"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("parsed as %+v, want %+v", got, want)
	}
}

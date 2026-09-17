package kit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gofiber/fiber/v3"

	"backend/internal/shared/validator"
)

// The mirror of terminal's exportFilterFor - see the comment there for why
// this goes through a real request rather than calling the handler directly.
func exportFilterFor(t *testing.T, query string) ExportFilter {
	t.Helper()

	var got ExportFilter
	repo := &MockRepository{
		FindForExportFunc: func(_ context.Context, f ExportFilter) ([]*Kit, error) {
			got = f
			return nil, nil
		},
	}
	svc, _ := newTestService(repo)
	h := NewHandler(svc, validator.New())

	app := fiber.New()
	app.Get("/api/v1/export/kits", h.ExportKits)

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/v1/export/kits"+query, nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	return got
}

func TestExportKits_ParsesTypes(t *testing.T) {
	got := exportFilterFor(t, "?types=remote,ifk")

	if !reflect.DeepEqual(got.Types, []string{"remote", "ifk"}) {
		t.Errorf("types parsed as %v, want [remote ifk]", got.Types)
	}
}

func TestExportKits_AcceptsSingularTypeAlias(t *testing.T) {
	got := exportFilterFor(t, "?type=atk")

	if !reflect.DeepEqual(got.Types, []string{"atk"}) {
		t.Errorf("type parsed as %v, want [atk]", got.Types)
	}
}

func TestExportKits_MergesBothSpellings(t *testing.T) {
	got := exportFilterFor(t, "?types=remote&type=atk")

	if !reflect.DeepEqual(got.Types, []string{"remote", "atk"}) {
		t.Errorf("merged as %v, want [remote atk]", got.Types)
	}
}

func TestExportKits_ParsesEveryDimension(t *testing.T) {
	got := exportFilterFor(t, "?sections=asqd&statuses=available&types=remote")

	want := ExportFilter{
		Sections: []string{"asqd"},
		Statuses: []string{"available"},
		Types:    []string{"remote"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("parsed as %+v, want %+v", got, want)
	}
}

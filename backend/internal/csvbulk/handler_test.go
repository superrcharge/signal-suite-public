package csvbulk_test

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"backend/internal/csvbulk"
	"backend/internal/shared/validator"

	"github.com/gofiber/fiber/v3"
)

var stamp = time.Date(2026, 8, 25, 9, 0, 0, 0, time.UTC)

// A registry of fakes. The real Renders call the same Service.Export* methods
// the single-dataset routes call, so there is no second rendering path to test.
// What needs pinning here is the bundling, not the CSV.
func testRegistry() *csvbulk.Registry {
	body := func(text string) csvbulk.Render {
		return func(_ context.Context, _ csvbulk.Selector) (string, error) { return text, nil }
	}
	return csvbulk.New(
		csvbulk.Dataset{
			Resource: "terminals", FilePrefix: "signal-suite-terminals",
			Export: body("name\nALPHA\n"), Template: body("name\nEXAMPLE\n"),
		},
		csvbulk.Dataset{
			Resource: "contracts", FilePrefix: "signal-suite-contracts",
			Export: body("title\nGOLDEN\n"), Template: nil,
		},
		csvbulk.Dataset{
			Resource: "nets", FilePrefix: "signal-suite-nets", SectionScoped: true,
			Export: body("name\nNET ONE\n"), Template: body("name\nEXAMPLE NET\n"),
		},
	)
}

func newApp(r *csvbulk.Registry) *fiber.App {
	app := fiber.New()
	h := csvbulk.NewHandler(r, validator.New())
	h.SetClock(func() time.Time { return stamp })
	app.Post("/api/v1/export/bundle", h.ExportBundle)
	app.Post("/api/v1/template/bundle", h.TemplateBundle)
	return app
}

func post(t *testing.T, app *fiber.App, path string, body any) *http.Response {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	req := httptest.NewRequest(fiber.MethodPost, path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	// Closed here rather than at each call site: bodyclose wants every response
	// closed, and a Cleanup keeps that one line instead of nine defers.
	t.Cleanup(func() { _ = resp.Body.Close() })
	return resp
}

func readZip(t *testing.T, resp *http.Response) *zip.Reader {
	t.Helper()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("response is not a zip (%d bytes, status %d): %v", len(data), resp.StatusCode, err)
	}
	return r
}

func entryNames(r *zip.Reader) []string {
	out := make([]string, len(r.File))
	for i, f := range r.File {
		out[i] = f.Name
	}
	return out
}

func TestExportBundle_PinsEntries(t *testing.T) {
	app := newApp(testRegistry())
	resp := post(t, app, "/api/v1/export/bundle", map[string]any{
		"datasets": []map[string]any{
			{"resource": "terminals", "columns": []string{"name"}},
			{"resource": "nets", "columns": []string{"name"}, "section": "asqd"},
		},
	})

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/zip" {
		t.Errorf("Content-Type = %q, want application/zip", ct)
	}
	if cd := resp.Header.Get("Content-Disposition"); !strings.Contains(cd, "signal-suite-export-20260825.zip") {
		t.Errorf("Content-Disposition = %q, want it to name signal-suite-export-20260825.zip", cd)
	}

	r := readZip(t, resp)
	// Entry names match what the single-dataset routes produce, including the
	// squadron on a section-scoped one.
	want := []string{"signal-suite-terminals-20260825.csv", "signal-suite-nets-asqd-20260825.csv"}
	if got := entryNames(r); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("entries = %v, want %v", got, want)
	}

	rc, err := r.File[0].Open()
	if err != nil {
		t.Fatalf("open entry: %v", err)
	}
	var buf bytes.Buffer
	if _, err := buf.ReadFrom(rc); err != nil {
		t.Fatalf("read entry: %v", err)
	}
	_ = rc.Close()
	if buf.String() != "name\nALPHA\n" {
		t.Errorf("terminals body = %q", buf.String())
	}
}

// Registry order, not request order, so the same selection always produces the
// same bytes however the request was written.
func TestExportBundle_UsesRegistryOrder(t *testing.T) {
	app := newApp(testRegistry())
	resp := post(t, app, "/api/v1/export/bundle", map[string]any{
		"datasets": []map[string]any{
			{"resource": "nets", "columns": []string{"name"}, "section": "asqd"},
			{"resource": "terminals", "columns": []string{"name"}},
		},
	})

	got := entryNames(readZip(t, resp))
	want := []string{"signal-suite-terminals-20260825.csv", "signal-suite-nets-asqd-20260825.csv"}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entries = %v, want registry order %v", got, want)
	}
}

func TestExportBundle_UnknownResource(t *testing.T) {
	app := newApp(testRegistry())
	resp := post(t, app, "/api/v1/export/bundle", map[string]any{
		"datasets": []map[string]any{{"resource": "wombats", "columns": []string{"x"}}},
	})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !strings.Contains(string(body), "wombats") {
		t.Errorf("the error should name the unknown resource, got %s", body)
	}
}

func TestExportBundle_SectionScopedNeedsASection(t *testing.T) {
	app := newApp(testRegistry())
	resp := post(t, app, "/api/v1/export/bundle", map[string]any{
		"datasets": []map[string]any{{"resource": "nets", "columns": []string{"name"}}},
	})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
}

// No partial success. A truncated archive delivered with a 200 is worse than a
// clean error, because the user cannot see what is missing.
func TestExportBundle_OneFailureFailsEverything(t *testing.T) {
	boom := csvbulk.New(
		csvbulk.Dataset{
			Resource: "terminals", FilePrefix: "signal-suite-terminals",
			Export: func(context.Context, csvbulk.Selector) (string, error) { return "ok\n", nil },
		},
		csvbulk.Dataset{
			Resource: "contracts", FilePrefix: "signal-suite-contracts",
			Export: func(context.Context, csvbulk.Selector) (string, error) {
				return "", &csvbulk.Error{Code: "X", Message: "nope", Status: http.StatusInternalServerError}
			},
		},
	)
	app := newApp(boom)
	resp := post(t, app, "/api/v1/export/bundle", map[string]any{
		"datasets": []map[string]any{
			{"resource": "terminals", "columns": []string{"a"}},
			{"resource": "contracts", "columns": []string{"b"}},
		},
	})

	if resp.StatusCode == http.StatusOK {
		t.Fatal("a failing dataset must fail the whole request, not ship a zip missing a file")
	}
	if ct := resp.Header.Get("Content-Type"); strings.Contains(ct, "zip") {
		t.Errorf("Content-Type = %q, want a JSON error rather than a partial archive", ct)
	}
}

func TestExportBundle_RejectsDuplicateResource(t *testing.T) {
	// A zip cannot hold two entries with the same name, and silently collapsing
	// them would give the user fewer files than they asked for.
	app := newApp(testRegistry())
	resp := post(t, app, "/api/v1/export/bundle", map[string]any{
		"datasets": []map[string]any{
			{"resource": "terminals", "columns": []string{"name"}},
			{"resource": "terminals", "columns": []string{"name"}},
		},
	})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
}

func TestExportBundle_RejectsEmptySelection(t *testing.T) {
	app := newApp(testRegistry())
	resp := post(t, app, "/api/v1/export/bundle", map[string]any{"datasets": []map[string]any{}})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
}

func TestTemplateBundle(t *testing.T) {
	app := newApp(testRegistry())
	resp := post(t, app, "/api/v1/template/bundle", map[string]any{
		"datasets": []map[string]any{
			{"resource": "terminals", "columns": []string{"name"}},
			{"resource": "nets", "columns": []string{"name"}, "section": "asqd"},
		},
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	// Undated and named for templates: a file called "export" full of blank
	// forms would be its own small bug.
	if cd := resp.Header.Get("Content-Disposition"); !strings.Contains(cd, "signal-suite-import-templates.zip") {
		t.Errorf("Content-Disposition = %q", cd)
	}

	got := entryNames(readZip(t, resp))
	want := []string{"signal-suite-terminals-import-template.csv", "signal-suite-nets-asqd-import-template.csv"}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("entries = %v, want %v", got, want)
	}
}

func TestTemplateBundle_RefusesAnExportOnlyDataset(t *testing.T) {
	app := newApp(testRegistry())
	resp := post(t, app, "/api/v1/template/bundle", map[string]any{
		"datasets": []map[string]any{{"resource": "contracts", "columns": []string{"title"}}},
	})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !strings.Contains(string(body), "contracts") {
		t.Errorf("the error should name the dataset, got %s", body)
	}
}

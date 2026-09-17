package terminal

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gofiber/fiber/v3"

	"backend/internal/domain/terminal/dto"
	"backend/internal/shared/validator"
)

// The tag catalog had no unit coverage at all for eight releases, while being
// the only thing that can bulk-clear a field across every terminal. These tests
// cover the two behaviours that are easy to regress silently: canonical casing
// on write, and the audit trail on delete.

// recordingRepo captures what the service asked the catalog to do.
type recordingRepo struct {
	MockRepository
	canonicalizeCalls [][]string
}

func (r *recordingRepo) CanonicalizeTags(ctx context.Context, names []string) (map[string]string, error) {
	r.canonicalizeCalls = append(r.canonicalizeCalls, names)
	return r.MockRepository.CanonicalizeTags(ctx, names)
}

// catalogOf builds a CanonicalizeTags stub that behaves like the real one:
// a name already in the catalog keeps the catalog's casing, a new one keeps
// the casing it arrived with.
func catalogOf(existing ...string) func(context.Context, []string) (map[string]string, error) {
	return func(_ context.Context, names []string) (map[string]string, error) {
		out := map[string]string{}
		for _, e := range existing {
			out[lower(e)] = e
		}
		for _, n := range names {
			if _, ok := out[lower(n)]; !ok {
				out[lower(n)] = n
			}
		}
		return out, nil
	}
}

func lower(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'A' && b[i] <= 'Z' {
			b[i] += 'a' - 'A'
		}
	}
	return string(b)
}

func TestCreateTerminal_StoresCanonicalTagCasing(t *testing.T) {
	tests := []struct {
		name     string
		catalog  []string
		tag      *string
		wantTag  *string
		wantSeen [][]string
	}{
		{
			name:     "existing catalog casing wins",
			catalog:  []string{"Op Alpha"},
			tag:      strPtr("op alpha"),
			wantTag:  strPtr("Op Alpha"),
			wantSeen: [][]string{{"op alpha"}},
		},
		{
			name:     "a brand new tag keeps what was typed",
			catalog:  nil,
			tag:      strPtr("Operation Avalanche"),
			wantTag:  strPtr("Operation Avalanche"),
			wantSeen: [][]string{{"Operation Avalanche"}},
		},
		{
			name:     "surrounding whitespace is trimmed before the catalog sees it",
			catalog:  nil,
			tag:      strPtr("  Op Bravo  "),
			wantTag:  strPtr("Op Bravo"),
			wantSeen: [][]string{{"Op Bravo"}},
		},
		{
			name:     "a blank tag never reaches the catalog",
			catalog:  nil,
			tag:      strPtr("   "),
			wantTag:  nil,
			wantSeen: nil,
		},
		{
			name:     "no tag never reaches the catalog",
			catalog:  nil,
			tag:      nil,
			wantTag:  nil,
			wantSeen: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var saved *Terminal
			repo := &recordingRepo{}
			repo.CreateFunc = func(_ context.Context, term *Terminal) error {
				saved = term
				return nil
			}
			repo.CanonicalizeTagsFunc = catalogOf(tt.catalog...)

			svc, _ := newTestService(repo)
			resp := &dto.CreateTerminalResponse{}
			status, err := svc.CreateTerminal(context.Background(),
				&dto.CreateTerminalRequest{Name: "T1", Tag: tt.tag}, resp)
			if err != nil || status != http.StatusCreated {
				t.Fatalf("create failed: status=%d err=%v", status, err)
			}

			if !reflect.DeepEqual(derefTag(saved.Tag), derefTag(tt.wantTag)) {
				t.Errorf("stored tag = %v, want %v", derefTag(saved.Tag), derefTag(tt.wantTag))
			}
			if !reflect.DeepEqual(repo.canonicalizeCalls, tt.wantSeen) {
				t.Errorf("catalog saw %v, want %v", repo.canonicalizeCalls, tt.wantSeen)
			}
		})
	}
}

// The catalog write is best-effort by design. This pins that decision so a
// later refactor cannot quietly promote it to fatal: the terminal row is what
// the user asked to change, and the catalog is a management list.
func TestCreateTerminal_CatalogFailureDoesNotFailTheSave(t *testing.T) {
	var saved *Terminal
	repo := &MockRepository{
		CreateFunc: func(_ context.Context, term *Terminal) error {
			saved = term
			return nil
		},
		CanonicalizeTagsFunc: func(context.Context, []string) (map[string]string, error) {
			return nil, errors.New("catalog unavailable")
		},
	}
	svc, _ := newTestService(repo)

	resp := &dto.CreateTerminalResponse{}
	status, err := svc.CreateTerminal(context.Background(),
		&dto.CreateTerminalRequest{Name: "T1", Tag: strPtr("Op Alpha")}, resp)

	if err != nil || status != http.StatusCreated {
		t.Fatalf("a catalog failure must not fail the save: status=%d err=%v", status, err)
	}
	if saved.Tag == nil || *saved.Tag != "Op Alpha" {
		t.Errorf("stored tag = %v, want the typed value to survive", derefTag(saved.Tag))
	}
}

func TestUpdateTerminal_TagCasingAndClearing(t *testing.T) {
	tests := []struct {
		name        string
		existingTag *string
		reqTag      *string
		catalog     []string
		wantTag     *string
		wantAudited bool
	}{
		{
			name:        "recasing to the catalog spelling is not an audited change",
			existingTag: strPtr("Op Alpha"),
			reqTag:      strPtr("op alpha"),
			catalog:     []string{"Op Alpha"},
			wantTag:     strPtr("Op Alpha"),
			wantAudited: false,
		},
		{
			name:        "a real change is audited",
			existingTag: strPtr("Op Alpha"),
			reqTag:      strPtr("Op Bravo"),
			catalog:     []string{"Op Alpha"},
			wantTag:     strPtr("Op Bravo"),
			wantAudited: true,
		},
		{
			name:        "an empty string clears the tag",
			existingTag: strPtr("Op Alpha"),
			reqTag:      strPtr(""),
			catalog:     []string{"Op Alpha"},
			wantTag:     nil,
			wantAudited: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			existing := miniTerminal()
			existing.Tag = tt.existingTag

			var saved *Terminal
			repo := &MockRepository{
				FindByIDFunc: func(context.Context, string) (*Terminal, error) {
					clone := *existing
					return &clone, nil
				},
				UpdateFunc: func(_ context.Context, term *Terminal) error {
					saved = term
					return nil
				},
				CanonicalizeTagsFunc: catalogOf(tt.catalog...),
			}
			svc, audit := newTestService(repo)

			resp := &dto.UpdateTerminalResponse{}
			status, err := svc.UpdateTerminal(context.Background(),
				&dto.UpdateTerminalRequest{ID: existing.ID, Tag: tt.reqTag, UpdatedBy: "tester"}, resp)
			if err != nil || status != http.StatusOK {
				t.Fatalf("update failed: status=%d err=%v", status, err)
			}

			if derefTag(saved.Tag) != derefTag(tt.wantTag) {
				t.Errorf("stored tag = %q, want %q", derefTag(saved.Tag), derefTag(tt.wantTag))
			}

			tagged := false
			for _, e := range audit.events {
				if _, ok := e.Changes["tag"]; ok {
					tagged = true
				}
			}
			if tagged != tt.wantAudited {
				t.Errorf("tag audited = %v, want %v", tagged, tt.wantAudited)
			}
		})
	}
}

// Import canonicalizes the whole file in one round trip rather than one query
// per row, and it is the only write path that never called normalizeTag.
func TestImportTerminals_CanonicalizesEveryRowInOneCall(t *testing.T) {
	repo := &recordingRepo{}
	repo.FindAllNamesFunc = func(context.Context) ([]string, error) { return nil, nil }
	repo.BulkCreateFunc = func(context.Context, []*Terminal) error { return nil }
	repo.CanonicalizeTagsFunc = catalogOf("Op Alpha")

	svc, _ := newTestService(repo)

	rows := []*Terminal{
		{Name: "T1", Tag: strPtr("op alpha")},
		{Name: "T2", Tag: strPtr("  OP ALPHA  ")},
		{Name: "T3", Tag: nil},
		{Name: "T4", Tag: strPtr("   ")},
	}
	svc.canonicalizeRowTags(context.Background(), rows)

	if len(repo.canonicalizeCalls) != 1 {
		t.Fatalf("catalog called %d times, want exactly 1 for the whole file", len(repo.canonicalizeCalls))
	}
	want := []string{"op alpha", "OP ALPHA"}
	if !reflect.DeepEqual(repo.canonicalizeCalls[0], want) {
		t.Errorf("catalog saw %v, want %v", repo.canonicalizeCalls[0], want)
	}
	for _, r := range rows[:2] {
		if derefTag(r.Tag) != "Op Alpha" {
			t.Errorf("%s tag = %q, want the catalog casing", r.Name, derefTag(r.Tag))
		}
	}
	if rows[2].Tag != nil || rows[3].Tag != nil {
		t.Errorf("nil and blank tags must normalize to nil, got %v and %v",
			derefTag(rows[2].Tag), derefTag(rows[3].Tag))
	}
}

func TestDeleteTagEntry_AuditsEveryClearedTerminal(t *testing.T) {
	cleared := []ClearedTerminal{
		{ID: "id-1", Name: "MINI 1", Tag: "Op Alpha"},
		{ID: "id-2", Name: "MINI 2", Tag: "Op Alpha"},
	}
	var deleted string
	repo := &MockRepository{
		ClearTagFromTerminalsFunc: func(_ context.Context, name string) ([]ClearedTerminal, error) {
			return cleared, nil
		},
		DeleteTagEntryFunc: func(_ context.Context, name string) error {
			deleted = name
			return nil
		},
	}
	svc, audit := newTestService(repo)

	if err := svc.DeleteTagEntry(context.Background(), "Op Alpha", "actor-1", "Tester"); err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	if deleted != "Op Alpha" {
		t.Errorf("deleted %q, want %q", deleted, "Op Alpha")
	}
	if len(audit.events) != len(cleared) {
		t.Fatalf("wrote %d audit events, want one per cleared terminal (%d)", len(audit.events), len(cleared))
	}
	for i, e := range audit.events {
		if e.ResourceType != "terminal" || e.Action != "update" {
			t.Errorf("event %d = %s/%s, want terminal/update so it matches a drawer edit", i, e.ResourceType, e.Action)
		}
		if e.ResourceID != cleared[i].ID || e.ResourceName != cleared[i].Name {
			t.Errorf("event %d names %s/%s, want %s/%s", i, e.ResourceID, e.ResourceName, cleared[i].ID, cleared[i].Name)
		}
		if e.ActorID != "actor-1" || e.ActorName != "Tester" {
			t.Errorf("event %d actor = %s/%s, want actor-1/Tester", i, e.ActorID, e.ActorName)
		}
		want := map[string]any{"old": "Op Alpha", "new": ""}
		if !reflect.DeepEqual(e.Changes["tag"], want) {
			t.Errorf("event %d changes = %v, want %v (the shape diffTerminal produces)", i, e.Changes["tag"], want)
		}
	}
}

func TestDeleteTagEntry_PropagatesNotFound(t *testing.T) {
	repo := &MockRepository{
		ClearTagFromTerminalsFunc: func(context.Context, string) ([]ClearedTerminal, error) {
			return nil, nil
		},
		DeleteTagEntryFunc: func(context.Context, string) error { return ErrTagNotFound },
	}
	svc, audit := newTestService(repo)

	err := svc.DeleteTagEntry(context.Background(), "nope", "actor-1", "Tester")
	var coded *Error
	if !errors.As(err, &coded) || coded.Status != http.StatusNotFound {
		t.Fatalf("err = %v, want a 404 rather than an internal error", err)
	}
	if len(audit.events) != 0 {
		t.Errorf("wrote %d audit events for a tag that did not exist, want 0", len(audit.events))
	}
}

func TestCreateTagEntry_RejectsBlankName(t *testing.T) {
	svc, _ := newTestService(&MockRepository{})
	for _, name := range []string{"", "   "} {
		_, err := svc.CreateTagEntry(context.Background(), name)
		var coded *Error
		if !errors.As(err, &coded) || coded.Status != http.StatusBadRequest {
			t.Errorf("CreateTagEntry(%q) err = %v, want 400", name, err)
		}
	}
}

func TestListTagCatalog_ReturnsEmptySliceNotNil(t *testing.T) {
	svc, _ := newTestService(&MockRepository{
		ListTagCatalogFunc: func(context.Context) ([]*TagEntry, error) { return nil, nil },
	})
	entries, err := svc.ListTagCatalog(context.Background())
	if err != nil {
		t.Fatalf("list failed: %v", err)
	}
	if entries == nil {
		t.Error("returned nil, want an empty slice so the JSON is [] rather than null")
	}
}

// The count must survive to the wire including its zero value. An unused tag
// reporting nothing at all is indistinguishable from a field that was never
// sent, which is why terminal_count carries no omitempty.
func TestListTagCatalogHandler_EmitsZeroCount(t *testing.T) {
	repo := &MockRepository{
		ListTagCatalogFunc: func(context.Context) ([]*TagEntry, error) {
			return []*TagEntry{
				{Name: "Op Alpha", TerminalCount: 3},
				{Name: "ZZ Unused", TerminalCount: 0},
			}, nil
		},
	}
	svc, _ := newTestService(repo)
	h := NewHandler(svc, validator.New())

	app := fiber.New()
	app.Get("/api/v1/tags", h.ListTagCatalog)

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/v1/tags", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var body struct {
		Data struct {
			Tags []dto.TagCatalogEntryResponse `json:"tags"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(body.Data.Tags) != 2 {
		t.Fatalf("got %d tags, want 2", len(body.Data.Tags))
	}
	if body.Data.Tags[0].TerminalCount != 3 {
		t.Errorf("used tag count = %d, want 3", body.Data.Tags[0].TerminalCount)
	}
	if body.Data.Tags[1].TerminalCount != 0 {
		t.Errorf("unused tag count = %d, want 0", body.Data.Tags[1].TerminalCount)
	}

	// Decoding cannot tell an absent field from a zero one, so assert the raw
	// key is present. This is the guard against anyone adding omitempty.
	var raw map[string]any
	resp2, _ := app.Test(httptest.NewRequest(http.MethodGet, "/api/v1/tags", nil))
	if err := json.NewDecoder(resp2.Body).Decode(&raw); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	data := raw["data"].(map[string]any)
	unused := data["tags"].([]any)[1].(map[string]any)
	if _, ok := unused["terminal_count"]; !ok {
		t.Error("terminal_count is missing from an unused tag, so 0 and absent are the same on the wire")
	}
}

// Deleting a name that is not in the catalog answers 404 over the wire, which
// openapi.json has always documented and the code could not previously produce:
// the repository discarded RowsAffected, so a typo in the name returned 204 and
// looked exactly like a successful delete.
func TestDeleteTagEntryHandler_UnknownNameIs404(t *testing.T) {
	repo := &MockRepository{
		ClearTagFromTerminalsFunc: func(context.Context, string) ([]ClearedTerminal, error) {
			return nil, nil
		},
		DeleteTagEntryFunc: func(context.Context, string) error { return ErrTagNotFound },
	}
	svc, _ := newTestService(repo)
	h := NewHandler(svc, validator.New())

	app := fiber.New()
	app.Delete("/api/v1/tags/:name", h.DeleteTagEntry)

	resp, err := app.Test(httptest.NewRequest(http.MethodDelete, "/api/v1/tags/nope", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

// Every realistic tag has a space in it ("Operation Avalanche", "EXERCISE 1"),
// and Fiber hands the handler the raw percent-encoded path segment. Without
// decoding, the name reaching the service was "Operation%20Verify", which
// matched nothing - so deleting a tag from Settings did nothing at all, and
// said 204 while doing it.
func TestDeleteTagEntryHandler_DecodesTheName(t *testing.T) {
	var got string
	repo := &MockRepository{
		ClearTagFromTerminalsFunc: func(_ context.Context, name string) ([]ClearedTerminal, error) {
			got = name
			return nil, nil
		},
		DeleteTagEntryFunc: func(context.Context, string) error { return nil },
	}
	svc, _ := newTestService(repo)
	h := NewHandler(svc, validator.New())

	app := fiber.New()
	app.Delete("/api/v1/tags/:name", h.DeleteTagEntry)

	resp, err := app.Test(httptest.NewRequest(http.MethodDelete, "/api/v1/tags/Operation%20Verify", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", resp.StatusCode)
	}
	if got != "Operation Verify" {
		t.Errorf("service saw %q, want %q - the path segment was not decoded", got, "Operation Verify")
	}
}

// A delete that really happened still answers 204.
func TestDeleteTagEntryHandler_KnownNameIs204(t *testing.T) {
	repo := &MockRepository{
		ClearTagFromTerminalsFunc: func(context.Context, string) ([]ClearedTerminal, error) {
			return []ClearedTerminal{{ID: "id-1", Name: "MINI 1", Tag: "Op Alpha"}}, nil
		},
		DeleteTagEntryFunc: func(context.Context, string) error { return nil },
	}
	svc, _ := newTestService(repo)
	h := NewHandler(svc, validator.New())

	app := fiber.New()
	app.Delete("/api/v1/tags/:name", h.DeleteTagEntry)

	resp, err := app.Test(httptest.NewRequest(http.MethodDelete, "/api/v1/tags/Op%20Alpha", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("status = %d, want 204", resp.StatusCode)
	}
}

func derefTag(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

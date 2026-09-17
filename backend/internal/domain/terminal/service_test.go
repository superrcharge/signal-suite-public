package terminal

import (
	"context"
	"encoding/csv"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"backend/internal/domain/terminal/dto"
	"backend/internal/shared/contracts"
)

func strPtr(s string) *string { return &s }

type mockSectionLister struct {
	keys []string
}

func (m *mockSectionLister) GetSectionKeys(ctx context.Context) ([]string, error) {
	return m.keys, nil
}

type mockAuditRecorder struct {
	events []contracts.AuditEventInput
}

func (m *mockAuditRecorder) Record(ctx context.Context, in contracts.AuditEventInput) {
	m.events = append(m.events, in)
}

func miniTerminal() *Terminal {
	now := time.Now().UTC()
	return &Terminal{
		ID:        "550e8400-e29b-41d4-a716-446655440000",
		Name:      "TEST MINI 1",
		Model:     strPtr(ModelMini),
		Status:    StatusAvailable,
		PopPin:    strPtr(PopPinGermany),
		UpdatedBy: "tester",
		CreatedAt: now,
		UpdatedAt: now,
	}
}

func newTestService(repo Repository) (*Service, *mockAuditRecorder) {
	svc := NewService(repo, &mockSectionLister{keys: []string{"asqd", "bsqd"}})
	audit := &mockAuditRecorder{}
	svc.SetAudit(audit)
	return svc, audit
}

func TestUpdateTerminal_PopPin(t *testing.T) {
	tests := []struct {
		name          string
		existing      func() *Terminal
		req           func(id string) *dto.UpdateTerminalRequest
		wantPopPin    *string
		wantDiffField bool
	}{
		{
			name:     "model change away from mini clears pin",
			existing: miniTerminal,
			req: func(id string) *dto.UpdateTerminalRequest {
				return &dto.UpdateTerminalRequest{ID: id, Model: strPtr(ModelHornet), UpdatedBy: "tester"}
			},
			wantPopPin:    nil,
			wantDiffField: true,
		},
		{
			name:     "empty string clears pin",
			existing: miniTerminal,
			req: func(id string) *dto.UpdateTerminalRequest {
				return &dto.UpdateTerminalRequest{ID: id, PopPin: strPtr(""), UpdatedBy: "tester"}
			},
			wantPopPin:    nil,
			wantDiffField: true,
		},
		{
			name: "sets pin on a mini",
			existing: func() *Terminal {
				tm := miniTerminal()
				tm.PopPin = nil
				return tm
			},
			req: func(id string) *dto.UpdateTerminalRequest {
				return &dto.UpdateTerminalRequest{ID: id, PopPin: strPtr(PopPinUSEast), UpdatedBy: "tester"}
			},
			wantPopPin:    strPtr(PopPinUSEast),
			wantDiffField: true,
		},
		{
			name:     "nil pointer leaves existing pin",
			existing: miniTerminal,
			req: func(id string) *dto.UpdateTerminalRequest {
				return &dto.UpdateTerminalRequest{ID: id, Serial: strPtr("SN-1"), UpdatedBy: "tester"}
			},
			wantPopPin:    strPtr(PopPinGermany),
			wantDiffField: false,
		},
		{
			name:     "pin on non-starshield is dropped",
			existing: miniTerminal,
			req: func(id string) *dto.UpdateTerminalRequest {
				return &dto.UpdateTerminalRequest{ID: id, Model: strPtr(ModelRagno), PopPin: strPtr(PopPinUSWest), UpdatedBy: "tester"}
			},
			wantPopPin:    nil,
			wantDiffField: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			existing := tt.existing()
			var saved *Terminal
			repo := &MockRepository{
				FindByIDFunc: func(ctx context.Context, id string) (*Terminal, error) {
					cp := *existing
					return &cp, nil
				},
				UpdateFunc: func(ctx context.Context, tm *Terminal) error {
					saved = tm
					return nil
				},
			}
			svc, audit := newTestService(repo)

			resp := &dto.UpdateTerminalResponse{}
			status, err := svc.UpdateTerminal(context.Background(), tt.req(existing.ID), resp)
			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if status != http.StatusOK {
				t.Fatalf("expected status 200, got %d", status)
			}

			if tt.wantPopPin == nil {
				if saved.PopPin != nil {
					t.Errorf("expected PopPin nil, got %q", *saved.PopPin)
				}
			} else {
				if saved.PopPin == nil || *saved.PopPin != *tt.wantPopPin {
					t.Errorf("expected PopPin %q, got %v", *tt.wantPopPin, saved.PopPin)
				}
			}

			gotDiff := false
			for _, ev := range audit.events {
				if _, ok := ev.Changes["pop_pin"]; ok {
					gotDiff = true
				}
			}
			if gotDiff != tt.wantDiffField {
				t.Errorf("expected pop_pin in audit diff = %v, got %v (events: %+v)", tt.wantDiffField, gotDiff, audit.events)
			}
		})
	}
}

func TestCreateTerminal_PopPin(t *testing.T) {
	tests := []struct {
		name       string
		req        *dto.CreateTerminalRequest
		wantPopPin *string
	}{
		{
			name:       "pin persists on mini",
			req:        &dto.CreateTerminalRequest{Name: "NEW MINI", Model: strPtr(ModelMini), PopPin: strPtr(PopPinAustralia), UpdatedBy: "tester"},
			wantPopPin: strPtr(PopPinAustralia),
		},
		{
			name:       "pin dropped on hornet",
			req:        &dto.CreateTerminalRequest{Name: "NEW HORNET", Model: strPtr(ModelHornet), PopPin: strPtr(PopPinAustralia), UpdatedBy: "tester"},
			wantPopPin: nil,
		},
		{
			name:       "pin dropped when model unset",
			req:        &dto.CreateTerminalRequest{Name: "NEW BLANK", PopPin: strPtr(PopPinUK), UpdatedBy: "tester"},
			wantPopPin: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var saved *Terminal
			repo := &MockRepository{
				CreateFunc: func(ctx context.Context, tm *Terminal) error {
					saved = tm
					return nil
				},
			}
			svc, _ := newTestService(repo)

			resp := &dto.CreateTerminalResponse{}
			status, err := svc.CreateTerminal(context.Background(), tt.req, resp)
			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if status != http.StatusCreated {
				t.Fatalf("expected status 201, got %d", status)
			}

			if tt.wantPopPin == nil {
				if saved.PopPin != nil {
					t.Errorf("expected PopPin nil, got %q", *saved.PopPin)
				}
			} else {
				if saved.PopPin == nil || *saved.PopPin != *tt.wantPopPin {
					t.Errorf("expected PopPin %q, got %v", *tt.wantPopPin, saved.PopPin)
				}
			}
		})
	}
}

func TestExportTerminals_PopPin(t *testing.T) {
	pinned := miniTerminal()
	unpinned := miniTerminal()
	unpinned.ID = "660e8400-e29b-41d4-a716-446655440000"
	unpinned.Name = "TEST MINI 2"
	unpinned.PopPin = nil

	repo := &MockRepository{
		FindForExportFunc: func(ctx context.Context, _ ExportFilter) ([]*Terminal, error) {
			return []*Terminal{pinned, unpinned}, nil
		},
	}
	svc, _ := newTestService(repo)

	out, err := svc.ExportTerminals(context.Background(), ExportFilter{}, nil)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	records, err := csv.NewReader(strings.NewReader(out)).ReadAll()
	if err != nil {
		t.Fatalf("export is not valid CSV: %v", err)
	}

	header := records[0]
	popIdx := -1
	for i, h := range header {
		if h == "pop_pin" {
			popIdx = i
		}
	}
	if popIdx == -1 {
		t.Fatalf("pop_pin missing from export header: %v", header)
	}
	// Canonical order places pop_pin between owner_phone and notes.
	if header[popIdx-1] != "owner_phone" || header[popIdx+1] != "notes" {
		t.Errorf("pop_pin out of canonical position: %v", header)
	}
	if records[1][popIdx] != PopPinGermany {
		t.Errorf("expected pinned row value %q, got %q", PopPinGermany, records[1][popIdx])
	}
	if records[2][popIdx] != "" {
		t.Errorf("expected empty value for unpinned row, got %q", records[2][popIdx])
	}
}

func TestImportTerminals_PopPin(t *testing.T) {
	csvBody := strings.Join([]string{
		"name,model,pop_pin",
		"GOOD MINI,mini,us-east",
		"BAD SLUG,mini,mars",
		"BAD FAMILY,hornet,us-east",
	}, "\n")

	var imported []*Terminal
	repo := &MockRepository{
		FindAllNamesFunc: func(ctx context.Context) ([]string, error) { return nil, nil },
		BulkCreateFunc: func(ctx context.Context, terminals []*Terminal) error {
			imported = terminals
			return nil
		},
	}
	svc, _ := newTestService(repo)

	resp := &dto.ImportTerminalsResponse{}
	status, err := svc.ImportTerminals(context.Background(), &dto.ImportTerminalsRequest{CSV: csvBody, UpdatedBy: "tester"}, resp)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if status != http.StatusMultiStatus {
		t.Fatalf("expected status 207, got %d", status)
	}

	if resp.Imported != 1 {
		t.Fatalf("expected 1 imported, got %d (errors: %+v)", resp.Imported, resp.Errors)
	}
	if len(imported) != 1 || imported[0].PopPin == nil || *imported[0].PopPin != PopPinUSEast {
		t.Errorf("expected imported row pinned to us-east, got %+v", imported)
	}

	if len(resp.Errors) != 2 {
		t.Fatalf("expected 2 row errors, got %d: %+v", len(resp.Errors), resp.Errors)
	}
	byName := map[string]dto.ImportRowError{}
	for _, re := range resp.Errors {
		byName[re.Name] = re
	}
	if re, ok := byName["BAD SLUG"]; !ok || !strings.Contains(strings.Join(re.Errors, " "), "invalid pop_pin") {
		t.Errorf("expected invalid pop_pin error for BAD SLUG, got %+v", re)
	}
	if re, ok := byName["BAD FAMILY"]; !ok || !strings.Contains(strings.Join(re.Errors, " "), "Starshield") {
		t.Errorf("expected Starshield-only error for BAD FAMILY, got %+v", re)
	}
}

// The export filter reaching the repository was uncovered until now: every
// export test stubbed FindForExportFunc and discarded its argument, so nothing
// asserted that a filter survives the service at all. That is the layer the
// placeholder bug in FindForExport lived under.
func TestExportTerminals_PassesFilterThrough(t *testing.T) {
	var got ExportFilter
	repo := &MockRepository{
		FindForExportFunc: func(ctx context.Context, f ExportFilter) ([]*Terminal, error) {
			got = f
			return nil, nil
		},
	}
	svc, _ := newTestService(repo)

	want := ExportFilter{
		Sections: []string{"asqd"},
		Statuses: []string{"available"},
		Models:   []string{"ow7", "ow10"},
	}
	if _, err := svc.ExportTerminals(context.Background(), want, nil); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if !reflect.DeepEqual(got, want) {
		t.Errorf("filter reached the repository as %+v, want %+v", got, want)
	}
}

package kit

import (
	"context"
	"encoding/csv"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"backend/internal/domain/kit/dto"
	"backend/internal/shared/contracts"
)

func strPtr(s string) *string { return &s }
func boolPtr(b bool) *bool    { return &b }

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

func sampleKit() *Kit {
	now := time.Now().UTC()
	return &Kit{
		ID:        "550e8400-e29b-41d4-a716-446655440000",
		Name:      "TEST KIT 1",
		Type:      TypeRemote,
		Status:    StatusAvailable,
		Black:     true,
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

func TestCreateKit_StatusAndType(t *testing.T) {
	tests := []struct {
		name       string
		req        *dto.CreateKitRequest
		wantStatus string
		wantType   string
	}{
		{
			name:       "status defaults to available",
			req:        &dto.CreateKitRequest{Name: "NEW REMOTE", Type: TypeRemote, UpdatedBy: "tester"},
			wantStatus: StatusAvailable,
			wantType:   TypeRemote,
		},
		{
			name:       "explicit status and type persist",
			req:        &dto.CreateKitRequest{Name: "NEW ATK", Type: TypeATK, Status: StatusOnMission, UpdatedBy: "tester"},
			wantStatus: StatusOnMission,
			wantType:   TypeATK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var saved *Kit
			repo := &MockRepository{
				CreateFunc: func(ctx context.Context, k *Kit) error {
					saved = k
					return nil
				},
			}
			svc, _ := newTestService(repo)

			resp := &dto.CreateKitResponse{}
			status, err := svc.CreateKit(context.Background(), tt.req, resp)
			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if status != http.StatusCreated {
				t.Fatalf("expected status 201, got %d", status)
			}
			if saved.Status != tt.wantStatus {
				t.Errorf("expected status %q, got %q", tt.wantStatus, saved.Status)
			}
			if saved.Type != tt.wantType {
				t.Errorf("expected type %q, got %q", tt.wantType, saved.Type)
			}
		})
	}
}

func TestUpdateKit_BooleanDiff(t *testing.T) {
	existing := sampleKit() // Black=true, Secret=false, TopSecret=false
	var saved *Kit
	repo := &MockRepository{
		FindByIDFunc: func(ctx context.Context, id string) (*Kit, error) {
			cp := *existing
			return &cp, nil
		},
		UpdateFunc: func(ctx context.Context, k *Kit) error {
			saved = k
			return nil
		},
	}
	svc, audit := newTestService(repo)

	// Flip Black off, Secret on; leave TopSecret unset (nil pointer).
	req := &dto.UpdateKitRequest{
		ID:        existing.ID,
		Black:     boolPtr(false),
		Secret:     boolPtr(true),
		UpdatedBy: "tester",
	}
	resp := &dto.UpdateKitResponse{}
	status, err := svc.UpdateKit(context.Background(), req, resp)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if status != http.StatusOK {
		t.Fatalf("expected status 200, got %d", status)
	}
	if saved.Black != false || saved.Secret != true || saved.TopSecret != false {
		t.Errorf("unexpected booleans: black=%v secret=%v topsecret=%v", saved.Black, saved.Secret, saved.TopSecret)
	}

	// Audit diff should contain black and secret, not topsecret.
	var changes map[string]any
	for _, ev := range audit.events {
		if ev.Action == "update" {
			changes = ev.Changes
		}
	}
	if changes == nil {
		t.Fatalf("expected an update audit event with changes")
	}
	if _, ok := changes["black"]; !ok {
		t.Errorf("expected black in audit diff, got %+v", changes)
	}
	if _, ok := changes["secret"]; !ok {
		t.Errorf("expected secret in audit diff, got %+v", changes)
	}
	if _, ok := changes["topsecret"]; ok {
		t.Errorf("did not expect topsecret in audit diff, got %+v", changes)
	}
}

func TestExportKits_Booleans(t *testing.T) {
	k1 := sampleKit() // Black=true
	k2 := sampleKit()
	k2.ID = "660e8400-e29b-41d4-a716-446655440000"
	k2.Name = "TEST KIT 2"
	k2.Black = false

	repo := &MockRepository{
		FindForExportFunc: func(ctx context.Context, _ ExportFilter) ([]*Kit, error) {
			return []*Kit{k1, k2}, nil
		},
	}
	svc, _ := newTestService(repo)

	out, err := svc.ExportKits(context.Background(), ExportFilter{}, nil)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	records, err := csv.NewReader(strings.NewReader(out)).ReadAll()
	if err != nil {
		t.Fatalf("export is not valid CSV: %v", err)
	}

	header := records[0]
	blackIdx := -1
	for i, h := range header {
		if h == "black" {
			blackIdx = i
		}
	}
	if blackIdx == -1 {
		t.Fatalf("black missing from export header: %v", header)
	}
	// Canonical order places black between status and secret.
	if header[blackIdx-1] != "status" || header[blackIdx+1] != "secret" {
		t.Errorf("black out of canonical position: %v", header)
	}
	if records[1][blackIdx] != "true" {
		t.Errorf("expected first row black=true, got %q", records[1][blackIdx])
	}
	if records[2][blackIdx] != "false" {
		t.Errorf("expected second row black=false, got %q", records[2][blackIdx])
	}
}

func TestImportKits_TypeAndBooleans(t *testing.T) {
	csvBody := strings.Join([]string{
		"name,type,black,secret,topsecret",
		"GOOD KIT,remote,true,false,yes",
		"NO TYPE,,true,,",
		"BAD TYPE,widget,,,",
		"BAD BOOL,ifk,maybe,,",
	}, "\n")

	var imported []*Kit
	repo := &MockRepository{
		FindAllNamesFunc: func(ctx context.Context) ([]string, error) { return nil, nil },
		BulkCreateFunc: func(ctx context.Context, kits []*Kit) error {
			imported = kits
			return nil
		},
	}
	svc, _ := newTestService(repo)

	resp := &dto.ImportKitsResponse{}
	status, err := svc.ImportKits(context.Background(), &dto.ImportKitsRequest{CSV: csvBody, UpdatedBy: "tester"}, resp)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if status != http.StatusMultiStatus {
		t.Fatalf("expected status 207, got %d", status)
	}

	if resp.Imported != 1 {
		t.Fatalf("expected 1 imported, got %d (errors: %+v)", resp.Imported, resp.Errors)
	}
	if len(imported) != 1 {
		t.Fatalf("expected 1 imported kit, got %d", len(imported))
	}
	got := imported[0]
	if got.Type != TypeRemote || got.Black != true || got.Secret != false || got.TopSecret != true {
		t.Errorf("unexpected imported kit: type=%q black=%v secret=%v topsecret=%v", got.Type, got.Black, got.Secret, got.TopSecret)
	}

	if len(resp.Errors) != 3 {
		t.Fatalf("expected 3 row errors, got %d: %+v", len(resp.Errors), resp.Errors)
	}
	byName := map[string]dto.ImportRowError{}
	for _, re := range resp.Errors {
		byName[re.Name] = re
	}
	if re, ok := byName["NO TYPE"]; !ok || !strings.Contains(strings.Join(re.Errors, " "), "type is required") {
		t.Errorf("expected 'type is required' for NO TYPE, got %+v", re)
	}
	if re, ok := byName["BAD TYPE"]; !ok || !strings.Contains(strings.Join(re.Errors, " "), "invalid type") {
		t.Errorf("expected 'invalid type' for BAD TYPE, got %+v", re)
	}
	if re, ok := byName["BAD BOOL"]; !ok || !strings.Contains(strings.Join(re.Errors, " "), "invalid black") {
		t.Errorf("expected 'invalid black' for BAD BOOL, got %+v", re)
	}
}

// The mirror of TestExportTerminals_PassesFilterThrough - see the comment
// there for why this layer had no coverage.
func TestExportKits_PassesFilterThrough(t *testing.T) {
	var got ExportFilter
	repo := &MockRepository{
		FindForExportFunc: func(ctx context.Context, f ExportFilter) ([]*Kit, error) {
			got = f
			return nil, nil
		},
	}
	svc, _ := newTestService(repo)

	want := ExportFilter{
		Sections: []string{"asqd"},
		Statuses: []string{"available"},
		Types:    []string{"remote", "ifk"},
	}
	if _, err := svc.ExportKits(context.Background(), want, nil); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if !reflect.DeepEqual(got, want) {
		t.Errorf("filter reached the repository as %+v, want %+v", got, want)
	}
}

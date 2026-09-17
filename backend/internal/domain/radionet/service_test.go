package radionet

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"backend/internal/domain/radionet/dto"
	"backend/internal/shared/contracts"
)

type mockAuditRecorder struct {
	events []contracts.AuditEventInput
}

func (m *mockAuditRecorder) Record(_ context.Context, in contracts.AuditEventInput) {
	m.events = append(m.events, in)
}

func newTestService(repo Repository) (*Service, *mockAuditRecorder) {
	svc := NewService(repo)
	audit := &mockAuditRecorder{}
	svc.SetAudit(audit)
	return svc, audit
}

func strPtr(s string) *string { return &s }

func sampleNet() *Net {
	now := time.Date(2026, 8, 19, 0, 0, 0, 0, time.UTC)
	return &Net{
		ID:          "11111111-1111-1111-1111-111111111111",
		Section:     "asqd",
		Name:        "NET 1",
		NetID:       "N01",
		TxFreq:      "31.6875",
		RxFreq:      "41.2500",
		FreqUnit:    FreqUnitMHz,
		Description: "Sample net",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
}

func TestCreateNet(t *testing.T) {
	tests := []struct {
		name           string
		req            *dto.CreateNetRequest
		nameExists     bool
		createErr      error
		expectedStatus int
		expectedErr    error
		wantFreqUnit   string
	}{
		{
			name:           "creates a net and defaults the unit to MHz",
			req:            &dto.CreateNetRequest{Section: "asqd", Name: "NET 1", NetID: "N01", TxFreq: "31.6875", RxFreq: "41.25"},
			expectedStatus: http.StatusCreated,
			wantFreqUnit:   FreqUnitMHz,
		},
		{
			name:           "honors an explicit unit",
			req:            &dto.CreateNetRequest{Section: "asqd", Name: "NET 2", FreqUnit: FreqUnitGHz, TxFreq: "1.2"},
			expectedStatus: http.StatusCreated,
			wantFreqUnit:   FreqUnitGHz,
		},
		{
			name:           "accepts a freeform range",
			req:            &dto.CreateNetRequest{Section: "asqd", Name: "NET 3", TxFreq: "225.000 - 399.975"},
			expectedStatus: http.StatusCreated,
			wantFreqUnit:   FreqUnitMHz,
		},
		{
			name:           "accepts a non-numeric placeholder in place of a figure",
			req:            &dto.CreateNetRequest{Section: "asqd", Name: "NET 4", TxFreq: "TBD", RxFreq: "TBD"},
			expectedStatus: http.StatusCreated,
			wantFreqUnit:   FreqUnitMHz,
		},
		{
			name:           "creates a net with no frequencies yet",
			req:            &dto.CreateNetRequest{Section: "asqd", Name: "NET 5"},
			expectedStatus: http.StatusCreated,
			wantFreqUnit:   FreqUnitMHz,
		},
		{
			name:           "rejects an unknown unit",
			req:            &dto.CreateNetRequest{Section: "asqd", Name: "NET 1", FreqUnit: "kHz"},
			expectedStatus: http.StatusBadRequest,
			expectedErr:    ErrInvalidFreqUnit,
		},
		{
			name:           "rejects a lowercase unit so printed wheels stay consistent",
			req:            &dto.CreateNetRequest{Section: "asqd", Name: "NET 1", FreqUnit: "mhz"},
			expectedStatus: http.StatusBadRequest,
			expectedErr:    ErrInvalidFreqUnit,
		},
		{
			name:           "rejects a duplicate name",
			req:            &dto.CreateNetRequest{Section: "asqd", Name: "net 1"},
			nameExists:     true,
			expectedStatus: http.StatusConflict,
			expectedErr:    ErrNetNameExists,
		},
		{
			name:           "maps a unique violation that races the existence check",
			req:            &dto.CreateNetRequest{Section: "asqd", Name: "NET 1"},
			createErr:      ErrNetNameExists,
			expectedStatus: http.StatusConflict,
			expectedErr:    ErrNetNameExists,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var created *Net
			repo := &MockRepository{
				NameExistsFunc: func(_ context.Context, _, _ string) (bool, error) {
					return tt.nameExists, nil
				},
				CreateFunc: func(_ context.Context, n *Net) error {
					created = n
					return tt.createErr
				},
			}
			svc, audit := newTestService(repo)

			resp := &dto.CreateNetResponse{}
			status, err := svc.CreateNet(context.Background(), tt.req, resp)

			if status != tt.expectedStatus {
				t.Errorf("status = %d, want %d", status, tt.expectedStatus)
			}
			if !errors.Is(err, tt.expectedErr) {
				t.Errorf("err = %v, want %v", err, tt.expectedErr)
			}
			if tt.expectedErr != nil {
				if len(audit.events) != 0 {
					t.Errorf("audit recorded %d events on a failed create, want 0", len(audit.events))
				}
				return
			}

			if created == nil {
				t.Fatal("repo.Create was never called")
			}
			if created.ID == "" {
				t.Error("created net has no ID")
			}
			if created.FreqUnit != tt.wantFreqUnit {
				t.Errorf("freq unit = %q, want %q", created.FreqUnit, tt.wantFreqUnit)
			}
			if created.TxFreq != tt.req.TxFreq {
				t.Errorf("tx_freq = %q, want %q", created.TxFreq, tt.req.TxFreq)
			}
			if resp.Net.ID != created.ID {
				t.Errorf("response ID = %q, want %q", resp.Net.ID, created.ID)
			}
			if len(audit.events) != 1 || audit.events[0].Action != "create" {
				t.Errorf("audit events = %+v, want one create", audit.events)
			}
		})
	}
}

func TestCreateNetTrimsWhitespace(t *testing.T) {
	var created *Net
	repo := &MockRepository{
		CreateFunc: func(_ context.Context, n *Net) error { created = n; return nil },
	}
	svc, _ := newTestService(repo)

	_, err := svc.CreateNet(context.Background(), &dto.CreateNetRequest{
		Section: "asqd",
		Name:    "  NET 1  ",
		NetID:   "  N01 ",
		TxFreq:  "  31.6875 ",
		RxFreq:  " 41.25  ",
	}, &dto.CreateNetResponse{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if created.Name != "NET 1" || created.NetID != "N01" {
		t.Errorf("fields not trimmed: %+v", created)
	}
	if created.TxFreq != "31.6875" || created.RxFreq != "41.25" {
		t.Errorf("frequencies not trimmed: tx=%q rx=%q", created.TxFreq, created.RxFreq)
	}
}

func TestUpdateNet(t *testing.T) {
	t.Run("moves a net and records a diff", func(t *testing.T) {
		var updated *Net
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*Net, error) { return sampleNet(), nil },
			UpdateFunc:   func(_ context.Context, n *Net) error { updated = n; return nil },
		}
		svc, audit := newTestService(repo)

		status, err := svc.UpdateNet(context.Background(), &dto.UpdateNetRequest{
			ID:        "11111111-1111-1111-1111-111111111111",
			NetID:     strPtr("N08"),
			UpdatedBy: "SSgt Tester",
		}, &dto.UpdateNetResponse{})

		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if updated.NetID != "N08" {
			t.Errorf("net_id = %q, want N08", updated.NetID)
		}
		// TX/RX must survive an edit that does not mention them, so that moving a
		// net between wheel channels carries its frequencies along by default.
		if updated.TxFreq != "31.6875" || updated.RxFreq != "41.2500" {
			t.Errorf("frequencies not preserved: tx=%q rx=%q", updated.TxFreq, updated.RxFreq)
		}
		if len(audit.events) != 1 {
			t.Fatalf("audit events = %d, want 1", len(audit.events))
		}
		changes := audit.events[0].Changes
		if _, ok := changes["net_id"]; !ok {
			t.Errorf("diff missing net_id: %+v", changes)
		}
		if _, ok := changes["name"]; ok {
			t.Errorf("diff should not include unchanged name: %+v", changes)
		}
		if _, ok := changes["tx_freq"]; ok {
			t.Errorf("diff should not include unchanged tx_freq: %+v", changes)
		}
	})

	t.Run("an empty string clears a frequency", func(t *testing.T) {
		var updated *Net
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*Net, error) { return sampleNet(), nil },
			UpdateFunc:   func(_ context.Context, n *Net) error { updated = n; return nil },
		}
		svc, audit := newTestService(repo)

		_, err := svc.UpdateNet(context.Background(), &dto.UpdateNetRequest{
			ID:     "11111111-1111-1111-1111-111111111111",
			RxFreq: strPtr(""),
		}, &dto.UpdateNetResponse{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if updated.RxFreq != "" {
			t.Errorf("rx_freq = %q, want empty", updated.RxFreq)
		}
		if updated.TxFreq != "31.6875" {
			t.Errorf("tx_freq = %q, want untouched", updated.TxFreq)
		}
		if _, ok := audit.events[0].Changes["rx_freq"]; !ok {
			t.Errorf("clearing rx_freq should appear in the diff: %+v", audit.events[0].Changes)
		}
	})

	t.Run("changes the unit for both frequencies at once", func(t *testing.T) {
		var updated *Net
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*Net, error) { return sampleNet(), nil },
			UpdateFunc:   func(_ context.Context, n *Net) error { updated = n; return nil },
		}
		svc, _ := newTestService(repo)

		_, err := svc.UpdateNet(context.Background(), &dto.UpdateNetRequest{
			ID:       "11111111-1111-1111-1111-111111111111",
			FreqUnit: strPtr(FreqUnitGHz),
		}, &dto.UpdateNetResponse{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if updated.FreqUnit != FreqUnitGHz {
			t.Errorf("freq_unit = %q, want %q", updated.FreqUnit, FreqUnitGHz)
		}
	})

	t.Run("rejects an unknown unit", func(t *testing.T) {
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*Net, error) { return sampleNet(), nil },
		}
		svc, audit := newTestService(repo)

		status, err := svc.UpdateNet(context.Background(), &dto.UpdateNetRequest{
			ID:       "11111111-1111-1111-1111-111111111111",
			FreqUnit: strPtr("Hz"),
		}, &dto.UpdateNetResponse{})

		if status != http.StatusBadRequest || !errors.Is(err, ErrInvalidFreqUnit) {
			t.Errorf("status = %d, err = %v; want 400 / %v", status, err, ErrInvalidFreqUnit)
		}
		if len(audit.events) != 0 {
			t.Errorf("audit recorded events on a rejected update")
		}
	})

	t.Run("rejects renaming onto an existing name", func(t *testing.T) {
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*Net, error) { return sampleNet(), nil },
			NameExistsExcludingFunc: func(_ context.Context, _, _, _ string) (bool, error) {
				return true, nil
			},
		}
		svc, _ := newTestService(repo)

		status, err := svc.UpdateNet(context.Background(), &dto.UpdateNetRequest{
			ID:   "11111111-1111-1111-1111-111111111111",
			Name: strPtr("NET 9"),
		}, &dto.UpdateNetResponse{})

		if status != http.StatusConflict || !errors.Is(err, ErrNetNameExists) {
			t.Errorf("status = %d, err = %v; want 409 / %v", status, err, ErrNetNameExists)
		}
	})

	t.Run("404s an unknown net", func(t *testing.T) {
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*Net, error) { return nil, ErrNetNotFound },
		}
		svc, _ := newTestService(repo)

		status, err := svc.UpdateNet(context.Background(), &dto.UpdateNetRequest{ID: "nope"},
			&dto.UpdateNetResponse{})
		if status != http.StatusNotFound || !errors.Is(err, ErrNetNotFound) {
			t.Errorf("status = %d, err = %v; want 404 / %v", status, err, ErrNetNotFound)
		}
	})
}

func TestDeleteNet(t *testing.T) {
	t.Run("deletes and records the name", func(t *testing.T) {
		deleted := ""
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*Net, error) { return sampleNet(), nil },
			DeleteFunc:   func(_ context.Context, id string) error { deleted = id; return nil },
		}
		svc, audit := newTestService(repo)

		status, err := svc.DeleteNet(context.Background(), &dto.DeleteNetRequest{
			ID: "11111111-1111-1111-1111-111111111111",
		})
		if status != http.StatusNoContent || err != nil {
			t.Fatalf("status = %d, err = %v", status, err)
		}
		if deleted != "11111111-1111-1111-1111-111111111111" {
			t.Errorf("deleted id = %q", deleted)
		}
		if len(audit.events) != 1 || audit.events[0].ResourceName != "NET 1" {
			t.Errorf("audit events = %+v, want one delete naming NET 1", audit.events)
		}
	})

	t.Run("404s an unknown net", func(t *testing.T) {
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*Net, error) { return nil, ErrNetNotFound },
		}
		svc, _ := newTestService(repo)

		status, err := svc.DeleteNet(context.Background(), &dto.DeleteNetRequest{ID: "nope"})
		if status != http.StatusNotFound || !errors.Is(err, ErrNetNotFound) {
			t.Errorf("status = %d, err = %v; want 404 / %v", status, err, ErrNetNotFound)
		}
	})
}

func TestListNets(t *testing.T) {
	repo := &MockRepository{
		FindBySectionFunc: func(_ context.Context, _ string) ([]*Net, error) {
			return []*Net{sampleNet()}, nil
		},
	}
	svc, _ := newTestService(repo)

	resp := &dto.ListNetsResponse{}
	status, err := svc.ListNets(context.Background(), &dto.ListNetsRequest{Section: "asqd"}, resp)
	if status != http.StatusOK || err != nil {
		t.Fatalf("status = %d, err = %v", status, err)
	}
	if resp.Total != 1 || len(resp.Nets) != 1 {
		t.Fatalf("total = %d, nets = %d, want 1 / 1", resp.Total, len(resp.Nets))
	}
	if resp.Nets[0].Name != "NET 1" || resp.Nets[0].TxFreq != "31.6875" {
		t.Errorf("unexpected net: %+v", resp.Nets[0])
	}
}

func TestListNetsEmptyIsNotNull(t *testing.T) {
	repo := &MockRepository{
		FindBySectionFunc: func(_ context.Context, _ string) ([]*Net, error) { return nil, nil },
	}
	svc, _ := newTestService(repo)

	resp := &dto.ListNetsResponse{}
	if _, err := svc.ListNets(context.Background(), &dto.ListNetsRequest{Section: "asqd"}, resp); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Serializing nil would give the frontend `null` instead of `[]`.
	if resp.Nets == nil {
		t.Error("Nets is nil; want an empty slice so it marshals as []")
	}
}

func TestIsValidFreqUnit(t *testing.T) {
	tests := []struct {
		unit string
		want bool
	}{
		{FreqUnitMHz, true},
		{FreqUnitGHz, true},
		{"kHz", false},
		{"mhz", false},
		{"MHZ", false},
		{"Hz", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := IsValidFreqUnit(tt.unit); got != tt.want {
			t.Errorf("IsValidFreqUnit(%q) = %v, want %v", tt.unit, got, tt.want)
		}
	}
}

func TestDiffNet(t *testing.T) {
	before := sampleNet()

	t.Run("reports only what changed", func(t *testing.T) {
		after := sampleNet()
		after.TxFreq = "40.0000"
		changes := diffNet(before, after)
		if len(changes) != 1 {
			t.Fatalf("changes = %+v, want exactly one", changes)
		}
		if _, ok := changes["tx_freq"]; !ok {
			t.Errorf("missing tx_freq: %+v", changes)
		}
	})

	t.Run("an identical net produces an empty diff", func(t *testing.T) {
		if changes := diffNet(before, sampleNet()); len(changes) != 0 {
			t.Errorf("changes = %+v, want empty", changes)
		}
	})
}

func TestRadioType(t *testing.T) {
	t.Run("defaults to both so a net is never silently confined to one radio", func(t *testing.T) {
		var created *Net
		repo := &MockRepository{
			CreateFunc: func(_ context.Context, n *Net) error { created = n; return nil },
		}
		svc, _ := newTestService(repo)

		if _, err := svc.CreateNet(context.Background(),
			&dto.CreateNetRequest{Section: "asqd", Name: "NET 1"}, &dto.CreateNetResponse{}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if created.RadioType != RadioTypeBoth {
			t.Errorf("radio_type = %q, want %q", created.RadioType, RadioTypeBoth)
		}
	})

	t.Run("accepts each valid value", func(t *testing.T) {
		for _, rt := range ValidRadioTypes {
			var created *Net
			repo := &MockRepository{
				CreateFunc: func(_ context.Context, n *Net) error { created = n; return nil },
			}
			svc, _ := newTestService(repo)

			status, err := svc.CreateNet(context.Background(),
				&dto.CreateNetRequest{Section: "asqd", Name: "NET 1", RadioType: rt}, &dto.CreateNetResponse{})
			if status != http.StatusCreated || err != nil {
				t.Errorf("%s: status = %d, err = %v", rt, status, err)
				continue
			}
			if created.RadioType != rt {
				t.Errorf("radio_type = %q, want %q", created.RadioType, rt)
			}
		}
	})

	t.Run("rejects anything outside the set", func(t *testing.T) {
		for _, bad := range []string{"JEM", "mpu-5", "harris", "none"} {
			svc, _ := newTestService(&MockRepository{})
			status, err := svc.CreateNet(context.Background(),
				&dto.CreateNetRequest{Section: "asqd", Name: "NET 1", RadioType: bad}, &dto.CreateNetResponse{})
			if status != http.StatusBadRequest || !errors.Is(err, ErrInvalidRadioType) {
				t.Errorf("%q: status = %d, err = %v; want 400 / %v", bad, status, err, ErrInvalidRadioType)
			}
		}
	})

	t.Run("rejects an invalid value on update", func(t *testing.T) {
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*Net, error) { return sampleNet(), nil },
		}
		svc, _ := newTestService(repo)
		status, err := svc.UpdateNet(context.Background(),
			&dto.UpdateNetRequest{ID: "x", RadioType: strPtr("nope")}, &dto.UpdateNetResponse{})
		if status != http.StatusBadRequest || !errors.Is(err, ErrInvalidRadioType) {
			t.Errorf("status = %d, err = %v; want 400 / %v", status, err, ErrInvalidRadioType)
		}
	})
}

func TestCarriedBy(t *testing.T) {
	tests := []struct {
		netType, radio string
		want           bool
	}{
		{RadioTypeJEM, RadioTypeJEM, true},
		{RadioTypeJEM, RadioTypeMPU5, false},
		{RadioTypeMPU5, RadioTypeMPU5, true},
		{RadioTypeMPU5, RadioTypeJEM, false},
		// A shared net belongs on either wheel -- the whole point of "both".
		{RadioTypeBoth, RadioTypeJEM, true},
		{RadioTypeBoth, RadioTypeMPU5, true},
	}
	for _, tt := range tests {
		if got := CarriedBy(tt.netType, tt.radio); got != tt.want {
			t.Errorf("CarriedBy(%q, %q) = %v, want %v", tt.netType, tt.radio, got, tt.want)
		}
	}
}

type mockNetUsage struct {
	count int
	plans []string
	err   error
}

func (m *mockNetUsage) CountAssignmentsForNet(_ context.Context, _ string) (int, error) {
	return m.count, m.err
}
func (m *mockNetUsage) PlansUsingNet(_ context.Context, _ string) ([]string, error) {
	return m.plans, nil
}

func TestDeleteNetInUseGuard(t *testing.T) {
	newSvc := func(usage *mockNetUsage, deleted *bool) *Service {
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*Net, error) { return sampleNet(), nil },
			DeleteFunc: func(_ context.Context, _ string) error {
				if deleted != nil {
					*deleted = true
				}
				return nil
			},
		}
		svc, _ := newTestService(repo)
		if usage != nil {
			svc.SetNetUsage(usage)
		}
		return svc
	}

	t.Run("refuses to delete a net that is on a wheel, and names it", func(t *testing.T) {
		deleted := false
		svc := newSvc(&mockNetUsage{count: 2, plans: []string{"A SQD JEM", "B SQD MPU5"}}, &deleted)

		status, err := svc.DeleteNet(context.Background(), &dto.DeleteNetRequest{ID: "x"})
		if status != http.StatusConflict {
			t.Errorf("status = %d, want 409", status)
		}
		if deleted {
			t.Error("net was deleted despite being on a wheel")
		}
		// The message must say where, not merely refuse.
		if err == nil || !strings.Contains(err.Error(), "A SQD JEM") {
			t.Errorf("error = %v; want it to name the wheels", err)
		}
	})

	t.Run("deletes a net no wheel uses", func(t *testing.T) {
		deleted := false
		svc := newSvc(&mockNetUsage{count: 0}, &deleted)

		status, err := svc.DeleteNet(context.Background(), &dto.DeleteNetRequest{ID: "x"})
		if status != http.StatusNoContent || err != nil {
			t.Errorf("status = %d, err = %v; want 204", status, err)
		}
		if !deleted {
			t.Error("net was not deleted")
		}
	})

	t.Run("a usage-lookup failure blocks the delete rather than allowing it", func(t *testing.T) {
		deleted := false
		svc := newSvc(&mockNetUsage{err: errors.New("db down")}, &deleted)

		status, _ := svc.DeleteNet(context.Background(), &dto.DeleteNetRequest{ID: "x"})
		if status != http.StatusInternalServerError {
			t.Errorf("status = %d, want 500", status)
		}
		if deleted {
			t.Error("net was deleted despite an unreadable usage count")
		}
	})

	t.Run("still refuses when the wheels cannot be named", func(t *testing.T) {
		// Losing the labels must not downgrade a 409 into a successful delete.
		deleted := false
		svc := newSvc(&mockNetUsage{count: 1, plans: nil}, &deleted)

		status, _ := svc.DeleteNet(context.Background(), &dto.DeleteNetRequest{ID: "x"})
		if status != http.StatusConflict {
			t.Errorf("status = %d, want 409", status)
		}
		if deleted {
			t.Error("net was deleted despite being in use")
		}
	})
}

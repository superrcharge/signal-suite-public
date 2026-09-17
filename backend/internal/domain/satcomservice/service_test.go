package satcomservice

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"backend/internal/domain/satcomservice/dto"
	"backend/internal/shared/contracts"
	"backend/internal/shared/response"
)

func sampleService() *SatcomService {
	now := time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC)
	return &SatcomService{
		ID:        "svc-1",
		Abbrev:    "GX",
		Name:      "Inmarsat Global Express",
		CreatedAt: now,
		UpdatedAt: now,
	}
}

// Every domain error must carry a code. A plain errors.New falls through to
// INTERNAL_ERROR, which is how a duplicate abbrev used to report itself as
// "internal server error" while correctly returning 409.
func TestErrorsAreCoded(t *testing.T) {
	tests := []struct {
		err        *Error
		wantCode   string
		wantStatus int
	}{
		{ErrServiceNotFound, "SERVICE_NOT_FOUND", http.StatusNotFound},
		{ErrServiceAbbrevExists, "SERVICE_ABBREV_EXISTS", http.StatusConflict},
		{ErrServiceInternalError, "SERVICE_INTERNAL_ERROR", http.StatusInternalServerError},
	}
	for _, tt := range tests {
		var coded response.CodedError = tt.err
		if coded.GetCode() != tt.wantCode {
			t.Errorf("code = %q, want %q", coded.GetCode(), tt.wantCode)
		}
		if coded.GetStatus() != tt.wantStatus {
			t.Errorf("%s status = %d, want %d", tt.wantCode, coded.GetStatus(), tt.wantStatus)
		}
		if coded.Error() == "" {
			t.Errorf("%s has an empty message", tt.wantCode)
		}
	}

	// The envelope must surface the real code, not the INTERNAL_ERROR fallback.
	got := response.Err(ErrServiceAbbrevExists)
	if got.Error == nil || got.Error.Code != "SERVICE_ABBREV_EXISTS" {
		t.Errorf("envelope code = %+v, want SERVICE_ABBREV_EXISTS", got.Error)
	}
}

func TestCreateServiceRejectsDuplicateAbbrev(t *testing.T) {
	repo := &MockRepository{
		AbbrevExistsFunc: func(_ context.Context, _ string) (bool, error) { return true, nil },
	}
	svc := NewService(repo)

	status, err := svc.CreateService(context.Background(),
		&dto.CreateServiceRequest{Abbrev: "gx"}, &dto.CreateServiceResponse{})

	if status != http.StatusConflict || !errors.Is(err, ErrServiceAbbrevExists) {
		t.Errorf("status = %d, err = %v; want 409 / %v", status, err, ErrServiceAbbrevExists)
	}
}

// The AbbrevExists / AbbrevExistsExcluding checks lose to a concurrent write:
// two creates with the same abbrev both pass, and the unique index catches the
// loser. That has to read as the 409 it is, not the 500 a raw pgx error becomes.
func TestUniqueViolationIsAConflictNotAnError(t *testing.T) {
	t.Run("create", func(t *testing.T) {
		repo := &MockRepository{
			CreateFunc: func(_ context.Context, _ *SatcomService) error {
				// What the repository's mapUniqueViolation hands back for SQLSTATE
				// 23505 on services_abbrev_lower_idx.
				return ErrServiceAbbrevExists
			},
		}
		svc := NewService(repo)

		status, err := svc.CreateService(context.Background(),
			&dto.CreateServiceRequest{Abbrev: "GX"}, &dto.CreateServiceResponse{})

		if status != http.StatusConflict || !errors.Is(err, ErrServiceAbbrevExists) {
			t.Errorf("status = %d, err = %v; want 409 / %v", status, err, ErrServiceAbbrevExists)
		}
	})

	t.Run("update", func(t *testing.T) {
		abbrev := "GX"
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*SatcomService, error) {
				return sampleService(), nil
			},
			UpdateFunc: func(_ context.Context, _ *SatcomService) error {
				return ErrServiceAbbrevExists
			},
		}
		svc := NewService(repo)

		status, err := svc.UpdateService(context.Background(),
			&dto.UpdateServiceRequest{ID: "svc-1", Abbrev: &abbrev}, &dto.UpdateServiceResponse{})

		if status != http.StatusConflict || !errors.Is(err, ErrServiceAbbrevExists) {
			t.Errorf("status = %d, err = %v; want 409 / %v", status, err, ErrServiceAbbrevExists)
		}
	})

	t.Run("any other write failure is still a 500", func(t *testing.T) {
		repo := &MockRepository{
			CreateFunc: func(_ context.Context, _ *SatcomService) error {
				return errors.New("connection reset")
			},
		}
		svc := NewService(repo)

		status, err := svc.CreateService(context.Background(),
			&dto.CreateServiceRequest{Abbrev: "GX"}, &dto.CreateServiceResponse{})

		if status != http.StatusInternalServerError || !errors.Is(err, ErrServiceInternalError) {
			t.Errorf("status = %d, err = %v; want 500 / %v", status, err, ErrServiceInternalError)
		}
	})
}

// Unlike waveforms, a service delete is never blocked. The only reference is
// the denormalized abbrev in equipment.data, which is allowed to go orphan -
// the editor shows those as removable gray chips. This test pins that choice so
// a future "in use" guard has to be a deliberate change, not a drift.
func TestDeleteServiceIsNotGuarded(t *testing.T) {
	t.Run("deletes a service equipment still lists", func(t *testing.T) {
		deleted := false
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*SatcomService, error) {
				return sampleService(), nil
			},
			DeleteFunc: func(_ context.Context, _ string) error {
				deleted = true
				return nil
			},
		}
		svc := NewService(repo)

		status, err := svc.DeleteService(context.Background(), &dto.DeleteServiceRequest{ID: "svc-1"})
		if status != http.StatusNoContent || err != nil {
			t.Errorf("status = %d, err = %v; want 204", status, err)
		}
		if !deleted {
			t.Error("service was not deleted")
		}
	})

	t.Run("404s an unknown service", func(t *testing.T) {
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*SatcomService, error) {
				return nil, ErrServiceNotFound
			},
		}
		svc := NewService(repo)

		status, err := svc.DeleteService(context.Background(), &dto.DeleteServiceRequest{ID: "nope"})
		if status != http.StatusNotFound || !errors.Is(err, ErrServiceNotFound) {
			t.Errorf("status = %d, err = %v; want 404", status, err)
		}
	})
}

type mockAuditRecorder struct {
	events []contracts.AuditEventInput
}

func (m *mockAuditRecorder) Record(_ context.Context, in contracts.AuditEventInput) {
	m.events = append(m.events, in)
}

// A library other domains denormalize an abbrev out of must leave a trail: an
// abbrev renamed under equipment's feet is exactly the change someone has to be
// able to look up afterwards.
func TestServiceWritesAreAudited(t *testing.T) {
	newName := "Global Xpress"
	tests := []struct {
		name       string
		call       func(*Service) (int, error)
		wantAction string
	}{
		{
			name: "create",
			call: func(svc *Service) (int, error) {
				return svc.CreateService(context.Background(),
					&dto.CreateServiceRequest{Abbrev: "GX", CreatedBy: "alice", ActorID: "u1"},
					&dto.CreateServiceResponse{})
			},
			wantAction: "create",
		},
		{
			name: "update",
			call: func(svc *Service) (int, error) {
				return svc.UpdateService(context.Background(),
					&dto.UpdateServiceRequest{ID: "svc-1", Name: &newName, UpdatedBy: "alice", ActorID: "u1"},
					&dto.UpdateServiceResponse{})
			},
			wantAction: "update",
		},
		{
			name: "delete",
			call: func(svc *Service) (int, error) {
				return svc.DeleteService(context.Background(),
					&dto.DeleteServiceRequest{ID: "svc-1", UpdatedBy: "alice", ActorID: "u1"})
			},
			wantAction: "delete",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &MockRepository{
				FindByIDFunc: func(_ context.Context, _ string) (*SatcomService, error) {
					return sampleService(), nil
				},
				// Stands in for RETURNING id: the real Create fills the id in
				// from the row it wrote, and the audit event keys on it.
				CreateFunc: func(_ context.Context, s *SatcomService) error {
					s.ID = "svc-1"
					return nil
				},
			}
			svc := NewService(repo)
			audit := &mockAuditRecorder{}
			svc.SetAudit(audit)

			if _, err := tt.call(svc); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(audit.events) != 1 {
				t.Fatalf("events = %+v, want exactly one", audit.events)
			}
			e := audit.events[0]
			if e.ResourceType != "service" || e.Action != tt.wantAction {
				t.Errorf("event = %s/%s, want service/%s", e.ResourceType, e.Action, tt.wantAction)
			}
			// Both halves of the actor: the UUID the log keys on and the display
			// name it renders.
			if e.ActorID != "u1" || e.ActorName != "alice" {
				t.Errorf("actor = %q/%q, want u1/alice", e.ActorID, e.ActorName)
			}
			if e.ResourceID != "svc-1" {
				t.Errorf("resource id = %q, want svc-1", e.ResourceID)
			}
		})
	}

	t.Run("the update diff names the field that changed", func(t *testing.T) {
		repo := &MockRepository{
			FindByIDFunc: func(_ context.Context, _ string) (*SatcomService, error) {
				return sampleService(), nil
			},
		}
		svc := NewService(repo)
		audit := &mockAuditRecorder{}
		svc.SetAudit(audit)

		if _, err := svc.UpdateService(context.Background(),
			&dto.UpdateServiceRequest{ID: "svc-1", Name: &newName},
			&dto.UpdateServiceResponse{}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		changes := audit.events[0].Changes
		if _, ok := changes["name"]; !ok {
			t.Errorf("diff missing name: %+v", changes)
		}
		// Untouched fields stay out of the diff.
		if _, ok := changes["abbrev"]; ok {
			t.Errorf("diff reports abbrev, which the request never sent: %+v", changes)
		}
	})

	t.Run("a service with no recorder wired still saves", func(t *testing.T) {
		// Record is best-effort; an unwired audit must never fail a write.
		svc := NewService(&MockRepository{})
		status, err := svc.CreateService(context.Background(),
			&dto.CreateServiceRequest{Abbrev: "GX"}, &dto.CreateServiceResponse{})
		if status != http.StatusCreated || err != nil {
			t.Errorf("status = %d, err = %v; want 201", status, err)
		}
	})
}

// Abbrevs are stored trimmed so the case-insensitive unique index and the
// frontend reverse index agree on what counts as the same service.
func TestCreateServiceTrimsFields(t *testing.T) {
	var created *SatcomService
	repo := &MockRepository{
		CreateFunc: func(_ context.Context, s *SatcomService) error {
			created = s
			return nil
		},
	}
	svc := NewService(repo)

	status, err := svc.CreateService(context.Background(),
		&dto.CreateServiceRequest{Abbrev: "  GX  ", Name: " Global Express ", Description: " desc "},
		&dto.CreateServiceResponse{})

	if status != http.StatusCreated || err != nil {
		t.Fatalf("status = %d, err = %v; want 201", status, err)
	}
	if created.Abbrev != "GX" || created.Name != "Global Express" || created.Description != "desc" {
		t.Errorf("stored %+v; want trimmed fields", created)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Services gain a usage READOUT and deliberately not a delete guard -
// TestDeleteServiceIsNotGuarded above still pins that. The lookup exists to
// tell a librarian what offers an entry, not to refuse removing it.
// ─────────────────────────────────────────────────────────────────────────────

type mockServiceAssets struct {
	usage map[string][]string
	err   error
}

func (m *mockServiceAssets) ServiceUsage(_ context.Context) (map[string][]string, error) {
	return m.usage, m.err
}

func TestServiceUsageEndpoint(t *testing.T) {
	t.Run("reports the terminals offering each service", func(t *testing.T) {
		svc := NewService(&MockRepository{})
		svc.SetServiceAssets(&mockServiceAssets{usage: map[string][]string{
			"gx":  {"GX-2", "GX-10"},
			"wgs": {"BE-900"},
		}})
		resp := &dto.UsageResponse{}

		status, err := svc.ServiceUsage(context.Background(), resp)

		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v; want 200", status, err)
		}
		if len(resp.Usage["gx"]) != 2 || resp.Total != 2 {
			t.Errorf("usage = %v, total = %d", resp.Usage, resp.Total)
		}
	})

	t.Run("reports an empty map, never nil, with no provider wired", func(t *testing.T) {
		// Every other unit test in this package builds a Service without it, and
		// a nil map would marshal as JSON null where the frontend expects {}.
		resp := &dto.UsageResponse{}
		status, err := NewService(&MockRepository{}).ServiceUsage(context.Background(), resp)

		if status != http.StatusOK || err != nil {
			t.Fatalf("status = %d, err = %v; want 200", status, err)
		}
		if resp.Usage == nil {
			t.Error("usage is nil; it must marshal as {} rather than null")
		}
	})

	t.Run("reports a lookup failure rather than an empty library", func(t *testing.T) {
		svc := NewService(&MockRepository{})
		svc.SetServiceAssets(&mockServiceAssets{err: errors.New("db down")})

		status, _ := svc.ServiceUsage(context.Background(), &dto.UsageResponse{})

		if status != http.StatusInternalServerError {
			t.Errorf("status = %d, want 500 - an empty map would read as 'nothing offers anything'", status)
		}
	})
}

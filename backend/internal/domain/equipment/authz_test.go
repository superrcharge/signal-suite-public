package equipment

import (
	"context"
	"net/http"
	"testing"

	"backend/internal/domain/equipment/dto"
	"backend/internal/domain/user"
)

// The rto role writes the radio side of the catalog only. That cannot be
// enforced by RequireRole, because satcom and radio records share one set of
// routes and are separated by the terminal_type column - so the service is
// the only place the rule can live. These tests cover each write path.

func radioRecord() *Equipment {
	return &Equipment{ID: "eq-radio", Nomenclature: "AN/PRC-117G", TerminalType: TerminalTypeRadio}
}

func satcomRecord() *Equipment {
	return &Equipment{ID: "eq-satcom", Nomenclature: "AN/TSC-198", TerminalType: TerminalTypeSATCOM}
}

func TestCreateEquipment_RadioScope(t *testing.T) {
	tests := []struct {
		name           string
		actorRadioOnly bool
		terminalType   string
		wantStatus     int
		wantCreated    bool
	}{
		{"rto creating radio is allowed", true, TerminalTypeRadio, http.StatusCreated, true},
		{"rto creating satcom is forbidden", true, TerminalTypeSATCOM, http.StatusForbidden, false},
		{"unscoped writer creating satcom is allowed", false, TerminalTypeSATCOM, http.StatusCreated, true},
		{"unscoped writer creating radio is allowed", false, TerminalTypeRadio, http.StatusCreated, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			created := false
			repo := &MockRepository{
				ExistsIDFunc: func(context.Context, string) (bool, error) { return false, nil },
				CreateFunc: func(context.Context, *Equipment) error {
					created = true
					return nil
				},
			}

			status, err := NewService(repo).CreateEquipment(
				context.Background(),
				&dto.CreateEquipmentRequest{
					ID:             "eq-new",
					Nomenclature:   "Test",
					TerminalType:   tt.terminalType,
					ActorRadioOnly: tt.actorRadioOnly,
				},
				&dto.CreateEquipmentResponse{},
			)

			if status != tt.wantStatus {
				t.Errorf("status = %d, want %d (err: %v)", status, tt.wantStatus, err)
			}
			if created != tt.wantCreated {
				t.Errorf("record created = %v, want %v", created, tt.wantCreated)
			}
			if tt.wantStatus == http.StatusForbidden && err != ErrRadioScopeOnly {
				t.Errorf("err = %v, want ErrRadioScopeOnly", err)
			}
		})
	}
}

func TestUpdateEquipment_RadioScope(t *testing.T) {
	tests := []struct {
		name           string
		existing       *Equipment
		actorRadioOnly bool
		newTerminal    *string
		wantStatus     int
		wantUpdated    bool
	}{
		{
			name:     "rto updating a radio record is allowed",
			existing: radioRecord(), actorRadioOnly: true,
			wantStatus: http.StatusOK, wantUpdated: true,
		},
		{
			name:     "rto updating a satcom record is forbidden",
			existing: satcomRecord(), actorRadioOnly: true,
			wantStatus: http.StatusForbidden, wantUpdated: false,
		},
		{
			// The escape hatch: without this check an rto caller flips a record
			// to satcom, and every later edit passes the existing-record check.
			name:     "rto moving a radio record to satcom is forbidden",
			existing: radioRecord(), actorRadioOnly: true,
			newTerminal: strPtr(TerminalTypeSATCOM),
			wantStatus:  http.StatusForbidden, wantUpdated: false,
		},
		{
			name:     "rto restating terminal_type as radio is allowed",
			existing: radioRecord(), actorRadioOnly: true,
			newTerminal: strPtr(TerminalTypeRadio),
			wantStatus:  http.StatusOK, wantUpdated: true,
		},
		{
			name:     "unscoped writer updating a satcom record is allowed",
			existing: satcomRecord(), actorRadioOnly: false,
			wantStatus: http.StatusOK, wantUpdated: true,
		},
		{
			name:     "unscoped writer may move a record across the boundary",
			existing: radioRecord(), actorRadioOnly: false,
			newTerminal: strPtr(TerminalTypeSATCOM),
			wantStatus:  http.StatusOK, wantUpdated: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			updated := false
			repo := &MockRepository{
				FindByIDFunc: func(context.Context, string) (*Equipment, error) { return tt.existing, nil },
				UpdateFunc: func(context.Context, *Equipment) error {
					updated = true
					return nil
				},
			}

			status, err := NewService(repo).UpdateEquipment(
				context.Background(),
				&dto.UpdateEquipmentRequest{
					ID:             tt.existing.ID,
					TerminalType:   tt.newTerminal,
					ActorRadioOnly: tt.actorRadioOnly,
				},
				&dto.UpdateEquipmentResponse{},
			)

			if status != tt.wantStatus {
				t.Errorf("status = %d, want %d (err: %v)", status, tt.wantStatus, err)
			}
			if updated != tt.wantUpdated {
				t.Errorf("repo.Update called = %v, want %v", updated, tt.wantUpdated)
			}
			if tt.wantStatus == http.StatusForbidden && err != ErrRadioScopeOnly {
				t.Errorf("err = %v, want ErrRadioScopeOnly", err)
			}
		})
	}
}

func TestDeleteEquipment_RadioScope(t *testing.T) {
	tests := []struct {
		name           string
		existing       *Equipment
		actorRadioOnly bool
		wantStatus     int
		wantDeleted    bool
	}{
		{"rto deleting a radio record is allowed", radioRecord(), true, http.StatusNoContent, true},
		{"rto deleting a satcom record is forbidden", satcomRecord(), true, http.StatusForbidden, false},
		{"unscoped writer deleting a satcom record is allowed", satcomRecord(), false, http.StatusNoContent, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			deleted := false
			repo := &MockRepository{
				FindByIDFunc: func(context.Context, string) (*Equipment, error) { return tt.existing, nil },
				DeleteFunc: func(context.Context, string) error {
					deleted = true
					return nil
				},
			}

			status, err := NewService(repo).DeleteEquipment(
				context.Background(),
				&dto.DeleteEquipmentRequest{ID: tt.existing.ID, ActorRadioOnly: tt.actorRadioOnly},
				nil,
			)

			if status != tt.wantStatus {
				t.Errorf("status = %d, want %d (err: %v)", status, tt.wantStatus, err)
			}
			if deleted != tt.wantDeleted {
				t.Errorf("repo.Delete called = %v, want %v", deleted, tt.wantDeleted)
			}
			if tt.wantStatus == http.StatusForbidden && err != ErrRadioScopeOnly {
				t.Errorf("err = %v, want ErrRadioScopeOnly", err)
			}
		})
	}
}

// The equipment package copies the role names rather than importing the user
// domain, because domains do not depend on one another (see
// internal/shared/contracts). This test is the seam that keeps the copies
// correct - a renamed role in the user domain would otherwise silently turn
// actorRadioOnly into a no-op, quietly widening rto's write scope.
func TestRoleNamesMatchUserDomain(t *testing.T) {
	pairs := []struct {
		local, canonical, label string
	}{
		{roleAdmin, user.RoleAdmin, "admin"},
		{roleEditor, user.RoleEditor, "editor"},
		{roleRTO, user.RoleRTO, "rto"},
	}

	for _, p := range pairs {
		if p.local != p.canonical {
			t.Errorf("%s: equipment has %q, user domain has %q", p.label, p.local, p.canonical)
		}
	}
}

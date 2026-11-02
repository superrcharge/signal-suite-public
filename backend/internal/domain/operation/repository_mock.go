package operation

import (
	"context"
	"time"
)

// MockRepository is a hand-rolled test double. It lives outside _test.go so
// other packages can use it.
type MockRepository struct {
	FindAllFunc                     func(ctx context.Context) ([]*Operation, error)
	FindByIDFunc                    func(ctx context.Context, id string) (*Operation, error)
	NameExistsFunc                  func(ctx context.Context, name string) (bool, error)
	NameExistsExcludingFunc         func(ctx context.Context, name, excludeID string) (bool, error)
	CreateFunc                      func(ctx context.Context, o *Operation) error
	UpdateFunc                      func(ctx context.Context, o *Operation) error
	DeleteFunc                      func(ctx context.Context, id string) error
	FindParticipantsFunc            func(ctx context.Context, operationID string) ([]*Participant, error)
	FindParticipantFunc             func(ctx context.Context, operationID, orgKey string) (*Participant, error)
	CreateParticipantFunc           func(ctx context.Context, p *Participant) error
	UpdateParticipantFunc           func(ctx context.Context, p *Participant) error
	DeleteParticipantFunc           func(ctx context.Context, operationID, orgKey string) error
	FindParticipantByIDFunc         func(ctx context.Context, operationID, participantID string) (*Participant, error)
	DeleteParticipantByIDFunc       func(ctx context.Context, operationID, participantID string) error
	OperationsUsingOrganizationFunc func(ctx context.Context, key string) ([]string, error)
	FindPhasesFunc                  func(ctx context.Context, operationID string) ([]*Phase, error)
	ReplacePhasesFunc               func(ctx context.Context, operationID string, phases []*Phase, carried []AssetPhaseRow, updatedBy string, now time.Time) error
	FindSitesFunc                   func(ctx context.Context, operationID string) ([]*Site, error)
	ReplaceSitesFunc                func(ctx context.Context, operationID string, sites []*Site, updatedBy string, now time.Time) error
	FindPhasePlansFunc              func(ctx context.Context, operationID string) (map[string]PhasePlan, error)
	ReplacePhasePlanFunc            func(ctx context.Context, operationID, phaseID string, plan PhasePlan, updatedBy string, now time.Time) error
	FindRFIsFunc                    func(ctx context.Context, operationID string) ([]*RFI, error)
	FindRFIFunc                     func(ctx context.Context, operationID, rfiID string) (*RFI, error)
	CreateRFIFunc                   func(ctx context.Context, r *RFI) error
	AddRFICommentFunc               func(ctx context.Context, operationID string, c *RFIComment) error
	ResolveRFIFunc                  func(ctx context.Context, operationID, rfiID, by string, at time.Time) error
}

func (m *MockRepository) FindAll(ctx context.Context) ([]*Operation, error) {
	if m.FindAllFunc != nil {
		return m.FindAllFunc(ctx)
	}
	return nil, nil
}

func (m *MockRepository) FindByID(ctx context.Context, id string) (*Operation, error) {
	if m.FindByIDFunc != nil {
		return m.FindByIDFunc(ctx, id)
	}
	return nil, nil
}

func (m *MockRepository) NameExists(ctx context.Context, name string) (bool, error) {
	if m.NameExistsFunc != nil {
		return m.NameExistsFunc(ctx, name)
	}
	return false, nil
}

func (m *MockRepository) NameExistsExcluding(ctx context.Context, name, excludeID string) (bool, error) {
	if m.NameExistsExcludingFunc != nil {
		return m.NameExistsExcludingFunc(ctx, name, excludeID)
	}
	return false, nil
}

// Create assigns an id when the test did not, as the real repository does.
func (m *MockRepository) Create(ctx context.Context, o *Operation) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, o)
	}
	if o.ID == "" {
		o.ID = "op-1"
	}
	return nil
}

func (m *MockRepository) Update(ctx context.Context, o *Operation) error {
	if m.UpdateFunc != nil {
		return m.UpdateFunc(ctx, o)
	}
	return nil
}

func (m *MockRepository) Delete(ctx context.Context, id string) error {
	if m.DeleteFunc != nil {
		return m.DeleteFunc(ctx, id)
	}
	return nil
}

func (m *MockRepository) FindParticipants(ctx context.Context, operationID string) ([]*Participant, error) {
	if m.FindParticipantsFunc != nil {
		return m.FindParticipantsFunc(ctx, operationID)
	}
	return nil, nil
}

// FindParticipant defaults to "not checked in", the answer for an operation
// nothing has joined.
func (m *MockRepository) FindParticipant(ctx context.Context, operationID, orgKey string) (*Participant, error) {
	if m.FindParticipantFunc != nil {
		return m.FindParticipantFunc(ctx, operationID, orgKey)
	}
	return nil, ErrParticipantNotFound
}

// CreateParticipant assigns an id when the test did not, as the real
// repository does.
func (m *MockRepository) CreateParticipant(ctx context.Context, p *Participant) error {
	if m.CreateParticipantFunc != nil {
		return m.CreateParticipantFunc(ctx, p)
	}
	if p.ID == "" {
		p.ID = "part-1"
	}
	return nil
}

func (m *MockRepository) UpdateParticipant(ctx context.Context, p *Participant) error {
	if m.UpdateParticipantFunc != nil {
		return m.UpdateParticipantFunc(ctx, p)
	}
	return nil
}

func (m *MockRepository) DeleteParticipant(ctx context.Context, operationID, orgKey string) error {
	if m.DeleteParticipantFunc != nil {
		return m.DeleteParticipantFunc(ctx, operationID, orgKey)
	}
	return nil
}

// FindParticipantByID defaults to "not found", like FindParticipant.
func (m *MockRepository) FindParticipantByID(ctx context.Context, operationID, participantID string) (*Participant, error) {
	if m.FindParticipantByIDFunc != nil {
		return m.FindParticipantByIDFunc(ctx, operationID, participantID)
	}
	return nil, ErrParticipantNotFound
}

func (m *MockRepository) DeleteParticipantByID(ctx context.Context, operationID, participantID string) error {
	if m.DeleteParticipantByIDFunc != nil {
		return m.DeleteParticipantByIDFunc(ctx, operationID, participantID)
	}
	return nil
}

func (m *MockRepository) OperationsUsingOrganization(ctx context.Context, key string) ([]string, error) {
	if m.OperationsUsingOrganizationFunc != nil {
		return m.OperationsUsingOrganizationFunc(ctx, key)
	}
	return nil, nil
}

func (m *MockRepository) FindPhases(ctx context.Context, operationID string) ([]*Phase, error) {
	if m.FindPhasesFunc != nil {
		return m.FindPhasesFunc(ctx, operationID)
	}
	return nil, nil
}

func (m *MockRepository) ReplacePhases(ctx context.Context, operationID string, phases []*Phase, carried []AssetPhaseRow, updatedBy string, now time.Time) error {
	if m.ReplacePhasesFunc != nil {
		return m.ReplacePhasesFunc(ctx, operationID, phases, carried, updatedBy, now)
	}
	return nil
}

func (m *MockRepository) FindSites(ctx context.Context, operationID string) ([]*Site, error) {
	if m.FindSitesFunc != nil {
		return m.FindSitesFunc(ctx, operationID)
	}
	return nil, nil
}

func (m *MockRepository) ReplaceSites(ctx context.Context, operationID string, sites []*Site, updatedBy string, now time.Time) error {
	if m.ReplaceSitesFunc != nil {
		return m.ReplaceSitesFunc(ctx, operationID, sites, updatedBy, now)
	}
	return nil
}

func (m *MockRepository) FindPhasePlans(ctx context.Context, operationID string) (map[string]PhasePlan, error) {
	if m.FindPhasePlansFunc != nil {
		return m.FindPhasePlansFunc(ctx, operationID)
	}
	return nil, nil
}

func (m *MockRepository) ReplacePhasePlan(ctx context.Context, operationID, phaseID string, plan PhasePlan, updatedBy string, now time.Time) error {
	if m.ReplacePhasePlanFunc != nil {
		return m.ReplacePhasePlanFunc(ctx, operationID, phaseID, plan, updatedBy, now)
	}
	return nil
}

func (m *MockRepository) FindRFIs(ctx context.Context, operationID string) ([]*RFI, error) {
	if m.FindRFIsFunc != nil {
		return m.FindRFIsFunc(ctx, operationID)
	}
	return nil, nil
}

func (m *MockRepository) FindRFI(ctx context.Context, operationID, rfiID string) (*RFI, error) {
	if m.FindRFIFunc != nil {
		return m.FindRFIFunc(ctx, operationID, rfiID)
	}
	return nil, ErrRFINotFound
}

func (m *MockRepository) CreateRFI(ctx context.Context, r *RFI) error {
	if m.CreateRFIFunc != nil {
		return m.CreateRFIFunc(ctx, r)
	}
	return nil
}

func (m *MockRepository) AddRFIComment(ctx context.Context, operationID string, c *RFIComment) error {
	if m.AddRFICommentFunc != nil {
		return m.AddRFICommentFunc(ctx, operationID, c)
	}
	return nil
}

func (m *MockRepository) ResolveRFI(ctx context.Context, operationID, rfiID, by string, at time.Time) error {
	if m.ResolveRFIFunc != nil {
		return m.ResolveRFIFunc(ctx, operationID, rfiID, by, at)
	}
	return nil
}

package transport

import "context"

// MockRepository is a hand-rolled test double. It lives outside _test.go so
// other packages can use it.
type MockRepository struct {
	FindAllFunc             func(ctx context.Context) ([]*Transport, error)
	FindByIDFunc            func(ctx context.Context, id string) (*Transport, error)
	NameExistsFunc          func(ctx context.Context, name string) (bool, error)
	NameExistsExcludingFunc func(ctx context.Context, name, excludeID string) (bool, error)
	CreateFunc              func(ctx context.Context, t *Transport) error
	UpdateFunc              func(ctx context.Context, t *Transport) error
	DeleteFunc              func(ctx context.Context, id string) error
}

func (m *MockRepository) FindAll(ctx context.Context) ([]*Transport, error) {
	if m.FindAllFunc != nil {
		return m.FindAllFunc(ctx)
	}
	return nil, nil
}

func (m *MockRepository) FindByID(ctx context.Context, id string) (*Transport, error) {
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

func (m *MockRepository) Create(ctx context.Context, t *Transport) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, t)
	}
	return nil
}

func (m *MockRepository) Update(ctx context.Context, t *Transport) error {
	if m.UpdateFunc != nil {
		return m.UpdateFunc(ctx, t)
	}
	return nil
}

func (m *MockRepository) Delete(ctx context.Context, id string) error {
	if m.DeleteFunc != nil {
		return m.DeleteFunc(ctx, id)
	}
	return nil
}

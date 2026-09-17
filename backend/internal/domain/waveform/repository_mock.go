package waveform

import "context"

// MockRepository is a hand-rolled test double. It lives outside _test.go so
// other packages can use it.
type MockRepository struct {
	FindAllFunc               func(ctx context.Context) ([]*Waveform, error)
	FindByIDFunc              func(ctx context.Context, id string) (*Waveform, error)
	AbbrevExistsFunc          func(ctx context.Context, abbrev string) (bool, error)
	AbbrevExistsExcludingFunc func(ctx context.Context, abbrev, excludeID string) (bool, error)
	CreateFunc                func(ctx context.Context, w *Waveform) error
	UpdateFunc                func(ctx context.Context, w *Waveform) error
	DeleteFunc                func(ctx context.Context, id string) error
}

func (m *MockRepository) FindAll(ctx context.Context) ([]*Waveform, error) {
	if m.FindAllFunc != nil {
		return m.FindAllFunc(ctx)
	}
	return nil, nil
}

func (m *MockRepository) FindByID(ctx context.Context, id string) (*Waveform, error) {
	if m.FindByIDFunc != nil {
		return m.FindByIDFunc(ctx, id)
	}
	return nil, nil
}

func (m *MockRepository) AbbrevExists(ctx context.Context, abbrev string) (bool, error) {
	if m.AbbrevExistsFunc != nil {
		return m.AbbrevExistsFunc(ctx, abbrev)
	}
	return false, nil
}

func (m *MockRepository) AbbrevExistsExcluding(ctx context.Context, abbrev, excludeID string) (bool, error) {
	if m.AbbrevExistsExcludingFunc != nil {
		return m.AbbrevExistsExcludingFunc(ctx, abbrev, excludeID)
	}
	return false, nil
}

func (m *MockRepository) Create(ctx context.Context, w *Waveform) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, w)
	}
	return nil
}

func (m *MockRepository) Update(ctx context.Context, w *Waveform) error {
	if m.UpdateFunc != nil {
		return m.UpdateFunc(ctx, w)
	}
	return nil
}

func (m *MockRepository) Delete(ctx context.Context, id string) error {
	if m.DeleteFunc != nil {
		return m.DeleteFunc(ctx, id)
	}
	return nil
}

package equipment

import "context"

// MockRepository is a configurable Repository for tests. Leave a Func nil to
// get the harmless default.
type MockRepository struct {
	CreateFunc   func(ctx context.Context, e *Equipment) error
	FindByIDFunc func(ctx context.Context, id string) (*Equipment, error)
	FindAllFunc  func(ctx context.Context, terminalType, search string) ([]*Equipment, error)
	UpdateFunc   func(ctx context.Context, e *Equipment) error
	DeleteFunc   func(ctx context.Context, id string) error
	ExistsIDFunc func(ctx context.Context, id string) (bool, error)

	WaveformUsageFunc  func(ctx context.Context) (map[string][]string, error)
	RenameWaveformFunc func(ctx context.Context, from, to string) (int, error)
	ServiceUsageFunc   func(ctx context.Context) (map[string][]string, error)
}

func (m *MockRepository) Create(ctx context.Context, e *Equipment) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, e)
	}
	return nil
}

func (m *MockRepository) FindByID(ctx context.Context, id string) (*Equipment, error) {
	if m.FindByIDFunc != nil {
		return m.FindByIDFunc(ctx, id)
	}
	return nil, ErrEquipmentNotFound
}

func (m *MockRepository) FindAll(ctx context.Context, terminalType, search string) ([]*Equipment, error) {
	if m.FindAllFunc != nil {
		return m.FindAllFunc(ctx, terminalType, search)
	}
	return nil, nil
}

func (m *MockRepository) Update(ctx context.Context, e *Equipment) error {
	if m.UpdateFunc != nil {
		return m.UpdateFunc(ctx, e)
	}
	return nil
}

func (m *MockRepository) Delete(ctx context.Context, id string) error {
	if m.DeleteFunc != nil {
		return m.DeleteFunc(ctx, id)
	}
	return nil
}

func (m *MockRepository) ExistsID(ctx context.Context, id string) (bool, error) {
	if m.ExistsIDFunc != nil {
		return m.ExistsIDFunc(ctx, id)
	}
	return true, nil
}

func (m *MockRepository) WaveformUsage(ctx context.Context) (map[string][]string, error) {
	if m.WaveformUsageFunc != nil {
		return m.WaveformUsageFunc(ctx)
	}
	return map[string][]string{}, nil
}

func (m *MockRepository) RenameWaveform(ctx context.Context, from, to string) (int, error) {
	if m.RenameWaveformFunc != nil {
		return m.RenameWaveformFunc(ctx, from, to)
	}
	return 0, nil
}

func (m *MockRepository) ServiceUsage(ctx context.Context) (map[string][]string, error) {
	if m.ServiceUsageFunc != nil {
		return m.ServiceUsageFunc(ctx)
	}
	return map[string][]string{}, nil
}

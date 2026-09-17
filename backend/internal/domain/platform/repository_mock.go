package platform

import "context"

// MockRepository is a hand-rolled test double. It lives outside _test.go so
// other packages can use it.
type MockRepository struct {
	FindAllFunc                    func(ctx context.Context) ([]*Platform, error)
	FindByIDFunc                   func(ctx context.Context, id string) (*Platform, error)
	DesignationExistsFunc          func(ctx context.Context, designation string) (bool, error)
	DesignationExistsExcludingFunc func(ctx context.Context, designation, excludeID string) (bool, error)
	CreateFunc                     func(ctx context.Context, p *Platform) error
	UpdateFunc                     func(ctx context.Context, p *Platform) error
	DeleteFunc                     func(ctx context.Context, id string) error
	WaveformUsageFunc              func(ctx context.Context) (map[string][]string, error)
	RenameWaveformFunc             func(ctx context.Context, from, to string) (int, error)
}

func (m *MockRepository) FindAll(ctx context.Context) ([]*Platform, error) {
	if m.FindAllFunc != nil {
		return m.FindAllFunc(ctx)
	}
	return nil, nil
}

func (m *MockRepository) FindByID(ctx context.Context, id string) (*Platform, error) {
	if m.FindByIDFunc != nil {
		return m.FindByIDFunc(ctx, id)
	}
	return nil, nil
}

func (m *MockRepository) DesignationExists(ctx context.Context, designation string) (bool, error) {
	if m.DesignationExistsFunc != nil {
		return m.DesignationExistsFunc(ctx, designation)
	}
	return false, nil
}

func (m *MockRepository) DesignationExistsExcluding(ctx context.Context, designation, excludeID string) (bool, error) {
	if m.DesignationExistsExcludingFunc != nil {
		return m.DesignationExistsExcludingFunc(ctx, designation, excludeID)
	}
	return false, nil
}

func (m *MockRepository) Create(ctx context.Context, p *Platform) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, p)
	}
	return nil
}

func (m *MockRepository) Update(ctx context.Context, p *Platform) error {
	if m.UpdateFunc != nil {
		return m.UpdateFunc(ctx, p)
	}
	return nil
}

func (m *MockRepository) Delete(ctx context.Context, id string) error {
	if m.DeleteFunc != nil {
		return m.DeleteFunc(ctx, id)
	}
	return nil
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

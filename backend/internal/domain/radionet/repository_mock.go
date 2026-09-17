package radionet

import "context"

// MockRepository is a hand-rolled test double following the same shape as
// kit.MockRepository. It lives outside _test.go so other packages can use it.
type MockRepository struct {
	FindBySectionFunc       func(ctx context.Context, section string) ([]*Net, error)
	SectionExistsFunc       func(ctx context.Context, section string) (bool, error)
	FindByIDFunc            func(ctx context.Context, id string) (*Net, error)
	NameExistsFunc          func(ctx context.Context, section, name string) (bool, error)
	NameExistsExcludingFunc func(ctx context.Context, section, name, excludeID string) (bool, error)
	CreateFunc              func(ctx context.Context, n *Net) error
	UpdateFunc              func(ctx context.Context, n *Net) error
	DeleteFunc              func(ctx context.Context, id string) error
	InfoByIDsFunc           func(ctx context.Context, ids []string) (map[string]NetInfo, error)
	CountBySectionFunc      func(ctx context.Context, section string) (int, error)
}

func (m *MockRepository) FindBySection(ctx context.Context, section string) ([]*Net, error) {
	if m.FindBySectionFunc != nil {
		return m.FindBySectionFunc(ctx, section)
	}
	return nil, nil
}

func (m *MockRepository) SectionExists(ctx context.Context, section string) (bool, error) {
	if m.SectionExistsFunc != nil {
		return m.SectionExistsFunc(ctx, section)
	}
	return true, nil
}

func (m *MockRepository) FindByID(ctx context.Context, id string) (*Net, error) {
	if m.FindByIDFunc != nil {
		return m.FindByIDFunc(ctx, id)
	}
	return nil, nil
}

func (m *MockRepository) NameExists(ctx context.Context, section, name string) (bool, error) {
	if m.NameExistsFunc != nil {
		return m.NameExistsFunc(ctx, section, name)
	}
	return false, nil
}

func (m *MockRepository) NameExistsExcluding(ctx context.Context, section, name, excludeID string) (bool, error) {
	if m.NameExistsExcludingFunc != nil {
		return m.NameExistsExcludingFunc(ctx, section, name, excludeID)
	}
	return false, nil
}

func (m *MockRepository) Create(ctx context.Context, n *Net) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, n)
	}
	return nil
}

func (m *MockRepository) Update(ctx context.Context, n *Net) error {
	if m.UpdateFunc != nil {
		return m.UpdateFunc(ctx, n)
	}
	return nil
}

func (m *MockRepository) Delete(ctx context.Context, id string) error {
	if m.DeleteFunc != nil {
		return m.DeleteFunc(ctx, id)
	}
	return nil
}

func (m *MockRepository) InfoByIDs(ctx context.Context, ids []string) (map[string]NetInfo, error) {
	if m.InfoByIDsFunc != nil {
		return m.InfoByIDsFunc(ctx, ids)
	}
	return map[string]NetInfo{}, nil
}

func (m *MockRepository) CountBySection(ctx context.Context, section string) (int, error) {
	if m.CountBySectionFunc != nil {
		return m.CountBySectionFunc(ctx, section)
	}
	return 0, nil
}

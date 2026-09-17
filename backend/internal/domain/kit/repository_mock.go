package kit

import "context"

// MockRepository implements Repository for unit tests. Each method
// delegates to its corresponding Func field when set; unset methods
// return zero values so tests only stub what they exercise.
type MockRepository struct {
	CreateFunc          func(ctx context.Context, k *Kit) error
	FindByIDFunc        func(ctx context.Context, id string) (*Kit, error)
	FindAllFunc         func(ctx context.Context, types, sections []string, search string, page, limit int) ([]*Kit, int, map[string]int, error)
	FindAllNamesFunc    func(ctx context.Context) ([]string, error)
	FindForExportFunc   func(ctx context.Context, f ExportFilter) ([]*Kit, error)
	CountBySectionFunc  func(ctx context.Context, section string) (int, error)
	ReassignSectionFunc func(ctx context.Context, from, to string) (int, error)
	UpdateFunc          func(ctx context.Context, k *Kit) error
	DeleteFunc          func(ctx context.Context, id string) error
	BulkCreateFunc      func(ctx context.Context, kits []*Kit) error
}

func (m *MockRepository) Create(ctx context.Context, k *Kit) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, k)
	}
	return nil
}

func (m *MockRepository) FindByID(ctx context.Context, id string) (*Kit, error) {
	if m.FindByIDFunc != nil {
		return m.FindByIDFunc(ctx, id)
	}
	return nil, ErrKitNotFound
}

func (m *MockRepository) FindAll(ctx context.Context, types, sections []string, search string, page, limit int) ([]*Kit, int, map[string]int, error) {
	if m.FindAllFunc != nil {
		return m.FindAllFunc(ctx, types, sections, search, page, limit)
	}
	return nil, 0, map[string]int{}, nil
}

func (m *MockRepository) FindAllNames(ctx context.Context) ([]string, error) {
	if m.FindAllNamesFunc != nil {
		return m.FindAllNamesFunc(ctx)
	}
	return nil, nil
}

func (m *MockRepository) FindForExport(ctx context.Context, f ExportFilter) ([]*Kit, error) {
	if m.FindForExportFunc != nil {
		return m.FindForExportFunc(ctx, f)
	}
	return nil, nil
}

func (m *MockRepository) CountBySection(ctx context.Context, section string) (int, error) {
	if m.CountBySectionFunc != nil {
		return m.CountBySectionFunc(ctx, section)
	}
	return 0, nil
}

func (m *MockRepository) ReassignSection(ctx context.Context, from, to string) (int, error) {
	if m.ReassignSectionFunc != nil {
		return m.ReassignSectionFunc(ctx, from, to)
	}
	return 0, nil
}

func (m *MockRepository) Update(ctx context.Context, k *Kit) error {
	if m.UpdateFunc != nil {
		return m.UpdateFunc(ctx, k)
	}
	return nil
}

func (m *MockRepository) Delete(ctx context.Context, id string) error {
	if m.DeleteFunc != nil {
		return m.DeleteFunc(ctx, id)
	}
	return nil
}

func (m *MockRepository) BulkCreate(ctx context.Context, kits []*Kit) error {
	if m.BulkCreateFunc != nil {
		return m.BulkCreateFunc(ctx, kits)
	}
	return nil
}

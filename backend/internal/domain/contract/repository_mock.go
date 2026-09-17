package contract

import "context"

// MockRepository implements Repository for unit tests. Each method delegates to
// its corresponding Func field when set; unset methods return zero values so
// tests only stub what they exercise.
//
// Contract was the one domain with no mock and no test file at all, which is why
// its CSV export shipped a two-column drift that nothing caught.
type MockRepository struct {
	CreateFunc          func(ctx context.Context, c *Contract) error
	FindByIDFunc        func(ctx context.Context, id string) (*Contract, error)
	FindAllFunc         func(ctx context.Context, fy, search string, page, limit int, sortBy, sortDir string) ([]*Contract, int, ContractCounts, error)
	FindForExportFunc   func(ctx context.Context, fiscalYears []string) ([]*Contract, error)
	FindFiscalYearsFunc func(ctx context.Context) ([]string, error)
	UpdateFunc          func(ctx context.Context, c *Contract) error
	DeleteFunc          func(ctx context.Context, id string) error
}

func (m *MockRepository) Create(ctx context.Context, c *Contract) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, c)
	}
	return nil
}

func (m *MockRepository) FindByID(ctx context.Context, id string) (*Contract, error) {
	if m.FindByIDFunc != nil {
		return m.FindByIDFunc(ctx, id)
	}
	return nil, ErrContractNotFound
}

func (m *MockRepository) FindAll(ctx context.Context, fy, search string, page, limit int, sortBy, sortDir string) ([]*Contract, int, ContractCounts, error) {
	if m.FindAllFunc != nil {
		return m.FindAllFunc(ctx, fy, search, page, limit, sortBy, sortDir)
	}
	return nil, 0, ContractCounts{}, nil
}

func (m *MockRepository) FindForExport(ctx context.Context, fiscalYears []string) ([]*Contract, error) {
	if m.FindForExportFunc != nil {
		return m.FindForExportFunc(ctx, fiscalYears)
	}
	return nil, nil
}

func (m *MockRepository) FindFiscalYears(ctx context.Context) ([]string, error) {
	if m.FindFiscalYearsFunc != nil {
		return m.FindFiscalYearsFunc(ctx)
	}
	return nil, nil
}

func (m *MockRepository) Update(ctx context.Context, c *Contract) error {
	if m.UpdateFunc != nil {
		return m.UpdateFunc(ctx, c)
	}
	return nil
}

func (m *MockRepository) Delete(ctx context.Context, id string) error {
	if m.DeleteFunc != nil {
		return m.DeleteFunc(ctx, id)
	}
	return nil
}

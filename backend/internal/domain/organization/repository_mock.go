package organization

import "context"

// MockRepository is a hand-rolled test double. It lives outside _test.go so
// other packages can use it.
type MockRepository struct {
	FindAllFunc             func(ctx context.Context) ([]*Organization, error)
	FindByKeyFunc           func(ctx context.Context, key string) (*Organization, error)
	FindByKeysFunc          func(ctx context.Context, keys []string) ([]*Organization, error)
	KeyExistsFunc           func(ctx context.Context, key string) (bool, error)
	NameExistsFunc          func(ctx context.Context, name string) (bool, error)
	NameExistsExcludingFunc func(ctx context.Context, name, excludeKey string) (bool, error)
	CreateFunc              func(ctx context.Context, o *Organization) error
	UpdateFunc              func(ctx context.Context, o *Organization) error
	DeleteFunc              func(ctx context.Context, key string) error
}

func (m *MockRepository) FindAll(ctx context.Context) ([]*Organization, error) {
	if m.FindAllFunc != nil {
		return m.FindAllFunc(ctx)
	}
	return nil, nil
}

func (m *MockRepository) FindByKey(ctx context.Context, key string) (*Organization, error) {
	if m.FindByKeyFunc != nil {
		return m.FindByKeyFunc(ctx, key)
	}
	return nil, nil
}

func (m *MockRepository) FindByKeys(ctx context.Context, keys []string) ([]*Organization, error) {
	if m.FindByKeysFunc != nil {
		return m.FindByKeysFunc(ctx, keys)
	}
	return nil, nil
}

func (m *MockRepository) KeyExists(ctx context.Context, key string) (bool, error) {
	if m.KeyExistsFunc != nil {
		return m.KeyExistsFunc(ctx, key)
	}
	return false, nil
}

func (m *MockRepository) NameExists(ctx context.Context, name string) (bool, error) {
	if m.NameExistsFunc != nil {
		return m.NameExistsFunc(ctx, name)
	}
	return false, nil
}

func (m *MockRepository) NameExistsExcluding(ctx context.Context, name, excludeKey string) (bool, error) {
	if m.NameExistsExcludingFunc != nil {
		return m.NameExistsExcludingFunc(ctx, name, excludeKey)
	}
	return false, nil
}

func (m *MockRepository) Create(ctx context.Context, o *Organization) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, o)
	}
	return nil
}

func (m *MockRepository) Update(ctx context.Context, o *Organization) error {
	if m.UpdateFunc != nil {
		return m.UpdateFunc(ctx, o)
	}
	return nil
}

func (m *MockRepository) Delete(ctx context.Context, key string) error {
	if m.DeleteFunc != nil {
		return m.DeleteFunc(ctx, key)
	}
	return nil
}

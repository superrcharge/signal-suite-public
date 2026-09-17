package terminal

import "context"

// MockRepository implements Repository for unit tests. Each method
// delegates to its corresponding Func field when set; unset methods
// return zero values so tests only stub what they exercise.
type MockRepository struct {
	CreateFunc                func(ctx context.Context, t *Terminal) error
	FindByIDFunc              func(ctx context.Context, id string) (*Terminal, error)
	FindAllFunc               func(ctx context.Context, sections, models []string, search, tag string, page, limit int) ([]*Terminal, int, map[string]int, error)
	FindAllNamesFunc          func(ctx context.Context) ([]string, error)
	FindAllTagsFunc           func(ctx context.Context) ([]string, error)
	FindForExportFunc         func(ctx context.Context, f ExportFilter) ([]*Terminal, error)
	CountBySectionFunc        func(ctx context.Context, section string) (int, error)
	ReassignSectionFunc       func(ctx context.Context, from, to string) (int, error)
	UpdateFunc                func(ctx context.Context, t *Terminal) error
	DeleteFunc                func(ctx context.Context, id string) error
	BulkCreateFunc            func(ctx context.Context, terminals []*Terminal) error
	ListTagCatalogFunc        func(ctx context.Context) ([]*TagEntry, error)
	CreateTagEntryFunc        func(ctx context.Context, name string) (*TagEntry, error)
	DeleteTagEntryFunc        func(ctx context.Context, name string) error
	ClearTagFromTerminalsFunc func(ctx context.Context, name string) ([]ClearedTerminal, error)
	CanonicalizeTagsFunc      func(ctx context.Context, names []string) (map[string]string, error)
}

func (m *MockRepository) Create(ctx context.Context, t *Terminal) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, t)
	}
	return nil
}

func (m *MockRepository) FindByID(ctx context.Context, id string) (*Terminal, error) {
	if m.FindByIDFunc != nil {
		return m.FindByIDFunc(ctx, id)
	}
	return nil, ErrTerminalNotFound
}

func (m *MockRepository) FindAll(ctx context.Context, sections, models []string, search, tag string, page, limit int) ([]*Terminal, int, map[string]int, error) {
	if m.FindAllFunc != nil {
		return m.FindAllFunc(ctx, sections, models, search, tag, page, limit)
	}
	return nil, 0, map[string]int{}, nil
}

func (m *MockRepository) FindAllNames(ctx context.Context) ([]string, error) {
	if m.FindAllNamesFunc != nil {
		return m.FindAllNamesFunc(ctx)
	}
	return nil, nil
}

func (m *MockRepository) FindAllTags(ctx context.Context) ([]string, error) {
	if m.FindAllTagsFunc != nil {
		return m.FindAllTagsFunc(ctx)
	}
	return nil, nil
}

func (m *MockRepository) FindForExport(ctx context.Context, f ExportFilter) ([]*Terminal, error) {
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

func (m *MockRepository) Update(ctx context.Context, t *Terminal) error {
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

func (m *MockRepository) BulkCreate(ctx context.Context, terminals []*Terminal) error {
	if m.BulkCreateFunc != nil {
		return m.BulkCreateFunc(ctx, terminals)
	}
	return nil
}

func (m *MockRepository) ListTagCatalog(ctx context.Context) ([]*TagEntry, error) {
	if m.ListTagCatalogFunc != nil {
		return m.ListTagCatalogFunc(ctx)
	}
	return nil, nil
}

func (m *MockRepository) CreateTagEntry(ctx context.Context, name string) (*TagEntry, error) {
	if m.CreateTagEntryFunc != nil {
		return m.CreateTagEntryFunc(ctx, name)
	}
	return nil, nil
}

func (m *MockRepository) DeleteTagEntry(ctx context.Context, name string) error {
	if m.DeleteTagEntryFunc != nil {
		return m.DeleteTagEntryFunc(ctx, name)
	}
	return nil
}

func (m *MockRepository) ClearTagFromTerminals(ctx context.Context, name string) ([]ClearedTerminal, error) {
	if m.ClearTagFromTerminalsFunc != nil {
		return m.ClearTagFromTerminalsFunc(ctx, name)
	}
	return nil, nil
}

// CanonicalizeTags returns nil unstubbed, which the service reads as "the
// catalog had nothing to say" and falls back to the value the caller typed.
// That is what lets every test written before tags were canonicalized keep
// passing without stubbing this.
func (m *MockRepository) CanonicalizeTags(ctx context.Context, names []string) (map[string]string, error) {
	if m.CanonicalizeTagsFunc != nil {
		return m.CanonicalizeTagsFunc(ctx, names)
	}
	return nil, nil
}

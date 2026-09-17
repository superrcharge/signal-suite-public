package pace

import "context"

// MockRepository is a hand-rolled test double, outside _test.go so other
// packages can use it.
type MockRepository struct {
	SectionExistsFunc func(ctx context.Context, section string) (bool, error)
	FindCardFunc      func(ctx context.Context, section string) (*CommsCard, error)
	SaveCardFunc      func(ctx context.Context, card *CommsCard) error
	SetEmblemURLFunc  func(ctx context.Context, section, url string) error

	// SavedCard is the last card handed to SaveCard, recorded so a test can
	// assert on what the save actually carried -- the band rows included --
	// without every case having to supply its own SaveCardFunc.
	SavedCard                  *CommsCard
	CountAssignmentsForNetFunc func(ctx context.Context, netID string) (int, error)
	PlansUsingNetFunc          func(ctx context.Context, netID string) ([]string, error)
	SectionHasDataFunc         func(ctx context.Context, section string) (bool, error)
}

func (m *MockRepository) SectionExists(ctx context.Context, section string) (bool, error) {
	if m.SectionExistsFunc != nil {
		return m.SectionExistsFunc(ctx, section)
	}
	return true, nil
}

func (m *MockRepository) FindCard(ctx context.Context, section string) (*CommsCard, error) {
	if m.FindCardFunc != nil {
		return m.FindCardFunc(ctx, section)
	}
	return &CommsCard{Section: section, Plans: []*ChannelPlan{}}, nil
}

func (m *MockRepository) SaveCard(ctx context.Context, card *CommsCard) error {
	m.SavedCard = card
	if m.SaveCardFunc != nil {
		return m.SaveCardFunc(ctx, card)
	}
	return nil
}

func (m *MockRepository) SetEmblemURL(ctx context.Context, section, url string) error {
	if m.SetEmblemURLFunc != nil {
		return m.SetEmblemURLFunc(ctx, section, url)
	}
	return nil
}

func (m *MockRepository) CountAssignmentsForNet(ctx context.Context, netID string) (int, error) {
	if m.CountAssignmentsForNetFunc != nil {
		return m.CountAssignmentsForNetFunc(ctx, netID)
	}
	return 0, nil
}

func (m *MockRepository) PlansUsingNet(ctx context.Context, netID string) ([]string, error) {
	if m.PlansUsingNetFunc != nil {
		return m.PlansUsingNetFunc(ctx, netID)
	}
	return nil, nil
}

func (m *MockRepository) SectionHasData(ctx context.Context, section string) (bool, error) {
	if m.SectionHasDataFunc != nil {
		return m.SectionHasDataFunc(ctx, section)
	}
	return false, nil
}

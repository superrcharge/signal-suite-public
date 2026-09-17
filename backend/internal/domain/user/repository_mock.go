package user

import (
	"context"
)

type MockRepository struct {
	CreateFunc            func(ctx context.Context, user *User) error
	FindByIDFunc          func(ctx context.Context, id string) (*User, error)
	FindByEmailFunc       func(ctx context.Context, email string) (*User, error)
	FindByOIDCSubjectFunc func(ctx context.Context, oidcSubject string) (*User, error)
	FindAllFunc           func(ctx context.Context, limit, offset int) ([]*User, int, error)
	CountFunc             func(ctx context.Context) (int, error)
	CountByRoleFunc       func(ctx context.Context, role string) (int, error)
	CountAllByRoleFunc    func(ctx context.Context) (map[string]int, error)
	UpdateFunc            func(ctx context.Context, user *User) error
	UpsertFunc            func(ctx context.Context, user *User) error
	DeleteFunc            func(ctx context.Context, id string) error
}

func (m *MockRepository) Create(ctx context.Context, user *User) error {
	if m.CreateFunc != nil {
		return m.CreateFunc(ctx, user)
	}
	return nil
}

func (m *MockRepository) FindByID(ctx context.Context, id string) (*User, error) {
	if m.FindByIDFunc != nil {
		return m.FindByIDFunc(ctx, id)
	}
	return nil, ErrUserNotFound
}

func (m *MockRepository) FindByEmail(ctx context.Context, email string) (*User, error) {
	if m.FindByEmailFunc != nil {
		return m.FindByEmailFunc(ctx, email)
	}
	return nil, ErrUserNotFound
}

func (m *MockRepository) FindAll(ctx context.Context, limit, offset int) ([]*User, int, error) {
	if m.FindAllFunc != nil {
		return m.FindAllFunc(ctx, limit, offset)
	}
	return []*User{}, 0, nil
}

func (m *MockRepository) Update(ctx context.Context, user *User) error {
	if m.UpdateFunc != nil {
		return m.UpdateFunc(ctx, user)
	}
	return nil
}

func (m *MockRepository) Delete(ctx context.Context, id string) error {
	if m.DeleteFunc != nil {
		return m.DeleteFunc(ctx, id)
	}
	return nil
}

func (m *MockRepository) FindByOIDCSubject(ctx context.Context, oidcSubject string) (*User, error) {
	if m.FindByOIDCSubjectFunc != nil {
		return m.FindByOIDCSubjectFunc(ctx, oidcSubject)
	}
	return nil, ErrUserNotFound
}

func (m *MockRepository) Upsert(ctx context.Context, user *User) error {
	if m.UpsertFunc != nil {
		return m.UpsertFunc(ctx, user)
	}
	return nil
}

func (m *MockRepository) Count(ctx context.Context) (int, error) {
	if m.CountFunc != nil {
		return m.CountFunc(ctx)
	}
	return 0, nil
}

func (m *MockRepository) CountByRole(ctx context.Context, role string) (int, error) {
	if m.CountByRoleFunc != nil {
		return m.CountByRoleFunc(ctx, role)
	}
	return 0, nil
}

func (m *MockRepository) CountAllByRole(ctx context.Context) (map[string]int, error) {
	if m.CountAllByRoleFunc != nil {
		return m.CountAllByRoleFunc(ctx)
	}
	return map[string]int{}, nil
}

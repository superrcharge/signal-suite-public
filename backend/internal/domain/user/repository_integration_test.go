//go:build integration

package user

import (
	"context"
	"os"
	"testing"
	"time"

	"backend/config"
	"backend/internal/infrastructure/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

var testDB *pgxpool.Pool

func TestMain(m *testing.M) {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := database.NewPostgresPool(ctx, cfg.Database)
	if err != nil {
		panic("failed to connect to test database: " + err.Error())
	}
	testDB = pool

	code := m.Run()

	pool.Close()
	os.Exit(code)
}

func cleanupUsers(t *testing.T) {
	t.Helper()
	_, err := testDB.Exec(context.Background(), "DELETE FROM users")
	if err != nil {
		t.Fatalf("failed to cleanup users: %v", err)
	}
}

func TestRepository_Create(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	user := &User{
		ID:          uuid.New().String(),
		Email:       "create@example.com",
		Name:        "Create Test",
		Preferences: Preferences{Theme: ThemeLight},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	err := repo.Create(context.Background(), user)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	found, err := repo.FindByID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}

	if found.Email != user.Email {
		t.Errorf("expected email %s, got %s", user.Email, found.Email)
	}
	if found.Name != user.Name {
		t.Errorf("expected name %s, got %s", user.Name, found.Name)
	}
	if found.Preferences.Theme != user.Preferences.Theme {
		t.Errorf("expected theme %s, got %s", user.Preferences.Theme, found.Preferences.Theme)
	}
}

func TestRepository_Create_DuplicateEmail(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	user1 := &User{
		ID:          uuid.New().String(),
		Email:       "duplicate@example.com",
		Name:        "User 1",
		Preferences: Preferences{Theme: ThemeLight},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	err := repo.Create(context.Background(), user1)
	if err != nil {
		t.Fatalf("Create user1 failed: %v", err)
	}

	user2 := &User{
		ID:          uuid.New().String(),
		Email:       "duplicate@example.com",
		Name:        "User 2",
		Preferences: Preferences{Theme: ThemeLight},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	err = repo.Create(context.Background(), user2)
	if err == nil {
		t.Error("expected error for duplicate email, got nil")
	}
}

func TestRepository_FindByID(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	user := &User{
		ID:          uuid.New().String(),
		Email:       "findbyid@example.com",
		Name:        "Find By ID Test",
		Preferences: Preferences{Theme: ThemeDark},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	err := repo.Create(context.Background(), user)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	found, err := repo.FindByID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}

	if found.ID != user.ID {
		t.Errorf("expected ID %s, got %s", user.ID, found.ID)
	}
}

func TestRepository_FindByID_NotFound(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	_, err := repo.FindByID(context.Background(), uuid.New().String())
	if err == nil {
		t.Error("expected ErrUserNotFound, got nil")
	}
	if err != ErrUserNotFound {
		t.Errorf("expected ErrUserNotFound, got %v", err)
	}
}

func TestRepository_FindByEmail(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	user := &User{
		ID:          uuid.New().String(),
		Email:       "findbyemail@example.com",
		Name:        "Find By Email Test",
		Preferences: Preferences{Theme: ThemeLight},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	err := repo.Create(context.Background(), user)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	found, err := repo.FindByEmail(context.Background(), user.Email)
	if err != nil {
		t.Fatalf("FindByEmail failed: %v", err)
	}

	if found.Email != user.Email {
		t.Errorf("expected email %s, got %s", user.Email, found.Email)
	}
}

func TestRepository_FindByEmail_NotFound(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	_, err := repo.FindByEmail(context.Background(), "nonexistent@example.com")
	if err == nil {
		t.Error("expected ErrUserNotFound, got nil")
	}
	if err != ErrUserNotFound {
		t.Errorf("expected ErrUserNotFound, got %v", err)
	}
}

func TestRepository_FindAll(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	users := []*User{
		{ID: uuid.New().String(), Email: "user1@example.com", Name: "User 1", Preferences: Preferences{Theme: ThemeLight}, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		{ID: uuid.New().String(), Email: "user2@example.com", Name: "User 2", Preferences: Preferences{Theme: ThemeDark}, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		{ID: uuid.New().String(), Email: "user3@example.com", Name: "User 3", Preferences: Preferences{Theme: ThemeLight}, CreatedAt: time.Now(), UpdatedAt: time.Now()},
	}

	for _, u := range users {
		if err := repo.Create(context.Background(), u); err != nil {
			t.Fatalf("Create failed: %v", err)
		}
	}

	found, total, err := repo.FindAll(context.Background(), 10, 0)
	if err != nil {
		t.Fatalf("FindAll failed: %v", err)
	}

	if total != 3 {
		t.Errorf("expected total 3, got %d", total)
	}
	if len(found) != 3 {
		t.Errorf("expected 3 users, got %d", len(found))
	}
}

func TestRepository_FindAll_OrdersByLastLogin(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	recent := time.Now()
	older := recent.Add(-48 * time.Hour)

	// Created oldest-first on purpose so created_at DESC alone would produce
	// the reverse of the expected order - proving last_login_at drives the sort.
	recentLogin := &User{ID: uuid.New().String(), Email: "recent@example.com", Name: "Recent", Preferences: Preferences{Theme: ThemeLight}, LastLoginAt: &recent, CreatedAt: time.Now(), UpdatedAt: time.Now()}
	olderLogin := &User{ID: uuid.New().String(), Email: "older@example.com", Name: "Older", Preferences: Preferences{Theme: ThemeLight}, LastLoginAt: &older, CreatedAt: time.Now(), UpdatedAt: time.Now()}
	neverLogin := &User{ID: uuid.New().String(), Email: "never@example.com", Name: "Never", Preferences: Preferences{Theme: ThemeLight}, LastLoginAt: nil, CreatedAt: time.Now(), UpdatedAt: time.Now()}

	for _, u := range []*User{neverLogin, olderLogin, recentLogin} {
		if err := repo.Create(context.Background(), u); err != nil {
			t.Fatalf("Create failed: %v", err)
		}
	}

	found, _, err := repo.FindAll(context.Background(), 10, 0)
	if err != nil {
		t.Fatalf("FindAll failed: %v", err)
	}
	if len(found) != 3 {
		t.Fatalf("expected 3 users, got %d", len(found))
	}

	// Expect: most recent login first, then older login, then never-logged-in.
	wantOrder := []string{"recent@example.com", "older@example.com", "never@example.com"}
	for i, want := range wantOrder {
		if found[i].Email != want {
			t.Errorf("position %d: expected %s, got %s", i, want, found[i].Email)
		}
	}
}

func TestRepository_FindAll_Pagination(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	for i := 0; i < 5; i++ {
		user := &User{
			ID:          uuid.New().String(),
			Email:       uuid.New().String() + "@example.com",
			Name:        "User",
			Preferences: Preferences{Theme: ThemeLight},
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		if err := repo.Create(context.Background(), user); err != nil {
			t.Fatalf("Create failed: %v", err)
		}
	}

	found, total, err := repo.FindAll(context.Background(), 2, 0)
	if err != nil {
		t.Fatalf("FindAll failed: %v", err)
	}

	if total != 5 {
		t.Errorf("expected total 5, got %d", total)
	}
	if len(found) != 2 {
		t.Errorf("expected 2 users (limit), got %d", len(found))
	}

	found2, _, err := repo.FindAll(context.Background(), 2, 2)
	if err != nil {
		t.Fatalf("FindAll with offset failed: %v", err)
	}
	if len(found2) != 2 {
		t.Errorf("expected 2 users (offset), got %d", len(found2))
	}
}

func TestRepository_Update(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	user := &User{
		ID:          uuid.New().String(),
		Email:       "update@example.com",
		Name:        "Original Name",
		Preferences: Preferences{Theme: ThemeLight},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	err := repo.Create(context.Background(), user)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	user.Name = "Updated Name"
	user.Preferences.Theme = ThemeDark
	user.UpdatedAt = time.Now()

	err = repo.Update(context.Background(), user)
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}

	found, err := repo.FindByID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}

	if found.Name != "Updated Name" {
		t.Errorf("expected name 'Updated Name', got %s", found.Name)
	}
	if found.Preferences.Theme != ThemeDark {
		t.Errorf("expected theme dark, got %s", found.Preferences.Theme)
	}
}

func TestRepository_Update_NotFound(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	user := &User{
		ID:          uuid.New().String(),
		Email:       "notfound@example.com",
		Name:        "Not Found",
		Preferences: Preferences{Theme: ThemeLight},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	err := repo.Update(context.Background(), user)
	if err == nil {
		t.Error("expected ErrUserNotFound, got nil")
	}
	if err != ErrUserNotFound {
		t.Errorf("expected ErrUserNotFound, got %v", err)
	}
}

func TestRepository_Delete(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	user := &User{
		ID:          uuid.New().String(),
		Email:       "delete@example.com",
		Name:        "Delete Test",
		Preferences: Preferences{Theme: ThemeLight},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	err := repo.Create(context.Background(), user)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	err = repo.Delete(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	_, err = repo.FindByID(context.Background(), user.ID)
	if err != ErrUserNotFound {
		t.Errorf("expected ErrUserNotFound after delete, got %v", err)
	}
}

func TestRepository_Delete_NotFound(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	err := repo.Delete(context.Background(), uuid.New().String())
	if err == nil {
		t.Error("expected ErrUserNotFound, got nil")
	}
	if err != ErrUserNotFound {
		t.Errorf("expected ErrUserNotFound, got %v", err)
	}
}

func TestRepository_CountAllByRole(t *testing.T) {
	repo := NewRepository(testDB)
	cleanupUsers(t)

	now := time.Now()
	seed := []struct {
		email string
		roles []string
	}{
		{"admin@example.com", []string{RoleAdmin}},
		{"editor1@example.com", []string{RoleEditor}},
		{"editor2@example.com", []string{RoleEditor}},
		{"rto@example.com", []string{RoleRTO}},
		// Multi-role and no-role users exercise the jsonb unnest: the first is
		// counted under both of its roles, the second under none.
		{"both@example.com", []string{RoleEditor, RoleRTO}},
		{"noroles@example.com", []string{}},
	}

	for _, s := range seed {
		u := &User{
			ID:          uuid.New().String(),
			Email:       s.email,
			Name:        s.email,
			Roles:       s.roles,
			Preferences: Preferences{Theme: ThemeLight},
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if err := repo.Create(context.Background(), u); err != nil {
			t.Fatalf("Create failed for %s: %v", s.email, err)
		}
	}

	counts, err := repo.CountAllByRole(context.Background())
	if err != nil {
		t.Fatalf("CountAllByRole failed: %v", err)
	}

	want := map[string]int{RoleAdmin: 1, RoleEditor: 3, RoleRTO: 2}
	for role, wantN := range want {
		if counts[role] != wantN {
			t.Errorf("role %q: got %d, want %d (full map: %v)", role, counts[role], wantN, counts)
		}
	}

	// Nobody holds viewer, so the repository omits it entirely - the service is
	// what overlays ValidRoles to turn that into an explicit zero.
	if _, present := counts[RoleViewer]; present {
		t.Errorf("expected viewer to be absent from the repository map, got %v", counts)
	}
}

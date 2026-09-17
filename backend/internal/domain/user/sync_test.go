package user

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/auth"

	"github.com/gofiber/fiber/v3"
)

// runSync drives SyncFromToken through a real route, which is the only way to
// hand it the fiber.Ctx its signature takes. Returns whatever the service
// handed to the repository, so the assertions can look at the persisted roles
// rather than the return value alone.
func runSync(t *testing.T, repo *MockRepository, identity *auth.User) *User {
	t.Helper()

	var saved *User
	inner := repo.UpsertFunc
	repo.UpsertFunc = func(ctx context.Context, u *User) error {
		saved = u
		if inner != nil {
			return inner(ctx, u)
		}
		return nil
	}

	var syncErr error
	app := fiber.New()
	app.Get("/sync", func(c fiber.Ctx) error {
		_, syncErr = NewService(repo).SyncFromToken(c, identity)
		return c.SendStatus(http.StatusOK)
	})

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/sync", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if syncErr != nil {
		t.Fatalf("SyncFromToken: %v", syncErr)
	}
	if saved == nil {
		t.Fatal("SyncFromToken persisted nothing")
	}
	return saved
}

// Self-registration is open: anyone who can authenticate against the tenant
// gets a row here on first login. What that row is allowed to do is decided
// entirely by this bootstrap, which makes it the single most security-relevant
// default in the app - hence a test pinning both branches. Viewer is
// deliberate: a brand-new account must not be able to write until an admin
// says so.
func TestSyncFromToken_NewUserBootstrap(t *testing.T) {
	tests := []struct {
		name      string
		userCount int
		want      string
	}{
		{name: "very first user becomes admin", userCount: 0, want: RoleAdmin},
		{name: "second user defaults to viewer", userCount: 1, want: RoleViewer},
		{name: "later users default to viewer", userCount: 47, want: RoleViewer},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &MockRepository{
				FindByOIDCSubjectFunc: func(context.Context, string) (*User, error) {
					return nil, ErrUserNotFound
				},
				CountFunc: func(context.Context) (int, error) { return tt.userCount, nil },
			}

			saved := runSync(t, repo, &auth.User{
				ID:    "oid-new",
				Email: "new@test.com",
				Name:  "New User",
			})

			if len(saved.Roles) != 1 || saved.Roles[0] != tt.want {
				t.Errorf("roles = %v, want [%s]", saved.Roles, tt.want)
			}
		})
	}
}

// The IdP owns identity; the app owns authorization. A returning user must keep
// whatever role an admin gave them - if a later login ever re-ran the bootstrap,
// every admin in the table would be silently demoted to viewer.
func TestSyncFromToken_ExistingUserKeepsRole(t *testing.T) {
	existing := &User{
		ID:    "u1",
		Email: "stale@test.com",
		Name:  "Stale Name",
		Roles: []string{RoleAdmin},
	}

	repo := &MockRepository{
		FindByOIDCSubjectFunc: func(context.Context, string) (*User, error) {
			return existing, nil
		},
		CountFunc: func(context.Context) (int, error) {
			t.Error("Count called for an existing user - the bootstrap must not re-run on login")
			return 0, nil
		},
	}

	saved := runSync(t, repo, &auth.User{
		ID:    "oid-existing",
		Email: "fresh@test.com",
		Name:  "Fresh Name",
	})

	if len(saved.Roles) != 1 || saved.Roles[0] != RoleAdmin {
		t.Errorf("roles = %v, want [%s] - an existing user's role must survive login", saved.Roles, RoleAdmin)
	}
	// Identity fields, unlike roles, do come from the token.
	if saved.Email != "fresh@test.com" || saved.Name != "Fresh Name" {
		t.Errorf("identity not refreshed from token: email=%q name=%q", saved.Email, saved.Name)
	}
}

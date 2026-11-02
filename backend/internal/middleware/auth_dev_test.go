package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/auth"
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

// With auth disabled every request carries the synthetic dev identity, so a
// handler reading the actor gets the same user GET /users/me reports rather
// than nil. Before this, a dev write stored a blank actor, and a rule keyed on
// the actor's id (resolving an RFI) could never be satisfied on the dev stack.
func TestDisabledAuthAttachesTheDevUser(t *testing.T) {
	m := middleware.NewAuthMiddleware(&auth.Config{Mode: auth.ModeNone}, nil)

	for name, gate := range map[string]fiber.Handler{
		"RequireAuth":  m.RequireAuth(),
		"OptionalAuth": m.OptionalAuth(),
	} {
		t.Run(name, func(t *testing.T) {
			app := fiber.New()
			var got middleware.AuthUser
			app.Get("/", gate, func(c fiber.Ctx) error {
				got = middleware.GetCurrentUser(c)
				return c.SendStatus(http.StatusNoContent)
			})

			resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/", nil))
			if err != nil {
				t.Fatal(err)
			}
			if resp.StatusCode != http.StatusNoContent {
				t.Fatalf("status = %d, want 204", resp.StatusCode)
			}
			if got == nil {
				t.Fatal("no user attached with auth disabled")
			}
			if got.GetID() != middleware.DevUserID || got.GetName() != middleware.DevUserName {
				t.Fatalf("attached %q %q, want the dev user", got.GetID(), got.GetName())
			}
			if !got.HasRole("admin") || got.HasRole("viewer") {
				t.Fatal("the dev user is an admin and nothing else")
			}
		})
	}

	// A user attached earlier in the chain wins. The domain handler tests seed
	// Locals with a real user before the gate and assert own-data rules on it.
	t.Run("does not overwrite an attached user", func(t *testing.T) {
		app := fiber.New()
		seeded := &stubUser{id: "seeded", roles: []string{"viewer"}}
		var got middleware.AuthUser
		app.Get("/", func(c fiber.Ctx) error {
			c.Locals(middleware.UserLocalsKey, seeded)
			return c.Next()
		}, m.RequireAuth(), func(c fiber.Ctx) error {
			got = middleware.GetCurrentUser(c)
			return c.SendStatus(http.StatusNoContent)
		})
		if _, err := app.Test(httptest.NewRequest(http.MethodGet, "/", nil)); err != nil {
			t.Fatal(err)
		}
		if got == nil || got.GetID() != "seeded" {
			t.Fatalf("got %v, want the seeded user left alone", got)
		}
	})

	t.Run("Authenticate", func(t *testing.T) {
		app := fiber.New()
		var got middleware.AuthUser
		app.Get("/", func(c fiber.Ctx) error {
			if err := m.Authenticate(c); err != nil {
				return err
			}
			got = middleware.GetCurrentUser(c)
			return c.SendStatus(http.StatusNoContent)
		})
		if _, err := app.Test(httptest.NewRequest(http.MethodGet, "/", nil)); err != nil {
			t.Fatal(err)
		}
		if got == nil || got.GetID() != middleware.DevUserID {
			t.Fatal("Authenticate did not attach the dev user with auth disabled")
		}
	})
}

// The dev identity is only for the disabled mode: with auth on, nothing is
// attached to a request that carries no token, and RequireAuth refuses it.
func TestEnabledAuthAttachesNoDevUser(t *testing.T) {
	m := enabledMiddleware()
	app := fiber.New()
	reached := false
	app.Get("/", m.RequireAuth(), func(c fiber.Ctx) error {
		reached = true
		return c.SendStatus(http.StatusNoContent)
	})
	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/", nil))
	if err != nil {
		t.Fatal(err)
	}
	if reached || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("reached=%v status=%d, want refused with 401", reached, resp.StatusCode)
	}
}

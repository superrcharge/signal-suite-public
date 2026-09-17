package middleware

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"

	"backend/internal/auth"
	"backend/internal/shared/response"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gofiber/fiber/v3"
)

// UserLocalsKey is the Fiber Locals key under which the RBAC-enriched
// local user (an AuthUser) is stored after a successful sync.
const UserLocalsKey = "currentUser"

// AuthUser is the access-control contract the rest of the app consumes.
// Roles are sourced from the local users table - never from JWT claims.
type AuthUser interface {
	GetID() string
	GetName() string
	HasRole(role string) bool
}

// UserSyncer creates or updates a local user record from a verified
// JWT identity, returning the access-control-enriched representation.
type UserSyncer interface {
	SyncFromToken(c fiber.Ctx, identity *auth.User) (AuthUser, error)
}

// AuthMiddleware verifies Entra-issued JWTs, syncs the identity into
// the local user table, and exposes the result via Fiber Locals.
type AuthMiddleware struct {
	cfg    *auth.Config
	syncer UserSyncer

	// OIDC discovery is deferred to the first authenticated request via
	// sync.Once so process startup doesn't depend on Entra reachability.
	once     sync.Once
	verifier *oidc.IDTokenVerifier
	initErr  error
}

// NewAuthMiddleware constructs the middleware. cfg.Mode controls whether
// verification runs; ModeNone makes RequireAuth a pass-through.
func NewAuthMiddleware(cfg *auth.Config, syncer UserSyncer) *AuthMiddleware {
	return &AuthMiddleware{cfg: cfg, syncer: syncer}
}

// RequireAuth returns a handler that enforces a valid bearer token and
// attaches the authenticated user to Fiber Locals. Unauthenticated
// requests get a 401.
func (m *AuthMiddleware) RequireAuth() fiber.Handler {
	return func(c fiber.Ctx) error {
		if !m.cfg.Enabled() {
			return c.Next()
		}

		if _, err := m.authenticate(c); err != nil {
			return respondAuthError(c, err)
		}

		return c.Next()
	}
}

// OptionalAuth attaches the user if a valid token is present, but allows
// the request through when no token is supplied. Used for endpoints that
// vary behavior based on identity but don't require it.
func (m *AuthMiddleware) OptionalAuth() fiber.Handler {
	return func(c fiber.Ctx) error {
		if !m.cfg.Enabled() {
			return c.Next()
		}

		if _, ok := extractBearer(c); !ok {
			return c.Next()
		}

		// Best-effort: log but don't fail when verification or sync fail.
		_, _ = m.authenticate(c)
		return c.Next()
	}
}

// Authenticate runs verification and sync without invoking c.Next().
// Returns the resulting error directly so non-handler call sites
// (e.g. WebSocket upgrades) can short-circuit on failure.
func (m *AuthMiddleware) Authenticate(c fiber.Ctx) error {
	if !m.cfg.Enabled() {
		return nil
	}

	_, err := m.authenticate(c)
	return err
}

// RequireRole gates the handler chain on the authenticated user holding
// at least one of the given roles. RequireAuth must run first to
// populate Fiber Locals; this handler reads from there.
func (m *AuthMiddleware) RequireRole(allowedRoles ...string) fiber.Handler {
	return func(c fiber.Ctx) error {
		if !m.cfg.Enabled() {
			return c.Next()
		}

		current := GetCurrentUser(c)
		if current == nil {
			return respondAuthError(c, &authError{
				code: "AUTH_REQUIRED", message: "authentication required", status: http.StatusUnauthorized,
			})
		}

		for _, role := range allowedRoles {
			if current.HasRole(role) {
				return c.Next()
			}
		}

		return respondAuthError(c, &authError{
			code: "AUTH_FORBIDDEN", message: "insufficient permissions", status: http.StatusForbidden,
		})
	}
}

// GetCurrentUser returns the authenticated, RBAC-enriched user, or nil
// if no user is attached (auth disabled, or the request was unauthenticated).
func GetCurrentUser(c fiber.Ctx) AuthUser {
	if u, ok := c.Locals(UserLocalsKey).(AuthUser); ok {
		return u
	}
	return nil
}

// authenticate runs the full verify → claim-extract → sync pipeline and
// stores the result in both auth.SetUser (identity) and Fiber Locals
// (RBAC user). Returned error is already an *authError ready for
// respondAuthError.
func (m *AuthMiddleware) authenticate(c fiber.Ctx) (AuthUser, error) {
	tokenString, ok := extractBearer(c)
	if !ok {
		return nil, &authError{
			code: "AUTH_MISSING_TOKEN", message: "authentication required", status: http.StatusUnauthorized,
		}
	}

	m.once.Do(m.initVerifier)
	if m.initErr != nil {
		log.Printf("auth: oidc provider init failed: %v", m.initErr)
		return nil, &authError{
			code: "AUTH_PROVIDER_UNAVAILABLE", message: "auth provider unavailable", status: http.StatusServiceUnavailable,
		}
	}

	idToken, err := m.verifier.Verify(c.Context(), tokenString)
	if err != nil {
		return nil, &authError{
			code: "AUTH_INVALID_TOKEN", message: "invalid token: " + err.Error(), status: http.StatusUnauthorized,
		}
	}

	var claims struct {
		OID               string `json:"oid"`
		Name              string `json:"name"`
		PreferredUsername string `json:"preferred_username"`
		Email             string `json:"email"`
		UPN               string `json:"upn"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return nil, &authError{
			code: "AUTH_CLAIMS_PARSE", message: "claims parse: " + err.Error(), status: http.StatusUnauthorized,
		}
	}

	identity := &auth.User{
		ID:    claims.OID,
		Name:  firstNonEmpty(claims.Name, claims.PreferredUsername),
		Email: firstNonEmpty(claims.Email, claims.UPN),
	}

	user, err := m.syncer.SyncFromToken(c, identity)
	if err != nil {
		log.Printf("auth: sync failed for oid=%q email=%q: %v", identity.ID, identity.Email, err)
		return nil, &authError{
			code: "AUTH_SYNC_FAILED", message: "failed to sync user", status: http.StatusInternalServerError,
		}
	}

	auth.SetUser(c, identity)
	c.Locals(UserLocalsKey, user)

	return user, nil
}

// verifierConfig is the set of claims a token has to satisfy, separated from
// initVerifier so it can be tested without a network round trip. initVerifier
// reaches Entra; this function decides what "valid" means.
func verifierConfig(cfg *auth.Config) *oidc.Config {
	return &oidc.Config{
		ClientID: cfg.Audience(),

		// SkipIssuerCheck is deliberately absent, where it used to be true.
		//
		// It arrived with the go-oidc port, copied from a sibling
		// project along with the rest of this package, and was never argued for:
		// no comment, no CHANGELOG note, and nothing in the deploy docs describing an
		// issuer that would need skipping. This repository comments every
		// deliberate deviation at length - see the X-XSS-Protection block in
		// middleware.go and the knownAuthorities pinning - so the silence was
		// the tell. The deploy troubleshooting page meanwhile documented issuer
		// mismatch as a failure mode, describing behaviour that could not occur.
		//
		// Skipping it left the verifier resting on the JWKS binding alone: a
		// token signed by a key the configured authority publishes was accepted
		// whatever `iss` it carried. That is narrow rather than open, but it is
		// not a property worth inheriting by accident.
		//
		// Nothing needs skipping here. Authority() composes
		// https://<host>/<tenant>/v2.0, which is exactly the `iss` an Entra v2
		// single-tenant token carries, so discovery URL and issuer agree by
		// construction. If a sovereign-cloud endpoint ever does return a
		// different issuer than it is discovered at, the fix is to compare
		// against the expected value explicitly - not to stop comparing.

		// Pinned rather than left to the library default. go-oidc defaults to
		// RS256 today, which is what Entra signs with, but a default is not a
		// property this repository asserts anywhere, and "whatever the library
		// happens to allow" is the wrong answer to which algorithms are
		// accepted. Entra v2 access tokens are RS256; widen this only when an
		// authority actually needs it.
		SupportedSigningAlgs: []string{oidc.RS256},
	}
}

func (m *AuthMiddleware) initVerifier() {
	provider, err := oidc.NewProvider(context.Background(), m.cfg.Authority())
	if err != nil {
		m.initErr = fmt.Errorf("oidc provider discovery for %s: %w", m.cfg.Authority(), err)
		return
	}
	m.verifier = provider.Verifier(verifierConfig(m.cfg))
}

func extractBearer(c fiber.Ctx) (string, bool) {
	header := c.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return "", false
	}
	return strings.TrimPrefix(header, "Bearer "), true
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

func respondAuthError(c fiber.Ctx, err error) error {
	ae, ok := err.(*authError)
	if !ok {
		ae = &authError{code: "AUTH_ERROR", message: err.Error(), status: http.StatusUnauthorized}
	}
	return c.Status(ae.status).JSON(response.Err(ae))
}

// authError implements response.CodedError so JSON responses use the
// shared envelope.
type authError struct {
	code    string
	message string
	status  int
}

func (e *authError) Error() string   { return e.message }
func (e *authError) GetCode() string { return e.code }
func (e *authError) GetStatus() int  { return e.status }

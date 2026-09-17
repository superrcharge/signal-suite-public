// Package auth provides authentication types, configuration, and request
// helpers for Azure Entra ID integration. The middleware that enforces
// authentication lives in backend/internal/middleware and consumes these
// types - keeping protocol concerns (verification, claim shapes) here and
// HTTP plumbing there.
package auth

import "fmt"

// Mode identifies the authentication strategy.
type Mode string

const (
	// ModeNone disables authentication. Middleware bypasses verification.
	ModeNone Mode = "none"
	// ModeAzure enables Entra ID JWT validation.
	ModeAzure Mode = "azure"
)

// Config holds the parameters needed to verify Entra-issued JWTs.
type Config struct {
	Mode          Mode
	TenantID      string
	ClientID      string
	AuthorityHost string
}

// Authority returns the OIDC issuer URL the verifier discovers against.
// Example: https://login.microsoftonline.com/<tenant>/v2.0
func (c *Config) Authority() string {
	return fmt.Sprintf("https://%s/%s/v2.0", c.AuthorityHost, c.TenantID)
}

// Audience returns the JWT audience the verifier matches against the
// access token's aud claim. Entra v2 tokens (which we use - the app reg
// manifest sets accessTokenAcceptedVersion: 2) carry the bare client ID
// as the audience. v1 tokens would carry "api://<client-id>"; if you
// ever flip the manifest back to v1, this needs the prefix.
func (c *Config) Audience() string {
	return c.ClientID
}

// Enabled returns true when authentication is active. Defined as
// "anything but ModeNone" so future modes (ModeMock, ModeTest, etc.)
// don't require updating callers.
func (c *Config) Enabled() bool {
	return c.Mode != ModeNone
}

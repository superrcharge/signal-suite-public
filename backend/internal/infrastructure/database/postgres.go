package database

import (
	"context"
	"fmt"
	"net"
	"net/url"

	"backend/config"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// authModeManagedIdentity selects the BeforeConnect-callback path that
// exchanges the runtime managed identity for an Entra token at connect time. Any
// other value (including the empty default) falls back to password auth.
const authModeManagedIdentity = "managed_identity"

// sslModeDisable is the one value that turns TLS off outright. Postgres
// also accepts "allow" and "prefer", which negotiate but tolerate a
// cleartext fallback; they are refused alongside it, because "encrypted
// unless the server would rather not" is not a property worth asserting.
var insecureSSLModes = map[string]bool{"": true, "disable": true, "allow": true, "prefer": true}

// validateConfig refuses a database configuration that would connect
// with less protection than it appears to.
//
// This is a startup gate rather than a default, and it exists because a
// default is the wrong place to encode "this must never happen in
// production". A deployed environment sets DB_SSLMODE=require, so
// this never trips there - it trips when that setting goes missing,
// which is the case that used to start silently and serve unencrypted
// with both health probes green.
//
// It fails the process rather than degrading, on purpose. The container
// exits and the platform restart-loops, /health never answers, and a
// post-deploy smoke test goes red with the previous container still serving. That is loud, recoverable, and reaches CI instead of
// users.
func validateConfig(cfg config.DatabaseConfig) error {
	if insecureSSLModes[cfg.SSLMode] && !cfg.AllowInsecure {
		return fmt.Errorf(
			"DB_SSLMODE=%q connects without guaranteed TLS; set DB_SSLMODE=require "+
				"(or verify-full), or set ALLOW_INSECURE_DB=true if this really is a "+
				"local development database",
			cfg.SSLMode,
		)
	}

	if cfg.AuthMode != authModeManagedIdentity && cfg.Password == "" {
		return fmt.Errorf(
			"DB_PASSWORD is empty with DB_AUTH_MODE=%q; set a password, or set "+
				"DB_AUTH_MODE=%s to authenticate with the runtime managed identity",
			cfg.AuthMode, authModeManagedIdentity,
		)
	}

	return nil
}

// NewPostgresPool builds a pgxpool.Pool whose connections authenticate
// according to cfg.AuthMode. In managed_identity mode every new
// connection acquires a fresh Entra token via DefaultAzureCredential
// (the SDK caches and refreshes underneath, so no manual expiry
// tracking).
func NewPostgresPool(ctx context.Context, cfg config.DatabaseConfig) (*pgxpool.Pool, error) {
	if err := validateConfig(cfg); err != nil {
		return nil, err
	}

	poolConfig, err := buildPoolConfig(cfg)
	if err != nil {
		return nil, err
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return pool, nil
}

// MigrationDSN returns a connection string suitable for goose's
// database/sql path. Goose runs once at startup and finishes well
// inside any token TTL, so the managed_identity branch fetches a
// single token and embeds it as the password.
func MigrationDSN(ctx context.Context, cfg config.DatabaseConfig) (string, error) {
	// Migrations run first, at main.go's startup, and build their own DSN.
	// Gating only the pool would let the whole schema be applied over an
	// unencrypted connection before anything checked.
	if err := validateConfig(cfg); err != nil {
		return "", err
	}

	if cfg.AuthMode != authModeManagedIdentity {
		return tokenDSN(cfg, cfg.Password), nil
	}

	token, err := acquireDBToken(ctx, cfg.TokenScope)
	if err != nil {
		return "", err
	}
	return tokenDSN(cfg, token), nil
}

func buildPoolConfig(cfg config.DatabaseConfig) (*pgxpool.Config, error) {
	if cfg.AuthMode == authModeManagedIdentity {
		return buildManagedIdentityConfig(cfg)
	}
	return pgxpool.ParseConfig(tokenDSN(cfg, cfg.Password))
}

func buildManagedIdentityConfig(cfg config.DatabaseConfig) (*pgxpool.Config, error) {
	if cfg.TokenScope == "" {
		return nil, fmt.Errorf("DB_TOKEN_SCOPE must be set when DB_AUTH_MODE=%s", authModeManagedIdentity)
	}

	// Passwordless DSN - BeforeConnect injects the token per connection.
	poolConfig, err := pgxpool.ParseConfig(standardDSN(cfg))
	if err != nil {
		return nil, fmt.Errorf("failed to parse database config: %w", err)
	}

	// DefaultAzureCredential walks the credential chain. Inside the App
	// Service container, AZURE_CLIENT_ID (set by the deployment) steers it at
	// the runtime managed identity rather than picking another source first.
	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create azure credential: %w", err)
	}

	scope := cfg.TokenScope
	poolConfig.BeforeConnect = func(ctx context.Context, c *pgx.ConnConfig) error {
		tok, err := cred.GetToken(ctx, policy.TokenRequestOptions{
			Scopes: []string{scope},
		})
		if err != nil {
			return fmt.Errorf("acquire entra token for postgres: %w", err)
		}
		c.Password = tok.Token
		return nil
	}

	return poolConfig, nil
}

func acquireDBToken(ctx context.Context, scope string) (string, error) {
	if scope == "" {
		return "", fmt.Errorf("DB_TOKEN_SCOPE must be set when DB_AUTH_MODE=%s", authModeManagedIdentity)
	}
	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		return "", fmt.Errorf("create azure credential: %w", err)
	}
	tok, err := cred.GetToken(ctx, policy.TokenRequestOptions{
		Scopes: []string{scope},
	})
	if err != nil {
		return "", fmt.Errorf("acquire entra token for postgres: %w", err)
	}
	return tok.Token, nil
}

// buildDSN assembles the connection URL through net/url rather than
// fmt.Sprintf.
//
// Both builders used to interpolate the credential directly, so a
// password containing @ : / or ? silently produced a malformed DSN -
// an @ splits userinfo from host, and the failure reads as a wrong
// hostname rather than a quoting problem. Entra tokens are base64url
// and safe, but DB_PASSWORD is whatever an operator typed, and the
// generated Postgres admin password is not constrained to be safe here.
// url.URL percent-encodes userinfo on its own.
func buildDSN(cfg config.DatabaseConfig, user *url.Userinfo) string {
	u := url.URL{
		Scheme:   "postgres",
		User:     user,
		Host:     net.JoinHostPort(cfg.Host, cfg.Port),
		Path:     "/" + cfg.DBName,
		RawQuery: url.Values{"sslmode": {cfg.SSLMode}}.Encode(),
	}
	return u.String()
}

// tokenDSN builds a DSN with a credential embedded as the password.
// The credential is the static `DB_PASSWORD` in password mode, or a
// freshly-acquired Entra token in the managed_identity migration path.
func tokenDSN(cfg config.DatabaseConfig, credential string) string {
	return buildDSN(cfg, url.UserPassword(cfg.User, credential))
}

// standardDSN builds the passwordless DSN used by the managed_identity
// pool. pgxpool.BeforeConnect fills in the password (an Entra token)
// per connection.
func standardDSN(cfg config.DatabaseConfig) string {
	return buildDSN(cfg, url.User(cfg.User))
}

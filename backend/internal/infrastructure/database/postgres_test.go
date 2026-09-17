package database

import (
	"context"
	"strings"
	"testing"

	"backend/config"
)

// Internal package on purpose: validateConfig and the DSN builders are
// unexported, and the point of these tests is the decision itself rather than
// the connection it guards. Nothing here touches a database.

func base() config.DatabaseConfig {
	return config.DatabaseConfig{
		Host:     "localhost",
		Port:     "5432",
		User:     "postgres",
		Password: "secret",
		DBName:   "app",
		SSLMode:  "require",
		AuthMode: "password",
	}
}

func TestValidateConfigSSLFloor(t *testing.T) {
	for _, tc := range []struct {
		name          string
		sslMode       string
		allowInsecure bool
		wantErr       bool
	}{
		{"require is always fine", "require", false, false},
		{"verify-full is always fine", "verify-full", false, false},
		{"verify-ca is always fine", "verify-ca", false, false},

		// The whole point of that fix: these four leave the connection
		// unprotected, or protected only if the server feels like it.
		{"disable is refused", "disable", false, true},
		{"empty is refused", "", false, true},
		{"allow is refused", "allow", false, true},
		{"prefer is refused", "prefer", false, true},

		// ...and the dev stack keeps working, but only by saying so.
		{"disable with the flag is permitted", "disable", true, false},
		{"empty with the flag is permitted", "", true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := base()
			cfg.SSLMode = tc.sslMode
			cfg.AllowInsecure = tc.allowInsecure

			err := validateConfig(cfg)
			if tc.wantErr && err == nil {
				t.Fatalf("sslmode=%q allowInsecure=%v was permitted, want refused",
					tc.sslMode, tc.allowInsecure)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("sslmode=%q allowInsecure=%v was refused: %v",
					tc.sslMode, tc.allowInsecure, err)
			}
		})
	}
}

// A refusal nobody can act on is barely better than a silent downgrade.
func TestSSLRefusalNamesTheWayOut(t *testing.T) {
	cfg := base()
	cfg.SSLMode = "disable"

	err := validateConfig(cfg)
	if err == nil {
		t.Fatal("expected a refusal")
	}
	for _, want := range []string{"DB_SSLMODE", "require", "ALLOW_INSECURE_DB"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("refusal does not mention %q: %v", want, err)
		}
	}
}

func TestValidateConfigPassword(t *testing.T) {
	for _, tc := range []struct {
		name     string
		authMode string
		password string
		wantErr  bool
	}{
		{"password auth with a password", "password", "secret", false},
		{"password auth without one is refused", "password", "", true},
		{"an unrecognised auth mode falls back to password, so it is refused too", "wat", "", true},

		// Managed identity never reads Password - BeforeConnect supplies an
		// Entra token per connection - so an empty one is correct there.
		{"managed identity needs no password", authModeManagedIdentity, "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := base()
			cfg.AuthMode = tc.authMode
			cfg.Password = tc.password

			err := validateConfig(cfg)
			if tc.wantErr && err == nil {
				t.Fatalf("authMode=%q password=%q was permitted, want refused", tc.authMode, tc.password)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("authMode=%q password=%q was refused: %v", tc.authMode, tc.password, err)
			}
		})
	}
}

// MigrationDSN runs before the pool at startup and builds its own DSN, so
// gating only NewPostgresPool would let the entire schema be applied over an
// unencrypted connection before anything checked.
func TestMigrationDSNIsGatedToo(t *testing.T) {
	cfg := base()
	cfg.SSLMode = "disable"

	if _, err := MigrationDSN(context.Background(), cfg); err == nil {
		t.Fatal("MigrationDSN built a DSN for sslmode=disable, want refused")
	}
}

func TestNewPostgresPoolIsGated(t *testing.T) {
	cfg := base()
	cfg.SSLMode = "disable"

	// Refused on the configuration, so it never reaches the network - which is
	// what makes this safe to assert without a database.
	if _, err := NewPostgresPool(context.Background(), cfg); err == nil {
		t.Fatal("NewPostgresPool accepted sslmode=disable, want refused")
	}
}

// The DSN builders used to interpolate the credential with fmt.Sprintf, so a
// password containing @ split userinfo from host and the failure surfaced as a
// wrong hostname rather than a quoting problem.
func TestDSNEscapesTheCredential(t *testing.T) {
	cfg := base()
	cfg.Password = "p@ss:w/rd?x"

	dsn := tokenDSN(cfg, cfg.Password)

	if strings.Contains(dsn, "p@ss") {
		t.Errorf("password embedded unescaped, host parsing will break: %s", dsn)
	}
	if !strings.Contains(dsn, "@localhost:5432/app") {
		t.Errorf("host/port/db not intact: %s", dsn)
	}
	if !strings.Contains(dsn, "sslmode=require") {
		t.Errorf("sslmode lost: %s", dsn)
	}
}

func TestStandardDSNCarriesNoPassword(t *testing.T) {
	cfg := base()
	cfg.AuthMode = authModeManagedIdentity

	dsn := standardDSN(cfg)

	if strings.Contains(dsn, "secret") {
		t.Errorf("managed-identity DSN leaked a password: %s", dsn)
	}
	if !strings.Contains(dsn, "postgres://postgres@localhost:5432/app") {
		t.Errorf("unexpected shape: %s", dsn)
	}
}

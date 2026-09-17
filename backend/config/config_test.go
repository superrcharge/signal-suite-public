package config_test

import (
	"testing"

	"backend/config"
)

// The defaults are the subject here, not an incidental detail. An earlier change was
// entirely a story about what Load() does when an environment variable goes
// missing, and until this file existed nothing asserted any of it - the two
// integration TestMains call Load() but assert nothing about it, so a default
// could change in either direction without a single test noticing.

func TestDatabaseDefaults(t *testing.T) {
	// Every DB_* variable unset, which is the deployed-environment-lost-its-
	// settings case rather than a hypothetical.
	for _, key := range []string{
		"DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD",
		"DB_NAME", "DB_SSLMODE", "DB_AUTH_MODE", "ALLOW_INSECURE_DB",
	} {
		t.Setenv(key, "")
	}

	db := config.Load().Database

	if db.Password != "" {
		t.Errorf(
			"DB_PASSWORD unset gave %q, want empty.\n"+
				"It used to default to the literal \"postgres\", so losing DB_AUTH_MODE\n"+
				"downgraded from managed identity to password auth against a guessable\n"+
				"credential instead of failing.",
			db.Password,
		)
	}

	if db.AllowInsecure {
		t.Error(
			"ALLOW_INSECURE_DB unset gave true, want false.\n" +
				"This flag must fail closed: an environment that never mentions it\n" +
				"cannot be one that permits an unencrypted database connection.",
		)
	}

	// Deliberately still "disable". The floor lives in the database package's
	// validateConfig, not in the default, because the compose dev stack has a
	// legitimate need for it and a default cannot tell the two apart.
	if db.SSLMode != "disable" {
		t.Errorf("DB_SSLMODE unset gave %q, want \"disable\"", db.SSLMode)
	}

	if db.AuthMode != "password" {
		t.Errorf("DB_AUTH_MODE unset gave %q, want \"password\"", db.AuthMode)
	}
}

func TestAllowInsecureReadsTheEnvironment(t *testing.T) {
	for _, tc := range []struct {
		value string
		want  bool
	}{
		{"true", true},
		{"TRUE", true},
		{"1", true},
		{"false", false},
		{"0", false},
		{"", false},
		{"yes", false}, // getBoolEnv accepts only "true" and "1"
	} {
		t.Run("ALLOW_INSECURE_DB="+tc.value, func(t *testing.T) {
			t.Setenv("ALLOW_INSECURE_DB", tc.value)
			if got := config.Load().Database.AllowInsecure; got != tc.want {
				t.Errorf("AllowInsecure = %v, want %v", got, tc.want)
			}
		})
	}
}

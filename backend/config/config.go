package config

import (
	"os"
	"strings"
	"time"

	"backend/internal/auth"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Frontend FrontendConfig
	Auth     *auth.Config
	Blob     BlobConfig
}

type BlobConfig struct {
	ServiceURL string // e.g. https://account.blob.core.windows.net
	Container  string
}

func (b BlobConfig) Enabled() bool { return b.ServiceURL != "" }

type ServerConfig struct {
	Port         string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration

	// TrustedProxies is an optional comma-separated list of extra IPs or CIDR
	// ranges whose X-Forwarded-For header may be believed, on top of the
	// loopback / private / link-local ranges that are always trusted.
	//
	// Normally empty. The container is never reachable from the internet
	// directly - App Service fronts it - so the immediate peer is always on a
	// private or link-local address and the defaults cover it. This exists so a
	// topology with a proxy on a public address can be described without a code
	// change.
	TrustedProxies []string
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string

	// AuthMode is "password" (compose dev - uses Password directly) or
	// "managed_identity" (App Service - fetches an Entra token at connect
	// time via azidentity.DefaultAzureCredential and uses it as the
	// password). Driven by DB_AUTH_MODE.
	AuthMode string

	// TokenScope is the Entra resource audience for the OSS-RDBMS API.
	// Only consulted when AuthMode == "managed_identity". Defaults to
	// the public-cloud OSS-RDBMS scope, which is identical across
	// commercial and government clouds alike (Azure normalizes this internally).
	TokenScope string

	// AllowInsecure permits SSLMode=disable. Driven by ALLOW_INSECURE_DB,
	// and false unless something explicitly sets it.
	//
	// The polarity is the whole point. SSLMode defaulted to "disable" with
	// nothing in code flooring it, so an environment that lost DB_SSLMODE
	// from its app settings connected to the database unencrypted, started
	// normally, passed /health and /ready, and reported nothing anywhere.
	// A silent downgrade is worse than a loud misconfiguration, because
	// there is no signal to notice.
	//
	// Deriving this from an existing signal was considered and rejected.
	// APP_ENV is set only by a deployment, so keying off it would
	// fail open - a new environment that forgot it would silently permit
	// exactly what this exists to stop. FRONTEND_MODE is a frontend
	// concern, and compose.yaml runs "static" while still needing disable.
	// A dedicated flag is the only one that both fails closed and says
	// what it means at the point of use.
	AllowInsecure bool
}

// FrontendConfig controls how the frontend is served
type FrontendConfig struct {
	// Mode: "proxy" (development) or "static" (production)
	Mode string
	// ProxyURL: Vite dev server URL (only used in proxy mode)
	ProxyURL string
	// StaticPath: Path to built frontend files (only used in static mode)
	StaticPath string
}

func Load() *Config {
	return &Config{
		Server: ServerConfig{
			// 3001, not 8080. Every other surface in the repo says 3001 -
			// compose.yaml, Dockerfile.prod's EXPOSE, compose.selfhost.yaml's
			// SERVER_PORT and WEBSITES_PORT, the README, and the dev docs. 8080
			// was the lone dissenter, so running the binary or the image without
			// an explicit env listened on a port nothing else expected.
			Port:           getEnv("SERVER_PORT", "3001"),
			ReadTimeout:    getDurationEnv("SERVER_READ_TIMEOUT", 10*time.Second),
			WriteTimeout:   getDurationEnv("SERVER_WRITE_TIMEOUT", 10*time.Second),
			TrustedProxies: splitAndTrim(getEnv("TRUSTED_PROXIES", "")),
		},
		Database: DatabaseConfig{
			Host: getEnv("DB_HOST", "localhost"),
			Port: getEnv("DB_PORT", "5432"),
			User: getEnv("DB_USER", "postgres"),
			// No default. It used to be the literal "postgres", so losing
			// DB_AUTH_MODE downgraded from managed identity to password auth
			// against a guessable credential rather than failing. Every real
			// caller supplies this - compose, CI and the Makefile all set it -
			// so the empty default costs nothing and removes the fallback.
			Password:      getEnv("DB_PASSWORD", ""),
			DBName:        getEnv("DB_NAME", "app"),
			SSLMode:       getEnv("DB_SSLMODE", "disable"),
			AuthMode:      getEnv("DB_AUTH_MODE", "password"),
			TokenScope:    getEnv("DB_TOKEN_SCOPE", "https://ossrdbms-aad.database.windows.net/.default"),
			AllowInsecure: getBoolEnv("ALLOW_INSECURE_DB", false),
		},
		Frontend: FrontendConfig{
			Mode: getEnv("FRONTEND_MODE", "static"),
			// 5173 is the Vite dev server port: frontend/Dockerfile.dev,
			// frontend/vite.config.ts and compose.dev.yaml all agree on it.
			// The old 3000 default appeared nowhere else in the repo and was a
			// leftover from a pre-Vite layout, so any proxy-mode run that did not
			// set this var explicitly went to a port with nothing behind it.
			ProxyURL:   getEnv("FRONTEND_PROXY_URL", "http://frontend:5173"),
			StaticPath: getEnv("FRONTEND_STATIC_PATH", "./static"),
		},
		Auth: loadAuthConfig(),
		Blob: BlobConfig{
			ServiceURL: getEnv("AZURE_STORAGE_URL", ""),
			Container:  getEnv("AZURE_STORAGE_CONTAINER", "equipment-photos"),
		},
	}
}

func loadAuthConfig() *auth.Config {
	mode := auth.ModeAzure
	if !getBoolEnv("AUTH_ENABLED", true) {
		mode = auth.ModeNone
	}
	return &auth.Config{
		Mode:          mode,
		TenantID:      getEnv("AUTH_TENANT_ID", ""),
		ClientID:      getEnv("AUTH_CLIENT_ID", ""),
		AuthorityHost: getEnv("AUTH_AUTHORITY_HOST", "login.microsoftonline.com"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getDurationEnv(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if d, err := time.ParseDuration(value); err == nil {
			return d
		}
	}
	return defaultValue
}

func getBoolEnv(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		return strings.ToLower(value) == "true" || value == "1"
	}
	return defaultValue
}

// splitAndTrim turns a comma-separated env value into a slice, dropping empty
// entries so a trailing comma or an unset variable yields nil rather than a
// slice containing "". An empty string in a trusted-proxy list would be a
// silently broken entry rather than an obvious one.
func splitAndTrim(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

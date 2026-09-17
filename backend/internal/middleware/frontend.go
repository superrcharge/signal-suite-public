package middleware

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"backend/config"
	"backend/internal/auth"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/static"
)

// SetupFrontend configures frontend serving based on mode.
//
// Static mode (production): templates window.__SHF_AUTH__ into the
// served index.html so the SPA can read auth config without a
// build-time bake. The templated bytes are computed once at startup;
// an absent index.html surfaces as an error so a misconfigured deploy
// fails fast instead of returning 500s per-request.
//
// Proxy mode (compose dev): forwards non-API requests to the Vite dev
// server. Auth config injection in dev runs through Vite env vars
// (VITE_AUTH_*), not this middleware.
func SetupFrontend(app *fiber.App, cfg config.FrontendConfig, authCfg *auth.Config) error {
	if cfg.Mode == "proxy" {
		setupDevProxy(app, cfg.ProxyURL)
		return nil
	}
	return setupStaticServing(app, cfg.StaticPath, authCfg)
}

// setupDevProxy proxies non-API requests to Vite dev server
// HMR WebSocket connects directly to Vite (not through this proxy)
func setupDevProxy(app *fiber.App, proxyURL string) {
	app.Use(func(c fiber.Ctx) error {
		path := c.Path()

		// Skip API routes - let them be handled by registered handlers
		if strings.HasPrefix(path, "/api") {
			return c.Next()
		}

		// Skip health endpoints
		if path == "/health" || path == "/ready" {
			return c.Next()
		}

		// Proxy everything else to Vite
		targetURL := proxyURL + path
		if c.Request().URI().QueryString() != nil {
			targetURL += "?" + string(c.Request().URI().QueryString())
		}

		req, err := http.NewRequest(string(c.Method()), targetURL, nil)
		if err != nil {
			return c.Status(fiber.StatusBadGateway).SendString("Proxy error: " + err.Error())
		}

		// Copy headers
		for key, value := range c.Request().Header.All() {
			req.Header.Set(string(key), string(value))
		}

		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			return c.Status(fiber.StatusBadGateway).SendString("Proxy error: " + err.Error())
		}
		defer func() { _ = resp.Body.Close() }()

		// Copy response headers
		for key, values := range resp.Header {
			for _, value := range values {
				c.Set(key, value)
			}
		}

		c.Status(resp.StatusCode)
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return c.Status(fiber.StatusBadGateway).SendString("Proxy error: " + err.Error())
		}

		return c.Send(body)
	})
}

// setupStaticServing serves the built frontend with SPA fallback. The
// SPA fallback path serves the templated index.html (with auth config
// injected); the static middleware handles every other asset.
func setupStaticServing(app *fiber.App, staticPath string, authCfg *auth.Config) error {
	indexBytes, err := buildTemplatedIndex(staticPath, authCfg)
	if err != nil {
		return fmt.Errorf("build templated index.html: %w", err)
	}

	serveIndex := func(c fiber.Ctx) error {
		c.Set(fiber.HeaderContentType, "text/html; charset=utf-8")
		return c.Send(indexBytes)
	}

	// SPA fallback middleware - must come BEFORE static middleware.
	// Any non-API path that doesn't resolve to an asset gets the
	// templated index.html, which is what the SPA router expects.
	app.Use(func(c fiber.Ctx) error {
		path := c.Path()

		if strings.HasPrefix(path, "/api") {
			return c.Next()
		}
		if path == "/health" || path == "/ready" {
			return c.Next()
		}

		filePath := filepath.Join(staticPath, path)
		info, err := os.Stat(filePath)
		if os.IsNotExist(err) || (err == nil && info.IsDir()) {
			return serveIndex(c)
		}
		return c.Next()
	})

	// Static middleware for non-index assets (JS, CSS, fonts, etc.).
	// IndexNames is intentionally nil - the SPA fallback above handles
	// index.html serving with the templated bytes.
	app.Get("/*", static.New(staticPath, static.Config{
		Browse:     false,
		IndexNames: nil,
	}))
	return nil
}

// authConfigScriptBody returns the JavaScript that the static handler splices
// into index.html as an inline <script>.
//
// It is its own function because securityHeaders hashes exactly this string into
// the CSP's script-src, and a second copy of the snippet would be a CSP that
// stops matching the moment either side is edited. The symptom of that drift is
// not a failing test: the browser refuses to run the block, window.__SHF_AUTH__
// is undefined, MSAL never initialises, and nobody can log in while the page
// still renders its shell and reports 0 rows everywhere.
//
// An earlier release shipped precisely that. The CSP was tightened to script-src 'self'
// after checking a raw `vite build`, whose output contains no inline script -
// but the artifact the server actually returns is this templated one, which
// does. Verify against what the handler serves, never against what the bundler
// emits.
func authConfigScriptBody(authCfg *auth.Config) (string, error) {
	payload := map[string]any{
		"enabled":       authCfg.Enabled(),
		"tenantId":      authCfg.TenantID,
		"clientId":      authCfg.ClientID,
		"authorityHost": authCfg.AuthorityHost,
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal auth config: %w", err)
	}
	return fmt.Sprintf("window.__SHF_AUTH__ = %s;", payloadJSON), nil
}

// buildTemplatedIndex reads index.html, splices a window.__SHF_AUTH__
// configuration block before </head>, and returns the result. The SPA
// reads the block at startup (see frontend/src/auth/msal-config.ts) to
// configure MSAL without a build-time bake.
func buildTemplatedIndex(staticPath string, authCfg *auth.Config) ([]byte, error) {
	// staticPath comes from FRONTEND_STATIC_PATH (operator-controlled
	// container config), not request input - no path traversal vector.
	raw, err := os.ReadFile(filepath.Join(staticPath, "index.html")) //nolint:gosec // G304: operator config, not user input
	if err != nil {
		return nil, err
	}

	body, err := authConfigScriptBody(authCfg)
	if err != nil {
		return nil, err
	}
	snippet := []byte("<script>" + body + "</script>")

	needle := []byte("</head>")
	idx := bytes.Index(raw, needle)
	if idx < 0 {
		// No </head> tag - append the snippet at the end. Defensive
		// against unusual bundler output; SPA bundlers typically emit
		// a well-formed <head>.
		return append(raw, snippet...), nil
	}
	out := make([]byte, 0, len(raw)+len(snippet))
	out = append(out, raw[:idx]...)
	out = append(out, snippet...)
	out = append(out, raw[idx:]...)
	return out, nil
}

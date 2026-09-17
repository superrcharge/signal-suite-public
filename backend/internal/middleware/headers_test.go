// Package middleware_test - see authz_test.go for why this is an external test
// package.
package middleware_test

import (
	"crypto/sha256"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"backend/config"
	"backend/internal/auth"
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

// The security headers had no test of any kind before this file. Grepping the
// whole backend for Content-Security-Policy, Strict-Transport-Security or
// securityHeaders across *_test.go returned nothing, so every directive below
// could be weakened, misspelled or dropped entirely without failing a build or
// a test - and a misspelled directive name is silently ignored by the browser
// rather than rejected, so there is no runtime signal either.
//
// That is the same shape as the rate limiter, which is the cautionary case worth
// naming: it had tests, they all passed, and an earlier release still shipped a version that
// applied no limit at all, because nothing asserted the observable behaviour.
// Headers are cheaper to pin than that was - they are literally the response.

// headersFor builds the real middleware stack and returns the response headers
// from a request through it.
//
// It goes through middleware.Setup rather than reaching for securityHeaders
// directly, so the test exercises what main.go actually installs, in the order
// it installs it. A header set by a handler that never runs in production would
// otherwise look correct here.
func headersFor(t *testing.T, devMode bool, cfg *auth.Config) http.Header {
	t.Helper()

	app := fiber.New()
	middleware.Setup(app, devMode, cfg)

	// /health is registered by Setup itself, so no test-only route is needed.
	resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/health", nil))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	return resp.Header
}

// cspDirectives splits a Content-Security-Policy into directive -> source list.
//
// Directive-level parsing is the point. A substring check for "'unsafe-inline'"
// against the whole policy cannot tell script-src from style-src, and this app
// legitimately needs it in style-src - MUI's emotion runtime injects <style>
// tags at runtime - while it must never carry it in script-src. A whole-string
// assertion would therefore have to accept the one case that matters.
func cspDirectives(t *testing.T, header http.Header) map[string]string {
	t.Helper()

	csp := header.Get("Content-Security-Policy")
	if csp == "" {
		t.Fatal("no Content-Security-Policy header set")
	}

	out := map[string]string{}
	for _, part := range strings.Split(csp, ";") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		name, sources, _ := strings.Cut(part, " ")
		out[name] = strings.TrimSpace(sources)
	}
	return out
}

func TestSecurityHeadersInProduction(t *testing.T) {
	h := headersFor(t, false, &auth.Config{Mode: auth.ModeNone})

	want := map[string]string{
		"X-Frame-Options":           "SAMEORIGIN",
		"X-Content-Type-Options":    "nosniff",
		"Referrer-Policy":           "strict-origin-when-cross-origin",
		"Permissions-Policy":        "geolocation=(), microphone=(), camera=()",
		"X-XSS-Protection":          "0",
		"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
	}
	for name, expected := range want {
		if got := h.Get(name); got != expected {
			t.Errorf("%s = %q, want %q", name, got, expected)
		}
	}

	d := cspDirectives(t, h)

	// script-src is the directive that decides whether an injected <script> runs.
	// The shape production must have is 'self' plus exactly one sha256 hash - the
	// digest of the window.__SHF_AUTH__ block the static handler splices in - and
	// neither unsafe keyword.
	//
	// This assertion used to demand exactly "'self'", which is what shipped the
	// The earlier auth outage: it encoded the belief that production serves no inline
	// script, taken from the `vite build` output rather than from the response
	// the handler returns. TestCSPAllowsTheInjectedAuthConfigScript now pins the
	// digest against the actual served HTML; this one pins the shape.
	scriptSrc := d["script-src"]
	if !strings.HasPrefix(scriptSrc, "'self' 'sha256-") || !strings.HasSuffix(scriptSrc, "'") {
		t.Errorf("script-src = %q, want \"'self' 'sha256-...'\" - 'self' alone blocks the "+
			"injected auth config and breaks login", scriptSrc)
	}
	if n := strings.Count(scriptSrc, "'sha256-"); n != 1 {
		t.Errorf("script-src = %q carries %d sha256 hashes, want exactly 1", scriptSrc, n)
	}
	for _, unsafe := range []string{"unsafe-inline", "unsafe-eval"} {
		if strings.Contains(scriptSrc, unsafe) {
			t.Errorf("script-src = %q carries '%s' in production; the hash is what allows "+
				"the one known inline script without allowing an injected one", scriptSrc, unsafe)
		}
	}

	// No wildcard scheme on img-src. `https:` allows any HTTPS host, which is a
	// working exfiltration channel via an injected <img src="https://.../?d=">.
	if got := d["img-src"]; got != "'self' data: blob:" {
		t.Errorf("img-src = %q, want \"'self' data: blob:\" - a wildcard scheme "+
			"here is an exfiltration channel and nothing in the app loads a "+
			"cross-origin image", got)
	}

	// style-src is the deliberate exception, asserted so that "unsafe-inline is
	// fine, it is needed" cannot quietly spread to another directive later.
	if got := d["style-src"]; got != "'self' 'unsafe-inline'" {
		t.Errorf("style-src = %q, want \"'self' 'unsafe-inline'\" (MUI/emotion "+
			"injects style tags at runtime)", got)
	}

	for _, directive := range []string{"default-src", "frame-ancestors"} {
		if got := d[directive]; got != "'self'" {
			t.Errorf("%s = %q, want \"'self'\"", directive, got)
		}
	}

	if strings.Contains(d["connect-src"], "ws://") {
		t.Errorf("connect-src = %q carries a plaintext ws:// origin in production", d["connect-src"])
	}
}

func TestSecurityHeadersInDevMode(t *testing.T) {
	h := headersFor(t, true, &auth.Config{Mode: auth.ModeNone})

	// HSTS is withheld in dev on purpose: sent once over plain http://localhost
	// it pins the whole localhost origin to HTTPS in that browser profile, which
	// breaks every other local project on the machine and is not obviously
	// reversible from the app that did it.
	if got := h.Get("Strict-Transport-Security"); got != "" {
		t.Errorf("Strict-Transport-Security = %q in dev mode, want it absent", got)
	}

	d := cspDirectives(t, h)
	for _, needed := range []string{"'unsafe-inline'", "'unsafe-eval'"} {
		if !strings.Contains(d["script-src"], needed) {
			t.Errorf("script-src = %q, missing %s which Vite's dev server needs "+
				"(React Refresh preamble is inline, HMR evaluates modules)", d["script-src"], needed)
		}
	}
	if !strings.Contains(d["connect-src"], "ws://localhost:5173") {
		t.Errorf("connect-src = %q, missing the Vite HMR socket", d["connect-src"])
	}
}

// TestCSPAllowsOnlyTheConfiguredAuthority pins the property the CSP comment
// claims: a government-cloud deployment should not be able to reach a commercial Entra
// endpoint, and vice versa. That only holds if the authority is injected from
// config rather than hardcoded or wildcarded.
func TestCSPAllowsOnlyTheConfiguredAuthority(t *testing.T) {
	const host = "login.microsoftonline.us"

	enabled := cspDirectives(t, headersFor(t, false, &auth.Config{
		Mode:          auth.ModeAzure,
		AuthorityHost: host,
	}))

	// MSAL needs the token endpoint via fetch (connect-src) and the silent-SSO
	// iframe (frame-src).
	for _, directive := range []string{"connect-src", "frame-src"} {
		if !strings.Contains(enabled[directive], "https://"+host) {
			t.Errorf("%s = %q, missing the configured authority https://%s",
				directive, enabled[directive], host)
		}
	}

	// With auth off, no authority is permitted at all.
	disabled := cspDirectives(t, headersFor(t, false, &auth.Config{Mode: auth.ModeNone}))
	for _, directive := range []string{"connect-src", "frame-src"} {
		if strings.Contains(disabled[directive], host) {
			t.Errorf("%s = %q names an authority host while auth is disabled",
				directive, disabled[directive])
		}
		if strings.Contains(disabled[directive], "*") {
			t.Errorf("%s = %q contains a wildcard; the authority must be exact",
				directive, disabled[directive])
		}
	}
}

// TestRateLimiterSkipsOnlyHealthProbes pins the exemption list. A rate limiter
// bypass is a security control's off switch, and this one previously carried a
// prefix match on /ws that no route in the service used - so it exempted nothing
// real while standing ready to exempt anything later registered beneath it.
func TestRateLimiterSkipsOnlyHealthProbes(t *testing.T) {
	app := fiber.New()
	middleware.Setup(app, false, &auth.Config{Mode: auth.ModeNone})
	app.Get("/ws/anything", func(c fiber.Ctx) error { return c.SendString("ok") })
	app.Get("/api/v1/probe", func(c fiber.Ctx) error { return c.SendString("ok") })

	// A limited route reports its budget; an exempt one has no limiter headers
	// at all, because the limiter never ran.
	limited := func(path string) bool {
		resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, path, nil))
		if err != nil {
			t.Fatalf("request %s: %v", path, err)
		}
		defer func() { _ = resp.Body.Close() }()
		return resp.Header.Get("X-RateLimit-Remaining") != ""
	}

	for _, path := range []string{"/health", "/ready"} {
		if limited(path) {
			t.Errorf("%s is rate limited; health probes must be exempt or an "+
				"orchestrator restart loop can exhaust the bucket", path)
		}
	}
	for _, path := range []string{"/api/v1/probe", "/ws/anything"} {
		if !limited(path) {
			t.Errorf("%s is exempt from rate limiting; only /health and /ready should be", path)
		}
	}
}

// TestCSPAllowsTheInjectedAuthConfigScript is the test whose absence shipped a
// production auth outage in an earlier release.
//
// The CSP was tightened to script-src 'self' on the evidence of a real `vite
// build`, which emits one external module script and nothing inline. But the
// bytes the server returns are not the bundler's - setupStaticServing splices
// window.__SHF_AUTH__ into index.html as an inline <script>, and 'self' does not
// cover an inline script. So the browser refused to run it, the SPA read
// undefined for its MSAL config, and nobody could log in. The page still
// rendered its shell and reported 0 rows everywhere, which is why it read as a
// data problem rather than a CSP one.
//
// The lesson is in what this test does differently: it asserts against the
// response the handler actually produces, not against the build output. Both
// halves come from one request, so there is nothing to keep in sync by hand.
func TestCSPAllowsTheInjectedAuthConfigScript(t *testing.T) {
	dir := t.TempDir()
	index := "<!DOCTYPE html><html><head><title>t</title></head><body><div id=\"root\"></div></body></html>"
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte(index), 0o600); err != nil {
		t.Fatalf("write index.html: %v", err)
	}

	// Values shaped like real ones (full GUIDs, a real authority host), so the
	// marshalled payload - and therefore the digest - is representative rather
	// than degenerate. Both GUIDs are synthetic.
	authCfg := &auth.Config{
		Mode:          auth.ModeAzure,
		TenantID:      "0f1e2d3c-4b5a-4968-8776-655443322110",
		ClientID:      "a1b2c3d4-e5f6-4789-9abc-def012345678",
		AuthorityHost: "login.microsoftonline.us",
	}

	app := fiber.New()
	middleware.Setup(app, false, authCfg)
	if err := middleware.SetupFrontend(app, config.FrontendConfig{Mode: "static", StaticPath: dir}, authCfg); err != nil {
		t.Fatalf("SetupFrontend: %v", err)
	}

	resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/", nil))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	served, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	inline := regexp.MustCompile(`(?s)<script>(.*?)</script>`).FindSubmatch(served)
	if inline == nil {
		t.Fatalf("no inline <script> in the served index.html; if the auth config is no "+
			"longer injected this test should be deleted rather than skipped.\nserved: %s", served)
	}
	if !strings.Contains(string(inline[1]), "__SHF_AUTH__") {
		t.Fatalf("inline script is not the auth config block: %q", inline[1])
	}

	// A CSP hash covers the element's text content, without the surrounding tags.
	sum := sha256.Sum256(inline[1])
	want := "'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"

	scriptSrc := cspDirectives(t, resp.Header)["script-src"]
	if !strings.Contains(scriptSrc, want) {
		t.Errorf("script-src = %q\n  does not carry %s, the digest of the inline block the "+
			"handler just served.\n  The browser will refuse to execute it, so "+
			"window.__SHF_AUTH__ is undefined, MSAL never initialises and login is "+
			"impossible.\n  inline body: %q", scriptSrc, want, inline[1])
	}

	// The hash must not be accompanied by 'unsafe-inline'. A UA that understands
	// hashes ignores 'unsafe-inline' when one is present, but an older one does
	// not, so shipping both quietly restores what the hash exists to avoid.
	if strings.Contains(scriptSrc, "unsafe-inline") {
		t.Errorf("script-src = %q carries both a hash and 'unsafe-inline'; the hash alone "+
			"is what makes this one script allowed and an injected one not", scriptSrc)
	}
}

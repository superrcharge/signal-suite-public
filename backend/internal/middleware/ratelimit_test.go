package middleware

import (
	"net/http/httptest"
	"strconv"
	"testing"

	"backend/internal/auth"

	"github.com/gofiber/fiber/v3"
)

// Regression coverage for an earlier issue.
//
// Setup() used to install a hand-rolled limiter KeyGenerator that read
// X-Forwarded-For and believed it unconditionally, taking the leftmost entry.
// Azure appends to whatever the caller sent, so the leftmost entry is the part
// the caller controls: anyone could hold a fresh 300/min allowance by varying a
// header, and the cap enforced nothing: three requests carrying one forged
// value counted down 299, 298, 297, and a fourth carrying a different value
// came back 299.
//
// These call the real Setup(). An earlier version of this file built its own
// fiber.App and its own limiter, which passed against the vulnerable code
// because it never touched the function containing the bug - coverage in
// appearance only. If these tests are ever restructured, keep them pointed at
// Setup().
//
// Both directions are pinned. Fixing only the spoof by ignoring the header
// entirely would also stop the forgery, while putting every user behind App
// Service into one shared bucket and turning the limiter into a self-inflicted
// outage.

// limitedApp wires the real middleware stack. trusted lets a test promote the
// harness peer (0.0.0.0) to a trusted proxy, which is how the honoured-header
// case is reached without a real network.
func limitedApp(trusted []string) *fiber.App {
	app := fiber.New(fiber.Config{
		TrustProxy:       true,
		TrustProxyConfig: TrustProxyConfig(trusted),
		// No ProxyHeader, matching main.go. Setting it would make c.IP() try to
		// parse the chain itself, which is the behaviour clientKey exists to
		// avoid - and a test that configured it would stop describing production.
	})
	// devMode=false so the limiter's Next() does not skip non-/api paths.
	Setup(app, false, &auth.Config{Mode: auth.ModeNone})
	app.Get("/probe", func(c fiber.Ctx) error { return c.SendString("ok") })
	return app
}

// remaining issues one request carrying the given forged header and returns the
// limiter's X-RateLimit-Remaining, which is the observable bucket state. The
// production cap is 300, so this reads the counter rather than exhausting it.
func remaining(t *testing.T, app *fiber.App, forged string) int {
	t.Helper()
	req := httptest.NewRequest(fiber.MethodGet, "/probe", nil)
	if forged != "" {
		req.Header.Set(fiber.HeaderXForwardedFor, forged)
	}
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close() //nolint:errcheck // test cleanup

	raw := resp.Header.Get("X-RateLimit-Remaining")
	n, err := strconv.Atoi(raw)
	if err != nil {
		t.Fatalf("X-RateLimit-Remaining %q is not a number: %v", raw, err)
	}
	return n
}

func TestForgedForwardedHeaderCannotMintANewBucket(t *testing.T) {
	// The harness peer is 0.0.0.0, which is neither loopback, private nor
	// link-local, so it is untrusted - the same position as a public client
	// reaching a deployment with no proxy in front of it.
	app := limitedApp(nil)

	forged := []string{"203.0.113.7", "198.51.100.22", "198.51.100.23", "10.9.9.9"}
	got := make([]int, 0, len(forged))
	for _, f := range forged {
		got = append(got, remaining(t, app, f))
	}

	// One shared bucket means a strictly decreasing count. A climb back toward
	// the maximum means the forged header selected a fresh bucket.
	for i, n := range got {
		want := got[0] - i
		if n != want {
			t.Fatalf(
				"request %d with X-Forwarded-For %q: remaining=%d, want %d.\n"+
					"A count that stops falling means the forged header chose the bucket, "+
					"which is the original bug reintroduced.\nSequence was %v",
				i+1, forged[i], n, want, got,
			)
		}
	}
}

func TestUntrustedForwardedHeaderIsIgnoredEntirely(t *testing.T) {
	app := limitedApp(nil)

	withHeader := remaining(t, app, "203.0.113.7")
	withoutHeader := remaining(t, app, "")

	if withoutHeader != withHeader-1 {
		t.Fatalf(
			"a request carrying a forged header and one carrying none landed in different "+
				"buckets (remaining %d then %d). From an untrusted peer the header must not "+
				"influence the key at all.",
			withHeader, withoutHeader,
		)
	}
}

func TestTrustedProxyForwardedHeaderIsHonoured(t *testing.T) {
	// The other direction. Behind App Service the peer IS trusted, and the
	// header is then the only way to tell users apart, so it must be honoured -
	// otherwise every user shares one allowance.
	app := limitedApp([]string{"0.0.0.0/32"})

	first := remaining(t, app, "203.0.113.7")
	second := remaining(t, app, "198.51.100.22")

	if second != first {
		t.Fatalf(
			"two requests from a trusted proxy carrying different client IPs: remaining=%d "+
				"then %d. Distinct clients behind a trusted proxy must get distinct buckets, "+
				"or everyone behind App Service shares one allowance and the limiter becomes "+
				"an outage.",
			first, second,
		)
	}
}

// The Azure shape. App Service appends the real client as "<ip>:<port>", so the
// header reaching this process is "<whatever the caller sent>, <ip>:<port>".
//
// This is the case the first attempt at fixing it got wrong in production.
// Deleting the KeyGenerator and relying on c.IP() put the ephemeral port in the
// bucket key, so every request got a fresh 300 allowance and nothing was limited
// at all. A probe after that change returned 299 five times running,
// including for three identical requests.
func TestAzureShapedHeaderIgnoresCallerSuppliedPrefix(t *testing.T) {
	app := limitedApp([]string{"0.0.0.0/32"}) // peer is a trusted proxy

	// One real client. Different forged prefixes, different ephemeral ports.
	// All of it must land in a single bucket.
	reqs := []string{
		"203.0.113.99, 198.51.100.7:54321",
		"198.51.100.22, 198.51.100.7:54999",
		"10.0.0.1, 198.51.100.7:1024",
		"198.51.100.7:60000",
	}
	got := make([]int, 0, len(reqs))
	for _, r := range reqs {
		got = append(got, remaining(t, app, r))
	}
	for i, n := range got {
		want := got[0] - i
		if n != want {
			t.Fatalf(
				"request %d (%q): remaining=%d, want %d. One client must occupy one bucket "+
					"regardless of what it prepends or which ephemeral port it used. Sequence was %v",
				i+1, reqs[i], n, want, got,
			)
		}
	}
}

func TestDistinctClientsBehindProxyGetDistinctBuckets(t *testing.T) {
	app := limitedApp([]string{"0.0.0.0/32"})

	a := remaining(t, app, "203.0.113.99, 198.51.100.7:1111")
	b := remaining(t, app, "203.0.113.99, 198.51.100.9:2222")

	if b != a {
		t.Fatalf(
			"two different real clients: remaining=%d then %d. They must not share a bucket, "+
				"or one noisy client throttles everybody.",
			a, b,
		)
	}
}

func TestStripPort(t *testing.T) {
	cases := map[string]string{
		"198.51.100.7:54321":  "198.51.100.7",
		"198.51.100.7":        "198.51.100.7",
		"[2001:db8::1]:443": "2001:db8::1",
		"2001:db8::1":       "2001:db8::1",
		"":                  "",
	}
	for in, want := range cases {
		if got := stripPort(in); got != want {
			t.Errorf("stripPort(%q) = %q, want %q", in, got, want)
		}
	}
}

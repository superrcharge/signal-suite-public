package middleware

import "github.com/gofiber/fiber/v3"

// TrustProxyConfig returns the set of peers whose X-Forwarded-For header this
// service is willing to believe.
//
// It lives here, exported, rather than inline in main.go's fiber.New so that a
// test can exercise the real thing. A security control that a test can only
// reach by copying its configuration is a control whose test stops describing
// production the first time someone edits one of the two copies.
//
// The trust boundary: this container is never reachable from the internet
// directly. App Service terminates the connection and forwards over the
// internal network, and under compose the peer is the bridge or loopback. So a
// request whose immediate peer is loopback, private or link-local genuinely
// arrived through infrastructure, and a public client can never be that peer.
// Everything else is untrusted, and its X-Forwarded-For is ignored in favour of
// the socket address.
//
// extra carries TRUSTED_PROXIES, for a topology with a proxy on a public
// address. Normally empty.
func TrustProxyConfig(extra []string) fiber.TrustProxyConfig {
	return fiber.TrustProxyConfig{
		Loopback:  true,
		Private:   true,
		LinkLocal: true,
		Proxies:   extra,
	}
}

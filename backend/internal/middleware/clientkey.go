package middleware

import (
	"net"
	"strings"

	"github.com/gofiber/fiber/v3"
)

// clientKey derives the rate-limit bucket key: the address of the caller, as
// far as it can be established without believing anything the caller said.
//
// Why this is hand-written rather than left to c.IP(), having already been
// hand-written once and got wrong:
//
//   - The original version read X-Forwarded-For and believed it, taking the
//     LEFTMOST entry. Azure appends, so the leftmost entry is caller-supplied.
//     Anyone could hold a fresh 300/min allowance by varying a header.
//
//   - Deleting it in favour of fiber's c.IP() did not work either. App Service
//     appends the client as "<ip>:<port>", and with an ephemeral port that
//     string changes every request. Fiber's extraction either returns the whole
//     raw header (validation off) or discards the port-bearing entry as invalid
//     and falls back to the forged leftmost one (validation on). The first gives
//     every request its own bucket, so nothing is limited; the second restores
//     the spoof. Both were observed.
//
// So the rule is explicit instead: the RIGHTMOST entry is the one appended by
// the proxy nearest this process. Everything to its left is caller-supplied and
// unusable. App Service is a single hop, which is what makes rightmost correct
// here; put another proxy in front and this needs revisiting, which is why the
// assumption is written down rather than implied.
//
// If the peer is not a trusted proxy, the header is ignored entirely and the
// socket address is used.
func clientKey(c fiber.Ctx) string {
	if !c.IsProxyTrusted() {
		return stripPort(c.IP())
	}

	xff := c.Get(fiber.HeaderXForwardedFor)
	if strings.TrimSpace(xff) == "" {
		return stripPort(c.IP())
	}

	last := xff[strings.LastIndexByte(xff, ',')+1:]
	if key := stripPort(strings.TrimSpace(last)); key != "" {
		return key
	}
	return stripPort(c.IP())
}

// stripPort removes a ":port" suffix so the same client does not land in a new
// bucket on every connection. Handles "1.2.3.4:5678" and "[::1]:5678"; a bare
// address makes SplitHostPort fail, which is the common case and not an error.
func stripPort(addr string) string {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return ""
	}
	if host, _, err := net.SplitHostPort(addr); err == nil {
		return host
	}
	return strings.Trim(addr, "[]")
}

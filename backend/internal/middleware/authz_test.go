// Package middleware_test is an external test package so it can import the
// domain packages (which themselves import middleware) without a cycle.
package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"backend/internal/auth"
	"backend/internal/csvbulk"
	"backend/internal/domain/audit"
	"backend/internal/domain/contract"
	"backend/internal/domain/equipment"
	"backend/internal/domain/kit"
	"backend/internal/domain/pace"
	"backend/internal/domain/radionet"
	"backend/internal/domain/satcomservice"
	"backend/internal/domain/section"
	"backend/internal/domain/terminal"
	"backend/internal/domain/transport"
	"backend/internal/domain/user"
	"backend/internal/domain/waveform"
	"backend/internal/middleware"
	"backend/internal/shared/validator"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/recover"
)

// stubUser is a minimal middleware.AuthUser. Using a local stub rather than
// user.User keeps these tests focused on the authorization contract.
type stubUser struct {
	id    string
	roles []string
}

func (s *stubUser) GetID() string   { return s.id }
func (s *stubUser) GetName() string { return s.id }
func (s *stubUser) HasRole(role string) bool {
	for _, r := range s.roles {
		if r == role {
			return true
		}
	}
	return false
}

// enabledMiddleware returns middleware with authorization active. ModeAzure
// makes cfg.Enabled() true; RequireRole never touches the OIDC verifier, so
// no network or token is involved - it reads the user out of Fiber Locals.
func enabledMiddleware() *middleware.AuthMiddleware {
	return middleware.NewAuthMiddleware(&auth.Config{Mode: auth.ModeAzure}, nil)
}

// appWithGate builds a single gated route with the current user pre-injected,
// mirroring how the domains register writes: gate first, handler second.
func appWithGate(t *testing.T, current middleware.AuthUser, allowed ...string) *fiber.App {
	t.Helper()

	app := fiber.New()
	app.Use(func(c fiber.Ctx) error {
		if current != nil {
			c.Locals(middleware.UserLocalsKey, current)
		}
		return c.Next()
	})
	app.Post("/gated", enabledMiddleware().RequireRole(allowed...), func(c fiber.Ctx) error {
		return c.SendString("reached handler")
	})
	return app
}

func TestRequireRole(t *testing.T) {
	tests := []struct {
		name       string
		current    middleware.AuthUser
		allowed    []string
		wantStatus int
	}{
		{
			name:       "matching role passes through",
			current:    &stubUser{id: "u1", roles: []string{"admin"}},
			allowed:    []string{"admin", "editor"},
			wantStatus: http.StatusOK,
		},
		{
			name:       "second listed role also passes (variadic OR)",
			current:    &stubUser{id: "u2", roles: []string{"editor"}},
			allowed:    []string{"admin", "editor"},
			wantStatus: http.StatusOK,
		},
		{
			name:       "viewer is forbidden from a write gate",
			current:    &stubUser{id: "u3", roles: []string{"viewer"}},
			allowed:    []string{"admin", "editor"},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "editor is forbidden from an admin-only gate",
			current:    &stubUser{id: "u4", roles: []string{"editor"}},
			allowed:    []string{"admin"},
			wantStatus: http.StatusForbidden,
		},
		{
			// The planner split, as semantics rather than as a comment. planner
			// writes nets and PACE, whose gates name it, and must not reach the
			// waveform or equipment gates, which do not. Those two lists are
			// what radionet/routes.go and waveform/routes.go declare today.
			name:       "planner passes the nets and PACE gate",
			current:    &stubUser{id: "u7", roles: []string{"planner"}},
			allowed:    []string{"admin", "editor", "rto", "planner"},
			wantStatus: http.StatusOK,
		},
		{
			name:       "planner is forbidden from the catalog write gate",
			current:    &stubUser{id: "u8", roles: []string{"planner"}},
			allowed:    []string{"admin", "editor", "rto"},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "rto keeps both gates",
			current:    &stubUser{id: "u9", roles: []string{"rto"}},
			allowed:    []string{"admin", "editor", "rto"},
			wantStatus: http.StatusOK,
		},
		{
			name:       "unknown role is forbidden",
			current:    &stubUser{id: "u5", roles: []string{"not-a-real-role"}},
			allowed:    []string{"admin", "editor"},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "no roles at all is forbidden",
			current:    &stubUser{id: "u6", roles: nil},
			allowed:    []string{"admin", "editor"},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "no user in locals is unauthorized",
			current:    nil,
			allowed:    []string{"admin", "editor"},
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := appWithGate(t, tt.current, tt.allowed...)

			resp, err := app.Test(httptest.NewRequest(http.MethodPost, "/gated", nil))
			if err != nil {
				t.Fatalf("app.Test: %v", err)
			}
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode != tt.wantStatus {
				t.Errorf("status = %d, want %d", resp.StatusCode, tt.wantStatus)
			}
		})
	}
}

// TestRequireRole_DisabledIsPassThrough documents that ModeNone bypasses the
// gate entirely. This is why the route tests in the domain packages, which all
// use ModeNone, could not have caught a misordered gate.
func TestRequireRole_DisabledIsPassThrough(t *testing.T) {
	app := fiber.New()
	mw := middleware.NewAuthMiddleware(&auth.Config{Mode: auth.ModeNone}, nil)
	app.Post("/gated", mw.RequireRole("admin"), func(c fiber.Ctx) error {
		return c.SendString("reached handler")
	})

	resp, err := app.Test(httptest.NewRequest(http.MethodPost, "/gated", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want %d - ModeNone must bypass authorization", resp.StatusCode, http.StatusOK)
	}
}

// TestRequireRole_TrailingGateNeverRuns pins the Fiber semantics that caused a
// real authorization bypass in this repo: only Handlers[0] of a route is
// invoked, and the domain handlers terminate the chain instead of calling
// c.Next(). A gate registered after the handler is therefore dead code.
//
// This asserts the broken shape stays broken so nobody "tidies" the argument
// order back. The structural guard below is what enforces the correct shape.
func TestRequireRole_TrailingGateNeverRuns(t *testing.T) {
	app := fiber.New()
	app.Use(func(c fiber.Ctx) error {
		c.Locals(middleware.UserLocalsKey, &stubUser{id: "viewer", roles: []string{"viewer"}})
		return c.Next()
	})

	// Deliberately wrong order: handler first, gate second.
	app.Post("/gated",
		func(c fiber.Ctx) error { return c.SendString("reached handler") },
		enabledMiddleware().RequireRole("admin"),
	)

	resp, err := app.Test(httptest.NewRequest(http.MethodPost, "/gated", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	t.Log("confirmed: a trailing RequireRole does not execute - a viewer reached an admin-gated handler")
}

func handlerName(h fiber.Handler) string {
	return runtime.FuncForPC(reflect.ValueOf(h).Pointer()).Name()
}

// TestGatesPrecedeHandlers walks every route the application registers and
// asserts that where a RequireRole gate exists it is the FIRST handler.
//
// This is the regression guard for the bypass: it covers all domains at once,
// including any added later, without needing auth enabled or a database. The
// nil *Handler arguments are safe because taking a method value never
// dereferences the receiver, and these routes are inspected, never invoked.
func TestGatesPrecedeHandlers(t *testing.T) {
	app := fiber.New()
	mw := middleware.NewAuthMiddleware(&auth.Config{Mode: auth.ModeNone}, nil)

	terminal.RegisterRoutes(app, nil, mw)
	kit.RegisterRoutes(app, nil, mw)
	section.RegisterRoutes(app, nil, mw)
	contract.RegisterRoutes(app, nil, mw)
	equipment.RegisterRoutes(app, nil, mw)
	waveform.RegisterRoutes(app, nil, mw)
	satcomservice.RegisterRoutes(app, nil, mw)
	transport.RegisterRoutes(app, nil, mw)
	radionet.RegisterRoutes(app, nil, mw)
	pace.RegisterRoutes(app, nil, mw)
	user.RegisterRoutes(app, nil, mw)
	audit.RegisterRoutes(app, nil, mw)
	csvbulk.RegisterRoutes(app, nil, mw)

	gated := 0

	for _, route := range app.GetRoutes(true) {
		gateIdx := -1
		for i, h := range route.Handlers {
			if strings.Contains(handlerName(h), "RequireRole") {
				gateIdx = i
				break
			}
		}
		if gateIdx == -1 {
			continue // ungated route (reads, exports, templates)
		}
		gated++

		if gateIdx != 0 {
			names := make([]string, len(route.Handlers))
			for i, h := range route.Handlers {
				names[i] = handlerName(h)
			}
			t.Errorf(
				"%s %s: RequireRole is at index %d, must be 0 - Fiber runs only Handlers[0], "+
					"so a gate behind the handler never executes\n  handlers: %s",
				route.Method, route.Path, gateIdx, strings.Join(names, "\n            "),
			)
		}
	}

	// Guards against the walk silently covering nothing - if route registration
	// changes shape, a zero count would make this test vacuously pass.
	if gated == 0 {
		t.Fatal("found no gated routes to check; the route walk is not working")
	}
	t.Logf("verified %d gated routes run authorization first", gated)
}

// TestPlannerReachesOnlyItsOwnDomains probes each route's OWN gate closure with a
// planner user, so it reads the role list the route file declares rather than a
// list restated here.
//
// Registering against an ENFORCING middleware is what makes that possible: the
// gate sitting at Handlers[0] is then the real closure over the domain's own
// literal. Probing it on a throwaway app, rather than issuing a request to the
// real one, is what keeps RequireAuth out of the way - the two share one mode
// switch, so an enforcing gate also means every unauthenticated request 401s
// before reaching it.
//
// The table cases in TestRequireRole document these semantics but cannot pin
// them: they call RequireRole with a literal, so reverting radionet/routes.go to
// the bundled gate leaves them green. This one goes red.
func TestPlannerReachesOnlyItsOwnDomains(t *testing.T) {
	app := fiber.New()
	mw := middleware.NewAuthMiddleware(&auth.Config{Mode: auth.ModeAzure}, nil)

	terminal.RegisterRoutes(app, nil, mw)
	kit.RegisterRoutes(app, nil, mw)
	section.RegisterRoutes(app, nil, mw)
	contract.RegisterRoutes(app, nil, mw)
	equipment.RegisterRoutes(app, nil, mw)
	waveform.RegisterRoutes(app, nil, mw)
	satcomservice.RegisterRoutes(app, nil, mw)
	transport.RegisterRoutes(app, nil, mw)
	radionet.RegisterRoutes(app, nil, mw)
	pace.RegisterRoutes(app, nil, mw)
	user.RegisterRoutes(app, nil, mw)
	audit.RegisterRoutes(app, nil, mw)
	csvbulk.RegisterRoutes(app, nil, mw)

	admitsPlanner := func(gate fiber.Handler) bool {
		probe := fiber.New()
		probe.Use(func(c fiber.Ctx) error {
			c.Locals(middleware.UserLocalsKey, &stubUser{id: "p1", roles: []string{"planner"}})
			return c.Next()
		})
		probe.Post("/probe", gate, func(c fiber.Ctx) error { return c.SendString("reached") })

		resp, err := probe.Test(httptest.NewRequest(http.MethodPost, "/probe", nil))
		if err != nil {
			t.Fatalf("probe request: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()
		return resp.StatusCode == http.StatusOK
	}

	// What a planner writes. Every other gated route is off limits, including
	// the catalog it only reads.
	//
	// Transports belong here rather than with the catalog because a transport is
	// a path a PACE tier names - TierSourceTransport in pace/model.go is its
	// only consumer, and nothing in domain/equipment references transports at
	// all. A planner who can build the card but not add the path it names is the
	// gap this list used to encode.
	plannerPrefixes := []string{"/api/v1/nets", "/api/v1/pace", "/api/v1/transports"}

	allowed, denied := 0, 0
	for _, route := range app.GetRoutes(true) {
		var gate fiber.Handler
		for _, h := range route.Handlers {
			if strings.Contains(handlerName(h), "RequireRole") {
				gate = h
				break
			}
		}
		if gate == nil {
			continue // ungated: reads, exports, templates
		}

		want := false
		for _, prefix := range plannerPrefixes {
			if strings.HasPrefix(route.Path, prefix) {
				want = true
				break
			}
		}

		got := admitsPlanner(gate)
		if got != want {
			t.Errorf("%s %s: admits planner = %v, want %v",
				route.Method, route.Path, got, want)
		}
		if want {
			allowed++
		} else {
			denied++
		}
	}

	// Vacuous-pass guards, matching the other walks in this file. Either count
	// falling to zero means the walk stopped seeing the thing it checks.
	if allowed == 0 {
		t.Fatal("no planner-writable gated routes found; the walk is not working")
	}
	if denied == 0 {
		t.Fatal("no planner-denied gated routes found; the walk is not working")
	}
	t.Logf("planner admitted on %d gated routes, denied on %d", allowed, denied)
}

// ungatedWrites lists the write routes that deliberately carry no RequireRole.
// An entry needs a reason, because an unexplained one is a hole in
// authorization. "Ungated" here means no ROLE gate, not unauthorized.
var ungatedWrites = map[string]bool{
	// Both are reads. POST only because a nine-dataset column selection does not
	// fit in a query string next to a Bearer token - see csvbulk.BundleRequest.
	// Every dataset they reach is behind RequireAuth and nothing more, which
	// TestExportRoutesAreAuthOnly keeps true.
	"POST /api/v1/export/bundle":   true,
	"POST /api/v1/template/bundle": true,
	// Authorized by ownership, not by role: canAccessUser in the handler allows
	// the caller's own record or an admin. RequireRole cannot express "your own
	// record", so a role gate here would either lock every non-admin out of
	// their own preferences or let any role edit anyone's.
	"PATCH /api/v1/users/:id/preferences": true,
}

// TestEveryWriteRouteIsGated is the companion to TestGatesPrecedeHandlers, which
// checks only the ORDER of gates that exist. It skips a route with no gate at
// all, so it cannot catch the failure this repo has actually hit: a write route
// registered without RequireRole, which is not a misordered gate but no gate.
//
// Reads are deliberately not checked. Any authenticated user may read, so a GET
// without RequireRole is correct, not an oversight.
func TestEveryWriteRouteIsGated(t *testing.T) {
	app := fiber.New()
	mw := middleware.NewAuthMiddleware(&auth.Config{Mode: auth.ModeNone}, nil)

	terminal.RegisterRoutes(app, nil, mw)
	kit.RegisterRoutes(app, nil, mw)
	section.RegisterRoutes(app, nil, mw)
	contract.RegisterRoutes(app, nil, mw)
	equipment.RegisterRoutes(app, nil, mw)
	waveform.RegisterRoutes(app, nil, mw)
	satcomservice.RegisterRoutes(app, nil, mw)
	transport.RegisterRoutes(app, nil, mw)
	radionet.RegisterRoutes(app, nil, mw)
	pace.RegisterRoutes(app, nil, mw)
	user.RegisterRoutes(app, nil, mw)
	audit.RegisterRoutes(app, nil, mw)
	csvbulk.RegisterRoutes(app, nil, mw)

	writes := 0

	for _, route := range app.GetRoutes(true) {
		switch route.Method {
		case fiber.MethodPost, fiber.MethodPut, fiber.MethodPatch, fiber.MethodDelete:
		default:
			continue
		}

		key := route.Method + " " + route.Path
		if ungatedWrites[key] {
			continue
		}
		writes++

		hasGate := false
		for _, h := range route.Handlers {
			if strings.Contains(handlerName(h), "RequireRole") {
				hasGate = true
				break
			}
		}
		if !hasGate {
			t.Errorf(
				"%s has no RequireRole handler - every write must be gated. If this one "+
					"genuinely should not be, add it to ungatedWrites with a reason.",
				key,
			)
		}
	}

	if writes == 0 {
		t.Fatal("found no write routes to check; the route walk is not working")
	}
	t.Logf("verified %d write routes carry an authorization gate", writes)
}

// TestImportTemplatesAreReachableWithoutAuth issues a real unauthenticated
// request at every import-template route and asserts none of them answers 401.
//
// It has to be a request, not a walk over app.GetRoutes(). A group's Use() is
// matched by path PREFIX at request time and does not appear in the Handlers
// slice of a route registered on the raw app, so route introspection cannot see
// this class of bug at all - I wrote that version first and it passed with the
// bug deliberately reintroduced.
//
// The bug it exists for: registering /api/v1/terminals/import/template on the
// raw app is NOT enough. It must be registered before
// app.Group("/api/v1/terminals").Use(RequireAuth), or the group's middleware
// gates it anyway. An earlier release shipped exactly that: the route existed, the handler
// was right, every test passed, and production answered 401 - which read as a
// missing route rather than a gated one.
//
// Mode must be ModeAzure, not ModeNone: RequireAuth is a pass-through when auth
// is disabled, so under ModeNone every route looks open and the test is vacuous.
func TestImportTemplatesAreReachableWithoutAuth(t *testing.T) {
	app := fiber.New()

	// The handlers are nil, so a request that gets past the gate nil-derefs.
	// That is the signal we want - recover turns it into a 500, and a 500 means
	// "reached the handler", which is exactly what an ungated route should do.
	app.Use(recover.New())

	mw := middleware.NewAuthMiddleware(&auth.Config{Mode: auth.ModeAzure}, nil)

	terminal.RegisterRoutes(app, nil, mw)
	kit.RegisterRoutes(app, nil, mw)
	section.RegisterRoutes(app, nil, mw)
	contract.RegisterRoutes(app, nil, mw)
	equipment.RegisterRoutes(app, nil, mw)
	waveform.RegisterRoutes(app, nil, mw)
	satcomservice.RegisterRoutes(app, nil, mw)
	transport.RegisterRoutes(app, nil, mw)
	radionet.RegisterRoutes(app, nil, mw)
	pace.RegisterRoutes(app, nil, mw)
	user.RegisterRoutes(app, nil, mw)
	audit.RegisterRoutes(app, nil, mw)
	csvbulk.RegisterRoutes(app, nil, mw)

	var paths []string
	for _, route := range app.GetRoutes(true) {
		if route.Method == fiber.MethodGet && strings.HasSuffix(route.Path, "/import/template") {
			paths = append(paths, route.Path)
		}
	}

	// Vacuous-pass guard, matching the other walks in this file.
	if len(paths) < 7 {
		t.Fatalf("only %d import-template routes found; expected at least 7 (one per importable domain): %v",
			len(paths), paths)
	}

	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, path, nil))
			if err != nil {
				t.Fatalf("request: %v", err)
			}
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode == fiber.StatusUnauthorized {
				t.Errorf(
					"GET %s answered 401 with no token, so this template is gated.\n"+
						"  Register it on the raw app BEFORE the group whose prefix covers it calls\n"+
						"  Use(RequireAuth). Being on the raw app is not sufficient: Fiber matches a\n"+
						"  group's Use by path prefix in registration order.",
					path)
			}
		})
	}
}

// TestExportAndImportRoutesAreGated is the inverse of the template test above:
// it asserts every export, import and bundle route DOES answer 401 without a
// token.
//
// Nothing asserted this before. TestExportRoutesAreAuthOnly checks only for the
// ABSENCE of a role gate, by handler-name introspection, and its own doc concedes
// introspection cannot see a group's Use. So deleting auth.RequireAuth() from
// app.Get("/api/v1/export/waveforms", ...) left the entire suite green while
// serving the whole waveform library anonymously. There was no StatusUnauthorized
// assertion anywhere in the backend outside this file and role_test.go.
//
// Like the template test, this has to be a real request rather than a walk, and
// Mode must be ModeAzure - under ModeNone RequireAuth is a pass-through and every
// route looks open, which makes the test vacuous.
func TestExportAndImportRoutesAreGated(t *testing.T) {
	app := fiber.New()

	// Handlers are nil, so anything reaching one nil-derefs into a recovered 500.
	// 500 therefore means "got past the gate", which is the failure we are hunting.
	app.Use(recover.New())

	mw := middleware.NewAuthMiddleware(&auth.Config{Mode: auth.ModeAzure}, nil)

	terminal.RegisterRoutes(app, nil, mw)
	kit.RegisterRoutes(app, nil, mw)
	section.RegisterRoutes(app, nil, mw)
	contract.RegisterRoutes(app, nil, mw)
	equipment.RegisterRoutes(app, nil, mw)
	waveform.RegisterRoutes(app, nil, mw)
	satcomservice.RegisterRoutes(app, nil, mw)
	transport.RegisterRoutes(app, nil, mw)
	radionet.RegisterRoutes(app, nil, mw)
	pace.RegisterRoutes(app, nil, mw)
	user.RegisterRoutes(app, nil, mw)
	audit.RegisterRoutes(app, nil, mw)
	csvbulk.RegisterRoutes(app, nil, mw)

	type target struct{ method, path string }
	var targets []target

	for _, route := range app.GetRoutes(true) {
		// Match on a trailing-slash-free copy, but keep route.Path for the
		// request itself so it still hits what Fiber actually registered.
		//
		// Six importers are registered as a subpath - kits.Post("/import", ...)
		// gives /api/v1/kits/import. Terminal's two are not: both go through a
		// group whose method call is .Post("/"), which registers
		// /api/v1/import/ and /api/v1/terminals/import/ WITH a trailing slash.
		// Matching route.Path directly therefore skipped the one domain that
		// carries a legacy path, and the guard below was calibrated to the
		// short count, so nothing failed.
		match := strings.TrimSuffix(route.Path, "/")

		// The eight import templates are deliberately open - that is what
		// TestImportTemplatesAreReachableWithoutAuth pins. Everything else under
		// export, import and the two bundles must be gated.
		if strings.HasSuffix(match, "/import/template") {
			continue
		}

		gated := strings.HasPrefix(match, "/api/v1/export/") ||
			strings.HasSuffix(match, "/import") ||
			match == "/api/v1/template/bundle"
		if !gated {
			continue
		}

		targets = append(targets, target{route.Method, route.Path})
	}

	// Vacuous-pass guard, matching the other walks in this file. Nine exports,
	// eight imports and the two bundles.
	if len(targets) < 19 {
		t.Fatalf("only %d export/import routes found; expected at least 19: %v", len(targets), targets)
	}

	for _, tgt := range targets {
		t.Run(tgt.method+" "+tgt.path, func(t *testing.T) {
			// A :param never matches its own literal, so substitute one.
			path := strings.ReplaceAll(tgt.path, ":section", "asqd")
			path = strings.ReplaceAll(path, ":id", "00000000-0000-0000-0000-000000000000")

			resp, err := app.Test(httptest.NewRequest(tgt.method, path, nil))
			if err != nil {
				t.Fatalf("request: %v", err)
			}
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode != fiber.StatusUnauthorized {
				t.Errorf(
					"%s %s answered %d with no token, want 401.\n"+
						"  This route reads or writes real data and must carry auth.RequireAuth().\n"+
						"  A 500 here means the request reached a nil handler, i.e. no gate ran at all.",
					tgt.method, path, resp.StatusCode)
			}
		})
	}
}

// TestExportRoutesAreAuthOnly fails if any export route gains a RequireRole gate.
//
// The bundle endpoint reaches every dataset behind a single RequireAuth. That is
// exactly equivalent to what a caller could get by issuing nine separate GETs
// TODAY, because every export is RequireAuth and nothing more and no Export*
// method filters rows by caller identity. Both halves of that were checked by
// reading all nine routes.go and all nine service methods.
//
// It is a fact with an expiry date. The moment someone adds a role gate to a
// single export, the bundle silently bypasses it - so this fails first and makes
// that a deliberate decision rather than an accident.
func TestExportRoutesAreAuthOnly(t *testing.T) {
	app := fiber.New()
	mw := middleware.NewAuthMiddleware(&auth.Config{Mode: auth.ModeNone}, nil)

	terminal.RegisterRoutes(app, nil, mw)
	kit.RegisterRoutes(app, nil, mw)
	contract.RegisterRoutes(app, nil, mw)
	equipment.RegisterRoutes(app, nil, mw)
	waveform.RegisterRoutes(app, nil, mw)
	satcomservice.RegisterRoutes(app, nil, mw)
	transport.RegisterRoutes(app, nil, mw)
	radionet.RegisterRoutes(app, nil, mw)
	pace.RegisterRoutes(app, nil, mw)
	csvbulk.RegisterRoutes(app, nil, mw)

	checked := 0
	for _, route := range app.GetRoutes(true) {
		if !strings.Contains(route.Path, "/export/") {
			continue
		}
		checked++
		for _, h := range route.Handlers {
			if strings.Contains(handlerName(h), "RequireRole") {
				t.Errorf(
					"%s %s carries RequireRole.\n"+
						"  The bundle endpoint reaches every dataset behind one RequireAuth, so a\n"+
						"  per-dataset role gate it does not know about is a hole rather than a\n"+
						"  restriction. Teach csvbulk about the gate, or drop it here.",
					route.Method, route.Path)
				break
			}
		}
	}

	if checked < 9 {
		t.Fatalf("only %d export routes found; expected at least 9 (one per domain plus the bundle)", checked)
	}
}

// TestEveryDataRouteRequiresAuth is the general form of
// TestExportAndImportRoutesAreGated, which pins only the CSV surface: nine
// exports, eight imports and the two bundles. The primary read surface - the
// list and detail routes every page actually calls - had no 401 assertion
// anywhere in the backend. Before this test, grepping the whole backend for
// StatusUnauthorized found hits in one file, and all of them were on CSV paths.
//
// That is the larger hole of the two, because it is the larger data surface.
// That bug was a route registered on the raw app before the group whose
// prefix covers it called Use(RequireAuth). Route introspection cannot see a
// group's Use at all - TestImportTemplatesAreReachableWithoutAuth says so above,
// having been written that way first and passed with the bug deliberately
// present - so registering GET /api/v1/terminals the same wrong way would serve
// the entire terminal inventory anonymously with every existing test green.
//
// Everything except the import templates is in scope. Those are the one
// deliberate exception, and the test directly above pins them open, so the two
// tests together assert the full partition rather than leaving a middle ground
// where a route is checked by neither.
//
// Mode must be ModeAzure, not ModeNone: RequireAuth is a pass-through when auth
// is disabled, so under ModeNone every route looks open and this passes vacuously.
func TestEveryDataRouteRequiresAuth(t *testing.T) {
	app := fiber.New()

	// Handlers are nil, so anything reaching one nil-derefs into a recovered 500.
	// A 500 therefore means "got past the gate", which is the failure being hunted.
	app.Use(recover.New())

	mw := middleware.NewAuthMiddleware(&auth.Config{Mode: auth.ModeAzure}, nil)

	terminal.RegisterRoutes(app, nil, mw)
	kit.RegisterRoutes(app, nil, mw)
	section.RegisterRoutes(app, nil, mw)
	contract.RegisterRoutes(app, nil, mw)
	equipment.RegisterRoutes(app, nil, mw)
	waveform.RegisterRoutes(app, nil, mw)
	satcomservice.RegisterRoutes(app, nil, mw)
	transport.RegisterRoutes(app, nil, mw)
	radionet.RegisterRoutes(app, nil, mw)
	pace.RegisterRoutes(app, nil, mw)
	user.RegisterRoutes(app, nil, mw)
	audit.RegisterRoutes(app, nil, mw)
	csvbulk.RegisterRoutes(app, nil, mw)

	type target struct{ method, path string }
	var targets []target

	for _, route := range app.GetRoutes(true) {
		// HEAD is synthesised by Fiber for every GET and shares the GET's
		// handler chain, so checking it asserts nothing the GET does not.
		if route.Method == fiber.MethodHead {
			continue
		}
		// Trailing-slash-free copy for matching, real route.Path for the
		// request, for the reason TestExportAndImportRoutesAreGated documents:
		// terminal's importers register with a trailing slash and matching
		// route.Path directly silently skips them.
		if strings.HasSuffix(strings.TrimSuffix(route.Path, "/"), "/import/template") {
			continue
		}
		targets = append(targets, target{route.Method, route.Path})
	}

	// Vacuous-pass guard, matching the other walks in this file. Well below the
	// real count, which is logged below, so adding a domain does not force an
	// edit here - this only has to catch registration returning nothing.
	if len(targets) < 40 {
		t.Fatalf("only %d routes found to check; expected at least 40", len(targets))
	}

	for _, tgt := range targets {
		t.Run(tgt.method+" "+tgt.path, func(t *testing.T) {
			// A :param never matches its own literal, so substitute one.
			path := strings.ReplaceAll(tgt.path, ":section", "asqd")
			path = strings.ReplaceAll(path, ":id", "00000000-0000-0000-0000-000000000000")
			path = strings.ReplaceAll(path, ":key", "asqd")

			resp, err := app.Test(httptest.NewRequest(tgt.method, path, nil))
			if err != nil {
				t.Fatalf("request: %v", err)
			}
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode != fiber.StatusUnauthorized {
				t.Errorf(
					"%s %s answered %d with no token, want 401.\n"+
						"  Every route except an import template serves or accepts real data and\n"+
						"  must sit behind auth.RequireAuth(). A 500 means the request reached a nil\n"+
						"  handler, so no gate ran at all - most likely the route is registered on\n"+
						"  the raw app before the group whose prefix covers it calls Use(RequireAuth).",
					tgt.method, path, resp.StatusCode)
			}
		})
	}

	t.Logf("verified %d routes require authentication", len(targets))
}

// TestTransportWritersReachTheHandler drives a real request through the gate
// the route declares and into the handler behind it, for every role.
//
// It exists because everything above it stops at the gate. TestRequireRole
// calls RequireRole with a literal; TestPlannerReachesOnlyItsOwnDomains probes
// the route's own closure without invoking what sits behind it; the domain
// route tests run under ModeNone, where the gate is a pass-through. So when the
// transport gate changed to PACE's writer set, nothing would have caught the
// handler refusing a request the gate had just allowed.
//
// The gate is LIFTED OUT of the registered route rather than restated here, for
// the same reason TestPlannerReachesOnlyItsOwnDomains does it: a test that
// retypes the role list passes whatever the route says, including the wrong
// thing. Remounting it on a throwaway app in front of the handler is also what
// keeps RequireAuth out of the way - the two share one mode switch, so an
// enforcing gate otherwise means every tokenless request 401s before reaching
// it.
//
// transport.MockRepository lives outside _test.go precisely so another package
// can build this stack: no database, no container, no fixtures.
func TestTransportWritersReachTheHandler(t *testing.T) {
	// The gate as transport/routes.go declares it, read once.
	probe := fiber.New()
	transport.RegisterRoutes(probe, nil, enabledMiddleware())
	var gate fiber.Handler
	for _, route := range probe.GetRoutes(true) {
		if route.Method != http.MethodPost || route.Path != "/api/v1/transports/" {
			continue
		}
		for _, h := range route.Handlers {
			if strings.Contains(handlerName(h), "RequireRole") {
				gate = h
			}
		}
	}
	if gate == nil {
		t.Fatal("no RequireRole gate found on POST /api/v1/transports - the route shape changed")
	}

	tests := []struct {
		role       string
		wantStatus int
		wantCreate bool
	}{
		// A transport is a path a PACE tier names, so every role that builds a
		// card may add one. rto and planner are the two this change admitted.
		{role: "admin", wantStatus: http.StatusCreated, wantCreate: true},
		{role: "editor", wantStatus: http.StatusCreated, wantCreate: true},
		{role: "rto", wantStatus: http.StatusCreated, wantCreate: true},
		{role: "planner", wantStatus: http.StatusCreated, wantCreate: true},
		// The one role left reading. Refused at the gate, so the repository is
		// never reached - which is the half a gate-only test cannot show.
		{role: "viewer", wantStatus: http.StatusForbidden, wantCreate: false},
	}

	for _, tt := range tests {
		t.Run(tt.role, func(t *testing.T) {
			created := false
			repo := &transport.MockRepository{
				NameExistsFunc: func(_ context.Context, _ string) (bool, error) { return false, nil },
				CreateFunc: func(_ context.Context, _ *transport.Transport) error {
					created = true
					return nil
				},
			}
			handler := transport.NewHandler(transport.NewService(repo), validator.New())

			app := fiber.New()
			app.Post("/api/v1/transports",
				func(c fiber.Ctx) error {
					c.Locals(middleware.UserLocalsKey, &stubUser{id: "u-" + tt.role, roles: []string{tt.role}})
					return c.Next()
				},
				gate,
				handler.CreateTransport,
			)

			body := strings.NewReader(`{"name":"Verizon LTE","kind":"cellular","provider":"Verizon","description":"commercial cellular"}`)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/transports", body)
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req)
			if err != nil {
				t.Fatalf("request: %v", err)
			}
			defer func() { _ = resp.Body.Close() }()

			if resp.StatusCode != tt.wantStatus {
				t.Errorf("POST /api/v1/transports as %s = %d, want %d", tt.role, resp.StatusCode, tt.wantStatus)
			}
			if created != tt.wantCreate {
				t.Errorf("repository Create called = %v as %s, want %v", created, tt.role, tt.wantCreate)
			}
		})
	}
}

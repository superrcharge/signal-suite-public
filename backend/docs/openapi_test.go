// Package docs_test is an external test package so it can import the domain
// packages to register real routes. Nothing imports docs, so there is no cycle
// to work around here, unlike middleware_test.
package docs_test

import (
	"encoding/json"
	"slices"
	"sort"
	"strings"
	"testing"

	"backend/docs"
	"backend/internal/csvbulk"
	"backend/internal/domain/audit"
	"backend/internal/domain/contract"
	"backend/internal/domain/equipment"
	"backend/internal/domain/kit"
	"backend/internal/domain/pace"
	"backend/internal/domain/platform"
	"backend/internal/domain/radionet"
	"backend/internal/domain/satcomservice"
	"backend/internal/domain/section"
	"backend/internal/domain/terminal"
	"backend/internal/domain/transport"
	"backend/internal/domain/user"
	"backend/internal/domain/waveform"
	"backend/internal/middleware"
	"backend/internal/shared/assetstatus"

	"github.com/gofiber/fiber/v3"
)

// undocumented lists paths that are deliberately absent from the spec. An entry
// needs a reason, for the same reason csv-manifest.json demands one: "we meant
// to" and "nobody noticed" are indistinguishable in a diff a year later.
var undocumented = map[string]string{}

// TestEveryRouteIsDocumented fails when a registered route has no matching
// operation (method and path) in openapi.json.
//
// An earlier pull request fixed the CSV half of this after the spec had drifted to documenting
// three of nine export routes. Writing this test showed the drift was wider
// than that: ten more routes were undocumented, including the entire CRUD
// surface for equipment, transports and waveforms, the audit list, both binary
// uploads and the role endpoint. Reviewing the export paths by hand had made
// the spec look complete, which is exactly why the check needs to be mechanical.
//
// A missing spec entry breaks no build and fails no test, so nothing else here
// would ever have reported it.
//
// This is the same guard csvregistry already applies to the generated frontend
// column manifest, and it exists for the same reason: the CSV columns drifted
// for months before that test was written.
func TestEveryRouteIsDocumented(t *testing.T) {
	documented := documentedPaths(t)
	registered := registeredPaths(t)

	// Vacuous-pass guard. If route registration or spec parsing silently returns
	// nothing, every assertion below passes while checking nothing at all.
	if len(registered) < 40 {
		t.Fatalf("only %d routes registered; expected at least 40", len(registered))
	}
	if len(documented) < 40 {
		t.Fatalf("only %d paths in openapi.json; expected at least 40", len(documented))
	}

	var missing []string
	for _, path := range registered {
		if _, ok := documented[path]; ok {
			continue
		}
		if _, excused := undocumented[path]; excused {
			continue
		}
		missing = append(missing, path)
	}

	if len(missing) > 0 {
		sort.Strings(missing)
		t.Errorf(
			"%d operation(s) registered but absent from docs/openapi.json:\n  %s\n\n"+
				"Add each to the spec, or add it to the `undocumented` map in this file\n"+
				"with the reason it is deliberately not documented.",
			len(missing), strings.Join(missing, "\n  "))
	}
}

// TestSpecDocumentsNoRouteThatIsGone is the inverse: a path in the spec that no
// longer exists. A renamed route otherwise leaves its old entry behind forever,
// and a spec describing an endpoint that 404s is worse than one with a gap,
// because a reader has no way to tell which entries are real.
func TestSpecDocumentsNoRouteThatIsGone(t *testing.T) {
	documented := documentedPaths(t)
	registered := make(map[string]struct{}, len(documented))
	for _, p := range registeredPaths(t) {
		registered[p] = struct{}{}
	}

	var stale []string
	for path := range documented {
		if _, ok := registered[path]; !ok {
			stale = append(stale, path)
		}
	}

	if len(stale) > 0 {
		sort.Strings(stale)
		t.Errorf(
			"%d operation(s) in docs/openapi.json match no registered route:\n  %s\n\n"+
				"Remove them, or correct the path if the route was renamed.",
			len(stale), strings.Join(stale, "\n  "))
	}
}

// statusSchemas names every schema node in openapi.json whose status property
// restates the asset status vocabulary.
//
// These six are the one part of that vocabulary that cannot derive from
// assetstatus.Valid, for the same reason the DTO `oneof` struct tags cannot:
// the spec is a static JSON document, so the values are hand-typed literals.
// assetstatus_test.go reflects over the struct tags; this does the equivalent
// for the spec, because TestEveryRouteIsDocumented checks route paths only and
// would not notice an enum drifting from what the server enforces.
var statusSchemas = []string{
	"KitResponse",
	"CreateKitRequest",
	"UpdateKitRequest",
	"TerminalResponse",
	"CreateTerminalRequest",
	"UpdateTerminalRequest",
}

// TestStatusEnumsMatchAssetStatus fails when any of those six enums differs
// from assetstatus.Valid.
//
// Order matters and the comparison is deliberately order-sensitive: Valid is
// documented as holding the seven values "in the order the CSV template and the
// API documentation list them", so a reordered enum is drift too.
func TestStatusEnumsMatchAssetStatus(t *testing.T) {
	raw, err := docs.GetOpenAPISpec()
	if err != nil {
		t.Fatalf("read embedded spec: %v", err)
	}

	var spec struct {
		Components struct {
			Schemas map[string]struct {
				Properties struct {
					Status struct {
						Enum []string `json:"enum"`
					} `json:"status"`
				} `json:"properties"`
			} `json:"schemas"`
		} `json:"components"`
	}
	if err := json.Unmarshal(raw, &spec); err != nil {
		t.Fatalf("parse spec: %v", err)
	}

	for _, name := range statusSchemas {
		schema, ok := spec.Components.Schemas[name]
		if !ok {
			// Vacuous-pass guard. A renamed or removed schema must fail loudly
			// rather than quietly leaving one fewer thing checked.
			t.Errorf("%s: no such schema in openapi.json", name)
			continue
		}

		got := schema.Properties.Status.Enum
		if len(got) == 0 {
			// The other half of the same guard: a reshaped spec that no longer
			// puts the enum where this test looks would otherwise pass.
			t.Errorf("%s: status has no enum", name)
			continue
		}

		if !slices.Equal(got, assetstatus.Valid) {
			t.Errorf("%s: status enum is %v, want %v", name, got, assetstatus.Valid)
		}
	}
}

// documentedPaths reads the embedded spec and returns one "METHOD /path" per
// operation, normalised to the form registeredPaths produces.
func documentedPaths(t *testing.T) map[string]struct{} {
	t.Helper()

	raw, err := docs.GetOpenAPISpec()
	if err != nil {
		t.Fatalf("read embedded spec: %v", err)
	}

	var spec struct {
		Servers []struct {
			URL string `json:"url"`
		} `json:"servers"`
		Paths map[string]map[string]json.RawMessage `json:"paths"`
	}
	if err := json.Unmarshal(raw, &spec); err != nil {
		t.Fatalf("parse spec: %v", err)
	}

	// Spec paths are relative to the server URL (/api/v1), so the prefix has to
	// be put back before comparing against what Fiber registered. Read from the
	// spec rather than hardcoded, so moving to /api/v2 does not silently make
	// every comparison fail to match and report the whole API as undocumented.
	base := ""
	if len(spec.Servers) > 0 {
		base = strings.TrimSuffix(spec.Servers[0].URL, "/")
	}

	// One entry per operation, not per path. Comparing paths alone let a
	// `post` sit under /users for months with no handler behind it: the path
	// existed (GET), so the stale method was invisible to both tests.
	out := make(map[string]struct{}, len(spec.Paths))
	for p, ops := range spec.Paths {
		for m := range ops {
			switch m {
			case "get", "post", "put", "patch", "delete":
				out[strings.ToUpper(m)+" "+normalise(base+p)] = struct{}{}
			}
		}
	}
	return out
}

// registeredPaths builds the real route table and returns one "METHOD /path"
// per route.
func registeredPaths(t *testing.T) []string {
	t.Helper()

	app := fiber.New()

	// Handlers are nil. Nothing here dispatches a request, only inspects the
	// route table, so a nil handler is never called.
	mw := middleware.NewAuthMiddleware(nil, nil)

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
	platform.RegisterRoutes(app, nil, mw)
	user.RegisterRoutes(app, nil, mw)
	audit.RegisterRoutes(app, nil, mw)
	csvbulk.RegisterRoutes(app, nil, mw)

	seen := make(map[string]struct{})
	var out []string
	for _, r := range app.GetRoutes(true) {
		// HEAD is synthesised by Fiber for every GET and is not something a spec
		// documents separately.
		if r.Method == fiber.MethodHead {
			continue
		}
		p := normalise(r.Path)
		if p == "" {
			continue
		}
		key := r.Method + " " + p
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

// normalise reconciles the two path dialects: Fiber writes parameters as
// :name, OpenAPI writes them as {name}. Trailing slashes are dropped because a
// group whose method call is .Post("/") registers with one and the spec never
// carries one - the same trailing-slash mismatch that hid two terminal import
// routes from the authz walk in an earlier release.
func normalise(p string) string {
	var b strings.Builder
	for _, seg := range strings.Split(p, "/") {
		if seg == "" {
			continue
		}
		if strings.HasPrefix(seg, ":") {
			b.WriteString("/{" + strings.TrimPrefix(seg, ":") + "}")
			continue
		}
		if strings.HasPrefix(seg, "{") && strings.HasSuffix(seg, "}") {
			b.WriteString("/" + seg)
			continue
		}
		b.WriteString("/" + seg)
	}
	return b.String()
}

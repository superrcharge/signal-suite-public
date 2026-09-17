package main

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// Transports and Waveforms shipped for eight releases performing create, update
// and delete with no audit record at all, while the other nine domains recorded
// every mutation. Nothing reported it: the code compiles, every test passes, and
// the only observable symptom is an audit log that is quietly missing rows
// nobody knows to look for. The same silence is what let the CSV column
// manifest and the OpenAPI spec drift for months.
//
// So the check is mechanical and reads the sources at runtime rather than
// comparing against a list written by hand. A domain added next month is covered
// without anyone remembering to extend this file, which is the property that
// matters - a hand-maintained list fails exactly when someone forgets, which is
// the same moment the wiring is forgotten.

// notAuditable lists domains that may mutate without recording. An entry needs a
// reason, for the same reason csv-manifest.json and the `undocumented` map in
// docs/openapi_test.go demand one: "deliberate" and "nobody noticed" are
// indistinguishable in a diff a year later.
var notAuditable = map[string]string{
	"audit": "audit is the recorder itself; recording its own writes would recurse",
}

var (
	mutatingMethod = regexp.MustCompile(`(?m)^func \([a-z]+ \*Service\) (Create|Update|Delete)[A-Za-z]*\(`)
	setAuditDecl   = regexp.MustCompile(`(?m)^func \([a-z]+ \*Service\) SetAudit\(`)
	setAuditCall   = regexp.MustCompile(`\.SetAudit\(auditService\)`)
)

// domainSources returns each domain's non-test Go source, concatenated.
func domainSources(t *testing.T) map[string]string {
	t.Helper()

	entries, err := os.ReadDir("internal/domain")
	if err != nil {
		t.Fatalf("read domain dir: %v", err)
	}

	out := map[string]string{}
	for _, e := range entries {
		if !e.IsDir() {
			continue // csv-manifest.json
		}
		paths, err := filepath.Glob(filepath.Join("internal/domain", e.Name(), "*.go"))
		if err != nil {
			t.Fatalf("glob %s: %v", e.Name(), err)
		}
		var b strings.Builder
		for _, p := range paths {
			if strings.HasSuffix(p, "_test.go") {
				continue
			}
			raw, err := os.ReadFile(p)
			if err != nil {
				t.Fatalf("read %s: %v", p, err)
			}
			b.Write(raw)
			b.WriteString("\n")
		}
		out[e.Name()] = b.String()
	}

	// Vacuous-pass guard. A glob that silently matches nothing would make every
	// assertion below pass while checking no domain at all.
	if len(out) < 10 {
		t.Fatalf("found %d domains, expected at least 10", len(out))
	}
	return out
}

// TestEveryMutatingDomainCanRecordAudit is the first half: a domain whose
// service creates, updates or deletes must be able to record it.
func TestEveryMutatingDomainCanRecordAudit(t *testing.T) {
	var missing []string

	for domain, src := range domainSources(t) {
		if reason, excused := notAuditable[domain]; excused {
			if reason == "" {
				t.Errorf("%s is in notAuditable with an empty reason", domain)
			}
			continue
		}
		if !mutatingMethod.MatchString(src) {
			continue // read-only domain
		}
		if !setAuditDecl.MatchString(src) {
			missing = append(missing, domain)
		}
	}

	if len(missing) > 0 {
		sort.Strings(missing)
		t.Errorf(
			"%d domain(s) mutate state but declare no SetAudit, so every create, "+
				"update and delete they perform is unrecorded:\n  %s\n\n"+
				"Add `func (s *Service) SetAudit(a contracts.AuditRecorder)` plus a\n"+
				"recordAudit call on each mutation, mirroring satcomservice, and wire it\n"+
				"in main.go. If the domain genuinely must not record, add it to\n"+
				"notAuditable with the reason.",
			len(missing), strings.Join(missing, "\n  "))
	}
}

// TestEveryAuditableDomainIsWired is the second half, and the one a
// compile-time interface assertion cannot cover: a service can have a perfectly
// good SetAudit method that main.go never calls, in which case audit stays nil
// and recordAudit returns silently on every write. That failure is invisible -
// nil-tolerance is deliberate so unit tests need no recorder, which means a
// forgotten wiring behaves exactly like a passing test.
func TestEveryAuditableDomainIsWired(t *testing.T) {
	declared := 0
	for _, src := range domainSources(t) {
		if setAuditDecl.MatchString(src) {
			declared++
		}
	}

	raw, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	wired := len(setAuditCall.FindAllString(string(raw), -1))

	if declared == 0 {
		t.Fatal("no domain declares SetAudit; the source scan is not working")
	}
	if wired != declared {
		t.Errorf(
			"%d domain services declare SetAudit but main.go makes %d "+
				"SetAudit(auditService) call(s).\n\n"+
				"A service whose SetAudit is never called keeps a nil recorder, and "+
				"recordAudit returns without doing anything, so its mutations go "+
				"unrecorded with nothing failing. Wire every auditable service.",
			declared, wired)
	}
}

// TestAuditPageFiltersEveryRecordedResourceType is the cross-language half.
//
// The audit page's Resource dropdown listed three types while the services
// emitted nine. The extra six were recorded to the log and then unreachable: the
// rows existed, and the only filter the page offers could not ask for them. That
// is a worse failure than a missing feature, because the page looks complete.
//
// Nothing could have caught it from one side alone - the Go code is correct, the
// TSX compiles, and the drifting pair is a set of string literals in two
// languages. This reads both, the same shape as csvregistry's guard on the
// generated column manifest.
func TestAuditPageFiltersEveryRecordedResourceType(t *testing.T) {
	emitted := map[string]struct{}{}
	literal := regexp.MustCompile(`ResourceType:\s*"([a-z_]+)"`)
	for _, src := range domainSources(t) {
		for _, m := range literal.FindAllStringSubmatch(src, -1) {
			emitted[m[1]] = struct{}{}
		}
	}
	if len(emitted) < 9 {
		t.Fatalf("found %d resource types emitted, expected at least 9: %v", len(emitted), keys(emitted))
	}

	const page = "../frontend/src/pages/audit-page.tsx"
	raw, err := os.ReadFile(page)
	if err != nil {
		t.Fatalf("read %s: %v", page, err)
	}

	// Isolate the RESOURCE_TYPES literal so a `value:` elsewhere in the file
	// cannot be mistaken for a filter option.
	block := regexp.MustCompile(`(?s)const RESOURCE_TYPES = \[(.*?)\];`).FindStringSubmatch(string(raw))
	if block == nil {
		t.Fatalf("could not find the RESOURCE_TYPES array in %s; if it was renamed, update this test", page)
	}

	listed := map[string]struct{}{}
	for _, m := range regexp.MustCompile(`value:\s*'([a-z_]*)'`).FindAllStringSubmatch(block[1], -1) {
		listed[m[1]] = struct{}{}
	}

	var missing []string
	for rt := range emitted {
		if _, ok := listed[rt]; !ok {
			missing = append(missing, rt)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		t.Errorf(
			"%d resource type(s) are written to the audit log but absent from "+
				"RESOURCE_TYPES in %s, so no filter can reach them:\n  %s",
			len(missing), page, strings.Join(missing, "\n  "))
	}

	// The inverse: an option that matches nothing the backend emits is a filter
	// that always returns an empty list, which reads as "no activity" rather
	// than "wrong value".
	var stale []string
	for rt := range listed {
		if rt == "" {
			continue // the "All resources" sentinel
		}
		if _, ok := emitted[rt]; !ok {
			stale = append(stale, rt)
		}
	}
	if len(stale) > 0 {
		sort.Strings(stale)
		t.Errorf(
			"%d RESOURCE_TYPES option(s) in %s match no ResourceType any service "+
				"emits, so selecting them always yields an empty log:\n  %s",
			len(stale), page, strings.Join(stale, "\n  "))
	}
}

func keys(m map[string]struct{}) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// TestEveryUpdateEventCarriesADiff pins the payload, not just the presence of
// the event.
//
// Contract and Equipment recorded update events with no Changes at all, so the
// log said someone edited a contract without saying what - on the one domain
// where the edited values are POP dates, vendor and funding quarter. An update
// row with an empty diff is close to useless: it is the diff, not the fact of an
// edit, that an audit trail exists to preserve. Nine domains sent one and two
// did not, and the shapes are identical from the outside, so only reading the
// call sites distinguishes them.
//
// create and delete are deliberately not required to carry one. There is no
// before-state for a create, and for a delete the row is gone and resource_name
// is the snapshot that matters.
func TestEveryUpdateEventCarriesADiff(t *testing.T) {
	// Each AuditEventInput composite literal, up to its closing brace.
	block := regexp.MustCompile(`(?s)AuditEventInput\{(.*?)\n\t*\}`)

	var bare []string
	checked := 0

	for domain, src := range domainSources(t) {
		for _, m := range block.FindAllStringSubmatch(src, -1) {
			body := m[1]
			if !strings.Contains(body, `Action:       "update"`) &&
				!strings.Contains(body, `Action: "update"`) {
				continue
			}
			checked++
			if !strings.Contains(body, "Changes:") {
				rt := regexp.MustCompile(`ResourceType:\s*"([a-z_]+)"`).FindStringSubmatch(body)
				name := domain
				if rt != nil {
					name = domain + " (" + rt[1] + ")"
				}
				bare = append(bare, name)
			}
		}
	}

	// Vacuous-pass guard, matching the other walks here. Nine domains emit an
	// update event; well below that so adding one does not force an edit.
	if checked < 8 {
		t.Fatalf("found %d update events to check, expected at least 8", checked)
	}

	if len(bare) > 0 {
		sort.Strings(bare)
		t.Errorf(
			"%d update event(s) carry no Changes payload, so the log records that "+
				"a row was edited without recording what changed:\n  %s\n\n"+
				"Add a diff<Entity> helper in the {field: {old, new}} shape and pass it "+
				"as Changes, mirroring satcomservice. Remember to copy the row before "+
				"mutating it - the repo hands back a pointer the update edits in place.",
			len(bare), strings.Join(bare, "\n  "))
	}
	t.Logf("verified %d update events carry a diff", checked)
}

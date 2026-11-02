package main

import (
	"os"
	"strings"
	"testing"
)

// The operation and organization services depend on each other through
// interfaces, and every one of those setters is nil-tolerant so a unit test
// needs no collaborators. That tolerance is also what makes a missing line in
// main.go invisible: an unwired lookup accepts any organization key or waveform
// abbrev silently, and the foreign key is then the only thing left to refuse
// it, while an unwired usage guard lets an organization be deleted out from
// under a check-in. Nothing fails, so this reads main.go and requires the lines.
//
// Same shape as TestEveryAuditableDomainIsWired: a compile-time interface
// assertion cannot catch a setter that is never called.
func TestOperationWiringIsPresent(t *testing.T) {
	raw, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	src := string(raw)

	for _, line := range []string{
		"operationService.SetOrganizationLookup(organizationService)",
		"operationService.SetWaveformLookup(waveformService)",
		"organizationService.SetOrganizationUsage(operationService)",
	} {
		if !strings.Contains(src, line) {
			t.Errorf("main.go does not contain %q.\n\n"+
				"The setter is nil-tolerant, so leaving it out compiles and passes every unit "+
				"test while the rule it carries is silently off.", line)
		}
	}
}

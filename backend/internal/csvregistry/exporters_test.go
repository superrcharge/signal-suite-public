package csvregistry

import (
	"slices"
	"testing"
)

// Exporters() and All() are two lists of nine in one package, and they can fall
// out of step: a domain could gain columns and no bundle export, or the reverse.
// This compares their resource sets.
//
// The zero-value Services is safe because the closures are never invoked, which
// also means no constructor, no database and no mocks are needed to check the
// registry's shape.
func TestExportersCoverEveryRegisteredDomain(t *testing.T) {
	var columns []string
	for _, d := range All() {
		columns = append(columns, d.Resource)
	}
	var exporters []string
	for _, d := range Exporters(Services{}) {
		exporters = append(exporters, d.Resource)
	}

	slices.Sort(columns)
	slices.Sort(exporters)
	if !slices.Equal(columns, exporters) {
		t.Errorf("Exporters() and All() disagree about which domains exist\n"+
			"  All():       %v\n"+
			"  Exporters(): %v\n\n"+
			"A domain in one and not the other either has a column picker with no\n"+
			"bundle export behind it, or a bundle export the picker never offers.",
			columns, exporters)
	}
}

func TestExportersAreWellFormed(t *testing.T) {
	seen := map[string]bool{}
	for _, d := range Exporters(Services{}) {
		if d.Resource == "" {
			t.Error("a dataset has no resource name")
		}
		if seen[d.Resource] {
			t.Errorf("duplicate resource %q - a zip cannot hold two entries with the same name", d.Resource)
		}
		seen[d.Resource] = true

		if d.FilePrefix == "" {
			t.Errorf("%s has no FilePrefix, so its zip entry would be unnamed", d.Resource)
		}
		if d.Export == nil {
			t.Errorf("%s has no Export", d.Resource)
		}
	}
}

// SectionScoped drives both "section is required" and the entry name, so it has
// to match the two domains that genuinely are per-squadron.
func TestExportersMarkTheSectionScopedDomains(t *testing.T) {
	var scoped []string
	for _, d := range Exporters(Services{}) {
		if d.SectionScoped {
			scoped = append(scoped, d.Resource)
		}
	}
	slices.Sort(scoped)
	want := []string{"nets", "pace-channels"}
	if !slices.Equal(scoped, want) {
		t.Errorf("section-scoped datasets = %v, want %v", scoped, want)
	}
}

// A nil Template is what makes a domain export-only, and it must agree with the
// Import flag All() reports - a template with no import behind it is a dead end,
// and an import with no template leaves the user guessing at the header row.
func TestTemplatesMatchImportability(t *testing.T) {
	importable := map[string]bool{}
	for _, d := range All() {
		importable[d.Resource] = d.Import
	}

	for _, d := range Exporters(Services{}) {
		hasTemplate := d.Template != nil
		if hasTemplate != importable[d.Resource] {
			t.Errorf("%s: Template != nil is %v but All() says Import is %v",
				d.Resource, hasTemplate, importable[d.Resource])
		}
	}
}

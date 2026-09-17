// Package csvbulk serves one zip containing several domains' CSV exports.
//
// It knows how to bundle and nothing about any domain. The nine adapters that
// flatten nine different service signatures into one Render live in
// csvregistry, which already imports every domain and is the one place that
// does. That keeps the fiber-facing half free of domain imports and keeps the
// domain-importing half free of fiber.
//
// It deliberately does NOT live under internal/domain/. That directory is
// enumerated by scripts/lib/csv-coverage.mjs, which fails on any directory
// without an entry in csv-manifest.json - and this is not a domain.
//
// There is no second rendering path: every Render calls the same Service.Export*
// method the single-dataset route calls, so a bundled CSV cannot differ from the
// one you get by exporting that dataset alone. Do not add a shortcut here.
package csvbulk

import (
	"context"
	"fmt"
	"net/http"

	"backend/internal/shared/csvtable"
)

// Selector names one dataset in a bundle and how to narrow it.
//
// The facet fields carry the same names as the query parameters the
// single-dataset endpoints already accept, so there is no second vocabulary to
// keep in agreement.
type Selector struct {
	Resource string   `json:"resource" validate:"required"`
	Columns  []string `json:"columns"`

	// Section is the squadron for a section-scoped dataset. Required for those,
	// ignored by the rest.
	Section string `json:"section,omitempty"`

	Sections    []string `json:"sections,omitempty"`
	Statuses    []string `json:"statuses,omitempty"`
	FiscalYears []string `json:"fy,omitempty"`
	// Models narrows terminals; Types narrows kits.
	Models []string `json:"models,omitempty"`
	Types  []string `json:"types,omitempty"`
	// TerminalType is Equipment's satcom/radio axis, not a kit type. The
	// similar name is unfortunate; Types above is the kit one.
	TerminalType string `json:"terminal_type,omitempty"`
	Search       string `json:"search,omitempty"`
}

// BundleRequest is the POST body.
//
// POST rather than GET because a fully-expanded nine-dataset column selection
// runs past a thousand characters before any facet, and Fiber's default 4096
// byte read buffer covers the whole request head - next to an Entra token that
// is routinely 1.5 to 2.5 KB. Going over surfaces as a connection failure rather
// than a clean 4xx.
type BundleRequest struct {
	Datasets []Selector `json:"datasets" validate:"required,min=1,max=16"`
}

// Render produces one dataset's file body.
type Render func(ctx context.Context, sel Selector) (string, error)

// Dataset is one exportable resource wired to a live service.
type Dataset struct {
	// Resource matches csvregistry.Domain.Resource exactly.
	Resource string
	// FilePrefix is the zip entry stem, matching the single-dataset filename.
	FilePrefix string
	// SectionScoped means Section is required and forms part of the entry name.
	SectionScoped bool
	Export        Render
	// Template is nil for an export-only dataset (contracts, pace-channels).
	Template Render
}

// Registry holds the datasets in a fixed order.
type Registry struct {
	order []string
	byKey map[string]Dataset
}

func New(datasets ...Dataset) *Registry {
	r := &Registry{byKey: make(map[string]Dataset, len(datasets))}
	for _, d := range datasets {
		r.order = append(r.order, d.Resource)
		r.byKey[d.Resource] = d
	}
	return r
}

// Resources returns every registered resource, in registry order.
func (r *Registry) Resources() []string { return append([]string(nil), r.order...) }

func (r *Registry) Get(resource string) (Dataset, bool) {
	d, ok := r.byKey[resource]
	return d, ok
}

// order returns the requested selectors sorted into registry order.
//
// Registry order, not request order, for the same reason Bound.Export emits
// canonical column order: the same selection should always produce the same
// bytes however the request was written.
//
// The registry is built alphabetically by resource (csvregistry.Exporters), so
// that is the order entries appear in the zip. Deliberately NOT the frontend's
// CSV_DOMAIN_ORDER, which is a display order chosen for the picker: a zip sorts
// alphabetically in any file manager anyway, and coupling the two would create a
// cross-language invariant with nothing able to check it. Do not "fix" either
// one to match the other.
func (r *Registry) ordered(selectors []Selector) []Selector {
	byResource := make(map[string]Selector, len(selectors))
	for _, s := range selectors {
		byResource[s.Resource] = s
	}
	out := make([]Selector, 0, len(selectors))
	for _, resource := range r.order {
		if s, ok := byResource[resource]; ok {
			out = append(out, s)
		}
	}
	return out
}

// Error is a coded, status-carrying error, matching the shape response.Err reads.
type Error struct {
	Code    string
	Message string
	Status  int
}

func (e *Error) Error() string   { return e.Message }
func (e *Error) GetCode() string { return e.Code }
func (e *Error) GetStatus() int  { return e.Status }

func errUnknownResource(resource string, known []string) *Error {
	return &Error{
		Code:    "CSV_BUNDLE_UNKNOWN_RESOURCE",
		Message: fmt.Sprintf("unknown resource %q - known resources: %v", resource, known),
		Status:  http.StatusBadRequest,
	}
}

func errSectionRequired(resource string) *Error {
	return &Error{
		Code:    "CSV_BUNDLE_SECTION_REQUIRED",
		Message: fmt.Sprintf("%q is per-squadron and needs a section", resource),
		Status:  http.StatusBadRequest,
	}
}

func errNoTemplate(resource string) *Error {
	return &Error{
		Code:    "CSV_BUNDLE_NO_TEMPLATE",
		Message: fmt.Sprintf("%q is export-only and has no import template", resource),
		Status:  http.StatusBadRequest,
	}
}

func errDuplicate(resource string) *Error {
	return &Error{
		Code:    "CSV_BUNDLE_DUPLICATE_RESOURCE",
		Message: fmt.Sprintf("%q appears more than once; a zip cannot hold two entries with the same name", resource),
		Status:  http.StatusBadRequest,
	}
}

// build renders every selector into zip entries.
//
// No partial success: a failure anywhere fails the whole request. A truncated
// archive delivered with a 200 is worse than a clean error, because the user
// cannot see what is missing. Everything is buffered before anything is written.
func (r *Registry) build(ctx context.Context, selectors []Selector, template bool, stamp string) ([]csvtable.ZipEntry, error) {
	// Validate BEFORE ordering. ordered() keeps only what the registry knows, so
	// an unknown resource would otherwise be silently dropped and the caller
	// would get a 200 with a file missing - which is the same class of quiet
	// wrong answer as a partial archive.
	seen := make(map[string]bool, len(selectors))
	for _, s := range selectors {
		if _, ok := r.Get(s.Resource); !ok {
			return nil, errUnknownResource(s.Resource, r.Resources())
		}
		if seen[s.Resource] {
			return nil, errDuplicate(s.Resource)
		}
		seen[s.Resource] = true
	}

	entries := make([]csvtable.ZipEntry, 0, len(selectors))
	for _, sel := range r.ordered(selectors) {
		d, _ := r.Get(sel.Resource)
		if d.SectionScoped && sel.Section == "" {
			return nil, errSectionRequired(sel.Resource)
		}

		render := d.Export
		if template {
			if d.Template == nil {
				return nil, errNoTemplate(sel.Resource)
			}
			render = d.Template
		}

		body, err := render(ctx, sel)
		if err != nil {
			return nil, err
		}
		entries = append(entries, csvtable.ZipEntry{Name: entryName(d, sel, template, stamp), Body: body})
	}
	return entries, nil
}

// entryName matches the filename the single-dataset route produces, so a user
// who exports nets alone and nets in a bundle gets the same name both times.
func entryName(d Dataset, sel Selector, template bool, stamp string) string {
	stem := d.FilePrefix
	if d.SectionScoped && sel.Section != "" {
		stem += "-" + sel.Section
	}
	if template {
		return stem + "-import-template.csv"
	}
	return fmt.Sprintf("%s-%s.csv", stem, stamp)
}

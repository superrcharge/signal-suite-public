import { describe, expect, it } from 'vitest';

import { buildCsvUrl } from './build-csv-url';
import {
  CSV_DOMAINS,
  CSV_DOMAIN_ORDER,
  CSV_KIT_TYPE_OPTIONS,
  CSV_MODEL_OPTIONS,
  withSection,
  type CsvFacetParam,
  type CsvResource,
} from './csv-domains';
import { columnsFor } from '../csv-labels';
import { emptyFacets, planCsvRequest, type SelectionMap } from './csv-selection';

const SECTIONS = [
  { value: 'asqd', label: 'A SQD' },
  { value: 'bsqd', label: 'B SQD' },
];
const STATUSES = CSV_DOMAINS.terminals.facets
  .find((f) => f.param === 'statuses')!
  .source as { kind: 'static'; options: { value: string; label: string }[] };

// Every facet param needs an entry. `only()` below indexes this by param, so a
// facet missing from here selects nothing, compares equal to its (empty)
// vocabulary, drops out of the request - and every assertion still passes while
// covering none of it.
const facetOptions: Record<CsvFacetParam, { value: string; label: string }[]> = {
  sections: SECTIONS,
  statuses: STATUSES.options,
  fy: [{ value: 'FY26', label: 'FY26' }, { value: 'FY27', label: 'FY27' }],
  models: CSV_MODEL_OPTIONS,
  types: CSV_KIT_TYPE_OPTIONS,
};

/** Everything selected for one dataset, which is how the dialog opens. */
function only(resource: CsvResource, section?: string): SelectionMap {
  const config = CSV_DOMAINS[resource];
  return {
    [resource]: {
      selected: true,
      columns: columnsFor(resource).map((c) => c.key),
      facets: Object.fromEntries(
        config.facets.map((f) => [f.param, (facetOptions[f.param] ?? []).map((o) => o.value)]),
      ),
      section,
    },
  };
}

describe('planCsvRequest', () => {
  it('returns null when nothing is selected', () => {
    expect(planCsvRequest('export', {}, facetOptions)).toBeNull();
  });

  it('returns null when a dataset is selected with no columns', () => {
    expect(
      planCsvRequest('export', { terminals: { selected: true, columns: [], facets: {} } }, facetOptions),
    ).toBeNull();
  });

  // The non-regression, stated as a test rather than as a comment. Every single
  // dataset must produce byte-identically the URL the dialog produced before
  // multi-select existed.
  it.each(CSV_DOMAIN_ORDER)('exports %s as a plain CSV, never a zip', (resource) => {
    const section = CSV_DOMAINS[resource].sectionScoped ? 'asqd' : undefined;
    const plan = planCsvRequest('export', only(resource, section), facetOptions);

    expect(plan?.kind).toBe('single');

    const expected = buildCsvUrl(withSection(CSV_DOMAINS[resource].exportPath, section), {
      columns: columnsFor(resource).map((c) => c.key),
    });
    expect((plan as { url: string }).url).toBe(expected);
  });

  it('drops a fully-selected facet and never the columns', () => {
    const plan = planCsvRequest('export', only('terminals'), facetOptions) as { url: string };
    const url = new URL(plan.url, 'https://example.test');

    expect(url.searchParams.get('sections')).toBeNull();
    expect(url.searchParams.get('statuses')).toBeNull();
    expect(url.searchParams.get('columns')).not.toBeNull();
  });

  it('keeps a narrowed facet', () => {
    const selection = only('terminals');
    selection.terminals!.facets.sections = ['asqd'];
    const plan = planCsvRequest('export', selection, facetOptions) as { url: string };

    expect(new URL(plan.url, 'https://example.test').searchParams.get('sections')).toBe('asqd');
  });

  // The facet plumbing is generic, so these two do not test new code - they
  // test that the new params are wired into it, on both request shapes. The
  // fixture entries above are what makes them mean anything.
  it('sends a narrowed models facet for terminals', () => {
    const selection = only('terminals');
    selection.terminals!.facets.models = ['ow7', 'ow10'];
    const plan = planCsvRequest('export', selection, facetOptions) as { url: string };

    expect(new URL(plan.url, 'https://example.test').searchParams.get('models')).toBe('ow7,ow10');
  });

  it('sends a narrowed types facet for kits, in a bundle too', () => {
    const selection = { ...only('terminals'), ...only('kits') };
    selection.kits!.facets.types = ['remote'];
    const plan = planCsvRequest('export', selection, facetOptions) as {
      body: { datasets: { resource: string; types?: string[] }[] };
    };

    const kits = plan.body.datasets.find((d) => d.resource === 'kits');
    expect(kits?.types).toEqual(['remote']);
  });

  it('becomes a bundle POST at two datasets', () => {
    const plan = planCsvRequest(
      'export',
      { ...only('terminals'), ...only('kits') },
      facetOptions,
    );

    expect(plan?.kind).toBe('bundle');
    const bundle = plan as { url: string; body: { datasets: { resource: string }[] } };
    expect(bundle.url).toBe('/api/v1/export/bundle');
    expect(bundle.body.datasets.map((d) => d.resource)).toEqual(['terminals', 'kits']);
  });

  it('orders bundle datasets by the registry, not by how they were selected', () => {
    // Same reasoning as the backend emitting canonical column order: the same
    // set of datasets must always produce the same request.
    const forward = planCsvRequest('export', { ...only('terminals'), ...only('contracts') }, facetOptions);
    const reverse = planCsvRequest('export', { ...only('contracts'), ...only('terminals') }, facetOptions);

    const names = (p: unknown) => (p as { body: { datasets: { resource: string }[] } }).body.datasets.map((d) => d.resource);
    expect(names(forward)).toEqual(names(reverse));
    expect(names(forward)).toEqual(['terminals', 'contracts']);
  });

  it('carries the squadron into a bundle for a section-scoped dataset', () => {
    const plan = planCsvRequest(
      'export',
      { ...only('terminals'), ...only('nets', 'bsqd') },
      facetOptions,
    ) as { body: { datasets: { resource: string; section?: string }[] } };

    const nets = plan.body.datasets.find((d) => d.resource === 'nets');
    expect(nets?.section).toBe('bsqd');
  });

  it('never emits a squadron for a dataset that has no squadron', () => {
    // The dialog hands every newly-ticked dataset the route's squadron, because
    // it does not know which ones care. This is the guard that makes that safe:
    // a section on Terminals is meaningless and must not reach the wire.
    const selection = { ...only('terminals'), ...only('kits') };
    selection.terminals!.section = 'asqd';

    const plan = planCsvRequest('export', selection, facetOptions) as {
      body: { datasets: { resource: string; section?: string }[] };
    };

    expect(plan.body.datasets.find((d) => d.resource === 'terminals')?.section).toBeUndefined();
  });

  it('skips a dataset that has no template when the mode is template', () => {
    // Contracts and PACE are export-only. Ticking one for a template must not
    // produce a request naming it - the backend would 400 on it.
    const plan = planCsvRequest(
      'template',
      { ...only('terminals'), ...only('contracts') },
      facetOptions,
    );

    expect(plan?.kind).toBe('single');
    expect((plan as { url: string }).url).toContain('/api/v1/terminals/import/template');
  });

  it('returns null for a template of an export-only dataset alone', () => {
    expect(planCsvRequest('template', only('contracts'), facetOptions)).toBeNull();
    expect(planCsvRequest('template', only('pace-channels', 'asqd'), facetOptions)).toBeNull();
  });

  it('names the template bundle for templates, not for exports', () => {
    const plan = planCsvRequest(
      'template',
      { ...only('terminals'), ...only('kits') },
      facetOptions,
    ) as { url: string; filename: string };

    expect(plan.url).toBe('/api/v1/template/bundle');
    // A file called "export" full of blank forms would be its own small bug.
    expect(plan.filename).toBe('signal-suite-import-templates.zip');
  });

  it('a template bundle carries no facets', () => {
    const plan = planCsvRequest(
      'template',
      { ...only('terminals'), ...only('kits') },
      facetOptions,
    ) as unknown as { body: { datasets: Record<string, unknown>[] } };

    for (const d of plan.body.datasets) {
      expect(d.sections).toBeUndefined();
      expect(d.statuses).toBeUndefined();
    }
  });
});

describe('emptyFacets', () => {
  it('reports nothing when every facet has a selection', () => {
    // The state the dialog opens in: all options ticked.
    expect(emptyFacets(['terminals'], only('terminals'))).toEqual([]);
  });

  it('reports a facet the user emptied, naming it', () => {
    // The bug this exists for. An empty facet and an absent one build the same
    // URL - a fully-selected facet is dropped because "everything" is "no
    // filter", and an empty array is dropped by buildCsvUrl - so unticking
    // every model asked for none and silently got all of them. A full export
    // wearing a filtered one's costume.
    const state = only('terminals');
    state.terminals!.facets.models = [];

    const found = emptyFacets(['terminals'], state);
    expect(found).toHaveLength(1);
    expect(found[0]!.resource).toBe('terminals');
    expect(found[0]!.titles).toEqual(['Models']);

    // And the reason the check has to live outside planCsvRequest: the plan it
    // would have produced is indistinguishable from an unfiltered one.
    const plan = planCsvRequest('export', state, facetOptions);
    expect(plan?.kind).toBe('single');
    expect(new URL(plan!.url, 'http://x').searchParams.get('models')).toBeNull();
  });

  it('reports every emptied facet on a dataset, not just the first', () => {
    const state = only('terminals');
    state.terminals!.facets.models = [];
    state.terminals!.facets.statuses = [];

    expect(emptyFacets(['terminals'], state)[0]!.titles).toEqual(['Statuses', 'Models']);
  });

  it('covers the bundle path, which drops empty facets the same way', () => {
    const state: SelectionMap = { ...only('terminals'), ...only('kits') };
    state.kits!.facets.types = [];

    const found = emptyFacets(['terminals', 'kits'], state);
    expect(found.map((f) => f.resource)).toEqual(['kits']);
  });
});

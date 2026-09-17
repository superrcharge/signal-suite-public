import { columnsFor, type LabelledColumn } from '../csv-labels';
import { buildCsvUrl } from './build-csv-url';
import {
  CSV_BUNDLE,
  CSV_DOMAINS,
  CSV_DOMAIN_ORDER,
  withSection,
  type CsvFacetOption,
  type CsvFacetParam,
  type CsvResource,
} from './csv-domains';
import { datedFilename } from './download-csv';

/**
 * What the dialog has selected for one dataset.
 */
export interface DatasetSelection {
  selected: boolean;
  columns: string[];
  facets: Partial<Record<CsvFacetParam, string[]>>;
  /** The squadron, for the section-scoped datasets. */
  section?: string;
}

export type SelectionMap = Partial<Record<CsvResource, DatasetSelection>>;

export type CsvMode = 'export' | 'template';

/** One dataset: a plain GET, exactly as it has always been. */
export interface SingleRequest {
  kind: 'single';
  url: string;
  filename: string;
}

/** Two or more: a POST whose response is a zip. */
export interface BundleRequest {
  kind: 'bundle';
  url: string;
  body: { datasets: BundleSelector[] };
  filename: string;
}

export interface BundleSelector {
  resource: string;
  columns: string[];
  section?: string;
  sections?: string[];
  statuses?: string[];
  fy?: string[];
  /** Terminals only. */
  models?: string[];
  /** Kits only. */
  types?: string[];
}

export type CsvRequestPlan = SingleRequest | BundleRequest;

/**
 * Turns a selection into the request to make.
 *
 * Pure on purpose. "One dataset never becomes a zip" lives here, which makes it
 * a unit test rather than a rendering test - and that rule is the whole of the
 * non-regression: every existing single-dataset export must keep producing the
 * byte-identical URL it produced before multi-select existed.
 *
 * Returns null when nothing is selected, so the caller can disable submit
 * without duplicating the emptiness rule.
 */
export function planCsvRequest(
  mode: CsvMode,
  selection: SelectionMap,
  facetOptions: Partial<Record<CsvFacetParam, CsvFacetOption[]>>,
): CsvRequestPlan | null {
  // Registry order, not selection-map key order, so the same set of datasets
  // always produces the same request however the dialog recorded them.
  //
  // This orders the request, not the zip. The backend re-sorts into its own
  // registry, which is alphabetical by resource, and that is what the archive
  // ends up in. The two lists are deliberately independent - see the note on
  // Registry.order in backend/internal/csvbulk/csvbulk.go.
  const chosen = CSV_DOMAIN_ORDER.filter((r) => {
    const s = selection[r];
    if (!s?.selected || s.columns.length === 0) return false;
    // A template only exists for a domain that can be imported into.
    return mode === 'export' || Boolean(CSV_DOMAINS[r].templatePath);
  });

  if (chosen.length === 0) return null;
  if (chosen.length === 1) return planSingle(mode, chosen[0]!, selection, facetOptions);
  return planBundle(mode, chosen, selection, facetOptions);
}

function planSingle(
  mode: CsvMode,
  resource: CsvResource,
  selection: SelectionMap,
  facetOptions: Partial<Record<CsvFacetParam, CsvFacetOption[]>>,
): CsvRequestPlan | null {
  const config = CSV_DOMAINS[resource];
  const state = selection[resource]!;
  const isTemplate = mode === 'template';
  const path = isTemplate ? config.templatePath : config.exportPath;
  if (!path) return null;

  // Facets drop out when fully selected: for a filter, "everything" and "no
  // filter" are the same thing. Columns never drop out - see buildCsvUrl.
  const params: Record<string, string[] | undefined> = { columns: state.columns };
  if (!isTemplate) {
    for (const facet of config.facets) {
      const picked = state.facets[facet.param] ?? [];
      const available = facetOptions[facet.param] ?? [];
      params[facet.param] = picked.length === available.length ? undefined : picked;
    }
  }

  return {
    kind: 'single',
    url: buildCsvUrl(withSection(path, state.section), params),
    filename: isTemplate
      ? `${config.filenameStem}-import-template.csv`
      : datedFilename(config.filenameStem),
  };
}

/**
 * Facets the user has emptied entirely, per dataset.
 *
 * An empty facet is indistinguishable from an absent one by the time a request
 * is built: a fully-selected facet is dropped because "filter to everything"
 * and "no filter" really are the same request, and an empty array is dropped
 * too because `buildCsvUrl` omits empty params. So unticking every model asked
 * for no models and silently got **all** of them - a full export wearing the
 * costume of a filtered one, which is the worst possible failure for a file
 * someone is about to treat as authoritative.
 *
 * The server cannot fix this: "no models param" has to keep meaning "every
 * model", or every unfiltered export breaks. So it is caught here, before a
 * request exists, and the dialog refuses to submit rather than inventing a
 * meaning for an empty selection.
 *
 * Pure and separate from `planCsvRequest`, so both the GET and the bundle path
 * are covered by one check and it can be tested without rendering anything.
 */
export function emptyFacets(
  resources: CsvResource[],
  selection: SelectionMap,
): { resource: CsvResource; titles: string[] }[] {
  const out: { resource: CsvResource; titles: string[] }[] = [];
  for (const resource of resources) {
    const state = selection[resource];
    if (!state) continue;
    const titles = CSV_DOMAINS[resource].facets
      .filter((facet) => (state.facets[facet.param] ?? []).length === 0)
      .map((facet) => facet.title);
    if (titles.length > 0) out.push({ resource, titles });
  }
  return out;
}

function planBundle(
  mode: CsvMode,
  resources: CsvResource[],
  selection: SelectionMap,
  facetOptions: Partial<Record<CsvFacetParam, CsvFacetOption[]>>,
): BundleRequest {
  const isTemplate = mode === 'template';

  const datasets: BundleSelector[] = resources.map((resource) => {
    const config = CSV_DOMAINS[resource];
    const state = selection[resource]!;
    const selector: BundleSelector = { resource, columns: state.columns };

    if (config.sectionScoped && state.section) selector.section = state.section;

    // A template has no rows, so it has nothing to filter.
    if (!isTemplate) {
      for (const facet of config.facets) {
        const picked = state.facets[facet.param] ?? [];
        const available = facetOptions[facet.param] ?? [];
        if (picked.length === available.length) continue;
        selector[facet.param] = picked;
      }
    }
    return selector;
  });

  return {
    kind: 'bundle',
    url: isTemplate ? CSV_BUNDLE.templatePath : CSV_BUNDLE.exportPath,
    body: { datasets },
    filename: isTemplate ? 'signal-suite-import-templates.zip' : datedFilename('signal-suite-export', 'zip'),
  };
}

/**
 * The columns a mode can express.
 *
 * A template offers only what the importer reads back. Offering `updated_at`
 * would invite someone to type a value the import discards, and the column is
 * absent from the template precisely because it has no `Set` in the backend's
 * declaration - so this is that one switch, read on the frontend.
 */
export function modeColumnsFor(resource: CsvResource, mode: CsvMode): LabelledColumn[] {
  const all = columnsFor(resource);
  return mode === 'template' ? all.filter((c) => c.templatable) : all;
}

/**
 * What will actually be sent for a dataset: narrowed to the mode, with required
 * columns re-added.
 *
 * The backend re-adds required columns anyway. Doing it here too means the
 * checkbox and the file agree about what is going to happen. Order comes from
 * the manifest, not from the order the user ticked things.
 */
export function effectiveColumnsFor(
  resource: CsvResource,
  mode: CsvMode,
  picked: string[],
): string[] {
  const chosen = new Set(picked);
  return modeColumnsFor(resource, mode)
    .filter((c) => chosen.has(c.key) || c.required)
    .map((c) => c.key);
}

/**
 * The squadrons a section-scoped dataset accepts, or an empty list for the rest.
 *
 * Nets and PACE take different lists - see CsvFacetOptions.paceSections for why.
 */
export function squadronsFor(
  resource: CsvResource,
  options: { sections: CsvFacetOption[]; paceSections: CsvFacetOption[] },
): CsvFacetOption[] {
  if (!CSV_DOMAINS[resource].sectionScoped) return [];
  return resource === 'pace-channels' ? options.paceSections : options.sections;
}

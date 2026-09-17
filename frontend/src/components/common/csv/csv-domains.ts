import { CSV_COLUMNS } from '@/generated/csv-columns';

/**
 * Per-domain CSV configuration: where the endpoints are, what filter facets the
 * dialog offers, and who may write.
 *
 * Deliberately NOT here: the column lists. Those come from the generated
 * manifest, which the backend renders from the same declaration its exporter
 * reads. This file holds only what the backend has no opinion about - which
 * facets a picker shows, and which role gate a control sits behind.
 *
 * Pure data: no hooks, no JSX. That keeps it comparable in a test, which is the
 * cheap guard against the tenth domain being wired up half way.
 */

export type CsvResource =
  | 'terminals'
  | 'kits'
  | 'contracts'
  | 'equipment'
  | 'waveforms'
  | 'services'
  | 'transports'
  | 'platforms'
  | 'nets'
  | 'pace-channels';

/**
 * Query parameter names the export handlers accept.
 *
 * This union literally decides the parameter name sent: `buildCsvUrl` keys each
 * param by `facet.param` verbatim, and the bundle body uses the same key. So a
 * name added here has to be a name the backend reads.
 */
export type CsvFacetParam = 'sections' | 'statuses' | 'fy' | 'models' | 'types';

export interface CsvFacetOption {
  value: string;
  label: string;
  /** Swatch colour. Sections only; everything else leaves it undefined. */
  color?: string;
}

/**
 * Where a facet's options come from. Static lists live here; dynamic ones name a
 * resolver, so the registry itself stays free of hooks.
 */
export type CsvFacetSource =
  | { kind: 'static'; options: CsvFacetOption[] }
  | { kind: 'sections' }
  | { kind: 'fiscalYears' };

export interface CsvFacet {
  param: CsvFacetParam;
  title: string;
  source: CsvFacetSource;
}

/** Which permission a write control sits behind. */
export type CsvWriteGate = 'canWrite' | 'canWriteRadio' | 'canWritePace';

export interface CsvDomainConfig {
  resource: CsvResource;
  /** Dialog title noun: "Export Terminals". */
  label: string;
  /** One line under the title in the Settings catalogue. */
  description: string;
  /** Export endpoint. `:section` is substituted from the dialog's context. */
  exportPath: string;
  /** Download filename stem, matching the server's own. */
  filenameStem: string;
  /** Filter facets, rendered in order. Empty for the flat libraries. */
  facets: CsvFacet[];
  /** Template endpoint. Absent for the export-only domains. */
  templatePath?: string;
  /** Import endpoint. Absent for the export-only domains. */
  importPath?: string;
  /** Which gate the template and import controls sit behind. */
  writeGate: CsvWriteGate;
  /**
   * True when the endpoints carry `:section`. Such a domain can only be reached
   * from a page that knows which squadron it is looking at.
   */
  sectionScoped?: boolean;
}

// Byte-identical in the terminals and kits dialogs before this, so defined once.
// Exported because the facet-options hook needs the same list: it resolves every
// vocabulary up front now, so it cannot read this one off a facet it was handed.
export const CSV_STATUS_OPTIONS: CsvFacetOption[] = [
  { value: 'available', label: 'Available' },
  { value: 'on-mission', label: 'On Mission' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'alert', label: 'ALERT' },
  { value: 'alert-blue', label: 'ALERT BLUE' },
  { value: 'alert-green', label: 'ALERT GREEN' },
  { value: 'inop', label: 'INOP' },
];

// Values and order from Go's terminal.ValidModels: family order, Starshield
// then Paradigm then OneWeb. Flat rather than grouped by family with their own
// select-alls - no other facet in this dialog is grouped, so that would be a
// one-off pattern. Declared here beside CSV_STATUS_OPTIONS, which is the
// convention this file already follows for its vocabularies.
export const CSV_MODEL_OPTIONS: CsvFacetOption[] = [
  { value: 'mini', label: 'Mini' },
  { value: 'hp', label: 'HP' },
  { value: 'hornet', label: 'Hornet' },
  { value: 'ragno', label: 'Ragno' },
  { value: 'ow7', label: 'OW-7' },
  { value: 'ow10', label: 'OW-10' },
  { value: 'ow11', label: 'OW-11' },
];

/** Values and order from Go's kit.ValidTypes. */
export const CSV_KIT_TYPE_OPTIONS: CsvFacetOption[] = [
  { value: 'remote', label: 'Remote' },
  { value: 'ifk', label: 'IFK' },
  { value: 'atk', label: 'ATK' },
];

const SECTION_FACET: CsvFacet = { param: 'sections', title: 'Sections', source: { kind: 'sections' } };
const STATUS_FACET: CsvFacet = {
  param: 'statuses',
  title: 'Statuses',
  source: { kind: 'static', options: CSV_STATUS_OPTIONS },
};
const MODEL_FACET: CsvFacet = {
  param: 'models',
  title: 'Models',
  source: { kind: 'static', options: CSV_MODEL_OPTIONS },
};
const KIT_TYPE_FACET: CsvFacet = {
  param: 'types',
  title: 'Types',
  source: { kind: 'static', options: CSV_KIT_TYPE_OPTIONS },
};

export const CSV_DOMAINS: Record<CsvResource, CsvDomainConfig> = {
  terminals: {
    resource: 'terminals',
    label: 'Terminals',
    description: 'Every terminal, filtered by section, status, model and column.',
    exportPath: '/api/v1/export/terminals',
    filenameStem: 'signal-suite-terminals',
    facets: [SECTION_FACET, STATUS_FACET, MODEL_FACET],
    templatePath: '/api/v1/terminals/import/template',
    importPath: '/api/v1/terminals/import',
    writeGate: 'canWrite',
  },
  kits: {
    resource: 'kits',
    label: 'Kits',
    description: 'Every kit, filtered by section, status, type and column.',
    exportPath: '/api/v1/export/kits',
    filenameStem: 'signal-suite-kits',
    facets: [SECTION_FACET, STATUS_FACET, KIT_TYPE_FACET],
    templatePath: '/api/v1/kits/import/template',
    importPath: '/api/v1/kits/import',
    writeGate: 'canWrite',
  },
  contracts: {
    // Export only. Contracts arrive one at a time from the KO, so there has
    // never been a batch to load, and a template with no import behind it is a
    // file that leads nowhere.
    resource: 'contracts',
    label: 'Contracts',
    description: 'Every contract, filtered by fiscal year and column.',
    exportPath: '/api/v1/export/contracts',
    filenameStem: 'signal-suite-contracts',
    facets: [{ param: 'fy', title: 'Fiscal Years', source: { kind: 'fiscalYears' } }],
    writeGate: 'canWrite',
  },
  equipment: {
    resource: 'equipment',
    label: 'Equipment Catalog',
    description: 'Catalog entries. Import creates records with an empty datasheet.',
    exportPath: '/api/v1/export/equipment',
    filenameStem: 'signal-suite-equipment',
    facets: [],
    templatePath: '/api/v1/equipment/import/template',
    importPath: '/api/v1/equipment/import',
    // canWriteRadio, matching POST /api/v1/equipment/import, which admits rto
    // and narrows to radio records per row via ActorRadioOnly. This said
    // canWrite, so an rto who could create a radio record through the form
    // could not see Import for the same records.
    writeGate: 'canWriteRadio',
  },
  waveforms: {
    resource: 'waveforms',
    label: 'Waveform Library',
    description: 'The global waveform list.',
    exportPath: '/api/v1/export/waveforms',
    filenameStem: 'signal-suite-waveforms',
    facets: [],
    templatePath: '/api/v1/waveforms/import/template',
    importPath: '/api/v1/waveforms/import',
    // canWriteRadio, matching POST /api/v1/waveforms/import, which admits rto.
    // The waveform library is radio reference data, so an rto writes it while a
    // planner does not - which is also why WaveformLibraryPane reads
    // canWriteRadio and the other three panes do not.
    writeGate: 'canWriteRadio',
  },
  services: {
    resource: 'services',
    label: 'Services Library',
    description: 'The global SATCOM service list.',
    exportPath: '/api/v1/export/services',
    filenameStem: 'signal-suite-services',
    facets: [],
    templatePath: '/api/v1/services/import/template',
    importPath: '/api/v1/services/import',
    writeGate: 'canWrite',
  },
  transports: {
    resource: 'transports',
    label: 'Transport Library',
    description: 'The global transport list. Kind is an open vocabulary.',
    exportPath: '/api/v1/export/transports',
    filenameStem: 'signal-suite-transports',
    facets: [],
    templatePath: '/api/v1/transports/import/template',
    importPath: '/api/v1/transports/import',
    // canWritePace, matching the transport routes: a transport is a path a PACE
    // tier names, so it follows PACE's writers rather than the catalog's.
    writeGate: 'canWritePace',
  },
  platforms: {
    // One row per platform. The compatibility matrix itself is a cross-tab,
    // which a row-per-record CSV cannot express - its export is the print
    // route, and the data behind it exports here.
    resource: 'platforms',
    label: 'Platform Library',
    description: 'External comms platforms for the compatibility matrix. Waveforms are ; separated.',
    exportPath: '/api/v1/export/platforms',
    filenameStem: 'signal-suite-platforms',
    facets: [],
    templatePath: '/api/v1/platforms/import/template',
    importPath: '/api/v1/platforms/import',
    // canWritePace, matching the platform routes.
    writeGate: 'canWritePace',
  },
  nets: {
    // Per squadron, which is why the paths carry :section and there is no
    // sections facet: a net belongs to the squadron that maintains it, and there
    // is no cross-section list to narrow.
    resource: 'nets',
    label: 'Nets',
    description: 'One squadron’s nets. Rows import into the squadron you are viewing.',
    exportPath: '/api/v1/export/nets/:section',
    filenameStem: 'signal-suite-nets',
    facets: [],
    templatePath: '/api/v1/nets/import/template',
    importPath: '/api/v1/nets/:section/import',
    writeGate: 'canWritePace',
    sectionScoped: true,
  },
  'pace-channels': {
    // Export only, and named for what the file actually carries: the wheel
    // assignments, not the frequency tables, tmn rows, tiers or header.
    resource: 'pace-channels',
    label: 'PACE Channels',
    description: 'Assigned wheel positions for one squadron. Not the whole card.',
    exportPath: '/api/v1/export/pace-channels/:section',
    filenameStem: 'signal-suite-pace-channels',
    facets: [],
    writeGate: 'canWritePace',
    sectionScoped: true,
  },
};

/** Display order for the Settings catalogue. */
export const CSV_DOMAIN_ORDER: CsvResource[] = [
  'terminals',
  'kits',
  'contracts',
  'equipment',
  'waveforms',
  'services',
  'transports',
  'platforms',
  'nets',
  'pace-channels',
];

/** Substitutes `:section` in an endpoint path. */
export function withSection(path: string, section: string | undefined): string {
  return section ? path.replace(':section', encodeURIComponent(section)) : path;
}

/** Whether the generated manifest says this resource accepts an import. */
export function backendAcceptsImport(resource: CsvResource): boolean {
  return CSV_COLUMNS.find((d) => d.resource === resource)?.import ?? false;
}

/**
 * The multi-dataset bundle endpoints.
 *
 * Declared here rather than beside the planner deliberately: this is the file
 * scripts/lib/csv-coverage.mjs reads to check that every path the frontend names
 * is a route some backend package registers. That check exists because an earlier release
 * shipped a Template button pointing at a route nothing registered, so hiding
 * the newest and least-exercised endpoints from it would be exactly backwards.
 */
export const CSV_BUNDLE = {
  exportPath: '/api/v1/export/bundle',
  templatePath: '/api/v1/template/bundle',
} as const;

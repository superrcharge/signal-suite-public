import type { Equipment } from '@/types';
// Imported directly rather than through `./index`. The barrel pulls in every
// rendering component in this directory, and a pure module reaching back
// through it is how a chunk import cycle gets built - which `check-bundle.mjs`
// exists to catch, after one shipped a blank white screen in an earlier release.
import {
  COMPARE_PARAMS,
  cellFor,
  normalizeKey,
  numericCellFor,
  type CompareParam,
  type CompareScope,
} from './compare-params';
import { OPMODE_OPTS, ORBIT_OPTS, RADIO_BAND_OPTS, SATCOM_BAND_OPTS } from './catalog-vocab';

/**
 * Which catalog parameters the browse page offers as filters, and how each one
 * is presented.
 *
 * This is deliberately NOT a second description of an equipment record. Every
 * fact about how to read a record - the extractor, the SATCOM/radio scoping,
 * the `na` rule, the stable URL id - already lives in `compare-params.ts`, and
 * a facet references one by id rather than restating it. Compare lays a
 * parameter's values out across records; a facet asks which records hold which
 * value. Same registry, read in two directions.
 *
 * What lives here instead is the part compare has no use for: bucket cuts,
 * curated ordering, how much of a long tail to show. Keeping that out of
 * `compare-params.ts` matters because that module is pulled into the print and
 * PDF path, and it should not have to carry a sidebar's truncation count.
 */

export type FacetKind = 'value' | 'range' | 'bool';

export interface RangeBucket {
  label: string;
  /** Inclusive. `null` is unbounded. */
  min: number | null;
  /** **Exclusive.** `null` is unbounded. */
  max: number | null;
}

export interface FacetSpec {
  /** URL-safe and stable; goes in `f.<id>=`. Renaming one breaks saved links. */
  id: string;
  /** The `CompareParam` id this reads. A facet never reads a record any other way. */
  param: string;
  kind: FacetKind;
  /** Overrides the param's own label, for the cases where the rail cannot hold it. */
  label?: string;
  /**
   * Curated display order. Values named here come first, in this order;
   * anything else follows by count. Only for vocabularies where an order
   * means something - bands are the reason this exists, since alphabetical
   * would print C, HF, K, Ka, Ku and scramble the spectrum.
   */
  order?: readonly string[];
  /** Range facets only. Cuts must not overlap; see `bucketMatches`. */
  buckets?: readonly RangeBucket[];
  /**
   * The unit shown beside a range control. Must equal the param's
   * `compareUnit` - asserted in the test, because the number is normalized and
   * a control that printed the wrong unit would be lying about what the reader
   * just typed.
   */
  unit?: string;
  /** Values shown before the tail collapses behind "Show all (n)". */
  showFirst?: number;
}

/**
 * Weight cuts by carry role rather than round numbers.
 *
 * The catalog spans 2 lbs 12 oz to 1450 lbs, so decades would put nearly
 * everything in one bucket at one end. These four are the questions someone
 * actually browsing has: can one person carry it, can two, does it need a
 * vehicle, does it need a slab.
 *
 * `max` is exclusive throughout, so the cuts partition the line - no record in
 * two buckets, and no epsilon anywhere.
 */
export const WEIGHT_BUCKETS: readonly RangeBucket[] = [
  { label: 'Under 20', min: null, max: 20 },
  { label: '20 – 50', min: 20, max: 50 },
  { label: '50 – 150', min: 50, max: 150 },
  { label: '150+', min: 150, max: null },
];

const POWER_BUCKETS: readonly RangeBucket[] = [
  { label: 'Under 5', min: null, max: 5 },
  { label: '5 – 20', min: 5, max: 20 },
  { label: '20+', min: 20, max: null },
];

export const CATALOG_FACETS: readonly FacetSpec[] = [
  { id: 'mode', param: 'mode', kind: 'value', order: OPMODE_OPTS },
  {
    id: 'band',
    param: 'bands',
    kind: 'value',
    // Both vocabularies, because the All tab shows both kinds at once. The
    // overlap (S, C) folds to one entry on the way through normalizeKey.
    order: [...SATCOM_BAND_OPTS, ...RADIO_BAND_OPTS],
  },
  { id: 'orbit', param: 'std:orbit', kind: 'value', order: ORBIT_OPTS },
  { id: 'make', param: 'make', kind: 'value', label: 'Manufacturer', showFirst: 8 },
  { id: 'wf', param: 'waveforms', kind: 'value', showFirst: 8 },
  { id: 'svc', param: 'services', kind: 'value', showFirst: 8 },
  { id: 'altpnt', param: 'std:altpnt', kind: 'bool', label: 'ALT-PNT' },
  { id: 'weight', param: 'swap:weight', kind: 'range', unit: 'lbs', buckets: WEIGHT_BUCKETS },
  { id: 'buc', param: 'std:buc', kind: 'range', unit: 'W' },
  { id: 'txpwr', param: 'std:txpower', kind: 'range', unit: 'W', buckets: POWER_BUCKETS },
  { id: 'wind', param: 'std:wind', kind: 'range', unit: 'mph' },
  { id: 'range', param: 'std:range', kind: 'range', unit: 'mi' },
];

/**
 * Search params this page already owns, which a facet id must never shadow.
 * `type` is the browse tab; the rest are the compare page's, kept here so a
 * link that carries both survives. Asserted in the test.
 */
export const RESERVED_PARAMS: readonly string[] = ['type', 'ids', 'params', 'fit'];

const PARAM_BY_ID = new Map(COMPARE_PARAMS.map(p => [p.id, p]));

/**
 * The `CompareParam` behind a facet.
 *
 * Throws rather than returning undefined: an unresolved id is a typo in a
 * constant list, not a runtime condition, and a facet that silently vanished
 * would be found by nobody.
 */
export function facetParam(spec: FacetSpec): CompareParam {
  const param = PARAM_BY_ID.get(spec.param);
  if (!param) throw new Error(`facet "${spec.id}" names unknown compare param "${spec.param}"`);
  return param;
}

export function facetScope(spec: FacetSpec): CompareScope {
  return facetParam(spec).appliesTo;
}

export function facetLabel(spec: FacetSpec): string {
  return spec.label ?? facetParam(spec).label;
}

export interface FacetValue {
  /** Normalized; this is what goes in the URL. */
  key: string;
  /** Display casing, from the first record that used the value. */
  label: string;
}

/**
 * What one record answers for one facet.
 *
 * The three-way split is the whole point, and it is the catalog's existing
 * `na`/`blank` doctrine rather than a new idea: `na` says the facet does not
 * apply to this kind of equipment, so the record is not part of this facet's
 * population at all; `blank` says it does apply and nobody filled it in, which
 * is a gap someone can close and must stay visible.
 */
export type FacetReading =
  | { kind: 'na' }
  | { kind: 'blank' }
  | { kind: 'values'; values: FacetValue[] }
  | { kind: 'num'; value: number };

/**
 * The bool facet's two options, as a fixed pair rather than a lookup.
 *
 * Yes before No, always, and never reordered by frequency: a two-option
 * control whose options swap places as records are filtered reads as broken.
 */
const BOOL_YES: FacetValue = { key: 'yes', label: 'Yes' };
const BOOL_NO: FacetValue = { key: 'no', label: 'No' };
const BOOL_VALUES: readonly FacetValue[] = [BOOL_YES, BOOL_NO];

/**
 * Read one record for one facet. The single place a facet touches a record.
 *
 * Range facets go through `numericCellFor`, everything else through `cellFor`,
 * so both inherit the one place `na` is produced rather than deciding it here.
 */
export function readFacet(spec: FacetSpec, eq: Equipment): FacetReading {
  const param = facetParam(spec);

  if (spec.kind === 'range') {
    const cell = numericCellFor(param, eq);
    if (cell.kind === 'na') return { kind: 'na' };
    if (cell.kind === 'num') return { kind: 'num', value: cell.value };
    return { kind: 'blank' };
  }

  const cell = cellFor(param, eq);
  switch (cell.kind) {
    case 'na':
      return { kind: 'na' };
    case 'bool':
      return { kind: 'values', values: [cell.value ? BOOL_YES : BOOL_NO] };
    case 'text': {
      const key = normalizeKey(cell.value);
      return key ? { kind: 'values', values: [{ key, label: cell.value }] } : { kind: 'blank' };
    }
    case 'list': {
      const values: FacetValue[] = [];
      const seen = new Set<string>();
      for (const raw of cell.values) {
        const key = normalizeKey(raw);
        // A record listing "Ka" twice is one record holding Ka, not two.
        if (!key || seen.has(key)) continue;
        seen.add(key);
        values.push({ key, label: raw.trim() });
      }
      return values.length > 0 ? { kind: 'values', values } : { kind: 'blank' };
    }
    default:
      return { kind: 'blank' };
  }
}

/** Does a value fall inside a bucket? `min` inclusive, `max` exclusive. */
export function bucketMatches(bucket: Pick<RangeBucket, 'min' | 'max'>, value: number): boolean {
  if (bucket.min != null && value < bucket.min) return false;
  if (bucket.max != null && value >= bucket.max) return false;
  return true;
}

/**
 * Every value the pool holds for a facet, in display order.
 *
 * Derived from the records on screen, never from a fixed list. The editor's
 * own `OPMODE_OPTS` is already contradicted by CSV-imported rows carrying
 * `fixed` and `on the move`, so a hardcoded set would quietly hide records.
 * `spec.order` only *orders* what is there; it never adds a value nothing has,
 * and never drops one it does not name.
 *
 * Two tiers: curated first in the curated order, then by frequency, then
 * naturally. Frequency rather than alphabetical because the tail is where seed
 * filler and one-off typos land, and they should sink on their own rather than
 * need a blocklist. There is deliberately no minimum count - a value held by
 * one record is one record, and dropping it makes that record unreachable
 * through the sidebar.
 */
export function facetValues(spec: FacetSpec, pool: Equipment[]): FacetValue[] {
  if (spec.kind === 'range') return [];

  const counts = new Map<string, number>();
  const labels = new Map<string, string>();

  for (const eq of pool) {
    const reading = readFacet(spec, eq);
    if (reading.kind !== 'values') continue;
    for (const { key, label } of reading.values) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!labels.has(key)) labels.set(key, label);
    }
  }

  const rank = new Map<string, number>();
  (spec.order ?? []).forEach((value, i) => {
    const key = normalizeKey(value);
    // First mention wins: `band`'s order concatenates two vocabularies that
    // both contain S and C, and the SATCOM position is the one to keep.
    if (!rank.has(key)) rank.set(key, i);
  });

  // A bool facet is a fixed pair and reads Yes before No, always. Sorting it
  // by frequency would reorder the two options as records are filtered, which
  // makes a two-option control feel broken.
  if (spec.kind === 'bool') {
    return BOOL_VALUES.filter(v => counts.has(v.key));
  }

  return [...counts.keys()]
    .sort((a, b) => {
      const ra = rank.get(a) ?? Infinity;
      const rb = rank.get(b) ?? Infinity;
      if (ra !== rb) return ra - rb;
      const ca = counts.get(a) ?? 0;
      const cb = counts.get(b) ?? 0;
      if (ca !== cb) return cb - ca;
      return (labels.get(a) ?? a).localeCompare(labels.get(b) ?? b);
    })
    .map(key => ({ key, label: labels.get(key) ?? key }));
}

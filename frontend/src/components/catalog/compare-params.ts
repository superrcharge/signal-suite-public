import type {
  Equipment,
  EquipmentBand,
  RadioStandardSpecs,
  SATCOMStandardSpecs,
  TerminalType,
} from '@/types';
import { compareNatural } from '@/utils';

/**
 * The one declaration of what can be compared across catalog records.
 *
 * Every other file in this feature reads this list. The matrix renderer holds
 * no knowledge of the equipment shape, the pickers hold no labels of their
 * own, and the URL codec validates against these ids. That is deliberate: the
 * catalog already learned this lesson with CSV, where each export dialog kept
 * its own retyped column list and the contracts one drifted two columns for
 * months.
 */

export type CompareScope = 'satcom' | 'radio' | 'both';

/**
 * What one cell holds.
 *
 * `na` and `blank` are different answers and must never render alike. `na`
 * says the parameter does not exist for that kind of equipment, so an empty
 * cell is correct and final. `blank` says it does exist and nobody filled it
 * in, which is a gap in the catalog someone can close. Collapsing the two
 * would hide every one of those gaps behind a legitimate-looking dash.
 */
export type CompareCell =
  | { kind: 'na' }
  | { kind: 'blank' }
  | { kind: 'text'; value: string }
  | { kind: 'num'; value: number; unit?: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'list'; values: string[] };

export const COMPARE_GROUPS = [
  'identification',
  'standard',
  'swap',
  'frequencies',
  'capabilities',
] as const;

export type CompareGroup = (typeof COMPARE_GROUPS)[number];

/**
 * Group order and labels mirror the datasheet's own sections, because that is
 * the order the data was entered in and the order a reader already knows.
 */
export const GROUP_LABELS: Record<CompareGroup, string> = {
  identification: 'Identification',
  standard: 'Standard Specs',
  swap: 'Size / Weight / Power',
  frequencies: 'Frequencies',
  capabilities: 'Waveforms / Services',
};

/**
 * Short forms for the picker's gutter, where the label sits beside its chips
 * rather than above them.
 *
 * The gutter is a fixed column so every chip in the panel lines up, and it is
 * sized to the tile height, which leaves room for about six characters.
 * "Size / Weight / Power" at that size would be wider than the chips it
 * labels. The full names stay on the matrix, where there is a whole column
 * for them.
 */
export const GROUP_SHORT: Record<CompareGroup, string> = {
  identification: 'ID',
  standard: 'SPECS',
  swap: 'SWAP',
  frequencies: 'FREQ',
  capabilities: 'WF/SVC',
};

export interface CompareParam {
  /** URL-safe and stable. It goes in `?params=`, so renaming one breaks links. */
  id: string;
  label: string;
  group: CompareGroup;
  appliesTo: CompareScope;
  /**
   * Read one value out of one record.
   *
   * An extractor never returns `{ kind: 'na' }`. Applicability is decided once
   * by `cellFor` below, from `appliesTo` against the record's terminal_type,
   * so each extractor has exactly one job and the N/A rule is tested once
   * rather than once per parameter. An extractor that decided it for itself
   * would be the place the rule silently drifts.
   */
  extract: (eq: Equipment) => CompareCell;
  /**
   * The same fact as `extract`, normalized to one unit so it can be ordered
   * and range-filtered. Present only where that is meaningful.
   *
   * It reads the record, never the string `extract` produced. Re-deriving a
   * number by parsing "3 lbs 4 oz" back apart would break silently the day a
   * separator changes, and would return a wrong number rather than an error.
   *
   * The contract, asserted over a fixture matrix in the test beside this file:
   * this returns null exactly when `extract` returns `blank`. Two readers of
   * one fact are only safe while something checks they still agree.
   */
  compareValue?: (eq: Equipment) => number | null;
  /**
   * The unit `compareValue` is expressed in. Required wherever it is present,
   * because the number is normalized and the record's own unit is gone by
   * then - a range control that does not print this is lying about what the
   * reader typed.
   */
  compareUnit?: string;
  /**
   * Display name of the band a derived frequency row belongs to, absent on
   * every static parameter.
   *
   * Carried as a field rather than recovered by splitting `id`, because the
   * id is a URL contract and parsing it in the picker would make the picker
   * break when the id format changes.
   */
  band?: string;
}

const BLANK: CompareCell = { kind: 'blank' };

const OZ_PER_LB = 16;
/** Statute miles per kilometre, for normalizing a radio range entered in km. */
const MI_PER_KM = 0.621371;

function text(value: string | undefined | null): CompareCell {
  const trimmed = (value ?? '').trim();
  return trimmed ? { kind: 'text', value: trimmed } : BLANK;
}

function num(value: number | undefined | null, unit?: string): CompareCell {
  return value == null ? BLANK : { kind: 'num', value, unit };
}

function bool(value: boolean | undefined | null): CompareCell {
  return value == null ? BLANK : { kind: 'bool', value };
}

function list(values: (string | undefined)[]): CompareCell {
  const clean = values.map(v => (v ?? '').trim()).filter(Boolean);
  return clean.length > 0 ? { kind: 'list', values: clean } : BLANK;
}

/**
 * `standard_specs` is a union with no discriminant, and these two readers are
 * how it is read without inventing one.
 *
 * Both members declare every field optional, so the union is structurally
 * assignable to either one and no cast is needed. That is also why a reader
 * must only be used by a parameter whose `appliesTo` already pins the type:
 * the compiler will happily let `radioSpecs` read a SATCOM record and hand
 * back undefined for every radio field. `cellFor` is what enforces the
 * pairing, and `appliesTo` is what it enforces it from.
 */
function satcomSpecs(eq: Equipment): SATCOMStandardSpecs {
  return eq.data?.standard_specs ?? {};
}

function radioSpecs(eq: Equipment): RadioStandardSpecs {
  return eq.data?.standard_specs ?? {};
}

function bands(eq: Equipment): EquipmentBand[] {
  return eq.data?.bands ?? [];
}

/**
 * Size and weight are rendered as entered, not normalized to one unit.
 *
 * This cut does no numeric comparison, no sorting and no best-value emphasis,
 * so a normalized number buys nothing and costs something: a record entered as
 * "3 lbs 4 oz" is what the vendor sheet says, and rewriting it to 3.25 lbs is
 * a claim the catalog never made. The same reasoning covers range in mi/km and
 * band frequencies in MHz/GHz.
 *
 * When highlighting or sorting arrives, normalization becomes required. The
 * place for it is a `compareValue` field added to CompareParam beside
 * `extract`, not a rewrite of these extractors.
 */
function formatWeight(eq: Equipment): CompareCell {
  const swap = eq.data?.swap ?? {};
  const mode = swap.weight_unit ?? 'lbs';

  if (mode === 'oz') {
    return swap.weight_oz != null ? { kind: 'text', value: `${swap.weight_oz} oz` } : BLANK;
  }
  if (mode === 'lbs_oz') {
    const parts: string[] = [];
    if (swap.weight != null && swap.weight !== 0) parts.push(`${swap.weight} lbs`);
    if (swap.weight_oz != null && swap.weight_oz !== 0) parts.push(`${swap.weight_oz} oz`);
    return parts.length > 0 ? { kind: 'text', value: parts.join(' ') } : BLANK;
  }
  return swap.weight != null ? { kind: 'text', value: `${swap.weight} lbs` } : BLANK;
}

/**
 * The same weight `formatWeight` renders, in pounds.
 *
 * The zero-suppression in the `lbs_oz` branch is not tidiness, it is the whole
 * reason this cannot be written as a two-line conversion. `formatWeight` drops
 * a zero component, so a record carrying `{weight: 0, weight_oz: 0}` renders
 * blank; a naive reading returns 0, and the two would disagree about whether
 * the catalog knows that record's weight. Mirror the suppression here rather
 * than "fixing" `formatWeight`, which is what the compare matrix and the
 * printed sheet render.
 */
function weightValue(eq: Equipment): number | null {
  const swap = eq.data?.swap ?? {};
  const mode = swap.weight_unit ?? 'lbs';

  if (mode === 'oz') {
    return swap.weight_oz != null ? swap.weight_oz / OZ_PER_LB : null;
  }
  if (mode === 'lbs_oz') {
    const lbs = swap.weight != null && swap.weight !== 0 ? swap.weight : null;
    const oz = swap.weight_oz != null && swap.weight_oz !== 0 ? swap.weight_oz : null;
    if (lbs == null && oz == null) return null;
    return (lbs ?? 0) + (oz ?? 0) / OZ_PER_LB;
  }
  return swap.weight ?? null;
}

function formatSize(eq: Equipment): CompareCell {
  const size = eq.data?.swap?.size ?? {};
  const { length, width, height } = size;
  if (length == null && width == null && height == null) return BLANK;
  const part = (n: number | undefined) => (n == null ? '?' : String(n));
  return { kind: 'text', value: `${part(length)} x ${part(width)} x ${part(height)} in` };
}

/** The static parameters, in the order the datasheet presents them. */
export const COMPARE_PARAMS: CompareParam[] = [
  // Identification
  { id: 'make', label: 'Manufacturer', group: 'identification', appliesTo: 'both', extract: eq => text(eq.make) },
  {
    id: 'type',
    label: 'Terminal Type',
    group: 'identification',
    appliesTo: 'both',
    extract: eq => ({ kind: 'text', value: eq.terminal_type === 'radio' ? 'Radio' : 'SATCOM' }),
  },
  { id: 'nickname', label: 'Nickname', group: 'identification', appliesTo: 'both', extract: eq => text(eq.nickname) },
  { id: 'doc', label: 'Document Number', group: 'identification', appliesTo: 'both', extract: eq => text(eq.doc_number) },
  { id: 'mode', label: 'Operational Mode', group: 'identification', appliesTo: 'both', extract: eq => list(eq.operational_mode ?? []) },

  // Standard specs. antennaType is the only field both unions carry.
  { id: 'std:antenna', label: 'Antenna Type', group: 'standard', appliesTo: 'both', extract: eq => text(satcomSpecs(eq).antennaType) },
  { id: 'std:reflector', label: 'Reflector', group: 'standard', appliesTo: 'satcom', extract: eq => text(satcomSpecs(eq).reflector) },
  { id: 'std:modem', label: 'Modem', group: 'standard', appliesTo: 'satcom', extract: eq => text(satcomSpecs(eq).modem) },
  { id: 'std:orbit', label: 'Orbit', group: 'standard', appliesTo: 'satcom', extract: eq => text(satcomSpecs(eq).orbit) },
  { id: 'std:buc', label: 'BUC TX Power', group: 'standard', appliesTo: 'satcom', extract: eq => num(satcomSpecs(eq).bucTransmitPower, 'W'), compareValue: eq => satcomSpecs(eq).bucTransmitPower ?? null, compareUnit: 'W' },
  { id: 'std:wind', label: 'Wind Tolerance', group: 'standard', appliesTo: 'satcom', extract: eq => num(satcomSpecs(eq).windTolerance, 'mph'), compareValue: eq => satcomSpecs(eq).windTolerance ?? null, compareUnit: 'mph' },
  { id: 'std:altpnt', label: 'ALT-PNT Available', group: 'standard', appliesTo: 'satcom', extract: eq => bool(satcomSpecs(eq).altPntAvailable) },
  { id: 'std:txpower', label: 'TX Power', group: 'standard', appliesTo: 'radio', extract: eq => num(radioSpecs(eq).transmitPower, 'W'), compareValue: eq => radioSpecs(eq).transmitPower ?? null, compareUnit: 'W' },
  { id: 'std:crypto', label: 'Crypto', group: 'standard', appliesTo: 'radio', extract: eq => text(radioSpecs(eq).crypto) },
  {
    id: 'std:range',
    label: 'Range',
    group: 'standard',
    appliesTo: 'radio',
    extract: eq => {
      const specs = radioSpecs(eq);
      return num(specs.range, specs.range_unit ?? 'mi');
    },
    // The one param whose normalized reading must not fall back to its own
    // `num` cell, even though it has one: the unit is per-record, so the
    // fallback would file a 10 km radio and a 10 mi radio under the same
    // number. Every range param declares this explicitly for that reason.
    compareValue: eq => {
      const specs = radioSpecs(eq);
      if (specs.range == null) return null;
      return specs.range_unit === 'km' ? specs.range * MI_PER_KM : specs.range;
    },
    compareUnit: 'mi',
  },

  // SWAP
  { id: 'swap:size', label: 'Size', group: 'swap', appliesTo: 'both', extract: formatSize },
  { id: 'swap:weight', label: 'Weight', group: 'swap', appliesTo: 'both', extract: formatWeight, compareValue: weightValue, compareUnit: 'lbs' },
  { id: 'swap:power', label: 'Power', group: 'swap', appliesTo: 'both', extract: eq => text(eq.data?.swap?.power) },

  // Frequencies. The per-band rows are derived from the selection; see
  // bandCompareParams. This one stays static because "what bands at all" is
  // the first question and should not need six derived rows to answer.
  {
    id: 'bands',
    label: 'Bands',
    group: 'frequencies',
    appliesTo: 'both',
    extract: eq => list(bands(eq).map(b => b.band)),
  },

  // Capabilities
  {
    id: 'waveforms',
    label: 'Waveforms',
    group: 'capabilities',
    appliesTo: 'radio',
    extract: eq => list((eq.data?.waveforms ?? []).map(w => w.abbrev || w.name)),
  },
  {
    id: 'services',
    label: 'Services',
    group: 'capabilities',
    appliesTo: 'satcom',
    extract: eq => list((eq.data?.services ?? []).map(s => s.abbrev || s.name)),
  },

  // No Features row, deliberately. Feature titles are free text written per
  // record ("Leader radio", "Bulk transfer"), so the row never lined one value
  // up against another: it was a column of unrelated phrases, which is not a
  // comparison. Removed after reviewing the printed sheet. The datasheet is
  // where a record's features belong.
];

/**
 * The opening view.
 *
 * Identification, standard specs and SWAP. Not bands, waveforms or services,
 * because a first view with forty rows is not a first view; they are one click
 * away in the picker.
 */
export const DEFAULT_PARAM_IDS: string[] = COMPARE_PARAMS.filter(
  p => p.group === 'identification' || p.group === 'standard' || p.group === 'swap',
).map(p => p.id);

/**
 * Per-band metrics, and the reason they are derived rather than listed.
 *
 * A static cross product is six SATCOM bands times four metrics plus four
 * radio bands times two, and nearly all of it is empty for any real selection.
 * Deriving from the records on screen means the picker offers only rows that
 * would carry data, which is the difference between a parameter list you read
 * and one you scroll past.
 */
interface BandMetric {
  key: string;
  label: string;
  scope: CompareScope;
  read: (band: EquipmentBand) => CompareCell;
}

const BAND_METRICS: BandMetric[] = [
  { key: 'rx', label: 'RX / Downlink', scope: 'satcom', read: b => text(b.downlink) },
  { key: 'tx', label: 'TX / Uplink', scope: 'satcom', read: b => text(b.uplink) },
  { key: 'eirp', label: 'EIRP', scope: 'satcom', read: b => num(b.eirp, 'dBW') },
  { key: 'gt', label: 'G/T', scope: 'satcom', read: b => num(b.gt, 'dB/K') },
  {
    key: 'freq',
    label: 'Frequency',
    scope: 'radio',
    read: b => {
      const unit = b.freq_unit ?? 'MHz';
      if (b.freq_min != null && b.freq_max != null) {
        return { kind: 'text', value: `${b.freq_min}-${b.freq_max} ${unit}` };
      }
      if (b.freq_min != null || b.freq_max != null) return num(b.freq_min ?? b.freq_max, unit);
      // Legacy records carried free-text uplink/downlink before the numeric
      // range existed. FrequencyTable falls back the same way.
      return list([b.downlink, b.uplink]);
    },
  },
  { key: 'txpower', label: 'TX Power', scope: 'radio', read: b => num(b.tx_power, 'W') },
];

/**
 * The identity of a free-text value, for grouping.
 *
 * `orbit`, `band`, `operational_mode` and `make` are all TEXT the editor
 * merely constrains, so "Ka" and "KA" are one thing typed twice and must fold
 * together. Exported because the browse facets group the same fields and a
 * second copy of this rule is a second answer to "is this the same value".
 *
 * It folds case and surrounding space and nothing else. `on the move` and
 * `COTM` stay two values: they mean the same thing, and merging them is a data
 * claim a display layer has no standing to make. Leaving them apart is what
 * makes a catalog with two spellings of one mode visible to someone who can
 * fix it in the editor.
 */
export function normalizeKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Band names are matched case-insensitively, so "Ka" and "KA" are one row. */
function bandKey(band: string | undefined): string {
  return normalizeKey(band);
}

function bandParamId(key: string, metric: string): string {
  // The band key is already lowercased and trimmed. Anything else a band name
  // might hold is squashed so the id survives a round trip through the URL.
  return `band:${key.replace(/[^a-z0-9]+/g, '-')}:${metric}`;
}

/**
 * One parameter per (band, metric) pair that at least one selected record
 * populates.
 *
 * A record without that band yields `blank` rather than `na`: the band is a
 * real thing its type could have, and not having it is a fact worth seeing,
 * not an inapplicability.
 */
export function bandCompareParams(selection: Equipment[]): CompareParam[] {
  // Preserve the display casing of the first record that named the band, so a
  // row reads "Ka" rather than "ka".
  const names = new Map<string, string>();
  for (const eq of selection) {
    for (const band of bands(eq)) {
      const key = bandKey(band.band);
      if (key && !names.has(key)) names.set(key, band.band.trim());
    }
  }

  const params: CompareParam[] = [];
  const ordered = [...names.entries()].sort((a, b) => compareNatural(a[1], b[1]));

  for (const [key, label] of ordered) {
    for (const metric of BAND_METRICS) {
      const populated = selection.some(eq => {
        if (!appliesToType(metric.scope, eq.terminal_type)) return false;
        const band = bands(eq).find(b => bandKey(b.band) === key);
        if (!band) return false;
        const cell = metric.read(band);
        return cell.kind !== 'blank';
      });
      if (!populated) continue;

      params.push({
        id: bandParamId(key, metric.key),
        label: `${label} ${metric.label}`,
        group: 'frequencies',
        appliesTo: metric.scope,
        band: label,
        extract: eq => {
          const band = bands(eq).find(b => bandKey(b.band) === key);
          return band ? metric.read(band) : BLANK;
        },
      });
    }
  }

  return params;
}

/** Every parameter available for a given selection: the static list plus the derived band rows. */
export function paramsForSelection(selection: Equipment[]): CompareParam[] {
  return [...COMPARE_PARAMS, ...bandCompareParams(selection)];
}

export function appliesToType(scope: CompareScope, type: TerminalType): boolean {
  return scope === 'both' || scope === type;
}

/**
 * The single place `na` is produced. See the note on CompareParam.extract.
 */
export function cellFor(param: CompareParam, eq: Equipment): CompareCell {
  if (!appliesToType(param.appliesTo, eq.terminal_type)) return { kind: 'na' };
  return param.extract(eq);
}

/**
 * The numeric counterpart of `cellFor`, and the single place `na` is produced
 * for a normalized value.
 *
 * A parameter with no `compareValue` is not "zero for everything" - it has no
 * numeric reading at all, so every record answers `blank`. That is the same
 * claim `extract` would make and keeps the two aligned by construction.
 */
export function numericCellFor(param: CompareParam, eq: Equipment): CompareCell {
  if (!appliesToType(param.appliesTo, eq.terminal_type)) return { kind: 'na' };
  const value = param.compareValue?.(eq) ?? null;
  return value == null ? BLANK : { kind: 'num', value, unit: param.compareUnit };
}

/**
 * Is this row worth showing at all for the records on screen?
 *
 * A radio-only row against a selection holding no radios is a row of nothing
 * but N/A, which tells the reader only that they did not select a radio. It is
 * hidden instead. Note this is about the selection, not about whether anyone
 * filled the field in: an all-blank row is a real answer and stays.
 */
export function paramIsVisible(param: CompareParam, selection: Equipment[]): boolean {
  if (param.appliesTo === 'both') return true;
  return selection.some(eq => eq.terminal_type === param.appliesTo);
}

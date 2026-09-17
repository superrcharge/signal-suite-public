import type { Equipment } from '@/types';
import type { CompareScope } from './compare-params';
import {
  CATALOG_FACETS,
  bucketMatches,
  facetLabel,
  facetScope,
  facetValues,
  readFacet,
  type FacetSpec,
  type FacetValue,
  type RangeBucket,
} from './facet-params';

/**
 * The browse page's filter state: how it is written to the URL, how it is
 * applied to records, and how the counts beside each value are worked out.
 *
 * Pure. Nothing here renders, and `FacetSidebar` holds no filtering logic of
 * its own - it draws a `FacetModel[]` and calls back. That split is what makes
 * the interesting half (counts, the blank population, stale-link tolerance)
 * testable without mounting anything, the same shape the compare feature took.
 */

export const FACET_PREFIX = 'f.';

/**
 * One term in a facet's selection.
 *
 * Terms within a facet OR; facets AND. `none` is the population a facet's
 * param leaves blank, which is a selectable value in its own right rather than
 * an absence - see `applyFacets`.
 */
export type FacetTerm =
  | { kind: 'value'; key: string }
  | { kind: 'range'; min: number | null; max: number | null }
  | { kind: 'none' };

export type FacetSelection = Record<string, FacetTerm[]>;

/** The browse tab, which decides which facets are admitted at all. */
export type FacetTab = 'all' | 'satcom' | 'radio';

export const EMPTY_SELECTION: FacetSelection = {};

const NONE_TOKEN = '~none';

// ─── Encoding ───────────────────────────────────────────────────────────────

function encodeTerm(term: FacetTerm): string | null {
  if (term.kind === 'none') return NONE_TOKEN;
  if (term.kind === 'value') return term.key;
  if (term.min == null && term.max == null) return null;
  return `${term.min ?? ''}..${term.max ?? ''}`;
}

function parseBound(raw: string): number | null | undefined {
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function decodeTerm(raw: string): FacetTerm | null {
  const token = raw.trim();
  if (!token) return null;
  if (token === NONE_TOKEN) return { kind: 'none' };

  if (token.includes('..')) {
    const [lo, hi] = token.split('..', 2);
    const min = parseBound((lo ?? '').trim());
    const max = parseBound((hi ?? '').trim());
    // A bound that is not a number is a typo, and so is a reversed range. Drop
    // both rather than throwing or silently swapping them - swapping invents an
    // intent the URL did not express, and this page must survive a hand-edited
    // link without an error screen.
    if (min === undefined || max === undefined) return null;
    if (min == null && max == null) return null;
    if (min != null && max != null && min >= max) return null;
    return { kind: 'range', min, max };
  }

  return { kind: 'value', key: token.toLowerCase() };
}

function termId(term: FacetTerm): string {
  return encodeTerm(term) ?? '';
}

export function sameTerm(a: FacetTerm, b: FacetTerm): boolean {
  return termId(a) === termId(b);
}

/**
 * Read the filter state out of a URL.
 *
 * Tolerant by design, and in one place deliberately *less* tolerant than
 * `compare-selection.ts`: a value key no record currently carries is KEPT, not
 * dropped. `resolveSelection` drops a stale equipment id because a deleted
 * record cannot be shown; here, dropping `f.make=nonesuch` would *widen* the
 * result set, so whoever opened the link would see more than the link
 * promised. A stale key renders as a selected chip with a count of zero, which
 * says what happened. This looks like an inconsistency with its neighbour and
 * is the opposite of one.
 */
export function decodeFacets(
  sp: URLSearchParams,
  facets: readonly FacetSpec[] = CATALOG_FACETS,
): FacetSelection {
  const out: FacetSelection = {};
  for (const spec of facets) {
    const raw = sp.get(FACET_PREFIX + spec.id);
    if (!raw) continue;
    const terms: FacetTerm[] = [];
    const seen = new Set<string>();
    for (const token of raw.split(',')) {
      const term = decodeTerm(token);
      if (!term) continue;
      // A range facet has at most one range; a later one supersedes an earlier.
      if (term.kind === 'range') {
        const existing = terms.findIndex(t => t.kind === 'range');
        if (existing >= 0) terms.splice(existing, 1);
      }
      const id = termId(term);
      if (seen.has(id)) continue;
      seen.add(id);
      terms.push(term);
    }
    if (terms.length > 0) out[spec.id] = terms;
  }
  return out;
}

/**
 * Write the filter state back, returning a copy.
 *
 * Every `f.*` key is rewritten from the selection, so a cleared facet
 * disappears rather than lingering as an empty param. Non-facet params (`type`
 * and anything the compare page left behind) are untouched.
 */
export function writeFacets(sp: URLSearchParams, selection: FacetSelection): URLSearchParams {
  const next = new URLSearchParams(sp);
  for (const key of [...next.keys()]) {
    if (key.startsWith(FACET_PREFIX)) next.delete(key);
  }
  for (const [facetId, terms] of Object.entries(selection)) {
    const encoded = terms.map(encodeTerm).filter((t): t is string => t !== null);
    if (encoded.length > 0) next.set(FACET_PREFIX + facetId, encoded.join(','));
  }
  return next;
}

// ─── Mutation, all copy-on-write ────────────────────────────────────────────

function withTerms(selection: FacetSelection, facetId: string, terms: FacetTerm[]): FacetSelection {
  const next = { ...selection };
  if (terms.length > 0) next[facetId] = terms;
  else delete next[facetId];
  return next;
}

export function toggleValue(selection: FacetSelection, facetId: string, key: string): FacetSelection {
  const current = selection[facetId] ?? [];
  const target: FacetTerm = { kind: 'value', key };
  const without = current.filter(t => !sameTerm(t, target));
  return withTerms(selection, facetId, without.length < current.length ? without : [...current, target]);
}

export function toggleNone(selection: FacetSelection, facetId: string): FacetSelection {
  const current = selection[facetId] ?? [];
  const has = current.some(t => t.kind === 'none');
  return withTerms(
    selection,
    facetId,
    has ? current.filter(t => t.kind !== 'none') : [...current, { kind: 'none' }],
  );
}

/** Replace a facet's range. Both bounds null clears it, leaving other terms. */
export function setRange(
  selection: FacetSelection,
  facetId: string,
  min: number | null,
  max: number | null,
): FacetSelection {
  const rest = (selection[facetId] ?? []).filter(t => t.kind !== 'range');
  if (min == null && max == null) return withTerms(selection, facetId, rest);
  if (min != null && max != null && min >= max) return selection;
  return withTerms(selection, facetId, [...rest, { kind: 'range', min, max }]);
}

export function activeRange(
  selection: FacetSelection,
  facetId: string,
): { min: number | null; max: number | null } | null {
  const term = (selection[facetId] ?? []).find(t => t.kind === 'range');
  return term && term.kind === 'range' ? { min: term.min, max: term.max } : null;
}

export function clearFacet(selection: FacetSelection, facetId: string): FacetSelection {
  return withTerms(selection, facetId, []);
}

/**
 * Every term in the URL, whether or not the current tab acts on any of them.
 *
 * Named for what it is. It used to be `activeTermCount` and it used to be what
 * `Filters (n)` and `Clear (n)` printed, which was the whole of that bug: on the
 * SATCOM tab a radio-scoped term is held and deliberately not applied, and both
 * buttons counted it anyway, over a grid nothing had narrowed. No control may
 * print this number. It is the right-hand side of `partitionSelection`'s
 * invariant and nothing else.
 */
export function urlTermCount(selection: FacetSelection): number {
  return Object.values(selection).reduce((n, terms) => n + terms.length, 0);
}

/** Do two ranges name the same span? */
function sameBounds(
  a: { min: number | null; max: number | null },
  b: { min: number | null; max: number | null },
): boolean {
  return a.min === b.min && a.max === b.max;
}

// ─── Applying ───────────────────────────────────────────────────────────────

/**
 * Does one record satisfy one facet's terms?
 *
 * An `na` record fails every term, including `none`. That is the doctrine, not
 * an optimisation: a facet's question does not apply to it, and a record that
 * cannot be asked cannot answer yes. It is also why filtering by Orbit on the
 * All tab removes every radio - correct, and stated in the sidebar rather than
 * left to be discovered.
 */
function recordMatchesFacet(spec: FacetSpec, eq: Equipment, terms: FacetTerm[]): boolean {
  if (terms.length === 0) return true;
  const reading = readFacet(spec, eq);
  if (reading.kind === 'na') return false;

  return terms.some(term => {
    if (term.kind === 'none') return reading.kind === 'blank';
    if (reading.kind === 'blank') return false;
    if (term.kind === 'range') {
      return reading.kind === 'num' && bucketMatches(term, reading.value);
    }
    return reading.kind === 'values' && reading.values.some(v => v.key === term.key);
  });
}

/** Terms within a facet OR; facets AND. */
export function applyFacets(
  pool: Equipment[],
  facets: readonly FacetSpec[],
  selection: FacetSelection,
): Equipment[] {
  const active = facets.filter(spec => (selection[spec.id] ?? []).length > 0);
  if (active.length === 0) return pool;
  return pool.filter(eq =>
    active.every(spec => recordMatchesFacet(spec, eq, selection[spec.id] ?? [])),
  );
}

/** The same, minus one facet - the pool a facet's own counts are taken against. */
function poolExcluding(
  pool: Equipment[],
  facets: readonly FacetSpec[],
  selection: FacetSelection,
  exceptId: string,
): Equipment[] {
  return applyFacets(pool, facets.filter(spec => spec.id !== exceptId), selection);
}

// ─── Visibility ─────────────────────────────────────────────────────────────

function scopeMatchesTab(scope: CompareScope, tab: FacetTab): boolean {
  if (scope === 'both' || tab === 'all') return true;
  return scope === tab;
}

/**
 * The facets a tab admits at all.
 *
 * Scope is the tab's business and nothing else's: Orbit on the Radio tab is
 * not a filter that finds nothing, it is a question radios cannot be asked, so
 * it is neither drawn nor applied. A term for it stays in the URL untouched,
 * so All -> Radio -> All restores a SATCOM filter rather than destroying it -
 * the same non-destructive rule `resolveChosenIds` follows on the compare page.
 *
 * **Pass the tab-and-search pool to anything downstream of this, never the
 * facet-filtered result.** Deciding visibility against the filtered result
 * lets one selection erase another facet: pick an orbit, every radio drops
 * out, and the radio-only Waveforms facet vanishes - possibly the one the
 * reader was about to use, and in the worst case the one they just used.
 */
export function tabFacets(
  facets: readonly FacetSpec[],
  tab: FacetTab,
): FacetSpec[] {
  return facets.filter(spec => scopeMatchesTab(facetScope(spec), tab));
}

// ─── Applied versus paused ──────────────────────────────────────────────────

/** One term the tab is holding, with the words a reader would recognise. */
export interface PausedTerm {
  term: FacetTerm;
  /** "TSM", "Not specified", "Under 50 mi" - never a raw URL token. */
  label: string;
}

/** One held facet's terms, grouped so the rail can say which tab would apply them. */
export interface PausedFacet {
  facetId: string;
  /** `facetLabel(spec)`, or the raw id when no spec knows this facet. */
  label: string;
  /** Which tab *would* apply it. `null` when no spec knows this facet. */
  scope: CompareScope | null;
  terms: PausedTerm[];
}

export interface SelectionSplit {
  /** The sub-selection `applyFacets` will act on. */
  applied: FacetSelection;
  appliedCount: number;
  /** Grouped by facet, in `CATALOG_FACETS` order. */
  paused: PausedFacet[];
  pausedCount: number;
}

function describeTermWith(spec: FacetSpec, term: FacetTerm, values: FacetValue[]): string {
  if (term.kind === 'none') return 'Not specified';

  if (term.kind === 'range') {
    const unit = spec.unit ? ` ${spec.unit}` : '';
    // Only `txpwr` and `weight` carry buckets; `buc`, `wind` and `range` are
    // bare spans, so the fallback below is the common path rather than an edge.
    const bucket = (spec.buckets ?? []).find(b => sameBounds(b, term));
    if (bucket) return `${bucket.label}${unit}`;
    if (term.min == null) return `Under ${String(term.max)}${unit}`;
    if (term.max == null) return `${String(term.min)}+${unit}`;
    return `${String(term.min)} – ${String(term.max)}${unit}`;
  }

  return values.find(v => v.key === term.key)?.label ?? term.key;
}

/**
 * One term, in the words the sidebar would have used had it drawn the facet.
 *
 * Every branch reuses an existing phrasing rather than inventing one: `none`
 * is the "Not specified" chip's own string, a bucketed range is the preset's
 * own label, and a value takes its display casing from the pool.
 *
 * **Pass the whole equipment list, not the page's tab pool.** On
 * `?type=satcom&f.wf=tsm` the tab pool holds only SATCOM records, so the only
 * records carrying `TSM`'s casing are precisely the ones the tab filtered out
 * and the label would silently degrade to the lowercased URL key. Degrading to
 * the key is still honest - it is what the URL says - which is why an unknown
 * key does not throw.
 */
export function describeTerm(
  spec: FacetSpec,
  term: FacetTerm,
  labelPool: Equipment[] = [],
): string {
  const values = spec.kind === 'range' ? [] : facetValues(spec, labelPool);
  return describeTermWith(spec, term, values);
}

/**
 * Split a selection into what this tab applies and what it merely holds.
 *
 * **Defined as the complement of what `applyFacets` iterates, never as a
 * parallel re-derivation.** `applyFacets` acts only on the facets `tabFacets`
 * admits, so a term under any other facet is structurally not applied. This
 * function therefore calls `tabFacets` itself rather than taking an admitted
 * list, which keeps one copy of the admission rule and makes it impossible for
 * a caller to pass a list inconsistent with the registry. It needs the full
 * registry for the other half anyway: a paused facet's spec is by definition
 * not in the admitted list, and the rail still has to name it.
 *
 * **The predicate is structural and must stay that way.** A stale *value* key
 * such as `f.make=nonesuch` counts as APPLIED: `make` is admitted on every tab,
 * so `applyFacets` really does hand it to `recordMatchesFacet` and it really
 * does empty the grid. Calling it paused would be this bug's mirror image -
 * telling the reader a filter is doing nothing while it is the reason they are
 * seeing nothing. It already discloses itself as a selected chip counting zero.
 * The moment "paused" becomes value-dependent, the rail starts offering to drop
 * terms whose removal widens the result from zero to everything.
 *
 * Invariant, asserted in both directions in the tests:
 * `appliedCount + pausedCount === urlTermCount(selection)`.
 */
export function partitionSelection(
  selection: FacetSelection,
  facets: readonly FacetSpec[],
  tab: FacetTab,
  labelPool: Equipment[] = [],
): SelectionSplit {
  const admitted = new Set(tabFacets(facets, tab).map(spec => spec.id));
  const specById = new Map(facets.map(spec => [spec.id, spec]));
  const order = new Map(facets.map((spec, i) => [spec.id, i]));

  const applied: FacetSelection = {};
  let appliedCount = 0;
  const pausedIds: string[] = [];
  let pausedCount = 0;

  for (const [facetId, terms] of Object.entries(selection)) {
    if (terms.length === 0) continue;
    if (admitted.has(facetId)) {
      applied[facetId] = terms;
      appliedCount += terms.length;
    } else {
      pausedIds.push(facetId);
      pausedCount += terms.length;
    }
  }

  // A facet id in neither list - not reachable through `decodeFacets`, which
  // only reads ids the registry declares, but reachable from a hand-built
  // selection. Counted and shown with its raw token rather than dropped:
  // dropping what a check does not understand is how this class of bug returns.
  pausedIds.sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));

  const paused: PausedFacet[] = pausedIds.map(facetId => {
    const spec = specById.get(facetId);
    const terms = selection[facetId] ?? [];
    // Resolved once per facet, not once per term: `facetValues` walks the whole
    // pool, and a facet can hold several terms.
    const values = spec && spec.kind !== 'range' ? facetValues(spec, labelPool) : [];
    return {
      facetId,
      label: spec ? facetLabel(spec) : facetId,
      scope: spec ? facetScope(spec) : null,
      terms: terms.map(term => ({
        term,
        label: spec ? describeTermWith(spec, term, values) : (encodeTerm(term) ?? facetId),
      })),
    };
  });

  return { applied, appliedCount, paused, pausedCount };
}

/**
 * Drop what this tab is applying, keep what it is holding.
 *
 * This is what `Clear (n)` does, and the pairing is the point: the button must
 * remove exactly the terms the number counted. Clearing everything while
 * counting only the applied ones would relocate the bug rather than fix it, and it
 * would destroy a held term through a button - the same destruction `tabFacets`
 * refuses to do through a tab switch.
 */
export function clearApplied(
  selection: FacetSelection,
  facets: readonly FacetSpec[],
  tab: FacetTab,
): FacetSelection {
  const admitted = new Set(tabFacets(facets, tab).map(spec => spec.id));
  return pickFacets(selection, facetId => !admitted.has(facetId));
}

/** The mirror: drop what this tab is holding but not applying. */
export function clearPaused(
  selection: FacetSelection,
  facets: readonly FacetSpec[],
  tab: FacetTab,
): FacetSelection {
  const admitted = new Set(tabFacets(facets, tab).map(spec => spec.id));
  return pickFacets(selection, facetId => admitted.has(facetId));
}

function pickFacets(
  selection: FacetSelection,
  keep: (facetId: string) => boolean,
): FacetSelection {
  const next: FacetSelection = {};
  for (const [facetId, terms] of Object.entries(selection)) {
    if (terms.length > 0 && keep(facetId)) next[facetId] = terms;
  }
  return next;
}

/**
 * Drop exactly one term, wherever it lives.
 *
 * The "clear just that one" a paused chip offers, and the only way to reach a
 * term whose facet the current tab does not draw. Inherits `withTerms`' rule
 * that a facet disappears with its last term.
 */
export function clearTerm(
  selection: FacetSelection,
  facetId: string,
  term: FacetTerm,
): FacetSelection {
  const current = selection[facetId] ?? [];
  return withTerms(selection, facetId, current.filter(t => !sameTerm(t, term)));
}

// ─── The model the sidebar draws ────────────────────────────────────────────

export interface FacetValueCount extends FacetValue {
  count: number;
  selected: boolean;
}

export interface FacetPresetCount extends RangeBucket {
  count: number;
  selected: boolean;
}

export interface FacetModel {
  facet: FacetSpec;
  label: string;
  scope: CompareScope;
  /** Value and bool facets. Empty for a range facet. */
  values: FacetValueCount[];
  /** Range facets only. */
  presets: FacetPresetCount[];
  range: { min: number | null; max: number | null } | null;
  /**
   * The lowest and highest value the pool actually holds, for a range facet.
   *
   * It is what makes a bucketless range control usable: "Under [__] mi" with
   * no sense of scale is a control you have to guess at, and three of the five
   * range facets have no sensible fixed cuts to offer instead. Taken from the
   * pool rather than the filtered result, for the same reason `discriminates`
   * is - a hint that moved every time another filter changed would be noise.
   */
  span: { min: number; max: number } | null;
  unit?: string;
  /** The population this facet's param leaves empty, and whether it is selected. */
  blank: { count: number; selected: boolean };
  /**
   * How many records the facet does not apply to at all. Non-zero only on the
   * All tab, where it becomes the "radios excluded (4)" note.
   */
  naCount: number;
  /** How many of this facet's terms are currently set. */
  activeCount: number;
  /**
   * Whether this facet can tell the pool apart at all.
   *
   * A facet with one distinct answer - Orbit when every record is GEO - is a
   * control whose only setting is "everything", so the sidebar leaves it out.
   * It is a **display** judgement and deliberately not a filtering one: the
   * facet is still applied when a link carries a term for it, because dropping
   * it would widen the result set, which is the one thing a shared link must
   * never do. `FacetSidebar` is shown any facet with `activeCount > 0`
   * regardless, so an applied filter always has a visible way to turn it off.
   */
  discriminates: boolean;
}

/**
 * Counts, and the one decision that makes them honest.
 *
 * **A value's count is taken against every active filter EXCEPT its own
 * facet's.** With the own facet included, checking Ka would drop every other
 * band to zero - telling the reader that clicking Ku yields nothing at the
 * exact moment that is false, since within a facet the terms OR and Ku would
 * *add* records. Excluding it, the number always reads as "results if this were
 * also checked", zero means it, and a count does not jump when it is clicked.
 *
 * The tab and the search box are not facets. They scope the pool, so they apply
 * to every count including the facet's own.
 */
export function buildFacetModels(
  pool: Equipment[],
  facets: readonly FacetSpec[],
  selection: FacetSelection,
): FacetModel[] {
  return facets.map(spec => {
    const terms = selection[spec.id] ?? [];
    const counted = poolExcluding(pool, facets, selection, spec.id);

    let blankCount = 0;
    let naCount = 0;
    const valueCounts = new Map<string, number>();
    const numbers: number[] = [];

    for (const eq of counted) {
      const reading = readFacet(spec, eq);
      if (reading.kind === 'na') naCount += 1;
      else if (reading.kind === 'blank') blankCount += 1;
      else if (reading.kind === 'num') numbers.push(reading.value);
      else for (const v of reading.values) valueCounts.set(v.key, (valueCounts.get(v.key) ?? 0) + 1);
    }

    const isSelected = (key: string) =>
      terms.some(t => t.kind === 'value' && t.key === key);

    // The universe comes from the whole pool, not the counted subset, so a
    // value does not disappear from the sidebar the moment another facet
    // excludes it - it goes to zero, which is information.
    const values: FacetValueCount[] = facetValues(spec, pool).map(v => ({
      ...v,
      count: valueCounts.get(v.key) ?? 0,
      selected: isSelected(v.key),
    }));
    // A selected key nothing carries came from a link, and has to stay
    // clickable or it can never be turned off.
    for (const term of terms) {
      if (term.kind !== 'value') continue;
      if (values.some(v => v.key === term.key)) continue;
      values.push({ key: term.key, label: term.key, count: 0, selected: true });
    }

    // Variance is a property of the pool, not of what other facets have left
    // of it, or turning one filter on could hide the facet beside it.
    const poolNumbers: number[] = [];
    if (spec.kind === 'range') {
      for (const eq of pool) {
        const reading = readFacet(spec, eq);
        if (reading.kind === 'num') poolNumbers.push(reading.value);
      }
    }

    const span = poolNumbers.length > 0
      ? { min: Math.min(...poolNumbers), max: Math.max(...poolNumbers) }
      : null;

    const range = activeRange(selection, spec.id);
    const presets: FacetPresetCount[] = (spec.buckets ?? []).map(bucket => ({
      ...bucket,
      count: numbers.filter(n => bucketMatches(bucket, n)).length,
      selected: range != null && sameBounds(range, bucket),
    }));

    return {
      facet: spec,
      label: facetLabel(spec),
      scope: facetScope(spec),
      values,
      presets,
      range,
      span,
      unit: spec.unit,
      blank: { count: blankCount, selected: terms.some(t => t.kind === 'none') },
      naCount,
      activeCount: terms.length,
      discriminates: spec.kind === 'range'
        ? new Set(poolNumbers).size > 1
        : facetValues(spec, pool).length > 1,
    };
  });
}

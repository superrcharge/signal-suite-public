import { describe, it, expect } from 'vitest';
import type { Equipment, EquipmentData, TerminalType } from '@/types';
import { CATALOG_FACETS } from './facet-params';
import {
  FACET_PREFIX,
  activeRange,
  applyFacets,
  buildFacetModels,
  clearApplied,
  clearFacet,
  clearPaused,
  clearTerm,
  decodeFacets,
  describeTerm,
  partitionSelection,
  tabFacets,
  setRange,
  toggleNone,
  toggleValue,
  urlTermCount,
  writeFacets,
  type FacetSelection,
  type FacetTab,
} from './facet-selection';

function equipment(
  id: string,
  terminal_type: TerminalType,
  data?: Partial<EquipmentData>,
  overrides: Partial<Equipment> = {},
): Equipment {
  return {
    id,
    nomenclature: id.toUpperCase(),
    terminal_type,
    operational_mode: [],
    data: data as EquipmentData | undefined,
    created_by: 'test',
    updated_by: 'test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Shaped after the seeded dev catalog, including its untidy corners. */
const POOL: Equipment[] = [
  equipment('prc-152', 'radio', {
    swap: { weight: 2, weight_oz: 12, weight_unit: 'lbs_oz' },
    bands: [{ band: 'VHF' }, { band: 'UHF' }],
  }, { make: 'L3Harris', operational_mode: ['COTM'] }),
  equipment('prc-163', 'radio', {
    swap: { weight_oz: 38, weight_unit: 'oz' },
    bands: [{ band: 'UHF' }],
  }, { make: 'L3Harris', operational_mode: ['COTM'] }),
  equipment('mpu5', 'radio', {
    swap: { weight: 3, weight_unit: 'lbs' },
    bands: [{ band: 'L' }],
  }, { make: 'Persistent Systems', operational_mode: ['COTM'] }),
  equipment('gx-2', 'satcom', {
    swap: { weight: 41 },
    bands: [{ band: 'Ka' }, { band: 'Ku' }],
    standard_specs: { orbit: 'GEO', altPntAvailable: true },
  }, { make: 'Paradigm', operational_mode: ['COTP'] }),
  equipment('be-900', 'satcom', {
    swap: { weight: 165 },
    bands: [{ band: 'Ku' }],
    standard_specs: { orbit: 'GEO', altPntAvailable: false },
  }, { make: 'Ragno Systems', operational_mode: ['COTP'] }),
  equipment('gx-220', 'satcom', {
    bands: [{ band: 'Ka' }],
    standard_specs: { orbit: 'LEO' },
  }, { make: 'Paradigm', operational_mode: ['COTP'] }),   // no weight, no altpnt
];

const ids = (list: Equipment[]) => list.map(e => e.id).sort();

describe('decode / write', () => {
  const round = (query: string): FacetSelection => decodeFacets(new URLSearchParams(query));

  it('round trips a mixed selection', () => {
    const query = 'type=satcom&f.band=ka,ku&f.weight=..20&f.make=~none';
    const decoded = round(query);
    const written = writeFacets(new URLSearchParams(query), decoded);
    expect(written.get('f.band')).toBe('ka,ku');
    expect(written.get('f.weight')).toBe('..20');
    expect(written.get('f.make')).toBe('~none');
    // Not a facet param, so it is none of this codec's business.
    expect(written.get('type')).toBe('satcom');
  });

  it('parses the three term shapes', () => {
    expect(round('f.band=ka')).toEqual({ band: [{ kind: 'value', key: 'ka' }] });
    expect(round('f.weight=20..50')).toEqual({ weight: [{ kind: 'range', min: 20, max: 50 }] });
    expect(round('f.weight=20..')).toEqual({ weight: [{ kind: 'range', min: 20, max: null }] });
    expect(round('f.make=~none')).toEqual({ make: [{ kind: 'none' }] });
  });

  it('folds case on a value key', () => {
    expect(round('f.band=KA')).toEqual({ band: [{ kind: 'value', key: 'ka' }] });
  });

  it('drops a malformed range rather than throwing or guessing', () => {
    expect(round('f.weight=abc..')).toEqual({});
    expect(round('f.weight=20..5')).toEqual({});   // reversed: a typo, not an intent to swap
    expect(round('f.weight=..')).toEqual({});
  });

  it('drops an unknown facet and dedupes repeats', () => {
    expect(round('f.nosuch=1')).toEqual({});
    expect(round('f.band=ka,ka,ku').band).toHaveLength(2);
  });

  /**
   * The deliberate difference from compare-selection. Dropping a stale value
   * key would WIDEN the result, so whoever opened the link would see more than
   * it promised.
   */
  it('keeps a value key no record carries', () => {
    expect(round('f.make=nonesuch')).toEqual({ make: [{ kind: 'value', key: 'nonesuch' }] });
    expect(applyFacets(POOL, CATALOG_FACETS, round('f.make=nonesuch'))).toEqual([]);
  });

  it('clears a facet out of the URL rather than leaving it empty', () => {
    const sp = new URLSearchParams('type=radio&f.band=ka');
    const written = writeFacets(sp, clearFacet(decodeFacets(sp), 'band'));
    expect(written.has('f.band')).toBe(false);
    expect(written.get('type')).toBe('radio');
  });

  it('uses the documented prefix', () => {
    expect(FACET_PREFIX).toBe('f.');
  });
});

describe('mutation', () => {
  it('toggles a value on and back off', () => {
    let sel = toggleValue({}, 'band', 'ka');
    expect(sel.band).toEqual([{ kind: 'value', key: 'ka' }]);
    sel = toggleValue(sel, 'band', 'ku');
    expect(sel.band).toHaveLength(2);
    sel = toggleValue(sel, 'band', 'ka');
    expect(sel.band).toEqual([{ kind: 'value', key: 'ku' }]);
    expect(urlTermCount(sel)).toBe(1);
    // The last term out takes the facet with it.
    expect(toggleValue(sel, 'band', 'ku')).toEqual({});
  });

  it('replaces a range rather than accumulating them', () => {
    let sel = setRange({}, 'weight', null, 20);
    sel = setRange(sel, 'weight', 20, 50);
    expect(sel.weight).toEqual([{ kind: 'range', min: 20, max: 50 }]);
    expect(activeRange(sel, 'weight')).toEqual({ min: 20, max: 50 });
  });

  // The blank toggle is a term like any other, so it survives a range change.
  it('keeps the blank term when the range changes', () => {
    let sel = toggleNone({}, 'weight');
    sel = setRange(sel, 'weight', null, 20);
    expect(sel.weight).toHaveLength(2);
    sel = setRange(sel, 'weight', null, null);
    expect(sel.weight).toEqual([{ kind: 'none' }]);
  });

  it('refuses a reversed range', () => {
    expect(setRange({}, 'weight', 50, 20)).toEqual({});
  });
});

describe('applyFacets', () => {
  const sel = (q: string) => decodeFacets(new URLSearchParams(q));
  const run = (q: string) => ids(applyFacets(POOL, CATALOG_FACETS, sel(q)));

  it('ORs within a facet', () => {
    expect(run('f.band=ka,ku')).toEqual(['be-900', 'gx-2', 'gx-220']);
  });

  it('ANDs across facets', () => {
    expect(run('f.band=ka&f.make=paradigm')).toEqual(['gx-2', 'gx-220']);
  });

  it('normalizes four weight units into one bucket', () => {
    expect(run('f.weight=..20')).toEqual(['mpu5', 'prc-152', 'prc-163']);
    expect(run('f.weight=150..')).toEqual(['be-900']);
  });

  it('excludes a record with no value from a range, and says so via the blank term', () => {
    expect(run('f.weight=150..')).not.toContain('gx-220');   // no weight entered
    expect(run('f.weight=~none')).toEqual(['gx-220']);
    // The two OR back together.
    expect(run('f.weight=150..,~none')).toEqual(['be-900', 'gx-220']);
  });

  /**
   * A record the question does not apply to cannot answer it yes. This is why
   * the sidebar prints "radios excluded" rather than letting it be discovered.
   */
  it('excludes na records from a scoped facet, including from ~none', () => {
    expect(run('f.orbit=geo')).toEqual(['be-900', 'gx-2']);
    expect(run('f.orbit=~none')).toEqual([]);   // no satcom lacks an orbit; no radio qualifies
  });

  it('tells a false apart from an unset on a bool facet', () => {
    expect(run('f.altpnt=no')).toEqual(['be-900']);
    expect(run('f.altpnt=~none')).toEqual(['gx-220']);
  });

  it('returns the pool untouched with nothing selected', () => {
    expect(applyFacets(POOL, CATALOG_FACETS, {})).toBe(POOL);
  });
});

describe('tabFacets', () => {
  const idsOf = (tab: 'all' | 'satcom' | 'radio') => tabFacets(CATALOG_FACETS, tab).map(f => f.id);

  it('drops facets the tab cannot be asked', () => {
    expect(idsOf('radio')).not.toContain('orbit');
    expect(idsOf('radio')).not.toContain('altpnt');
    expect(idsOf('satcom')).not.toContain('range');
  });

  it('admits both scopes on the All tab', () => {
    expect(idsOf('all')).toContain('orbit');
    expect(idsOf('all')).toContain('range');
  });
});

describe('buildFacetModels', () => {
  const models = (sel: FacetSelection, pool = POOL) =>
    buildFacetModels(pool, CATALOG_FACETS, sel);
  const model = (sel: FacetSelection, id: string) => {
    const m = models(sel).find(x => x.facet.id === id);
    if (!m) throw new Error(`no model ${id}`);
    return m;
  };
  const countOf = (sel: FacetSelection, facetId: string, key: string) =>
    model(sel, facetId).values.find(v => v.key === key)?.count;

  /**
   * The decision the whole sidebar rests on. With the own facet included,
   * every unselected band would read 0 the moment one was checked - which is
   * false, since terms within a facet OR and Ku would ADD records.
   */
  it('counts a value against every filter except its own facet', () => {
    const withKa = decodeFacets(new URLSearchParams('f.band=ka'));
    expect(countOf(withKa, 'band', 'ku')).toBe(2);
    // ...and the selected value's own count does not move when it is clicked.
    expect(countOf({}, 'band', 'ka')).toBe(countOf(withKa, 'band', 'ka'));
  });

  it('still narrows other facets', () => {
    const withKa = decodeFacets(new URLSearchParams('f.band=ka'));
    expect(countOf(withKa, 'make', 'l3harris')).toBe(0);
    expect(countOf({}, 'make', 'l3harris')).toBe(2);
  });

  it('keeps a zero-count value listed rather than reflowing it away', () => {
    const withKa = decodeFacets(new URLSearchParams('f.band=ka'));
    expect(model(withKa, 'make').values.map(v => v.key)).toContain('l3harris');
  });

  it('keeps a selected value nothing carries clickable, so it can be undone', () => {
    const stale = decodeFacets(new URLSearchParams('f.make=nonesuch'));
    const entry = model(stale, 'make').values.find(v => v.key === 'nonesuch');
    expect(entry).toMatchObject({ selected: true, count: 0 });
  });

  it('reports the blank population separately from the values', () => {
    const weight = model({}, 'weight');
    expect(weight.blank.count).toBe(1);          // gx-220 has no weight
    expect(weight.blank.selected).toBe(false);
  });

  it('counts na records apart from blank ones', () => {
    const orbit = model({}, 'orbit');
    expect(orbit.naCount).toBe(3);               // the three radios
    expect(orbit.blank.count).toBe(0);           // every satcom has an orbit
  });

  it('counts each preset over the normalized numbers', () => {
    const weight = model({}, 'weight');
    const byLabel = Object.fromEntries(weight.presets.map(p => [p.label, p.count]));
    expect(byLabel['Under 20']).toBe(3);
    expect(byLabel['20 – 50']).toBe(1);
    expect(byLabel['150+']).toBe(1);
  });

  it('marks the preset that matches the active range', () => {
    const sel = setRange({}, 'weight', null, 20);
    const active = model(sel, 'weight').presets.filter(p => p.selected);
    expect(active.map(p => p.label)).toEqual(['Under 20']);
  });

  it('reports how many terms a facet has set', () => {
    const sel = decodeFacets(new URLSearchParams('f.band=ka,ku'));
    expect(model(sel, 'band').activeCount).toBe(2);
    expect(model(sel, 'make').activeCount).toBe(0);
  });

  /**
   * The rule that separates drawing a facet from applying it.
   *
   * Hiding a one-answer facet is a display judgement. Letting that hide also
   * *drop its filter* would silently widen a shared link's result set - the
   * same failure the stale-key rule above exists to prevent, arriving through
   * a different door. It was live for one build before the browser caught it.
   */
  it('marks a one-answer facet as non-discriminating without disarming it', () => {
    const allGeo = POOL.filter(e => e.terminal_type === 'satcom' && e.id !== 'gx-220');
    const sel = decodeFacets(new URLSearchParams('f.orbit=geo'));
    const orbit = buildFacetModels(allGeo, CATALOG_FACETS, sel).find(m => m.facet.id === 'orbit');
    expect(orbit?.discriminates).toBe(false);
    // Not drawn on its own merit, but drawn anyway because it is switched on.
    expect(orbit?.activeCount).toBe(1);
  });

  it('reports a facet that can tell the pool apart', () => {
    const m = buildFacetModels(POOL, CATALOG_FACETS, {});
    expect(m.find(x => x.facet.id === 'band')?.discriminates).toBe(true);
    expect(m.find(x => x.facet.id === 'weight')?.discriminates).toBe(true);
  });

  // Variance is a property of the pool. Computing it against what other
  // facets have left would let one filter hide the facet beside it.
  it('does not let one filter make another facet look uniform', () => {
    const sel = decodeFacets(new URLSearchParams('f.make=paradigm'));
    const band = buildFacetModels(POOL, CATALOG_FACETS, sel).find(m => m.facet.id === 'band');
    expect(band?.discriminates).toBe(true);
  });

  it('reports the pool span for a range facet, so a bucketless box has a scale', () => {
    const weight = buildFacetModels(POOL, CATALOG_FACETS, {}).find(m => m.facet.id === 'weight');
    expect(weight?.span?.min).toBeCloseTo(2.375);
    expect(weight?.span?.max).toBe(165);
  });

  it('reports no span when nothing in the pool carries a number', () => {
    const noWeights = [equipment('a', 'satcom'), equipment('b', 'satcom')];
    const weight = buildFacetModels(noWeights, CATALOG_FACETS, {}).find(m => m.facet.id === 'weight');
    expect(weight?.span).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The bug: a term the tab holds but does not apply was still being counted, so
// `Filters (1)` and `Clear (1)` sat above a grid nothing had narrowed and the
// facet had no chip to switch off, because the tab does not draw it.
// ─────────────────────────────────────────────────────────────────────────────

describe('applied versus paused', () => {
  const sel = (query: string): FacetSelection => decodeFacets(new URLSearchParams(query));
  const split = (query: string, tab: FacetTab, pool: Equipment[] = POOL) =>
    partitionSelection(sel(query), CATALOG_FACETS, tab, pool);

  const TABS: FacetTab[] = ['all', 'satcom', 'radio'];

  it('splits a scoped term out of the count, and names it', () => {
    const s = split('f.band=ka&f.wf=tsm', 'satcom');

    expect(s.appliedCount).toBe(1);
    expect(s.applied).toEqual({ band: [{ kind: 'value', key: 'ka' }] });

    expect(s.pausedCount).toBe(1);
    expect(s.paused).toHaveLength(1);
    expect(s.paused[0]!.facetId).toBe('wf');
    expect(s.paused[0]!.label).toBe('Waveforms');
    expect(s.paused[0]!.scope).toBe('radio');
    expect(s.paused[0]!.terms).toHaveLength(1);
  });

  /**
   * The invariant. Every term in the URL lands on exactly one side, so a future
   * change cannot quietly drop one: dropping what a rule does not understand is
   * how the class of bug this fixes comes back.
   */
  it('accounts for every term in the URL, on every tab', () => {
    const query = 'f.band=ka&f.wf=tsm&f.orbit=geo&f.make=~none&f.weight=..20';
    for (const tab of TABS) {
      const s = split(query, tab);
      expect(s.appliedCount + s.pausedCount, `tab ${tab}`).toBe(urlTermCount(sel(query)));
    }
  });

  /**
   * The partition mirrors application rather than re-deriving it. If these ever
   * disagree, the count is describing a filter run that did not happen.
   */
  it('applies exactly what applyFacets would apply', () => {
    const query = 'f.band=ka&f.wf=tsm&f.orbit=geo';
    for (const tab of TABS) {
      const facets = tabFacets(CATALOG_FACETS, tab);
      const s = split(query, tab);
      expect(ids(applyFacets(POOL, facets, s.applied)), `tab ${tab}`)
        .toEqual(ids(applyFacets(POOL, facets, sel(query))));
    }
  });

  it('pauses nothing on the All tab, which admits every facet', () => {
    const s = split('f.wf=tsm&f.orbit=geo', 'all');
    expect(s.pausedCount).toBe(0);
    expect(s.appliedCount).toBe(2);
  });

  /**
   * The line that must stay structural. `make` is admitted on every tab, so a
   * key no record carries IS applied and IS why the grid is empty. Calling it
   * paused would be this bug's mirror image.
   */
  it('counts a stale value key as applied, not paused', () => {
    const s = split('f.make=nonesuch', 'satcom');
    expect(s.appliedCount).toBe(1);
    expect(s.pausedCount).toBe(0);
    expect(applyFacets(POOL, tabFacets(CATALOG_FACETS, 'satcom'), s.applied)).toEqual([]);
  });

  it('falls back to the URL token for a stale key on a paused facet', () => {
    const s = split('f.wf=nonesuch', 'satcom');
    expect(s.pausedCount).toBe(1);
    expect(s.paused[0]!.terms[0]!.label).toBe('nonesuch');
  });

  it('keeps an unknown facet id rather than dropping it', () => {
    const hand: FacetSelection = { nosuchfacet: [{ kind: 'value', key: 'x' }] };
    const s = partitionSelection(hand, CATALOG_FACETS, 'radio', POOL);
    expect(s.pausedCount).toBe(1);
    expect(s.paused[0]!.label).toBe('nosuchfacet');
    expect(s.paused[0]!.scope).toBeNull();
    expect(s.appliedCount + s.pausedCount).toBe(urlTermCount(hand));
  });
});

describe('describeTerm', () => {
  const spec = (id: string) => CATALOG_FACETS.find(f => f.id === id)!;

  it('names the blank population the way its chip does', () => {
    expect(describeTerm(spec('orbit'), { kind: 'none' })).toBe('Not specified');
  });

  it('uses a bucket label when the bounds match a preset', () => {
    expect(describeTerm(spec('txpwr'), { kind: 'range', min: 5, max: 20 })).toBe('5 – 20 W');
  });

  /** buc, wind and range carry no buckets at all, so this is the common path. */
  it('formats a bare span with its unit', () => {
    expect(describeTerm(spec('range'), { kind: 'range', min: null, max: 50 })).toBe('Under 50 mi');
    expect(describeTerm(spec('buc'), { kind: 'range', min: 25, max: null })).toBe('25+ W');
    expect(describeTerm(spec('wind'), { kind: 'range', min: 10, max: 40 })).toBe('10 – 40 mph');
  });

  it('takes display casing from the pool, and the raw key without one', () => {
    expect(describeTerm(spec('make'), { kind: 'value', key: 'paradigm' }, POOL)).toBe('Paradigm');
    expect(describeTerm(spec('make'), { kind: 'value', key: 'paradigm' })).toBe('paradigm');
  });
});

describe('clearing', () => {
  const sel = (query: string): FacetSelection => decodeFacets(new URLSearchParams(query));

  /**
   * The pairing that makes the count honest: Clear removes exactly the terms it
   * counted. Before this, Clear on the SATCOM tab destroyed a held radio term -
   * the destruction `tabFacets` refuses to do through a tab switch, arriving
   * through a button instead.
   */
  it('clearApplied keeps the paused terms, in the URL too', () => {
    const s = sel('f.band=ka&f.wf=tsm');
    const next = clearApplied(s, CATALOG_FACETS, 'satcom');
    expect(next).toEqual({ wf: [{ kind: 'value', key: 'tsm' }] });

    const written = writeFacets(new URLSearchParams('type=satcom&f.band=ka&f.wf=tsm'), next);
    expect(written.get('f.wf')).toBe('tsm');
    expect(written.has('f.band')).toBe(false);
  });

  it('clearPaused is its mirror', () => {
    const s = sel('f.band=ka&f.wf=tsm');
    expect(clearPaused(s, CATALOG_FACETS, 'satcom')).toEqual({
      band: [{ kind: 'value', key: 'ka' }],
    });
  });

  it('clearTerm drops one term, and the facet with its last', () => {
    const s = sel('f.band=ka,ku');
    const one = clearTerm(s, 'band', { kind: 'value', key: 'ka' });
    expect(one).toEqual({ band: [{ kind: 'value', key: 'ku' }] });
    expect(clearTerm(one, 'band', { kind: 'value', key: 'ku' })).toEqual({});
  });

  it('clearTerm reaches a term whose facet the tab does not draw', () => {
    const s = sel('f.band=ka&f.wf=tsm');
    expect(clearTerm(s, 'wf', { kind: 'value', key: 'tsm' })).toEqual({
      band: [{ kind: 'value', key: 'ka' }],
    });
  });
});

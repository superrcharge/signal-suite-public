import { describe, it, expect } from 'vitest';
import type { Equipment, EquipmentData, TerminalType } from '@/types';
import { COMPARE_PARAMS } from './compare-params';
import {
  CATALOG_FACETS,
  RESERVED_PARAMS,
  bucketMatches,
  facetLabel,
  facetParam,
  facetScope,
  facetValues,
  readFacet,
  type FacetSpec,
} from './facet-params';

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

const facet = (id: string): FacetSpec => {
  const spec = CATALOG_FACETS.find(f => f.id === id);
  if (!spec) throw new Error(`no facet ${id}`);
  return spec;
};

describe('the registry', () => {
  it('names a real compare param for every facet', () => {
    for (const spec of CATALOG_FACETS) {
      expect(() => facetParam(spec), spec.id).not.toThrow();
    }
  });

  it('throws loudly on an unresolved param rather than vanishing', () => {
    expect(() => facetParam({ id: 'x', param: 'nope', kind: 'value' })).toThrow(/nope/);
  });

  it('keeps facet ids unique and clear of the params this page already owns', () => {
    const ids = CATALOG_FACETS.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(RESERVED_PARAMS).not.toContain(id);
  });

  it('keeps every id safe in a query string', () => {
    for (const { id } of CATALOG_FACETS) {
      expect(id).not.toContain(',');
      expect(id).not.toMatch(/[\s.~]/);
    }
  });

  // The unit is what a range control prints beside the box. The value it
  // filters on is normalized, so a mismatch here would mislabel what the
  // reader just typed - "under 20 km" filtering pounds.
  it('gives every range facet a compareValue and a matching unit', () => {
    for (const spec of CATALOG_FACETS) {
      if (spec.kind !== 'range') continue;
      const param = facetParam(spec);
      expect(param.compareValue, spec.id).toBeDefined();
      expect(spec.unit, spec.id).toBe(param.compareUnit);
    }
  });

  it('only puts buckets on range facets', () => {
    for (const spec of CATALOG_FACETS) {
      if (spec.kind !== 'range') expect(spec.buckets, spec.id).toBeUndefined();
    }
  });

  // A bucket set that overlaps would count one record twice and make the
  // numbers beside the presets add up to more than the catalog holds.
  it('cuts non-overlapping buckets', () => {
    for (const spec of CATALOG_FACETS) {
      for (const probe of [0, 4.9, 5, 19.99, 20, 49, 50, 149, 150, 1450]) {
        const hits = (spec.buckets ?? []).filter(b => bucketMatches(b, probe));
        expect(hits.length, `${spec.id} @ ${String(probe)}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('takes its label from the param unless it overrides one', () => {
    expect(facetLabel(facet('mode'))).toBe('Operational Mode');
    expect(facetLabel(facet('make'))).toBe('Manufacturer');
  });

  it('inherits scoping from the param rather than restating it', () => {
    expect(facetScope(facet('orbit'))).toBe('satcom');
    expect(facetScope(facet('range'))).toBe('radio');
    expect(facetScope(facet('make'))).toBe('both');
  });
});

describe('readFacet', () => {
  it('separates na from blank', () => {
    // Orbit is a SATCOM parameter, so a radio is not part of its population...
    expect(readFacet(facet('orbit'), equipment('r', 'radio'))).toEqual({ kind: 'na' });
    // ...while a satcom with no orbit entered is a gap someone can close.
    expect(readFacet(facet('orbit'), equipment('s', 'satcom'))).toEqual({ kind: 'blank' });
  });

  it('reads a list param as many values and folds a repeat', () => {
    const eq = equipment('s', 'satcom', { bands: [{ band: 'Ka' }, { band: 'ka' }, { band: 'Ku' }] });
    expect(readFacet(facet('band'), eq)).toEqual({
      kind: 'values',
      values: [{ key: 'ka', label: 'Ka' }, { key: 'ku', label: 'Ku' }],
    });
  });

  it('reads a bool param as Yes or No, never as a missing value', () => {
    const yes = equipment('a', 'satcom', { standard_specs: { altPntAvailable: true } });
    const no = equipment('b', 'satcom', { standard_specs: { altPntAvailable: false } });
    expect(readFacet(facet('altpnt'), yes)).toEqual({ kind: 'values', values: [{ key: 'yes', label: 'Yes' }] });
    expect(readFacet(facet('altpnt'), no)).toEqual({ kind: 'values', values: [{ key: 'no', label: 'No' }] });
    // Unset is a third answer - nobody checked - and must not read as No.
    expect(readFacet(facet('altpnt'), equipment('c', 'satcom'))).toEqual({ kind: 'blank' });
  });

  it('reads a range param as one normalized number', () => {
    const oz = equipment('r', 'radio', { swap: { weight_oz: 38, weight_unit: 'oz' } });
    const reading = readFacet(facet('weight'), oz);
    expect(reading.kind).toBe('num');
    if (reading.kind === 'num') expect(reading.value).toBeCloseTo(2.375);
  });

  it('treats whitespace-only text as blank, not as a value', () => {
    const eq = equipment('s', 'satcom', undefined, { make: '   ' });
    expect(readFacet(facet('make'), eq)).toEqual({ kind: 'blank' });
  });
});

describe('facetValues', () => {
  const pool = [
    equipment('a', 'satcom', { bands: [{ band: 'Ka' }, { band: 'Ku' }] }),
    equipment('b', 'satcom', { bands: [{ band: 'ka' }, { band: 'X' }] }),
    equipment('c', 'radio', { bands: [{ band: 'UHF' }] }),
  ];

  // The reason catalog-vocab had to be shared: alphabetical would print
  // Ka, Ku, UHF, X and scramble the spectrum.
  it('orders a curated vocabulary by the curated order, not by count', () => {
    expect(facetValues(facet('band'), pool).map(v => v.key)).toEqual(['x', 'ku', 'ka', 'uhf']);
  });

  it('folds case and keeps the first casing seen', () => {
    const values = facetValues(facet('band'), pool);
    expect(values.find(v => v.key === 'ka')?.label).toBe('Ka');
  });

  it('orders an uncurated vocabulary by count, then naturally', () => {
    const makes = [
      equipment('a', 'satcom', undefined, { make: 'Paradigm' }),
      equipment('b', 'satcom', undefined, { make: 'L3Harris' }),
      equipment('c', 'satcom', undefined, { make: 'L3Harris' }),
      equipment('d', 'satcom', undefined, { make: 'Aardvark' }),
    ];
    expect(facetValues(facet('make'), makes).map(v => v.label)).toEqual([
      'L3Harris',   // 2
      'Aardvark',   // 1, then alphabetical
      'Paradigm',
    ]);
  });

  // No minimum count, deliberately: a value one record carries is one record,
  // and dropping it makes that record unreachable through the sidebar.
  it('keeps a one-off value rather than pruning it', () => {
    const odd = [
      ...pool,
      equipment('junk', 'satcom', undefined, { operational_mode: ['on the move'] }),
      equipment('n1', 'satcom', undefined, { operational_mode: ['COTM'] }),
      equipment('n2', 'satcom', undefined, { operational_mode: ['COTM'] }),
    ];
    const modes = facetValues(facet('mode'), odd).map(v => v.label);
    expect(modes).toContain('on the move');
    // ...but it sorts below the curated vocabulary rather than beside it.
    expect(modes.indexOf('COTM')).toBeLessThan(modes.indexOf('on the move'));
  });

  it('holds a bool facet to Yes then No however the counts fall', () => {
    const bools = [
      equipment('a', 'satcom', { standard_specs: { altPntAvailable: false } }),
      equipment('b', 'satcom', { standard_specs: { altPntAvailable: false } }),
      equipment('c', 'satcom', { standard_specs: { altPntAvailable: true } }),
    ];
    expect(facetValues(facet('altpnt'), bools).map(v => v.key)).toEqual(['yes', 'no']);
  });

  it('offers nothing for a range facet', () => {
    expect(facetValues(facet('weight'), pool)).toEqual([]);
  });

  // The order list orders what is present; it never conjures a value.
  it('does not offer a curated value no record carries', () => {
    expect(facetValues(facet('orbit'), pool)).toEqual([]);
  });
});

describe('bucketMatches', () => {
  it('is min-inclusive and max-exclusive, so the cuts partition the line', () => {
    const b = { min: 20, max: 50 };
    expect(bucketMatches(b, 19.99)).toBe(false);
    expect(bucketMatches(b, 20)).toBe(true);
    expect(bucketMatches(b, 49.99)).toBe(true);
    expect(bucketMatches(b, 50)).toBe(false);
  });

  it('treats a null bound as unbounded', () => {
    expect(bucketMatches({ min: null, max: 20 }, -5)).toBe(true);
    expect(bucketMatches({ min: 150, max: null }, 1450)).toBe(true);
  });
});

// Guards the claim the module header makes: this is not a second description
// of an equipment record.
describe('the one-registry claim', () => {
  it('reads every facet through a compare param', () => {
    for (const spec of CATALOG_FACETS) {
      expect(COMPARE_PARAMS.some(p => p.id === spec.param), spec.id).toBe(true);
    }
  });
});

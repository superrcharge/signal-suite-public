import { describe, it, expect } from 'vitest';
import type { Equipment, EquipmentData, TerminalType } from '@/types';
import {
  COMPARE_PARAMS,
  DEFAULT_PARAM_IDS,
  bandCompareParams,
  cellFor,
  normalizeKey,
  numericCellFor,
  paramIsVisible,
  paramsForSelection,
} from './compare-params';

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

function param(id: string) {
  const found = COMPARE_PARAMS.find(p => p.id === id);
  if (!found) throw new Error(`no such param: ${id}`);
  return found;
}

describe('cellFor: the N/A rule', () => {
  it('returns na when the parameter does not apply to the record type', () => {
    const radio = equipment('r1', 'radio', { standard_specs: {} });
    expect(cellFor(param('std:orbit'), radio)).toEqual({ kind: 'na' });
  });

  it('returns blank, not na, when the parameter applies and the value is unset', () => {
    const satcom = equipment('s1', 'satcom', { standard_specs: {} });
    expect(cellFor(param('std:orbit'), satcom)).toEqual({ kind: 'blank' });
  });

  // The two above are the whole point of the split. If they ever agree, every
  // real gap in the catalog is hidden behind a legitimate-looking empty cell.
  it('never lets an extractor produce na on its own', () => {
    const satcom = equipment('s1', 'satcom', { standard_specs: {} });
    const radio = equipment('r1', 'radio', { standard_specs: {} });
    for (const p of COMPARE_PARAMS) {
      expect(p.extract(satcom).kind).not.toBe('na');
      expect(p.extract(radio).kind).not.toBe('na');
    }
  });

  it('applies radio-only parameters to radios', () => {
    const radio = equipment('r1', 'radio', { standard_specs: { crypto: 'AES-256' } });
    expect(cellFor(param('std:crypto'), radio)).toEqual({ kind: 'text', value: 'AES-256' });
  });
});

describe('scalar extractors', () => {
  it('carries the unit alongside a number', () => {
    const satcom = equipment('s1', 'satcom', { standard_specs: { bucTransmitPower: 25 } });
    expect(cellFor(param('std:buc'), satcom)).toEqual({ kind: 'num', value: 25, unit: 'W' });
  });

  it('keeps a zero rather than treating it as unset', () => {
    const satcom = equipment('s1', 'satcom', { standard_specs: { windTolerance: 0 } });
    expect(cellFor(param('std:wind'), satcom)).toEqual({ kind: 'num', value: 0, unit: 'mph' });
  });

  it('reads a boolean as a boolean, both ways', () => {
    const yes = equipment('s1', 'satcom', { standard_specs: { altPntAvailable: true } });
    const no = equipment('s2', 'satcom', { standard_specs: { altPntAvailable: false } });
    expect(cellFor(param('std:altpnt'), yes)).toEqual({ kind: 'bool', value: true });
    expect(cellFor(param('std:altpnt'), no)).toEqual({ kind: 'bool', value: false });
  });

  it('treats whitespace-only text as blank', () => {
    const satcom = equipment('s1', 'satcom', { standard_specs: { modem: '   ' } });
    expect(cellFor(param('std:modem'), satcom)).toEqual({ kind: 'blank' });
  });

  it('renders range in the unit it was entered in', () => {
    const mi = equipment('r1', 'radio', { standard_specs: { range: 12 } });
    const km = equipment('r2', 'radio', { standard_specs: { range: 12, range_unit: 'km' } });
    expect(cellFor(param('std:range'), mi)).toEqual({ kind: 'num', value: 12, unit: 'mi' });
    expect(cellFor(param('std:range'), km)).toEqual({ kind: 'num', value: 12, unit: 'km' });
  });
});

describe('swap extractors', () => {
  it('renders weight in all three entry modes, as entered', () => {
    const lbs = equipment('a', 'satcom', { swap: { weight: 12 } });
    const oz = equipment('b', 'satcom', { swap: { weight_oz: 9, weight_unit: 'oz' } });
    const both = equipment('c', 'satcom', { swap: { weight: 3, weight_oz: 4, weight_unit: 'lbs_oz' } });

    expect(cellFor(param('swap:weight'), lbs)).toEqual({ kind: 'text', value: '12 lbs' });
    expect(cellFor(param('swap:weight'), oz)).toEqual({ kind: 'text', value: '9 oz' });
    expect(cellFor(param('swap:weight'), both)).toEqual({ kind: 'text', value: '3 lbs 4 oz' });
  });

  it('omits a zero component of a combined weight', () => {
    const eq = equipment('a', 'satcom', { swap: { weight: 0, weight_oz: 7, weight_unit: 'lbs_oz' } });
    expect(cellFor(param('swap:weight'), eq)).toEqual({ kind: 'text', value: '7 oz' });
  });

  it('marks a partial size rather than dropping the dimensions given', () => {
    const eq = equipment('a', 'satcom', { swap: { size: { length: 10, height: 4 } } });
    expect(cellFor(param('swap:size'), eq)).toEqual({ kind: 'text', value: '10 x ? x 4 in' });
  });

  it('is blank when no dimension is set', () => {
    const eq = equipment('a', 'satcom', { swap: { size: {} } });
    expect(cellFor(param('swap:size'), eq)).toEqual({ kind: 'blank' });
  });
});

describe('list extractors', () => {
  it('lists waveform abbrevs for a radio', () => {
    const radio = equipment('r1', 'radio', {
      waveforms: [{ abbrev: 'ANW2', name: 'ANW2' }, { abbrev: 'TSM', name: 'TSM' }],
    });
    expect(cellFor(param('waveforms'), radio)).toEqual({ kind: 'list', values: ['ANW2', 'TSM'] });
  });

  it('falls back to the name when a waveform carries no abbrev', () => {
    const radio = equipment('r1', 'radio', { waveforms: [{ abbrev: '', name: 'Legacy' }] });
    expect(cellFor(param('waveforms'), radio)).toEqual({ kind: 'list', values: ['Legacy'] });
  });

  it('is blank for an empty list rather than an empty array cell', () => {
    const satcom = equipment('s1', 'satcom', { services: [] });
    expect(cellFor(param('services'), satcom)).toEqual({ kind: 'blank' });
  });
});

describe('bandCompareParams', () => {
  const satcom = equipment('s1', 'satcom', {
    bands: [{ band: 'Ka', eirp: 50, downlink: '20.2-21.2' }, { band: 'X' }],
  });
  const radio = equipment('r1', 'radio', {
    bands: [{ band: 'UHF', freq_min: 225, freq_max: 450 }],
  });

  it('emits only metrics some record populates', () => {
    const ids = bandCompareParams([satcom]).map(p => p.id);
    expect(ids).toContain('band:ka:eirp');
    expect(ids).toContain('band:ka:rx');
    // No record supplies an uplink or a G/T for Ka, so neither becomes a row.
    expect(ids).not.toContain('band:ka:tx');
    expect(ids).not.toContain('band:ka:gt');
    // X is named but carries no metric at all.
    expect(ids.some(id => id.startsWith('band:x:'))).toBe(false);
  });

  it('unions bands across a mixed selection', () => {
    const ids = bandCompareParams([satcom, radio]).map(p => p.id);
    expect(ids).toContain('band:ka:eirp');
    expect(ids).toContain('band:uhf:freq');
  });

  it('treats a band name as case-insensitive and keeps the first casing seen', () => {
    const other = equipment('s2', 'satcom', { bands: [{ band: 'KA', gt: 12 }] });
    const params = bandCompareParams([satcom, other]);
    const gt = params.find(p => p.id === 'band:ka:gt');
    expect(gt).toBeDefined();
    expect(gt?.label).toBe('Ka G/T');
    expect(params.filter(p => p.id.startsWith('band:ka:eirp'))).toHaveLength(1);
  });

  it('gives a record lacking the band a blank, not an na', () => {
    const noKa = equipment('s2', 'satcom', { bands: [{ band: 'X', eirp: 40 }] });
    const eirp = bandCompareParams([satcom, noKa]).find(p => p.id === 'band:ka:eirp');
    expect(eirp).toBeDefined();
    expect(cellFor(eirp!, noKa)).toEqual({ kind: 'blank' });
  });

  it('scopes a radio band metric to radios, so a satcom column reads na', () => {
    const freq = bandCompareParams([radio]).find(p => p.id === 'band:uhf:freq');
    expect(freq).toBeDefined();
    expect(cellFor(freq!, satcom)).toEqual({ kind: 'na' });
  });

  it('falls back to legacy uplink/downlink text when a radio band has no numeric range', () => {
    const legacy = equipment('r2', 'radio', { bands: [{ band: 'HF', downlink: '3-30 MHz' }] });
    const freq = bandCompareParams([legacy]).find(p => p.id === 'band:hf:freq');
    expect(freq).toBeDefined();
    expect(cellFor(freq!, legacy)).toEqual({ kind: 'list', values: ['3-30 MHz'] });
  });

  it('returns nothing for a selection with no bands', () => {
    expect(bandCompareParams([equipment('s3', 'satcom', {})])).toEqual([]);
  });
});

describe('paramIsVisible', () => {
  const satcom = equipment('s1', 'satcom', {});
  const radio = equipment('r1', 'radio', {});

  it('hides a satcom-only row when nothing selected is satcom', () => {
    expect(paramIsVisible(param('std:orbit'), [radio])).toBe(false);
  });

  it('shows a satcom-only row as soon as one satcom record is selected', () => {
    expect(paramIsVisible(param('std:orbit'), [radio, satcom])).toBe(true);
  });

  it('always shows a both-scoped row', () => {
    expect(paramIsVisible(param('make'), [radio])).toBe(true);
    expect(paramIsVisible(param('make'), [])).toBe(true);
  });
});

describe('the registry itself', () => {
  it('has no duplicate ids, including the derived band rows', () => {
    const selection = [
      equipment('s1', 'satcom', { bands: [{ band: 'Ka', eirp: 50 }] }),
      equipment('r1', 'radio', { bands: [{ band: 'UHF', tx_power: 5 }] }),
    ];
    const ids = paramsForSelection(selection).map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Ids travel in `?params=` as a comma-joined list, so the two things that
  // actually matter are that none holds the separator and that each survives a
  // round trip through URLSearchParams. A colon does neither harm, which is
  // why this is not an encodeURIComponent comparison.
  it('keeps every id safe to put in ?params=', () => {
    const selection = [equipment('s1', 'satcom', { bands: [{ band: 'Ku / Ka', eirp: 1 }] })];
    const ids = paramsForSelection(selection).map(p => p.id);
    for (const id of ids) {
      expect(id).not.toContain(',');
      expect(id).not.toMatch(/\s/);
    }
    const round = new URLSearchParams({ params: ids.join(',') });
    expect(new URLSearchParams(round.toString()).get('params')?.split(',')).toEqual(ids);
  });

  it('defaults to identification, standard specs and SWAP only', () => {
    const groups = new Set(
      DEFAULT_PARAM_IDS.map(id => COMPARE_PARAMS.find(p => p.id === id)?.group),
    );
    expect(groups).toEqual(new Set(['identification', 'standard', 'swap']));
  });
});

/**
 * `compareValue` and `extract` are two readings of one fact, and the only
 * thing stopping them drifting apart is this file.
 */
describe('compareValue', () => {
  const RANGE_PARAM_IDS = ['swap:weight', 'std:buc', 'std:wind', 'std:txpower', 'std:range'];

  const swap = (s: Partial<NonNullable<EquipmentData['swap']>>) =>
    equipment('w', 'satcom', { swap: s });

  // Every shape a record can be in, including the ones nobody enters on
  // purpose. The zeros are the point: they are the case where a naive
  // conversion and the formatter disagree.
  const FIXTURES: Equipment[] = [
    equipment('bare-satcom', 'satcom'),
    equipment('bare-radio', 'radio'),
    swap({}),
    swap({ weight: 41 }),
    swap({ weight: 0 }),
    swap({ weight: 3, weight_unit: 'lbs' }),
    swap({ weight_oz: 38, weight_unit: 'oz' }),
    swap({ weight_oz: 0, weight_unit: 'oz' }),
    swap({ weight: 2, weight_oz: 12, weight_unit: 'lbs_oz' }),
    swap({ weight: 0, weight_oz: 0, weight_unit: 'lbs_oz' }),
    swap({ weight: 9, weight_oz: 0, weight_unit: 'lbs_oz' }),
    swap({ weight: 0, weight_oz: 8, weight_unit: 'lbs_oz' }),
    equipment('buc', 'satcom', { standard_specs: { bucTransmitPower: 25, windTolerance: 60 } }),
    equipment('buc0', 'satcom', { standard_specs: { bucTransmitPower: 0 } }),
    equipment('r-mi', 'radio', { standard_specs: { range: 10, range_unit: 'mi' } }),
    equipment('r-km', 'radio', { standard_specs: { range: 10, range_unit: 'km' } }),
    equipment('r-nounit', 'radio', { standard_specs: { range: 10 } }),
    equipment('r-tx', 'radio', { standard_specs: { transmitPower: 5 } }),
  ];

  // The contract in one assertion. Without it, the number and the string can
  // disagree about whether the catalog knows a value at all, and nothing else
  // in the app would notice.
  it('is null exactly when extract is blank', () => {
    for (const param of COMPARE_PARAMS) {
      if (!param.compareValue) continue;
      for (const eq of FIXTURES) {
        expect(
          { id: param.id, eq: eq.id, isNull: param.compareValue(eq) === null },
        ).toEqual(
          { id: param.id, eq: eq.id, isNull: param.extract(eq).kind === 'blank' },
        );
      }
    }
  });

  it('declares a unit wherever it declares a value, and vice versa', () => {
    for (const param of COMPARE_PARAMS) {
      expect(param.compareValue == null).toBe(param.compareUnit == null);
    }
  });

  it('covers every param a range filter needs', () => {
    for (const id of RANGE_PARAM_IDS) {
      const param = COMPARE_PARAMS.find(p => p.id === id);
      expect(param?.compareValue, id).toBeDefined();
    }
  });

  it('normalizes the four weight modes onto one scale', () => {
    const weight = COMPARE_PARAMS.find(p => p.id === 'swap:weight');
    const read = (eq: Equipment) => weight?.compareValue?.(eq);

    expect(read(swap({ weight: 41 }))).toBe(41);                              // unit unset
    expect(read(swap({ weight: 3, weight_unit: 'lbs' }))).toBe(3);
    expect(read(swap({ weight_oz: 38, weight_unit: 'oz' }))).toBeCloseTo(2.375);
    expect(read(swap({ weight: 2, weight_oz: 12, weight_unit: 'lbs_oz' }))).toBeCloseTo(2.75);
  });

  // The asymmetry that makes weightValue more than a conversion: formatWeight
  // suppresses a zero component, so this record renders blank and must read
  // null rather than 0.
  it('reads a fully-zero lbs_oz record as null, matching the formatter', () => {
    const weight = COMPARE_PARAMS.find(p => p.id === 'swap:weight');
    const eq = swap({ weight: 0, weight_oz: 0, weight_unit: 'lbs_oz' });
    expect(weight?.compareValue?.(eq)).toBeNull();
    expect(weight?.extract(eq).kind).toBe('blank');
  });

  it('converts a km range to miles', () => {
    const range = COMPARE_PARAMS.find(p => p.id === 'std:range');
    const km = equipment('r', 'radio', { standard_specs: { range: 10, range_unit: 'km' } });
    const mi = equipment('r', 'radio', { standard_specs: { range: 10, range_unit: 'mi' } });
    expect(range?.compareValue?.(km)).toBeCloseTo(6.21371);
    expect(range?.compareValue?.(mi)).toBe(10);
  });

  // A zero is a value someone entered, not a missing one. Losing this makes a
  // "0 W" record indistinguishable from one nobody filled in.
  it('keeps a real zero out of the blank population', () => {
    const buc = COMPARE_PARAMS.find(p => p.id === 'std:buc');
    const eq = equipment('z', 'satcom', { standard_specs: { bucTransmitPower: 0 } });
    expect(buc?.compareValue?.(eq)).toBe(0);
    expect(buc?.extract(eq).kind).toBe('num');
  });
});

describe('numericCellFor', () => {
  it('is the only place na is produced for a number', () => {
    const range = COMPARE_PARAMS.find(p => p.id === 'std:range');
    if (!range) throw new Error('std:range missing');
    const satcom = equipment('s', 'satcom');
    expect(numericCellFor(range, satcom)).toEqual({ kind: 'na' });
    expect(range.compareValue?.(satcom)).toBeNull();   // the extractor itself never says na
  });

  it('separates a radio with no range from one that has one', () => {
    const range = COMPARE_PARAMS.find(p => p.id === 'std:range');
    if (!range) throw new Error('std:range missing');
    expect(numericCellFor(range, equipment('r', 'radio'))).toEqual({ kind: 'blank' });
    expect(
      numericCellFor(range, equipment('r', 'radio', { standard_specs: { range: 4 } })),
    ).toEqual({ kind: 'num', value: 4, unit: 'mi' });
  });

  it('reports blank, not zero, for a param with no numeric reading', () => {
    const make = COMPARE_PARAMS.find(p => p.id === 'make');
    if (!make) throw new Error('make missing');
    expect(numericCellFor(make, equipment('s', 'satcom'))).toEqual({ kind: 'blank' });
  });
});

describe('normalizeKey', () => {
  it('folds case and surrounding space', () => {
    expect(normalizeKey(' Ka ')).toBe('ka');
    expect(normalizeKey('KA')).toBe(normalizeKey('ka'));
    expect(normalizeKey(undefined)).toBe('');
  });

  // Deliberate. These mean the same thing and are different values; merging
  // them here would hide a data problem the editor should fix.
  it('does not alias synonyms', () => {
    expect(normalizeKey('on the move')).not.toBe(normalizeKey('COTM'));
  });
});

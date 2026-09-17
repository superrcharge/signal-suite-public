import { describe, it, expect } from 'vitest';
import type { Equipment, EquipmentData, TerminalType } from '@/types';
import { DEFAULT_PARAM_IDS } from './compare-params';
import {
  encodeIds,
  resolveChosenIds,
  encodeParams,
  groupRows,
  hasStaleIds,
  resolveParams,
  resolveSelection,
} from './compare-selection';

function equipment(id: string, terminal_type: TerminalType, data?: Partial<EquipmentData>): Equipment {
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
  };
}

const alpha = equipment('alpha', 'satcom', { bands: [{ band: 'Ka', eirp: 50 }] });
const bravo = equipment('bravo', 'satcom');
const charlie = equipment('charlie', 'radio', { standard_specs: { crypto: 'AES' } });

const catalog: Equipment[] = [alpha, bravo, charlie];

describe('resolveSelection', () => {
  it('preserves the order the ids were named in, since that is column order', () => {
    expect(resolveSelection('charlie,alpha', catalog).map(e => e.id)).toEqual(['charlie', 'alpha']);
  });

  it('drops an id the catalog no longer holds rather than throwing', () => {
    expect(resolveSelection('alpha,ghost,bravo', catalog).map(e => e.id)).toEqual(['alpha', 'bravo']);
  });

  it('collapses a repeated id, so a record cannot become two columns', () => {
    expect(resolveSelection('alpha,alpha', catalog).map(e => e.id)).toEqual(['alpha']);
  });

  it('tolerates whitespace and empty segments', () => {
    expect(resolveSelection(' alpha , , bravo ', catalog).map(e => e.id)).toEqual(['alpha', 'bravo']);
  });

  it('is empty for an absent parameter', () => {
    expect(resolveSelection(null, catalog)).toEqual([]);
  });
});

describe('resolveParams', () => {
  const satcomOnly = [alpha];
  const mixed = [alpha, charlie];

  it('uses the default set when the parameter is absent', () => {
    const ids = resolveParams(null, satcomOnly).map(p => p.id);
    // Radio-only defaults are filtered out by visibility, so this is a subset.
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every(id => DEFAULT_PARAM_IDS.includes(id))).toBe(true);
  });

  it('treats an empty parameter as an empty choice, not as the default', () => {
    expect(resolveParams('', satcomOnly)).toEqual([]);
  });

  it('drops an id the registry does not know', () => {
    const ids = resolveParams('make,not-a-param,swap:weight', satcomOnly).map(p => p.id);
    expect(ids).toEqual(['make', 'swap:weight']);
  });

  it('drops a row that applies to no selected terminal type', () => {
    // std:crypto is radio-only and nothing selected is a radio.
    expect(resolveParams('make,std:crypto', satcomOnly).map(p => p.id)).toEqual(['make']);
    expect(resolveParams('make,std:crypto', mixed).map(p => p.id)).toEqual(['make', 'std:crypto']);
  });

  it('resolves a derived band row when the selection still produces it', () => {
    expect(resolveParams('band:ka:eirp', satcomOnly).map(p => p.id)).toEqual(['band:ka:eirp']);
  });

  it('drops a derived band row once the record producing it is deselected', () => {
    expect(resolveParams('band:ka:eirp', [bravo])).toEqual([]);
  });

  it('keeps the order the reader named, not registry order', () => {
    expect(resolveParams('swap:weight,make', satcomOnly).map(p => p.id)).toEqual(['swap:weight', 'make']);
  });
});

describe('resolveChosenIds', () => {
  it('defaults when the parameter is absent', () => {
    expect(resolveChosenIds(null)).toEqual(DEFAULT_PARAM_IDS);
  });

  it('is empty for an explicitly empty choice', () => {
    expect(resolveChosenIds('')).toEqual([]);
  });

  // The invariant this function exists for. resolveParams hides a row that
  // applies to no selected type, and if that hidden list were written back,
  // dropping the last radio would silently delete every radio-only choice
  // the reader had made.
  it('keeps a row that is hidden by the current selection', () => {
    const satcomOnly = [alpha];
    expect(resolveParams('make,std:crypto', satcomOnly).map(p => p.id)).toEqual(['make']);
    expect(resolveChosenIds('make,std:crypto')).toEqual(['make', 'std:crypto']);
  });

  it('keeps a band row whose band is not in the selection', () => {
    expect(resolveParams('band:ka:eirp', [bravo])).toEqual([]);
    expect(resolveChosenIds('band:ka:eirp')).toEqual(['band:ka:eirp']);
  });

  it('round trips a choice through encode and back after a selection change', () => {
    const chosen = resolveChosenIds('make,std:crypto');
    // Selection loses its only radio, so the row stops being drawn...
    expect(resolveParams(encodeParams(chosen), [alpha]).map(p => p.id)).toEqual(['make']);
    // ...but the choice itself survives to be drawn again when one returns.
    expect(resolveParams(encodeParams(chosen), [alpha, charlie]).map(p => p.id)).toEqual([
      'make',
      'std:crypto',
    ]);
  });
});

describe('groupRows', () => {
  it('buckets into datasheet section order and omits empty groups', () => {
    const params = resolveParams('swap:weight,make,std:orbit', [alpha]);
    expect(groupRows(params).map(g => g.group)).toEqual(['identification', 'standard', 'swap']);
  });

  it('is empty when nothing is chosen', () => {
    expect(groupRows([])).toEqual([]);
  });
});

describe('encodeParams', () => {
  it('returns null for exactly the default set, so the URL stays clean', () => {
    expect(encodeParams([...DEFAULT_PARAM_IDS])).toBeNull();
    expect(encodeParams([...DEFAULT_PARAM_IDS].reverse())).toBeNull();
  });

  it('returns an empty string for an empty choice', () => {
    // Not null. Null would read back as the default set on the next load and
    // silently undo the reader unticking everything.
    expect(encodeParams([])).toBe('');
  });

  it('joins anything else', () => {
    expect(encodeParams(['make', 'swap:weight'])).toBe('make,swap:weight');
  });

  it('round trips a non-default choice', () => {
    const chosen = ['make', 'std:orbit'];
    expect(resolveParams(encodeParams(chosen), [alpha]).map(p => p.id)).toEqual(chosen);
  });
});

describe('encodeIds', () => {
  it('returns null for an empty selection so the bare route stays bare', () => {
    expect(encodeIds([])).toBeNull();
  });

  it('round trips through resolveSelection', () => {
    expect(resolveSelection(encodeIds(['bravo', 'alpha']), catalog).map(e => e.id)).toEqual(['bravo', 'alpha']);
  });
});

describe('hasStaleIds', () => {
  it('is true only when something was actually dropped', () => {
    expect(hasStaleIds('alpha,ghost', resolveSelection('alpha,ghost', catalog))).toBe(true);
    expect(hasStaleIds('alpha,bravo', resolveSelection('alpha,bravo', catalog))).toBe(false);
    expect(hasStaleIds(null, [])).toBe(false);
  });

  it('counts a duplicate as stale, since the URL is rewritten to drop it', () => {
    expect(hasStaleIds('alpha,alpha', resolveSelection('alpha,alpha', catalog))).toBe(true);
  });
});

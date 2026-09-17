/**
 * Fixtures for the joint compatibility matrix.
 *
 * The cases that matter here are the ones a rendered grid cannot be asked
 * about: a selection of nothing, a platform whose only capability arrives
 * through a carried radio, an abbrev the library has never heard of, and a
 * waveform nothing in the selection can use. Each is a real state of the data,
 * and each has an answer that is easy to get wrong in a way that looks fine on
 * screen.
 */

import { describe, expect, it } from 'vitest';

import { buildMatrix, type MatrixInput } from './compat-matrix-model';
import type { Equipment, Platform, Waveform } from '@/types';

function waveform(abbrev: string, name = ''): Waveform {
  return {
    id: `wf-${abbrev}`,
    abbrev,
    name,
    description: '',
    created_by: '',
    updated_by: '',
    created_at: '',
    updated_at: '',
  };
}

function radio(id: string, nomenclature: string, abbrevs: string[]): Equipment {
  return {
    id,
    nomenclature,
    terminal_type: 'radio',
    operational_mode: [],
    data: {
      services: [],
      waveforms: abbrevs.map((a) => ({ abbrev: a, name: a })),
      bands: [],
      standard_specs: {},
      physical_specs: [],
      rf_specs: [],
      swap: {},
      features: [],
    },
    created_by: '',
    updated_by: '',
    created_at: '',
    updated_at: '',
  };
}

function satcom(id: string, nomenclature: string): Equipment {
  return { ...radio(id, nomenclature, []), terminal_type: 'satcom' };
}

function platform(
  id: string,
  designation: string,
  over: Partial<Platform> = {},
): Platform {
  return {
    id,
    designation,
    popular_name: '',
    category: 'joint',
    kind: 'aircraft',
    operator: '',
    waveform_abbrevs: [],
    equipment_ids: [],
    notes: '',
    created_by: '',
    updated_by: '',
    created_at: '',
    updated_at: '',
    ...over,
  };
}

const LIBRARY = [waveform('L16', 'Link 16'), waveform('MADL'), waveform('SINCGARS')];

function input(over: Partial<MatrixInput> = {}): MatrixInput {
  return { platforms: [], equipment: [], waveforms: LIBRARY, ...over };
}

describe('buildMatrix', () => {
  it('gives every library waveform a row even when nothing carries it', () => {
    // An all-dashes row is a finding, not noise: it says the library knows a
    // path that nothing in this selection can use.
    const m = buildMatrix(input({ platforms: [platform('p1', 'F-35A')] }));
    expect(m.rows.map((r) => r.label)).toEqual(['L16', 'MADL', 'SINCGARS']);
    expect(m.rows.every((r) => r.supportedCount === 0)).toBe(true);
  });

  it('omits empty rows when asked, for a print sheet', () => {
    const m = buildMatrix(
      input({
        platforms: [platform('p1', 'F-35A', { waveform_abbrevs: ['L16'] })],
        omitEmptyRows: true,
      }),
    );
    expect(m.rows.map((r) => r.label)).toEqual(['L16']);
  });

  it('shows every candidate when nothing is selected', () => {
    // A cold page load has no selection, and an empty grid reads as broken.
    const m = buildMatrix(
      input({ platforms: [platform('p2', 'F-15E'), platform('p1', 'F-35A')] }),
    );
    expect(m.columns.map((c) => c.label)).toEqual(['F-15E', 'F-35A']);
  });

  it('honours selection order, so a user sees their own asset first', () => {
    const m = buildMatrix(
      input({
        platforms: [platform('p1', 'F-35A'), platform('p2', 'F-15E')],
        selected: ['p2', 'p1'],
      }),
    );
    expect(m.columns.map((c) => c.label)).toEqual(['F-15E', 'F-35A']);
  });

  it('skips a selected id that is not a candidate, rather than drawing a blank column', () => {
    const m = buildMatrix(
      input({ platforms: [platform('p1', 'F-35A')], selected: ['p1', 'deleted-id'] }),
    );
    expect(m.columns).toHaveLength(1);
  });

  it('draws a repeated selected id once', () => {
    const m = buildMatrix(
      input({ platforms: [platform('p1', 'F-35A')], selected: ['p1', 'p1'] }),
    );
    expect(m.columns).toHaveLength(1);
  });

  // ─── sources ──────────────────────────────────────────────────────────────
  //
  // A cell is one boolean. Whether the waveform was typed on the platform or
  // arrived through a carried radio is not recorded, because on the sheet
  // both mean the same thing: the platform has it.

  it('supports a waveform declared directly on the platform', () => {
    const m = buildMatrix(
      input({ platforms: [platform('p1', 'F-35A', { waveform_abbrevs: ['L16'] })] }),
    );
    const l16 = m.rows.find((r) => r.label === 'L16')!;
    expect(l16.cells[0]).toEqual({ supported: true });
  });

  it('supports a waveform the platform gets only from a carried radio', () => {
    // The case the per-record snapshot matrix cannot express: capability the
    // platform never declared, arriving from the radio it carries.
    const m = buildMatrix(
      input({
        platforms: [platform('p1', 'F-35A', { equipment_ids: ['r1'] })],
        equipment: [radio('r1', 'AN/PRC-163', ['MADL'])],
        // Selected, because the radio is a column in its own right and sorts
        // ahead of the platform when nothing is picked.
        selected: ['p1'],
      }),
    );
    const madl = m.rows.find((r) => r.label === 'MADL')!;
    expect(madl.cells[0]).toEqual({ supported: true });
  });

  it('draws one check when a waveform is both declared and carried', () => {
    const m = buildMatrix(
      input({
        platforms: [platform('p1', 'F-35A', { waveform_abbrevs: ['L16'], equipment_ids: ['r1'] })],
        equipment: [radio('r1', 'AN/PRC-163', ['L16'])],
        selected: ['p1'],
      }),
    );
    const l16 = m.rows.find((r) => r.label === 'L16')!;
    expect(l16.cells[0]).toEqual({ supported: true });
  });

  it('ignores an equipment_id naming a record that no longer exists', () => {
    // Same tolerance for a dangling reference as the rest of this schema.
    const m = buildMatrix(
      input({ platforms: [platform('p1', 'F-35A', { equipment_ids: ['gone'] })] }),
    );
    expect(m.rows.every((r) => r.supportedCount === 0)).toBe(true);
  });

  it('counts a radio carried twice once', () => {
    const m = buildMatrix(
      input({
        platforms: [platform('p1', 'F-35A', { equipment_ids: ['r1', 'r1'] })],
        equipment: [radio('r1', 'AN/PRC-163', ['L16'])],
        selected: ['p1'],
      }),
    );
    const l16 = m.rows.find((r) => r.label === 'L16')!;
    expect(l16.cells).toHaveLength(1);
    expect(l16.supportedCount).toBe(1);
  });

  // ─── the library boundary ─────────────────────────────────────────────────

  it('gives no row to an abbrev the library does not declare', () => {
    // The library is the vocabulary. An abbrev only a column names is seen and
    // removed in the equipment editor's orphan chip, not drawn here.
    const m = buildMatrix(
      input({
        platforms: [platform('p1', 'F-35A', { waveform_abbrevs: ['IFDL'], equipment_ids: ['r1'] })],
        equipment: [radio('r1', 'AN/PRC-163', ['TSM'])],
        selected: ['p1'],
      }),
    );
    expect(m.rows.map((r) => r.label)).toEqual(LIBRARY.map((w) => w.abbrev));
    expect(m.rows.some((r) => r.label === 'IFDL' || r.label === 'TSM')).toBe(false);
  });

  it('matches abbrevs case-insensitively and ignores surrounding space', () => {
    const m = buildMatrix(
      input({ platforms: [platform('p1', 'F-35A', { waveform_abbrevs: [' l16 '] })] }),
    );
    const l16 = m.rows.find((r) => r.label === 'L16')!;
    expect(l16.cells[0]!.supported).toBe(true);
  });

  it('drops a blank abbrev instead of giving it a row', () => {
    const m = buildMatrix(
      input({ platforms: [platform('p1', 'F-35A', { waveform_abbrevs: ['', '  '] })] }),
    );
    expect(m.rows).toHaveLength(LIBRARY.length);
  });

  // ─── equipment columns ────────────────────────────────────────────────────

  it('includes radios as organic columns and excludes satcom terminals', () => {
    // A SATCOM terminal carries services, not waveforms, so an all-dashes
    // column would claim it was incompatible rather than unrelated.
    const m = buildMatrix(
      input({ equipment: [radio('r1', 'AN/PRC-163', ['L16']), satcom('s1', 'Starshield')] }),
    );
    expect(m.columns.map((c) => c.label)).toEqual(['AN/PRC-163']);
    expect(m.columns[0]!.category).toBe('organic');
    expect(m.columns[0]!.kind).toBe('equipment');
  });

  // ─── categories ───────────────────────────────────────────────────────────

  it('filters columns by category', () => {
    const m = buildMatrix(
      input({
        platforms: [
          platform('p1', 'F-35A', { category: 'joint' }),
          platform('p2', 'Typhoon', { category: 'coalition' }),
        ],
        categories: ['coalition'],
      }),
    );
    expect(m.columns.map((c) => c.label)).toEqual(['Typhoon']);
  });

  it('keeps every category available while a filter is active', () => {
    // Otherwise narrowing to one chip makes the others vanish and strands the
    // user in a filter they cannot leave.
    const m = buildMatrix(
      input({
        platforms: [
          platform('p1', 'F-35A', { category: 'joint' }),
          platform('p2', 'Typhoon', { category: 'coalition' }),
        ],
        equipment: [radio('r1', 'AN/PRC-163', [])],
        categories: ['coalition'],
      }),
    );
    expect(m.availableCategories).toEqual(['coalition', 'joint', 'organic']);
  });

  it('applies the category filter before a selection, not after', () => {
    const m = buildMatrix(
      input({
        platforms: [
          platform('p1', 'F-35A', { category: 'joint' }),
          platform('p2', 'Typhoon', { category: 'coalition' }),
        ],
        selected: ['p1', 'p2'],
        categories: ['joint'],
      }),
    );
    expect(m.columns.map((c) => c.label)).toEqual(['F-35A']);
  });

  it('keeps cells parallel to columns', () => {
    const m = buildMatrix(
      input({
        platforms: [platform('p1', 'F-35A'), platform('p2', 'F-15E')],
        equipment: [radio('r1', 'AN/PRC-163', [])],
      }),
    );
    expect(m.columns).toHaveLength(3);
    expect(m.rows.every((r) => r.cells.length === m.columns.length)).toBe(true);
  });
});

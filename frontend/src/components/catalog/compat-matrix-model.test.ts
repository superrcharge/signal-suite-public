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

import {
  ALL_COLUMNS,
  NO_BRANCH_GROUP,
  RADIO_GROUP,
  buildMatrix,
  groupByBranch,
  sliceModel,
  type MatrixAsset,
  type MatrixInput,
} from './compat-matrix-model';
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
    category: [],
    type: 'aircraft',
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

// Select all unless a test says otherwise. Nothing selected draws no columns,
// which is the page's cold load and has its own test; every other case here
// is about what a column holds, so it wants the columns drawn.
function input(over: Partial<MatrixInput> = {}): MatrixInput {
  return { platforms: [], equipment: [], waveforms: LIBRARY, selected: [ALL_COLUMNS], ...over };
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

  it('draws no columns when nothing is selected, and still knows there are some to pick', () => {
    // The cold page load. With five hundred platforms, every candidate is a
    // grid too wide to read, so the page opens blank and asks for a pick.
    const m = buildMatrix(
      input({ platforms: [platform('p2', 'F-15E'), platform('p1', 'F-35A')], selected: [] }),
    );
    expect(m.columns).toEqual([]);
    expect(m.candidateTotal).toBe(2);
  });

  it('shows every candidate for select all', () => {
    const m = buildMatrix(
      input({ platforms: [platform('p2', 'F-15E'), platform('p1', 'F-35A')], selected: [ALL_COLUMNS] }),
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
        // Selected, because the radio is a column in its own right and would
        // otherwise be drawn beside the platform.
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

  it('includes radios as columns with no branch and excludes satcom terminals', () => {
    // A SATCOM terminal carries services, not waveforms, so an all-dashes
    // column would claim it was incompatible rather than unrelated.
    const m = buildMatrix(
      input({ equipment: [radio('r1', 'AN/PRC-163', ['L16']), satcom('s1', 'Starshield')] }),
    );
    expect(m.columns.map((c) => c.label)).toEqual(['AN/PRC-163']);
    expect(m.columns[0]!.branches).toEqual([]);
    expect(m.columns[0]!.kind).toBe('equipment');
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

// ─── branches and types ──────────────────────────────────────────────────────
//
// A platform's category is the branches that operate it, a closed list the
// server stores in precedence order (migration 044). One airframe flown by
// several services is one column answering to each, and the column picker
// groups by them.

describe('buildMatrix default order', () => {
  it('groups columns by branch in precedence order, natural within a group', () => {
    const m = buildMatrix(
      input({
        platforms: [
          platform('p1', 'F-35A', { category: ['USAF'] }),
          platform('p2', '11M NSW RIB', { category: ['USN', 'USCG'] }),
          platform('p3', 'AH-64E', { category: ['USA'] }),
          platform('p4', '7M RIB', { category: ['USN'] }),
          platform('p5', 'P-8A', { category: ['OGA'] }),
        ],
        equipment: [radio('r1', 'AN/PRC-163', [])],
      }),
    );
    // USA, then USN (where the USN/USCG boat ranks, by its first branch), then
    // USAF, then OGA, then the catalog radios. Within USN, 7M precedes 11M: a
    // plain string sort put 11M first.
    expect(m.columns.map((c) => c.label)).toEqual([
      'AH-64E', '7M RIB', '11M NSW RIB', 'F-35A', 'P-8A', 'AN/PRC-163',
    ]);
  });

  it('puts a platform with no branch after the others and before the radios', () => {
    const m = buildMatrix(
      input({
        platforms: [platform('p1', 'Unknown Hull'), platform('p2', 'F-35A', { category: ['USAF'] })],
        equipment: [radio('r1', 'AN/PRC-163', [])],
      }),
    );
    expect(m.columns.map((c) => c.label)).toEqual(['F-35A', 'Unknown Hull', 'AN/PRC-163']);
  });

  it('reads a pre-044 string category as no branch rather than throwing', () => {
    // A response cached across the deploy still carries 'joint'. The column
    // must draw, not take the page down.
    const stale = platform('p1', 'F-35A', { category: 'joint' as unknown as Platform['category'] });
    const m = buildMatrix(input({ platforms: [stale], selected: [ALL_COLUMNS] }));
    expect(m.columns[0]!.branches).toEqual([]);
  });
});

describe('buildMatrix branch and kind filters', () => {
  const fleet = [
    platform('p1', 'AH-64E', { category: ['USA'], type: 'aircraft' }),
    platform('p2', 'ACV-30', { category: ['USMC'], type: 'ground vehicle' }),
    platform('p3', 'AH-1Z', { category: ['USMC'], type: 'aircraft' }),
    platform('p4', 'F-35A', { category: ['USAF'], type: 'aircraft' }),
    platform('p5', 'AN/TSC-154', { category: ['USA', 'USMC', 'USAF'], type: 'ground station' }),
  ];

  it('takes any number of branches and shows the union', () => {
    const m = buildMatrix(input({ platforms: fleet, branches: ['USA', 'USMC'] }));
    expect(m.columns.map((c) => c.label)).toEqual(['AH-64E', 'AN/TSC-154', 'ACV-30', 'AH-1Z']);
  });

  it('matches a multi-branch platform on any branch it carries, case-insensitively', () => {
    const m = buildMatrix(input({ platforms: fleet, branches: ['usaf'] }));
    expect(m.columns.map((c) => c.label)).toEqual(['AN/TSC-154', 'F-35A']);
  });

  it('takes any number of types', () => {
    const m = buildMatrix(input({ platforms: fleet, types: ['ground vehicle', 'ground station'] }));
    expect(m.columns.map((c) => c.label)).toEqual(['AN/TSC-154', 'ACV-30']);
  });

  it('combines branch and kind as all-of', () => {
    const m = buildMatrix(
      input({
        platforms: fleet,
        branches: ['USA', 'USMC'],
        types: ['aircraft'],
      }),
    );
    expect(m.columns.map((c) => c.label)).toEqual(['AH-64E', 'AH-1Z']);
  });

  it('applies the branch filter before a selection, not after', () => {
    const m = buildMatrix(input({ platforms: fleet, selected: ['p1', 'p4'], branches: ['USA'] }));
    expect(m.columns.map((c) => c.label)).toEqual(['AH-64E']);
  });

  it('drops the catalog radios under a branch filter, and reaches them by kind', () => {
    const equipment = [radio('r1', 'AN/PRC-163', [])];
    expect(buildMatrix(input({ platforms: fleet, equipment, branches: ['USA'] })).columns.map((c) => c.label))
      .not.toContain('AN/PRC-163');
    expect(buildMatrix(input({ platforms: fleet, equipment, types: ['radio'] })).columns.map((c) => c.label))
      .toEqual(['AN/PRC-163']);
  });

  it('keeps every branch and kind available while a filter is active', () => {
    // Otherwise narrowing to one chip makes the others vanish and strands the
    // user in a filter they cannot leave.
    const m = buildMatrix(
      input({
        platforms: [...fleet, platform('p7', 'P-8A', { category: ['OGA'] })],
        equipment: [radio('r1', 'AN/PRC-163', [])],
        branches: ['USMC'],
        types: ['aircraft'],
      }),
    );
    expect(m.availableBranches).toEqual(['USA', 'USMC', 'USAF', 'OGA']);
    expect(m.availableTypes).toEqual(['aircraft', 'ground station', 'ground vehicle', 'radio']);
  });
});

// Each supported cell draws one check per branch the column shows, so the
// model says which: every branch unfiltered, only the filtered ones under a
// branch filter, none for a radio (which draws one neutral check).
describe('buildMatrix checkBranches', () => {
  const uh60 = platform('p1', 'UH-60L', { category: ['USA', 'OGA'] });

  it('is every branch the platform has when no branch filter is active', () => {
    const m = buildMatrix(input({ platforms: [uh60] }));
    expect(m.columns[0]!.checkBranches).toEqual(['USA', 'OGA']);
  });

  it('is only the filtered branches under a branch filter, since those brought the column in', () => {
    const m = buildMatrix(input({ platforms: [uh60], branches: ['usa'] }));
    expect(m.columns[0]!.checkBranches).toEqual(['USA']);
    expect(m.columns[0]!.branches).toEqual(['USA', 'OGA']);
  });

  it('is empty for a catalog radio', () => {
    const m = buildMatrix(input({ equipment: [radio('r1', 'AN/PRC-163', [])] }));
    expect(m.columns[0]!.checkBranches).toEqual([]);
  });
});

// What one printed page draws: a column chunk crossed with a row page, each
// row's cells cut to the same columns.
describe('sliceModel', () => {
  const m = buildMatrix(input({
    platforms: [
      platform('p1', 'A', { waveform_abbrevs: ['L16'] }),
      platform('p2', 'B', { waveform_abbrevs: ['MADL'] }),
      platform('p3', 'C', { waveform_abbrevs: ['L16', 'MADL'] }),
    ],
  }));

  it('keeps the chosen columns, in the order given, with cells cut to match', () => {
    const page = sliceModel(m, [2, 0]);
    expect(page.columns.map((c) => c.label)).toEqual(['C', 'A']);
    for (const row of page.rows) expect(row.cells).toHaveLength(2);
  });

  it('keeps only the chosen rows when row keys are given, and recounts support', () => {
    const l16 = m.rows.find((r) => r.label === 'L16')!.abbrev;
    const page = sliceModel(m, [1], [l16]);
    expect(page.rows.map((r) => r.label)).toEqual(['L16']);
    expect(page.rows[0]!.supportedCount).toBe(0);
  });
});

describe('groupByBranch', () => {
  it('lists a multi-branch platform under each branch, radios last, empty groups never', () => {
    const m = buildMatrix(
      input({
        platforms: [
          platform('p1', '11M NSW RIB', { category: ['USN', 'USCG'] }),
          platform('p2', '7M RIB', { category: ['USN'] }),
          platform('p3', 'Unknown Hull'),
        ],
        equipment: [radio('r1', 'AN/PRC-163', [])],
      }),
    );
    const groups = groupByBranch(m.columns).map((g) => [g.label, g.columns.map((c) => c.label)]);
    expect(groups).toEqual([
      ['USN', ['7M RIB', '11M NSW RIB']],
      ['USCG', ['11M NSW RIB']],
      [NO_BRANCH_GROUP, ['Unknown Hull']],
      [RADIO_GROUP, ['AN/PRC-163']],
    ]);
  });
});

describe('buildMatrix with any platform-shaped asset', () => {
  it('omits radio columns when equipmentColumns is false but still resolves carried radios', () => {
    const asset: MatrixAsset = {
      id: 'a1',
      designation: 'Asset One',
      type: 'participant',
      popular_name: '',
      category: [],
      waveform_abbrevs: [],
      equipment_ids: ['r1'],
    };
    const m = buildMatrix({
      platforms: [asset],
      equipment: [radio('r1', 'AN/PRC-163', ['MUOS'])],
      waveforms: [waveform('MUOS')],
      selected: [ALL_COLUMNS],
      equipmentColumns: false,
    });
    expect(m.columns.map((c) => c.id)).toEqual(['a1']);
    expect(m.columns.some((c) => c.kind === 'equipment')).toBe(false);
    expect(m.rows[0]?.cells.map((c) => c.supported)).toEqual([true]);
  });

  it('takes a MatrixAsset literal without a cast and carries its type onto the column', () => {
    const asset: MatrixAsset = {
      id: 'a2',
      designation: 'Bare Asset',
      type: 'participant',
      popular_name: '',
      category: [],
      waveform_abbrevs: [],
      equipment_ids: [],
    };
    const m = buildMatrix({ platforms: [asset], equipment: [], waveforms: [], selected: [ALL_COLUMNS] });
    expect(m.columns[0]?.assetType).toBe('participant');
  });
});

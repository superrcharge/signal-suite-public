import { describe, expect, it } from 'vitest';

import { column, model, row, source } from './interop-fixtures';
import { columnGroups, emptyMatrixText, pageModels, planMatrixDeck } from './matrix-pages';
import type { MatrixPaging } from './matrix-pages';
import { DECK_INPUT, DECK_OPERATION, DECK_PHASES } from './phase-deck-fixtures';

/** Whole numbers, so the arithmetic of a cut can be done by eye. */
const PAGING: MatrixPaging = {
  maxCols: 4, height: 5, headHeight: () => 1, sectionHeight: 0.5, rowHeight: () => 1,
};

const cols = (n: number) => Array.from({ length: n }, (_, i) => column(`c${String(i)}`, '#336699', 'USA', [source(`p${String(i)}`, 'equipment', `e${String(i)}`, `RADIO ${String(i)}`)]));
const rowsOf = (n: number, section: 'waveform' | 'service' | 'transport', width: number) => Array.from({ length: n }, (_, i) => row(
  section, `${section}${String(i)}`, `${section.toUpperCase()}${String(i)}`, '', Array.from({ length: width }, (_, c) => [source(`p${String(c)}`, 'equipment', `e${String(c)}`, `RADIO ${String(c)}`)]),
));

describe('columnGroups', () => {
  it('is one group when the columns fit', () => {
    expect(columnGroups(3, 6)).toEqual([[0, 3]]);
    expect(columnGroups(6, 6)).toEqual([[0, 6]]);
  });

  it('cuts as evenly as it can, the larger groups first', () => {
    expect(columnGroups(7, 4)).toEqual([[0, 4], [4, 7]]);
    expect(columnGroups(9, 4)).toEqual([[0, 3], [3, 6], [6, 9]]);
    expect(columnGroups(13, 6)).toEqual([[0, 5], [5, 9], [9, 13]]);
  });

  it('holds every column exactly once', () => {
    for (const [n, max] of [[1, 1], [8, 3], [20, 7]] as const) {
      const groups = columnGroups(n, max);
      expect(groups.flatMap(([a, b]) => Array.from({ length: b - a }, (_, i) => a + i))).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(Math.max(...groups.map(([a, b]) => b - a))).toBeLessThanOrEqual(max);
    }
  });
});

describe('pageModels', () => {
  it('is the model itself when it fits one page', () => {
    const m = model(cols(3), rowsOf(2, 'waveform', 3));
    expect(pageModels(m, PAGING)).toEqual([m]);
  });

  it('is one page, unchanged, for a model with nothing in it', () => {
    const none = model([], []);
    expect(pageModels(none, PAGING)).toEqual([none]);
    const noRows = model(cols(2), []);
    expect(pageModels(noRows, PAGING)).toEqual([noRows]);
  });

  it('cuts a wide grid by columns, each page keeping its own columns and the cells that go with them', () => {
    const pages = pageModels(model(cols(7), rowsOf(2, 'waveform', 7)), PAGING);
    expect(pages.map((p) => p.columns.map((c) => c.key))).toEqual([['c0', 'c1', 'c2', 'c3'], ['c4', 'c5', 'c6']]);
    for (const p of pages) {
      for (const r of p.rows) {
        expect(r.cells).toHaveLength(p.columns.length);
        // Cell k of a row is still the source of column k.
        r.cells.forEach((cell, k) => { expect(cell.sources[0]!.participantId).toBe(`p${p.columns[k]!.key.slice(1)}`); });
      }
    }
  });

  it('cuts a tall grid by rows, a section line counted for the first row of a page and of each section', () => {
    const rows = [...rowsOf(5, 'waveform', 2), ...rowsOf(2, 'service', 2)];
    const pages = pageModels(model(cols(2), rows), PAGING);
    // Budget 4: three waveforms take 1.5 + 1 + 1, the fourth would make 4.5; the second page's service opens a section, 1.5, so only that and the other two fit.
    expect(pages.map((p) => p.rows.map((r) => r.key))).toEqual([
      ['waveform0', 'waveform1', 'waveform2'],
      ['waveform3', 'waveform4', 'service0'],
      ['service1'],
    ]);
    // Every page has the same columns, so the header is the same on each.
    expect(new Set(pages.map((p) => p.columns.map((c) => c.key).join()))).toEqual(new Set(['c0,c1']));
  });

  it('cuts by rows within each column group, so a wide and tall grid is every group of every cut', () => {
    const pages = pageModels(model(cols(7), rowsOf(7, 'waveform', 7)), PAGING);
    expect(pages.map((p) => `${String(p.columns.length)}x${String(p.rows.length)}`)).toEqual(['4x3', '4x3', '4x1', '3x3', '3x3', '3x1']);
    // Nothing is lost: each row appears once in each group.
    const first = pages.filter((p) => p.columns[0]!.key === 'c0').flatMap((p) => p.rows.map((r) => r.key));
    expect(first).toEqual(Array.from({ length: 7 }, (_, i) => `waveform${String(i)}`));
  });

  it('gives a row taller than a page a page of its own rather than dropping it', () => {
    const pages = pageModels(model(cols(2), rowsOf(3, 'waveform', 2)), { ...PAGING, rowHeight: () => 99 });
    expect(pages.map((p) => p.rows.length)).toEqual([1, 1, 1]);
  });
});

describe('planMatrixDeck', () => {
  const plan = (paging: MatrixPaging) => planMatrixDeck({ operation: DECK_OPERATION, phases: DECK_PHASES, input: DECK_INPUT, paging });

  it('is All phases first, then one page per phase in phase order, whatever order the phases came in', () => {
    const { pages } = plan({ ...PAGING, height: 99 });
    expect(pages.map((p) => p.title)).toEqual([
      'Night Owl - Matrix - All phases',
      'Night Owl - Matrix - Staging',
      'Night Owl - Matrix - Infil',
      'Night Owl - Matrix - Exfil',
    ]);
    expect(pages.map((p) => p.phaseId)).toEqual([null, 'ph1', 'ph2', 'ph3']);
    expect(pages.map((p) => p.model.phaseId)).toEqual([null, 'ph1', 'ph2', 'ph3']);
  });

  it('draws each scope with what is there under it: Exfil has no BRAVO', () => {
    const { pages } = plan({ ...PAGING, height: 99 });
    expect(pages.map((p) => p.model.columns.map((c) => c.label))).toEqual([
      ['ALPHA', 'BRAVO', 'CHARLIE'], ['ALPHA', 'BRAVO', 'CHARLIE'], ['ALPHA', 'BRAVO', 'CHARLIE'], ['ALPHA', 'CHARLIE'],
    ]);
  });

  it('plans one scope only when asked: the phase on screen, or All phases for null', () => {
    const one = (only: string | null) => planMatrixDeck({ operation: DECK_OPERATION, phases: DECK_PHASES, input: DECK_INPUT, paging: { ...PAGING, height: 99 }, only });
    const infil = DECK_PHASES.find((p) => p.name === 'Infil')!;
    expect(one(infil.id).pages.map((p) => p.title)).toEqual(['Night Owl - Matrix - Infil']);
    expect(one(null).pages.map((p) => p.title)).toEqual(['Night Owl - Matrix - All phases']);
  });

  it('is only All phases when the operation has no phases', () => {
    const { pages } = planMatrixDeck({ operation: DECK_OPERATION, phases: [], input: DECK_INPUT, paging: PAGING });
    expect(pages.map((p) => p.title)).toEqual(['Night Owl - Matrix - All phases']);
  });

  it('numbers the continuation pages of a scope among themselves, and only a scope that has more than one', () => {
    const { pages } = plan({ ...PAGING, maxCols: 2, height: 99 });
    expect(pages.map((p) => p.title)).toEqual([
      'Night Owl - Matrix - All phases (1 of 2)',
      'Night Owl - Matrix - All phases (2 of 2)',
      'Night Owl - Matrix - Staging (1 of 2)',
      'Night Owl - Matrix - Staging (2 of 2)',
      'Night Owl - Matrix - Infil (1 of 2)',
      'Night Owl - Matrix - Infil (2 of 2)',
      'Night Owl - Matrix - Exfil',
    ]);
    expect(pages.map((p) => [p.part, p.parts])).toEqual([[1, 2], [2, 2], [1, 2], [2, 2], [1, 2], [2, 2], [1, 1]]);
    // Two columns and one, the larger first.
    expect(pages.slice(0, 2).map((p) => p.model.columns.map((c) => c.label))).toEqual([['ALPHA', 'BRAVO'], ['CHARLIE']]);
  });
});

describe('emptyMatrixText', () => {
  it('says what the screen says for All phases and for one phase', () => {
    expect(emptyMatrixText(model([], []))).toBe('No waveforms to compare. Add waveforms to the Comms Library.');
    expect(emptyMatrixText(model([], [], 'ph1'))).toBe('Nothing is in this phase.');
  });
});

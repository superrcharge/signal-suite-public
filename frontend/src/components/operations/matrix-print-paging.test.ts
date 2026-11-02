import { describe, expect, it } from 'vitest';

import { column, model, row, source } from './interop-fixtures';
import { pageModels } from './matrix-pages';
import { PAGE_H, PAGE_W, printPaging } from './matrix-print-paging';

const units = (n: number) => Array.from({ length: n }, (_, i) => column(`c${String(i)}`, '#336699', 'USA', [source(`p${String(i)}`, 'equipment', `e${String(i)}`, 'R')]));
const withChips = (n: number, chips: number, section: 'waveform' | 'service' = 'waveform') => Array.from({ length: n }, (_, i) => row(
  section, `${section}${String(i)}`, `W${String(i)}`, '',
  [Array.from({ length: chips }, (_, k) => source('p0', 'equipment', `e${String(k)}`, 'AN/PRC-152A'))],
));

describe('printPaging', () => {
  it('is Letter landscape, less the margin the print shell takes', () => {
    expect([PAGE_W, PAGE_H]).toEqual([979, 738]);
  });

  it('holds as many columns as the grid\'s least width allows, the label column included', () => {
    // 915 of grid less the 170 label column, at 110 a unit.
    expect(printPaging().maxCols).toBe(6);
  });

  it('cuts 7 units into 4 and 3 rather than 6 and 1', () => {
    const pages = pageModels(model(units(7), withChips(1, 1)), printPaging());
    expect(pages.map((p) => p.columns.length)).toEqual([4, 3]);
  });

  it('keeps a short grid on one page and cuts a tall one, every row of it on some page once', () => {
    const paging = printPaging();
    expect(pageModels(model(units(3), withChips(8, 1)), paging)).toHaveLength(1);
    const tall = pageModels(model(units(3), withChips(60, 1)), paging);
    expect(tall.length).toBeGreaterThan(1);
    expect(tall.flatMap((p) => p.rows.map((r) => r.key))).toEqual(Array.from({ length: 60 }, (_, i) => `waveform${String(i)}`));
  });

  it('gives a row of many chips more height than a row of one, so it is cut sooner', () => {
    const paging = printPaging();
    const one = paging.rowHeight(withChips(1, 1)[0]!, units(1), 1);
    const many = paging.rowHeight(withChips(1, 12)[0]!, units(1), 1);
    expect(many).toBeGreaterThan(one);
    // More units in the page make each narrower, so the same chips wrap further.
    const wide = paging.rowHeight(withChips(1, 6)[0]!, units(1), 1);
    const narrow = paging.rowHeight(withChips(1, 6)[0]!, units(6), 6);
    expect(narrow).toBeGreaterThanOrEqual(wide);
  });

  it('takes more room for a head that carries a branch, and for a section line, than for nothing', () => {
    const paging = printPaging();
    const withBranch = paging.headHeight(units(2), 2);
    const without = paging.headHeight(units(2).map((c) => ({ ...c, branch: '' })), 2);
    expect(withBranch).toBeGreaterThan(without);
    expect(paging.sectionHeight).toBeGreaterThan(0);
  });
});

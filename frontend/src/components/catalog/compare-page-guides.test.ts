import { describe, it, expect } from 'vitest';
import {
  FIT_FLOOR,
  FIT_TEXT_FLOOR,
  LABEL_COL,
  PAGE_H,
  PAGE_W,
  PRINT_MARGIN_IN,
  PRINT_PAGE_CSS,
  balanceColumns,
  compareDensity,
  fitScale,
  fitTextScale,
  paginateColumns,
  printDensity,
  pageSeams,
  seamIndices,
  columnFitScale,
} from './compare-page-guides';

describe('PAGE_W / PAGE_H / PRINT_PAGE_CSS', () => {
  // One number, PRINT_MARGIN_IN, drives both the layout maths and the
  // browser's own @page rule, so they cannot describe two different sheets.
  it('describe the printable box inside the margin, not the paper sheet', () => {
    expect(PAGE_W).toBe((11 - 2 * PRINT_MARGIN_IN) * 96);
    expect(PAGE_H).toBe((8.5 - 2 * PRINT_MARGIN_IN) * 96);
    expect(PAGE_W).toBe(1008);
    expect(PAGE_H).toBe(768);
  });

  it('states the same margin the geometry above was derived from', () => {
    expect(PRINT_PAGE_CSS).toContain(`margin: ${PRINT_MARGIN_IN}in`);
    expect(PRINT_PAGE_CSS).toContain('size: letter landscape');
  });

  // Emotion nests @page inside a generated class rule and the browser drops
  // it; only a top-level @page inside @media print survives injection via a
  // <style> element.
  it('keeps @page at the top level of @media print', () => {
    expect(PRINT_PAGE_CSS).toMatch(/^@media print \{ @page \{/);
  });
});

describe('paginateColumns', () => {
  it('fits at least one column even against an absurd label column', () => {
    expect(paginateColumns(5, PAGE_W - 1).perPage).toBe(1);
  });

  // The whole reason this function exists. A seam at a raw multiple of the
  // page width lands wherever it lands, which is usually through a terminal.
  it('divides the page exactly, so a seam falls on a column edge', () => {
    const { perPage, colW } = paginateColumns(20);
    expect(LABEL_COL + perPage * colW).toBeCloseTo(PAGE_W, 6);
  });

  it('leaves no dead gutter at the right margin', () => {
    const { perPage, colW } = paginateColumns(20);
    // One more column would overflow the page, so the fit is maximal.
    expect(LABEL_COL + (perPage + 1) * colW).toBeGreaterThan(PAGE_W);
  });

  it('reports a single page while the selection fits', () => {
    const { perPage } = paginateColumns(1);
    expect(paginateColumns(perPage).paged).toBe(false);
    expect(paginateColumns(perPage + 1).paged).toBe(true);
  });

  it('does not depend on how many columns are selected for its geometry', () => {
    expect(paginateColumns(2).colW).toBe(paginateColumns(40).colW);
  });
});

describe('balanceColumns', () => {
  it('spreads the remainder across the earlier pages, larger chunks first', () => {
    const nine = balanceColumns([1, 2, 3, 4, 5, 6, 7, 8, 9], 6);
    expect(nine.map(p => p.length)).toEqual([5, 4]);

    const thirteen = balanceColumns(Array.from({ length: 13 }, (_, i) => i), 6);
    expect(thirteen.map(p => p.length)).toEqual([5, 4, 4]);

    const twelve = balanceColumns(Array.from({ length: 12 }, (_, i) => i), 6);
    expect(twelve.map(p => p.length)).toEqual([6, 6]);
  });

  it('is empty for an empty selection', () => {
    expect(balanceColumns([], 6)).toEqual([]);
  });

  it('puts everything on one page for a nonsense page size', () => {
    expect(balanceColumns([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
  });

  it('preserves order and uses every item exactly once', () => {
    const items = Array.from({ length: 23 }, (_, i) => i);
    const pages = balanceColumns(items, 6);
    expect(pages.flat()).toEqual(items);
  });

  it('never spreads a page more than one item wider than another', () => {
    for (let n = 1; n <= 40; n++) {
      const sizes = balanceColumns(Array.from({ length: n }, (_, i) => i), 6).map(p => p.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the same page count a greedy split would have used', () => {
    for (let n = 1; n <= 40; n++) {
      const items = Array.from({ length: n }, (_, i) => i);
      expect(balanceColumns(items, 6).length).toBe(Math.ceil(n / 6));
    }
  });
});

describe('pageSeams', () => {
  // usePrintPagination hands its own chunking through this, so the live
  // guides follow Fit: one page of columns means no seam at all.
  it('is the start index of every page after the first', () => {
    expect(pageSeams([[0, 1, 2], [3, 4], [5, 6]])).toEqual([3, 5]);
  });

  it('is empty for one page or none', () => {
    expect(pageSeams([[0, 1, 2, 3]])).toEqual([]);
    expect(pageSeams([])).toEqual([]);
  });
});

describe('seamIndices', () => {
  it('matches the worked examples', () => {
    expect(seamIndices(9, 6)).toEqual([5]);
    expect(seamIndices(13, 6)).toEqual([5, 9]);
  });

  it('is empty when everything fits on one page', () => {
    expect(seamIndices(4, 6)).toEqual([]);
  });

  // The guide and the printed chunking must never disagree about where a
  // page breaks, so the seam positions are checked against balanceColumns'
  // own chunk sizes rather than against a second, hand-rolled expectation.
  it('equals the cumulative chunk sizes balanceColumns would produce', () => {
    for (let n = 1; n <= 40; n++) {
      const items = Array.from({ length: n }, (_, i) => i);
      const sizes = balanceColumns(items, 6).map(p => p.length);
      const cumulative: number[] = [];
      let total = 0;
      for (const size of sizes.slice(0, -1)) {
        total += size;
        cumulative.push(total);
      }
      expect(seamIndices(n, 6)).toEqual(cumulative);
    }
  });
});

describe('compareDensity', () => {
  it('never grows as columns are added', () => {
    const counts = [1, 4, 5, 6, 7, 8, 9, 20];
    const keys = ['col', 'pad', 'value', 'label', 'photo', 'chip'] as const;
    for (const key of keys) {
      const series = counts.map(n => compareDensity(n)[key]);
      for (let i = 1; i < series.length; i++) {
        expect(series[i]).toBeLessThanOrEqual(series[i - 1] as number);
      }
    }
  });

  it('keeps type readable at the tightest step', () => {
    const tight = compareDensity(50);
    expect(tight.value).toBeGreaterThanOrEqual(10);
    expect(tight.label).toBeGreaterThanOrEqual(10);
    expect(tight.chip).toBeGreaterThanOrEqual(9);
  });

  // The screen row height used to be a standalone ROW_LINE constant in
  // CompareMatrix.tsx. It moved onto the density object so printDensity could
  // shrink it too, and this is what proves that move changed nothing on
  // screen: every tier still reports the same 17px box.
  it('keeps the screen row line box at 17px in every tier', () => {
    for (let n = 1; n <= 20; n++) {
      expect(compareDensity(n).line).toBe(17);
    }
  });
});

describe('printDensity', () => {
  it('is strictly tighter than compareDensity on value, label, line and pad, at every column count', () => {
    const keys = ['value', 'label', 'line', 'pad'] as const;
    for (let n = 1; n <= 20; n++) {
      const screen = compareDensity(n);
      const print = printDensity(n);
      for (const key of keys) {
        expect(print[key]).toBeLessThan(screen[key]);
      }
    }
  });

  it('never drops value below 9.5px, label below 8px, or chip below 8px', () => {
    for (let n = 1; n <= 20; n++) {
      const tier = printDensity(n);
      expect(tier.value).toBeGreaterThanOrEqual(9.5);
      expect(tier.label).toBeGreaterThanOrEqual(8);
      expect(tier.chip).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('fitScale', () => {
  it('returns 1 when the sheet already fits the page', () => {
    expect(fitScale(PAGE_H - 50)).toBe(1);
    expect(fitScale(PAGE_H)).toBe(1);
  });

  it('scales down to the ratio the sheet needs, past the page height', () => {
    const natural = PAGE_H * 1.25;
    expect(fitScale(natural)).toBeCloseTo(PAGE_H / natural, 6);
  });

  it('clamps at the floor for a sheet far taller than one page', () => {
    expect(fitScale(PAGE_H * 5)).toBe(FIT_FLOOR);
  });

  it('returns 1 for an unmeasured height, so nothing flashes tiny before layout', () => {
    expect(fitScale(0)).toBe(1);
    expect(fitScale(-10)).toBe(1);
  });
});

describe('fitTextScale', () => {
  it('returns full size, no wrap, when the value already fits', () => {
    expect(fitTextScale(80, 120)).toEqual({ scale: 1, wrap: false });
  });

  it('shrinks within the floor for a value moderately too wide', () => {
    const { scale, wrap } = fitTextScale(100, 85);
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThanOrEqual(FIT_TEXT_FLOOR);
    expect(wrap).toBe(false);
  });

  it('gives up and wraps once shrinking would pass the floor', () => {
    expect(fitTextScale(200, 50)).toEqual({ scale: FIT_TEXT_FLOOR, wrap: true });
  });

  it('renders full size, no wrap, when nothing has been measured yet', () => {
    expect(fitTextScale(0, 0)).toEqual({ scale: 1, wrap: false });
    expect(fitTextScale(100, 0)).toEqual({ scale: 1, wrap: false });
    expect(fitTextScale(0, 100)).toEqual({ scale: 1, wrap: false });
  });
});

describe('columnFitScale', () => {
  it('leaves a selection that already fits across at full size', () => {
    expect(columnFitScale(1)).toBe(1);
    expect(columnFitScale(6)).toBe(1);
  });

  it('shrinks a ten-way comparison to about 73%, which lands every column on one page', () => {
    const z = columnFitScale(10);
    expect(z).toBeGreaterThan(0.72);
    expect(z).toBeLessThan(0.74);
    expect(paginateColumns(10, LABEL_COL, PAGE_W / z).perPage).toBeGreaterThanOrEqual(10);
  });

  it('stops at the floor, so eleven and twenty columns still page rather than shrink to nothing', () => {
    expect(columnFitScale(11)).toBe(FIT_FLOOR);
    expect(columnFitScale(20)).toBe(FIT_FLOOR);
  });

  it('treats nothing to measure as nothing to shrink', () => {
    expect(columnFitScale(0)).toBe(1);
  });
});

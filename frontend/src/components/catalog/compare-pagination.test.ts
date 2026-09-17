import { describe, it, expect } from 'vitest';
import { PAGE_SAFETY, paginateRows, type PrintRowItem } from './compare-pagination';

function row(key: string, height: number): PrintRowItem {
  return { key, kind: 'row', height };
}

function group(key: string, height: number): PrintRowItem {
  return { key, kind: 'group', height };
}

describe('PAGE_SAFETY', () => {
  it('is a positive pixel margin callers subtract before pageH reaches paginateRows', () => {
    expect(PAGE_SAFETY).toBe(4);
  });
});

describe('paginateRows', () => {
  it('returns one page when everything fits', () => {
    const items = [group('g:identification', 20), row('r:make', 30), row('r:type', 30)];
    const pages = paginateRows({ items, pageH: 1000, headH: 50, firstExtra: 0 });
    expect(pages).toEqual([['g:identification', 'r:make', 'r:type']]);
  });

  it('is empty for an empty selection', () => {
    expect(paginateRows({ items: [], pageH: 1000, headH: 50, firstExtra: 0 })).toEqual([[]]);
  });

  it('preserves order and uses every key exactly once', () => {
    const items = [
      group('g:identification', 20),
      row('r:make', 30),
      row('r:type', 30),
      group('g:standard', 20),
      row('r:std:modem', 30),
      row('r:std:orbit', 30),
      row('r:std:buc', 30),
    ];
    const pages = paginateRows({ items, pageH: 90, headH: 0, firstExtra: 0 });
    expect(pages.flat()).toEqual(items.map(i => i.key));
    // Every key appears exactly once across all pages.
    expect(pages.flat().length).toBe(new Set(pages.flat()).size);
  });

  describe('capacity boundaries', () => {
    it('keeps a row that lands exactly on the boundary on the same page', () => {
      // headH 100, pageH 200 -> capacity 100 on page one. Two rows of 50
      // exactly fill it.
      const items = [row('r:a', 50), row('r:b', 50)];
      const pages = paginateRows({ items, pageH: 200, headH: 100, firstExtra: 0 });
      expect(pages).toEqual([['r:a', 'r:b']]);
    });

    it('pushes a row one pixel over the boundary to the next page', () => {
      const items = [row('r:a', 50), row('r:b', 51)];
      const pages = paginateRows({ items, pageH: 200, headH: 100, firstExtra: 0 });
      expect(pages).toEqual([['r:a'], ['r:b']]);
    });
  });

  describe('a heading never ends a page', () => {
    it('moves the heading to the next page with its first row when the row does not fit', () => {
      // capacity page one: 200 - 50 = 150. Heading (20) + row a (100) = 120,
      // fits. Adding row b (40) would make 160, over capacity - the heading
      // has already been committed, so this is the ordinary "next item does
      // not fit" case, not the orphan case.
      const items = [group('g:x', 20), row('r:a', 100), row('r:b', 40)];
      const pages = paginateRows({ items, pageH: 200, headH: 50, firstExtra: 0 });
      expect(pages).toEqual([['g:x', 'r:a'], ['r:b']]);
    });

    it('carries a heading whose own first row does not fit beside it to the next page', () => {
      // capacity page one: 200 - 50 = 150. A prior row (140) leaves 10px, and
      // a fresh heading (5) fits in that but its first row (100) does not -
      // both must move together, not leave the heading dangling alone.
      const items = [row('r:before', 140), group('g:x', 5), row('r:after', 100)];
      const pages = paginateRows({ items, pageH: 200, headH: 50, firstExtra: 0 });
      expect(pages).toEqual([['r:before'], ['g:x', 'r:after']]);
    });

    it('forces a heading together with its first row when it opens an empty page and neither alone leaves room for the other', () => {
      // capacity every page: 200 - 50 = 150. The heading (140) alone fits a
      // fresh page, but its row (30) does not fit beside it (140+30=170>150).
      // There is nothing before the heading on this page to protect by
      // pushing it forward, so it overflows together with its row instead of
      // being left to end the page alone.
      const items = [group('g:x', 140), row('r:only', 30)];
      const pages = paginateRows({ items, pageH: 200, headH: 50, firstExtra: 0 });
      expect(pages).toEqual([['g:x', 'r:only']]);
    });
  });

  it('subtracts firstExtra only from the first page, not later ones', () => {
    // capacity page one: 300 - 50 - 100 = 150. capacity later pages: 250.
    const items = [row('r:a', 150), row('r:b', 250)];
    const pages = paginateRows({ items, pageH: 300, headH: 50, firstExtra: 100 });
    expect(pages).toEqual([['r:a'], ['r:b']]);
  });

  it('subtracts headH from every page, not only the first', () => {
    // capacity every page: 300 - 100 = 200 (firstExtra 0). Three rows of 150
    // can only ever share a page two at a time if capacity were 300; at 200
    // each row gets its own page.
    const items = [row('r:a', 150), row('r:b', 150), row('r:c', 150)];
    const pages = paginateRows({ items, pageH: 300, headH: 100, firstExtra: 0 });
    expect(pages).toEqual([['r:a'], ['r:b'], ['r:c']]);
  });

  it('gives an item taller than a whole page its own page and lets it overflow, without looping', () => {
    const items = [row('r:small', 10), row('r:huge', 5000), row('r:tail', 10)];
    const pages = paginateRows({ items, pageH: 100, headH: 0, firstExtra: 0 });
    expect(pages).toEqual([['r:small'], ['r:huge'], ['r:tail']]);
  });

  it('never loops on a pathological input: page count is bounded by item count', () => {
    const items = Array.from({ length: 25 }, (_, i) => row(`r:${String(i)}`, 1000));
    const pages = paginateRows({ items, pageH: 10, headH: 0, firstExtra: 0 });
    expect(pages.length).toBeLessThanOrEqual(items.length);
    expect(pages.flat()).toEqual(items.map(i => i.key));
  });
});

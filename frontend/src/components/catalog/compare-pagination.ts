/**
 * Where a printed row page actually breaks, decided once from measured row
 * heights rather than left to the browser.
 *
 * `compare-page-guides.ts`'s old `snapToRows` measured the SCREEN grid and
 * snapped a guide to the nearest row boundary under PAGE_H - a guess dressed
 * up as a measurement, because the screen's rows are taller than the printed
 * ones (compact print density, no photo strip past the first page, a
 * repeated thead the screen guide never subtracted). This module replaces
 * that guess: the caller measures the REAL printed row heights off-screen
 * (see `use-print-pagination.tsx`) and this function turns those heights into
 * page boundaries every surface - print, the preview captions, and the live
 * page's guides - then reads back rather than recomputing.
 *
 * Pure and separate from the renderer for the same reason
 * `compare-page-guides.ts` is: a page break in the wrong place still looks
 * like a page break, so the arithmetic is asserted directly rather than by
 * eye.
 */

export interface PrintRowItem {
  /** `g:<group>` for a group heading, `r:<param.id>` for a parameter row -
   *  the same convention CompareSheet marks its rows with via
   *  `data-print-key`, so a page's key list can be handed straight back to
   *  `rowKeys` without translation. */
  key: string;
  kind: 'group' | 'row';
  /** Measured height, px, in unzoomed print units. */
  height: number;
}

export interface RowPaginationInput {
  /** In print order: a group heading, then its rows, then the next
   *  heading, and so on - the order `groupRows` already produces. */
  items: PrintRowItem[];
  /** Usable height of one printed page, px. */
  pageH: number;
  /** `<thead>` height, repeated on every page. */
  headH: number;
  /** Photo strip height, first row page only; 0 when no page in this print
   *  job renders one. */
  firstExtra: number;
}

/** Subtracted from PAGE_H by callers before it reaches `pageH` here.
 *
 * The first Fit attempt at deterministic pagination spilled a row anyway:
 * a page measured to fit exactly PAGE_H high still printed one row over,
 * because sub-pixel rounding in the measured heights and the thead's own
 * border compound by a pixel or two across twenty-odd rows. Four pixels of
 * slack is cheap - it never costs a visible extra page - and it is what
 * keeps "fits the page" from being a promise this module cannot quite keep.
 */
export const PAGE_SAFETY = 4;

/**
 * Greedy-fills printed row pages from measured heights.
 *
 * Rows and group headings are atomic - never split - and a heading may never
 * end a page: a section title with nothing under it tells the reader
 * nothing, so if a heading fits but its first row does not, both move to the
 * next page together. The one case that rule cannot honour is a heading
 * that opens an otherwise-empty page and whose own first row still will not
 * fit beside it there either - moving it forward again would just repeat the
 * same problem forever, so it is allowed to overflow together with that row
 * instead, the same way a single oversize row is allowed to overflow alone
 * below.
 *
 * An item taller than a whole page's capacity - a row whose value simply
 * will not fit under any pagination - goes alone on its own page and is
 * allowed to overflow. There is no honest alternative: it cannot be split
 * (rows are atomic) and it cannot be shrunk further here (that is
 * `fitTextScale`'s job, already applied before this ever measures anything),
 * so the only choices are "print it too tall" or loop forever hunting for a
 * page it fits. This never loops: every page consumes at least one item, so
 * the item count is a hard bound on the number of pages produced.
 */
export function paginateRows(input: RowPaginationInput): string[][] {
  const { items, pageH, headH, firstExtra } = input;
  if (items.length === 0) return [[]];

  const pages: string[][] = [];
  let i = 0;
  let pageIndex = 0;

  while (i < items.length) {
    // Only the first row page loses the photo strip's height; the thead
    // repeats - and so costs its height - on every page.
    const capacity = Math.max(0, pageIndex === 0 ? pageH - headH - firstExtra : pageH - headH);

    const page: PrintRowItem[] = [];
    let used = 0;

    while (i < items.length) {
      // items.length already bounds `i` here; the check is only to satisfy
      // noUncheckedIndexedAccess, never a case that is actually reachable.
      const item = items[i];
      if (!item) break;
      const projected = used + item.height;

      if (page.length === 0 && item.height > capacity) {
        // Oversize: this single item cannot fit any page's capacity. Give it
        // its own page and let it overflow rather than search forever for a
        // page that does not exist.
        page.push(item);
        i++;
        break;
      }

      if (projected > capacity) break; // Does not fit here; starts the next page.

      page.push(item);
      used = projected;
      i++;
    }

    // A group heading may never be the last item on a page. Structurally a
    // heading is only ever followed by its own rows, so at most one trailing
    // heading can end up here - it is the one whose first row just failed
    // the `projected > capacity` check above.
    while (page.length > 1) {
      const last = page[page.length - 1];
      if (!last || last.kind !== 'group') break;
      i--;
      page.pop();
    }

    // The heading was the only thing that fit at all: there is nothing
    // earlier on this page to protect by pushing it forward, so pushing it
    // forward would only recreate the same page-of-one-heading on the next
    // page, forever. Force it together with its first row instead, even if
    // together they overflow the capacity that turned it away alone.
    if (page.length === 1 && page[0]?.kind === 'group' && i < items.length) {
      const next = items[i];
      if (next) {
        page.push(next);
        i++;
      }
    }

    pages.push(page.map(it => it.key));
    pageIndex++;
  }

  return pages;
}

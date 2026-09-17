/**
 * Matrix layout maths: where a printed page would end, and how tight to draw
 * the grid for a given number of columns.
 *
 * Pure and separate from the renderer so it is asserted directly. It is also
 * the kind of arithmetic that is invisible when wrong: a guide in the wrong
 * place still looks like a guide.
 */

/**
 * Landscape US Letter at 96dpi, the basis SheetPreview already uses for the
 * PACE card. A comparison is wider than it is tall in every case worth
 * printing, and it exports to a landscape slide, so the page it is measured
 * against is the long way round.
 */
const PAPER_W_IN = 11;
const PAPER_H_IN = 8.5;
const DPI = 96;

/**
 * The print route's `@page` margin, on every edge. One number, because it
 * has to agree with itself in two places at once: it is subtracted out of
 * the paper size below to get the printable box, and it is the margin
 * `PRINT_PAGE_CSS` actually asks the browser for. Those two used to be typed
 * separately, which is how they drifted.
 */
export const PRINT_MARGIN_IN = 0.25;

/**
 * PAGE_W and PAGE_H describe the PRINTABLE box, inside the `@page` margin,
 * not the paper sheet. They used to be the full 11in x 8.5in sheet at 96dpi
 * (1056 x 816), which disagreed with the printed page by exactly the width
 * of the margins on every edge: the matrix was laid out to fill a sheet the
 * browser never gave it that much of, so the printed page never actually
 * filled edge to edge. Deriving both from PRINT_MARGIN_IN means the layout
 * maths and the `@page` rule cannot say two different things about how much
 * paper there is.
 */
export const PAGE_W = (PAPER_W_IN - 2 * PRINT_MARGIN_IN) * DPI;
export const PAGE_H = (PAPER_H_IN - 2 * PRINT_MARGIN_IN) * DPI;

/**
 * The `@page` rule the print route must inject via a `<style>` element in
 * `document.head`, the same way pace-print-page.tsx does it, and never as an
 * emotion `sx` object. Emotion nests whatever it is given inside a
 * generated class rule, and a browser silently drops an `@page` that is not
 * a top-level statement, so an `sx`-based attempt compiles, renders and then
 * does nothing. catalog-tokens.css already declares `@page { size: letter
 * portrait }` for the datasheet, and that rule wins over a dropped one,
 * which is the same collision pace-print-page.tsx documents for the PACE
 * sheet. A `<style>` tag appended after that stylesheet import is what lets
 * this landscape rule win instead.
 */
export const PRINT_PAGE_CSS = `@media print { @page { size: letter landscape; margin: ${PRINT_MARGIN_IN}in; } }`;

/** The row-label column, repeated on every printed page. */
export const LABEL_COL = 200;

/** Narrowest a value column may be squeezed to before it stops being read. */
export const MIN_COL = 118;

export interface ColumnPagination {
  /** Equipment columns that fit on one page beside the label column. */
  perPage: number;
  /** Exact column width that makes `perPage` of them fill the page. */
  colW: number;
  /** Whether the selection needs more than one page across. */
  paged: boolean;
}

/**
 * How many columns fit on a page, and how wide they must be to fill it.
 *
 * The naive guide drew a rule at a multiple of the page width, which lands
 * wherever it lands: usually straight down the middle of a terminal, which is
 * the one place a break must never fall. A column split across two sheets is
 * not a comparison, it is two halves of one.
 *
 * So the page decides the column width rather than the other way round. Fit
 * as many columns as will hold MIN_COL, then widen them to divide the page
 * exactly, which both puts every seam on a column edge and leaves no gutter
 * of dead paper at the right margin.
 */
export function paginateColumns(count: number, labelCol = LABEL_COL, pageW = PAGE_W): ColumnPagination {
  // `pageW` is the page as laid out, which under Fit is PAGE_W / zoom: a
  // zoomed-down sheet is laid out wider and so holds more columns.
  const usable = pageW - labelCol;
  const perPage = Math.max(1, Math.floor(usable / MIN_COL));
  return { perPage, colW: usable / perPage, paged: count > perPage };
}

/**
 * The columns of each printed page, in order, balanced so the last page is
 * not left stretched thin.
 *
 * A greedy split fills every page to `perPage` before starting the next, so
 * whatever is left over becomes a final page of one or two columns squeezed
 * to the same width as a full page's worth. That page reads as an
 * afterthought rather than a comparison. Balancing keeps the page count a
 * greedy split would have produced - ceil(n / perPage) - but spreads the
 * remainder across the earlier pages instead of dumping it all on the last
 * one, so no page's columns are visually much narrower than another's.
 *
 * The split itself is exact integer division: with k pages for n items, the
 * first `n % k` pages get one extra item and the rest get the floor, larger
 * chunks first. That is what makes 9 items at perPage 6 come out [5, 4]
 * rather than the greedy [6, 3], and it never changes k, so pagination
 * elsewhere (page count, "page X of Y") is unaffected.
 */
export function balanceColumns<T>(items: T[], perPage: number): T[][] {
  const sizes = pageSizes(items.length, perPage);
  const pages: T[][] = [];
  let start = 0;
  for (const size of sizes) {
    pages.push(items.slice(start, start + size));
    start += size;
  }
  return pages;
}

/** Shared by balanceColumns and seamIndices so their idea of how big each
 *  page is can never come apart. */
function pageSizes(count: number, perPage: number): number[] {
  if (count <= 0) return [];
  const pageCount = perPage < 1 ? 1 : Math.ceil(count / perPage);
  const base = Math.floor(count / pageCount);
  const remainder = count % pageCount;
  const sizes: number[] = [];
  for (let i = 0; i < pageCount; i++) sizes.push(base + (i < remainder ? 1 : 0));
  return sizes;
}

/**
 * The cumulative column index after each page break, except the last: where
 * the on-screen guide draws its vertical rules.
 *
 * Computed by running balanceColumns itself over a plain index array rather
 * than re-deriving the page sizes, so the guide and the printed chunking are
 * the same computation wearing two names. A hand-rolled second version of
 * the same arithmetic is exactly how a guide and a printed seam end up
 * disagreeing about where a page actually breaks - the failure row breaks
 * avoid the same way, by reading `paginateRows`' one measured decision
 * instead of a second, screen-side guess (see `compare-pagination.ts`).
 */
export function seamIndices(count: number, perPage: number): number[] {
  const indices = Array.from({ length: count }, (_, i) => i);
  return pageSeams(balanceColumns(indices, perPage));
}

/**
 * The seams of pages already chunked: the index each page after the first
 * starts at. `usePrintPagination` hands its own `columnPages` through this,
 * so the live guides follow whatever Fit did to the chunking rather than
 * re-deriving it from an unzoomed page width.
 */
export function pageSeams(pages: ReadonlyArray<ReadonlyArray<unknown>>): number[] {
  const seams: number[] = [];
  let total = 0;
  for (const page of pages.slice(0, -1)) {
    total += page.length;
    seams.push(total);
  }
  return seams;
}

export interface CompareDensity {
  /** Column minimum width, px. */
  col: number;
  /** Cell padding, px. */
  pad: number;
  /** Value text size, px. */
  value: number;
  /** Row label text size, px. */
  label: number;
  /** Header photo well height, px. */
  photo: number;
  /** Chip text size inside a list cell, px. */
  chip: number;
  /** Row line box height, px - the box a value and its label share so both
   *  start level. Carried on the density object, rather than left as the
   *  standalone ROW_LINE constant CompareMatrix.tsx used to export, so a
   *  print tier can shrink it exactly as it shrinks value and label size. */
  line: number;
}

/**
 * Tighten the grid as columns are added.
 *
 * A comparison is only useful while the columns are on screen together, and
 * the fixed geometry that reads well at three columns pushes the seventh off
 * the right edge. Rather than cap the column count, which is a rule someone
 * meets at the worst moment, the cells give up padding and a point or two of
 * type as the count climbs.
 *
 * The floor is deliberate and is where this stops: below roughly 10px mono on
 * a dark ground the text stops being readable, and an unreadable comparison
 * that fits is worth less than a readable one that scrolls. Past the last
 * step the matrix scrolls, which it is built to do.
 */
export function compareDensity(columns: number): CompareDensity {
  if (columns <= 4) return { col: 168, pad: 9, value: 12.5, label: 11, photo: 64, chip: 10, line: 17 };
  if (columns <= 6) return { col: 152, pad: 7, value: 12, label: 10.5, photo: 56, chip: 9.5, line: 17 };
  if (columns <= 8) return { col: 138, pad: 6, value: 11.5, label: 10, photo: 48, chip: 9, line: 17 };
  return { col: 124, pad: 5, value: 11, label: 10, photo: 40, chip: 9, line: 17 };
}

/**
 * The same tightening, tuned for paper instead of a screen.
 *
 * Paper is the scarce axis in a way a monitor never is: a comparison with
 * every parameter selected fit only about twenty rows per landscape Letter
 * page at screen density, because a single-line row printed roughly 0.34in
 * tall. There is no equivalent floor to compareDensity's "below 10px mono
 * stops being readable on a dark ground" - print is read at arm's length, at
 * 300+dpi, on paper that holds contrast a backlit screen does not need to, so
 * 9.5px body copy (about 7pt) stays legible on the page where it would not in
 * the app. That is why this is a second function rather than compareDensity
 * with a lower floor: the two surfaces have different floors because they are
 * read differently, not because print is merely "compareDensity, smaller".
 */
export function printDensity(columns: number): CompareDensity {
  if (columns <= 4) return { col: 168, pad: 6, value: 10.5, label: 9, photo: 44, chip: 8.5, line: 13 };
  if (columns <= 6) return { col: 152, pad: 5, value: 10, label: 8.5, photo: 40, chip: 8, line: 13 };
  return { col: 138, pad: 4, value: 9.5, label: 8.5, photo: 36, chip: 8, line: 12 };
}

/** Floor `fitScale` will not shrink a page past, however tall the sheet is.
 *  Below 70% the table's own text shrinks with it - CompareSheet still uses
 *  printDensity's sizes - to the point a magnifier is doing more work than
 *  the printer. Past the floor the sheet simply spans another page, which
 *  balanceColumns (columns) and paginateRows (rows) already handle. */
export const FIT_FLOOR = 0.7;

/**
 * How far to zoom a printed sheet so its rows land on one page.
 *
 * A ratio, not a fit-to-content computation: the caller measures the sheet's
 * natural (unzoomed) height once, and this just clamps `pageH / natural` into
 * a usable range. Returns 1 - no shrinking - both when the sheet already fits
 * and when the caller has nothing to measure yet (`naturalHeight <= 0`, the
 * state before layout has happened, e.g. in jsdom or before the first paint),
 * so a page never flashes tiny before its real height is known.
 */
export function fitScale(naturalHeight: number, pageH: number = PAGE_H, floor: number = FIT_FLOOR): number {
  if (naturalHeight <= 0) return 1;
  const ratio = pageH / naturalHeight;
  return Math.min(1, Math.max(floor, ratio));
}

/**
 * How far to zoom a printed sheet so every column lands on one page across.
 *
 * Pure arithmetic, unlike `fitScale`, because column width is a rule rather
 * than a measurement: a page at zoom `z` is `pageW / z` wide and holds
 * `floor((pageW / z - labelCol) / minCol)` columns, so every one of `count`
 * fits when `z <= pageW / (labelCol + count * minCol)`. Clamped to the same
 * floor as `fitScale`; past it the sheet spans another page across, which
 * `balanceColumns` already handles.
 *
 * Worked: 10 columns on landscape Letter is 1008 / (200 + 1180) = 0.73, above
 * the floor, so a ten-way comparison prints on one page at 73%. Eleven is
 * 0.68, below it, so eleven still pages. "Fit to one page" used to know
 * nothing about this axis at all: it shrank rows and left columns to page,
 * so a wide comparison came out two pages with Fit on or off.
 */
export function columnFitScale(
  count: number,
  labelCol: number = LABEL_COL,
  minCol: number = MIN_COL,
  pageW: number = PAGE_W,
  floor: number = FIT_FLOOR,
): number {
  if (count <= 0) return 1;
  const ratio = pageW / (labelCol + count * minCol);
  return Math.min(1, Math.max(floor, ratio));
}

/** Floor `fitTextScale` will shrink a single value's text to before it gives
 *  up and wraps instead. Higher than FIT_FLOOR on purpose: a whole sheet
 *  scaled to 70% is still a sheet a reader can lean into, but a single value
 *  shrunk that far beside full-size neighbours in the same column reads as
 *  broken, not compact - wrapping to a second line is the more legible
 *  outcome past 80%. */
export const FIT_TEXT_FLOOR = 0.8;

/**
 * Shrink one value's text just enough to keep it on one line, and say when
 * that stopped being possible.
 *
 * Never truncates. Paper has no hover state to recover a clipped value with
 * the way a screen's `title` attribute can, so the only two honest outcomes
 * for a value wider than its cell are "make it fit" and "let it wrap" - never
 * "cut it off and hope the reader guesses the rest".
 *
 * `natural` and `available` are both caller-measured pixel widths. Either at
 * or below zero means there is nothing to measure yet - the jsdom test
 * environment never lays anything out, and a real browser hasn't painted the
 * first frame - so the safe answer is "render at full size, don't wrap",
 * exactly like `fitScale` returning 1 for an unmeasured sheet.
 */
export function fitTextScale(
  natural: number,
  available: number,
  floor: number = FIT_TEXT_FLOOR,
): { scale: number; wrap: boolean } {
  if (natural <= 0 || available <= 0) return { scale: 1, wrap: false };
  const scale = Math.min(1, available / natural);
  if (scale < floor) return { scale: floor, wrap: true };
  return { scale, wrap: false };
}

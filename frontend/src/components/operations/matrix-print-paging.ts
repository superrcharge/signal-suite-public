/**
 * Where the printed Matrix is cut into pages, in the screen's pixels.
 *
 * The printed page is the grid the screen draws, so its measures are that
 * grid's: a 170px label column, unit columns at least 110px wide, 7px of padding
 * round every cell and its chips 18px tall with 3px between. The estimates
 * below are close rather than exact, because the browser lays the table out and
 * this only decides where to cut; a page that comes out a little taller than
 * estimated is scaled to fit by the print route instead of running over.
 */

import { SHEET_PAD_X } from './phase-deck-sheet';
import type { InteropColumn, InteropRow, Source } from './interop-model';
import type { MatrixPaging } from './matrix-pages';

/**
 * Letter landscape less the shell's margin, as `operation-print-page.tsx` has
 * it; a test holds the two to each other, since a component does not import a page.
 */
export const PAGE_W = 979;
export const PAGE_H = 738;

const FIRST_COL = 170;
const MIN_UNIT = 110;
/** The sheet's own padding above, the title and its margin, and the padding below. */
const SHEET_CHROME = 28 + 55 + 28;
const CELL_PAD = 14;
const CHIP_H = 18;
const CHIP_GAP = 3;
const MONO_CHAR = 6.6;
const HEAD_CHAR = 7.4;

/** The width the grid has: the page less the sheet's padding each side. */
const GRID_W = PAGE_W - 2 * SHEET_PAD_X;

function unitWidth(count: number): number {
  const first = Math.max(FIRST_COL, (GRID_W * 1.4) / (1.4 + count));
  return Math.max(MIN_UNIT, (GRID_W - first) / count);
}

/** Lines a label of `length` characters takes at `perLine` to a line. */
const linesOf = (length: number, perLine: number) => Math.max(1, Math.ceil(length / Math.max(1, perLine)));

/** The height of a cell's chips, packed into lines of `room` pixels as a wrapping row of them is. */
function chipsHeight(sources: Source[], room: number): number {
  const lines: number[] = [];
  let used = 0;
  let open = false;
  for (const s of sources) {
    const w = s.label.length * MONO_CHAR + 14;
    if (w > room) {
      // Wider than the cell: it takes a line to itself and wraps inside it.
      lines.push(linesOf(s.label.length, Math.floor((room - 14) / MONO_CHAR)) * 14 + 4);
      open = false;
    } else if (open && used + CHIP_GAP + w <= room) {
      used += CHIP_GAP + w;
    } else {
      lines.push(CHIP_H);
      used = w;
      open = true;
    }
  }
  return Math.max(CHIP_H, lines.reduce((sum, h) => sum + h, 0) + Math.max(0, lines.length - 1) * CHIP_GAP);
}

function rowHeightOf(row: InteropRow, columns: InteropColumn[]): number {
  const w = unitWidth(columns.length) - 17;
  const lead = 19 + (row.name ? linesOf(row.name.length, Math.floor((FIRST_COL - 17) / 5.5)) * 15 : 0);
  const cells = row.cells.map((c) => (c.sources.length === 0 ? 16 : chipsHeight(c.sources, w)));
  return CELL_PAD + Math.max(lead, ...cells) + 1;
}

/** What the printed page can take: as many columns as the least width allows, and the height under the title. */
export function printPaging(): MatrixPaging {
  return {
    maxCols: Math.max(1, Math.floor((GRID_W - FIRST_COL) / MIN_UNIT)),
    height: PAGE_H - SHEET_CHROME,
    headHeight: (columns) => {
      const perLine = Math.floor((unitWidth(columns.length) - 16) / HEAD_CHAR);
      const lines = Math.max(1, ...columns.map((c) => linesOf(c.label.length, perLine)));
      return CELL_PAD + lines * 16 + (columns.some((c) => c.branch) ? 21 : 0) + 3;
    },
    sectionHeight: CELL_PAD + 15 + 1,
    rowHeight: (row, columns) => rowHeightOf(row, columns),
  };
}

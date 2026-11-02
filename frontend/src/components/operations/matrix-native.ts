/**
 * The operation's Matrix as the native PowerPoint slides of a deck: a title and
 * the grid as a real table, which is rows and cells a person edits in
 * PowerPoint, not a picture of them and not shapes arranged to look like one.
 *
 * What the screen draws and what the table holds:
 *
 * - **The header row is the units**: the label in the display face, the branch
 *   under it, and the organization's colour as a heavy rule along the cell's
 *   top, where the screen has its pip.
 * - **The first column is the capability**: the waveform, service or transport
 *   in the display face, its name under it in the mono face.
 * - **A section is a merged row**, one cell across the whole width, as the
 *   screen's band is.
 * - **A cell names the assets that give the row**, one to a line, the screen's
 *   chips as text; a cell nobody fills is a dash.
 *
 * The grid is the collapsed one: an organization opened into one column per
 * asset on screen is still one column here, since the deck is the reference and
 * the asset columns are for working a link out. A grid too wide or too tall for
 * a slide at a readable size is cut into continuation slides (`matrix-pages.ts`),
 * each with the label column and the header again. Nothing is smaller than 9pt.
 *
 * Nothing here touches the DOM or the network: colours arrive through `resolve`,
 * as in `phase-native.ts`, which also names the two faces the deck embeds.
 */

import { branchColor } from '@/components/catalog/branch-colors';
import type { PptxObject, PptxRun, PptxSlide, PptxStroke, PptxTableCell, PptxTableRow } from '@/components/common/sheet-export/pptx';
import { operationMatrixStem } from '@/components/common/sheet-export/sheet-export';
import type { NativeDeckSpec } from '@/components/common/sheet-export/sheet-export';
import { WIDE_SLIDE } from '@/components/common/sheet-export/slide-geometry';
import type { SlideSize } from '@/components/common/sheet-export/slide-geometry';
import { EMPTY_VALUE } from '@/utils';
import type { InteropColumn, InteropRow, InteropSection } from './interop-model';
import { emptyMatrixText } from './matrix-pages';
import type { MatrixDeckPlan, MatrixPage, MatrixPaging } from './matrix-pages';
import { browserColor } from './phase-deck-native';
import { FONT_DISPLAY, FONT_MONO, mix } from './phase-native';
import type { ResolveColor } from './phase-native';
import { SECTION_CAPTION } from './sheet-parts';

const MARGIN_X = 0.4;
const TITLE_Y = 0.3;
const TITLE_H = 0.45;
const TABLE_Y = 0.95;
const MARGIN_BOTTOM = 0.3;
/** The title is the screen's 28px, which is 21pt. */
const TITLE_PT = 21;
const TITLE_MIN_PT = 14;

const FIRST_COL = 2.2;
const MIN_UNIT = 1.35;
const MAX_UNIT = 2.6;
/**
 * Room left per column, in inches, beyond the widths the grid names. PowerPoint
 * draws a column exactly as wide as its `a:gridCol` says. Quick Look, which is
 * what a Mac has to check a file with, draws every column 0.0625in wider than
 * that whatever its width and whatever the cell margins (measured: 7.5px a
 * column at 120 to the inch, the same with the margins zeroed), which pushed a
 * seven-unit table off the right edge of the slide. Leaving it costs a
 * PowerPoint reader about half an inch of margin at most, and the table inside
 * the slide in both.
 */
const COLUMN_SLACK = 0.07;

/** Cell text is 10pt, and the second lines (a capability's name, a branch, a section) 9pt, the least the deck sets anything in. */
const CELL_PT = 10;
const SMALL_PT = 9;
const HEAD_PT = 11;
/** The inset of a cell, in inches, on each side. */
const MARGIN = { l: 0.07, t: 0.05, r: 0.07, b: 0.05 };
const MIN_ROW = 0.32;

/** How tall a line of each face is, as a multiple of its size. IBM Plex Mono runs about 1.3; Oswald, which is tall, 1.5. */
const MONO_LINE = 1.3;
const DISPLAY_LINE = 1.5;
/** How wide a character is, as a multiple of its size: mono is 0.6 exactly, and Oswald in capitals with its tracking a little under. */
const MONO_ADVANCE = 0.62;
const DISPLAY_ADVANCE = 0.6;

const inches = (pt: number, multiple: number) => (pt * multiple) / 72;

/** Lines `text` takes in `perLine` characters, breaking at spaces and, for a word longer than a line, anywhere. */
export function wrappedLines(text: string, perLine: number): number {
  const room = Math.max(1, perLine);
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const need = Math.ceil(word.length / room);
    if (used === 0) {
      lines += need - 1;
      used = word.length % room || room;
    } else if (used + 1 + word.length <= room) {
      used += 1 + word.length;
    } else {
      lines += need;
      used = word.length % room || room;
    }
  }
  return lines;
}

const perLine = (width: number, pt: number, advance: number) => Math.max(1, Math.floor((width - MARGIN.l - MARGIN.r) / ((pt * advance) / 72)));

/** What a column of `width` takes to hold `lines` of text: mono lines at `pt`, plus the cell's own insets. */
const monoHeight = (lines: number, pt: number) => lines * inches(pt, MONO_LINE);

function unitWidth(count: number, size: SlideSize): number {
  return Math.min(MAX_UNIT, (size.w - 2 * MARGIN_X - FIRST_COL - (count + 1) * COLUMN_SLACK) / count);
}

function labelLines(row: InteropRow, width: number): { label: number; name: number } {
  return {
    label: wrappedLines(row.label, perLine(width, HEAD_PT, DISPLAY_ADVANCE)),
    name: row.name ? wrappedLines(row.name, perLine(width, SMALL_PT, MONO_ADVANCE)) : 0,
  };
}

function rowHeightOf(row: InteropRow, columns: InteropColumn[], size: SlideSize): number {
  const w = unitWidth(columns.length, size);
  const lead = labelLines(row, FIRST_COL);
  const label = lead.label * inches(HEAD_PT, DISPLAY_LINE) + monoHeight(lead.name, SMALL_PT);
  const cells = row.cells.map((cell) => monoHeight(
    cell.sources.length === 0 ? 1 : cell.sources.reduce((sum, s) => sum + wrappedLines(s.label, perLine(w, CELL_PT, MONO_ADVANCE)), 0),
    CELL_PT,
  ));
  return Math.max(MIN_ROW, Math.max(label, ...cells) + MARGIN.t + MARGIN.b);
}

function headHeightOf(columns: InteropColumn[], size: SlideSize): number {
  const w = unitWidth(columns.length, size);
  const tallest = Math.max(1, ...columns.map((c) => wrappedLines(c.label, perLine(w, HEAD_PT, DISPLAY_ADVANCE))));
  const branch = columns.some((c) => c.branch) ? monoHeight(1, SMALL_PT) : 0;
  // The heavy rule along the top of the cell counts for a little height too.
  return tallest * inches(HEAD_PT, DISPLAY_LINE) + branch + MARGIN.t + MARGIN.b + 0.04;
}

/** What a slide of `size` can take: as many columns as the least width allows, and the height under the title. */
export function slidePaging(size: SlideSize = WIDE_SLIDE): MatrixPaging {
  return {
    maxCols: Math.max(1, Math.floor((size.w - 2 * MARGIN_X - FIRST_COL - COLUMN_SLACK) / (MIN_UNIT + COLUMN_SLACK))),
    height: size.h - TABLE_Y - MARGIN_BOTTOM,
    headHeight: (columns) => headHeightOf(columns, size),
    sectionHeight: inches(SMALL_PT, MONO_LINE) + MARGIN.t + MARGIN.b,
    rowHeight: (row, columns) => rowHeightOf(row, columns, size),
  };
}

/** `text` in the display face: uppercase, bold, tracked 0.05em, as the screen's titles and heads. */
function display(text: string, pt: number, color: string): PptxRun {
  return { text: text.toUpperCase(), font: FONT_DISPLAY, sizePt: pt, bold: true, color, spc: Math.round(0.05 * pt * 100) };
}

function mono(text: string, pt: number, color: string, extra: { bold?: boolean; tracking?: number } = {}): PptxRun {
  return { text, font: FONT_MONO, sizePt: pt, bold: extra.bold ?? false, color, spc: Math.round((extra.tracking ?? 0) * pt * 100) };
}

/** The title, in the screen's size unless it would run off the slide, and then as small as 14pt. */
function titleRun(text: string, width: number, color: string): PptxRun {
  const wide = (pt: number) => text.length * inches(pt, DISPLAY_ADVANCE + 0.05) > width;
  let pt = TITLE_PT;
  while (pt > TITLE_MIN_PT && wide(pt)) pt -= 1;
  return display(text, pt, color);
}

/** One slide of the deck: the page's title, then its grid as a table, or what it says when there is none. */
export function buildMatrixSlide({ page, size, resolve }: { page: MatrixPage; size: SlideSize; resolve: ResolveColor }): PptxSlide {
  const paper = resolve('var(--shf-paper)');
  const ink = resolve('var(--fg-1)');
  const soft = resolve('var(--border-soft)');
  const quiet = resolve('var(--fg-3)');
  const faint = mix(paper, '000000', 0.04);
  const width = size.w - 2 * MARGIN_X;
  const { columns, rows } = page.model;

  const objects: PptxObject[] = [{
    kind: 'text',
    box: { place: { x: MARGIN_X, y: TITLE_Y, w: width, h: TITLE_H }, wrap: false, ...titleRun(page.title, width, ink) },
  }];

  if (columns.length === 0 || rows.length === 0) {
    objects.push({
      kind: 'shape', geom: 'rect', name: 'Nothing to draw', place: { x: MARGIN_X, y: TABLE_Y, w: width, h: 0.48 },
      fill: mix(paper, '000000', 0.02), stroke: { color: soft, widthPt: 0.75, dash: true },
      text: { ...mono(emptyMatrixText(page.model), 10, quiet), wrap: false, inset: { l: 0.19, t: 0, r: 0.19, b: 0 } },
    });
    return { slide: size, pictures: [], objects, background: paper };
  }

  const line = (color: string, widthPt = 0.75): PptxStroke => ({ color, widthPt });
  const rule = line(soft);
  // Every side but a head's top is the soft line, so two cells that share an edge draw it the same.
  const around = { l: rule, r: rule, t: rule, b: rule };
  const unitW = unitWidth(columns.length, size);
  const colWidths = [FIRST_COL, ...columns.map(() => unitW)];
  const spanAll = colWidths.length;

  const head: PptxTableRow = {
    h: headHeightOf(columns, size),
    cells: [
      {
        paragraphs: [[display('Capability', HEAD_PT, ink)]], align: 'l', fill: faint, margin: MARGIN,
        borders: { ...around, t: line(ink, 1.5) },
      },
      ...columns.map((c): PptxTableCell => ({
        paragraphs: [
          [display(c.label, HEAD_PT, ink)],
          ...(c.branch ? [[mono(c.branch, SMALL_PT, resolve(branchColor(c.branch)), { bold: true })]] : []),
        ],
        align: 'ctr', fill: faint, margin: MARGIN,
        // The organization's colour, where the screen has its pip.
        borders: { ...around, t: line(resolve(c.color || 'var(--shf-amber)'), 3) },
      })),
    ],
  };

  const body: PptxTableRow[] = [];
  let section: InteropSection | null = null;
  for (const row of rows) {
    if (row.section !== section) {
      section = row.section;
      body.push({
        h: inches(SMALL_PT, MONO_LINE) + MARGIN.t + MARGIN.b,
        cells: [{
          paragraphs: [[mono(SECTION_CAPTION[row.section].toUpperCase(), SMALL_PT, quiet, { bold: true, tracking: 0.12 })]],
          align: 'l', fill: faint, span: spanAll, margin: MARGIN, borders: around,
        }],
      });
    }
    body.push({
      h: rowHeightOf(row, columns, size),
      cells: [
        {
          paragraphs: [
            [display(row.label, HEAD_PT, resolve('var(--shf-amber-deep)'))],
            ...(row.name ? [[mono(row.name, SMALL_PT, quiet)]] : []),
          ],
          align: 'l', margin: MARGIN, borders: around,
        },
        ...row.cells.map((cell): PptxTableCell => ({
          paragraphs: cell.sources.length === 0
            ? [[mono(EMPTY_VALUE, CELL_PT, quiet)]]
            : cell.sources.map((s) => [mono(s.label, CELL_PT, resolve('var(--fg-2)'))]),
          align: 'ctr', margin: MARGIN, borders: around,
        })),
      ],
    });
  }

  objects.push({
    kind: 'table', name: 'Interoperability matrix', descr: page.title,
    x: MARGIN_X, y: TABLE_Y, colWidths, rows: [head, ...body],
  });
  return { slide: size, pictures: [], objects, background: paper };
}

/** The deck: 16:9, one slide per page of the plan, the operation's two faces embedded once by the exporter. */
export function matrixNativeDeckSpec(plan: MatrixDeckPlan, operationName: string, resolve: ResolveColor = browserColor): NativeDeckSpec {
  return {
    stem: operationMatrixStem(operationName),
    slide: WIDE_SLIDE,
    count: plan.pages.length,
    buildSlide: (index) => {
      const page = plan.pages[index];
      if (!page) return Promise.reject(new Error('There is no such slide.'));
      return Promise.resolve(buildMatrixSlide({ page, size: WIDE_SLIDE, resolve }));
    },
  };
}

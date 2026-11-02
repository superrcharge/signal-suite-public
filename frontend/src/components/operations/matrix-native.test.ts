import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pptxDeckParts } from '@/components/common/sheet-export/pptx';
import type { PptxSlide } from '@/components/common/sheet-export/pptx';
import { packageProblems } from '@/components/common/sheet-export/pptx-package-checks';
import { downloadNativeDeck } from '@/components/common/sheet-export/sheet-export';
import { OPERATION_DECK_FONTS } from '@/components/common/sheet-export/sheet-fonts';
import type { FetchedFontFamily } from '@/components/common/sheet-export/sheet-fonts';
import { WIDE_SLIDE } from '@/components/common/sheet-export/slide-geometry';
import { EMPTY_VALUE } from '@/utils';
import { column, model, row, source } from './interop-fixtures';
import { buildMatrixSlide, matrixNativeDeckSpec, slidePaging, wrappedLines } from './matrix-native';
import { pageModels, planMatrixDeck } from './matrix-pages';
import type { MatrixPage } from './matrix-pages';
import { DECK_INPUT, DECK_OPERATION, DECK_PHASES, testColor } from './phase-deck-fixtures';

const saved = vi.hoisted(() => [] as { blob: Blob; name: string }[]);

vi.mock('../common/csv/download-csv', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../common/csv/download-csv')>()),
  saveBlob: (blob: Blob, name: string) => { saved.push({ blob, name }); },
}));

beforeEach(() => { saved.length = 0; });

/** A real sfnt header with no tables, which the EOT wrapper can read. */
const FACE = (() => {
  const bytes = new Uint8Array(12);
  new DataView(bytes.buffer).setUint32(0, 0x00010000);
  return bytes;
})();
const fonts = (): Promise<readonly FetchedFontFamily[]> => Promise.resolve(OPERATION_DECK_FONTS.map((f) => ({ typeface: f.typeface, regular: FACE, bold: FACE })));
const FONT_FAMILIES = OPERATION_DECK_FONTS.map((f) => ({ typeface: f.typeface, regular: FACE, bold: FACE }));

const planFor = (paging = slidePaging()) => planMatrixDeck({ operation: DECK_OPERATION, phases: DECK_PHASES, input: DECK_INPUT, paging });

const buildAll = (plan = planFor()): PptxSlide[] => plan.pages.map((page) => buildMatrixSlide({ page, size: WIDE_SLIDE, resolve: testColor }));

const docOf = (slide: PptxSlide) => {
  const part = pptxDeckParts([slide]).find((p) => p.name === 'ppt/slides/slide1.xml')!;
  return new DOMParser().parseFromString(part.data as string, 'application/xml');
};
const rowsOf = (d: Document) => Array.from(d.getElementsByTagName('a:tr'));
const textOf = (el: Element) => Array.from(el.getElementsByTagName('a:t')).map((t) => t.textContent ?? '');
const cellsOf = (tr: Element) => Array.from(tr.children).filter((c) => c.tagName === 'a:tc');

describe('the matrix deck', () => {
  it('is 16:9, named for the operation, with a slide for All phases and one for each phase', () => {
    const spec = matrixNativeDeckSpec(planFor(), 'Night Owl', testColor);
    expect(spec.slide).toBe(WIDE_SLIDE);
    expect(spec.count).toBe(4);
    expect(spec.stem).toBe('night-owl-matrix');
  });

  it('titles each slide for the operation, the Matrix and the scope, in the display face', () => {
    const slides = buildAll();
    const titles = slides.map((s) => docOf(s).getElementsByTagName('a:t')[0]!.textContent);
    expect(titles).toEqual([
      'NIGHT OWL - MATRIX - ALL PHASES', 'NIGHT OWL - MATRIX - STAGING', 'NIGHT OWL - MATRIX - INFIL', 'NIGHT OWL - MATRIX - EXFIL',
    ]);
    expect(docOf(slides[0]!).getElementsByTagName('a:latin')[0]!.getAttribute('typeface')).toBe('Oswald');
  });

  it('draws the grid as a native table, never a picture', () => {
    for (const slide of buildAll()) {
      expect(slide.pictures).toEqual([]);
      const d = docOf(slide);
      expect(d.getElementsByTagName('p:graphicFrame')).toHaveLength(1);
      expect(d.getElementsByTagName('a:tbl')).toHaveLength(1);
      expect(d.getElementsByTagName('p:pic')).toHaveLength(0);
    }
  });

  it('heads the table with the capability column and every unit, each unit\'s colour as the heavy rule on its top', () => {
    const d = docOf(buildAll()[0]!);
    const head = cellsOf(rowsOf(d)[0]!);
    expect(textOf(head[0]!)).toEqual(['CAPABILITY']);
    expect(head.slice(1).map((c) => textOf(c)[0])).toEqual(['ALPHA', 'BRAVO', 'CHARLIE']);
    // The units carry their branch under the label.
    expect(textOf(head[1]!)).toEqual(['ALPHA', 'USA']);
    // No colour on the fixture's organizations, so the amber: 3pt along the top, the table's own ink rule on the capability cell.
    expect(head[1]!.getElementsByTagName('a:lnT')[0]!.getAttribute('w')).toBe('38100');
    expect(head[1]!.getElementsByTagName('a:lnT')[0]!.getElementsByTagName('a:srgbClr')[0]!.getAttribute('val')).toBe('F2A900');
    expect(head[0]!.getElementsByTagName('a:lnT')[0]!.getAttribute('w')).toBe('19050');
  });

  it('puts each section on a merged row across the whole width, and the rows under it name the assets', () => {
    const d = docOf(buildAll()[0]!);
    const grid = d.getElementsByTagName('a:gridCol').length;
    expect(grid).toBe(4);
    const body = rowsOf(d).slice(1);
    const section = cellsOf(body[0]!);
    expect(section).toHaveLength(grid);
    expect(section[0]!.getAttribute('gridSpan')).toBe(String(grid));
    expect(section.slice(1).every((c) => c.getAttribute('hMerge') === '1')).toBe(true);
    expect(textOf(section[0]!)).toEqual(['WAVEFORMS']);
    // ANW2 is on ALPHA and BRAVO's radios, not CHARLIE's; the cell is what names the asset.
    const anw2 = cellsOf(body[1]!);
    expect(textOf(anw2[0]!)[0]).toBe('ANW2');
    expect(anw2.slice(1).map((c) => textOf(c).join('|'))).toEqual(['R1', 'R1B', EMPTY_VALUE]);
  });

  it('draws a phase with what is there in it: Exfil has two units', () => {
    const d = docOf(buildAll()[3]!);
    expect(d.getElementsByTagName('a:gridCol')).toHaveLength(3);
    expect(cellsOf(rowsOf(d)[0]!).slice(1).map((c) => textOf(c)[0])).toEqual(['ALPHA', 'CHARLIE']);
  });

  it('sets nothing smaller than 9pt', () => {
    for (const slide of buildAll()) {
      const sizes = Array.from(docOf(slide).getElementsByTagName('a:rPr')).map((r) => Number(r.getAttribute('sz')));
      expect(sizes.length).toBeGreaterThan(0);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(900);
    }
  });

  it('puts the table on the slide: inside its margins, and no taller than the room under the title', () => {
    for (const slide of buildAll()) {
      const frame = docOf(slide).getElementsByTagName('p:graphicFrame')[0]!;
      const off = frame.getElementsByTagName('a:off')[0]!;
      const ext = frame.getElementsByTagName('a:ext')[0]!;
      const x = Number(off.getAttribute('x')) / 914400;
      const y = Number(off.getAttribute('y')) / 914400;
      const w = Number(ext.getAttribute('cx')) / 914400;
      const h = Number(ext.getAttribute('cy')) / 914400;
      expect(x).toBeGreaterThanOrEqual(0.4);
      expect(x + w).toBeLessThanOrEqual(WIDE_SLIDE.w - 0.4 + 1e-6);
      expect(y + h).toBeLessThanOrEqual(WIDE_SLIDE.h - 0.3 + 1e-6);
    }
  });

  it('is a deck every part of which parses, whose relationships close, and whose fonts are EOT', () => {
    const parts = pptxDeckParts(buildAll(), { fonts: FONT_FAMILIES });
    expect(packageProblems(parts)).toEqual([]);
    const names = parts.map((p) => p.name);
    expect(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(4);
    expect(names.some((n) => n.startsWith('ppt/media/'))).toBe(false);
    // One face for both slots, so one part per family; packageProblems has already checked each is an EOT and not a raw sfnt.
    expect(names.filter((n) => n.startsWith('ppt/fonts/'))).toEqual(['ppt/fonts/font1.fntdata', 'ppt/fonts/font2.fntdata']);
  });

  it('downloads one .pptx, embeds the deck\'s fonts once, and reports each slide as it starts', async () => {
    const progress: string[] = [];
    const result = await downloadNativeDeck({ ...matrixNativeDeckSpec(planFor(), 'Night Owl', testColor), fonts }, (n, of) => { progress.push(`${String(n)}/${String(of)}`); });
    expect(result).toEqual({ ok: true, fontWarning: undefined });
    expect(progress).toEqual(['1/4', '2/4', '3/4', '4/4']);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.name).toMatch(/^night-owl-matrix-\d{8}\.pptx$/);
    const names = new Set(new TextDecoder().decode(new Uint8Array(await saved[0]!.blob.arrayBuffer())).match(/ppt\/(?:slides\/slide\d+|fonts\/font\d+)\.(?:xml|fntdata)/g));
    expect([...names].filter((n) => n.startsWith('ppt/fonts/'))).toHaveLength(2);
    expect([...names].filter((n) => n.startsWith('ppt/slides/'))).toHaveLength(4);
  }, 20000);

  it('refuses a slide that is not in the plan', async () => {
    await expect(matrixNativeDeckSpec(planFor(), 'Night Owl', testColor).buildSlide(9)).rejects.toThrow('There is no such slide.');
  });

  it('reads colours off the page by default, which jsdom has no stylesheet for, and still builds', async () => {
    const slide = await matrixNativeDeckSpec(planFor(), 'Night Owl').buildSlide(0);
    expect(slide.background).toMatch(/^[0-9A-F]{6}$/);
  });
});

describe('a grid too big for a slide', () => {
  it('goes on to continuation slides by column groups, "(2 of 2)", the capability column and the header on each', () => {
    const plan = planFor({ ...slidePaging(), maxCols: 2 });
    // All phases, Staging and Infil are three units wide: two slides each; Exfil is two: one.
    expect(plan.pages.map((p) => p.title)).toEqual([
      'Night Owl - Matrix - All phases (1 of 2)', 'Night Owl - Matrix - All phases (2 of 2)',
      'Night Owl - Matrix - Staging (1 of 2)', 'Night Owl - Matrix - Staging (2 of 2)',
      'Night Owl - Matrix - Infil (1 of 2)', 'Night Owl - Matrix - Infil (2 of 2)',
      'Night Owl - Matrix - Exfil',
    ]);
    const slides = buildAll(plan);
    expect(slides).toHaveLength(7);
    const heads = slides.slice(0, 2).map((s) => cellsOf(rowsOf(docOf(s))[0]!).map((c) => textOf(c)[0]));
    expect(heads).toEqual([['CAPABILITY', 'ALPHA', 'BRAVO'], ['CAPABILITY', 'CHARLIE']]);
    expect(docOf(slides[1]!).getElementsByTagName('a:t')[0]!.textContent).toBe('NIGHT OWL - MATRIX - ALL PHASES (2 OF 2)');
    expect(packageProblems(pptxDeckParts(slides, { fonts: FONT_FAMILIES }))).toEqual([]);
  });

  it('widens a unit column to fill the slide when there are few, and never past a readable maximum', () => {
    const width = (n: number) => {
      const units = Array.from({ length: n }, (_, i) => column(`c${String(i)}`, '#336699', 'USA', [source(`p${String(i)}`, 'equipment', `e${String(i)}`, 'R')]));
      const page: MatrixPage = { phaseId: null, scope: 'All phases', title: 't', part: 1, parts: 1, model: model(units, [row('waveform', 'w', 'W', '', units.map(() => [source('p', 'equipment', 'e', 'R')]))]) };
      const cols = Array.from(docOf(buildMatrixSlide({ page, size: WIDE_SLIDE, resolve: testColor })).getElementsByTagName('a:gridCol')).map((c) => Number(c.getAttribute('w')) / 914400);
      return cols;
    };
    expect(width(1)[1]).toBeCloseTo(2.6, 3);
    expect(width(3)[1]).toBeCloseTo(2.6, 3);
    const six = width(6);
    expect(six).toHaveLength(7);
    expect(six[1]!).toBeGreaterThanOrEqual(1.35 - 1e-6);
    // With room to spare for a viewer that draws every column a little wider than it is told.
    expect(six.reduce((a, b) => a + b, 0) + 7 * 0.0625).toBeLessThanOrEqual(WIDE_SLIDE.w - 0.8 + 1e-6);
  });

  it('never puts more on a slide than fits under its title: a tall grid goes on by rows, each with the header and its section', () => {
    const units = Array.from({ length: 3 }, (_, i) => column(`c${String(i)}`, '#336699', 'USA', [source(`p${String(i)}`, 'equipment', `e${String(i)}`, 'R')]));
    const rows = Array.from({ length: 40 }, (_, i) => row(
      i < 25 ? 'waveform' : 'service', `r${String(i)}`, `W${String(i)}`, i % 3 === 0 ? 'A long descriptive name that runs to a second line in its cell' : '',
      units.map((_, c) => [source(`p${String(c)}`, 'equipment', `e${String(c)}`, 'AN/PRC-152A'), source(`p${String(c)}`, 'equipment', `f${String(c)}`, 'AN/PRC-117G')]),
    ));
    const paging = slidePaging();
    const pages = pageModels(model(units, rows), paging);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.flatMap((p) => p.rows.map((r) => r.key))).toEqual(rows.map((r) => r.key));
    for (const [i, m] of pages.entries()) {
      const page: MatrixPage = { phaseId: null, scope: 'All phases', title: `t${String(i)}`, part: i + 1, parts: pages.length, model: m };
      const d = docOf(buildMatrixSlide({ page, size: WIDE_SLIDE, resolve: testColor }));
      const trs = rowsOf(d);
      expect(textOf(trs[0]!)[0]).toBe('CAPABILITY');
      // The first body row is a section line, also when the page starts part way down one.
      expect(trs[1]!.getElementsByTagName('a:tc')[0]!.getAttribute('gridSpan')).toBe('4');
      const ext = d.getElementsByTagName('p:graphicFrame')[0]!.getElementsByTagName('a:ext')[0]!;
      expect(Number(ext.getAttribute('cy')) / 914400).toBeLessThanOrEqual(WIDE_SLIDE.h - 0.95 - 0.3 + 1e-6);
    }
  });

  it('says there is nothing to draw, rather than an empty table, for a phase with nothing in it', () => {
    const page: MatrixPage = { phaseId: 'ph1', scope: 'Staging', title: 'Night Owl - Matrix - Staging', part: 1, parts: 1, model: model([], [], 'ph1') };
    const d = docOf(buildMatrixSlide({ page, size: WIDE_SLIDE, resolve: testColor }));
    expect(d.getElementsByTagName('a:tbl')).toHaveLength(0);
    expect(textOf(d.documentElement)).toEqual(['NIGHT OWL - MATRIX - STAGING', 'Nothing is in this phase.']);
  });
});

describe('wrappedLines', () => {
  it('counts the lines a word-wrapped label takes', () => {
    expect(wrappedLines('AN/PRC-152A', 16)).toBe(1);
    expect(wrappedLines('Ultra High Frequency Satellite', 16)).toBe(3);
    expect(wrappedLines('Ultra High Frequency', 16)).toBe(2);
    expect(wrappedLines('one two three four', 7)).toBe(3);
  });

  it('breaks a word longer than the line anywhere, and is one line for nothing', () => {
    expect(wrappedLines('ABCDEFGHIJ', 4)).toBe(3);
    expect(wrappedLines('', 4)).toBe(1);
  });
});

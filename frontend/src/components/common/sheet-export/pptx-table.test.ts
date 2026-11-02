import { describe, expect, it } from 'vitest';

import { pptxDeckParts, type PptxSlide, type PptxTable } from './pptx';
import { packageProblems } from './pptx-package-checks';
import { WIDE_SLIDE } from './slide-geometry';

const run = (text: string) => ({ text, font: 'IBM Plex Mono', sizePt: 10, color: '0A0A0A' });
const rule = { color: 'D9D4C5', widthPt: 0.75 };

const TABLE: PptxTable = {
  kind: 'table', name: 'Grid', descr: 'A grid', x: 0.4, y: 0.95, colWidths: [2, 1.5, 1.5],
  rows: [
    { h: 0.5, cells: [{ paragraphs: [[run('Capability')]] }, { paragraphs: [[run('ALPHA')], [run('USA')]], align: 'ctr', fill: 'EEEEEE' }, { paragraphs: [[run('BRAVO')]], borders: { t: { color: 'F2A900', widthPt: 3 } } }] },
    { h: 0.3, cells: [{ paragraphs: [[run('WAVEFORMS')]], span: 3, fill: 'EEEEEE', borders: { l: rule, r: rule, t: rule, b: { ...rule, dash: true } } }] },
    { h: 0.3, cells: [{ paragraphs: [[run('ANW2 & <more>')]] }, { paragraphs: [] }, { paragraphs: [[run('x')]] }] },
  ],
};

const slide = (...objects: PptxTable[]): PptxSlide => ({ slide: WIDE_SLIDE, pictures: [], objects, background: 'F4F2EC' });
const xmlOf = (s: PptxSlide) => {
  const part = pptxDeckParts([s]).find((p) => p.name === 'ppt/slides/slide1.xml')!;
  return typeof part.data === 'string' ? part.data : new TextDecoder().decode(part.data);
};
const doc = (s: PptxSlide) => new DOMParser().parseFromString(xmlOf(s), 'application/xml');

describe('a native table', () => {
  it('is a graphicFrame holding an a:tbl, which parses, and sits where it was put', () => {
    const d = doc(slide(TABLE));
    expect(d.getElementsByTagName('parsererror')).toHaveLength(0);
    const frame = d.getElementsByTagName('p:graphicFrame')[0]!;
    expect(frame.getElementsByTagName('a:graphicData')[0]!.getAttribute('uri')).toBe('http://schemas.openxmlformats.org/drawingml/2006/table');
    expect(frame.getElementsByTagName('a:tbl')).toHaveLength(1);
    const off = frame.getElementsByTagName('a:off')[0]!;
    expect([off.getAttribute('x'), off.getAttribute('y')]).toEqual(['365760', '868680']);
    // The frame is as wide as its columns and as tall as its rows, in EMU.
    const ext = frame.getElementsByTagName('a:ext')[0]!;
    expect([ext.getAttribute('cx'), ext.getAttribute('cy')]).toEqual([String(5 * 914400), String(Math.round(1.1 * 914400))]);
    expect(Array.from(frame.getElementsByTagName('a:gridCol')).map((c) => c.getAttribute('w'))).toEqual(['1828800', '1371600', '1371600']);
  });

  it('writes a row per row and a cell per column, a spanning cell followed by merged placeholders', () => {
    const rows = Array.from(doc(slide(TABLE)).getElementsByTagName('a:tr'));
    expect(rows.map((r) => Array.from(r.children).filter((c) => c.tagName === 'a:tc').length)).toEqual([3, 3, 3]);
    const section = Array.from(rows[1]!.children);
    expect(section[0]!.getAttribute('gridSpan')).toBe('3');
    expect(section.slice(1).map((c) => c.getAttribute('hMerge'))).toEqual(['1', '1']);
    expect(rows[1]!.getAttribute('h')).toBe(String(Math.round(0.3 * 914400)));
  });

  it('carries the text as paragraphs, escaped, and a cell with none as an empty paragraph', () => {
    const d = doc(slide(TABLE));
    const cells = Array.from(d.getElementsByTagName('a:tr')[0]!.children);
    expect(Array.from(cells[1]!.getElementsByTagName('a:t')).map((t) => t.textContent)).toEqual(['ALPHA', 'USA']);
    expect(cells[1]!.getElementsByTagName('a:pPr')[0]!.getAttribute('algn')).toBe('ctr');
    expect(xmlOf(slide(TABLE))).toContain('ANW2 &amp; &lt;more&gt;');
    const empty = Array.from(d.getElementsByTagName('a:tr')[2]!.children)[1]!;
    expect(empty.getElementsByTagName('a:p')).toHaveLength(1);
    expect(empty.getElementsByTagName('a:r')).toHaveLength(0);
  });

  it('draws only the sides it was given, in the order the schema fixes, with the fill after them', () => {
    const d = doc(slide(TABLE));
    const cell = Array.from(d.getElementsByTagName('a:tr')[0]!.children)[2]!;
    const pr = cell.getElementsByTagName('a:tcPr')[0]!;
    expect(Array.from(pr.children).map((c) => c.tagName)).toEqual(['a:lnL', 'a:lnR', 'a:lnT', 'a:lnB', 'a:noFill']);
    expect(pr.getElementsByTagName('a:lnT')[0]!.getAttribute('w')).toBe('38100');
    expect(pr.getElementsByTagName('a:lnL')[0]!.getElementsByTagName('a:noFill')).toHaveLength(1);
    expect(xmlOf(slide(TABLE))).toContain('<a:prstDash val="dash"/>');
    const filled = Array.from(d.getElementsByTagName('a:tr')[0]!.children)[1]!.getElementsByTagName('a:tcPr')[0]!;
    expect(filled.lastElementChild!.tagName).toBe('a:solidFill');
  });

  it('is refused when a row does not cover every column', () => {
    const short: PptxTable = { ...TABLE, rows: [{ h: 0.3, cells: [{ paragraphs: [[run('a')]] }] }] };
    expect(() => xmlOf(slide(short))).toThrow(/Row 1 of a table covers 1 columns of 3/);
  });

  it('is numbered with the rest of the slide, so two tables never share an id', () => {
    const d = doc(slide(TABLE, { ...TABLE, name: 'Second' }));
    const ids = Array.from(d.getElementsByTagName('p:cNvPr')).map((e) => e.getAttribute('id'));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps a package that holds one valid under the package checks, which fail on a row that is short', () => {
    expect(packageProblems(pptxDeckParts([slide(TABLE)]))).toEqual([]);
    const broken = pptxDeckParts([slide(TABLE)]).map((p) => (p.name === 'ppt/slides/slide1.xml'
      ? { ...p, data: (p.data as string).replace('<a:tc hMerge="1">', '<a:tc>') }
      : p));
    expect(packageProblems(broken)).toEqual([expect.stringMatching(/spanning 3 columns with no merged cell after it/)]);
    const dropped = pptxDeckParts([slide(TABLE)]).map((p) => (p.name === 'ppt/slides/slide1.xml'
      ? { ...p, data: (p.data as string).replace('<a:gridCol w="1371600"/>', '') }
      : p));
    expect(packageProblems(dropped).some((m) => /table row 1 of 3 cells in a grid of 2 columns/.test(m))).toBe(true);
  });
});

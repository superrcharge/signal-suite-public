import { afterEach, describe, expect, it } from 'vitest';
import { compareExportSpec, libraryExportSpec } from './sheet-specs';
import { compareStem } from './sheet-export';
import { sheetOmitProps, sheetRootProps } from './sheet-root';
import { PACE_SLIDE } from './slide-geometry';

/**
 * `compareExportSpec` is the one spec of the three that has no fixed size -
 * see its doc comment - so it is the one worth testing here rather than
 * trusting `catalogExportSpec`/`paceExportSpec`'s constant math by eye.
 *
 * DOM dimensions (scrollWidth/scrollHeight/offsetWidth/offsetHeight) are all
 * read-only in jsdom, so they are stubbed with Object.defineProperty rather
 * than set directly - the same technique the export's own layout box
 * measurement relies on in a real browser, where these are also read-only.
 */

interface Dims {
  scrollWidth: number;
  scrollHeight: number;
  offsetWidth?: number;
  offsetHeight?: number;
}

function appendMarkedRoot(dims: Dims): HTMLElement {
  const el = document.createElement('div');
  const props = sheetRootProps();
  for (const [attr, value] of Object.entries(props)) el.setAttribute(attr, value);
  document.body.appendChild(el);

  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: dims.scrollWidth });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: dims.scrollHeight });
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: dims.offsetWidth ?? 0 });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: dims.offsetHeight ?? 0 });
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('libraryExportSpec', () => {
  // The add form is in the DOM under the root but marked to stay out of the
  // picture, so its height comes off the measured sheet; otherwise the slide
  // ends in a blank band where the form was.
  it('gives back the height of blocks marked to be omitted', () => {
    const root = appendMarkedRoot({ scrollWidth: 1200, scrollHeight: 640 });
    const form = document.createElement('div');
    for (const [attr, value] of Object.entries(sheetOmitProps('block'))) form.setAttribute(attr, value);
    form.style.marginBottom = '16px';
    Object.defineProperty(form, 'offsetHeight', { configurable: true, value: 90 });
    root.appendChild(form);
    const pencil = document.createElement('button');
    for (const [attr, value] of Object.entries(sheetOmitProps())) pencil.setAttribute(attr, value);
    Object.defineProperty(pencil, 'offsetHeight', { configurable: true, value: 26 });
    root.appendChild(pencil);

    const spec = libraryExportSpec('Waveforms')();

    expect(spec?.height).toBe(640 - 90 - 16);
    expect(spec?.width).toBe(1200);
    expect(spec?.title).toBe('Waveforms library');
  });
});

describe('compareExportSpec', () => {
  it('is null when nothing in the document is marked as the sheet root', () => {
    expect(compareExportSpec('#141618')()).toBeNull();
  });

  it('measures the marked element and carries the requested background colour', () => {
    appendMarkedRoot({ scrollWidth: 1200, scrollHeight: 640 });

    const spec = compareExportSpec('#141618')();

    expect(spec).not.toBeNull();
    expect(spec?.width).toBe(1200);
    expect(spec?.height).toBe(640);
    expect(spec?.backgroundColor).toBe('#141618');
    expect(spec?.slide).toEqual(PACE_SLIDE);
    expect(spec?.stem).toBe('signal-suite-equipment-comparison');
  });

  // The digital export always stays dark (see the function's doc comment
  // for why), which is exactly what makes it a caller-supplied colour worth
  // pinning here: the print route now calls this with INK's white too, and
  // this test is what would catch a default silently creeping back in.
  it('passes through whatever background colour the caller asks for', () => {
    appendMarkedRoot({ scrollWidth: 400, scrollHeight: 300 });
    expect(compareExportSpec('#FFFFFF')()?.backgroundColor).toBe('#FFFFFF');
  });

  it('takes the larger of the scroll and offset dimensions', () => {
    // The grid sits inside an overflow-x container, so its own layout box
    // can be clipped by it - scrollWidth/Height is the real content size and
    // must win whenever it exceeds the (possibly clipped) offset box.
    appendMarkedRoot({ scrollWidth: 800, scrollHeight: 500, offsetWidth: 900, offsetHeight: 450 });

    const spec = compareExportSpec('#141618')();

    expect(spec?.width).toBe(900);
    expect(spec?.height).toBe(500);
  });

  it('is null when the marked element has no measurable size in either dimension', () => {
    appendMarkedRoot({ scrollWidth: 0, scrollHeight: 0 });
    expect(compareExportSpec('#141618')()).toBeNull();
  });
});

describe('compareStem', () => {
  it('is a fixed filename stem, since the sheet is defined by the selection rather than by one record', () => {
    expect(compareStem()).toBe('signal-suite-equipment-comparison');
  });
});

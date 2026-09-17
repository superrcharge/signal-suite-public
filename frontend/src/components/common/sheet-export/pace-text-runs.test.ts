import { describe, expect, it } from 'vitest';

import { SHEET_CHANGED } from '@/components/pace/pace-constants';

import {
  applyTransform,
  hideRuns,
  letterSpacingToSpc,
  planPaceText,
  primaryFont,
  runStyle,
  toHexColor,
} from './pace-text-runs';

const style = (over: Partial<Record<string, string>> = {}) =>
  ({
    fontFamily: '"Barlow Condensed", sans-serif',
    fontSize: '13.5px',
    fontWeight: '700',
    fontStyle: 'normal',
    color: 'rgb(10, 10, 10)',
    letterSpacing: 'normal',
    textAlign: 'left',
    textTransform: 'none',
    whiteSpace: 'normal',
    ...over,
  }) as unknown as Parameters<typeof runStyle>[0];

describe('primaryFont', () => {
  it('takes the first family and unquotes it', () => {
    expect(primaryFont('Oswald, "Barlow Condensed", sans-serif')).toBe('Oswald');
    expect(primaryFont('"IBM Plex Mono", monospace')).toBe('IBM Plex Mono');
  });
});

describe('toHexColor', () => {
  it('converts rgb to six hex digits with no hash', () => {
    expect(toHexColor('rgb(10, 10, 10)')).toBe('0A0A0A');
    expect(toHexColor('rgb(245, 162, 31)')).toBe('F5A21F');
  });

  it('keeps an opaque rgba', () => {
    expect(toHexColor('rgba(42, 45, 49, 1)')).toBe('2A2D31');
  });

  // A run nobody can see is worse than a run that is not there: it would sit on
  // the slide as an invisible, selectable text box over the picture.
  it('drops a fully transparent colour', () => {
    expect(toHexColor('rgba(0, 0, 0, 0)')).toBeNull();
  });
});

describe('letterSpacingToSpc', () => {
  // The sheet declares tracking in em; the computed value is already pixels,
  // which is the whole reason this does not need the font size.
  it('converts computed pixels to hundredths of a point', () => {
    expect(letterSpacingToSpc('1.56px')).toBe(117);
    expect(letterSpacingToSpc('0.54px')).toBe(41);
  });

  it('is 0 for normal', () => {
    expect(letterSpacingToSpc('normal')).toBe(0);
    expect(letterSpacingToSpc('')).toBe(0);
  });
});

describe('runStyle', () => {
  it('converts CSS pixels to points', () => {
    expect(runStyle(style({ fontSize: '16px' }))?.sizePt).toBe(12);
    expect(runStyle(style({ fontSize: '13.5px' }))?.sizePt).toBe(10.125);
  });

  it('treats 600 and up as bold, and 400 as not', () => {
    expect(runStyle(style({ fontWeight: '600' }))?.bold).toBe(true);
    expect(runStyle(style({ fontWeight: '700' }))?.bold).toBe(true);
    expect(runStyle(style({ fontWeight: '400' }))?.bold).toBe(false);
  });

  it('maps text alignment', () => {
    expect(runStyle(style({ textAlign: 'center' }))?.align).toBe('ctr');
    expect(runStyle(style({ textAlign: 'right' }))?.align).toBe('r');
    expect(runStyle(style())?.align).toBe('l');
  });

  // The band cells clip rather than wrap on screen, and PowerPoint has no
  // ellipsis, so staying on one line is the closer of the two wrong answers.
  it('does not wrap a nowrap cell', () => {
    expect(runStyle(style({ whiteSpace: 'nowrap' }))?.wrap).toBe(false);
    expect(runStyle(style())?.wrap).toBe(true);
  });

  it('returns null rather than an invisible run', () => {
    expect(runStyle(style({ color: 'rgba(0, 0, 0, 0)' }))).toBeNull();
  });
});

describe('runStyle, changed marks', () => {
  it('carries the changed red into the run colour', () => {
    // The sheet prints a marked value in SHEET_CHANGED. The PPTX is only right
    // if that colour reaches the native text run laid over the picture, where
    // the export makes the HTML glyphs transparent.
    expect(runStyle(style({ color: 'rgb(198, 40, 40)' }))?.color).toBe(SHEET_CHANGED.slice(1));
  });
});

describe('applyTransform', () => {
  it('upcases, because DrawingML has no textTransform', () => {
    expect(applyTransform('Seed Net 01', 'uppercase')).toBe('SEED NET 01');
    expect(applyTransform('Seed Net 01', 'none')).toBe('Seed Net 01');
  });
});

/**
 * jsdom gives every element a zero rect, so each element under test is handed
 * one. That is enough to assert what the walk includes and excludes, which is
 * the part that has a wrong answer; the arithmetic is asserted above.
 */
function withRect(element: HTMLElement, box: { x: number; y: number; w: number; h: number }) {
  element.getBoundingClientRect = () => ({
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    right: box.x + box.w,
    bottom: box.y + box.h,
    x: box.x,
    y: box.y,
    toJSON: () => '',
  });
  return element;
}

describe('planPaceText', () => {
  it('excludes everything inside a figure, which is where the wheels live', () => {
    const root = document.createElement('div');
    withRect(root, { x: 0, y: 0, w: 1056, h: 816 });

    const title = document.createElement('p');
    title.textContent = 'ALPHA SQUADRON';
    withRect(title, { x: 96, y: 48, w: 864, h: 36 });
    root.append(title);

    // The wheel: an svg with labels, plus the visually hidden accessibility
    // table of 69 text nodes that a naive walk would emit as 1x1 text boxes.
    const figure = document.createElement('figure');
    withRect(figure, { x: 0, y: 96, w: 528, h: 380 });
    const table = document.createElement('table');
    table.textContent = 'CH 1 SEED NET 01';
    withRect(table, { x: 0, y: 96, w: 1, h: 1 });
    figure.append(table);
    root.append(figure);

    document.body.append(root);
    try {
      const plan = planPaceText(root, 1056);
      expect(plan.boxes.map((b) => b.text)).toEqual(['ALPHA SQUADRON']);
    } finally {
      root.remove();
    }
  });

  it('places a run in inches relative to the sheet, at 96 px to the inch', () => {
    const root = withRect(document.createElement('div'), { x: 10, y: 20, w: 1056, h: 816 });
    const cell = withRect(document.createElement('p'), { x: 106, y: 116, w: 192, h: 18 });
    cell.textContent = 'SEED NET 01';
    root.append(cell);

    document.body.append(root);
    try {
      const [box] = planPaceText(root, 1056).boxes;
      expect(box?.place).toEqual({ x: 1, y: 1, w: 2, h: 0.1875 });
    } finally {
      root.remove();
    }
  });

  it('skips a run with no text', () => {
    const root = withRect(document.createElement('div'), { x: 0, y: 0, w: 1056, h: 816 });
    const rule = withRect(document.createElement('div'), { x: 0, y: 0, w: 100, h: 1 });
    root.append(rule);

    document.body.append(root);
    try {
      expect(planPaceText(root, 1056).boxes).toHaveLength(0);
    } finally {
      root.remove();
    }
  });
});

describe('hideRuns', () => {
  it('makes the glyphs transparent, and restores what was there', () => {
    const a = document.createElement('p');
    const b = document.createElement('p');
    b.style.color = 'rgb(10, 10, 10)';

    const restore = hideRuns([a, b]);
    expect(a.style.color).toBe('transparent');
    expect(b.style.color).toBe('transparent');

    restore();
    expect(a.style.color).toBe('');
    expect(b.style.color).toBe('rgb(10, 10, 10)');
  });

  /**
   * The regression this exists for: the sheet draws the rule under each of the
   * LTAC and TACSAT column-head rows as a `border-bottom` on the heading cells
   * themselves. `visibility: hidden` takes an element's borders with it, so
   * hiding those cells deleted two of the three header rules from the picture
   * the text is laid over. Transparency is the only one of the three that hides
   * the glyphs and leaves the box drawn.
   */
  it('does not touch visibility or display, which would take borders with them', () => {
    const cell = document.createElement('p');
    cell.style.borderBottom = '1px solid rgb(10, 10, 10)';

    const restore = hideRuns([cell]);
    expect(cell.style.visibility).toBe('');
    expect(cell.style.display).toBe('');
    expect(cell.style.borderBottom).toBe('1px solid rgb(10, 10, 10)');
    restore();
  });
});

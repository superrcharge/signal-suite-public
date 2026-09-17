/**
 * Turns the PACE card's HTML text into native PowerPoint text boxes.
 *
 * The decomposition, which is the part worth understanding before changing
 * anything here: the slide is ONE full-bleed picture of the sheet with its
 * HTML text hidden, plus one text box per hidden run laid back on top at its
 * measured position.
 *
 * The obvious alternative - capture the two wheels as pictures and emit
 * everything else as text - was rejected because "everything else" is not only
 * text. The sheet draws 13 header rules as `border-bottom` on heading cells,
 * four tile frames and fills, and up to four tile photos, none of which is a
 * text node and all of which would simply have been lost. Hiding text and
 * capturing the whole page keeps every one of them, and costs no geometry: the
 * picture is full bleed, so there is nothing to crop and no viewBox to map.
 *
 * Hiding makes the glyphs transparent rather than hiding the element, and that
 * distinction is load bearing twice over. `display` would collapse the grid and
 * move every rule. `visibility` keeps the layout but takes the element's
 * BORDERS with it, and the sheet draws the rules under the LTAC and TACSAT
 * column heads as `border-bottom` on the heading cells themselves - so hiding
 * those cells silently deleted two of the three header rules from the picture,
 * which is exactly how this was found.
 *
 * What stays raster, deliberately: everything inside the two wheels. Their
 * labels are anchored start/middle/end against leader lines and ticks that are
 * themselves drawn in the picture, so a substituted font slides the text off
 * its leader. The wheels also carry a visually hidden accessibility table of
 * 69 text nodes each, which is why `figure` is skipped wholesale rather than
 * filtered node by node.
 */
import type { PptxTextBox } from './pptx';

/** CSS pixels per inch at the 96dpi both sheets are laid out on. */
const PX_PER_INCH = 96;
/** CSS pixels to points. */
const PT_PER_PX = 0.75;

/** Below this a rect is a rounding artifact rather than a run. */
const MIN_SIDE_PX = 0.5;

/**
 * Takes the first family off a computed `font-family` list and unquotes it.
 *
 * The computed value is the whole stack, e.g. `Oswald, "Barlow Condensed",
 * sans-serif`. DrawingML names one face, and the first is the one the browser
 * actually used for a sheet whose faces are all loaded.
 */
export function primaryFont(fontFamily: string): string {
  const first = fontFamily.split(',')[0]?.trim() ?? '';
  return first.replace(/^["']|["']$/g, '');
}

/**
 * `rgb()` / `rgba()` to the six hex digits DrawingML wants, no leading '#'.
 *
 * A fully transparent colour returns null: the sheet has no such text today,
 * and emitting a run that cannot be seen would be worse than dropping it.
 */
export function toHexColor(color: string): string | null {
  const match = color.match(/rgba?\(([^)]+)\)/);
  const channels = match?.[1];
  if (!channels) return color.startsWith('#') ? color.slice(1).toUpperCase() : null;

  const parts = channels.split(',').map((p) => Number(p.trim()));
  const [r, g, b, a] = parts;
  if (r === undefined || g === undefined || b === undefined) return null;
  if (a !== undefined && a === 0) return null;

  return [r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Letter spacing, computed pixels to the hundredths of a point `a:rPr/@spc`
 * takes.
 *
 * Reading the COMPUTED value is what makes this safe. The sheet declares
 * tracking in `em` at five different values, and converting from em would mean
 * re-deriving each against its own font size; `getComputedStyle` has already
 * resolved every one of them to pixels.
 */
export function letterSpacingToSpc(letterSpacing: string): number {
  if (!letterSpacing || letterSpacing === 'normal') return 0;
  const px = Number.parseFloat(letterSpacing);
  return Number.isFinite(px) ? Math.round(px * PT_PER_PX * 100) : 0;
}

function alignOf(textAlign: string): 'l' | 'ctr' | 'r' {
  if (textAlign === 'center') return 'ctr';
  if (textAlign === 'right' || textAlign === 'end') return 'r';
  return 'l';
}

/**
 * The run properties for one element, derived entirely from computed style.
 *
 * Pure, and separated from the walking and measuring so it can be asserted
 * directly - jsdom returns a zero rect for everything, so the measurement half
 * is not unit testable and the mapping half is.
 */
export function runStyle(
  style: Pick<
    CSSStyleDeclaration,
    | 'fontFamily'
    | 'fontSize'
    | 'fontWeight'
    | 'fontStyle'
    | 'color'
    | 'letterSpacing'
    | 'textAlign'
    | 'textTransform'
    | 'whiteSpace'
  >,
): Omit<PptxTextBox, 'place' | 'text'> | null {
  const color = toHexColor(style.color);
  if (!color) return null;

  const sizePx = Number.parseFloat(style.fontSize);
  if (!Number.isFinite(sizePx) || sizePx <= 0) return null;

  const weight = Number.parseInt(style.fontWeight, 10);

  return {
    font: primaryFont(style.fontFamily),
    sizePt: sizePx * PT_PER_PX,
    // 600 rather than 700: the sheet's headings and data cells are w600 and
    // w700 and both read as bold, while the tile detail lines are 400.
    bold: Number.isFinite(weight) ? weight >= 600 : style.fontWeight === 'bold',
    italic: style.fontStyle === 'italic',
    color,
    spc: letterSpacingToSpc(style.letterSpacing),
    align: alignOf(style.textAlign),
    // The band cells are nowrap + ellipsis. PowerPoint has no ellipsis, so an
    // over-long value overflows either way; keeping it on one line at least
    // matches the single line the sheet showed.
    wrap: style.whiteSpace !== 'nowrap' && style.whiteSpace !== 'pre',
    anchor: 'ctr',
  };
}

/** `textTransform` has no DrawingML equivalent, so it is applied to the string. */
export function applyTransform(text: string, textTransform: string): string {
  if (textTransform === 'uppercase') return text.toUpperCase();
  if (textTransform === 'lowercase') return text.toLowerCase();
  return text;
}

function isInlineDisplay(display: string): boolean {
  return display === 'inline' || display === 'inline-block' || display === 'contents';
}

/**
 * True when this element's children are themselves laid out, so the walk must
 * recurse rather than treat the element as one run.
 *
 * `display: contents` counts as inline here on purpose, but for the opposite
 * reason to the others: the two table row wrappers use it and therefore have
 * NO rect at all, so an element whose children are `contents` must be
 * recursed into, never measured. That is handled by the recursion below
 * skipping any child with no usable rect.
 */
function hasLaidOutTextChildren(element: Element): boolean {
  return Array.from(element.children).some((child) => {
    if (!child.textContent?.trim()) return false;
    const display = getComputedStyle(child).display;
    return !isInlineDisplay(display) || display === 'contents';
  });
}

export interface PaceTextPlan {
  /** One box per run, placed in inches relative to the sheet's top left. */
  readonly boxes: readonly PptxTextBox[];
  /** The elements the boxes came from, to hide before the picture is taken. */
  readonly elements: readonly HTMLElement[];
}

/**
 * Walks the sheet and plans a text box for every visible HTML run in it.
 *
 * Coordinates come from `getBoundingClientRect`, which already includes the
 * `translateX(+/-20px)` the wheel wrappers carry and any ancestor scale;
 * `offsetLeft` would include neither. The root's own scale is divided back out
 * so a page that later fits the sheet to the window does not silently double
 * every offset.
 */
export function planPaceText(root: HTMLElement, sheetWidthPx: number): PaceTextPlan {
  const rootRect = root.getBoundingClientRect();
  // 1 on the PACE page today, which renders the card at its true size.
  const scale = rootRect.width > 0 ? rootRect.width / sheetWidthPx : 1;

  const boxes: PptxTextBox[] = [];
  const elements: HTMLElement[] = [];

  const walk = (element: Element): void => {
    // Everything inside a wheel stays in the picture, its hidden a11y table
    // included. See the file comment.
    if (element.tagName === 'FIGURE' || element instanceof SVGElement) return;

    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return;
    }

    if (hasLaidOutTextChildren(element)) {
      for (const child of Array.from(element.children)) walk(child);
      return;
    }

    const raw = element.textContent?.trim();
    if (!raw || !(element instanceof HTMLElement)) return;

    const rect = element.getBoundingClientRect();
    if (rect.width < MIN_SIDE_PX || rect.height < MIN_SIDE_PX) return;

    const run = runStyle(style);
    if (!run) return;

    boxes.push({
      ...run,
      text: applyTransform(raw, style.textTransform),
      place: {
        x: (rect.left - rootRect.left) / scale / PX_PER_INCH,
        y: (rect.top - rootRect.top) / scale / PX_PER_INCH,
        w: rect.width / scale / PX_PER_INCH,
        h: rect.height / scale / PX_PER_INCH,
      },
    });
    elements.push(element);
  };

  walk(root);
  return { boxes, elements };
}

/**
 * Makes the planned runs' glyphs transparent so the picture underneath carries
 * no text, and returns the restore.
 *
 * `color: transparent`, not `visibility: hidden` and certainly not `display`.
 * All three hide the text; only this one leaves the element's box decoration
 * drawn. The sheet puts the rule under each of the LTAC and TACSAT column-head
 * rows on the heading cells' own `border-bottom`, so hiding those elements
 * removes the rules from the picture as well - measured, and visible as two
 * missing rules in an otherwise correct export.
 *
 * Every run on this sheet is a leaf, so transparency has nothing to inherit
 * down onto.
 */
export function hideRuns(elements: readonly HTMLElement[]): () => void {
  const previous = elements.map((element) => element.style.color);
  for (const element of elements) element.style.color = 'transparent';

  return () => {
    elements.forEach((element, i) => {
      const before = previous[i];
      if (before) element.style.color = before;
      else element.style.removeProperty('color');
    });
  };
}

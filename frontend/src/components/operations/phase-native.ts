/**
 * One phase of the operation, as the native PowerPoint objects of one slide.
 *
 * The picture on screen is an SVG drawn from `pictureOf` over a layout
 * (`layoutPhase`, or `layoutFocus`); this draws the same two things as shapes a
 * person can pick up in PowerPoint instead of pixels. Same derivation, same
 * geometry, so a phase reads the same in the file as on the screen:
 *
 * - **A location is a rectangle** carrying its title, with its rule under it.
 * - **A unit is a group**: its card, colour strip, pip, name, branch chip, asset
 *   lines and, on the phase's tier select, the TIER SELECT tag. One drag moves all of it.
 * - **A requirement is a connector** attached to the two cards' connection sites
 *   (`stCxn` and `endCxn` at the card rectangle's top, left, bottom or right), so
 *   dragging a card in PowerPoint drags its lines with it. Direct is solid green,
 *   relay is dashed amber and no link is solid red, the colours the screen
 *   resolves, as the picture does.
 * - **Everything else is text**: the title, the key, the Gaps count, the note on
 *   unused locations and the list of requirements under the picture.
 *
 * What does not follow a drag is the pill on each line (its status text, or its
 * number): it is a small shape set where the screen had it, and it stays put when
 * a card moves. The same goes for a line with more bends than an elbow connector
 * has, which PowerPoint redraws between its two cards the first time either moves.
 *
 * Positions and sizes are the screen's, in the screen's pixels, and fitted to the
 * slide as one: the canvas is the slide at 96 to the inch, widened if the layout
 * needs it, and scaled down when the phase is taller than a slide, so type is the
 * screen's type times one factor. Nothing here touches the DOM or the network;
 * colours arrive through `resolve`, which is what turns a token such as
 * `var(--fg-1)` into the six hex digits a slide stores.
 */

import type {
  CxnSite, PptxObject, PptxShape, PptxSlide, PptxStroke, PptxTextBox,
} from '@/components/common/sheet-export/pptx';
import type { Placement, SlideSize } from '@/components/common/sheet-export/slide-geometry';
import { branchColor } from '@/components/catalog/branch-colors';
import type { Site } from '@/types';
import type { DeckPlan, DeckSlidePlan } from './phase-deck-plan';
import { BOX_PAD, BOX_TITLE_H, assetChars, layoutFocus, layoutPhase } from './phase-layout';
import type { PhaseLayout } from './phase-layout';
import {
  CARD_HEAD, GLYPH, KEY, LABEL_CHAR, LINE_H, LOOSE, NO_GAP, NO_LOCATION, TAG_W, TIER_SELECT, TITLE_CHAR,
  clip, layoutInput, pictureOf, requirementText,
} from './phase-picture-model';
import type { Card, Line, PictureInput } from './phase-picture-model';
import { PAIR_COLOR } from './phase-plan-model';
import { focusUnit } from './phase-show';

/** Turns a CSS colour, a token such as `var(--fg-1)` included, into six hex digits with no `#`. */
export type ResolveColor = (css: string) => string;

/** The two typefaces the slides name, which the deck embeds (`OPERATION_DECK_FONTS`). */
export const FONT_DISPLAY = 'Oswald';
export const FONT_MONO = 'IBM Plex Mono';

/** CSS pixels to points, and the pixels in an inch the slide is laid out at. */
const PT_PER_PX = 0.75;
const PX_PER_IN = 96;

const PAD_X = 32;
const PAD_Y = 28;
const TITLE_H = 36;
const TITLE_GAP = 16;
const LEGEND_H = 18;
const SECTION_GAP = 12;
const NOTE_H = 14;
const ROW_H = 16;
const ROW_GAP = 4;
/** Advance of one character of the 11px mono face, with its tracking. */
const MONO_11 = 7.04;
const BADGE_W = 22;
const BADGE_GAP = 12;
const KEY_SAMPLE_W = 32;
const LINE_PX = 2.5;

/** What `layoutNativePhase` works out ahead of drawing: the layout, which is the one asynchronous part. */
export interface NativeLayout {
  input: PictureInput;
  /** Focus only: the unit every slide is about. */
  focusId: string | null;
  /** Null for the slides that draw no picture: a phase with no units, or one the focused unit is not in. */
  placed: PhaseLayout | null;
}

/**
 * Lays one phase out at `width`: ELK for All and Gaps, and the focus layout,
 * which needs none, for Focus. The same calls the picture makes, so the
 * geometry is the screen's.
 */
export async function layoutNativePhase(slide: DeckSlidePlan, sites: Site[], plan: DeckPlan, width: number): Promise<NativeLayout> {
  const byId = new Map(slide.model.columns.map((c) => [c.participantId, c.label]));
  const input = layoutInput(slide.model, slide.phase, sites, slide.entries, (id) => byId.get(id) ?? id);
  if (slide.missing !== null || slide.model.columns.length === 0) return { input, focusId: null, placed: null };
  if (plan.show === 'focus') {
    const focusId = focusUnit(input, plan.focusId);
    return { input, focusId, placed: focusId === null ? null : layoutFocus(input, focusId, { width }) };
  }
  try {
    return { input, focusId: null, placed: await layoutPhase(input, { width }) };
  } catch (e: unknown) {
    // The reason goes with it: the alert this ends in is the only place it can be read.
    throw new Error(`Could not lay out ${slide.phase.name}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

/** The inner width the layout is asked for: the slide's, less the margin each side. */
export function nativeLayoutWidth(slide: SlideSize): number {
  return Math.floor(slide.w * PX_PER_IN) - 2 * PAD_X;
}

/** 0 top, 1 left, 2 bottom, 3 right: the connection site of the rectangle `card` that the point `at` is nearest to. */
export function siteOf(card: Placement, at: readonly [number, number]): CxnSite {
  const near: [CxnSite, number][] = [
    [0, Math.abs(at[1] - card.y)],
    [1, Math.abs(at[0] - card.x)],
    [2, Math.abs(at[1] - (card.y + card.h))],
    [3, Math.abs(at[0] - (card.x + card.w))],
  ];
  return near.reduce((best, n) => (n[1] < best[1] ? n : best))[0];
}

/** `t` of the way from `a` to `b`, both six hex digits. */
export function mix(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return [0, 1, 2]
    .map((i) => Math.round(channel(a, i) * (1 - t) + channel(b, i) * t).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

type Run = Omit<PptxTextBox, 'place'>;

/**
 * Takes the screen's pixels to the slide's inches and points, and says every
 * colour through one resolver, so a card faded in Gaps is the same drawing code
 * with a resolver that fades.
 */
interface Pen {
  color: ResolveColor;
  /** Pixels to inches, across the canvas and down it. */
  X: (n: number) => number;
  Y: (n: number) => number;
  /** A length. */
  L: (n: number) => number;
  place: (x: number, y: number, w: number, h: number) => Placement;
  stroke: (css: string, px: number, dash?: boolean) => PptxStroke;
  /** Uppercase Oswald, bold, tracked 0.05em, as the picture's display style. */
  display: (text: string, px: number, css: string) => Run;
  /** IBM Plex Mono, tracked 0.04em unless told otherwise. */
  mono: (text: string, px: number, css: string, extra?: { bold?: boolean; tracking?: number }) => Run;
  /** A text box that does not wrap; left-aligned, so a consumer that shrinks it moves nothing. */
  textAt: (x: number, y: number, w: number, h: number, run: Run) => PptxObject;
}

function pen(s: number, ox: number, color: ResolveColor): Pen {
  const pt = (px: number) => px * PT_PER_PX * s;
  const spc = (px: number) => Math.round(px * PT_PER_PX * s * 100);
  const X = (n: number) => (ox + n * s) / PX_PER_IN;
  const Y = (n: number) => (n * s) / PX_PER_IN;
  const L = (n: number) => (n * s) / PX_PER_IN;
  const place = (x: number, y: number, w: number, h: number): Placement => ({ x: X(x), y: Y(y), w: L(w), h: L(h) });
  return {
    color, X, Y, L, place,
    stroke: (css, px, dash = false) => ({ color: color(css), widthPt: pt(px), dash }),
    display: (text, px, css) => ({ text: text.toUpperCase(), font: FONT_DISPLAY, sizePt: pt(px), bold: true, color: color(css), spc: spc(0.05 * px) }),
    mono: (text, px, css, { bold = false, tracking = 0.04 } = {}) => ({ text, font: FONT_MONO, sizePt: pt(px), bold, color: color(css), spc: spc(tracking * px) }),
    textAt: (x, y, w, h, run) => ({ kind: 'text', box: { place: place(x, y, w, h), wrap: false, ...run } }),
  };
}

/** One unit's card: a rectangle with its parts on it, as a group, the rectangle keyed for the lines that end on it. */
function cardGroup(p: Pen, card: Card, tag: string | undefined): PptxObject {
  const { column: c, x, y, w, h } = card;
  const chipW = c.branch.length * 7 + 10;
  // The chip, when there is one, sits at the right edge, so the label has what is left.
  const room = w - 30 - 8 - (c.branch ? chipW + 8 : 0);
  const label = clip(c.label, Math.floor(room / LABEL_CHAR));
  const chipX = x + w - 8 - chipW;
  const kids: PptxObject[] = [
    {
      kind: 'shape', geom: 'rect', key: `card:${c.participantId}`, name: `Card ${c.label}`, place: p.place(x, y, w, h),
      fill: p.color('var(--shf-white)'),
      stroke: card.supported ? p.stroke('var(--shf-amber)', 2) : p.stroke('var(--border-soft)', 1),
    },
    { kind: 'shape', geom: 'rect', name: 'Colour strip', place: p.place(x, y, w, 4), fill: p.color(c.color || 'var(--shf-amber)') },
    {
      kind: 'shape', geom: 'ellipse', name: 'Pip', place: p.place(x + 11, y + 15, 10, 10),
      fill: c.color ? p.color(c.color) : undefined, stroke: c.color ? undefined : p.stroke('var(--shf-graphite-600)', 1),
    },
    p.textAt(x + 28, y + 9, room, 22, p.display(label, 14, 'var(--fg-1)')),
  ];
  if (c.branch) {
    const ink = c.branch === 'USA' ? 'var(--shf-black)' : 'var(--shf-white)';
    kids.push({
      kind: 'shape', geom: 'rect', name: `Branch ${c.branch}`, place: p.place(chipX, y + 11, chipW, 18), fill: p.color(branchColor(c.branch)),
      text: { ...p.mono(c.branch, 11, ink, { bold: true }), align: 'ctr' },
    });
  }
  // The asset lines, then where the unit is when the picture draws no location boxes.
  const lines = [...card.assets, ...(tag !== undefined ? [clip(`@ ${tag}`, assetChars(w))] : [])];
  lines.forEach((line, i) => {
    const css = i < card.assets.length ? 'var(--fg-2)' : 'var(--fg-3)';
    kids.push(p.textAt(x + 12, y + CARD_HEAD + 4 + i * LINE_H - 11, w - 24, LINE_H, p.mono(line, 11, css, { tracking: 0 })));
  });
  if (card.supported) {
    kids.push({
      kind: 'shape', geom: 'rect', name: 'Tier select tag', place: p.place(x + w - TAG_W - 8, y - 9, TAG_W, 18), fill: p.color('var(--shf-amber)'),
      text: { ...p.mono(TIER_SELECT.toUpperCase(), 11, 'var(--shf-black)', { bold: true, tracking: 0.1 }), align: 'ctr' },
    });
  }
  return { kind: 'group', name: `Unit ${c.label}`, descr: c.name, children: kids };
}

/** The label on a line, small, where the screen has it: its status text, or its number where there was no room for the text. */
function pill(p: Pen, l: Line, paper: string, at: (x: number, y: number) => readonly [number, number]): PptxShape {
  const { w, h } = l.label;
  const [x, y] = at(l.label.x, l.label.y);
  return {
    kind: 'shape', geom: 'roundRect', radius: l.badge === null ? 2 / h : 0.5, name: `Label ${l.entry.aLabel} to ${l.entry.bLabel}`, descr: l.title,
    place: p.place(x, y, w, h), fill: paper, stroke: p.stroke(PAIR_COLOR[l.kind], 1),
    text: { ...p.mono(l.badge === null ? l.text : String(l.badge), 11, 'var(--fg-1)', { tracking: 0 }), align: 'ctr' },
  };
}

/**
 * The slide for one laid-out phase, as native objects over the paper.
 *
 * `plan.show` decides what is drawn, exactly as on screen: All draws every
 * requirement, Gaps only the relay and no-means ones with the other units
 * faded, and Focus one unit with the partners it must talk to round it.
 */
export function buildNativeSlide({ slide, plan, laid, size, resolve }: {
  slide: DeckSlidePlan;
  plan: DeckPlan;
  laid: NativeLayout;
  size: SlideSize;
  resolve: ResolveColor;
}): PptxSlide {
  const { input, focusId, placed } = laid;
  const { show } = plan;
  const labelOf = (id: string) => input.cards.get(id)?.column.label ?? id;
  const drawing = pictureOf({ input, placed, show, focusId, entries: slide.entries });
  const paper = resolve('var(--shf-paper)');

  // The column, top to bottom, in the screen's pixels, before it is known how tall it comes to.
  const slidePxW = size.w * PX_PER_IN;
  const slidePxH = size.h * PX_PER_IN;
  const titleY = PAD_Y;
  let y = titleY + TITLE_H + TITLE_GAP;
  const absent = slide.missing !== null;
  const empty = !absent && slide.model.columns.length === 0;
  const drawn = !absent && !empty && placed !== null ? placed : null;
  const legendY = drawn ? y : null;
  if (drawn) y += LEGEND_H + SECTION_GAP;
  const gapsY = drawn && show === 'gaps' && input.shown.size > 0 ? y : null;
  if (gapsY !== null) y += 16 + SECTION_GAP;
  const pictureY = y;
  if (drawn) y += drawn.height;
  // The unit-absent slide's line has 48px above and below it, as on the sheet.
  if (absent) y += 48 + 33 + 48;
  if (empty) y += 46;
  const unusedY = drawn && input.unused.length > 0 ? y + SECTION_GAP : null;
  if (unusedY !== null) y = unusedY + NOTE_H;
  const focusEmpty = drawn !== null && show === 'focus' && focusId !== null && drawing.listed.length === 0;
  const noRequirements = drawn !== null && !focusEmpty && slide.entries.length === 0;
  const noteY = focusEmpty || noRequirements ? y + SECTION_GAP : null;
  if (noteY !== null) y = noteY + NOTE_H;
  const listed = drawn && !focusEmpty && !noRequirements ? drawing.listed : [];
  const listY = listed.length > 0 ? y + SECTION_GAP : null;
  if (listY !== null) y = listY + listed.length * ROW_H + (listed.length - 1) * ROW_GAP;

  // One factor takes the canvas to the slide, centred; the canvas is as wide as the layout needs and at least the slide's.
  const canvasW = Math.max(slidePxW, (drawn?.width ?? 0) + 2 * PAD_X);
  const canvasH = Math.max(slidePxH, y + PAD_Y);
  const s = Math.min(slidePxW / canvasW, slidePxH / canvasH);
  const p = pen(s, (slidePxW - canvasW * s) / 2, resolve);
  const inner = canvasW - 2 * PAD_X;

  const objects: PptxObject[] = [p.textAt(PAD_X, titleY, inner, TITLE_H, p.display(slide.title, 28, 'var(--fg-1)'))];

  if (absent) {
    objects.push(p.textAt(PAD_X, pictureY + 48, inner, 33, p.display(`${slide.missing ?? ''} is not in this phase`, 22, 'var(--fg-3)')));
  } else if (empty) {
    objects.push({
      kind: 'shape', geom: 'rect', name: 'No units', place: p.place(PAD_X, pictureY, inner, 46),
      fill: mix(paper, '000000', 0.02), stroke: p.stroke('var(--border-soft)', 1, true),
      text: { ...p.mono('No units are in this phase.', 13, 'var(--fg-3)', { tracking: 0 }), wrap: false, inset: { l: p.L(18), t: 0, r: p.L(18), b: 0 } },
    });
  }

  if (legendY !== null) {
    let x = PAD_X;
    for (const { kind, text } of KEY) {
      const mid = p.Y(legendY + 9);
      objects.push({ kind: 'connector', name: `Key: ${kind}`, points: [[p.X(x), mid], [p.X(x + KEY_SAMPLE_W), mid]], stroke: p.stroke(PAIR_COLOR[kind], LINE_PX, kind === 'relay') });
      x += KEY_SAMPLE_W + 8;
      const label = `${GLYPH[kind]} ${text}`;
      const w = label.length * MONO_11 + 4;
      objects.push(p.textAt(x, legendY, w, LEGEND_H, p.mono(label, 11, 'var(--fg-2)')));
      x += w + 20;
    }
    objects.push({ kind: 'shape', geom: 'rect', name: 'Key: supported', place: p.place(x, legendY + 2, 22, 14), fill: p.color('var(--shf-white)'), stroke: p.stroke('var(--shf-amber)', 2) });
    objects.push(p.textAt(x + 30, legendY, TIER_SELECT.length * MONO_11 + 4, LEGEND_H, p.mono(TIER_SELECT, 11, 'var(--fg-2)')));
  }

  if (gapsY !== null) {
    objects.push(p.textAt(PAD_X, gapsY, inner, 16, p.mono(drawing.gapsText, 12, drawing.gaps.length === 0 ? PAIR_COLOR.direct : 'var(--fg-1)', { bold: true })));
  }

  if (drawn) {
    // The layout's own coordinates, moved to where the picture sits on the canvas.
    const at = (px: number, py: number): readonly [number, number] => [px + PAD_X, py + pictureY];
    const cardOf = new Map(drawing.cards.map((c) => [c.column.participantId, { ...c, x: c.x + PAD_X, y: c.y + pictureY }]));

    // Locations at the back, then the lines, then the cards, then the pills, as on screen.
    for (const b of drawn.boxes) {
      const loose = b.id === LOOSE;
      const [bx, by] = at(b.x, b.y);
      const ruleY = p.Y(by + BOX_TITLE_H - 6);
      const title = clip(b.name, Math.floor((b.w - 2 * BOX_PAD) / TITLE_CHAR)).toUpperCase();
      objects.push({
        kind: 'group', name: `Location ${b.name}`,
        children: [
          {
            kind: 'shape', geom: 'rect', name: `Location ${b.name} frame`, place: p.place(bx, by, b.w, b.h),
            fill: mix(paper, '000000', 0.025), stroke: p.stroke('var(--border-soft)', 1, loose),
            text: {
              ...p.mono(title, 12, loose ? 'var(--fg-3)' : 'var(--fg-1)', { bold: true }),
              anchor: 't', wrap: false, inset: { l: p.L(BOX_PAD), t: p.L(9), r: p.L(BOX_PAD), b: 0 },
            },
          },
          { kind: 'connector', name: `Location ${b.name} rule`, points: [[p.X(bx), ruleY], [p.X(bx + b.w), ruleY]], stroke: p.stroke('var(--border-soft)', 1) },
        ],
      });
    }

    for (const l of drawing.lines) {
      const from = cardOf.get(l.from);
      const to = cardOf.get(l.to);
      const first = l.points[0];
      const last = l.points[l.points.length - 1];
      const route = l.points.map(([px, py]) => at(px, py));
      objects.push({
        kind: 'connector', name: `${l.entry.aLabel} to ${l.entry.bLabel}`, descr: l.title,
        points: route.map(([rx, ry]) => [p.X(rx), p.Y(ry)]),
        start: from && first ? { key: `card:${l.from}`, site: siteOf(from, at(first[0], first[1])) } : undefined,
        end: to && last ? { key: `card:${l.to}`, site: siteOf(to, at(last[0], last[1])) } : undefined,
        stroke: p.stroke(PAIR_COLOR[l.kind], LINE_PX, l.kind === 'relay'),
      });
    }

    for (const card of drawing.cards) {
      const id = card.column.participantId;
      // A card with no gap of its own recedes in Gaps: every colour on it is taken toward the paper.
      const faded = show === 'gaps' && !drawing.gapUnits.has(id) ? NO_GAP : 1;
      const pn = faded < 1 ? pen(s, (slidePxW - canvasW * s) / 2, (css) => mix(resolve(css), paper, 1 - faded)) : p;
      const partner = show === 'focus' && id !== focusId;
      const [cx, cy] = at(card.x, card.y);
      objects.push(cardGroup(pn, { ...card, x: cx, y: cy }, partner ? (input.places.get(id) ?? NO_LOCATION) : undefined));
    }

    for (const l of drawing.lines) objects.push(pill(p, l, paper, at));
  }

  if (unusedY !== null) {
    objects.push(p.textAt(PAD_X, unusedY, inner, NOTE_H, p.mono(`Not used this phase: ${input.unused.join(', ')}`, 11, 'var(--fg-3)')));
  }
  if (noteY !== null) {
    const text = focusEmpty ? `${labelOf(focusId ?? '')} has no requirements in this phase` : 'No requirements set for this phase';
    objects.push(p.textAt(PAD_X, noteY, inner, NOTE_H, p.mono(text, 11, 'var(--fg-3)')));
  }
  if (listY !== null) {
    const badgeOf = new Map(drawing.lines.flatMap((l) => (l.badge === null ? [] : [[l.id, l.badge] as const])));
    listed.forEach((e, i) => {
      const rowY = listY + i * (ROW_H + ROW_GAP);
      const { text, color } = requirementText(e, labelOf);
      const badge = badgeOf.get(e.id);
      if (badge !== undefined) {
        objects.push({
          kind: 'shape', geom: 'roundRect', radius: 0.5, name: `Requirement ${String(badge)}`, place: p.place(PAD_X, rowY, BADGE_W, ROW_H),
          stroke: p.stroke(color, 1),
          text: { ...p.mono(String(badge), 11, 'var(--fg-1)', { bold: true, tracking: 0 }), align: 'ctr' },
        });
      }
      const indent = badge !== undefined ? BADGE_W + BADGE_GAP : 0;
      objects.push(p.textAt(PAD_X + indent, rowY, inner - indent, ROW_H, {
        ...p.display(`${e.aLabel} - ${e.bLabel}`, 13, 'var(--fg-1)'),
        // Two spaces of the mono face are the screen's 12px gap.
        runs: [p.mono(`  ${text}`, 11, color, { bold: true })],
      }));
    });
  }

  return { slide: size, pictures: [], objects, background: paper };
}

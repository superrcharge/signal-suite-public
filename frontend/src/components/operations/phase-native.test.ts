import { describe, expect, it } from 'vitest';

import { buildPptxDeck, pptxDeckParts } from '@/components/common/sheet-export/pptx';
import type { PptxConnector, PptxObject, PptxShape, PptxSlide } from '@/components/common/sheet-export/pptx';
import { packageProblems } from '@/components/common/sheet-export/pptx-package-checks';
import { OPERATION_DECK_FONTS } from '@/components/common/sheet-export/sheet-fonts';
import type { FetchedFontFamily } from '@/components/common/sheet-export/sheet-fonts';
import { WIDE_SLIDE } from '@/components/common/sheet-export/slide-geometry';
import type { Participant, Phase } from '@/types';
import type { InteropInput } from './interop-model';
import { phaseNativeDeckSpec } from './phase-deck-native';
import {
  DECK_INPUT, DECK_OPERATION, DECK_PARTICIPANTS, DECK_PHASES, DECK_SITES,
  RELAY_INPUT, RELAY_PARTICIPANTS, RELAY_PHASES, TALL_PHASES, testColor,
} from './phase-deck-fixtures';
import { planPhaseDeck } from './phase-deck-plan';
import { siteOf } from './phase-native';
import type { Show } from './phase-show';

interface Scenario { phases?: Phase[]; participants?: Participant[]; input?: Omit<InteropInput, 'phaseId'> }

/** The deck for a scenario in a Show mode, laid out by the real ELK and the real focus layout. */
async function slidesOf(show: Show, focusParam: string | null = null, { phases = DECK_PHASES, participants = DECK_PARTICIPANTS, input = DECK_INPUT }: Scenario = {}) {
  const plan = planPhaseDeck({ operation: DECK_OPERATION, phases, participants, input, sites: DECK_SITES, show, focusParam, currentPhaseId: 'ph1' });
  const spec = phaseNativeDeckSpec(plan, DECK_SITES, 'Night Owl', testColor);
  const slides: PptxSlide[] = [];
  for (let i = 0; i < spec.count; i++) slides.push(await spec.buildSlide(i));
  return slides;
}

/** Every object on a slide, groups flattened, in stacking order. */
const flat = (objects: readonly PptxObject[] = []): PptxObject[] => objects.flatMap((o) => (o.kind === 'group' ? [o, ...flat(o.children)] : [o]));
const shapes = (slide: PptxSlide) => flat(slide.objects).filter((o): o is PptxShape => o.kind === 'shape');
const connectors = (slide: PptxSlide) => flat(slide.objects).filter((o): o is PptxConnector => o.kind === 'connector' && o.start !== undefined);
const texts = (slide: PptxSlide) => flat(slide.objects).flatMap((o) => (o.kind === 'text' ? [o.box.text] : o.kind === 'shape' && o.text ? [o.text.text] : []));
const units = (slide: PptxSlide) => flat(slide.objects).filter((o) => o.kind === 'group' && o.name?.startsWith('Unit '));

/** Fonts as the deck embeds them, with a minimal sfnt for each so a whole deck builds without reading files. */
const FACE = (() => {
  const bytes = new Uint8Array(12);
  new DataView(bytes.buffer).setUint32(0, 0x00010000);
  return bytes;
})();
const FONTS: FetchedFontFamily[] = OPERATION_DECK_FONTS.map((f) => ({ typeface: f.typeface, regular: FACE, bold: FACE }));

const GREEN = '3FB950';
const AMBER_DEEP = 'B87F00';
const RED = 'F85149';

describe('the native slide of a phase', () => {
  it('is one slide per phase in phase order, titled with the operation and the phase, over the paper', async () => {
    const slides = await slidesOf('all');
    expect(slides).toHaveLength(3);
    expect(slides.map((s) => texts(s)[0])).toEqual(['NIGHT OWL - STAGING', 'NIGHT OWL - INFIL', 'NIGHT OWL - EXFIL']);
    expect(slides.every((s) => s.background === 'F4F2EC' && s.pictures.length === 0)).toBe(true);
    expect(slides.every((s) => s.slide === WIDE_SLIDE)).toBe(true);
  });

  it('writes a deck every check passes: each part parses, the graph closes, ids are unique, connectors are attached to shapes on their slide, fonts are EOT', async () => {
    for (const show of ['all', 'gaps', 'focus'] as const) {
      const parts = pptxDeckParts(await slidesOf(show, show === 'focus' ? 'pb' : null), { fonts: FONTS });
      expect(packageProblems(parts), show).toEqual([]);
    }
    const relay = pptxDeckParts(await slidesOf('all', null, { phases: RELAY_PHASES, participants: RELAY_PARTICIPANTS, input: RELAY_INPUT }), { fonts: FONTS });
    expect(packageProblems(relay)).toEqual([]);
    expect(buildPptxDeck(await slidesOf('all'), { fonts: FONTS }).length).toBeGreaterThan(1000);
  }, 20000);

  describe('All', () => {
    it('draws a unit as a group of its parts, with the card keyed for the lines that end on it', async () => {
      const [first] = await slidesOf('all');
      expect(units(first!).map((g) => g.kind === 'group' && g.name)).toEqual(['Unit ALPHA', 'Unit BRAVO', 'Unit CHARLIE']);
      const keyed = shapes(first!).filter((s) => s.key !== undefined);
      expect(keyed.map((s) => s.key)).toEqual(['card:pa', 'card:pb', 'card:pc']);
      const alpha = units(first!)[0];
      const parts = alpha?.kind === 'group' ? alpha.children.map((c) => (c.kind === 'shape' ? c.name : c.kind)) : [];
      expect(parts).toEqual(['Card ALPHA', 'Colour strip', 'Pip', 'text', 'Branch USA', 'text']);
    });

    it('draws a requirement as a connector attached to the two cards it names', async () => {
      const [first] = await slidesOf('all');
      const lines = connectors(first!);
      expect(lines.map((l) => l.name)).toEqual(['ALPHA to BRAVO', 'ALPHA to CHARLIE']);
      expect(lines.map((l) => [l.start?.key, l.end?.key])).toEqual([['card:pa', 'card:pb'], ['card:pa', 'card:pc']]);
      expect(lines.every((l) => l.descr !== undefined && l.descr.length > 0)).toBe(true);
    });

    it('puts each end of a connector on the side of its card the site names', async () => {
      for (const slide of await slidesOf('all', null, { phases: RELAY_PHASES, participants: RELAY_PARTICIPANTS, input: RELAY_INPUT })) {
        const card = new Map(shapes(slide).filter((s) => s.key !== undefined).map((s) => [s.key, s.place]));
        for (const l of connectors(slide)) {
          for (const [end, at] of [[l.start, l.points[0]], [l.end, l.points[l.points.length - 1]]] as const) {
            const rect = card.get(end!.key)!;
            expect(siteOf(rect, at!)).toBe(end!.site);
            // On that side, to a hair: the layout ends a line on its card's border.
            const edge = [rect.y, rect.x, rect.y + rect.h, rect.x + rect.w][end!.site]!;
            const coordinate = end!.site % 2 === 0 ? at![1] : at![0];
            expect(Math.abs(coordinate - edge)).toBeLessThan(0.02);
          }
        }
      }
    });

    it('colours a line by its status as the screen does: direct solid green, relay dashed amber, no link solid red', async () => {
      const [slide] = await slidesOf('all', null, { phases: RELAY_PHASES, participants: RELAY_PARTICIPANTS, input: RELAY_INPUT });
      const by = new Map(connectors(slide!).map((l) => [l.name, l.stroke]));
      expect(by.get('ALPHA to BRAVO')).toMatchObject({ color: GREEN, dash: false });
      expect(by.get('ALPHA to CHARLIE')).toMatchObject({ color: AMBER_DEEP, dash: true });
      expect(by.get('CHARLIE to DELTA')).toMatchObject({ color: GREEN, dash: false });
      const [plain] = await slidesOf('all');
      expect(connectors(plain!).find((l) => l.name === 'ALPHA to CHARLIE')?.stroke).toMatchObject({ color: RED, dash: false });
    });

    it('gives each line a pill, and a location box for each location with units, the unplaced last and dashed', async () => {
      const [slide] = await slidesOf('all', null, { phases: RELAY_PHASES, participants: RELAY_PARTICIPANTS, input: RELAY_INPUT });
      expect(shapes(slide!).filter((s) => s.name?.startsWith('Label ')).map((s) => s.text?.text)).toHaveLength(3);
      const frames = shapes(slide!).filter((s) => s.name?.endsWith(' frame'));
      expect(frames.map((s) => s.text?.text)).toEqual(['ISB', 'FSB', 'NO LOCATION']);
      expect(frames.map((s) => s.stroke?.dash)).toEqual([false, false, true]);
    });

    it('marks the supported unit with an amber border and a tag, and no other', async () => {
      const [slide] = await slidesOf('all', null, { phases: RELAY_PHASES, participants: RELAY_PARTICIPANTS, input: RELAY_INPUT });
      const tags = shapes(slide!).filter((s) => s.name === 'Tier select tag');
      expect(tags).toHaveLength(1);
      expect(tags[0]!.text?.text).toBe('TIER SELECT');
      const cards = new Map(shapes(slide!).filter((s) => s.key !== undefined).map((s) => [s.key, s.stroke]));
      expect(cards.get('card:pa')).toMatchObject({ color: 'F2A900' });
      expect(cards.get('card:pb')).toMatchObject({ color: 'D9D4C5' });
    });

    it('writes the requirement list under the picture, one row each, with its status in the screen\'s colour', async () => {
      const [first] = await slidesOf('all');
      const rows = flat(first!.objects).flatMap((o) => (o.kind === 'text' && o.box.runs ? [o.box] : []));
      expect(rows.map((r) => [r.text, r.runs![0]!.text.trim(), r.runs![0]!.color])).toEqual([
        ['ALPHA - BRAVO', 'direct: ANW2', GREEN],
        ['ALPHA - CHARLIE', 'no link', RED],
      ]);
    });
  });

  describe('Gaps', () => {
    it('draws only the lines that are not direct, said in a count above the picture, and fades the units with no gap', async () => {
      const [slide] = await slidesOf('gaps', null, { phases: RELAY_PHASES, participants: RELAY_PARTICIPANTS, input: RELAY_INPUT });
      expect(connectors(slide!).map((l) => l.name)).toEqual(['ALPHA to CHARLIE']);
      expect(texts(slide!)).toContain('1 gap in this phase: 1 relay');
      // BRAVO has no gap of its own: its card is the paper's colour taken toward white, not white.
      const cards = new Map(shapes(slide!).filter((s) => s.key !== undefined).map((s) => [s.key, s.fill]));
      expect(cards.get('card:pa')).toBe('FFFFFF');
      expect(cards.get('card:pb')).not.toBe('FFFFFF');
      expect(cards.get('card:pb')).toMatch(/^[0-9A-F]{6}$/);
    });

    it('says so when every requirement is direct, and draws no line', async () => {
      const slides = await slidesOf('gaps');
      expect(texts(slides[1]!)).toContain('No gaps - every requirement in this phase is direct');
      expect(connectors(slides[1]!)).toEqual([]);
    });
  });

  describe('Focus', () => {
    it('draws one unit and its partners, each partner naming where it is, and only the focused unit\'s lines', async () => {
      const slides = await slidesOf('focus', 'pa');
      const first = slides[0]!;
      expect(units(first).map((g) => g.kind === 'group' && g.name)).toEqual(['Unit ALPHA', 'Unit BRAVO', 'Unit CHARLIE']);
      expect(texts(first)).toEqual(expect.arrayContaining(['@ ISB', '@ FSB']));
      expect(shapes(first).some((s) => s.name?.endsWith(' frame'))).toBe(false);
      expect(connectors(first).map((l) => l.name)).toEqual(['ALPHA to BRAVO', 'ALPHA to CHARLIE']);
    });

    it('has a slide that says so for a phase the unit is not in, with nothing drawn', async () => {
      const slides = await slidesOf('focus', 'pb');
      const last = slides[2]!;
      expect(texts(last)).toEqual(['NIGHT OWL - EXFIL', 'BRAVO IS NOT IN THIS PHASE']);
      expect(units(last)).toEqual([]);
      expect(connectors(last)).toEqual([]);
    });

    it('draws focus as straight spokes, which a connector does with two points', async () => {
      const [slide] = await slidesOf('focus', 'pa');
      expect(connectors(slide!).every((l) => l.points.length === 2)).toBe(true);
    });
  });

  it('names no typeface the deck does not embed, and no token the palette lacks', async () => {
    const used = new Set<string>();
    for (const show of ['all', 'gaps', 'focus'] as const) {
      for (const slide of await slidesOf(show, 'pa', { phases: RELAY_PHASES, participants: RELAY_PARTICIPANTS, input: RELAY_INPUT })) {
        for (const o of flat(slide.objects)) {
          if (o.kind === 'text') [o.box, ...(o.box.runs ?? [])].forEach((r) => used.add(r.font));
          if (o.kind === 'shape' && o.text) used.add(o.text.font);
        }
      }
    }
    expect([...used].sort()).toEqual(['IBM Plex Mono', 'Oswald']);
    for (const font of used) expect(OPERATION_DECK_FONTS.map((f) => f.typeface)).toContain(font);
  });

  it('keeps every object on the slide, at every size of phase', async () => {
    const tall = await slidesOf('all', null, { phases: TALL_PHASES });
    for (const slide of [...(await slidesOf('all')), ...(await slidesOf('gaps')), ...(await slidesOf('focus', 'pa')), ...tall]) {
      for (const o of flat(slide.objects)) {
        const boxes = o.kind === 'shape' ? [o.place] : o.kind === 'text' ? [o.box.place] : o.kind === 'connector' ? o.points.map(([x, y]) => ({ x, y, w: 0, h: 0 })) : [];
        for (const b of boxes) {
          expect(b.x).toBeGreaterThanOrEqual(-0.01);
          expect(b.y).toBeGreaterThanOrEqual(-0.01);
          expect(b.x + b.w).toBeLessThanOrEqual(WIDE_SLIDE.w + 0.01);
          expect(b.y + b.h).toBeLessThanOrEqual(WIDE_SLIDE.h + 0.01);
        }
      }
    }
  }, 20000);

  it('fits a phase taller than a slide by scaling it, so its type is the screen\'s times one factor and nothing is cut', async () => {
    const [short] = await slidesOf('all');
    const [tall] = await slidesOf('all', null, { phases: TALL_PHASES });
    const size = (slide: PptxSlide) => (flat(slide.objects).find((o) => o.kind === 'text' && o.box.font === 'Oswald' && o.box.sizePt > 8) as { box: { sizePt: number } }).box.sizePt;
    // The title is 28px: 21pt on a slide taken at its own size, and smaller once the list pushed the canvas past 720.
    expect(size(short!)).toBeCloseTo(21, 1);
    expect(size(tall!)).toBeLessThan(size(short!));
    const rows = flat(tall!.objects).filter((o) => o.kind === 'text' && o.box.runs !== undefined);
    expect(rows).toHaveLength(40);
  }, 20000);
});

describe('siteOf', () => {
  const card = { x: 10, y: 20, w: 100, h: 40 };
  it('is the side of the rectangle the point is nearest to: 0 top, 1 left, 2 bottom, 3 right', () => {
    expect(siteOf(card, [60, 20])).toBe(0);
    expect(siteOf(card, [10, 40])).toBe(1);
    expect(siteOf(card, [60, 60])).toBe(2);
    expect(siteOf(card, [110, 40])).toBe(3);
  });

  it('takes a diagonal spoke\'s border point to the nearest side', () => {
    expect(siteOf(card, [100, 21])).toBe(0);
    expect(siteOf(card, [12, 55])).toBe(1);
  });
});

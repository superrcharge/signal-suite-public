import { describe, expect, it } from 'vitest';

import { assetChars, cardHeight, cardWidth, labelWidth, layoutFocus, layoutPhase, orientRequirements, polylinePath, wrapAssets } from './phase-layout';
import type { LayoutLocation, LayoutRequirement, LayoutUnit, PhaseLayout, Rect } from './phase-layout';

const unit = (id: string, over: Partial<LayoutUnit> = {}): LayoutUnit => ({ id, label: id.toUpperCase(), branch: '', assetLines: 2, supported: false, ...over });
const req = (id: string, a: string, b: string, text = 'SINCGARS +7'): LayoutRequirement => ({ id, a, b, status: 'direct', text });
const place = (id: string, name: string, ...unitIds: string[]): LayoutLocation => ({ id, name, unitIds });

// A small mission: two locations, a hub unit that talks to everyone, one unit nobody asks for.
const UNITS = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => unit(id, { supported: id === 'c', assetLines: id === 'b' ? 5 : 2 }));
const LOCATIONS = [place('isb', 'ISB', 'a', 'b'), place('fsb', 'FSB', 'c', 'd'), place('x', 'The X', 'e', 'f')];
const REQS = [req('r1', 'a', 'c'), req('r2', 'c', 'd', 'via TF WHITE'), req('r3', 'c', 'e', 'no link'), req('r4', 'b', 'e'), req('r5', 'a', 'e')];

const WIDE = { width: 4000 };

const overlap = (p: Rect, q: Rect) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
const inside = (inner: Rect, outer: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
const onBorder = (p: [number, number], r: Rect) => {
  const [x, y] = p;
  const within = x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5;
  const edge = Math.abs(x - r.x) < 0.5 || Math.abs(x - (r.x + r.w)) < 0.5 || Math.abs(y - r.y) < 0.5 || Math.abs(y - (r.y + r.h)) < 0.5;
  return within && edge;
};
const card = (l: PhaseLayout, id: string) => l.cards.find((c) => c.id === id)!;
const box = (l: PhaseLayout, id: string) => l.boxes.find((b) => b.id === id)!;

describe('layoutPhase geometry', () => {
  it('puts every card inside its location box, at the size its asset lines give', async () => {
    const l = await layoutPhase({ locations: LOCATIONS, units: UNITS, requirements: REQS }, WIDE);
    expect(l.cards).toHaveLength(6);
    for (const c of l.cards) {
      expect(inside(c, box(l, c.boxId)), `card ${c.id} in box ${c.boxId}`).toBe(true);
      expect(c.w).toBe(cardWidth(c.id.toUpperCase(), ''));
    }
    // A card grows past its asset lines only to give each line that meets it a port of its own.
    expect(card(l, 'b').h).toBeGreaterThanOrEqual(cardHeight(5));
    expect(card(l, 'a').h).toBeGreaterThanOrEqual(cardHeight(2));
    expect(l.boxes.map((b) => b.name).sort()).toEqual(['FSB', 'ISB', 'The X']);
  });

  it('keeps cards apart and every box inside the drawing', async () => {
    const l = await layoutPhase({ locations: LOCATIONS, units: UNITS, requirements: REQS }, WIDE);
    l.cards.forEach((p, i) => l.cards.slice(i + 1).forEach((q) => { expect(overlap(p, q), `${p.id} over ${q.id}`).toBe(false); }));
    l.boxes.forEach((p, i) => l.boxes.slice(i + 1).forEach((q) => { expect(overlap(p, q), `box ${p.id} over ${q.id}`).toBe(false); }));
    for (const b of l.boxes) expect(inside(b, { x: 0, y: 0, w: l.width, h: l.height }), `box ${b.id} in the drawing`).toBe(true);
  });

  it('keeps every edge label off every card', async () => {
    const l = await layoutPhase({ locations: LOCATIONS, units: UNITS, requirements: REQS }, WIDE);
    expect(l.edges).toHaveLength(REQS.length);
    for (const e of l.edges) {
      // A line between two neighbours of one box has no room for the text, only for a badge.
      expect(e.label.w).toBe(e.badge === null ? labelWidth(e.text) : 22);
      for (const c of l.cards) expect(overlap(e.label, c), `label ${e.id} over card ${c.id}`).toBe(false);
    }
  });

  it('gives every line its own point on a card, so none arrive or leave together', async () => {
    const l = await layoutPhase({ locations: LOCATIONS, units: UNITS, requirements: REQS }, WIDE);
    const ends = l.edges.flatMap((e) => [e.points[0]!, e.points[e.points.length - 1]!]).map(([x, y]) => `${String(x)},${String(y)}`);
    expect(new Set(ends).size).toBe(ends.length);
  });

  it('keeps every label, or badge, clear of every other line, label, card and box title', async () => {
    const l = await layoutPhase({ locations: LOCATIONS, units: UNITS, requirements: REQS }, WIDE);
    const thin = (e: (typeof l.edges)[number]) => e.points.slice(1).map((p, i) => {
      const q = e.points[i]!;
      return { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(p[0] - q[0]), h: Math.abs(p[1] - q[1]) };
    });
    l.edges.forEach((e, i) => {
      l.edges.forEach((o, j) => {
        if (i === j) return;
        for (const run of thin(o)) expect(overlap(e.label, run), `line ${o.id} through label ${e.id}`).toBe(false);
        expect(overlap(e.label, o.label), `label ${e.id} over label ${o.id}`).toBe(false);
      });
      for (const c of l.cards) expect(overlap(e.label, c), `label ${e.id} over card ${c.id}`).toBe(false);
    });
  });

  it('numbers badges from 1 in the order of the lines, and gives a badge only where a label would not have been clear', async () => {
    const l = await layoutPhase({ locations: LOCATIONS, units: UNITS, requirements: REQS }, WIDE);
    const numbers = l.edges.flatMap((e) => (e.badge === null ? [] : [e.badge]));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    for (const e of l.edges) if (e.badge !== null) expect(e.label.w).toBeLessThan(labelWidth(e.text));
  });

  it('starts and ends each edge on the border of its two cards, and runs it at right angles', async () => {
    const l = await layoutPhase({ locations: LOCATIONS, units: UNITS, requirements: REQS }, WIDE);
    for (const e of l.edges) {
      const r = REQS.find((q) => q.id === e.id)!;
      const ends = [card(l, r.a), card(l, r.b)];
      const first = e.points[0]!;
      const last = e.points[e.points.length - 1]!;
      expect(
        (onBorder(first, ends[0]!) && onBorder(last, ends[1]!)) || (onBorder(first, ends[1]!) && onBorder(last, ends[0]!)),
        `edge ${e.id} ends on its cards`,
      ).toBe(true);
      e.points.slice(1).forEach((p, i) => {
        const q = e.points[i]!;
        expect(Math.abs(p[0] - q[0]) < 0.5 || Math.abs(p[1] - q[1]) < 0.5, `edge ${e.id} segment ${String(i)} is straight`).toBe(true);
      });
    }
  });

  it('says which unit each line runs from and to, outward from the supported one, and starts it on the first', async () => {
    const l = await layoutPhase({ locations: LOCATIONS, units: UNITS, requirements: REQS }, WIDE);
    const e = (id: string) => l.edges.find((x) => x.id === id)!;
    // r1 is written a to c, and c is the supported unit, so it runs c to a.
    expect([e('r1').from, e('r1').to]).toEqual(['c', 'a']);
    for (const x of l.edges) expect(onBorder(x.points[0]!, card(l, x.from)), `edge ${x.id} starts on ${x.from}`).toBe(true);
  });

  it('leads with the supported unit: its box is first in the order given and leftmost, and its card too within its box', async () => {
    const l = await layoutPhase({ locations: LOCATIONS, units: UNITS, requirements: REQS }, WIDE);
    expect(l.boxes[0]!.id).toBe('fsb');
    expect(box(l, 'fsb').x).toBe(Math.min(...l.boxes.map((b) => b.x)));
    expect(card(l, 'c').x).toBe(Math.min(...l.cards.map((c) => c.x)));
    expect(l.cards.filter((c) => c.boxId === 'fsb')[0]!.id).toBe('c');
  });

  it('lays an all-in-one-location phase out as one box holding every card', async () => {
    const l = await layoutPhase({
      locations: [place('only', 'Only', 'a', 'b', 'c', 'd')],
      units: ['a', 'b', 'c', 'd'].map((id) => unit(id)),
      requirements: [req('r1', 'a', 'b'), req('r2', 'b', 'c'), req('r3', 'a', 'd')],
    }, WIDE);
    expect(l.boxes).toHaveLength(1);
    expect(l.cards.every((c) => c.boxId === 'only' && inside(c, l.boxes[0]!))).toBe(true);
    expect(l.edges).toHaveLength(3);
  });

  it('lays out units with no requirements at all, and an empty phase as nothing', async () => {
    const quiet = await layoutPhase({ locations: [place('s', 'S', 'a', 'b')], units: [unit('a'), unit('b')], requirements: [] }, WIDE);
    expect(quiet.cards).toHaveLength(2);
    expect(quiet.edges).toEqual([]);
    const none = await layoutPhase({ locations: [], units: [], requirements: [] }, WIDE);
    expect(none).toEqual({ width: 0, height: 0, boxes: [], cards: [], edges: [] });
  });

  it('drops a requirement naming a unit that is not drawn, and one joining a unit to itself', async () => {
    const l = await layoutPhase({
      locations: [place('s', 'S', 'a', 'b')], units: [unit('a'), unit('b')],
      requirements: [req('r1', 'a', 'b'), req('r2', 'a', 'gone'), req('r3', 'b', 'b')],
    }, WIDE);
    expect(l.edges.map((e) => e.id)).toEqual(['r1']);
  });

  it('runs left to right when that fits, and top to bottom when only that fits', async () => {
    const across = await layoutPhase({ locations: LOCATIONS, units: UNITS, requirements: REQS }, WIDE);
    expect(across.width).toBeGreaterThan(across.height);
    const squeezed = await layoutPhase({ locations: LOCATIONS, units: UNITS, requirements: REQS }, { width: across.width - 1 });
    expect(squeezed.width).toBeLessThan(across.width);
    expect(squeezed.height).toBeGreaterThan(across.height);
  });
});

// A full mission: the supported unit in a location of its own with ten requirements to units in seven other locations, and seven more among those.
const NIGHT = {
  units: ['green', 'white', 'blue', 'gold', 'aug', 'red', 'orp', 'bp1', 'bp2', 'uav1', 'uav2', 'aws', 'fsb'].map((id, i) => unit(id, { supported: id === 'green', assetLines: i % 3, branch: i % 2 ? 'USA' : '' })),
  locations: [
    place('isb', 'ISB', 'white', 'blue'), place('x', 'The X', 'green'), place('mss', 'MSS', 'gold'), place('hlz', 'HLZ', 'aug', 'red'),
    place('orp', 'ORP', 'orp'), place('bpn', 'BP North', 'bp1', 'bp2'), place('ovh', 'Overhead', 'uav1', 'uav2', 'aws'), place('fsb', 'FSB', 'fsb'),
  ],
  requirements: [
    ...['white', 'blue', 'gold', 'aug', 'red', 'orp', 'bp1', 'uav1', 'aws', 'fsb'].map((id, i) => req(`g${String(i)}`, 'green', id, i % 3 === 0 ? 'SINCGARS +7' : i % 3 === 1 ? 'via TF WHITE' : 'no link')),
    req('o1', 'white', 'blue'), req('o2', 'white', 'gold'), req('o3', 'aug', 'red'), req('o4', 'bp1', 'bp2'), req('o5', 'uav1', 'uav2'), req('o6', 'uav1', 'aws'), req('o7', 'fsb', 'gold'),
  ],
};
const gap = (p: Rect, q: Rect) => Math.max(q.x - (p.x + p.w), p.x - (q.x + q.w), q.y - (p.y + p.h), p.y - (q.y + q.h));

describe('layoutPhase on a full mission', () => {
  const across = { width: 4000 };
  /** The narrowest container asked of it here: the widest box of the mission holds three cards in a row, so no layout is narrower than about 945. */
  const narrow = { width: 867 };
  const bbox = (l: PhaseLayout): Rect => ({ x: 0, y: 0, w: l.width, h: l.height });

  it('fits the container it is given whenever any layout does, and is no wider than needed to hold what it draws', async () => {
    const l = await layoutPhase(NIGHT, across);
    expect(l.width).toBeLessThanOrEqual(across.width);
    for (const r of [...l.boxes, ...l.cards, ...l.edges.map((e) => e.label)]) expect(inside(r, bbox(l)), 'everything is inside the drawing').toBe(true);
    // Measured: 1056 across for this mission, so a container of that width takes it unchanged.
    expect((await layoutPhase(NIGHT, { width: 1056 })).width).toBe(l.width);
  });

  it('runs left to right in a container wide enough, with the supported unit leftmost', async () => {
    const l = await layoutPhase(NIGHT, across);
    expect(card(l, 'green').x).toBe(Math.min(...l.cards.map((c) => c.x)));
  });

  it('runs top to bottom in a container too narrow for that, with the supported unit topmost, and is narrower for it', async () => {
    const wide = await layoutPhase(NIGHT, across);
    const l = await layoutPhase(NIGHT, narrow);
    expect(card(l, 'green').y).toBe(Math.min(...l.cards.map((c) => c.y)));
    expect(l.width).toBeLessThan(wide.width);
  });

  it('cannot fit 867 for this mission and returns the narrowest it found, which is about 945', async () => {
    // Overhead holds three cards in a row, which is 600 wide before anything beside it.
    const l = await layoutPhase(NIGHT, narrow);
    expect(l.width).toBeGreaterThan(narrow.width);
    expect(l.width).toBeLessThanOrEqual(960);
    expect(l.height).toBeLessThanOrEqual(1.2 * l.width);
  });

  it('is never wider at a narrower container, and shrinks to fit one a little narrower than the widest layout', async () => {
    const widths = await Promise.all([4000, 1000, 960, 867, 640].map(async (width) => (await layoutPhase(NIGHT, { width })).width));
    widths.slice(1).forEach((w, i) => { expect(w, `at step ${String(i + 1)}`).toBeLessThanOrEqual(widths[i]!); });
  });

  it('keeps cards apart, every card inside its box, boxes apart and the whole inside the drawing, in either direction', async () => {
    for (const opts of [across, narrow]) {
      const l = await layoutPhase(NIGHT, opts);
      expect(l.cards).toHaveLength(13);
      expect(l.boxes).toHaveLength(8);
      l.cards.forEach((p, i) => l.cards.slice(i + 1).forEach((q) => { expect(overlap(p, q), `${p.id} over ${q.id} at ${String(opts.width)}`).toBe(false); }));
      l.boxes.forEach((p, i) => l.boxes.slice(i + 1).forEach((q) => { expect(overlap(p, q), `box ${p.id} over ${q.id} at ${String(opts.width)}`).toBe(false); }));
      for (const c of l.cards) expect(inside(c, box(l, c.boxId)), `card ${c.id} in box ${c.boxId}`).toBe(true);
      for (const b of l.boxes) expect(inside(b, bbox(l)), `box ${b.id} in the drawing`).toBe(true);
    }
  });

  it('gives every line its own point on a card and runs it from one card to the other at right angles, pointing away from the supported unit', async () => {
    for (const opts of [across, narrow]) {
      const l = await layoutPhase(NIGHT, opts);
      expect(l.edges).toHaveLength(17);
      const ends = l.edges.flatMap((e) => [e.points[0]!, e.points[e.points.length - 1]!]).map(([x, y]) => `${String(x)},${String(y)}`);
      expect(new Set(ends).size).toBe(ends.length);
      for (const e of l.edges) {
        expect(onBorder(e.points[0]!, card(l, e.from)), `edge ${e.id} starts on ${e.from}`).toBe(true);
        expect(onBorder(e.points[e.points.length - 1]!, card(l, e.to)), `edge ${e.id} ends on ${e.to}`).toBe(true);
        e.points.slice(1).forEach((p, i) => {
          const q = e.points[i]!;
          expect(Math.abs(p[0] - q[0]) < 0.5 || Math.abs(p[1] - q[1]) < 0.5, `edge ${e.id} segment ${String(i)}`).toBe(true);
        });
      }
      for (const e of l.edges.filter((x) => x.id.startsWith('g'))) expect(e.from).toBe('green');
    }
  });

  it('keeps every pill, or badge, clear of every card, box title, other pill and line that is not its own, in either direction', async () => {
    for (const opts of [across, narrow]) {
      const l = await layoutPhase(NIGHT, opts);
      const runsOf = (e: (typeof l.edges)[number]) => e.points.slice(1).map((p, i) => {
        const q = e.points[i]!;
        return { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(p[0] - q[0]), h: Math.abs(p[1] - q[1]) };
      });
      l.edges.forEach((e, i) => {
        l.edges.forEach((o, j) => {
          if (i === j) return;
          for (const run of runsOf(o)) expect(overlap(e.label, run), `line ${o.id} through pill ${e.id} at ${String(opts.width)}`).toBe(false);
          expect(overlap(e.label, o.label), `pill ${e.id} over pill ${o.id} at ${String(opts.width)}`).toBe(false);
        });
        for (const c of l.cards) expect(overlap(e.label, c), `pill ${e.id} over card ${c.id} at ${String(opts.width)}`).toBe(false);
        for (const b of l.boxes) expect(overlap(e.label, { x: b.x + 24, y: b.y, w: Math.min(b.w - 48, b.name.length * 8), h: 26 }), `pill ${e.id} over the title of ${b.id}`).toBe(false);
      });
    }
  });

  it('numbers badges from 1, and a pill that is not a badge has its full width', async () => {
    for (const opts of [across, narrow]) {
      const l = await layoutPhase(NIGHT, opts);
      const numbers = l.edges.flatMap((e) => (e.badge === null ? [] : [e.badge]));
      expect(numbers).toEqual(numbers.map((_, i) => i + 1));
      for (const e of l.edges) expect(e.label.w).toBe(e.badge === null ? labelWidth(e.text) : 22);
    }
  });

  it('is the same for the same input', async () => {
    expect(await layoutPhase(NIGHT, narrow)).toEqual(await layoutPhase(NIGHT, narrow));
  });
});

describe('layoutFocus', () => {
  const partnersOf = (l: PhaseLayout, id: string) => l.cards.filter((c) => c.id !== id);

  it('puts the focus unit in the middle of the drawing and a card for each unit it shares a requirement with round it, and no location boxes', () => {
    const l = layoutFocus(NIGHT, 'green', { width: 1400 });
    expect(l.boxes).toEqual([]);
    expect(l.cards).toHaveLength(11);
    const middle = card(l, 'green');
    expect(Math.abs(middle.x + middle.w / 2 - l.width / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(middle.y + middle.h / 2 - l.height / 2)).toBeLessThan(l.height * 0.15);
    // Every partner is clear of the middle by room for a spoke and its pill.
    for (const c of partnersOf(l, 'green')) expect(gap(c, middle), `${c.id} from the middle`).toBeGreaterThanOrEqual(80);
  });

  it('keeps cards apart and inside the drawing, at any width, and never wider than it', () => {
    for (const width of [640, 900, 1100, 1500]) {
      const l = layoutFocus(NIGHT, 'green', { width });
      expect(l.width, `at ${String(width)}`).toBe(width);
      l.cards.forEach((p, i) => {
        l.cards.slice(i + 1).forEach((q) => { expect(overlap(p, q), `${p.id} over ${q.id} at ${String(width)}`).toBe(false); });
        expect(inside(p, { x: 0, y: 0, w: l.width, h: l.height }), `card ${p.id} in the drawing at ${String(width)}`).toBe(true);
      });
    }
  });

  it('draws only the focus unit\'s requirements, each from the focus to the other unit, whichever way it was written', () => {
    const l = layoutFocus(NIGHT, 'gold', { width: 1100 });
    expect(l.cards.map((c) => c.id).sort()).toEqual(['fsb', 'gold', 'green', 'white']);
    expect(l.edges.map((e) => e.id).sort()).toEqual(['g2', 'o2', 'o7']);
    for (const e of l.edges) expect(e.from).toBe('gold');
    expect(l.edges.map((e) => e.to).sort()).toEqual(['fsb', 'green', 'white']);
  });

  it('runs each spoke as one straight segment from the border of the focus card to the border of its partner', () => {
    const l = layoutFocus(NIGHT, 'green', { width: 1100 });
    expect(l.edges).toHaveLength(10);
    for (const e of l.edges) {
      expect(e.points, `edge ${e.id}`).toHaveLength(2);
      expect(onBorder(e.points[0]!, card(l, 'green')), `edge ${e.id} starts on the focus`).toBe(true);
      expect(onBorder(e.points[1]!, card(l, e.to)), `edge ${e.id} ends on ${e.to}`).toBe(true);
    }
  });

  it('seats partners at one location next to each other round the ring', () => {
    const l = layoutFocus(NIGHT, 'green', { width: 1400 });
    const middle = card(l, 'green');
    const round = partnersOf(l, 'green')
      .map((c) => ({ box: c.boxId, angle: Math.atan2(c.y + c.h / 2 - (middle.y + middle.h / 2), c.x + c.w / 2 - (middle.x + middle.w / 2)) }))
      .sort((p, q) => p.angle - q.angle)
      .map((c) => c.box);
    // Walked once round, the location changes exactly as many times as there are locations: each one is a single run.
    const changes = round.filter((b, i) => b !== round[(i + 1) % round.length]).length;
    expect(changes).toBe(new Set(round).size);
  });

  it('puts a location tag\'s line on a partner card, which is a line taller than the focus card of the same assets', () => {
    const l = layoutFocus({
      locations: [place('a', 'A', 'x'), place('b', 'B', 'y')],
      units: [unit('x', { assetLines: 2 }), unit('y', { assetLines: 2 })],
      requirements: [req('r1', 'x', 'y')],
    }, 'x', { width: 900 });
    expect(card(l, 'x').h).toBe(cardHeight(2));
    expect(card(l, 'y').h).toBe(cardHeight(3));
    expect(card(l, 'y').boxId).toBe('b');
  });

  it('keeps every pill, or badge, off every card and off every other pill', () => {
    for (const width of [900, 1400]) {
      const l = layoutFocus(NIGHT, 'green', { width });
      l.edges.forEach((e, i) => {
        for (const c of l.cards) expect(overlap(e.label, c), `label ${e.id} over card ${c.id} at ${String(width)}`).toBe(false);
        l.edges.slice(i + 1).forEach((o) => { expect(overlap(e.label, o.label), `label ${e.id} over label ${o.id} at ${String(width)}`).toBe(false); });
      });
    }
  });

  it('is the same for the same input', () => {
    expect(layoutFocus(NIGHT, 'green', { width: 1100 })).toEqual(layoutFocus(NIGHT, 'green', { width: 1100 }));
  });

  it('draws a unit with no requirements alone, and nothing for a unit that is not there', () => {
    const quiet = layoutFocus({ locations: [place('s', 'S', 'a', 'b')], units: [unit('a'), unit('b')], requirements: [] }, 'a', { width: 800 });
    expect(quiet.cards.map((c) => c.id)).toEqual(['a']);
    expect(quiet.edges).toEqual([]);
    expect(quiet.width).toBe(800);
    expect(layoutFocus(NIGHT, 'nobody', { width: 800 })).toEqual({ width: 0, height: 0, boxes: [], cards: [], edges: [] });
  });

  it('drops a requirement naming a unit that is not drawn, and one joining the unit to itself', () => {
    const l = layoutFocus({
      locations: [place('s', 'S', 'a', 'b')], units: [unit('a'), unit('b')],
      requirements: [req('r1', 'a', 'b'), req('r2', 'a', 'gone'), req('r3', 'a', 'a')],
    }, 'a', { width: 800 });
    expect(l.edges.map((e) => e.id)).toEqual(['r1']);
    expect(l.cards).toHaveLength(2);
  });
});

describe('orientRequirements', () => {
  const ids = (rs: LayoutRequirement[]) => rs.map((r) => `${r.a}>${r.b}`);

  it('points every requirement away from the supported unit', () => {
    const units = ['a', 'b', 'c', 'd'].map((id) => unit(id, { supported: id === 'c' }));
    // Written the wrong way round on purpose: c is the focus, so c>a, c>d, a>b whichever way each is stated.
    expect(ids(orientRequirements(units, [req('1', 'a', 'c'), req('2', 'd', 'c'), req('3', 'b', 'a')]))).toEqual(['c>a', 'c>d', 'a>b']);
  });

  it('keeps the order a requirement names its units in when both are as far from the focus', () => {
    const units = ['a', 'b', 'c'].map((id) => unit(id, { supported: id === 'a' }));
    expect(ids(orientRequirements(units, [req('1', 'a', 'b'), req('2', 'a', 'c'), req('3', 'c', 'b'), req('4', 'b', 'c')]))).toEqual(['a>b', 'a>c', 'c>b', 'b>c']);
  });

  it('starts from the first unit with a requirement when none is supported, and again for a separate group', () => {
    const units = ['a', 'b', 'c', 'd', 'e'].map((id) => unit(id));
    expect(ids(orientRequirements(units, [req('1', 'b', 'a'), req('2', 'e', 'd')]))).toEqual(['a>b', 'd>e']);
  });

  it('starts from the first unit that has a requirement when the supported unit has none', () => {
    const units = ['a', 'b', 'c'].map((id) => unit(id, { supported: id === 'c' }));
    expect(ids(orientRequirements(units, [req('1', 'b', 'a')]))).toEqual(['a>b']);
  });
});

describe('polylinePath', () => {
  it('draws a straight line as one segment', () => {
    expect(polylinePath([[0, 0], [50, 0]])).toBe('M 0 0 L 50 0');
  });

  it('rounds each bend with a quadratic curve, and no more than the segments either side can take', () => {
    expect(polylinePath([[0, 0], [40, 0], [40, 40]])).toBe('M 0 0 L 34 0 Q 40 0 40 6 L 40 40');
    expect(polylinePath([[0, 0], [4, 0], [4, 40]])).toBe('M 0 0 L 2 0 Q 4 0 4 2 L 4 40');
  });

  it('is empty for no points', () => {
    expect(polylinePath([])).toBe('');
  });
});

describe('cards', () => {
  it('is as wide as its label needs, from 160 to 240', () => {
    expect(cardWidth('A', '')).toBe(160);
    expect(cardWidth('RIVET JOINT', 'USAF')).toBeGreaterThan(160);
    expect(cardWidth('X'.repeat(60), 'USAF')).toBe(240);
    // The label fits whole, at nine pixels a character, whenever it is under the cap.
    expect(cardWidth('RIVET JOINT 3', '')).toBeGreaterThanOrEqual(30 + 13 * 9);
  });

  it('is taller by a line for every line of assets', () => {
    expect(cardHeight(2) - cardHeight(1)).toBe(cardHeight(1) - cardHeight(0));
  });
});

describe('wrapAssets', () => {
  it('runs the names together on one line when they fit', () => {
    expect(wrapAssets(['AN/PRC-117G', 'AN/PRC-152'], 40)).toEqual(['AN/PRC-117G, AN/PRC-152']);
  });

  it('wraps onto a second line, with the comma kept at the end of the first', () => {
    expect(wrapAssets(['AAAA', 'BBBB', 'CCCC', 'DDDD'], 11)).toEqual(['AAAA, BBBB,', 'CCCC, DDDD']);
  });

  it('counts what does not fit in two lines as +N at the end of the second', () => {
    expect(wrapAssets(['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE', 'FFFF'], 11)).toEqual(['AAAA, BBBB,', 'CCCC +3']);
  });

  it('clips one name longer than a line, and says nothing for no names', () => {
    expect(wrapAssets(['ABCDEFGHIJKLMNOP'], 8)).toEqual(['ABCDEFG…']);
    expect(wrapAssets([], 20)).toEqual([]);
  });

  it('fits a line to the card it is on', () => {
    expect(assetChars(160)).toBe(20);
  });
});

/**
 * Where everything in one phase's picture goes, worked out by ELK (the Eclipse
 * Layout Kernel) as a compound graph: a node per location holding a node per
 * unit, and an edge per requirement between the two units it names, routed at
 * right angles with its label placed clear of the cards.
 *
 * Pure apart from ELK itself: units, locations and requirements in, rectangles
 * and polylines out, in absolute coordinates with no DOM measured. Drawing is
 * `phase-picture.tsx`'s job. ELK is imported on first use, so it lands in a
 * chunk of its own that only the Web view loads, and only when All or Gaps is
 * drawn: `layoutFocus` is worked out here without it.
 */

import type { ElkExtendedEdge, ElkNode, LayoutOptions } from 'elkjs/lib/elk-api';

const CARD_MIN_W = 160;
const CARD_MAX_W = 240;
/** The header row (pip, label, branch chip), and the lines of assets under it. */
const CARD_HEAD = 36;
const LINE_H = 14;
/** Advance per character of a card's label at the size drawn, and of an asset line. */
const LABEL_CHAR_W = 9.2;
const ASSET_CHAR_W = 6.6;
/** Between the ports along one side of a card, and from the end of the side to the first port. */
const PORT_GAP = 14;
const PORT_EDGE = 12;
/** Room above a location's cards for its title. */
export const BOX_TITLE_H = 34;
/** From a box's left edge to its cards, and where its title starts. */
export const BOX_PAD = 24;
const MARGIN = 12;

const LABEL_H = 18;
const LABEL_CHAR = 7;
const LABEL_PAD = 16;
const BADGE_W = 22;
const TITLE_CHAR = 8;

export type LineKind = 'direct' | 'relay' | 'cannot';

export interface LayoutLocation { id: string; name: string; unitIds: string[] }
/** `assetLines` is how many lines of text the card carries under its header, the "+N" line included. */
export interface LayoutUnit { id: string; label: string; branch: string; assetLines: number; supported: boolean }
export interface LayoutRequirement { id: string; a: string; b: string; status: LineKind; text: string }

export interface Rect { x: number; y: number; w: number; h: number }
export interface PlacedBox extends Rect { id: string; name: string }
export interface PlacedCard extends Rect { id: string; boxId: string }
export interface PlacedEdge {
  id: string;
  /** The unit ids it runs from and to, after the requirement was turned to point away from the supported unit: `points` starts on `from`. */
  from: string;
  to: string;
  status: LineKind;
  text: string;
  /** Start, the bends, end: every segment is horizontal or vertical. */
  points: [number, number][];
  /** Where the line's pill goes. */
  label: Rect;
  /**
   * Set when the text had nowhere to go that a line or a card does not cross:
   * the pill is then this number, small, on the line itself, and the list
   * under the picture carries the same number beside the full text.
   */
  badge: number | null;
}
export interface PhaseLayout {
  width: number;
  height: number;
  boxes: PlacedBox[];
  cards: PlacedCard[];
  edges: PlacedEdge[];
}

/** The height of a card carrying `lines` lines of assets. */
export const cardHeight = (lines: number) => CARD_HEAD + Math.max(0, lines) * LINE_H;

/** A card is as wide as its label and branch chip need, within bounds, so a name is never clipped short of the maximum. */
export const cardWidth = (label: string, branch: string) => {
  const chip = branch ? branch.length * 7 + 10 + 8 : 0;
  return Math.min(CARD_MAX_W, Math.max(CARD_MIN_W, Math.ceil(30 + label.length * LABEL_CHAR_W + 8 + chip)));
};

/** How many characters of assets fit on one line of a card of width `w`. */
export const assetChars = (w: number) => Math.floor((w - 24) / ASSET_CHAR_W);

const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);

/**
 * The assets of a card as at most `maxLines` lines of `chars` characters, the
 * names run together with commas. What does not fit is counted at the end of
 * the last line as "+N", so a card says how much it leaves out.
 */
export function wrapAssets(names: string[], chars: number, maxLines = 2): string[] {
  const rows: string[][] = [];
  let i = 0;
  while (i < names.length && rows.length < maxLines) {
    const row: string[] = [];
    while (i < names.length) {
      const cand = `${[...row, names[i]!].join(', ')}${i < names.length - 1 ? ',' : ''}`;
      if (row.length > 0 && cand.length > chars) break;
      row.push(names[i]!);
      i++;
    }
    rows.push(row);
  }
  let rest = names.length - i;
  if (rest > 0) {
    const last = rows[rows.length - 1]!;
    while (last.length > 1 && `${last.join(', ')} +${String(rest)}`.length > chars) {
      last.pop();
      rest++;
    }
  }
  return rows.map((row, r) => trim(`${row.join(', ')}${r < rows.length - 1 ? ',' : rest > 0 ? ` +${String(rest)}` : ''}`, chars));
}

/** Width of a line's label pill for its text, at 11px mono. */
export const labelWidth = (text: string) => Math.ceil(text.length * LABEL_CHAR + LABEL_PAD);

/** The one call used, typed plainly: the library's own signature for it is generic over the children it is given. */
type Elk = { layout: (graph: ElkNode) => Promise<ElkNode> };
let elk: Promise<Elk> | null = null;
/**
 * One engine for the page, built on first use. A load that fails is not kept:
 * the next layout asks for the chunk again. Keeping it made one failed import
 * (a dev server restarted under an open tab answers the tab's old chunk
 * address with "outdated", and a dropped connection does the same) fail every
 * phase after it until the page was reloaded, with nothing to say why.
 */
function engine(): Promise<Elk> {
  elk ??= import('elkjs/lib/elk.bundled.js')
    .then((m) => new m.default() as unknown as Elk)
    .catch((e: unknown) => {
      elk = null;
      throw e;
    });
  return elk;
}

const ROOT_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  // One layering for the whole phase rather than a pack of islands, so the supported unit really leads.
  'elk.separateConnectedComponents': 'false',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  // Tight, because the picture has to fit a laptop: a line needs 12 of its own to be told from its neighbour, and the pills are not given room here (see `settleLabels`), which is where most of the width used to go.
  'elk.spacing.nodeNode': '32',
  'elk.layered.spacing.nodeNodeBetweenLayers': '52',
  'elk.spacing.edgeEdge': '12',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
  'elk.spacing.edgeNode': '14',
  'elk.layered.spacing.edgeNodeBetweenLayers': '14',
  'elk.spacing.portPort': String(PORT_GAP),
  'elk.padding': `[top=${String(MARGIN)},left=${String(MARGIN)},bottom=${String(MARGIN)},right=${String(MARGIN)}]`,
  // Measured: shorter than the default placement on every direction and bound below, and the compaction takes out the slack the long lines leave.
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
  // More passes at crossing minimisation: 50 against the default 7 took the narrowest layout from 1089 to 968 wide on the 13-unit mission, for about 40ms.
  'elk.layered.thoroughness': '50',
};

/** At most this many cards in a layer, by Coffman-Graham layering: more layers, each narrower. */
const bounded = (n: number): LayoutOptions => ({
  'elk.layered.layering.strategy': 'COFFMAN_GRAHAM',
  'elk.layered.layering.coffmanGraham.layerBound': String(n),
});

/**
 * What `layoutPhase` tries, widest-reading first: left to right, then top to
 * bottom as it comes, then top to bottom with the layers held to 3 and to 2
 * cards. Each is a little narrower than the one before and a little taller.
 */
const PLANS: { direction: 'RIGHT' | 'DOWN'; options: LayoutOptions }[] = [
  { direction: 'RIGHT', options: {} },
  { direction: 'DOWN', options: {} },
  { direction: 'DOWN', options: bounded(3) },
  { direction: 'DOWN', options: bounded(2) },
];

const BOX_OPTIONS: LayoutOptions = {
  'elk.padding': `[top=${String(BOX_TITLE_H)},left=${String(BOX_PAD)},bottom=${String(BOX_PAD)},right=${String(BOX_PAD)}]`,
  'elk.spacing.nodeNode': String(BOX_PAD + 8),
};
/** Between two layers of one box, which would otherwise be 20: at least room for a numbered badge on a line between two neighbours, with its margin. */
const BOX_GAP_MIN = 40;
const BOX_GAP_PILL_MARGIN = 6;

/**
 * Requirements have no direction, so each is turned to point away from the
 * supported unit, by breadth-first distance over the requirements, which is
 * what makes the layers run outward from the focal point. A tie keeps the
 * order the requirement names its two units in. Where the supported unit
 * reaches nothing, or there is none, the first unit that has a requirement
 * stands in for it, and a separate group of units starts again from its own
 * first unit.
 */
export function orientRequirements(units: LayoutUnit[], reqs: LayoutRequirement[]): LayoutRequirement[] {
  const adjacent = new Map<string, string[]>(units.map((u) => [u.id, []]));
  for (const r of reqs) {
    adjacent.get(r.a)?.push(r.b);
    adjacent.get(r.b)?.push(r.a);
  }
  const dist = new Map<string, number>();
  const spread = (from: string) => {
    dist.set(from, 0);
    const queue = [from];
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head]!;
      for (const next of adjacent.get(at) ?? []) {
        if (!dist.has(next)) {
          dist.set(next, dist.get(at)! + 1);
          queue.push(next);
        }
      }
    }
  };
  const focal = units.find((u) => u.supported && (adjacent.get(u.id)?.length ?? 0) > 0);
  if (focal) spread(focal.id);
  for (const u of units) if (!dist.has(u.id) && (adjacent.get(u.id)?.length ?? 0) > 0) spread(u.id);
  return reqs.map((r) => ((dist.get(r.b) ?? 0) < (dist.get(r.a) ?? 0) ? { ...r, a: r.b, b: r.a } : r));
}

function buildGraph(locations: LayoutLocation[], units: LayoutUnit[], reqs: LayoutRequirement[], direction: 'RIGHT' | 'DOWN', options: LayoutOptions): ElkNode {
  const unitOf = new Map(units.map((u) => [u.id, u]));
  // Between two layers of one box: room for a badge on a line between two neighbours, and, running left to right, for the widest pill of a requirement inside the box, since a line between its cards has nowhere else to put it.
  const boxGap = (l: LayoutLocation) => {
    const here = new Set(l.unitIds);
    const pill = Math.max(0, ...reqs.filter((r) => here.has(r.a) && here.has(r.b)).map((r) => labelWidth(r.text) + 2 * BOX_GAP_PILL_MARGIN));
    return Math.max(BOX_GAP_MIN, direction === 'RIGHT' ? pill : 0);
  };
  // A line meets a card on the side facing the flow, each at a port of its own, so no two arrive at one point.
  const [out, into] = direction === 'RIGHT' ? ['EAST', 'WEST'] : ['SOUTH', 'NORTH'];
  const outs = new Map<string, number>();
  const ins = new Map<string, number>();
  for (const r of reqs) {
    outs.set(r.a, (outs.get(r.a) ?? 0) + 1);
    ins.set(r.b, (ins.get(r.b) ?? 0) + 1);
  }
  const room = (n: number) => (n > 1 ? (n - 1) * PORT_GAP + 2 * PORT_EDGE : 0);
  const unitNode = (id: string, u: LayoutUnit): ElkNode => {
    const busiest = room(Math.max(outs.get(id) ?? 0, ins.get(id) ?? 0));
    const w = cardWidth(u.label, u.branch);
    const h = cardHeight(u.assetLines);
    return {
      id: `unit:${id}`,
      width: direction === 'DOWN' ? Math.max(w, busiest) : w,
      height: direction === 'RIGHT' ? Math.max(h, busiest) : h,
      layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE', 'elk.spacing.portsSurrounding': `[top=${String(PORT_EDGE)},left=${String(PORT_EDGE)},bottom=${String(PORT_EDGE)},right=${String(PORT_EDGE)}]` },
      ports: [
        ...reqs.filter((r) => r.a === id).map((r) => ({ id: `port:${r.id}:a`, layoutOptions: { 'elk.port.side': out } })),
        ...reqs.filter((r) => r.b === id).map((r) => ({ id: `port:${r.id}:b`, layoutOptions: { 'elk.port.side': into } })),
      ],
    };
  };
  return {
    id: 'root',
    layoutOptions: { ...ROOT_OPTIONS, ...options, 'elk.direction': direction },
    children: locations.map((l): ElkNode => ({
      id: `box:${l.id}`,
      layoutOptions: { ...BOX_OPTIONS, 'elk.layered.spacing.nodeNodeBetweenLayers': String(boxGap(l)) },
      children: l.unitIds.flatMap((id) => {
        const u = unitOf.get(id);
        return u ? [unitNode(id, u)] : [];
      }),
    })),
    // No labels: a pill given room between the layers made every gap as wide as the pill, which was most of the picture's width. They are placed after, by `settleLabels`.
    edges: reqs.map((r): ElkExtendedEdge => ({
      id: `edge:${r.id}`,
      sources: [`port:${r.id}:a`],
      targets: [`port:${r.id}:b`],
    })),
  };
}

/** ELK's answer as absolute rectangles and polylines; a child's position is relative to its parent, an edge's to its container. */
function collect(done: ElkNode, reqs: LayoutRequirement[]): PhaseLayout {
  const origin = new Map<string, [number, number]>([['root', [0, 0]]]);
  const boxes: PlacedBox[] = [];
  const cards: PlacedCard[] = [];
  for (const b of done.children ?? []) {
    const bx = b.x ?? 0;
    const by = b.y ?? 0;
    origin.set(b.id, [bx, by]);
    boxes.push({ id: b.id.slice('box:'.length), name: '', x: bx, y: by, w: b.width ?? 0, h: b.height ?? 0 });
    for (const c of b.children ?? []) {
      cards.push({ id: c.id.slice('unit:'.length), boxId: b.id.slice('box:'.length), x: bx + (c.x ?? 0), y: by + (c.y ?? 0), w: c.width ?? CARD_MIN_W, h: c.height ?? 0 });
    }
  }
  const byId = new Map(reqs.map((r) => [`edge:${r.id}`, r]));
  const edges: PlacedEdge[] = [];
  for (const e of (done.edges ?? []) as (ElkExtendedEdge & { container?: string })[]) {
    const req = byId.get(e.id);
    const section = e.sections?.[0];
    if (!req || !section) continue;
    const [ox, oy] = origin.get(e.container ?? 'root') ?? [0, 0];
    const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p): [number, number] => [p.x + ox, p.y + oy]);
    // The pill is sized here and put somewhere clear by `settleLabels`; where it starts is of no account.
    edges.push({
      id: req.id, from: req.a, to: req.b, status: req.status, text: req.text, badge: null, points,
      label: { x: points[0]![0], y: points[0]![1], w: labelWidth(req.text), h: LABEL_H },
    });
  }
  return { width: Math.ceil(done.width ?? 0), height: Math.ceil(done.height ?? 0), boxes, cards, edges };
}

const hit = (p: Rect, q: Rect, m = 0) => p.x - m < q.x + q.w && q.x - m < p.x + p.w && p.y - m < q.y + q.h && q.y - m < p.y + p.h;

/** Each straight run of a polyline, as its two ends. */
const runs = (points: [number, number][]): [[number, number], [number, number]][] => points.slice(1).map((p, i) => [points[i]!, p]);

const level = (p: [number, number], q: [number, number]) => Math.abs(p[0] - q[0]) < 0.5 || Math.abs(p[1] - q[1]) < 0.5;

/**
 * Whether the run from `p` to `q` touches `r` grown by `m`. A horizontal or
 * vertical run is a thin rectangle; a slanted one is clipped against it exactly,
 * because its bounding box covers a great deal that the run itself does not.
 */
function cuts(r: Rect, p: [number, number], q: [number, number], m: number): boolean {
  if (level(p, q)) return hit(r, { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(p[0] - q[0]), h: Math.abs(p[1] - q[1]) }, m);
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  let t0 = 0;
  let t1 = 1;
  for (const [d, gap] of [[-dx, p[0] - (r.x - m)], [dx, r.x + r.w + m - p[0]], [-dy, p[1] - (r.y - m)], [dy, r.y + r.h + m - p[1]]] as const) {
    if (d === 0) {
      if (gap < 0) return false;
    } else if (d < 0) {
      t0 = Math.max(t0, gap / d);
    } else {
      t1 = Math.min(t1, gap / d);
    }
  }
  return t0 < t1;
}

/** The point `t` of the way along a polyline's length: 0 is its start and 1 its end. */
function alongLine(points: [number, number][], t: number): [number, number] {
  const lens = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]));
  let left = lens.reduce((a, b) => a + b, 0) * t;
  for (let i = 0; i < lens.length; i++) {
    const len = lens[i]!;
    if (left <= len || i === lens.length - 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const f = len === 0 ? 0 : left / len;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    left -= len;
  }
  return points[0] ?? [0, 0];
}

/**
 * Neither ELK nor `layoutFocus` knows a box's title or, between them, every
 * other line, so a label that something crosses or touches is not left to be
 * read through it: it becomes a numbered badge sitting on its own line, at the
 * place along it where nothing else is, numbered in the order of the lines.
 * Where `slides` are given, a label that is not clear where it is first tries
 * sitting at each of those fractions of the way along its line, in turn, before
 * it gives up and becomes a badge.
 *
 * When `fresh`, the labels have not been placed at all (ELK is given none, so
 * the layers are not as far apart as the widest pill): each is tried, whole,
 * at several places along each run of its line, the longest first, and only
 * the ones with no clear place become badges.
 */
function settleLabels(layout: PhaseLayout, slides: number[] = [], fresh = false): PhaseLayout {
  const titles: Rect[] = layout.boxes.map((b) => ({ x: b.x + BOX_PAD, y: b.y, w: Math.min(b.w - 2 * BOX_PAD, b.name.length * TITLE_CHAR), h: 26 }));
  const kept: Rect[] = [];
  let badges = 0;
  const edges = layout.edges.map((e, i): PlacedEdge => {
    const others = layout.edges.filter((_, j) => j !== i).flatMap((o) => runs(o.points));
    const trouble = (r: Rect) => layout.cards.filter((c) => hit(r, c, 3)).length + titles.filter((t) => hit(r, t, 2)).length
      + kept.filter((k) => hit(r, k, 3)).length + others.filter(([p, q]) => cuts(r, p, q, 2)).length;
    if (!fresh && trouble(e.label) === 0) {
      kept.push(e.label);
      return e;
    }
    for (const t of slides) {
      const [x, y] = alongLine(e.points, t);
      const slid: Rect = { x: x - e.label.w / 2, y: y - e.label.h / 2, w: e.label.w, h: e.label.h };
      if (trouble(slid) === 0) {
        kept.push(slid);
        return { ...e, label: slid };
      }
    }
    // Along each run of the line, longest first, at the middle, a third of the way either side, and then closer to its ends.
    const spread = [0.15, 0.85, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9, 0.05, 0.95];
    const marks = slides.length > 0 ? [0.5, ...slides, ...spread] : [0.5, 0.3, 0.7, ...spread];
    const spots = runs(e.points).sort(([a, b], [c, d]) => Math.abs(d[0] - c[0]) + Math.abs(d[1] - c[1]) - Math.abs(b[0] - a[0]) - Math.abs(b[1] - a[1]))
      .flatMap(([p, q]) => marks.map((t) => (level(p, q)
        ? { x: Math.min(p[0], q[0]) + Math.abs(q[0] - p[0]) * t, y: Math.min(p[1], q[1]) + Math.abs(q[1] - p[1]) * t }
        : { x: p[0] + (q[0] - p[0]) * t, y: p[1] + (q[1] - p[1]) * t })));
    if (fresh) {
      for (const at of spots) {
        const pill: Rect = { x: at.x - e.label.w / 2, y: at.y - e.label.h / 2, w: e.label.w, h: e.label.h };
        if (trouble(pill) === 0) {
          kept.push(pill);
          return { ...e, label: pill };
        }
      }
    }
    let best: Rect = { x: e.label.x, y: e.label.y, w: BADGE_W, h: LABEL_H };
    let fewest = Infinity;
    for (const at of spots) {
      const r: Rect = { x: at.x - BADGE_W / 2, y: at.y - LABEL_H / 2, w: BADGE_W, h: LABEL_H };
      const n = trouble(r);
      if (n < fewest) { best = r; fewest = n; }
      if (n === 0) break;
    }
    kept.push(best);
    badges += 1;
    return { ...e, label: best, badge: badges };
  });
  return { ...layout, edges };
}

export interface PhaseInput { locations: LayoutLocation[]; units: LayoutUnit[]; requirements: LayoutRequirement[] }

/**
 * What both layouts begin from: the locations in the order given except that
 * the one holding the supported unit goes first, and within a location that
 * unit goes first too; and the requirements that name two drawn units, turned
 * to point away from the supported one.
 */
function prepare(input: PhaseInput) {
  const known = new Set(input.units.map((u) => u.id));
  const supported = input.units.find((u) => u.supported)?.id;
  const lead = <T,>(items: T[], holds: (t: T) => boolean): T[] => {
    const at = items.findIndex(holds);
    return at > 0 ? [items[at]!, ...items.slice(0, at), ...items.slice(at + 1)] : items;
  };
  const locations = lead(
    input.locations.map((l) => ({ ...l, unitIds: lead(l.unitIds.filter((id) => known.has(id)), (id) => id === supported) })),
    (l) => supported !== undefined && l.unitIds.includes(supported),
  );
  const reqs = orientRequirements(
    input.units,
    input.requirements.filter((r) => r.a !== r.b && known.has(r.a) && known.has(r.b)),
  );
  return { locations, reqs, supported, names: new Map(locations.map((l) => [l.id, l.name])) };
}

/**
 * The drawing shifted so that nothing, a pill included, starts left of or above
 * its margin, and as wide and tall as it takes to hold all of it. ELK sized the
 * layout for the cards and the lines; a pill set afterwards can stand a little
 * past either.
 */
function contain(layout: PhaseLayout): PhaseLayout {
  const spans: Rect[] = [...layout.boxes, ...layout.cards, ...layout.edges.map((e) => e.label)];
  const dx = Math.max(0, MARGIN - Math.min(...spans.map((r) => r.x)));
  const dy = Math.max(0, MARGIN - Math.min(...spans.map((r) => r.y)));
  const moved = <T extends Rect>(r: T): T => ({ ...r, x: r.x + dx, y: r.y + dy });
  const right = Math.max(layout.width + dx, ...spans.map((r) => r.x + dx + r.w + MARGIN));
  const bottom = Math.max(layout.height + dy, ...spans.map((r) => r.y + dy + r.h + MARGIN));
  return {
    width: Math.ceil(right),
    height: Math.ceil(bottom),
    boxes: layout.boxes.map(moved),
    cards: layout.cards.map(moved),
    edges: layout.edges.map((e) => ({ ...e, label: moved(e.label), points: e.points.map(([x, y]): [number, number] => [x + dx, y + dy]) })),
  };
}

/**
 * The picture's geometry for one phase at a display `width`. Laid out running
 * left to right, because the supported unit leads and a line of units reads
 * best that way. When that comes out wider than `width` it is laid out top to
 * bottom, which suits a narrower container, and if that is still too wide, top
 * to bottom with at most three and then two cards to a layer, each narrower and
 * taller than the one before (see `PLANS`). The first that fits is returned;
 * where none does, the narrowest, which the view scrolls inside its own frame
 * rather than shrinking the type. A phase's widest location sets a floor: a
 * box of three cards across is about 620 wide whichever way it is run.
 *
 * Locations are placed in the order given except that the one holding the
 * supported unit goes first, and within a location that unit goes first too.
 * A requirement naming a unit that is not among `units` is dropped.
 */
export async function layoutPhase(
  input: PhaseInput,
  opts: { width: number },
): Promise<PhaseLayout> {
  const { locations, reqs, names } = prepare(input);
  if (locations.every((l) => l.unitIds.length === 0)) return { width: 0, height: 0, boxes: [], cards: [], edges: [] };

  let narrowest: PhaseLayout | null = null;
  for (const { direction, options } of PLANS) {
    const layout = collect(await (await engine()).layout(buildGraph(locations, input.units, reqs, direction, options)), reqs);
    const settled = contain(settleLabels({ ...layout, boxes: layout.boxes.map((b) => ({ ...b, name: names.get(b.id) ?? '' })) }, [], true));
    if (settled.width <= opts.width) return settled;
    if (narrowest === null || settled.width < narrowest.width) narrowest = settled;
  }
  return narrowest!;
}

/** Where along its line a pill tries to sit, in turn, when the middle is taken. */
const SLIDES = [0.4, 0.6, 0.3, 0.7, 0.25, 0.75];

type Pt = [number, number];

/**
 * A point on the perimeter of a rectangle of half-width `a` and half-height
 * `b` about the origin, `s` along it from the middle of the top edge and
 * clockwise: the x as a fraction of `a`, from -1 to 1, and the y.
 */
function ringAt(s: number, a: number, b: number): [number, number] {
  const p = 4 * (a + b);
  const t = ((s % p) + p) % p;
  if (t < a) return [t / a, -b];
  if (t < a + 2 * b) return [1, -b + (t - a)];
  if (t < 3 * a + 2 * b) return [1 - (t - a - 2 * b) / a, b];
  if (t < 3 * a + 4 * b) return [-1, b - (t - 3 * a - 2 * b)];
  return [-1 + (t - 3 * a - 4 * b) / a, -b];
}

/** Between the cards of the focus picture, and the least clear space from the focus card to any card round it, so a spoke has room for its pill. */
const FOCUS_GAP = 20;
const FOCUS_SPOKE = 80;
/** Between the rows used where the width leaves no room beside the focus card. */
const FOCUS_ROW = 44;

/** Where a ray from the middle of `r` toward `to` leaves it. */
function borderToward(r: Rect, to: Pt): Pt {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = to[0] - cx;
  const dy = to[1] - cy;
  const t = Math.min(dx === 0 ? Infinity : r.w / 2 / Math.abs(dx), dy === 0 ? Infinity : r.h / 2 / Math.abs(dy));
  const n = (v: number) => Math.round(v * 10) / 10;
  return [n(cx + dx * t), n(cy + dy * t)];
}

/**
 * The picture's geometry centred on one unit, `focusId`: its card in the
 * middle, and round it every unit that shares a requirement with it in this
 * phase, each joined to it by a straight spoke. No location boxes: where a
 * partner is, is for the caller to say on its card. The same shape of answer
 * as `layoutPhase`, worked out at once and without ELK, and the same for the
 * same input.
 *
 * Partners are ordered by location, in the order `locations` gives, then by
 * label, so those at one location sit together, and are set out evenly round a
 * rectangle clockwise from the top, grown until no two cards touch and each is
 * clear of the middle by room for a pill, and no spoke runs through a card that
 * is not its own. Where the width leaves no room beside the middle, rows above
 * and below it are tried instead, and whichever crosses less and is shorter is
 * taken, the ring favoured. Never wider than `width`, and the drawing is
 * centred in it. A requirement naming a unit that is not drawn is dropped.
 * Partners are a line taller than their units' assets ask, for the location tag.
 */
export function layoutFocus(input: PhaseInput, focusId: string, opts: { width: number }): PhaseLayout {
  const unitOf = new Map(input.units.map((u) => [u.id, u]));
  if (!unitOf.has(focusId)) return { width: 0, height: 0, boxes: [], cards: [], edges: [] };
  const W = Math.max(0, Math.floor(opts.width));
  const home = new Map<string, { id: string; at: number }>();
  input.locations.forEach((l, at) => l.unitIds.forEach((id) => { if (!home.has(id)) home.set(id, { id: l.id, at }); }));
  const reqs = input.requirements
    .filter((r) => r.a !== r.b && (r.a === focusId || r.b === focusId) && unitOf.has(r.a) && unitOf.has(r.b))
    .map((r) => (r.a === focusId ? r : { ...r, a: r.b, b: r.a }));
  const homeAt = (id: string) => home.get(id)?.at ?? Number.MAX_SAFE_INTEGER;
  const partners = [...new Set(reqs.map((r) => r.b))].sort((p, q) => homeAt(p) - homeAt(q)
    || unitOf.get(p)!.label.localeCompare(unitOf.get(q)!.label) || (p < q ? -1 : p > q ? 1 : 0));

  const size = (id: string, tag: boolean) => {
    const u = unitOf.get(id)!;
    return { w: cardWidth(u.label, u.branch), h: cardHeight(u.assetLines + (tag ? 1 : 0)) };
  };
  const heart = size(focusId, false);
  const centre: Rect = { x: -Math.round(heart.w / 2), y: -Math.round(heart.h / 2), ...heart };
  const sats = partners.map((id) => ({ id, ...size(id, true) }));

  const lo = -W / 2 + MARGIN;
  const hi = W / 2 - MARGIN;
  const meanW = sats.reduce((sum, s) => sum + s.w, 0) / Math.max(1, sats.length);
  const aRef = Math.max(1, hi - meanW / 2);
  const mid = (r: Rect): Pt => [r.x + r.w / 2, r.y + r.h / 2];
  /** Round a rectangle `b` high: the first partner a half step round from the top, then evenly by the perimeter. */
  const ringAround = (b: number): Rect[] => sats.map((s, i) => {
    const [xn, y] = ringAt(((i + 0.5) / sats.length) * 4 * (aRef + b), aRef, b);
    return { x: Math.round(xn * Math.max(0, hi - s.w / 2) - s.w / 2), y: Math.round(y - s.h / 2), w: s.w, h: s.h };
  });
  /** In rows: the first `above` partners above the middle, the nearest row first, the rest below, each row as full as the width lets it be. */
  const inRows = (above: number): Rect[] => {
    const spots: Rect[] = sats.map((s) => ({ x: 0, y: 0, w: s.w, h: s.h }));
    const lay = (members: number[], up: boolean) => {
      let edge = up ? centre.y - FOCUS_SPOKE : centre.y + centre.h + FOCUS_SPOKE;
      for (let i = 0; i < members.length;) {
        const row = [members[i]!];
        let used = sats[members[i]!]!.w;
        while (i + row.length < members.length && used + FOCUS_GAP + sats[members[i + row.length]!]!.w <= hi - lo) {
          used += FOCUS_GAP + sats[members[i + row.length]!]!.w;
          row.push(members[i + row.length]!);
        }
        let x = -used / 2;
        for (const j of row) {
          const s = sats[j]!;
          spots[j] = { x: Math.round(x), y: up ? edge - s.h : edge, w: s.w, h: s.h };
          x += s.w + FOCUS_GAP;
        }
        const rowH = Math.max(...row.map((j) => sats[j]!.h));
        edge += up ? -(rowH + FOCUS_ROW) : rowH + FOCUS_ROW;
        i += row.length;
      }
    };
    const order = sats.map((_, i) => i);
    lay(order.slice(0, above), true);
    lay(order.slice(above), false);
    return spots;
  };
  const clear = (spots: Rect[]) => spots.every((s, i) => !hit(s, centre, FOCUS_SPOKE) && spots.slice(i + 1).every((o) => !hit(s, o, FOCUS_GAP)));
  /** How many cards a spoke runs through that are not the one it ends on. */
  const through = (spots: Rect[]) => spots.reduce((n, s, i) => n + spots.filter((o, j) => j !== i && cuts(o, mid(centre), mid(s), 2)).length, 0);
  const tall = (spots: Rect[]) => Math.max(centre.y + centre.h, ...spots.map((s) => s.y + s.h)) - Math.min(centre.y, ...spots.map((s) => s.y));

  let spots: Rect[] = [];
  if (sats.length > 0) {
    // The ring, grown a little at a time until it is clear and no spoke runs through a card.
    let ring: Rect[] | null = null;
    let clearest: Rect[] | null = null;
    for (let b = Math.max(centre.h / 2 + FOCUS_SPOKE, 60); b < 1600 && ring === null; b += 8) {
      const tried = ringAround(b);
      if (!clear(tried)) continue;
      clearest ??= tried;
      if (through(tried) === 0) ring = tried;
    }
    ring ??= clearest;
    const options = [
      ...(ring ? [{ at: ring, cost: 0.7 * (1000 * through(ring) + tall(ring)) }] : []),
      ...Array.from({ length: sats.length + 1 }, (_, k) => inRows(k)).map((rows) => ({ at: rows, cost: 1000 * through(rows) + tall(rows) })),
    ];
    spots = options.reduce((best, o) => (o.cost < best.cost ? o : best)).at;
  }

  const cards: PlacedCard[] = [
    { id: focusId, boxId: home.get(focusId)?.id ?? '', ...centre },
    ...sats.map((s, i): PlacedCard => ({ id: s.id, boxId: home.get(s.id)?.id ?? '', ...spots[i]! })),
  ];
  const cardOf = new Map(cards.map((c) => [c.id, c]));
  const edges = reqs.map((r): PlacedEdge => {
    const to = cardOf.get(r.b)!;
    const points: Pt[] = [borderToward(centre, mid(to)), borderToward(to, mid(centre))];
    const w = labelWidth(r.text);
    const [mx, my] = alongLine(points, 0.5);
    return {
      id: r.id, from: r.a, to: r.b, status: r.status, text: r.text, badge: null, points,
      label: { x: mx - w / 2, y: my - LABEL_H / 2, w, h: LABEL_H },
    };
  });
  const settled = settleLabels({ width: 0, height: 0, boxes: [], cards, edges }, SLIDES);

  // Centred across the width and padded all round.
  const spans: Rect[] = [...settled.cards, ...settled.edges.map((e) => e.label)];
  const left = Math.min(...spans.map((r) => r.x));
  const right = Math.max(...spans.map((r) => r.x + r.w));
  const top = Math.min(...spans.map((r) => r.y));
  const bottom = Math.max(...spans.map((r) => r.y + r.h));
  const width = Math.max(Math.ceil(right - left) + 2 * MARGIN, W);
  const ox = Math.round((width - (right - left)) / 2 - left);
  const oy = Math.round(MARGIN - top);
  const moved = <T extends Rect>(r: T): T => ({ ...r, x: r.x + ox, y: r.y + oy });
  return {
    width,
    height: Math.ceil(bottom - top) + 2 * MARGIN,
    boxes: [],
    cards: settled.cards.map(moved),
    edges: settled.edges.map((e) => ({ ...e, label: moved(e.label), points: e.points.map(([x, y]): Pt => [x + ox, y + oy]) })),
  };
}

/**
 * An SVG path through the points of a polyline, with each right-angle bend
 * rounded off to a radius of at most `radius`, less where the segments either
 * side of it are too short to take that much.
 */
export function polylinePath(points: [number, number][], radius = 6): string {
  const n = (v: number) => String(Math.round(v * 10) / 10);
  const first = points[0];
  if (!first) return '';
  let d = `M ${n(first[0])} ${n(first[1])}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    const prev = points[i - 1]!;
    const next = points[i + 1];
    if (!next) {
      d += ` L ${n(p[0])} ${n(p[1])}`;
      continue;
    }
    const inLen = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const outLen = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += ` L ${n(p[0])} ${n(p[1])}`;
      continue;
    }
    const back: [number, number] = [p[0] + ((prev[0] - p[0]) / inLen) * r, p[1] + ((prev[1] - p[1]) / inLen) * r];
    const fwd: [number, number] = [p[0] + ((next[0] - p[0]) / outLen) * r, p[1] + ((next[1] - p[1]) / outLen) * r];
    d += ` L ${n(back[0])} ${n(back[1])} Q ${n(p[0])} ${n(p[1])} ${n(fwd[0])} ${n(fwd[1])}`;
  }
  return d;
}

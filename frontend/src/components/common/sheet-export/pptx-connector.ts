/**
 * The DrawingML geometry of one connector, from the polyline it stands for.
 *
 * A connector is a preset path (`straightConnector1`, `bentConnector2` to `5`)
 * drawn in the box `xfrm` gives it, so a route is not stored as points but as a
 * box, a rotation, two flips and the `adj` values that say where its bends fall
 * along the box. Pure integer EMU in, geometry out, so it is asserted by
 * re-drawing the path from the geometry and comparing with the route; see
 * `connectorPath`, which is the same arithmetic run the other way.
 *
 * Every elbow preset starts at the box's top left, runs along x first and ends
 * at the bottom right, alternating with y:
 *
 *   bentConnector2   (0,0) (w,0) (w,h)
 *   bentConnector3   (0,0) (x1,0) (x1,h) (w,h)
 *   bentConnector4   (0,0) (x1,0) (x1,y2) (w,y2) (w,h)
 *   bentConnector5   (0,0) (x1,0) (x1,y2) (x3,y2) (x3,h) (w,h)
 *
 * A route that starts by running down or up is the same path turned a quarter,
 * so the box is stored with its width and height swapped and `rot` of 90 or 270
 * degrees. Flips are applied to the path inside its box first and the rotation
 * after, about the box's centre, which is how PowerPoint itself writes a
 * vertical elbow. Which of the eight combinations puts the path's two ends on
 * the route's two ends, facing the way the route leaves, is found by trying
 * them, and a combination is accepted only when the path it draws is the route.
 */

export type Pt = readonly [number, number];

export type ConnectorPreset = 'straightConnector1' | 'bentConnector2' | 'bentConnector3' | 'bentConnector4' | 'bentConnector5';

export interface ConnectorGeometry {
  readonly preset: ConnectorPreset;
  /** The top left and size of the box before it is rotated, in EMU. */
  readonly off: Pt;
  readonly ext: Pt;
  /** Sixtieths of a degree: 0, 5400000 or 16200000. */
  readonly rot: 0 | 5400000 | 16200000;
  readonly flipH: boolean;
  readonly flipV: boolean;
  /** `adj1`.. in hundred-thousandths of the box side, one per bend beyond the first. */
  readonly adj: readonly number[];
}

/** Within this many EMU two coordinates are the same place. */
const EPS = 2;

const same = (a: number, b: number) => Math.abs(a - b) <= EPS;

const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * The corners of `points` taken as an orthogonal route, or null when it is not
 * one.
 *
 * A layout's right-angled route is only right-angled to a fraction of a pixel:
 * its long runs drift by a few tenths between one bend point and the next, so
 * read strictly it is slanted nearly everywhere and no elbow could draw it. A
 * segment that moves less than `tol` across is therefore level or plumb, runs
 * of such segments along one axis are one run, and a run sits at the mean of
 * where its segments were. That moves a corner by about `tol` at most, and
 * joins the bend points a layout puts along a straight run into the one segment
 * they are. A segment that moves more than `tol` on both axes is slanted and the
 * route is not orthogonal.
 */
export function snapRoute(points: readonly Pt[], tol: number): Pt[] | null {
  interface Run { axis: 'h' | 'v'; levels: number[]; from: number; to: number }
  const runs: Run[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    // A repeated point, or a step too small to be a direction.
    if (Math.abs(dx) <= tol && Math.abs(dy) <= tol) continue;
    const axis = Math.abs(dy) <= tol ? 'h' : Math.abs(dx) <= tol ? 'v' : null;
    if (axis === null) return null;
    const level = axis === 'h' ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2;
    const last = runs[runs.length - 1];
    if (last?.axis === axis) {
      last.levels.push(level);
      last.to = axis === 'h' ? b[0] : b[1];
    } else {
      runs.push({ axis, levels: [level], from: axis === 'h' ? a[0] : a[1], to: axis === 'h' ? b[0] : b[1] });
    }
  }
  const first = runs[0];
  const final = runs[runs.length - 1];
  if (!first || !final) return null;
  const out: Pt[] = [first.axis === 'h' ? [first.from, mean(first.levels)] : [mean(first.levels), first.from]];
  runs.slice(0, -1).forEach((run, k) => {
    const next = runs[k + 1]!;
    out.push(run.axis === 'h' ? [mean(next.levels), mean(run.levels)] : [mean(run.levels), mean(next.levels)]);
  });
  out.push(final.axis === 'h' ? [final.to, mean(final.levels)] : [mean(final.levels), final.to]);
  return out;
}

const PRESETS: Record<number, ConnectorPreset> = { 2: 'bentConnector2', 3: 'bentConnector3', 4: 'bentConnector4', 5: 'bentConnector5' };

/**
 * The most segments drawn as the elbow of that many. PowerPoint has presets up
 * to five; Keynote draws `bentConnector4` and `5` as a straight line between the
 * ends, so it is the one consumer here that cannot confirm them. Lower this to 3
 * to write only the elbows Keynote draws, at the price of a longer route being
 * bent into three segments on open.
 */
const MAX_ELBOW_SEGMENTS = 5;

const ROTATIONS = [0, 5400000, 16200000] as const;

/** Where the path's local point (u, v) falls on the slide. */
function place(g: Pick<ConnectorGeometry, 'off' | 'ext' | 'rot' | 'flipH' | 'flipV'>, u: number, v: number): Pt {
  const [cx, cy] = g.ext;
  const lu = (g.flipH ? cx - u : u) - cx / 2;
  const lv = (g.flipV ? cy - v : v) - cy / 2;
  const turns = g.rot / 5400000;
  const [ru, rv] = turns === 0 ? [lu, lv] : turns === 1 ? [-lv, lu] : [lv, -lu];
  return [g.off[0] + cx / 2 + ru, g.off[1] + cy / 2 + rv];
}

/** The inverse of `place`: where a point of the slide falls on the path's own axes. */
function unplace(g: Pick<ConnectorGeometry, 'off' | 'ext' | 'rot' | 'flipH' | 'flipV'>, p: Pt): Pt {
  const [cx, cy] = g.ext;
  const ru = p[0] - g.off[0] - cx / 2;
  const rv = p[1] - g.off[1] - cy / 2;
  const turns = g.rot / 5400000;
  const [lu, lv] = turns === 0 ? [ru, rv] : turns === 1 ? [rv, -ru] : [-rv, ru];
  return [(g.flipH ? cx / 2 - lu : lu + cx / 2), (g.flipV ? cy / 2 - lv : lv + cy / 2)];
}

/** The corners of the path a preset draws in a box `cx` by `cy`, from its `adj` values. */
function presetCorners(preset: ConnectorPreset, cx: number, cy: number, adj: readonly number[]): Pt[] {
  const a = (i: number) => adj[i] ?? 50000;
  switch (preset) {
    case 'bentConnector2': return [[0, 0], [cx, 0], [cx, cy]];
    case 'bentConnector3': return [[0, 0], [(cx * a(0)) / 100000, 0], [(cx * a(0)) / 100000, cy], [cx, cy]];
    case 'bentConnector4': {
      const x1 = (cx * a(0)) / 100000;
      const y2 = (cy * a(1)) / 100000;
      return [[0, 0], [x1, 0], [x1, y2], [cx, y2], [cx, cy]];
    }
    case 'bentConnector5': {
      const x1 = (cx * a(0)) / 100000;
      const y2 = (cy * a(1)) / 100000;
      const x3 = (cx * a(2)) / 100000;
      return [[0, 0], [x1, 0], [x1, y2], [x3, y2], [x3, cy], [cx, cy]];
    }
    case 'straightConnector1': return [[0, 0], [cx, cy]];
  }
}

/** The route a geometry draws, as corners on the slide. The test of `connectorGeometry` runs this against its input. */
export function connectorPath(g: ConnectorGeometry): Pt[] {
  return presetCorners(g.preset, g.ext[0], g.ext[1], g.adj).map(([u, v]) => place(g, u, v));
}

function straight(points: readonly Pt[]): ConnectorGeometry {
  const s = points[0]!;
  const e = points[points.length - 1]!;
  return {
    preset: 'straightConnector1',
    off: [Math.min(s[0], e[0]), Math.min(s[1], e[1])],
    ext: [Math.abs(e[0] - s[0]), Math.abs(e[1] - s[1])],
    rot: 0, flipH: e[0] < s[0], flipV: e[1] < s[1], adj: [],
  };
}

/**
 * The geometry that draws `points`, a route from the first point to the last.
 *
 * A route of two points, or one with a slanted segment, is a straight
 * connector from end to end. An orthogonal route (see `snapRoute` for how
 * level a run has to be) of two to five segments is the elbow of that many,
 * to within `tolerance`, which is in EMU like the points. One of more than five has no preset: it
 * is drawn as the three-segment elbow between its ends, leaving the way the
 * route leaves, which is wrong in the middle and right at both ends, and
 * PowerPoint draws a connector afresh the first time either end is moved.
 */
export function connectorGeometry(points: readonly Pt[], tolerance = EPS): ConnectorGeometry {
  const route = snapRoute(points, tolerance);
  if (!route || route.length < 3) return straight(points);

  const first = route[0]!;
  const next = route[1]!;
  const last = route[route.length - 1]!;
  const horizontal = same(first[1], next[1]);
  const segments = route.length - 1;
  const preset = PRESETS[segments] ?? 'bentConnector3';
  // Only a route the preset can draw is checked against it; an over-long one is bent into three segments by construction.
  const exact = segments <= MAX_ELBOW_SEGMENTS;
  const midX = (first[0] + last[0]) / 2;
  const midY = (first[1] + last[1]) / 2;
  const target: Pt[] = exact ? route : horizontal
    ? [first, [midX, first[1]], [midX, last[1]], last]
    : [first, [first[0], midY], [last[0], midY], last];

  const w = Math.abs(last[0] - first[0]);
  const h = Math.abs(last[1] - first[1]);
  const centre: Pt = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
  // `adj` is a whole number of hundred-thousandths of the box side, so a bend can land up to half of one off its place: that, doubled, is what redrawing the route may differ from it by.
  const slack = Math.max(EPS, Math.max(w, h) / 50000);
  for (const rot of ROTATIONS) {
    const turned = rot !== 0;
    // A quarter turn swaps the sides, so the box is the route's height by its width.
    const ext: Pt = turned ? [h, w] : [w, h];
    const off: Pt = [centre[0] - ext[0] / 2, centre[1] - ext[1] / 2];
    for (const flipH of [false, true]) {
      for (const flipV of [false, true]) {
        const g = { off, ext, rot, flipH, flipV };
        const a = place(g, 0, 0);
        const b = place(g, ext[0], ext[1]);
        if (!same(a[0], first[0]) || !same(a[1], first[1]) || !same(b[0], last[0]) || !same(b[1], last[1])) continue;
        // The path leaves along its own x, which must be the way the route leaves.
        const lead = place(g, 1, 0);
        const wantsHorizontal = lead[1] - a[1] === 0 || Math.abs(lead[1] - a[1]) < 1e-9;
        if (wantsHorizontal !== horizontal) continue;
        // Where each bend falls along the box, read back off the route.
        const local = target.map((p) => unplace(g, p));
        const [cx, cy] = ext;
        const frac = (v: number, side: number) => (side === 0 ? 50000 : Math.round((v / side) * 100000));
        const adj = segments === 3 || !exact
          ? [frac(local[1]![0], cx)]
          : segments === 4 ? [frac(local[1]![0], cx), frac(local[2]![1], cy)]
            : segments === 5 ? [frac(local[1]![0], cx), frac(local[2]![1], cy), frac(local[3]![0], cx)]
              : [];
        const candidate: ConnectorGeometry = { preset: exact ? preset : 'bentConnector3', off: [Math.round(off[0]), Math.round(off[1])], ext: [Math.round(ext[0]), Math.round(ext[1])], rot, flipH, flipV, adj };
        const drawn = connectorPath(candidate);
        if (drawn.length === target.length && drawn.every((p, i) => Math.abs(p[0] - target[i]![0]) <= slack && Math.abs(p[1] - target[i]![1]) <= slack)) return candidate;
      }
    }
  }
  return straight(points);
}

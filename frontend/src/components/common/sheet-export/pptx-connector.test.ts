import { describe, expect, it } from 'vitest';

import { connectorGeometry, connectorPath, snapRoute, type Pt } from './pptx-connector';

/** The route a geometry draws, against the route it was made from, corner for corner. */
const redrawn = (route: Pt[]) => connectorPath(connectorGeometry(route));
const near = (a: readonly Pt[], b: readonly Pt[], slack = 2) => {
  expect(a).toHaveLength(b.length);
  a.forEach((p, i) => {
    expect(Math.abs(p[0] - b[i]![0])).toBeLessThanOrEqual(slack);
    expect(Math.abs(p[1] - b[i]![1])).toBeLessThanOrEqual(slack);
  });
};

describe('snapRoute', () => {
  it('drops repeated points and points that lie straight on the way', () => {
    expect(snapRoute([[0, 0], [0, 0], [10, 0], [20, 0], [20, 10]], 2)).toEqual([[0, 0], [20, 0], [20, 10]]);
  });

  it('reads a run that drifts by a fraction of the tolerance as one level segment, at the mean of where it was', () => {
    // A layout's long runs drift a few tenths between bend points: the third run is at 412.6, then 413, then 413, which is 412.9 on average.
    const route = snapRoute([[287, 110], [287, 130], [412.6, 130], [413, 273], [413, 299], [837, 299], [837, 718]], 14)!;
    expect(route).toHaveLength(6);
    expect(route.map((p) => p.map((v) => Math.round(v * 10) / 10))).toEqual([
      [287, 110], [287, 130], [412.9, 130], [412.9, 299], [837, 299], [837, 718],
    ]);
  });

  it('turns such a route into one exact elbow of five segments, where read strictly it was slanted everywhere', () => {
    const route: Pt[] = [[287, 110], [287, 130], [412.6, 130], [413, 273], [413, 299], [837, 299], [837, 718]];
    expect(connectorGeometry(route, 0.1).preset).toBe('straightConnector1');
    const g = connectorGeometry(route, 14);
    expect(g.preset).toBe('bentConnector5');
    near(connectorPath(g), snapRoute(route, 14)!);
  });

  it('is null for a route with a slanted segment, and for one that goes nowhere', () => {
    expect(snapRoute([[0, 0], [100, 40]], 2)).toBeNull();
    expect(snapRoute([[5, 5], [5, 5]], 2)).toBeNull();
  });
});

describe('connectorGeometry', () => {
  it('is a straight connector for two points, flipped to run the right way', () => {
    const g = connectorGeometry([[100, 100], [40, 30]]);
    expect(g.preset).toBe('straightConnector1');
    expect(g).toMatchObject({ off: [40, 30], ext: [60, 70], flipH: true, flipV: true, rot: 0, adj: [] });
  });

  it('is a straight connector for a slanted route, which an elbow cannot draw', () => {
    expect(connectorGeometry([[0, 0], [50, 20], [90, 90]]).preset).toBe('straightConnector1');
  });

  it('is a straight connector for a degenerate route', () => {
    expect(connectorGeometry([[5, 5], [5, 5]])).toMatchObject({ preset: 'straightConnector1', ext: [0, 0] });
  });

  it('draws a horizontal-vertical-horizontal route as the three-segment elbow, with its middle where the route has it', () => {
    const route: Pt[] = [[0, 0], [30, 0], [30, 80], [100, 80]];
    const g = connectorGeometry(route);
    expect(g).toMatchObject({ preset: 'bentConnector3', rot: 0, flipH: false, flipV: false, adj: [30000] });
    near(connectorPath(g), route);
  });

  it('turns a quarter for a route that leaves vertically, which is how PowerPoint stores a vertical elbow', () => {
    const route: Pt[] = [[100, 0], [100, 40], [20, 40], [20, 120]];
    const g = connectorGeometry(route);
    expect(g.preset).toBe('bentConnector3');
    expect([5400000, 16200000]).toContain(g.rot);
    // The box is stored before the turn: as wide as the route is tall.
    expect(g.ext).toEqual([120, 80]);
    near(connectorPath(g), route);
  });

  it('keeps the L of a two-segment route, either way round', () => {
    const across: Pt[] = [[0, 0], [60, 0], [60, 90]];
    const down: Pt[] = [[0, 0], [0, 90], [60, 90]];
    expect(connectorGeometry(across).preset).toBe('bentConnector2');
    expect(connectorGeometry(down).preset).toBe('bentConnector2');
    near(redrawn(across), across);
    near(redrawn(down), down);
  });

  it('draws four and five segments as the presets of that many, with every bend where the route has it', () => {
    const four: Pt[] = [[0, 0], [20, 0], [20, 50], [100, 50], [100, 120]];
    const five: Pt[] = [[0, 0], [20, 0], [20, 50], [70, 50], [70, 120], [100, 120]];
    expect(connectorGeometry(four).preset).toBe('bentConnector4');
    expect(connectorGeometry(five).preset).toBe('bentConnector5');
    near(redrawn(four), four);
    near(redrawn(five), five);
  });

  /**
   * A real route out of the layout, at the scale a slide is written in. Its
   * runs drift by tenths of a pixel and one of them is 778px long, so `adj`,
   * a whole number of hundred-thousandths of that, lands a few dozen EMU off
   * its bend. That was once read as "this is not the route" and the connector
   * fell back to a straight line across the picture.
   */
  it('draws a real five-segment layout route as the elbow, though adj cannot land a bend to the EMU', () => {
    const px = 9525;
    const route = [[180.8, 110], [181, 273], [181, 299], [26, 299], [26, 452], [89, 452], [89.3, 849], [89.3, 888]]
      .map(([x, y]): Pt => [Math.round(x! * px), Math.round(y! * px)]);
    const g = connectorGeometry(route, Math.round(0.015 * 914400));
    expect(g.preset).toBe('bentConnector5');
    near(connectorPath(g), snapRoute(route, Math.round(0.015 * 914400))!, 100);
  });

  it('draws a route more than five segments long as a three-segment elbow that still leaves and arrives as the route does', () => {
    const long: Pt[] = [[0, 0], [10, 0], [10, 10], [30, 10], [30, 20], [50, 20], [50, 30], [70, 30]];
    const g = connectorGeometry(long);
    expect(g.preset).toBe('bentConnector3');
    const path = connectorPath(g);
    expect(path[0]).toEqual([0, 0]);
    expect(path[path.length - 1]).toEqual([70, 30]);
    // It leaves along x, as the route does.
    expect(path[1]![1]).toBe(0);
  });

  /**
   * Every direction a route can leave in, every side of its end it can arrive
   * on, and routes whose first move is away from where they end: the preset is
   * kept and the bend is put outside the box with a negative or over-100000
   * adj, which is what PowerPoint writes for such a route.
   */
  it('redraws every alternating route of two to five segments exactly, from every start direction', () => {
    const lengths = [40, 90, 150];
    let checked = 0;
    for (const first of ['h', 'v'] as const) {
      for (const segments of [2, 3, 4, 5]) {
        for (let mask = 0; mask < 2 ** segments; mask++) {
          for (const length of lengths) {
            const route: Pt[] = [[500, 500]];
            let axis = first;
            for (let k = 0; k < segments; k++) {
              const last = route[route.length - 1]!;
              const step = ((mask >> k) & 1 ? -1 : 1) * (length + 17 * k);
              route.push(axis === 'h' ? [last[0] + step, last[1]] : [last[0], last[1] + step]);
              axis = axis === 'h' ? 'v' : 'h';
            }
            // A route that doubles back on itself shares a corner with itself; PowerPoint cannot draw it as one preset, and the router does not make one.
            const xs = new Set(route.map((p) => `${String(p[0])},${String(p[1])}`));
            if (xs.size !== route.length) continue;
            const g = connectorGeometry(route);
            expect(g.preset, JSON.stringify(route)).not.toBe('straightConnector1');
            near(connectorPath(g), snapRoute(route, 2)!);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

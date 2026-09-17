import { describe, expect, it } from 'vitest';

import { AXIS_TOP_CLEARANCE, DEFAULT_WHEEL_OPTIONS, wheelGeometry } from './wheel-geometry';

describe('wheelGeometry', () => {
  it('produces one position per channel, numbered from 1', () => {
    const { positions } = wheelGeometry(16);
    expect(positions).toHaveLength(16);
    expect(positions.map((p) => p.channel)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1),
    );
  });

  it('puts channel 1 at 6 o’clock and steps clockwise', () => {
    const { positions, cx, cy } = wheelGeometry(16);
    const first = positions[0]!;
    expect(first.angleDeg).toBe(90);
    expect(first.tick.inner.x).toBeCloseTo(cx, 6);
    expect(first.tick.inner.y).toBeGreaterThan(cy);

    // A quarter of the way round from the bottom is 9 o'clock: same height,
    // further left.
    const quarter = positions[4]!;
    expect(quarter.angleDeg).toBe(180);
    expect(quarter.tick.inner.y).toBeCloseTo(cy, 6);
    expect(quarter.tick.inner.x).toBeLessThan(cx);

    // Half way round is 12 o'clock, which at 16 positions is channel 9.
    expect(positions[8]!.angleDeg).toBe(270);
    expect(positions[8]!.tick.inner.y).toBeLessThan(cy);
  });

  it('splits labels into two balanced columns, mirrored across the axis', () => {
    const { positions, cx } = wheelGeometry(16);
    const right = positions.filter((p) => p.side === 'right');
    const left = positions.filter((p) => p.side === 'left');

    expect(right).toHaveLength(8);
    expect(left).toHaveLength(8);

    // The two positions on the vertical axis keep their side, because `side`
    // still balances the columns, but their label is centred on the spoke and
    // so carries no column anchor. The remaining seven per column are still
    // mirrored, so the equidistance assertion holds on the filtered arrays.
    const rightColumn = right.filter((p) => p.labelPos.anchor !== 'middle');
    const leftColumn = left.filter((p) => p.labelPos.anchor !== 'middle');

    for (const p of rightColumn) {
      expect(p.labelPos.anchor).toBe('start');
      expect(p.labelPos.x).toBeGreaterThan(cx);
    }
    for (const p of leftColumn) {
      expect(p.labelPos.anchor).toBe('end');
      expect(p.labelPos.x).toBeLessThan(cx);
    }

    // The two columns should be equidistant from the centre.
    expect(rightColumn[0]!.labelPos.x - cx).toBeCloseTo(cx - leftColumn[0]!.labelPos.x, 6);
  });

  it('sends the 6 o’clock position left and the 12 o’clock position right', () => {
    const { positions } = wheelGeometry(16);
    expect(positions[0]!.side).toBe('left'); // channel 1, bottom
    expect(positions[8]!.side).toBe('right'); // channel 9, top
  });

  it('keeps every label on its own spoke', () => {
    const { positions, cx, cy } = wheelGeometry(16);

    for (const p of positions) {
      if (!p.leader) continue;
      // The bend sits on the ray from the centre through the tick, so the tick
      // and the first leader segment are one straight line.
      const tickAngle = Math.atan2(p.tick.outer.y - cy, p.tick.outer.x - cx);
      const elbowAngle = Math.atan2(p.leader.elbow.y - cy, p.leader.elbow.x - cx);
      const delta = Math.abs(Math.atan2(Math.sin(tickAngle - elbowAngle), Math.cos(tickAngle - elbowAngle)));
      expect(delta).toBeLessThan(1e-6);

      // The bend is never inside the tick it grew from.
      const radius = (pt: { x: number; y: number }) => Math.hypot(pt.x - cx, pt.y - cy);
      expect(radius(p.leader.elbow)).toBeGreaterThanOrEqual(radius(p.tick.outer) - 1e-6);
    }
  });

  it('separates crowded labels by pushing them outward, never by overlapping', () => {
    const spacing = DEFAULT_WHEEL_OPTIONS.labelSpacing;
    const { positions } = wheelGeometry(16);

    for (const side of ['left', 'right'] as const) {
      const ys = positions
        .filter((p) => p.side === side)
        .filter((p) => p.labelPos.anchor !== 'middle')
        .map((p) => p.labelPos.y)
        .sort((a, b) => a - b);

      for (let i = 1; i < ys.length; i += 1) {
        expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(spacing - 1e-6);
      }
    }
  });

  it('runs the second leader segment horizontally into its label', () => {
    const { positions } = wheelGeometry(16);

    for (const p of positions) {
      if (!p.leader) continue;
      expect(p.leader.to.y).toBeCloseTo(p.leader.elbow.y, 6);
      expect(p.leader.to.y).toBeCloseTo(p.labelPos.y, 6);
      // and it never doubles back past the text it points at
      if (p.side === 'right') {
        expect(p.leader.elbow.x).toBeLessThanOrEqual(p.leader.to.x + 1e-6);
      } else {
        expect(p.leader.elbow.x).toBeGreaterThanOrEqual(p.leader.to.x - 1e-6);
      }
    }
  });

  it('orders each column by tick height so leader lines do not cross', () => {
    const { positions } = wheelGeometry(16);

    for (const side of ['left', 'right'] as const) {
      const column = positions
        .filter((p) => p.side === side)
        .sort((a, b) => a.labelPos.y - b.labelPos.y);

      const tickYs = column.map((p) => p.tick.outer.y);
      const sorted = [...tickYs].sort((a, b) => a - b);
      expect(tickYs).toEqual(sorted);
    }
  });

  it('places the tick outside the ring so it never strikes the channel number', () => {
    const { positions, cx, cy, ringOuter, ringInner } = wheelGeometry(16);

    for (const p of positions) {
      const radius = (pt: { x: number; y: number }) =>
        Math.hypot(pt.x - cx, pt.y - cy);

      expect(radius(p.tick.inner)).toBeCloseTo(ringOuter, 6);
      expect(radius(p.tick.outer)).toBeGreaterThan(ringOuter);
      // The number sits inside the band, clear of the tick.
      const numberRadius = radius(p.numberPos);
      expect(numberRadius).toBeGreaterThan(ringInner);
      expect(numberRadius).toBeLessThan(ringOuter);
    }
  });

  it('starts every leader at its own tick and ends beside its own label', () => {
    const { positions } = wheelGeometry(16);

    for (const p of positions) {
      if (!p.leader) continue;
      expect(p.leader.from).toEqual(p.tick.outer);
      expect(p.leader.to.y).toBeCloseTo(p.labelPos.y, 6);
      // The leader stops short of the text rather than running under it.
      if (p.side === 'right') {
        expect(p.leader.to.x).toBeLessThan(p.labelPos.x);
      } else {
        expect(p.leader.to.x).toBeGreaterThan(p.labelPos.x);
      }
    }
  });

  it('handles channel counts other than 16', () => {
    expect(wheelGeometry(12).positions).toHaveLength(12);
    expect(wheelGeometry(24).positions).toHaveLength(24);

    const eight = wheelGeometry(8);
    expect(eight.positions).toHaveLength(8);
    // 8 positions => 45 degree steps, starting from 6 o'clock.
    expect(eight.positions[2]!.angleDeg).toBe(180);
  });

  it('puts a lone label on its own spoke rather than on the axis', () => {
    const { positions, cy } = wheelGeometry(1);
    expect(positions).toHaveLength(1);
    // A single channel sits at 6 o'clock, so its label belongs below the hub,
    // not level with it.
    expect(positions[0]!.angleDeg).toBe(90);
    expect(positions[0]!.labelPos.y).toBeGreaterThan(cy);
  });

  it('keeps the label stack inside the viewBox at any channel count', () => {
    // channelCount comes from the server, so it is not bounded by anything the
    // form enforces. Unclamped, 40 channels stacked 20 to a column at 52 units
    // spans 988 units inside a 460-unit box: the outermost labels land off the
    // page, invisible on screen and clipped in print.
    const { positions, height } = wheelGeometry(40);
    expect(positions).toHaveLength(40);
    for (const p of positions) {
      expect(p.labelPos.y).toBeGreaterThanOrEqual(0);
      expect(p.labelPos.y).toBeLessThanOrEqual(height);
    }
  });

  it('tightens the spacing rather than running off the sheet when crowded', () => {
    // At 40 positions the requested spacing cannot be honoured inside the
    // viewBox, so it is reduced instead. Cramped beats gone: a label pushed off
    // the page is invisible on screen under overflow:visible and clipped
    // outright in print.
    const { positions } = wheelGeometry(40);

    for (const side of ['left', 'right'] as const) {
      const ys = positions
        .filter((p) => p.side === side)
        .map((p) => p.labelPos.y)
        .sort((a, b) => a - b);

      const gaps = ys.slice(1).map((y, i) => y - ys[i]!);
      expect(Math.min(...gaps)).toBeLessThan(DEFAULT_WHEEL_OPTIONS.labelSpacing);
    }
  });

  it('degrades safely on a zero or negative count', () => {
    expect(wheelGeometry(0).positions).toHaveLength(0);
    expect(wheelGeometry(-4).positions).toHaveLength(0);
  });

  it('honours overridden geometry options', () => {
    const custom = wheelGeometry(16, { width: 800, height: 500, ringOuter: 200 });
    expect(custom.width).toBe(800);
    expect(custom.cx).toBe(400);
    expect(custom.cy).toBe(250);
    expect(custom.ringOuter).toBe(200);
  });

  it('centres the two labels on the vertical axis over their own tick', () => {
    // A spoke at 12 or 6 o'clock has no horizontal component, so the sideways
    // offset every other label needs leaves these two sitting beside a tick they
    // do not belong to. Centred, each sits on its own tick's line.
    const { positions } = wheelGeometry(16);

    for (const p of [positions[0]!, positions[8]!]) {
      expect(p.labelPos.anchor).toBe('middle');
      expect(p.labelPos.x).toBeCloseTo(p.tick.outer.x, 6);
      expect(p.leader).toBeNull();
    }
  });

  it('centres exactly the two axis labels and no others', () => {
    // Without this the three `if (!p.leader) continue;` guards elsewhere in this
    // file would pass vacuously if every leader became null.
    const { positions } = wheelGeometry(16);

    expect(positions.filter((p) => p.leader === null)).toHaveLength(2);
    expect(positions.filter((p) => p.labelPos.anchor === 'middle')).toHaveLength(2);
  });

  it('centres only the 6 o’clock label at an odd channel count', () => {
    // At 15 positions the 24 degree step never lands on 270, so channel 1 is the
    // only position on the axis.
    const { positions } = wheelGeometry(15);
    expect(positions.filter((p) => p.labelPos.anchor === 'middle')).toHaveLength(1);
  });

  it('places each axis label from an explicit radius, not from the relaxation pass', () => {
    // A centred label is in neither column, so it is not crowding the neighbour
    // that pushed it outward and does not need the outward push. The two radii
    // differ because a label block hangs downward from its line: the bottom one
    // runs away from the dial and fits at the base radius, the top one runs back
    // toward it and needs a whole block of clearance.
    //
    // That clearance is AXIS_TOP_CLEARANCE and NOT labelSpacing. Naming the
    // column gap here is what left the top label 50 units off its tick while
    // the bottom one sat 8 off its own.
    const { positions, cy } = wheelGeometry(16);
    const base =
      DEFAULT_WHEEL_OPTIONS.ringOuter +
      DEFAULT_WHEEL_OPTIONS.tickLength +
      DEFAULT_WHEEL_OPTIONS.labelGutter;

    expect(positions[0]!.labelPos.y).toBeCloseTo(cy + base, 6);
    expect(positions[8]!.labelPos.y).toBeCloseTo(cy - (base + AXIS_TOP_CLEARANCE), 6);
  });

  it('keeps the axis label blocks off the LTAC table and off the ring', () => {
    // A label block hangs downward from its line, so the bottom one has to leave
    // a block's height inside the viewBox: the SVG is overflow:visible, and the
    // old relaxed position put channel 1's frequencies past the box and over the
    // table beneath the wheel. The top one hangs back toward the dial, so its
    // block has to clear its own tick.
    //
    // The bottom bound stays on labelSpacing, which is the more conservative of
    // the two against a viewBox floor there is no recovering from. The top bound
    // is the block height, because that is the thing actually at risk of landing
    // on the ring.
    const { positions, height } = wheelGeometry(16);
    const spacing = DEFAULT_WHEEL_OPTIONS.labelSpacing;

    expect(positions[0]!.labelPos.y + spacing).toBeLessThanOrEqual(height);
    expect(positions[8]!.labelPos.y + AXIS_TOP_CLEARANCE).toBeLessThanOrEqual(
      positions[8]!.tick.outer.y,
    );
  });
});

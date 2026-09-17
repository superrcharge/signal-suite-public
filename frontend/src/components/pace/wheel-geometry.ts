/**
 * Pure geometry for the channel wheel. Kept apart from the SVG so the maths is
 * asserted directly rather than through rendered markup.
 *
 * The wheel is drawn as a dial, not a pie: a numbered ring with each net's label
 * outside it, and each label sitting on its own spoke so it reads as belonging
 * to the tick it touches.
 *
 * Radial placement does collide if taken literally. At 16 positions the angular
 * step near 12 and 6 o'clock puts adjacent labels only ringOuter * 0.076 apart
 * vertically, about 14 units, while a three-line label needs roughly 40. The
 * answer is not to abandon the spokes but to slide a crowded label further out
 * along its own: outward is the one direction that separates it from its
 * neighbour without breaking the link to its tick.
 *
 * Channel 1 sits at 6 o'clock and the numbering runs clockwise, so at the
 * default 16 positions channel 9 is at the top.
 */

export type LabelSide = 'left' | 'right';
export type TextAnchor = 'start' | 'end' | 'middle';

export interface Point {
  x: number;
  y: number;
}

export interface ChannelPosition {
  /** 1-indexed channel number, as engraved on the radio. */
  channel: number;
  /** SVG angle in degrees; -90 is 12 o'clock. */
  angleDeg: number;
  side: LabelSide;
  /**
   * Position mark sitting just outside the ring band, running outward. It is
   * outside rather than across the band so it does not strike through the
   * channel number, which sits in the middle of the band.
   */
  tick: { inner: Point; outer: Point };
  /** Centre of the channel number, in the middle of the ring band. */
  numberPos: Point;
  /** Vertical centre of the label block, and which way its text runs. */
  labelPos: Point & { anchor: TextAnchor };
  /**
   * Leader from the tick to the label, as two segments meeting at one bend.
   * `from` to `elbow` continues along the tick's own radial line, so the tick
   * and that segment read as a single line; `elbow` to `to` runs horizontally
   * into the label, parallel with the text it points at.
   *
   * `null` for a label centred on the vertical axis, because such a label sits
   * on its tick's own line and needs nothing to connect it.
   */
  leader: { from: Point; elbow: Point; to: Point } | null;
}

export interface WheelGeometry {
  width: number;
  height: number;
  cx: number;
  cy: number;
  ringOuter: number;
  ringInner: number;
  hubRadius: number;
  positions: ChannelPosition[];
}

export interface WheelGeometryOptions {
  width: number;
  height: number;
  ringOuter: number;
  ringInner: number;
  hubRadius: number;
  /** Gap between the ring's outer edge and a label sitting on its own spoke. */
  labelGutter: number;
  /** Minimum vertical distance between two labels in the same half. */
  labelSpacing: number;
  /**
   * How far out a crowded label may be pushed along its spoke before it is
   * allowed to sit closer to its neighbour than `labelSpacing`.
   */
  maxLabelRadius: number;
  /** Angle of channel 1. 90 puts it at 6 o'clock. */
  startAngleDeg: number;
  /** Gap between the end of a leader line and the start of its label text. */
  leaderPad: number;
  /** Length of the position mark outside the ring. */
  tickLength: number;
}

// Two wheels sit side by side on a 1056px sheet, so each renders into about
// 512px and the SVG fills it at width:100%. That makes the rendered circle
// `ringOuter / width` of the cell, which has three consequences worth writing
// down, because two of them were learned by getting it wrong:
//
//   - Widening the viewBox buys nothing. It is a pure zoom-out: ring and text
//     shrink together and their ratio, which is what decides whether a label
//     fits, does not move.
//   - Shrinking the ring to make room for labels shrinks the dial by the same
//     proportion. Legible words, unreadably small circle.
//   - Height, though, is free. The row has vertical slack the wheel was not
//     using, and spending it costs the circle nothing.
//
// So width stays where it was, the ring keeps its full size, and the extra room
// radial labels need comes out of height. A label pushed outward to clear its
// neighbour is always one near 12 or 6 o'clock, where the spoke is close to
// vertical, so it travels into that new vertical space and barely widens.
export const DEFAULT_WHEEL_OPTIONS: WheelGeometryOptions = {
  width: 580,
  height: 430,
  ringOuter: 132,
  ringInner: 104,
  hubRadius: 88,
  labelGutter: 8,
  labelSpacing: 42,
  maxLabelRadius: 210,
  startAngleDeg: 90,
  leaderPad: 8,
  tickLength: 10,
};

/**
 * Length of the flat run between the bend and the label text. It exists to give
 * the eye something horizontal to follow into the words: a bend with no run
 * after it reads as a kink in the spoke rather than as a pointer.
 */
const LEADER_RUN = 10;

/**
 * How far past its own line the top axis label's block extends, in geometry
 * units.
 *
 * A label block hangs DOWNWARD: the net name sits on `labelPos.y` and the two
 * frequency lines stack beneath it, the lowest at `dy` 2.5em of a 12-unit font
 * in `ChannelWheel`. The bottom axis label therefore runs away from the dial
 * and fits at `baseRadius`; the top one runs back toward it and has to be
 * pushed out by a block's height so its frequencies clear the ring.
 *
 * It used to be `labelSpacing` (42), which is the gap between two labels in a
 * column and has nothing to do with a block's height. Being 12 units too
 * generous, it left the top label 50 units off its own tick against the bottom
 * label's 8, and net 9 read as having come loose from the dial.
 *
 * This is the WORST case -- a net carrying both a TX and an RX line -- because
 * the radius is fixed here, before anything knows which net will sit on that
 * position. `ChannelWheel` nudges the label back down by the lines it turns out
 * not to be using, which is where the actual assignment is known.
 */
export const AXIS_TOP_CLEARANCE = 30;

const toRad = (deg: number) => (deg * Math.PI) / 180;

function pointAt(cx: number, cy: number, radius: number, angleDeg: number): Point {
  const rad = toRad(angleDeg);
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

/**
 * Which column a channel's label belongs in. Positions on the vertical axis
 * (12 and 6 o'clock) have no horizontal bias, so 12 goes right and 6 goes left
 * to keep the two columns balanced.
 */
function sideFor(angleDeg: number): LabelSide {
  const cos = Math.cos(toRad(angleDeg));
  if (Math.abs(cos) > 1e-9) return cos > 0 ? 'right' : 'left';
  return Math.sin(toRad(angleDeg)) < 0 ? 'right' : 'left';
}

export function wheelGeometry(
  count: number,
  options: Partial<WheelGeometryOptions> = {},
): WheelGeometry {
  const opts = { ...DEFAULT_WHEEL_OPTIONS, ...options };
  const { width, height, ringOuter, ringInner, hubRadius, labelGutter, labelSpacing } = opts;

  const cx = width / 2;
  const cy = height / 2;

  const safeCount = Math.max(0, Math.floor(count));
  const step = safeCount > 0 ? 360 / safeCount : 0;

  // Pass 1: fixed geometry -- angle, tick, number, and which column the label
  // belongs in. Label Y is deliberately not known yet; it depends on how many
  // labels share the column.
  const partial = Array.from({ length: safeCount }, (_, i) => {
    const channel = i + 1;
    const angleDeg = opts.startAngleDeg + i * step;
    return {
      channel,
      angleDeg,
      side: sideFor(angleDeg),
      tick: {
        inner: pointAt(cx, cy, ringOuter, angleDeg),
        outer: pointAt(cx, cy, ringOuter + opts.tickLength, angleDeg),
      },
      numberPos: pointAt(cx, cy, (ringOuter + ringInner) / 2, angleDeg),
    };
  });

  // Pass 2: every label sits on its own spoke, so a label reads as belonging to
  // the tick it touches rather than to a column shared with fifteen others.
  //
  // A single radius does not survive 16 positions. Adjacent labels near 12 and
  // 6 o'clock differ in height by only ringOuter * 0.076, about 14 units, while
  // a three-line label needs roughly 40. So a crowded label slides OUTWARD
  // along its own spoke until it clears its neighbour: the spoke is the one
  // direction it can move without breaking the link to its tick.
  //
  // Solving for radius from a target height is what keeps it on the spoke.
  // y = cy + r*sin(angle), so r = (y - cy)/sin(angle).
  const baseRadius = ringOuter + opts.tickLength + labelGutter;
  const positions: ChannelPosition[] = [];

  (['right', 'left'] as const).forEach((side) => {
    const dir = side === 'right' ? 1 : -1;
    const anchor: TextAnchor = side === 'right' ? 'start' : 'end';

    const group = partial
      .filter((p) => p.side === side)
      .map((p) => ({ p, y: cy + baseRadius * Math.sin(toRad(p.angleDeg)) }))
      .sort((a, b) => a.y - b.y);

    // Crowded labels are separated by moving them AWAY from the horizontal
    // centreline, never toward it. On a spoke, away from the centreline is
    // always further out, so every adjustment is one the radius can express.
    // Relaxing in a single direction instead pushes the upper half inward,
    // where the radius solves to less than baseRadius, clamps back, and the
    // spacing that was just calculated is silently discarded.
    // channelCount is server-supplied. At 40 positions an uncapped spacing
    // walks the outermost labels straight off the sheet: invisible on screen
    // under overflow:visible, and clipped outright in print. Tighten instead,
    // because cramped beats gone. Half a label of headroom keeps the top and
    // bottom rows on the page.
    const halfRoom = Math.max(0, height / 2 - labelSpacing / 2);
    const fit = (count: number) =>
      count > 1 ? Math.min(labelSpacing, halfRoom / (count - 1)) : labelSpacing;

    const upper = group.filter((g) => g.y <= cy).sort((a, b) => b.y - a.y);
    const upperGap = fit(upper.length);
    for (let i = 1; i < upper.length; i++) {
      const gap = upper[i - 1]!.y - upper[i]!.y;
      if (gap < upperGap) upper[i]!.y = upper[i - 1]!.y - upperGap;
    }

    const lower = group.filter((g) => g.y > cy).sort((a, b) => a.y - b.y);
    const lowerGap = fit(lower.length);
    for (let i = 1; i < lower.length; i++) {
      const gap = lower[i]!.y - lower[i - 1]!.y;
      if (gap < lowerGap) lower[i]!.y = lower[i - 1]!.y + lowerGap;
    }

    for (const { p, y } of group) {
      const sin = Math.sin(toRad(p.angleDeg));
      // A spoke on the vertical axis (12 and 6 o'clock) has no horizontal
      // component, so the sideways offset every other label needs is pure error
      // here: the label reads as belonging to no tick at all. Centre it on the
      // spoke instead, and give it no leader, because a leader into a centred
      // label either strikes through its own text or is too short to see.
      //
      // The relaxed `y` is deliberately unused. A centred label is in neither
      // column, so it is not crowding the neighbour that pushed it outward, and
      // at the bottom that push put its frequency lines past the viewBox and
      // over the LTAC table below the wheel.
      //
      // The two are not symmetric, because a label block hangs DOWNWARD from
      // its line: the net name sits on the line and the frequencies stack
      // beneath it. The bottom label therefore runs away from the dial and fits
      // at baseRadius, while the top label runs back toward it and needs a whole
      // block of clearance or its frequencies land on the ring. That clearance
      // is AXIS_TOP_CLEARANCE, the block's own height -- not labelSpacing, which
      // measures the gap between two labels in a column and is 12 units more
      // than this needs.
      if (Math.abs(Math.cos(toRad(p.angleDeg))) < 1e-9) {
        const axisRadius = sin > 0 ? baseRadius : baseRadius + AXIS_TOP_CLEARANCE;
        const axisPoint = pointAt(cx, cy, axisRadius, p.angleDeg);
        positions.push({
          ...p,
          labelPos: { x: axisPoint.x, y: axisPoint.y, anchor: 'middle' },
          leader: null,
        });
        continue;
      }
      // Near 3 and 9 o'clock the spoke is almost horizontal, so solving for a
      // radius from a height is unstable and unnecessary: those labels are the
      // furthest apart vertically to begin with and never crowd.
      const radius =
        Math.abs(sin) < 0.08
          ? baseRadius
          : Math.min(opts.maxLabelRadius, Math.max(baseRadius, (y - cy) / sin));

      const elbow = pointAt(cx, cy, radius, p.angleDeg);
      const labelX = elbow.x + dir * (opts.leaderPad + LEADER_RUN);

      positions.push({
        ...p,
        labelPos: { x: labelX, y: elbow.y, anchor },
        leader: {
          from: p.tick.outer,
          elbow,
          to: { x: labelX - dir * opts.leaderPad, y: elbow.y },
        },
      });
    }
  });

  positions.sort((a, b) => a.channel - b.channel);

  return { width, height, cx, cy, ringOuter, ringInner, hubRadius, positions };
}

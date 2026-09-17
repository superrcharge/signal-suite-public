import { useId, useLayoutEffect, useRef, useState } from 'react';

import { IceMarkDefs, ICE_SYMBOL_ID, ICE_ASPECT } from '@/components/common/ice-mark';
import { formatNetFrequency, formatNetFrequencyLines } from '@/types/net-format';
import { wheelGeometry, type WheelGeometryOptions } from './wheel-geometry';
import { SHEET_CHANGED, isMarked } from './pace-constants';

export interface WheelChannelAssignment {
  /** 1-indexed channel number. */
  channel: number;
  netName: string;
  netId?: string;
  txFreq?: string;
  rxFreq?: string;
  freqUnit?: string;
  /** Carried over IP: draws the ICE mark after the name. */
  roip?: boolean;
  /** Changed-marks: 'net', 'tx', 'rx'. A marked line is drawn red. */
  highlights?: readonly string[];
}

/** Mark height in viewBox units, against the 14-unit assigned label. */
const ICE_MARK_H = 12;

/** Gap between the end of the name and the mark, in viewBox units. */
const ICE_MARK_GAP = 3;

export interface ChannelWheelProps {
  /** Sparse: only assigned channels need an entry. */
  assignments: WheelChannelAssignment[];
  channelCount?: number;
  /** Squadron emblem for the hub. Omitted renders an empty hub. */
  emblemUrl?: string;
  /** Short caption naming the wheel, e.g. "JEM". Drawn inside the ring just
   *  above the hub emblem, not below the wheel: the sheet is a fixed landscape
   *  page and the band under the wheels is wanted for the frequency tables.
   *  Omitted renders no caption. */
  caption?: string;
  /** The caption is marked as changed and drawn red. */
  captionMarked?: boolean;
  /** Names the wheel for assistive tech and the hidden table. */
  title: string;
  unassignedLabel?: string;
  geometryOptions?: Partial<WheelGeometryOptions>;
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  // tableLayout matters because this is applied to a <table>, and an auto-layout
  // table ignores a width smaller than its content's: the hidden table laid out
  // at its natural ~486px, escaped the figure, and gave the whole document a
  // horizontal scrollbar on any window narrow enough that 486 did not fit.
  // Invisible, so the only symptom was the page sliding sideways with nothing
  // out there to look at. `fixed` makes the width above bind.
  tableLayout: 'fixed',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
  padding: 0,
  margin: -1,
} as const;

// Both come from catalog-tokens.css so the wheel matches the Equipment Catalog
// datasheet. The fallbacks are the token's real values, not approximations --
// an earlier #c8912a here was a duller amber invented as a guess.
/**
 * Dead space cropped off the TOP of the viewBox, in geometry units.
 *
 * The label stack does not fill its box symmetrically: measured on a full
 * 16-channel wheel the topmost ink sits about 18 units down while the lowest
 * sits about 5 units off the bottom. Trimming `height` takes that off both
 * ends, so the bottom clips before the top is clean. Cropping from the top
 * alone moves the whole wheel up by exactly the space nothing was using,
 * without touching the circle, the text size, or the bottom margin.
 */
const TOP_TRIM = 13;

/**
 * Caption baseline, measured DOWN from the ring band's inner edge.
 *
 * It used to be measured up from the hub, which put the words' cap height inside
 * the band and struck the amber ring through them. The clear space between the
 * band's inner edge and the hub is `ringInner - hubRadius`, 16 units at the
 * default geometry, and a 15px cap is about 11 of them, so the baseline has to
 * sit near the bottom of that gap rather than near the top of it.
 */
const CAPTION_BASELINE_DROP = 13;

/**
 * Distance between two frequency lines, in geometry units: the `dy` step of
 * 1.05em at the 12-unit frequency font below.
 */
const FREQ_LINE_STEP = 12.6;

/**
 * The most frequency lines a label can carry, which is a separate TX and RX.
 * `AXIS_TOP_CLEARANCE` reserves room for exactly this many, because the radius
 * is fixed before anything knows what net will sit there.
 */
const MAX_DETAIL_LINES = 2;

const FONT_STACK = 'var(--font-condensed, "Barlow Condensed", sans-serif)';
const ACCENT = 'var(--shf-amber, #F5A21F)';
const ACCENT_DIM = 'var(--shf-amber-dim, #C7821A)';

/**
 * Renders a radio channel wheel. Pure: props in, picture out.
 *
 * Deliberately has no click handlers, no internal state, and no editing
 * affordances. Channel assignment is edited on a form elsewhere, the same way
 * every other record in this app is edited, which also lets this component be
 * dropped straight into the print sheet and a live editor preview unchanged.
 */
export function ChannelWheel({
  assignments,
  channelCount = 16,
  emblemUrl,
  caption,
  captionMarked = false,
  title,
  unassignedLabel = 'UNASSIGNED',
  geometryOptions,
}: ChannelWheelProps) {
  const geometry = wheelGeometry(channelCount, geometryOptions);
  const clipId = useId();

  /**
   * Rendered width of each name, so the ICE mark can sit after it.
   *
   * Measured rather than computed. Everything else in this component is pure
   * geometry, and that is the right default - but a proportional label's width
   * is a fact about the font, not about the wheel, and the one number this
   * needs cannot be derived from `channelCount`. Guessing it from character
   * count would put the mark inside the last letter on some names and a gap
   * away on others.
   *
   * jsdom has no text metrics and does not define `getComputedTextLength`, so
   * the call is guarded and the width falls back to 0 there. That places the
   * mark at the label's anchor rather than after the name - harmless, because
   * the tests assert the mark is present, not where it landed. Placement is
   * verified against the rendered sheet instead, where it measured a uniform
   * 3-unit gap on every anchor.
   */
  const nameRefs = useRef(new Map<number, SVGTextElement>());
  const [nameWidths, setNameWidths] = useState<Record<number, number>>({});

  useLayoutEffect(() => {
    let live = true;

    const measure = () => {
      if (!live) return;
      const next: Record<number, number> = {};
      nameRefs.current.forEach((el, channel) => {
        // jsdom does not implement getComputedTextLength at all - it is absent
        // rather than returning 0 - so this is a guard, not defensiveness.
        // Calling it unguarded threw and took 89 tests down with it.
        next[channel] =
          typeof el.getComputedTextLength === 'function' ? el.getComputedTextLength() : 0;
      });
      setNameWidths((prev) => {
        const same =
          Object.keys(next).length === Object.keys(prev).length &&
          Object.entries(next).every(([k, v]) => prev[Number(k)] === v);
        return same ? prev : next;
      });
    };

    measure();

    // Measured a second time once the webfont is in, and this is not belt and
    // braces - the first pass is actively wrong without it. A layout effect
    // runs before the font swaps, so the first measurement is taken in the
    // fallback face, which is wider: SEED NET 01 measured 89.4 units against
    // its real 60.9. `end`-anchored labels hid it, since their mark sits at the
    // anchor and ignores the width entirely, while every `start` and `middle`
    // label put the mark ~26 units past the name.
    //
    // `document.fonts` is absent under jsdom, hence the guard rather than a
    // bare chain.
    if (typeof document !== 'undefined' && document.fonts) {
      void document.fonts.ready.then(measure);
    }

    return () => {
      live = false;
    };
  }, [assignments, channelCount, geometryOptions]);

  const byChannel = new Map<number, WheelChannelAssignment>();
  for (const a of assignments) {
    byChannel.set(a.channel, a);
  }

  const assignedCount = geometry.positions.filter((p) => byChannel.has(p.channel)).length;

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 ${TOP_TRIM} ${geometry.width} ${geometry.height - TOP_TRIM}`}
        width="100%"
        role="img"
        aria-label={`${title}: ${assignedCount} of ${channelCount} channels assigned`}
        style={{ fontFamily: FONT_STACK, display: 'block', overflow: 'visible' }}
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx={geometry.cx} cy={geometry.cy} r={geometry.hubRadius} />
          </clipPath>
        </defs>
        {/* Once per wheel, however many channels reference it. */}
        <IceMarkDefs />

        {/* Ring band: the numbered dial face. */}
        <circle
          cx={geometry.cx}
          cy={geometry.cy}
          r={(geometry.ringOuter + geometry.ringInner) / 2}
          fill="none"
          stroke={ACCENT}
          strokeOpacity={0.14}
          strokeWidth={geometry.ringOuter - geometry.ringInner}
        />
        <circle
          cx={geometry.cx}
          cy={geometry.cy}
          r={geometry.ringOuter}
          fill="none"
          stroke={ACCENT}
          strokeWidth={1.5}
        />
        <circle
          cx={geometry.cx}
          cy={geometry.cy}
          r={geometry.ringInner}
          fill="none"
          stroke={ACCENT_DIM}
          strokeWidth={1.5}
        />

        {/* The wheel's name, inside the ring and directly above the hub. The
            space between the top channel labels and the emblem is otherwise
            dead, and putting the caption there buys back the line the sheet
            used to spend below the wheel. */}
        {caption ? (
          <text
            x={geometry.cx}
            y={geometry.cy - geometry.ringInner + CAPTION_BASELINE_DROP}
            textAnchor="middle"
            style={{
              fontFamily: FONT_STACK,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontSize: 15,
            }}
            fill={captionMarked ? SHEET_CHANGED : 'currentColor'}
          >
            {caption}
          </text>
        ) : null}

        {/* Hub: the squadron emblem, which is how a wheel reads as "ours". */}
        {emblemUrl ? (
          <image
            href={emblemUrl}
            x={geometry.cx - geometry.hubRadius}
            y={geometry.cy - geometry.hubRadius}
            width={geometry.hubRadius * 2}
            height={geometry.hubRadius * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : null}
        <circle
          cx={geometry.cx}
          cy={geometry.cy}
          r={geometry.hubRadius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={1}
        />

        {geometry.positions.map((pos) => {
          const assignment = byChannel.get(pos.channel);
          const isAssigned = Boolean(assignment);
          // Frequency only. The net ID is deliberately not on the wheel: the
          // dial answers "what is on this channel", and the name plus frequency
          // answer it. The ID stays available in the Nets Library and the
          // wheel's accessible table.
          const detailLines = assignment
            ? formatNetFrequencyLines(assignment.txFreq, assignment.rxFreq, assignment.freqUnit)
            : [];

          // The TOP axis label, and only that one, is nudged down by the lines
          // it is not using.
          //
          // Its block hangs back toward the dial, so the geometry has to place
          // it for the worst case -- a net with both a TX and an RX line -- or a
          // two-line label there lands on the ring. Most nets carry one line,
          // and a couple carry none, so that reservation left the commonest case
          // visibly adrift: 19 units off its own tick against the bottom axis
          // label's 0, which reads as net 9 having come loose from the wheel.
          //
          // The bottom axis label needs none of this. Its block hangs away from
          // the dial, so it sits flush at any line count.
          //
          // This lives here rather than in wheel-geometry because the line count
          // is a property of the assignment, which the geometry deliberately
          // knows nothing about -- it is handed a channel count and nothing else.
          const isTopAxis = pos.labelPos.anchor === 'middle' && pos.labelPos.y < geometry.cy;
          const labelY = isTopAxis
            ? pos.labelPos.y +
              (MAX_DETAIL_LINES - detailLines.length) * FREQ_LINE_STEP
            : pos.labelPos.y;

          // Two lines are TX then RX. One line is either a shared frequency or
          // only one of the pair, and a mark on either half is a change to it.
          const marks = assignment?.highlights;
          const lineMarked = (i: number) =>
            detailLines.length === 2
              ? isMarked(marks, i === 0 ? 'tx' : 'rx')
              : isMarked(marks, 'tx') || isMarked(marks, 'rx');

          return (
            <g key={pos.channel}>
              <line
                x1={pos.tick.inner.x}
                y1={pos.tick.inner.y}
                x2={pos.tick.outer.x}
                y2={pos.tick.outer.y}
                stroke={isAssigned ? ACCENT : 'currentColor'}
                strokeOpacity={isAssigned ? 1 : 0.25}
                strokeWidth={isAssigned ? 2 : 1}
              />
              {/* Unassigned positions get no leader: at 16 channels a mostly
                  empty wheel is otherwise dominated by lines pointing at
                  nothing. The dim tick and placeholder are enough to show the
                  position exists. */}
              {/* The leader is a continuation of the tick, not a separate
                  annotation, so it matches on colour AND weight. Colour alone
                  is not enough: a 1px amber stroke on light paper antialiases
                  to a visibly paler line than the 2px tick it grows out of, so
                  the join still reads as two marks that happen to touch. */}
              {isAssigned && pos.leader ? (
                <polyline
                  points={[pos.leader.from, pos.leader.elbow, pos.leader.to]
                    .map((pt) => `${pt.x},${pt.y}`)
                    .join(' ')}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              ) : null}
              <text
                x={pos.numberPos.x}
                y={pos.numberPos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={15}
                fontWeight={700}
                fill="currentColor"
                fillOpacity={isAssigned ? 0.95 : 0.4}
              >
                {pos.channel}
              </text>

              <text
                ref={(el) => {
                  if (el) nameRefs.current.set(pos.channel, el);
                  else nameRefs.current.delete(pos.channel);
                }}
                x={pos.labelPos.x}
                y={labelY}
                textAnchor={pos.labelPos.anchor}
                fontSize={isAssigned ? 14 : 10}
                fontWeight={isAssigned ? 700 : 400}
                letterSpacing={isAssigned ? 0 : 0.6}
                fill={isAssigned && isMarked(marks, 'net') ? SHEET_CHANGED : 'currentColor'}
                fillOpacity={isAssigned ? 1 : 0.26}
                // The leader arrives at labelPos.y, so the NAME sits on that
                // line and the frequencies hang beneath it. Centring the whole
                // block on labelPos.y instead lands the line in the gap between
                // the name and the first frequency, pointing at neither.
                dy="0.35em"
              >
                {assignment ? assignment.netName : unassignedLabel}
              </text>
              {/* The mark goes on the label's OUTBOARD side - away from the
                  dial - which is not the same as "after the name".

                  A label is anchored at `labelPos.x` and the leader polyline
                  runs from the tick to exactly that point. An `end`-anchored
                  label (the left half of the dial) therefore *ends* on its own
                  leader, so trailing the mark there lands it on the line:
                  measured at zero clearance on channels 3, 5 and 7. A
                  `start`-anchored label (the right half) runs away from the
                  dial, so trailing is already clear - 60 units - while leading
                  it would walk it back into the tick arms.

                  Hence: lead on `end`, trail on `start` and on the two axes.
                  Measured clearances after this change were 15 to 74 units,
                  with nothing overlapping.

                  This is the tightest room on the sheet: SheetPreview records
                  about 24 viewBox units of slack beside the widest real label
                  and notes that the Paper clips past it. The mark plus its gap
                  spends 12 of those. Re-check the 3 and 9 o'clock labels
                  against a printed card before making it any larger. */}
              {isAssigned && assignment?.roip && (
                <use
                  href={`#${ICE_SYMBOL_ID}`}
                  x={(() => {
                    const w = nameWidths[pos.channel] ?? 0;
                    const markW = ICE_MARK_H * ICE_ASPECT;
                    switch (pos.labelPos.anchor) {
                      case 'end':
                        // Name spans [x - w, x]; go left of its far edge.
                        return pos.labelPos.x - w - ICE_MARK_GAP - markW;
                      case 'start':
                        // Name spans [x, x + w]; go right of its far edge.
                        return pos.labelPos.x + w + ICE_MARK_GAP;
                      default:
                        // Axes: name is centred on x, already 15+ units clear.
                        return pos.labelPos.x + w / 2 + ICE_MARK_GAP;
                    }
                  })()}
                  // Centred on the name's own ink rather than its baseline,
                  // which sits below the letters.
                  y={labelY - ICE_MARK_H * 0.5}
                  height={ICE_MARK_H}
                  width={ICE_MARK_H * ICE_ASPECT}
                />
              )}
              {detailLines.map((line, i) => (
                <text
                  key={line + String(i)}
                  x={pos.labelPos.x}
                  y={labelY}
                  textAnchor={pos.labelPos.anchor}
                  fontSize={12}
                  fontWeight={600}
                  fill={lineMarked(i) ? SHEET_CHANGED : 'currentColor'}
                  dy={`${1.45 + i * 1.05}em`}
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>

      {/* The SVG is decorative to a screen reader; this table is the real content. */}
      <table style={visuallyHidden}>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Channel</th>
            <th scope="col">Net</th>
            <th scope="col">Channel #</th>
            <th scope="col">Frequency</th>
          </tr>
        </thead>
        <tbody>
          {geometry.positions.map((pos) => {
            const assignment = byChannel.get(pos.channel);
            const marks = assignment?.highlights;
            return (
              <tr key={pos.channel}>
                <th scope="row">{pos.channel}</th>
                <td>
                  {assignment ? assignment.netName : unassignedLabel}
                  {/* The SVG mark is invisible to a screen reader in here, so
                      the fact is restated as text. */}
                  {assignment?.roip ? ' (ICE)' : ''}
                  {/* Red is the only signal on the drawing, so the table says
                      it in words. Inside the figure, which the slide export
                      skips, so this adds no stray text box. */}
                  {isMarked(marks, 'net') ? ' (changed)' : ''}
                </td>
                <td>{assignment?.netId ?? ''}</td>
                <td>
                  {assignment
                    ? formatNetFrequency(
                        assignment.txFreq,
                        assignment.rxFreq,
                        assignment.freqUnit,
                      )
                    : ''}
                  {isMarked(marks, 'tx') || isMarked(marks, 'rx') ? ' (changed)' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </figure>
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useSearchParams } from 'react-router';

import { branchColor } from '@/components/catalog/branch-colors';
import { chipToggleSty } from '@/components/catalog/chip-styles';
import { sheetOmitProps } from '@/components/common/sheet-export/sheet-root';
import type { Phase, Site } from '@/types';
import type { InteropModel } from './interop-model';
import { BOX_PAD, BOX_TITLE_H, assetChars, layoutFocus, layoutPhase, polylinePath } from './phase-layout';
import type { PhaseLayout } from './phase-layout';
import { CARD_HEAD, KEY, LABEL_CHAR, LINE_H, LOOSE, NO_GAP, NO_LOCATION, TAG_W, TIER_SELECT, TITLE_CHAR, clip, layoutInput, pictureOf, requirementText } from './phase-picture-model';
import type { Card, Kind, Line } from './phase-picture-model';
import { PAIR_COLOR } from './phase-plan-model';
import type { RequirementEntry } from './phase-plan-model';
import { focusUnit, writeShow } from './phase-show';
import type { Show } from './phase-show';
import { StatusIcon } from './status-icon';

/** The width laid out for before the container has been measured, and when it cannot be: a test renderer has no layout. */
const FALLBACK_W = 1000;

// The drawing is at the container's real width, one unit to a pixel, so the
// type below is the type on screen and nothing in it is under 11px.
/** Whether a layout fits is judged at a width rounded down to this, so a window being dragged does not lay out on every pixel. */
const FIT_STEP = 24;

const DIM = 0.14;

/** One press of Zoom in or out, and the range it stays inside. */
const ZOOM_STEP = 1.25;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

/** A location box is a faint tint over the paper, and a line under its title is hidden by the same tint, solid, so the title reads whole. */
const BOX_FILL = 'rgba(0,0,0,0.025)';
const BOX_TINT = 'color-mix(in srgb, var(--shf-paper) 97.5%, black)';

const displaySty: CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
};
const monoSty: CSSProperties = { fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' };
const fade = (opacity: number): CSSProperties => ({ opacity, transition: 'opacity 120ms' });

/**
 * `tag` is where the unit is, under its assets, for the picture that draws no
 * location boxes. `onPick`, when given, makes the card a way to put Focus on
 * its unit.
 */
interface UnitCardProps {
  card: Card;
  opacity: number;
  tag?: string;
  onPick?: () => void;
  onHover: (id: string | null) => void;
}

function UnitCard(props: UnitCardProps) {
  const { x, y, w, h } = props.card;
  return (
    <>
      {/* The lines run under the cards, and a faded card must still hide them, so it keeps an opaque paper base outside the fade. */}
      {props.opacity < 1 && <rect x={x} y={y} width={w} height={h} style={{ fill: 'var(--shf-paper)' }} />}
      <UnitCardBody {...props} />
    </>
  );
}

function UnitCardBody({ card, opacity, tag, onPick, onHover }: UnitCardProps) {
  const { column: c, x, y, w, h } = card;
  const chipW = c.branch.length * 7 + 10;
  // The chip, when there is one, sits at the right edge, so the label has what is left.
  const room = w - 30 - 8 - (c.branch ? chipW + 8 : 0);
  const label = clip(c.label, Math.floor(room / LABEL_CHAR));
  const chipX = x + w - 8 - chipW;
  return (
    <g
      data-testid="phase-unit"
      data-unit={c.participantId}
      data-box={card.boxKey}
      data-supported={card.supported ? 'true' : 'false'}
      style={onPick ? { ...fade(opacity), cursor: 'pointer' } : fade(opacity)}
      onClick={onPick}
      onMouseEnter={() => { onHover(c.participantId); }}
      onMouseLeave={() => { onHover(null); }}
    >
      <title>{onPick ? `Focus on ${c.label}` : c.name}</title>
      <rect
        x={x} y={y} width={w} height={h}
        style={{ fill: 'var(--shf-white)', stroke: card.supported ? 'var(--shf-amber)' : 'var(--border-soft)', strokeWidth: card.supported ? 2 : 1 }}
      />
      <rect x={x} y={y} width={w} height={4} style={{ fill: c.color || 'var(--shf-amber)' }} />
      <circle cx={x + 16} cy={y + 20} r={5} style={{ fill: c.color || 'transparent', stroke: c.color ? 'none' : 'var(--shf-graphite-600)' }} />
      <text x={x + 28} y={y + 25} style={{ ...displaySty, fontSize: 14, fill: 'var(--fg-1)' }}>{label}</text>
      {c.branch && (
        <g data-testid="phase-unit-branch">
          <rect x={chipX} y={y + 11} width={chipW} height={18} rx={2} style={{ fill: branchColor(c.branch) }} />
          <text
            x={chipX + chipW / 2} y={y + 24} textAnchor="middle"
            style={{ ...monoSty, fontSize: 11, fontWeight: 700, fill: c.branch === 'USA' ? 'var(--shf-black)' : 'var(--shf-white)' }}
          >
            {c.branch}
          </text>
        </g>
      )}
      {card.assets.map((line, i) => (
        <text key={line} x={x + 12} y={y + CARD_HEAD + 4 + i * LINE_H} style={{ ...monoSty, fontSize: 11, letterSpacing: 0, fill: 'var(--fg-2)' }}>
          {line}
        </text>
      ))}
      {tag !== undefined && (
        <text
          data-testid="phase-unit-place" x={x + 12} y={y + CARD_HEAD + 4 + card.assets.length * LINE_H}
          style={{ ...monoSty, fontSize: 11, letterSpacing: 0, fill: 'var(--fg-3)' }}
        >
          {clip(`@ ${tag}`, assetChars(w))}
        </text>
      )}
      {card.supported && (
        <g data-testid="phase-supported">
          <rect x={x + w - TAG_W - 8} y={y - 9} width={TAG_W} height={18} rx={2} style={{ fill: 'var(--shf-amber)' }} />
          <text x={x + w - TAG_W / 2 - 8} y={y + 4} textAnchor="middle" style={{ ...monoSty, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', fill: 'var(--shf-black)' }}>
            {TIER_SELECT.toUpperCase()}
          </text>
        </g>
      )}
    </g>
  );
}

/** How a line of each status is stroked: the picture's lines and the legend's samples both read this, so they cannot disagree. */
const lineStroke = (kind: Kind): CSSProperties => ({
  stroke: PAIR_COLOR[kind], strokeWidth: 2.5, strokeDasharray: kind === 'relay' ? '8 5' : undefined,
});

const keyItemSty: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };

/**
 * One switch of the picture's controls. The toggle style is made for the dark
 * canvas; these rows are on paper, so what it paints in paper is repainted.
 */
const choice = (label: string, active: boolean, onPick: () => void, key = label) => (
  <button
    key={key} type="button" aria-pressed={active} onClick={onPick}
    style={{ ...chipToggleSty(active, true), ...(active ? {} : { color: 'var(--fg-1)', border: '1px solid var(--border-soft)' }) }}
  >
    {label}
  </button>
);

/**
 * What the lines mean, always all of it so the key reads the same in every
 * phase, with the switch for what is shown. HTML rather than part of the
 * drawing, so it never competes with the layout for room.
 */
function Legend({ show, onShow, zoom }: {
  show: Show;
  /** Absent in the export's copy, which is a document with no controls on it. */
  onShow?: (s: Show) => void;
  /** Likewise absent in the export's copy. `scale` is what is drawn now, fit or not. */
  zoom?: { fit: boolean; scale: number; onFit: () => void; onStep: (factor: number) => void };
}) {
  return (
    <div style={{ ...monoSty, fontSize: 11, color: 'var(--fg-2)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 24px', margin: '0 0 12px' }}>
      <ul aria-label="Key" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 20px' }}>
        {KEY.map(({ kind, text }) => (
          <li key={kind} style={keyItemSty}>
            <svg aria-hidden="true" width={32} height={8} viewBox="0 0 32 8" style={{ flexShrink: 0 }}>
              <line data-testid="phase-legend-line" data-status={kind} x1={0} y1={4} x2={32} y2={4} style={lineStroke(kind)} />
            </svg>
            <StatusIcon kind={kind} color={PAIR_COLOR[kind]} size={12} />
            {text}
          </li>
        ))}
        <li style={keyItemSty}>
          <span data-testid="phase-legend-supported" aria-hidden="true" style={{ width: 22, height: 14, flexShrink: 0, boxSizing: 'border-box', background: 'var(--shf-white)', borderWidth: 2, borderStyle: 'solid', borderColor: 'var(--shf-amber)' }} />
          {TIER_SELECT}
        </li>
      </ul>
      {onShow && (
        // A screen affordance, so the on-screen picture exported as it stands leaves it out.
        <div {...sheetOmitProps()} role="group" aria-label="Show" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Show:</span>
          {choice('All', show === 'all', () => { onShow('all'); })}
          {choice('Gaps', show === 'gaps', () => { onShow('gaps'); })}
          {choice('Focus', show === 'focus', () => { onShow('focus'); })}
        </div>
      )}
      {zoom && (
        // Fit is the default so a thirteen-unit phase is seen whole; the type gets small
        // and the zoom is how a viewer reads it. The print sheet and the exports are
        // untouched because they are documents.
        <div {...sheetOmitProps()} role="group" aria-label="Zoom" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Zoom:</span>
          {choice('Fit', zoom.fit, zoom.onFit)}
          <button type="button" aria-label="Zoom out" onClick={() => { zoom.onStep(1 / ZOOM_STEP); }} style={{ ...chipToggleSty(false, true), color: 'var(--fg-1)', border: '1px solid var(--border-soft)' }}>{'\u2212'}</button>
          <span aria-live="polite" style={{ ...monoSty, minWidth: 40, textAlign: 'center' }}>{`${String(Math.round(zoom.scale * 100))}%`}</span>
          <button type="button" aria-label="Zoom in" onClick={() => { zoom.onStep(ZOOM_STEP); }} style={{ ...chipToggleSty(false, true), color: 'var(--fg-1)', border: '1px solid var(--border-soft)' }}>+</button>
        </div>
      )}
    </div>
  );
}

type Hover = { kind: 'unit'; id: string } | { kind: 'line'; id: string } | null;

/**
 * The phase as a picture: location boxes with the units that sit there, and
 * one line per requirement between the two units it names, coloured by
 * whether they can deliver it - solid green when they share a means, dashed
 * amber when it takes a relay through another unit, solid red when nothing
 * links them. The phase's tier select wears an amber border and a tag.
 * Under it the same requirements as a list, so it reads without hovering.
 *
 * Draws what it is given and computes nothing about interoperability: the
 * statuses come from `phaseRequirements` over the phase's model, and where
 * everything goes comes from `layoutPhase`, which is asynchronous, so the
 * previous drawing stays up while the next is worked out. Hovering a card, or
 * a line, steps every other line back. The list under the picture carries the
 * same facts for a keyboard or a screen reader.
 *
 * Show picks what is drawn. All is the whole phase, in the layout above. Gaps
 * keeps every card where All has it and draws only the relay and no-means
 * lines, the units with none faded, so the mental map holds. Focus is
 * `layoutFocus`: one unit in the middle and its partners round it, chosen
 * from a row of chips or by clicking a card in the other two. In every mode the
 * lines run under the cards and the pills over them, and the list shows what
 * the picture does.
 *
 * `fixed` is for the export's off-screen copy: the mode and the focused unit
 * are given rather than read from this viewer's storage and the URL, and the
 * controls that change them are not drawn, so the copy is the picture and its
 * list with nothing to click. `data-phase-state` says when it has settled,
 * because the layout is asynchronous and the exporter has nothing else to wait on.
 */
export function PhasePicture({ model, phase, sites, entries, fixed }: {
  model: InteropModel;
  phase: Phase;
  sites: Site[];
  entries: RequirementEntry[];
  fixed?: { show: Show; focusId: string | null };
}) {
  const [hover, setHover] = useState<Hover>(null);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState(0);
  const [laid, setLaid] = useState<PhaseLayout | null>(null);
  // Why the layout failed, when it did: shown under the message, because "could not" alone sent a stale tab's chunk error off to be diagnosed as data.
  const [failed, setFailed] = useState<string | null>(null);
  // 'fit' sizes the drawing to the canvas; a number is the viewer's own scale. Back to fit with each phase.
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [zoomPhase, setZoomPhase] = useState(phase.id);
  if (zoomPhase !== phase.id) {
    setZoomPhase(phase.id);
    setZoom('fit');
  }
  // Always opens on All, the left end of the Show chips, so the three read
  // left to right from a known start; it used to restore the viewer's last
  // choice, which meant a unit clicked yesterday reopened the view in Focus.
  // The choice is still written so the print and deck exports draw what the
  // screen shows, which is why the mount writes All too.
  const [shownMode, setShow] = useState<Show>('all');
  useEffect(() => { writeShow('all'); }, []);
  const show = fixed ? fixed.show : shownMode;
  const [searchParams, setSearchParams] = useSearchParams();
  const focusParam = fixed ? fixed.focusId : searchParams.get('focus');
  const setFocusParam = useCallback((id: string) => {
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set('focus', id);
      return n;
    }, { replace: true });
  }, [setSearchParams]);
  // Laid out at the width it is drawn at, so a unit of the drawing is a pixel and the type is the size it says.
  useLayoutEffect(() => {
    if (!wrap) return undefined;
    setMeasured(Math.floor(wrap.clientWidth));
    const watch = new ResizeObserver((seen) => {
      const w = seen[0]?.contentRect.width;
      if (w !== undefined) setMeasured(Math.floor(w));
    });
    watch.observe(wrap);
    return () => { watch.disconnect(); };
  }, [wrap]);
  const width = measured > 0 ? measured : FALLBACK_W;
  const fit = Math.floor(width / FIT_STEP) * FIT_STEP;
  const labelOf = useMemo(() => {
    const byId = new Map(model.columns.map((c) => [c.participantId, c.label]));
    return (id: string) => byId.get(id) ?? id;
  }, [model.columns]);
  const input = useMemo(() => layoutInput(model, phase, sites, entries, labelOf), [model, phase, sites, entries, labelOf]);

  // All and Gaps are laid out by ELK, which is asynchronous and the only thing that brings it in; Focus is worked out here and now.
  useEffect(() => {
    if (show === 'focus' || input.units.length === 0) return undefined;
    let live = true;
    layoutPhase(input, { width: fit }).then(
      (l) => { if (live) { setLaid(l); setFailed(null); } },
      (e: unknown) => { if (live) setFailed(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [show, input, fit]);

  // The unit Focus is on: the one in the URL when the phase has it, else the supported one, else the one with most requirements.
  const focusId = useMemo(() => focusUnit(input, focusParam), [focusParam, input]);
  const focused = useMemo(
    () => (show === 'focus' && focusId !== null ? layoutFocus(input, focusId, { width }) : null),
    [show, focusId, input, width],
  );
  const placed = show === 'focus' ? focused : laid;

  if (model.columns.length === 0) {
    return (
      <div data-phase-state="ready" style={{
        border: '1px dashed var(--border-soft)', background: 'rgba(0,0,0,0.02)',
        padding: '16px 18px', fontFamily: 'var(--font-body)', fontSize: 13,
        color: 'var(--fg-3)', fontStyle: 'italic', lineHeight: 1.5,
      }}>
        No units are in this phase.
      </div>
    );
  }

  // What is drawn in this mode, from the same derivation the deck's native slides read.
  const { cards, lines, gaps, gapUnits, listed, gapsText } = pictureOf({ input, placed, show, focusId, entries });

  const lit = (l: Line) => hover === null
    || (hover.kind === 'unit' ? l.entry.a === hover.id || l.entry.b === hover.id : l.id === hover.id);
  const touched = new Set(lines.filter((l) => hover?.kind === 'line' && lit(l)).flatMap((l) => [l.entry.a, l.entry.b]));
  const cardOpacity = (id: string) => Math.min(
    hover?.kind === 'line' && !touched.has(id) ? 0.4 : 1,
    show === 'gaps' && !gapUnits.has(id) ? NO_GAP : 1,
  );
  const pick = (id: string) => {
    setShow('focus');
    writeShow('focus');
    setFocusParam(id);
  };
  const focusLabel = focusId === null ? '' : labelOf(focusId);

  const hoverLine = (l: Line) => ({
    onMouseEnter: () => { setHover({ kind: 'line', id: l.id }); },
    onMouseLeave: () => { setHover(null); },
  });
  const drawLine = (l: Line) => {
    const d = polylinePath(l.points);
    return (
      <g
        key={l.id}
        data-testid="phase-line"
        data-line={l.id}
        data-status={l.kind}
        data-a={l.entry.a}
        data-b={l.entry.b}
        style={fade(lit(l) ? 1 : DIM)}
        {...hoverLine(l)}
      >
        <title>{l.title}</title>
        <path d={d} fill="none" style={lineStroke(l.kind)} />
        <path d={d} fill="none" style={{ stroke: 'transparent', strokeWidth: 14 }} />
      </g>
    );
  };
  // Every pill is drawn after every line, so no line is ever seen running through the text on one.
  const drawPill = (l: Line) => {
    const { x, y, w, h } = l.label;
    return (
      <g key={l.id} data-testid="phase-line-pill" data-line={l.id} style={fade(lit(l) ? 1 : DIM)} {...hoverLine(l)}>
        <title>{l.title}</title>
        <rect x={x} y={y} width={w} height={h} rx={l.badge === null ? 2 : h / 2} style={{ fill: 'var(--shf-paper)', stroke: PAIR_COLOR[l.kind] }} />
        <text data-testid="phase-line-label" x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" style={{ ...monoSty, fontSize: 11, letterSpacing: 0, fill: 'var(--fg-1)' }}>
          {l.badge === null ? l.text : String(l.badge)}
        </text>
      </g>
    );
  };
  const badgeOf = new Map(lines.flatMap((l) => (l.badge === null ? [] : [[l.id, l.badge] as const])));

  // Wider than the container only when no layout fits it; the frame then scrolls, and the page never does.
  const drawnW = placed ? Math.max(placed.width, width) : width;
  // The same figure the frame's height is capped at when zoomed in. Never scaled up in fit mode.
  const availH = Math.max(420, window.innerHeight - 230);
  const scale = fixed || !placed ? 1 : zoom === 'fit' ? Math.min(1, width / drawnW, availH / placed.height) : zoom;
  const zoomControl = fixed ? undefined : {
    fit: zoom === 'fit',
    scale,
    onFit: () => { setZoom('fit'); },
    onStep: (factor: number) => { setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale * factor))); },
  };

  return (
    <div ref={setWrap} data-phase-state={placed ? 'ready' : failed !== null ? 'failed' : 'pending'} style={{ minWidth: 0 }}>
      <Legend show={show} onShow={fixed ? undefined : (s) => { setShow(s); writeShow(s); }} zoom={zoomControl} />
      {show === 'gaps' && input.shown.size > 0 && (
        <div
          data-testid="phase-gaps-message" role="status"
          style={{ ...monoSty, fontSize: 12, fontWeight: 600, margin: '0 0 12px', color: gaps.length === 0 ? PAIR_COLOR.direct : 'var(--fg-1)' }}
        >
          {gapsText}
        </div>
      )}
      {show === 'focus' && !fixed && (
        <div role="group" aria-label="Focus unit" style={{ ...monoSty, fontSize: 11, color: 'var(--fg-2)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '0 0 12px' }}>
          <span>Unit:</span>
          {input.units.map((u) => choice(u.label, u.id === focusId, () => { setFocusParam(u.id); }, u.id))}
        </div>
      )}
      {placed ? (
        // Fitted, nothing overflows. Zoomed in past the window, the drawing scrolls inside its frame, which is then no taller than the window, so the scrollbar is at hand rather than at the foot of a long page.
        <div style={{ overflow: 'auto', maxHeight: !fixed && placed.height * scale > availH ? availH : fixed && drawnW > width ? 'max(420px, calc(100vh - 230px))' : undefined }}>
          <svg
            role="img"
            aria-label={show === 'focus' ? `Who ${focusLabel} must talk to in this phase` : 'Who must talk to whom in this phase, by location'}
            viewBox={`0 0 ${String(drawnW)} ${String(placed.height)}`}
            width={fixed ? (drawnW > width ? drawnW : '100%') : drawnW * scale}
            height={fixed ? undefined : placed.height * scale}
            // On screen a fitted drawing is narrower than its frame and sits centred in it;
            // against the left edge it read as if the right half were missing (maintainer, 10-19).
            style={{ display: 'block', maxWidth: fixed && drawnW <= width ? '100%' : undefined, margin: fixed ? undefined : '0 auto' }}
          >
            {/* Lines first, so they are under the boxes' titles and the cards, which are opaque: a line that crosses one never cuts its text. The pills are over everything, so each is legible. */}
            <g>{lines.filter((l) => !lit(l)).map(drawLine)}</g>
            <g>{lines.filter(lit).map(drawLine)}</g>
            {placed.boxes.map((b) => {
              const loose = b.id === LOOSE;
              return (
                // A box is a faint tint over the lines, and no obstacle to hovering one.
                <g key={b.id} data-testid="phase-box" data-box={loose ? LOOSE : b.id} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={b.x} y={b.y} width={b.w} height={b.h}
                    style={{ fill: BOX_FILL, stroke: 'var(--border-soft)', strokeDasharray: loose ? '6 4' : undefined }}
                  />
                  <line x1={b.x} y1={b.y + BOX_TITLE_H - 6} x2={b.x + b.w} y2={b.y + BOX_TITLE_H - 6} style={{ stroke: 'var(--border-soft)' }} />
                  <text
                    data-testid="phase-box-title"
                    x={b.x + BOX_PAD} y={b.y + 21}
                    style={{ ...monoSty, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', fill: loose ? 'var(--fg-3)' : 'var(--fg-1)', stroke: BOX_TINT, strokeWidth: 4, paintOrder: 'stroke' }}
                  >
                    {clip(b.name, Math.floor((b.w - 2 * BOX_PAD) / TITLE_CHAR))}
                  </text>
                </g>
              );
            })}
            {cards.map((card) => {
              const id = card.column.participantId;
              const partner = show === 'focus' && id !== focusId;
              return (
                <UnitCard
                  key={id} card={card} opacity={cardOpacity(id)}
                  tag={partner ? (input.places.get(id) ?? NO_LOCATION) : undefined}
                  onPick={fixed || (show === 'focus' && !partner) ? undefined : () => { pick(id); }}
                  onHover={(unit) => { setHover(unit === null ? null : { kind: 'unit', id: unit }); }}
                />
              );
            })}
            <g>{lines.filter((l) => !lit(l)).map(drawPill)}</g>
            <g>{lines.filter(lit).map(drawPill)}</g>
          </svg>
        </div>
      ) : (
        <div data-testid="phase-layout-state" style={{ ...monoSty, fontSize: 11, color: 'var(--fg-3)' }}>
          {failed === null ? 'Laying out…' : (
            <>
              <div>Could not lay out the picture. Reload the page to try again.</div>
              <div data-testid="phase-layout-reason" style={{ marginTop: 4, opacity: 0.8 }}>{failed}</div>
            </>
          )}
        </div>
      )}

      {input.unused.length > 0 && (
        <div data-testid="phase-unused" style={{ ...monoSty, fontSize: 11, color: 'var(--fg-3)', marginTop: 12 }}>
          {`Not used this phase: ${input.unused.join(', ')}`}
        </div>
      )}

      {show === 'focus' && focusId !== null && listed.length === 0 ? (
        <div data-testid="phase-focus-empty" style={{ ...monoSty, fontSize: 11, color: 'var(--fg-3)', marginTop: 12 }}>
          {`${focusLabel} has no requirements in this phase`}
        </div>
      ) : entries.length === 0 ? (
        <div style={{ ...monoSty, fontSize: 11, color: 'var(--fg-3)', marginTop: 12 }}>
          No requirements set for this phase
        </div>
      ) : listed.length === 0 ? null : (
        <ul aria-label="Requirements" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 4 }}>
          {listed.map((e) => {
            const { text, color } = requirementText(e, labelOf);
            const badge = badgeOf.get(e.id);
            return (
              <li key={e.id} data-testid="phase-requirement" data-status={e.status.status} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12 }}>
                {badge !== undefined && (
                  <span
                    data-testid="phase-requirement-badge" title={`Numbered ${String(badge)} on the picture`}
                    style={{ ...monoSty, fontSize: 11, fontWeight: 700, letterSpacing: 0, minWidth: 22, textAlign: 'center', border: `1px solid ${color}`, borderRadius: 9, color: 'var(--fg-1)' }}
                  >
                    {badge}
                  </span>
                )}
                <span style={{ ...displaySty, fontSize: 13, color: 'var(--fg-1)' }}>{`${e.aLabel} - ${e.bLabel}`}</span>
                <span style={{ ...monoSty, fontSize: 11, fontWeight: 600, color }}>{text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

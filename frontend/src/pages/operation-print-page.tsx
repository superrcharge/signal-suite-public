import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Typography } from '@mui/material';

import { LoadingSpinner } from '@/components/common';
import { PrintPageShell } from '@/components/common/sheet-export';
import { readPrintParams } from '@/components/operations/operation-print-params';
import { chipToggleSty } from '@/components/catalog/chip-styles';
import { PhaseSwitch } from '@/components/operations/phase-switch';
import { planPhaseDeck } from '@/components/operations/phase-deck-plan';
import type { DeckPlan, DeckSlidePlan } from '@/components/operations/phase-deck-plan';
import { PhaseSheet, SHEET_PAD_X } from '@/components/operations/phase-deck-sheet';
import { useInteropInput } from '@/components/operations/use-interop-input';
import { useOperation } from '@/services';
import type { Site } from '@/types';

/** Marks each printed page, so the print-only rule below can find them. */
const PAGE_ATTR = 'data-operation-print-page';
const ROOT_ATTR = 'data-operation-print-root';
/** Marks the box that holds every page, which is what the toolbar's preview zoom scales. */
const ZOOM_ATTR = 'data-preview-zoom';

const ZOOM_STEP = 1.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

/**
 * Letter landscape less the shell's 0.4in margin all round (`@page`, in
 * `PrintPageShell`): 10.2 by 7.7 inches at 96 to the inch. The height is a
 * hair under, because a page box exactly as tall as the page's content area is
 * what makes a browser add a blank page after it.
 */
export const PAGE_W = 979;
export const PAGE_H = 738;

/**
 * On paper the pages follow one another with nothing between them. On screen
 * they are sheets on the dark canvas, which needs a gap and a shadow that a
 * printer would otherwise draw. In `document.head` with the shell's `@page`,
 * never an emotion `sx`, for the reason `printOnlyCss` records.
 */
const PRINT_ONLY_CSS =
  `@media print { [${ROOT_ATTR}] { display: block !important; } ` +
  `[${PAGE_ATTR}] { box-shadow: none !important; margin: 0 !important; } ` +
  // Preview only: the paper is what the sheet's own fit scale says, so the
  // zoom is undone for print, and the wrapper is a plain block like the root.
  `[${ZOOM_ATTR}] { zoom: 1 !important; display: block !important; } }`;

function usePrintOnlyCss() {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = PRINT_ONLY_CSS;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);
}

/** True once every picture on the page has laid out, or given up: its layout is asynchronous, and a page printed before it settles prints "Laying out". */
function useSettled(active: boolean): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const check = () => {
      const states = Array.from(document.querySelectorAll('[data-phase-state]')).map((e) => e.getAttribute('data-phase-state'));
      if (states.every((s) => s === 'ready' || s === 'failed')) setSettled(true);
    };
    check();
    const timer = window.setInterval(check, 100);
    return () => { window.clearInterval(timer); };
  }, [active]);
  return settled;
}

/**
 * One printed page: a phase's sheet, drawn at the paper's width and fitted to
 * the paper when it does not fit as it is.
 *
 * A phase is a page, so one that comes out taller than the page is scaled down
 * rather than run on to a second; and one whose picture needs more width than
 * the paper has (a picture too wide for its frame scrolls inside it, and a
 * scrollbar prints) gets a sheet as wide as the picture asks for, scaled down to
 * the paper. Either way the type is the screen's times one factor, and nothing
 * is cut off. The width only ever grows, so a layout that changes with it cannot
 * set the two off against each other.
 */
function PrintPage({ slide, sites, plan, last }: { slide: DeckSlidePlan; sites: Site[]; plan: DeckPlan; last: boolean }) {
  const inner = useRef<HTMLDivElement>(null);
  const [sheetW, setSheetW] = useState(PAGE_W);
  const [sheetH, setSheetH] = useState(PAGE_H);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return undefined;
    const measure = () => {
      // Only a picture that overflows its frame is given a pixel width; the rest are 100%.
      const asked = Array.from(el.querySelectorAll('svg[role="img"]'))
        .map((svg) => svg.getAttribute('width') ?? '')
        .filter((w) => /^\d+(\.\d+)?$/.test(w))
        .map(Number);
      if (asked.length > 0) setSheetW((w) => Math.max(w, Math.ceil(Math.max(...asked)) + 2 * SHEET_PAD_X));
      setSheetH(el.offsetHeight);
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => { watch.disconnect(); };
  }, []);
  const fit = Math.min(1, PAGE_W / sheetW, PAGE_H / Math.max(1, sheetH));
  return (
    <div
      {...{ [PAGE_ATTR]: '' }}
      style={{
        width: PAGE_W, height: PAGE_H, overflow: 'hidden', flexShrink: 0, background: 'var(--shf-paper)',
        boxShadow: '0 6px 40px rgba(0,0,0,0.5)', breakAfter: last ? 'auto' : 'page', breakInside: 'avoid',
      }}
    >
      {/* A transform leaves the layout box alone, which is what keeps the measure above the sheet's own size at any scale. The sheet is centred on the page by the shift. */}
      <div
        ref={inner}
        data-print-fit={String(fit)}
        style={{ width: sheetW, transform: fit < 1 ? `translateX(${String(Math.round(((PAGE_W - sheetW * fit) / 2) * 100) / 100)}px) scale(${String(fit)})` : undefined, transformOrigin: 'top left' }}
      >
        <PhaseSheet slide={slide} sites={sites} plan={plan} width={sheetW} minHeight={PAGE_H} />
      </div>
    </div>
  );
}

/**
 * The operation's Web view, chrome free and read only, for print and Save as
 * PDF: one landscape page per phase, in phase order, each the sheet the deck's
 * slide is - the title, the key, the picture in the Show mode, and the list of
 * what that mode shows. Reached from Print / Save PDF on the operation page,
 * which hands over `?show=`, `?focus=` and `?phase=` because this page has no
 * way to read that viewer's choices itself (`operation-print-params.ts`).
 *
 * A saved plan is what prints, as it is what the deck exports.
 */
export function OperationPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useOperation(id);
  const participants = useMemo(() => data?.participants ?? [], [data]);
  const phases = useMemo(() => data?.phases ?? [], [data]);
  const sites = useMemo(() => data?.sites ?? [], [data]);
  const catalog = useInteropInput(participants);
  const { show, focus, phase } = readPrintParams(searchParams);
  usePrintOnlyCss();

  // On screen only, to inspect a scaled-down sheet; never reaches the paper.
  const [previewZoom, setPreviewZoom] = useState(1);
  const zoomBy = (factor: number) => { setPreviewZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * factor))); };

  const operation = data?.operation;
  const waiting = isLoading || catalog.isLoading;
  const plan = useMemo(
    () => (operation && phases.length > 0 && !catalog.isLoading && !catalog.isError
      ? planPhaseDeck({ operation, phases, participants, input: catalog.input, sites, show, focusParam: focus, currentPhaseId: phase })
      : null),
    [operation, phases, participants, catalog.input, catalog.isLoading, catalog.isError, sites, show, focus, phase],
  );
  const settled = useSettled(plan !== null);
  // The toolbar's phase chips: All phases prints the whole deck, a phase
  // prints just its page. `?only=` so a reload keeps the choice; an id the
  // operation does not have reads as All phases.
  const onlyParam = searchParams.get('only');
  const only = onlyParam !== null && phases.some((p) => p.id === onlyParam) ? onlyParam : null;
  const choose = (next: string | null) => {
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      if (next === null) n.delete('only'); else n.set('only', next);
      return n;
    }, { replace: true });
  };
  const slides = plan ? plan.slides.filter((s) => only === null || s.phase.id === only) : [];

  const back = new URLSearchParams({ view: 'web' });
  if (phase !== null) back.set('phase', phase);
  if (focus !== null) back.set('focus', focus);

  return (
    <PrintPageShell
      orientation="landscape"
      rootAttr={ROOT_ATTR}
      backLabel="Back to operation"
      onBack={() => { void navigate(`/operations/${String(id)}?${back.toString()}`); }}
      printDisabled={plan === null || !settled}
      rootStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}
      toolbar={(
        // Exactly as wide as the paper beneath it (the shell's middle column is
        // sized to content and centred on the page, as the paper is), so the phase
        // chips sit on the paper's left edge and the preview zoom on its right,
        // with the gap between them reading as the separation it is (maintainer, 10-22).
        // Capped at the window less the Back and Print columns, or the row is 7px
        // wider than a 1280 window and the page scrolls sideways at the floor.
        <div style={{ width: `min(${String(PAGE_W)}px, calc(100vw - 320px))`, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          {phases.length > 1 && <PhaseSwitch phases={phases} value={only} onChange={choose} flush />}
          <div role="group" aria-label="Preview zoom" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--shf-font-mono, monospace)', fontSize: 12, color: 'var(--shf-graphite-300)' }}>Preview zoom:</span>
            <button type="button" aria-label="Zoom out" onClick={() => { zoomBy(1 / ZOOM_STEP); }} style={{ ...chipToggleSty(false, true), flexShrink: 0 }}>{'\u2212'}</button>
            <span aria-live="polite" style={{ fontFamily: 'var(--shf-font-mono, monospace)', fontSize: 12, minWidth: 40, textAlign: 'center' }}>{`${String(Math.round(previewZoom * 100))}%`}</span>
            <button type="button" aria-label="Zoom in" onClick={() => { zoomBy(ZOOM_STEP); }} style={{ ...chipToggleSty(false, true), flexShrink: 0 }}>+</button>
            <button type="button" aria-pressed={previewZoom === 1} onClick={() => { setPreviewZoom(1); }} style={{ ...chipToggleSty(previewZoom === 1, true), flexShrink: 0 }}>100%</button>
          </div>
        </div>
      )}
    >
      {waiting ? (
        <LoadingSpinner />
      ) : isError || !operation ? (
        <Typography color="error">Could not load this operation.</Typography>
      ) : catalog.isError ? (
        <Typography color="error">Could not load the catalog, the waveform library or the platform library.</Typography>
      ) : plan === null ? (
        <Typography sx={{ color: 'var(--shf-graphite-300)' }}>This operation has no phases to print.</Typography>
      ) : (
        <div
          {...{ [ZOOM_ATTR]: '' }}
          style={{ zoom: previewZoom, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}
        >
          {slides.map((slide, i) => (
            <PrintPage key={slide.phase.id} slide={slide} sites={sites} plan={plan} last={i === slides.length - 1} />
          ))}
        </div>
      )}
    </PrintPageShell>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Typography } from '@mui/material';

import { LoadingSpinner } from '@/components/common';
import { PrintPageShell } from '@/components/common/sheet-export';
import { MatrixSheet } from '@/components/operations/interop-matrix-sheet';
import { PAGE_H, PAGE_W, printPaging } from '@/components/operations/matrix-print-paging';
import { planMatrixDeck } from '@/components/operations/matrix-pages';
import type { MatrixPage } from '@/components/operations/matrix-pages';
import { PhaseSwitch } from '@/components/operations/phase-switch';
import { useInteropInput } from '@/components/operations/use-interop-input';
import { useOperation } from '@/services';

/** Marks each printed page and the root, so the print-only rule below finds them; the Web view's print route has its own, so neither selects the other's. */
const PAGE_ATTR = 'data-operation-matrix-print-page';
const ROOT_ATTR = 'data-operation-matrix-print-root';

/**
 * On paper the pages follow one another with nothing between them; on screen
 * they are sheets on the dark canvas. In `document.head` with the shell's
 * `@page`, never an emotion `sx`, for the reason `printOnlyCss` records.
 */
const PRINT_ONLY_CSS =
  `@media print { [${ROOT_ATTR}] { display: block !important; } ` +
  `[${PAGE_ATTR}] { box-shadow: none !important; margin: 0 !important; } }`;

function usePrintOnlyCss() {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = PRINT_ONLY_CSS;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);
}

/**
 * One printed page: a page of the Matrix, drawn at the paper's width and fitted
 * to the paper when it does not fit as it is. The plan already cut the grid to
 * what a page holds, so this is the safety net for an estimate that came out a
 * little short: a page taller than the paper is scaled down rather than run on
 * to a second, and one whose grid is wider than the paper (it would scroll
 * inside its frame, and a scrollbar prints) is given the width it asks for and
 * scaled down to the paper. The width only ever grows, so the two cannot set
 * each other off.
 */
function PrintPage({ page, last }: { page: MatrixPage; last: boolean }) {
  const inner = useRef<HTMLDivElement>(null);
  const [sheetW, setSheetW] = useState(PAGE_W);
  const [sheetH, setSheetH] = useState(PAGE_H);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return undefined;
    const measure = () => {
      const grid = el.querySelector<HTMLElement>('[role="table"]');
      const frame = grid?.parentElement;
      if (grid && frame) {
        const over = grid.scrollWidth - frame.clientWidth;
        if (over > 1) setSheetW((w) => w + Math.ceil(over));
      }
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
      <div
        ref={inner}
        data-print-fit={String(fit)}
        style={{ width: sheetW, transform: fit < 1 ? `translateX(${String(Math.round(((PAGE_W - sheetW * fit) / 2) * 100) / 100)}px) scale(${String(fit)})` : undefined, transformOrigin: 'top left' }}
      >
        <MatrixSheet page={page} width={sheetW} minHeight={PAGE_H} />
      </div>
    </div>
  );
}

/**
 * The operation's Matrix, chrome free and read only, for print and Save as
 * PDF: All phases first and then each phase in order, every one the sheet the
 * deck's slide is - the title over the grid - with a grid too wide for the paper
 * cut into column groups and one too tall into rows, the header on every page.
 * Reached from Print / Save PDF on the operation's Matrix view, which hands over
 * only `?phase=`, the phase on screen, so Back can return to it.
 *
 * The toolbar's chips choose what prints, one scope at a time, exactly as the
 * Matrix's own phase switch does (maintainer, 2026-10-13: export the one you
 * want, not every phase): All phases is the combined grid, a phase just its
 * page or pages. It opens on the scope that was on screen (`?phase=`, none
 * meaning All phases); a chip writes `?only=`, with `all` for All phases so it
 * can win over a `?phase=` that names one.
 */
export function OperationMatrixPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useOperation(id);
  const participants = useMemo(() => data?.participants ?? [], [data]);
  const phases = useMemo(() => data?.phases ?? [], [data]);
  const catalog = useInteropInput(participants);
  usePrintOnlyCss();

  const operation = data?.operation;
  const waiting = isLoading || catalog.isLoading;
  const plan = useMemo(
    () => (operation && participants.length > 0 && !catalog.isLoading && !catalog.isError
      ? planMatrixDeck({ operation, phases, input: catalog.input, paging: printPaging() })
      : null),
    [operation, phases, participants.length, catalog.input, catalog.isLoading, catalog.isError],
  );
  const known = (v: string | null): v is string => v !== null && phases.some((p) => p.id === v);
  const onlyParam = searchParams.get('only');
  const phase = searchParams.get('phase');
  // The scope that prints: a chip's choice, else the phase the Matrix was on,
  // else All phases (null). An id the operation does not have reads as All phases.
  const scope = onlyParam === 'all' ? null : known(onlyParam) ? onlyParam : known(phase) ? phase : null;
  const choose = (next: string | null) => {
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set('only', next ?? 'all');
      return n;
    }, { replace: true });
  };
  const pages = plan ? plan.pages.filter((p) => p.phaseId === scope) : [];

  const back = new URLSearchParams({ view: 'matrix' });
  if (phase !== null) back.set('phase', phase);

  return (
    <PrintPageShell
      orientation="landscape"
      rootAttr={ROOT_ATTR}
      backLabel="Back to operation"
      onBack={() => { void navigate(`/operations/${String(id)}?${back.toString()}`); }}
      printDisabled={plan === null}
      rootStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}
      toolbar={phases.length > 0 && <PhaseSwitch phases={phases} value={scope} onChange={choose} flush />}
    >
      {waiting ? (
        <LoadingSpinner />
      ) : isError || !operation ? (
        <Typography color="error">Could not load this operation.</Typography>
      ) : catalog.isError ? (
        <Typography color="error">Could not load the catalog, the waveform library or the platform library.</Typography>
      ) : plan === null ? (
        <Typography sx={{ color: 'var(--shf-graphite-300)' }}>No one has joined this operation yet, so there is no matrix to print.</Typography>
      ) : (
        pages.map((page, i) => (
          <PrintPage key={`${page.phaseId ?? 'all'}:${String(page.part)}`} page={page} last={i === pages.length - 1} />
        ))
      )}
    </PrintPageShell>
  );
}

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Box, Typography } from '@mui/material';
import { sliceModel, type MatrixModel } from './compat-matrix-model';
import type { MatrixParams } from './compat-matrix-params';
import { MatrixPrintPage, type MatrixHeading } from './JointCompatibilityMatrix';
import { useMatrixPrintPagination } from './use-matrix-print-pagination';
import { PAGE_W, PRINT_MARGIN_IN, PRINT_PAGE_CSS } from './compare-page-guides';
import { DocumentActions } from '@/components/common/sheet-export';
import '@/styles/catalog-tokens.css';

function nextFrame(): Promise<void> {
  return new Promise(resolve => { requestAnimationFrame(() => { resolve(); }); });
}

/** The print route's marker, so only the pages reach paper. */
const PRINT_ROOT_ATTR = 'data-compat-print-root';

/**
 * Under print media only the pages are visible - not the preview toolbar, and
 * not anything fixed the app mounts beside the route. Paired with compare's
 * `PRINT_PAGE_CSS`, the same letter landscape page and 0.25in margin the
 * pagination arithmetic is measured in.
 */
const ONLY_THE_SHEET_CSS =
  '@media print { body * { visibility: hidden !important; } ' +
  `[${PRINT_ROOT_ATTR}], [${PRINT_ROOT_ATTR}] * { visibility: visible !important; } ` +
  `[${PRINT_ROOT_ATTR}] { position: absolute; left: 0; top: 0; } }`;

/** The preview's blank margin around each page, in the pixels PAGE_W is in. */
const PAPER_MARGIN_PX = PRINT_MARGIN_IN * 96;

/** How long print mode waits for the twin before printing on what it has. */
const MEASURE_TIMEOUT_MS = 1500;

/**
 * The print route's body, for any matrix page: a preview of exactly the pages
 * a printer will produce, and with `print` the pages alone and the dialog.
 * Built the way `/catalog/compare/print` is, and sharing its paper, margins,
 * page split rules and Fit to one page:
 *
 * - Columns past what one page holds continue on another page across, with
 *   the waveform labels repeated; rows past one page continue down, with the
 *   header row repeated. `useMatrixPrintPagination` decides every break.
 * - Fit (`params.fit`, shared with the live page) zooms the whole sheet so it
 *   lands on one page when it can, floor 70%, with CSS `zoom` - never a
 *   transform, which print would still paginate at the unscaled size.
 * - `print` renders the pages alone and opens the dialog once the data,
 *   the fonts and the measurement are in; without it, the preview.
 *
 * The caller loads the data and builds `model` (with empty rows dropped, so
 * paper does not spend a page on waveforms nothing in the selection carries),
 * and says when it is `ready`.
 */
export function MatrixPrintPreview({
  model, params, ready, title, heading, backHref, backLabel = 'Back to compatibility',
  emptyText = 'Nothing to print. Pick columns on the compatibility page.',
  onToggleFit, onPrint, print,
}: {
  model: MatrixModel;
  params: MatrixParams;
  ready: boolean;
  /** The preview toolbar's title. */
  title: string;
  /** The printed pages' heading; see `MatrixHeading`. */
  heading?: MatrixHeading;
  backHref: string;
  backLabel?: string;
  /** Shown in place of the pages when `model` has no columns. */
  emptyText?: string;
  onToggleFit: () => void;
  /** The toolbar's Print button; opens the print route in a new tab. */
  onPrint: () => void;
  /** Whether this is the print route (`?print=1`): pages alone, then print. */
  print: boolean;
}) {
  const navigate = useNavigate();
  const printedRef = useRef(false);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  const wantsPrint = print;
  const date = new Date().toISOString().slice(0, 10);
  const { columnPages, rowPages, zoom, pageCount, measured, twin } = useMatrixPrintPagination({
    model, fit: params.fit, date, branches: params.branches, heading,
  });

  // Top-level @page and the print-only visibility, through document.head: an
  // @page inside an emotion sx object is silently dropped (AGENTS.md). Print
  // mode only, like compare, so the preview keeps the app's own page rule.
  useEffect(() => {
    if (!wantsPrint) return;
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      document.head.appendChild(styleRef.current);
    }
    styleRef.current.textContent = `${PRINT_PAGE_CSS} ${ONLY_THE_SHEET_CSS}`;
  }, [wantsPrint]);

  useEffect(() => () => {
    styleRef.current?.remove();
    styleRef.current = null;
  }, []);

  useEffect(() => {
    if (!wantsPrint || !ready || printedRef.current) return;
    let cancelled = false;
    const gate: Promise<void> = measured
      ? Promise.resolve()
      : new Promise(resolve => { setTimeout(resolve, MEASURE_TIMEOUT_MS); });
    void gate
      .then(() => document.fonts.ready)
      .then(() => nextFrame())
      .then(() => nextFrame())
      .then(() => {
        if (cancelled || printedRef.current) return;
        // Marked at the moment of printing, not when the chain starts, so a
        // StrictMode remount cannot be told it already printed.
        printedRef.current = true;
        window.print();
      });
    return () => { cancelled = true; };
  }, [wantsPrint, ready, measured]);

  // Every printed page, column chunk crossed with row page, in reading order:
  // all of chunk one's row pages, then chunk two's - compare's order.
  const pages = columnPages.flatMap((indexes, chunk) =>
    rowPages.map((rowKeys, rowPage) => ({ indexes, rowKeys, chunk, rowPage })));

  const pageBody = (p: typeof pages[number]) => (
    <MatrixPrintPage
      model={model}
      page={sliceModel(model, p.indexes, p.rowKeys)}
      first={p.rowPage === 0}
      date={date}
      branches={params.branches}
      heading={heading}
    />
  );

  if (wantsPrint) {
    return (
      <Box {...{ [PRINT_ROOT_ATTR]: '' }} sx={{ minHeight: '100vh', background: 'var(--shf-paper)' }} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
        {twin}
        {ready && pages.map((p, i) => (
          <div
            key={`${String(p.chunk)}-${String(p.rowPage)}`}
            style={{
              zoom,
              width: PAGE_W / zoom,
              breakBefore: i === 0 ? 'auto' : 'page',
              pageBreakBefore: i === 0 ? 'auto' : 'always',
            }}
          >
            {pageBody(p)}
          </div>
        ))}
      </Box>
    );
  }

  const labelOf = (abbrev: string | undefined) => model.rows.find(r => r.abbrev === abbrev)?.label ?? '';

  return (
    <Box sx={{ minHeight: '100vh', background: 'var(--shf-graphite-900)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2,
        px: 2.5, py: 0.75,
        borderBottom: '2px solid var(--shf-amber)',
        background: 'var(--shf-graphite-900)',
        flexShrink: 0,
      }}>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 2.5 }}>
          <Typography noWrap sx={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
            letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--shf-amber)',
          }}>
            {title}
          </Typography>
          <Typography
            component="button"
            type="button"
            onClick={() => { void navigate(backHref); }}
            sx={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--shf-graphite-300)', background: 'transparent', border: 'none',
              cursor: 'pointer', textDecoration: 'underline', p: 0,
              '&:hover': { color: 'var(--shf-paper)' },
            }}
          >
            {backLabel}
          </Typography>
        </Box>

        {/* Fit, then Print, right-justified - compare's preview toolbar. */}
        <DocumentActions onPrint={onPrint} printDisabled={!ready || model.columns.length === 0}>
          <Box sx={{ display: 'flex', border: '1px solid var(--shf-graphite-600)', borderRadius: '4px', overflow: 'hidden' }}>
            <button
              type="button"
              aria-pressed={params.fit}
              onClick={onToggleFit}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '5px 10px', border: 'none', cursor: 'pointer',
                background: params.fit ? 'var(--shf-amber)' : 'transparent',
                color: params.fit ? '#0A0A0A' : 'var(--shf-graphite-300)',
              }}
            >
              Fit to one page
            </button>
          </Box>
          {/* What Fit did: the zoom it landed on, or that even the floor could
              not hold the sheet on one page. */}
          {params.fit && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--shf-graphite-300)', whiteSpace: 'nowrap' }}>
              {pageCount === 1 ? `at ${String(Math.round(zoom * 100))}%` : `still ${String(pageCount)} pages at ${String(Math.round(zoom * 100))}%`}
            </span>
          )}
        </DocumentActions>
      </Box>

      <Box sx={{ flex: 1, py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {twin}
        {!ready && (
          <Typography sx={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--shf-graphite-300)' }}>Loading…</Typography>
        )}
        {ready && model.columns.length === 0 && (
          <Typography sx={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--shf-graphite-300)' }}>
            {emptyText}
          </Typography>
        )}
        {ready && model.columns.length > 0 && pages.map((p, i) => {
          const first = (p.indexes[0] ?? 0) + 1;
          const last = (p.indexes[p.indexes.length - 1] ?? 0) + 1;
          const caption =
            `Page ${String(i + 1)} of ${String(pages.length)} ` +
            `(columns ${String(first)}-${String(last)}, ${labelOf(p.rowKeys[0])} to ${labelOf(p.rowKeys[p.rowKeys.length - 1])})`;
          return (
            <Box key={`${String(p.chunk)}-${String(p.rowPage)}`} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <Typography sx={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--shf-graphite-400)',
              }}>
                {caption}
              </Typography>
              {/* The paper at its true size - it never zooms, or the preview
                  would misstate how much paper the printout uses. */}
              <Box
                data-compat-page
                sx={{
                  width: PAGE_W + 2 * PAPER_MARGIN_PX,
                  padding: `${String(PAPER_MARGIN_PX)}px`,
                  background: 'var(--shf-paper)',
                  boxShadow: '0 6px 40px rgba(0,0,0,0.5)',
                }}
              >
                {/* The printable content, which does zoom - print mode's
                    wrapper, so the preview is what printing produces. */}
                <div style={{ zoom, width: PAGE_W / zoom }}>{pageBody(p)}</div>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

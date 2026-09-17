import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Box, CircularProgress, Typography } from '@mui/material';
import type { Equipment } from '@/types';
import {
  CompareSheet,
  DARK,
  FIT_PARAM,
  GROUP_LABELS,
  IDS_PARAM,
  INK,
  PAGE_W,
  PARAMS_PARAM,
  PRINT_MARGIN_IN,
  PRINT_PAGE_CSS,
  cmp,
  paletteVars,
  resolveParams,
  resolveSelection,
  usePrintPagination,
  type ComparePalette,
  type CompareGroup,
  type CompareParam,
} from '@/components/catalog';
import { DocumentActions } from '@/components/common/sheet-export';
import { useEquipment } from '@/services';
import { compareNatural, waitForImages } from '@/utils';
import '@/styles/catalog-tokens.css';

/** `?ink=dark` selects the screen palette for paper; anything else, absent
 *  included, is the default: dark ink on a white sheet. */
const INK_PARAM = 'ink';

/** A promise that resolves on the next animation frame, so the print effect
 *  can wait for the browser to actually paint rather than just resolve a
 *  microtask. See its call site for why two of these, not one. */
function nextFrame(): Promise<void> {
  return new Promise(resolve => { requestAnimationFrame(() => { resolve(); }); });
}

/** How long the print effect waits for `usePrintPagination`'s measurement
 *  before printing anyway. A real browser measures within a frame or two;
 *  this exists only for an environment that can never measure at all (jsdom,
 *  whose ResizeObserver mock observes but never fires) so it still prints,
 *  with the same one-page-per-chunk fallback the live page falls back to,
 *  rather than hang forever waiting for a signal that will never come. */
const MEASURE_TIMEOUT_MS = 3000;

/** `g:<group>` / `r:<param.id>` to the label a reader would recognise, for
 *  the preview's "Page N of M" captions. */
function labelForKey(key: string, params: CompareParam[]): string {
  if (key.startsWith('g:')) return GROUP_LABELS[key.slice(2) as CompareGroup] ?? '';
  const id = key.slice(2);
  return params.find(p => p.id === id)?.label ?? '';
}

/** One printed page: a column chunk crossed with one of its row pages. */
interface PrintPageEntry {
  chunkIndex: number;
  chunk: Equipment[];
  rowPageIndex: number;
  rowKeys: string[];
  /** Position across the WHOLE document, print and preview both - what
   *  decides `break-before` in print mode and the "Page N of M" numerator in
   *  preview. */
  index: number;
}

/** Marks the printed pages, so the print rule below can keep them alone. */
const PRINT_ROOT_ATTR = 'data-compare-print';

/**
 * Nothing but the sheet reaches paper.
 *
 * Anything fixed-position that the app mounts beside the route - the React
 * Query devtools toggle in dev, a toast - otherwise prints on every page,
 * and the devtools badge did, in the corner of all four pages of the first
 * real PDF. Visibility rather than display: an overlay has no layout box to
 * collapse, and hiding by visibility cannot reflow the sheet it keeps.
 */
const ONLY_THE_SHEET_CSS =
  '@media print { body * { visibility: hidden !important; } ' +
  `[${PRINT_ROOT_ATTR}], [${PRINT_ROOT_ATTR}] * { visibility: visible !important; } }`;

/** The blank margin around each page in the preview, in the same pixels
 *  PRINT_MARGIN_IN and PAGE_W are already measured in, so the preview's
 *  paper box is the sheet the printer will actually produce plus its own
 *  margin, not an arbitrary picture frame. */
const PAPER_MARGIN_PX = PRINT_MARGIN_IN * 96;

/**
 * The comparison, chrome free, for print and Save as PDF - and, short of
 * that, a full preview of exactly the pages a printer will produce.
 *
 * A route rather than a print stylesheet over the live page, matching
 * `/catalog/:id/print` and `/pace/:section/print`. Hiding MainLayout's
 * sidebar, header, scroll container and two collapsible panels with
 * `@media print` rules would mean encoding that whole layout a second time in
 * CSS, and every future change to it would have to be made twice.
 *
 * It reads the same two URL parameters the live page does, plus `ink` and
 * `fit`, so the printed sheet is whatever the reader had on screen. No state
 * is passed between them, which is what lets the URL be pasted or bookmarked.
 *
 * Three root causes this rewrite fixes, all invisible from `vite build`:
 *
 * 1. The old version set `'@page'` inside an emotion `sx` object. Emotion
 *    nests whatever it is given inside a generated class rule, and a browser
 *    silently drops an `@page` that is not a top-level statement of a
 *    stylesheet, so the sheet printed on catalog-tokens.css's portrait page
 *    instead. This version injects `PRINT_PAGE_CSS` through a `<style>`
 *    element appended to `document.head`, the pace-print-page.tsx pattern,
 *    which is a real top-level rule and wins by being appended after the
 *    imported stylesheet.
 * 2. It reused `CompareMatrix`, a CSS grid inside an `overflowX: auto`
 *    wrapper with a sticky label column - both screen ideas that print
 *    clips rather than paginates. `CompareSheet` is a native `<table>`
 *    instead; see its own doc comment for why that specifically is what
 *    makes the row labels repeat per page and a row refuse to split.
 * 3. It printed the screen's dark palette, which a browser drops the
 *    background colours from by default, leaving light text on white paper.
 *    `INK` is a palette built to hold up with nothing but the text itself;
 *    `ink=dark` is offered as an opt-in for a reader who does have
 *    background graphics on, and either way `CompareSheet` asks for them via
 *    `printColorAdjust: 'exact'`.
 *
 * Unlike the datasheet's print route this one does NOT clip to a single
 * page. A comparison legitimately spans several, both here and on the live
 * page, which is why both share `usePrintPagination` rather than this route
 * inventing its own idea of where a seam - column or row - falls. Every
 * (column chunk, row page) pair prints as its own `<table>` with its own
 * `<thead>`, so the browser is never asked to decide a row break on its own.
 */
export function CatalogComparePrintPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useEquipment();
  // Guards the print effect so a re-render after the first fire (selection
  // is a fresh array reference every render) cannot open a second dialog.
  const printedRef = useRef(false);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  const catalog = useMemo(
    () => [...(data?.equipment ?? [])].sort((a, b) => compareNatural(a.nomenclature, b.nomenclature)),
    [data],
  );

  const selection = useMemo(
    () => resolveSelection(searchParams.get(IDS_PARAM), catalog),
    [searchParams, catalog],
  );
  const params = useMemo(
    () => resolveParams(searchParams.get(PARAMS_PARAM), selection),
    [searchParams, selection],
  );

  const wantsPrint = searchParams.get('print') === '1';
  const isDark = searchParams.get(INK_PARAM) === 'dark';
  const wantsFit = searchParams.get(FIT_PARAM) === '1';
  const palette: ComparePalette = isDark ? DARK : INK;
  const ready = !isLoading && !isError && selection.length > 0 && params.length > 0;

  // One measurement decides every page break - column and row - and every
  // surface below reads it back rather than computing its own. `zoom` is
  // "Fit to one page" (the `fit` URL param, `wantsFit`): the whole sheet
  // scaled down via CSS zoom, floor `FIT_FLOOR`, independent of the per-cell
  // text shrink CompareSheet always applies on paper (floor 80%, then wrap).
  // A wide value shrinking to stay on one line and a tall sheet shrinking to
  // stay on one page are two different scarcities - column width and page
  // height - so one toggle controlling both would conflate them.
  const { columnPages, rowPages, zoom, pageCount, measured, twin, density } = usePrintPagination({
    selection,
    params,
    fit: wantsFit,
  });

  // The `@page` rule goes in as soon as print mode is on, independent of
  // whether the equipment query has resolved. catalog-tokens.css declares
  // `@page { size: letter portrait }` and is imported by this page too, so
  // the landscape rule wins only by being appended after it - which means
  // "after" has to happen whether or not there is data yet, or a slow
  // network leaves this sheet printing on the datasheet's portrait page.
  useEffect(() => {
    if (!wantsPrint) return;
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      document.head.appendChild(styleRef.current);
    }
    // catalog-tokens.css also forces the print body to white, which is right
    // for INK and wrong for DARK: without this override a dark sheet paints
    // its own background correctly while the page around it - the margins,
    // and the gap between sheets on some engines - stays white.
    styleRef.current.textContent = [
      PRINT_PAGE_CSS,
      ONLY_THE_SHEET_CSS,
      isDark ? `@media print { html, body { background: ${DARK.bg} !important; } }` : '',
    ].join(' ');
  }, [wantsPrint, isDark]);

  useEffect(() => {
    return () => {
      if (styleRef.current) {
        styleRef.current.remove();
        styleRef.current = null;
      }
    };
  }, []);

  // Pagination first, then fonts, then photos, then print. The matrix is
  // mono and condensed throughout, so printing before the display face loads
  // prints the fallback; printing before `usePrintPagination` has measured
  // real row heights would print whatever row pagination its unmeasured
  // fallback guessed - one page of everything per column chunk - rather than
  // the pages the preview actually promised. `MEASURE_TIMEOUT_MS` is the
  // escape hatch for an environment that can never measure at all.
  // waitForImages is skipped entirely when nothing has a photo: it does not
  // resolve early on an empty document, so calling it unconditionally would
  // delay every print with no images by its full timeout.
  useEffect(() => {
    if (!wantsPrint || !ready || printedRef.current) return;
    let cancelled = false;
    const expectsPhoto = selection.some(eq => Boolean(eq.photo_url));

    const measurementGate: Promise<void> = measured
      ? Promise.resolve()
      : new Promise(resolve => { setTimeout(resolve, MEASURE_TIMEOUT_MS); });

    void measurementGate
      .then(() => document.fonts.ready)
      .then(() => (cancelled || !expectsPhoto ? Promise.resolve() : waitForImages()))
      // Two frames, not zero. The fit-to-page zoom and the per-cell shrink
      // both measure and then setState off a ResizeObserver once the fonts
      // (and photos) wait resolves; the first frame is where that
      // measurement's resulting re-render actually paints, and printing
      // straight off the promise chain would print the geometry from before
      // it ran. The second frame is slack for a browser that coalesces the
      // observer callback one tick later than Chrome does.
      .then(() => nextFrame())
      .then(() => nextFrame())
      .then(() => {
        if (cancelled || printedRef.current) return;
        // Marked here, at the moment of printing, never when the chain
        // starts. StrictMode mounts, cleans up and remounts in dev: marking
        // up front let the cleanup cancel the only chain while the ref told
        // the remount it had already printed, so the dialog never opened.
        printedRef.current = true;
        window.print();
      });

    return () => { cancelled = true; };
    // `measured` flipping true re-runs this effect with an already-resolved
    // gate, which is what lets a real measurement pre-empt the timeout - the
    // previous run's `cancelled` flag stops its own, now-redundant chain.
  }, [wantsPrint, ready, selection, measured]);

  // What `?ids=`/`?params=` said, plus `fit` - which is shared state with the
  // live page, so it comes back with the reader rather than silently
  // resetting - but never `print` or `ink`, both print-preview-only concerns
  // with nothing to mean on the live matrix.
  const backHref = useMemo(() => {
    const next = new URLSearchParams();
    const rawIds = searchParams.get(IDS_PARAM);
    const rawParams = searchParams.get(PARAMS_PARAM);
    if (rawIds) next.set(IDS_PARAM, rawIds);
    if (rawParams !== null) next.set(PARAMS_PARAM, rawParams);
    if (wantsFit) next.set(FIT_PARAM, '1');
    const qs = next.toString();
    return `/catalog/compare${qs ? `?${qs}` : ''}`;
  }, [searchParams, wantsFit]);

  const goBack = () => { void navigate(backHref); };

  const setInk = (next: 'paper' | 'dark') => {
    const nextParams = new URLSearchParams(searchParams);
    // Paper is the default and is never spelled out in the URL - the same
    // asymmetry `encodeParams` uses for the default parameter set, so the
    // common case stays a clean, pasteable link.
    if (next === 'dark') nextParams.set(INK_PARAM, 'dark');
    else nextParams.delete(INK_PARAM);
    setSearchParams(nextParams, { replace: true });
  };

  const toggleFit = () => {
    const nextParams = new URLSearchParams(searchParams);
    // Off is the default and is never spelled out in the URL, the same
    // asymmetry setInk above holds ink to.
    if (wantsFit) nextParams.delete(FIT_PARAM);
    else nextParams.set(FIT_PARAM, '1');
    setSearchParams(nextParams, { replace: true });
  };

  // Copies every current param, `fit` included, so the printed sheet always
  // matches whatever the preview - Paper/Dark and Fit to one page alike -
  // was showing when the reader clicked Print.
  const openPrint = () => {
    const printParams = new URLSearchParams(searchParams);
    printParams.set('print', '1');
    window.open(`/catalog/compare/print?${printParams.toString()}`, '_blank');
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress sx={{ color: 'var(--shf-amber)' }} />
      </Box>
    );
  }

  if (isError) {
    return (
      <StateMessage onBack={goBack}>
        Could not load the equipment catalog.
      </StateMessage>
    );
  }

  if (selection.length === 0 || params.length === 0) {
    return (
      <StateMessage onBack={goBack}>
        Nothing to print. Pick equipment and parameters on the compare page.
      </StateMessage>
    );
  }

  // Every printed page, column chunk crossed with row page, in reading
  // order: all of chunk one's row pages, then chunk two's, and so on - the
  // order the column captions already imply. Built once and shared by print
  // and preview mode so the two can never enumerate the pages differently.
  let colStart = 1;
  const chunkRanges = columnPages.map(chunk => {
    const start = colStart;
    const end = colStart + chunk.length - 1;
    colStart = end + 1;
    return { start, end };
  });

  const printPages: PrintPageEntry[] = [];
  let pageIndex = 0;
  columnPages.forEach((chunk, chunkIndex) => {
    rowPages.forEach((rowKeys, rowPageIndex) => {
      printPages.push({ chunkIndex, chunk, rowPageIndex, rowKeys, index: pageIndex });
      pageIndex++;
    });
  });

  // Print mode: the pages alone, no chrome. The print dialog fires from the
  // effect above.
  if (wantsPrint) {
    return (
      <Box
        {...{ [PRINT_ROOT_ATTR]: '' }}
        style={{ ...paletteVars(palette), background: cmp('bg') }}
        sx={{ minHeight: '100vh' }}
      >
        {twin}
        {printPages.map(entry => (
          <div
            key={`${entry.chunk.map(eq => eq.id).join(',')}-${String(entry.rowPageIndex)}`}
            style={{
              // CSS zoom, never transform: print paginates a page from its
              // layout boxes, and a transformed sheet still occupies its
              // original box for that purpose, so it would break exactly
              // where the unscaled one does. zoom actually resizes the box
              // the print engine paginates against. Dividing the width by
              // the same zoom is what keeps the zoomed table filling PAGE_W
              // of visible paper instead of shrinking into a corner of it.
              zoom,
              width: PAGE_W / zoom,
              breakBefore: entry.index === 0 ? 'auto' : 'page',
              pageBreakBefore: entry.index === 0 ? 'auto' : 'always',
            }}
          >
            <CompareSheet
              columns={entry.chunk}
              params={params}
              density={density}
              rowKeys={entry.rowKeys}
              showPhotos={entry.rowPageIndex === 0}
              fit
            />
          </div>
        ))}
      </Box>
    );
  }

  // Preview mode. Every page is shown exactly as it will print, row breaks
  // included: `usePrintPagination` measured them off the real print table
  // rather than leaving them to the print dialog the way this preview used
  // to.
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
            Compare: print preview
          </Typography>
          <Typography
            component="button"
            type="button"
            onClick={goBack}
            sx={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--shf-graphite-300)', background: 'transparent', border: 'none',
              cursor: 'pointer', textDecoration: 'underline', p: 0,
              '&:hover': { color: 'var(--shf-paper)' },
            }}
          >
            Back to compare
          </Typography>
        </Box>

        {/* Settings, then the action, right-justified: Paper / Dark and Fit
            change what the sheet looks like and sit left of Print, the same
            order every printable page uses (see DocumentActions). */}
        <DocumentActions onPrint={openPrint}>
          {/* Paper / Dark segmented pair. Two aria-pressed toggle buttons
              rather than a radio group: there are exactly two states and a
              chip pair is the idiom the rest of this toolbar already uses. */}
          <Box sx={{ display: 'flex', border: '1px solid var(--shf-graphite-600)', borderRadius: '4px', overflow: 'hidden' }}>
            {(['paper', 'dark'] as const).map((scheme) => {
              const pressed = scheme === 'dark' ? isDark : !isDark;
              return (
                <button
                  key={scheme}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => { setInk(scheme); }}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    padding: '5px 10px', border: 'none', cursor: 'pointer',
                    background: pressed ? 'var(--shf-amber)' : 'transparent',
                    color: pressed ? '#0A0A0A' : 'var(--shf-graphite-300)',
                  }}
                >
                  {scheme === 'dark' ? 'Dark' : 'Paper'}
                </button>
              );
            })}
          </Box>

          {/* A single button in its own bordered box, styled like the
              Paper/Dark pair beside it - one toggle rather than a pair,
              because there is no second state to pick between here, only on
              and off. */}
          <Box sx={{ display: 'flex', border: '1px solid var(--shf-graphite-600)', borderRadius: '4px', overflow: 'hidden' }}>
            <button
              type="button"
              aria-pressed={wantsFit}
              onClick={toggleFit}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '5px 10px', border: 'none', cursor: 'pointer',
                background: wantsFit ? 'var(--shf-amber)' : 'transparent',
                color: wantsFit ? '#0A0A0A' : 'var(--shf-graphite-300)',
              }}
            >
              Fit to one page
            </button>
          </Box>
          {/* What Fit did: the zoom it landed on, or that even the floor
              could not hold every column on one page. */}
          {wantsFit && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--shf-graphite-300)', whiteSpace: 'nowrap' }}>
              {pageCount === 1 ? `at ${String(Math.round(zoom * 100))}%` : `still ${String(pageCount)} pages at ${String(Math.round(zoom * 100))}%`}
            </span>
          )}
        </DocumentActions>
      </Box>

      <Box
        sx={{ flex: 1, py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
        style={paletteVars(palette)}
      >
        {twin}
        {printPages.map(entry => {
          const { start, end } = chunkRanges[entry.chunkIndex] ?? { start: 1, end: entry.chunk.length };
          const firstLabel = entry.rowKeys[0] ? labelForKey(entry.rowKeys[0], params) : '';
          const lastRowKey = entry.rowKeys[entry.rowKeys.length - 1];
          const lastLabel = lastRowKey ? labelForKey(lastRowKey, params) : '';
          const caption =
            `Page ${String(entry.index + 1)} of ${String(printPages.length)} ` +
            `(columns ${String(start)}-${String(end)}, ${firstLabel} to ${lastLabel})`;
          return (
            <Box
              key={`${entry.chunk.map(eq => eq.id).join(',')}-${String(entry.rowPageIndex)}`}
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}
            >
              <Typography sx={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--shf-graphite-400)',
              }}>
                {caption}
              </Typography>
              <Box sx={{
                // The paper sheet itself, at its true physical size - this
                // never zooms, or the preview would misrepresent how much
                // paper the printout actually uses.
                width: PAGE_W + 2 * PAPER_MARGIN_PX,
                padding: `${String(PAPER_MARGIN_PX)}px`,
                background: cmp('bg'),
                boxShadow: '0 6px 40px rgba(0,0,0,0.5)',
              }}>
                {/* The printable content, which does zoom - same wrapper
                    shape as print mode's page div, so the preview shows
                    exactly what printing will produce. */}
                <div style={{ zoom, width: PAGE_W / zoom }}>
                  <CompareSheet
                    columns={entry.chunk}
                    params={params}
                    density={density}
                    rowKeys={entry.rowKeys}
                    showPhotos={entry.rowPageIndex === 0}
                    fit
                  />
                </div>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function StateMessage({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <Box sx={{ minHeight: '100vh', background: 'var(--shf-graphite-900)', pt: 10, textAlign: 'center' }}>
      <Typography sx={{ color: 'var(--shf-graphite-300)', fontFamily: 'var(--font-body)', fontSize: 14, mb: 2 }}>
        {children}
      </Typography>
      <Typography
        component="button"
        type="button"
        onClick={onBack}
        sx={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          color: 'var(--shf-amber)', background: 'transparent', border: 'none',
          cursor: 'pointer', textDecoration: 'underline',
        }}
      >
        Back to compare
      </Typography>
    </Box>
  );
}

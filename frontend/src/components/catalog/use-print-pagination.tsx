import { useEffect, useMemo, useRef, useState } from 'react';
import type { Equipment } from '@/types';
import { INK, paletteVars } from './compare-palette';
import { LABEL_COL, PAGE_H, PAGE_W, balanceColumns, columnFitScale, fitScale, pageSeams, paginateColumns, printDensity, type CompareDensity } from './compare-page-guides';
import { PAGE_SAFETY, paginateRows, type PrintRowItem } from './compare-pagination';
import { CompareSheet } from './CompareSheet';
import { groupRows } from './compare-selection';
import type { CompareParam } from './compare-params';

/**
 * One place that decides every printed page break, so print, the preview
 * captions and the live page's guides all read the same answer instead of
 * three separate opinions about where paper divides.
 *
 * The only way to know a printed row's true height is to lay it out at print
 * density, in the print table, at the print width - which is not what any
 * of the three callers already have on screen: the live page renders
 * `CompareMatrix`'s taller screen rows, the print preview renders one
 * `CompareSheet` per column chunk with no row pagination at all, and print
 * mode used to just leave row breaks to the browser's own table
 * fragmentation. So this hook renders a fourth, hidden copy of the real
 * print table - `twin` - purely to measure it, and every caller reads the
 * pagination decision back off that measurement rather than laying out its
 * own guess.
 */
export interface UsePrintPaginationArgs {
  selection: Equipment[];
  params: CompareParam[];
  /** "Fit to one page": zoom the whole sheet down so its columns and rows
   *  land on one page when they can, floor `FIT_FLOOR`. Columns are arithmetic
   *  (`columnFitScale`), rows are measured (`fitScale` over the twin); the zoom
   *  is the smaller of the two. Unrelated to `CompareSheet`'s own `fit` prop,
   *  which shrinks one cell's text and is always on for print. */
  fit: boolean;
}

export interface UsePrintPaginationResult {
  /** Equipment columns, balanced into one array per printed page across. */
  columnPages: Equipment[][];
  /** The column index each printed page after the first starts at: the live guides' vertical rules. Empty when one page holds every column. */
  columnSeams: number[];
  /** Row keys (`g:<group>` / `r:<param.id>`) per printed row page - the same
   *  list for every column chunk, since every column page breaks at the same
   *  row. */
  rowPages: string[][];
  /** CSS `zoom` the whole sheet is scaled by; 1 when Fit is off or nothing is
   *  measured yet. */
  zoom: number;
  /** Pages the printer will produce for this selection at the current fit:
   *  column pages times row pages. Columns are arithmetic, so this is right
   *  for them immediately; rows are measured, so it is right for them once
   *  `measured`. What the live page shows beside its Fit toggle. */
  pageCount: number;
  /** False until the twin has produced at least one non-zero height. jsdom
   *  never lays anything out, so this stays false there forever - callers
   *  fall back to a single row page of everything rather than hang on a
   *  measurement that will never come. */
  measured: boolean;
  /** Mount this once, anywhere in the caller's tree. It renders nothing
   *  visible. */
  twin: React.ReactNode;
  /** The print density this measurement (and every caller's own
   *  `CompareSheet`) must render at - derived once, from the first column
   *  page, so a caller never computes a second, possibly different tier. */
  density: CompareDensity;
}

/** `g:<group>` / `r:<param.id>` in print order - the same convention
 *  `CompareSheet` marks its rows with via `data-print-key`, so a measured
 *  key can be handed straight to its `rowKeys` prop. */
function rowItemKeys(params: CompareParam[]): { key: string; kind: 'group' | 'row' }[] {
  const out: { key: string; kind: 'group' | 'row' }[] = [];
  for (const { group, params: rows } of groupRows(params)) {
    out.push({ key: `g:${group}`, kind: 'group' });
    for (const param of rows) out.push({ key: `r:${param.id}`, kind: 'row' });
  }
  return out;
}

interface Measurement {
  headH: number;
  firstExtra: number;
  heights: Record<string, number>;
  measured: boolean;
}

const EMPTY_MEASUREMENT: Measurement = { headH: 0, firstExtra: 0, heights: {}, measured: false };

export function usePrintPagination({ selection, params, fit }: UsePrintPaginationArgs): UsePrintPaginationResult {
  // Keyed on content, never on the `selection`/`params` array references
  // themselves. `useSearchParams()` hands back a new `URLSearchParams` object
  // every render regardless of whether the URL actually changed, and both
  // callers derive `selection`/`params` from it - so their array identity
  // changes on every render even when nothing the reader did changed
  // anything. `items`, below, feeds the measurement effect's dependency
  // array; keying that off an unstable reference reran the effect - and its
  // `setState` calls - on every single render, forever. A joined id string
  // compares by value, which is what actually answers "did the selection
  // change" here.
  const selectionKey = selection.map(eq => eq.id).join(',');
  const paramsKey = params.map(p => p.id).join(',');

  const [measurement, setMeasurement] = useState<Measurement>(EMPTY_MEASUREMENT);
  const [zoom, setZoom] = useState(1);

  // The column half of Fit is a rule, not a measurement, so it is known
  // before anything is laid out and never changes for a given selection.
  const columnZoom = fit ? columnFitScale(selection.length) : 1;
  // The page as laid out: a zoomed sheet is wider in layout units and holds
  // more columns, which is what collapses two column pages into one.
  const { perPage } = paginateColumns(selection.length, LABEL_COL, PAGE_W / zoom);
  // Once every column fits on one page, a wider page changes nothing, so the
  // memo is keyed on the count balanceColumns can act on rather than on
  // perPage itself - otherwise each zoom step past the column cap handed the
  // sheet a fresh, identical array.
  const effectivePerPage = Math.min(perPage, Math.max(1, selection.length));
  // selectionKey stands in for `selection` itself - see the comment above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columnPages = useMemo(() => balanceColumns(selection, effectivePerPage), [selectionKey, effectivePerPage]);
  const density = printDensity(columnPages[0]?.length ?? 1);

  // paramsKey stands in for `params` itself - see the comment above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => rowItemKeys(params), [paramsKey]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    // Every height below is read raw, NEVER divided by `zoom`, and that is
    // load-bearing rather than an oversight. The twin models a zoomed page by
    // being laid out WIDE - `width: PAGE_W / zoom` - and is not itself scaled,
    // so its boxes are already in the unzoomed layout units `pageH` is
    // expressed in. An earlier version divided by the current zoom as though
    // it were, which is a no-op while Fit is off (zoom is 1) and silently
    // wrong the moment Fit engages: the reported total becomes `T / z`, so
    // `fitScale` returns `P * z / T`, an iteration with no fixed point unless
    // T happens to equal P. It does not settle on the right scale - it walks
    // to the FIT_FLOOR clamp or back to 1, re-measuring at every step.
    const measure = () => {
      if (cancelled) return;

      let headH = 0;
      el.querySelectorAll<HTMLElement>('[data-print-part="head"]').forEach(node => {
        headH = Math.max(headH, node.getBoundingClientRect().height);
      });

      let firstExtra = 0;
      el.querySelectorAll<HTMLElement>('[data-print-part="photos"]').forEach(node => {
        firstExtra = Math.max(firstExtra, node.getBoundingClientRect().height);
      });

      const heights: Record<string, number> = {};
      el.querySelectorAll<HTMLElement>('[data-print-key]').forEach(node => {
        const key = node.getAttribute('data-print-key');
        if (!key) return;
        const h = node.getBoundingClientRect().height;
        heights[key] = Math.max(heights[key] ?? 0, h);
      });

      const anyMeasured = headH > 0 || Object.values(heights).some(h => h > 0);

      setMeasurement(prev => ({ headH, firstExtra, heights, measured: prev.measured || anyMeasured }));

      if (fit) {
        const total = headH + firstExtra + Object.values(heights).reduce((sum, h) => sum + h, 0);
        // The smaller of the two axes. columnZoom is fixed for the selection,
        // so the loop below - zoom widens the page, which changes perPage and
        // density, which changes row heights, which changes the row fit -
        // only ever iterates on the row half, and converges as it did before.
        const next = Math.min(fitScale(total, PAGE_H - PAGE_SAFETY), columnZoom);
        // Guards against oscillation: a change this small would not move a
        // pixel of the zoomed sheet, and re-measuring after every re-render
        // it causes is how a ResizeObserver feeds back into itself forever.
        setZoom(prev => (Math.abs(next - prev) > 0.005 ? next : prev));
      } else {
        setZoom(prev => (prev === 1 ? prev : 1));
      }
    };

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    // Fonts can still be loading when the first measurement runs, and a
    // fallback font's metrics are rarely the display font's - re-measuring
    // once fonts settle is what catches a row that grows or shrinks a line
    // once the real face is in. Guarded, not awaited unconditionally: jsdom
    // implements no FontFaceSet at all unless a test patches one in, and this
    // hook also mounts under the live page, which never does.
    if (document.fonts) void document.fonts.ready.then(() => { if (!cancelled) measure(); });

    return () => {
      cancelled = true;
      ro.disconnect();
    };
    // `zoom` is a dependency on purpose, and for the width and nothing else:
    // the twin is laid out at `PAGE_W / zoom`, so a zoom change rewraps every
    // cell and this effect must re-measure that new layout rather than trust
    // the old one. The 0.5% guard above is what keeps that from cycling.
  }, [items, fit, zoom, columnZoom]);

  const pageH = fit ? (PAGE_H - PAGE_SAFETY) / zoom : PAGE_H - PAGE_SAFETY;

  const rowPages = useMemo(() => {
    if (!measurement.measured) {
      // Nothing measured yet (or ever, in an environment with no real
      // layout). One page of every key is the same "everything, unsplit"
      // answer paginateRows itself gives an empty pageH would not produce -
      // it is a caller-level fallback, not something paginateRows decides.
      return [items.map(i => i.key)];
    }
    const withHeights: PrintRowItem[] = items.map(i => ({
      key: i.key,
      kind: i.kind,
      height: measurement.heights[i.key] ?? 0,
    }));
    return paginateRows({ items: withHeights, pageH, headH: measurement.headH, firstExtra: measurement.firstExtra });
  }, [items, measurement, pageH]);

  const twin = (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{ position: 'fixed', left: -100000, top: 0, visibility: 'hidden', pointerEvents: 'none' }}
    >
      {/* Colour never affects layout, but every `cmp()` reference inside
          CompareSheet still resolves a var() - INK is what print always
          uses, so this is the palette that must be present for the vars to
          resolve to something rather than an empty string. */}
      <div style={paletteVars(INK)}>
        {columnPages.map((chunk, i) => (
          <div
            key={chunk.map(eq => eq.id).join(',') || `chunk-${String(i)}`}
            style={{ width: PAGE_W / zoom }}
          >
            {/* Full sheet, every row: this is the one full-height reference
                every page's row pagination is measured against, so no
                rowKeys/showPhotos restriction here. */}
            <CompareSheet columns={chunk} params={params} density={density} fit />
          </div>
        ))}
      </div>
    </div>
  );

  return {
    columnPages,
    columnSeams: pageSeams(columnPages),
    rowPages,
    zoom,
    pageCount: columnPages.length * rowPages.length,
    measured: measurement.measured,
    twin,
    density,
  };
}

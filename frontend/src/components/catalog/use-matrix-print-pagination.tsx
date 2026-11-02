import { useEffect, useMemo, useRef, useState } from 'react';
import { PAGE_H, PAGE_W, balanceColumns, columnFitScale, fitScale, paginateColumns } from './compare-page-guides';
import { PAGE_SAFETY, paginateRows, type PrintRowItem } from './compare-pagination';
import { sliceModel, type MatrixModel } from './compat-matrix-model';
import { MATRIX_LABEL_COL, MATRIX_MIN_COL } from './compat-matrix-styles';
import { MatrixPrintPage, type MatrixHeading } from './JointCompatibilityMatrix';

/**
 * Where the printed joint matrix breaks into pages, and how far Fit to one
 * page zooms it - the compare page's `usePrintPagination`, for this grid.
 *
 * The same paper, margins and arithmetic as compare, so the two "prints on N
 * pages" readouts and Fit toggles behave identically:
 *
 * - Columns are arithmetic. A page at zoom z is `PAGE_W / z` wide and holds
 *   `floor((PAGE_W / z - MATRIX_LABEL_COL) / MATRIX_MIN_COL)` asset columns,
 *   balanced across the pages by `balanceColumns`. The waveform label column
 *   repeats on every page across.
 * - Rows are measured. Their height depends on how the column heads wrap at
 *   the print width, so a hidden twin lays out the real print grid - one per
 *   column chunk, at `PAGE_W / zoom` - and `paginateRows` splits the measured
 *   rows so the header row repeats on every page and the heading and legend
 *   cost their height on each column chunk's first page.
 * - Fit zooms to the smaller of what the rows and the columns need, floored
 *   at `FIT_FLOOR`; past the floor the sheet stays on several pages.
 *
 * `model` is the print model (empty rows dropped), since that is what prints.
 * Column pages are indexes into `model.columns`, row pages are abbrevs, and
 * `sliceModel` turns a pair of them into the model one page draws.
 */
export interface UseMatrixPrintPaginationResult {
  /** Indexes into `model.columns`, one array per printed page across. */
  columnPages: number[][];
  /** Row abbrevs per printed row page - the same for every column chunk. */
  rowPages: string[][];
  /** CSS `zoom` for every page; 1 when Fit is off or nothing is measured. */
  zoom: number;
  /** Pages the printer will produce: column pages times row pages. */
  pageCount: number;
  /** False until the twin has laid out. jsdom never does, so there the rows
   *  stay one page and the readout waits on Fit, as compare's does. */
  measured: boolean;
  /** Mount once, anywhere. Renders nothing visible. */
  twin: React.ReactNode;
}

interface Measurement {
  headH: number;
  firstExtra: number;
  heights: Record<string, number>;
  measured: boolean;
}

const EMPTY: Measurement = { headH: 0, firstExtra: 0, heights: {}, measured: false };

export function useMatrixPrintPagination({ model, fit, date, branches, heading }: {
  model: MatrixModel;
  fit: boolean;
  /** For the heading the twin measures; the print route draws the same. */
  date: string;
  branches: string[];
  /** The heading the print route draws, so the twin measures the same. */
  heading?: MatrixHeading;
}): UseMatrixPrintPaginationResult {
  const count = model.columns.length;
  const columnKey = model.columns.map(c => c.id).join(',');
  const rowKey = model.rows.map(r => r.abbrev).join(',');

  const [measurement, setMeasurement] = useState<Measurement>(EMPTY);
  const [zoom, setZoom] = useState(1);

  const columnZoom = fit ? columnFitScale(count, MATRIX_LABEL_COL, MATRIX_MIN_COL) : 1;
  const { perPage } = paginateColumns(count, MATRIX_LABEL_COL, PAGE_W / zoom, MATRIX_MIN_COL);
  const effectivePerPage = Math.min(perPage, Math.max(1, count));
  const columnPages = useMemo(
    () => balanceColumns(model.columns.map((_, i) => i), effectivePerPage),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- columnKey stands for model.columns
    [columnKey, effectivePerPage],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      let headH = 0;
      el.querySelectorAll<HTMLElement>('[data-print-part="head"]').forEach(node => {
        headH = Math.max(headH, node.getBoundingClientRect().height);
      });
      let firstExtra = 0;
      el.querySelectorAll<HTMLElement>('[data-print-part="first"]').forEach(node => {
        firstExtra = Math.max(firstExtra, node.getBoundingClientRect().height);
      });
      const heights: Record<string, number> = {};
      el.querySelectorAll<HTMLElement>('[data-print-key]').forEach(node => {
        const key = node.getAttribute('data-print-key');
        if (!key) return;
        heights[key] = Math.max(heights[key] ?? 0, node.getBoundingClientRect().height);
      });
      const any = headH > 0 || Object.values(heights).some(h => h > 0);
      setMeasurement(prev => ({ headH, firstExtra, heights, measured: prev.measured || any }));

      if (fit) {
        const total = headH + firstExtra + Object.values(heights).reduce((sum, h) => sum + h, 0);
        const next = Math.min(fitScale(total, PAGE_H - PAGE_SAFETY), columnZoom);
        // The same 0.005 dead band as compare: zooming reflows the column
        // heads, which changes the heights, which would otherwise nudge the
        // zoom again forever.
        setZoom(prev => (Math.abs(next - prev) > 0.005 ? next : prev));
      } else {
        setZoom(prev => (prev === 1 ? prev : 1));
      }
    };

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    if (document.fonts) void document.fonts.ready.then(() => { if (!cancelled) measure(); });
    return () => { cancelled = true; ro.disconnect(); };
  }, [columnKey, rowKey, fit, zoom, columnZoom]);

  const pageH = fit ? (PAGE_H - PAGE_SAFETY) / zoom : PAGE_H - PAGE_SAFETY;

  const rowPages = useMemo(() => {
    const keys = model.rows.map(r => r.abbrev);
    if (!measurement.measured) return [keys];
    const items: PrintRowItem[] = keys.map(key => ({ key, kind: 'row', height: measurement.heights[key] ?? 0 }));
    return paginateRows({ items, pageH, headH: measurement.headH, firstExtra: measurement.firstExtra });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rowKey stands for model.rows
  }, [rowKey, measurement, pageH]);

  const twin = (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{ position: 'fixed', left: -100000, top: 0, visibility: 'hidden', pointerEvents: 'none' }}
    >
      {columnPages.map(indexes => (
        <div key={indexes.join(',') || 'empty'} style={{ width: PAGE_W / zoom }}>
          {/* Every row: the full-height reference each page's row split is
              measured against. */}
          <MatrixPrintPage model={model} page={sliceModel(model, indexes)} first date={date} branches={branches} heading={heading} />
        </div>
      ))}
    </div>
  );

  return {
    columnPages,
    rowPages,
    zoom,
    pageCount: columnPages.length * rowPages.length,
    measured: measurement.measured,
    twin,
  };
}

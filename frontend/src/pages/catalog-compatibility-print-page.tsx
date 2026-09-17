import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { usePlatforms, useEquipment, useWaveforms } from '@/services';
import { buildMatrix } from '@/components/catalog/compat-matrix-model';
import { readMatrixParams, writeMatrixParams } from '@/components/catalog/compat-matrix-params';
import { JointCompatibilityMatrix } from '@/components/catalog/JointCompatibilityMatrix';
import { PrintPageShell } from '@/components/common/sheet-export';

function nextFrame(): Promise<void> {
  return new Promise(resolve => { requestAnimationFrame(() => { resolve(); }); });
}

/**
 * The joint matrix, chrome free, for print and Save as PDF. Landscape because
 * the matrix grows sideways with every asset added.
 *
 * It reads the live page's URL parameters, so the sheet is whatever the reader
 * had on screen, with one difference - empty rows are always dropped, because
 * paper should not spend a page on waveforms nothing in the selection carries.
 * `?print=1` opens the dialog once the data and fonts are in, which is also
 * what a DevTools-driven print check waits for.
 */
export function CatalogCompatibilityPrintPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const printedRef = useRef(false);

  const { data: pData, isLoading: pLoading, isError: pError } = usePlatforms();
  const { data: eData, isLoading: eLoading, isError: eError } = useEquipment({ type: 'radio' });
  const { data: wData, isLoading: wLoading, isError: wError } = useWaveforms();
  const ready = !pLoading && !eLoading && !wLoading && !pError && !eError && !wError;

  const paramKey = searchParams.toString();
  const params = useMemo(() => readMatrixParams(new URLSearchParams(paramKey)), [paramKey]);
  const model = useMemo(() => buildMatrix({
    platforms: pData?.platforms ?? [],
    equipment: eData?.equipment ?? [],
    waveforms: wData?.waveforms ?? [],
    ...params,
    omitEmptyRows: true,
  }), [pData, eData, wData, params]);

  const wantsPrint = searchParams.get('print') === '1';

  const printNow = () => {
    void document.fonts.ready.then(() => nextFrame()).then(() => { window.print(); });
  };

  useEffect(() => {
    if (!wantsPrint || !ready || printedRef.current) return;
    let cancelled = false;
    void document.fonts.ready
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
  }, [wantsPrint, ready]);

  const backHref = useMemo(() => {
    const next = writeMatrixParams(new URLSearchParams(paramKey), {});
    next.delete('print');
    const qs = next.toString();
    return `/catalog/compatibility${qs ? `?${qs}` : ''}`;
  }, [paramKey]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <PrintPageShell
      orientation="landscape"
      rootAttr="data-compat-print-root"
      backLabel="Back"
      onBack={() => { void navigate(backHref); }}
      onPrint={printNow}
      printDisabled={!ready}
      // The matrix prints on its own paper, unlike the dark library and nets sheets.
      rootStyle={{ background: 'var(--shf-paper)', color: 'var(--fg-1)', padding: 24 }}
    >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Joint Compatibility Matrix
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em' }}>
            {today}{params.categories.length > 0 ? ` · ${params.categories.join(', ').toUpperCase()}` : ''}
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-2)', marginBottom: 12 }}>
          {!ready ? 'Loading…' : null}
        </div>
        {ready && <JointCompatibilityMatrix model={model} print />}
    </PrintPageShell>
  );
}

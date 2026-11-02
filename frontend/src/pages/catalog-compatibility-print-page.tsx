import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { usePlatforms, useEquipment, useWaveforms } from '@/services';
import { buildMatrix } from '@/components/catalog/compat-matrix-model';
import { readMatrixParams, writeMatrixParams } from '@/components/catalog/compat-matrix-params';
import { MatrixPrintPreview } from '@/components/catalog/matrix-print-preview';
import '@/styles/catalog-tokens.css';

/**
 * The joint matrix, chrome free, for print and Save as PDF - and, short of
 * that, a preview of exactly the pages a printer will produce. Built the way
 * `/catalog/compare/print` is, and sharing its paper, margins, page split
 * rules and Fit to one page:
 *
 * - Columns past what one page holds continue on another page across, with
 *   the waveform labels repeated; rows past one page continue down, with the
 *   header row repeated. `useMatrixPrintPagination` decides every break.
 * - Fit (`fit=1`, shared with the live page) zooms the whole sheet so it
 *   lands on one page when it can, floor 70%, with CSS `zoom` - never a
 *   transform, which print would still paginate at the unscaled size.
 * - `print=1` renders the pages alone and opens the dialog once the data,
 *   the fonts and the measurement are in; without it, the preview.
 *
 * Empty rows are always dropped here: paper should not spend a page on
 * waveforms nothing in the selection carries.
 */
export function CatalogCompatibilityPrintPage() {
  const [searchParams, setSearchParams] = useSearchParams();

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

  const backHref = useMemo(() => {
    const next = writeMatrixParams(new URLSearchParams(paramKey), {});
    next.delete('print');
    const qs = next.toString();
    return `/catalog/compatibility${qs ? `?${qs}` : ''}`;
  }, [paramKey]);

  const toggleFit = () => {
    setSearchParams(writeMatrixParams(searchParams, { fit: !params.fit }), { replace: true });
  };

  const openPrint = () => {
    const printParams = new URLSearchParams(searchParams);
    printParams.set('print', '1');
    window.open(`/catalog/compatibility/print?${printParams.toString()}`, '_blank');
  };

  return (
    <MatrixPrintPreview
      model={model}
      params={params}
      ready={ready}
      title="Compatibility: print preview"
      backHref={backHref}
      onToggleFit={toggleFit}
      onPrint={openPrint}
      print={searchParams.get('print') === '1'}
    />
  );
}

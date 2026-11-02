import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Box } from '@mui/material';
import { DocumentActions, compatExportSpec } from '@/components/common/sheet-export';
import { MainLayout } from '@/components/layouts';
import { CONTENT_GUTTER, HEADER_HEIGHT } from '@/components/layouts/main-layout';
import { CONTENT_LINE, RAIL_BANNER_H } from '@/components/common/banner-controls';
import { PageBanner, PageTitle, RAIL_TITLE_ML } from '@/components/common';
import { usePlatforms, useEquipment, useWaveforms } from '@/services';
import { ALL_COLUMNS, buildMatrix, groupByBranch } from '@/components/catalog/compat-matrix-model';
import { readMatrixParams, writeMatrixParams, type MatrixParams } from '@/components/catalog/compat-matrix-params';
import { JointCompatibilityMatrix } from '@/components/catalog/JointCompatibilityMatrix';
import { chipToggleSty } from '@/components/catalog/chip-styles';
import { ChipRow } from '@/components/catalog/chip-row';
import { useMatrixPrintPagination } from '@/components/catalog/use-matrix-print-pagination';
import { GUTTER_W } from '@/components/catalog/matrix-panel-styles';
import {
  MatrixBannerToggles, MatrixColumnsPanel, MatrixFiltersPanel, MatrixFitReadout,
} from '@/components/catalog/matrix-panels';
import '@/styles/catalog-tokens.css';

type FilterKey = keyof Pick<MatrixParams, 'branches' | 'types'>;

/**
 * The joint compatibility matrix: every waveform against every asset, ours and
 * theirs, resolved live. It shows what is compatible with what and draws no
 * conclusion for the reader: they pick the columns and read across a row. It
 * used to name the waveforms common to every column, which answered a question
 * nobody had asked and read as the page's verdict.
 *
 * Ungated, like the Comms Library: it is a read, and the Platforms pane gates
 * its own writes. Distinct from Section 03b's per-radio matrix on a data sheet,
 * which snapshots its columns on purpose - see compat-matrix-model.ts.
 */
export function CatalogCompatibilityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [picking, setPicking] = useState(false);
  const [filtering, setFiltering] = useState(false);

  const { data: pData, isLoading: pLoading } = usePlatforms();
  const { data: eData, isLoading: eLoading } = useEquipment({ type: 'radio' });
  const { data: wData, isLoading: wLoading } = useWaveforms();
  const isLoading = pLoading || eLoading || wLoading;

  const paramKey = searchParams.toString();
  const params = useMemo(() => readMatrixParams(new URLSearchParams(paramKey)), [paramKey]);

  const base = useMemo(() => ({
    platforms: pData?.platforms ?? [],
    equipment: eData?.equipment ?? [],
    waveforms: wData?.waveforms ?? [],
  }), [pData, eData, wData]);

  const model = useMemo(() => buildMatrix({ ...base, ...params }), [base, params]);

  // What prints: the same selection with empty rows always dropped, as the
  // print route does, so the readout below counts the pages printing makes.
  const printModel = useMemo(() => buildMatrix({ ...base, ...params, omitEmptyRows: true }), [base, params]);
  const { pageCount, zoom, measured, twin } = useMatrixPrintPagination({
    model: printModel,
    fit: params.fit,
    date: new Date().toISOString().slice(0, 10),
    branches: params.branches,
  });

  // Every column the filters admit, in default order - the picker's
  // vocabulary. Built by the same function, so the picker cannot offer a
  // column the matrix would refuse.
  const candidates = useMemo(
    () => buildMatrix({
      ...base,
      branches: params.branches, types: params.types,
      selected: [ALL_COLUMNS],
    }).columns,
    [base, params.branches, params.types],
  );
  const groups = useMemo(() => groupByBranch(candidates), [candidates]);

  const update = (patch: Parameters<typeof writeMatrixParams>[1]) => {
    setSearchParams(writeMatrixParams(searchParams, patch), { replace: true });
  };

  // Each chip toggles only itself, so any number of them can be on at once.
  const toggleFilter = (key: FilterKey, value: string) => {
    const current = params[key];
    update({ [key]: current.includes(value) ? current.filter(x => x !== value) : [...current, value] });
  };
  const filterCount = params.branches.length + params.types.length;

  // Select all is a token, not a list, so switching columns off from it has
  // to materialise the rest; switching everything back on returns to the
  // token only from that state, or it would forget the order picked. A
  // platform with two branches is offered twice and is one column,
  // so switching it on is idempotent.
  const allSelected = params.selected.includes(ALL_COLUMNS);
  const shownIds = model.columns.map(c => c.id);
  const setColumns = (ids: string[], on: boolean) => {
    const next = on
      ? [...shownIds, ...ids.filter((id, i) => !shownIds.includes(id) && ids.indexOf(id) === i)]
      : shownIds.filter(x => !ids.includes(x));
    const everything = next.length === candidates.length && allSelected;
    update({ selected: everything ? [ALL_COLUMNS] : next });
  };

  const pagesText = `${String(pageCount)} page${pageCount === 1 ? '' : 's'}${params.fit && zoom < 1 ? ` at ${String(Math.round(zoom * 100))}%` : ''}`;
  const readout = `prints on ${pagesText}`;

  const printHref = `/catalog/compatibility/print${paramKey ? `?${paramKey}` : ''}`;

  return (
    <MainLayout>
      <PageBanner>
        {/* ml 1: on the 28px line the other catalog titles start on. */}
        <PageTitle noWrap sx={{ ml: RAIL_TITLE_ML, flexShrink: 0 }}>Compatibility Matrix</PageTitle>
        {/* The panel toggles straight after the title, and what changes the
            printout beside share and Print - the compare page's banner. Every
            filter lives in the Filters panel: the banner used to carry
            ORGANIC / JOINT chips beside the title, which filtered like the
            panel's rows but did not look like it, and the category they
            filtered on is gone - see migration 044. */}
        <MatrixBannerToggles
          filtering={filtering}
          onToggleFiltering={() => { setFiltering(v => !v); }}
          filterCount={filterCount}
          picking={picking}
          onTogglePicking={() => { setPicking(v => !v); }}
          columnCount={params.selected.length > 0 ? model.columns.length : null}
          omitEmptyRows={params.omitEmptyRows}
          onToggleOmitEmptyRows={() => { update({ omitEmptyRows: !params.omitEmptyRows }); }}
        />
        {/* Fit and its effect, then share, then Print, as on compare. Fit
            shares the `fit` URL param with the print preview, so it is still
            on there; the grid on screen stays full size, and the caption is
            how the toggle shows what it did. */}
        <DocumentActions onPrint={() => { window.open(printHref, '_blank'); }} spec={compatExportSpec()}>
          <MatrixFitReadout
            readout={model.columns.length > 0 && (measured || params.fit) ? readout : null}
            fit={params.fit}
            onToggleFit={() => { update({ fit: !params.fit }); }}
          />
        </DocumentActions>
        {twin}
      </PageBanner>

      <Box sx={{
        background: 'var(--shf-graphite-900)',
        // From the viewport, not a percentage: see comms-library-page.
        minHeight: `calc(100vh - ${String(HEADER_HEIGHT + RAIL_BANNER_H)}px)`,
        mx: -CONTENT_GUTTER,
        mb: -CONTENT_GUTTER,
        // The content line on both sides: where the banner's Print / share
        // end and the catalog cards end, so the matrix's right edge meets them.
        px: `${String(CONTENT_LINE)}px`, py: 2.5,
      }}>
        {filtering && (
          <MatrixFiltersPanel
            filterCount={filterCount}
            onClear={() => { update({ branches: [], types: [] }); }}
            availableBranches={model.availableBranches}
            branches={params.branches}
            onToggleBranch={b => { toggleFilter('branches', b); }}
          >
            <ChipRow gutter="Type" gutterWidth={GUTTER_W}>
              {model.availableTypes.map(k => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={params.types.includes(k)}
                  onClick={() => { toggleFilter('types', k); }}
                  style={chipToggleSty(params.types.includes(k), true)}
                >
                  {k}
                </button>
              ))}
            </ChipRow>
          </MatrixFiltersPanel>
        )}

        {picking && (
          <MatrixColumnsPanel
            groups={groups}
            shownIds={shownIds}
            allSelected={allSelected}
            selectedCount={params.selected.length}
            onSelectAll={() => { update({ selected: [ALL_COLUMNS] }); }}
            onClear={() => { update({ selected: [] }); }}
            onSetColumns={setColumns}
          />
        )}

        <Box sx={{ background: 'var(--shf-paper)', p: 2.5, borderRadius: '2px', maxWidth: '100%' }}>
          {isLoading ? (
            <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>Loading…</Box>
          ) : (
            <JointCompatibilityMatrix model={model} />
          )}
        </Box>
      </Box>
    </MainLayout>
  );
}

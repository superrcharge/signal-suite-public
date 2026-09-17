import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Box, CircularProgress } from '@mui/material';
import { PageTitle } from '@/components/common';
import { MainLayout } from '@/components/layouts';
import { DocumentActions, compareExportSpec } from '@/components/common/sheet-export';
import { CONTENT_GUTTER } from '@/components/layouts/main-layout';
import {
  CompareControls,
  CompareMatrix,
  CompareToggles,
  DARK,
  FIT_PARAM,
  IDS_PARAM,
  PARAMS_PARAM,
  encodeIds,
  encodeParams,
  hasStaleIds,
  paramsForSelection,
  resolveChosenIds,
  resolveParams,
  resolveSelection,
  usePrintPagination,
  type CompareGroup,
} from '@/components/catalog';
import { useEquipment } from '@/services';
import { compareNatural } from '@/utils';
import '@/styles/catalog-tokens.css';

/**
 * Any number of catalog records side by side, on any subset of parameters.
 *
 * The page owns nothing but URL plumbing. What can be compared lives in
 * `compare-params`, what the URL means lives in `compare-selection`, and how
 * it looks lives in `CompareMatrix`. All three are testable without mounting
 * this file, which is the point of splitting it that way.
 */
export function CatalogComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading } = useEquipment();

  // Owned here rather than inside CompareControls, because the switches sit
  // in the banner and the panels sit below the banner.
  const [equipmentOpen, setEquipmentOpen] = useState(!searchParams.get(IDS_PARAM));
  const [paramsOpen, setParamsOpen] = useState(false);

  const catalog = useMemo(
    () => [...(data?.equipment ?? [])].sort((a, b) => compareNatural(a.nomenclature, b.nomenclature)),
    [data],
  );

  const rawIds = searchParams.get(IDS_PARAM);
  const rawParams = searchParams.get(PARAMS_PARAM);
  // Shared with the print preview via the URL, not local state: a reader who
  // turns Fit on here and then opens Print / Save PDF should see the same
  // choice reflected there, not a toggle that silently reset.
  const wantsFit = searchParams.get(FIT_PARAM) === '1';

  const selection = useMemo(() => resolveSelection(rawIds, catalog), [rawIds, catalog]);
  const available = useMemo(() => paramsForSelection(selection), [selection]);
  const chosenParams = useMemo(() => resolveParams(rawParams, selection), [rawParams, selection]);

  // The same measured print pagination the preview and print routes read,
  // so this page's guides can never promise a page break the printer does
  // not actually put there. `rowPages[0]` needs no guide - there is nothing
  // above the very first printed page to warn about - which is why it is
  // dropped before `printBreakKeys` ever reaches CompareMatrix.
  // `columnSeams` come from the hook's own chunking, so the matrix's vertical
  // guides follow Fit: one column page means no guide.
  const { rowPages, columnSeams, twin, pageCount, zoom, measured } = usePrintPagination({ selection, params: chosenParams, fit: wantsFit });
  const printBreakKeys = rowPages
    .slice(1)
    .map(page => page[0])
    .filter((key): key is string => key !== undefined);

  const selectedIds = selection.map(eq => eq.id);
  // What the reader picked, which is not the same as what is on screen. Every
  // write uses this; only the rendering uses `chosenParams`. See
  // resolveChosenIds for what goes wrong when the two are conflated.
  const chosenParamIds = useMemo(() => resolveChosenIds(rawParams), [rawParams]);
  const visibleParamIds = chosenParams.map(p => p.id);

  const write = useCallback(
    (ids: string[], paramIds: string[]) => {
      const next = new URLSearchParams(searchParams);
      const encodedIds = encodeIds(ids);
      const encodedParams = encodeParams(paramIds);
      if (encodedIds === null) next.delete(IDS_PARAM);
      else next.set(IDS_PARAM, encodedIds);
      if (encodedParams === null) next.delete(PARAMS_PARAM);
      else next.set(PARAMS_PARAM, encodedParams);
      // A checkbox toggle is not a place to come back to with Back.
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // A link can outlive the record it names. Rewriting once the catalog has
  // loaded means a stale bookmark heals itself rather than dropping the same
  // id again on every reload. Guarded on there being something to drop, since
  // rewriting unconditionally is a loop.
  const stale = !isLoading && hasStaleIds(rawIds, selection);
  useEffect(() => {
    if (!stale) return;
    write(selectedIds, chosenParamIds);
    // selectedIds/selectedParamIds are derived from searchParams, which `write`
    // already depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale]);

  const toggleEquipment = (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id];
    write(next, chosenParamIds);
  };

  const toggleParam = (id: string) => {
    const next = chosenParamIds.includes(id)
      ? chosenParamIds.filter(x => x !== id)
      : [...chosenParamIds, id];
    write(selectedIds, next);
  };

  /**
   * Add or drop a whole group of equipment in one write.
   *
   * Not a loop over toggleEquipment. Each of those recomputes `next` from
   * `selectedIds`, which is derived from the current searchParams and does
   * not change until React re-renders, so every call in a loop starts from
   * the same state and only the last one survives. That is why the All tile
   * appeared to do nothing.
   */
  const setEquipment = (ids: string[], on: boolean) => {
    const next = on
      ? [...selectedIds, ...ids.filter(id => !selectedIds.includes(id))]
      : selectedIds.filter(id => !ids.includes(id));
    write(next, chosenParamIds);
  };

  const toggleFit = () => {
    const next = new URLSearchParams(searchParams);
    // Off is the default and is never spelled out in the URL, the same
    // asymmetry the print preview's own toggleFit holds `fit` to.
    if (wantsFit) next.delete(FIT_PARAM);
    else next.set(FIT_PARAM, '1');
    setSearchParams(next, { replace: true });
  };

  const setGroup = (group: CompareGroup, on: boolean) => {
    const inGroup = available.filter(p => p.group === group).map(p => p.id);
    const next = on
      ? [...chosenParamIds, ...inGroup.filter(id => !chosenParamIds.includes(id))]
      : chosenParamIds.filter(id => !inGroup.includes(id));
    write(selectedIds, next);
  };

  return (
    <MainLayout>
      {/* A full dark panel rather than a bar over page content, matching
          /catalog. Derived from CONTENT_GUTTER for the reason PageBanner is. */}
      <Box
        sx={{
          background: 'var(--shf-graphite-900)',
          minHeight: '100%',
          mx: -CONTENT_GUTTER,
          mt: -CONTENT_GUTTER,
          mb: -CONTENT_GUTTER,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            // Top aligned, so the controls sit level with the cap height of
            // the heading rather than centred against its two stacked lines.
            alignItems: 'flex-start',
            gap: 2.5,
            flexWrap: 'wrap',
            px: 3.5,
            py: 2,
            borderBottom: '1px solid var(--shf-graphite-700)',
            background: 'var(--shf-graphite-800)',
          }}
        >
          <Box>
            <PageTitle>Compare Equipment</PageTitle>
          </Box>


          {!isLoading && (
            <CompareToggles
              equipmentCount={selection.length}
              paramCount={visibleParamIds.length}
              equipmentOpen={equipmentOpen}
              paramsOpen={paramsOpen}
              onToggleEquipmentPanel={() => { setEquipmentOpen(o => !o); }}
              onToggleParamsPanel={() => { setParamsOpen(o => !o); }}
              style={{ marginTop: 3 }}
            />
          )}

          {/* Right end: Fit and its effect, then share, then Print - the
              same order every printable page uses (see DocumentActions).
              The Fit toggle shares the `fit` URL param with the preview, so a
              reader who turns it on here sees it still on there. The matrix
              itself stays full size on purpose - it is a working view - and
              the caption is how the toggle shows what it did. This bar pads
              28 already, so inset 3.5. */}
          {!isLoading && selection.length > 0 && chosenParams.length > 0 && (
            <DocumentActions
              inset={3.5}
              spec={compareExportSpec(DARK.bg)}
              onPrint={() => {
                // The print route reads the same parameters, so the sheet is
                // whatever is on screen. Nothing is handed over in memory,
                // which is what keeps the URL pasteable. To the preview, not
                // straight to the dialog: Paper or Dark is chosen there.
                window.open(`/catalog/compare/print?${searchParams.toString()}`, '_blank');
              }}
            >
              {(measured || wantsFit) && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--shf-graphite-300)', whiteSpace: 'nowrap' }}>
                  prints on {pageCount} page{pageCount === 1 ? '' : 's'}{wantsFit && zoom < 1 ? ` at ${String(Math.round(zoom * 100))}%` : ''}
                </span>
              )}
              <Box sx={{ display: 'flex', border: '1px solid var(--shf-graphite-600)', borderRadius: '4px', overflow: 'hidden' }}>
                <button
                  type="button"
                  aria-pressed={wantsFit}
                  onClick={toggleFit}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    padding: '0 10px', height: 28, border: 'none', cursor: 'pointer',
                    background: wantsFit ? 'var(--shf-amber)' : 'transparent',
                    color: wantsFit ? '#0A0A0A' : 'var(--shf-graphite-300)',
                  }}
                >
                  Fit to one page
                </button>
              </Box>
            </DocumentActions>
          )}
        </Box>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
            <CircularProgress sx={{ color: 'var(--shf-amber)' }} />
          </Box>
        ) : (
          <>
            <CompareControls
              catalog={catalog}
              selectedIds={selectedIds}
              available={available}
              selectedParamIds={chosenParamIds}
              equipmentOpen={equipmentOpen}
              paramsOpen={paramsOpen}
              onToggleEquipment={toggleEquipment}
              onSetEquipment={setEquipment}
              onToggleParam={toggleParam}
              onSetGroup={setGroup}
            />

            {selection.length === 0 ? (
              <Placeholder>
                Pick equipment above to build a comparison. Any number of records, SATCOM and radio
                together.
              </Placeholder>
            ) : chosenParams.length === 0 ? (
              <Placeholder>
                No parameters selected. Choose some under Parameters above.
              </Placeholder>
            ) : (
              <CompareMatrix
                columns={selection}
                params={chosenParams}
                onRemove={id => { toggleEquipment(id); }}
                printBreakKeys={printBreakKeys}
                columnSeams={columnSeams}
              />
            )}
          </>
        )}
      </Box>
      {twin}
    </MainLayout>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        m: '28px',
        p: '16px 18px',
        border: '1px dashed var(--shf-graphite-600)',
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        fontStyle: 'italic',
        lineHeight: 1.5,
        color: 'var(--shf-graphite-300)',
      }}
    >
      {children}
    </Box>
  );
}

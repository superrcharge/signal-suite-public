import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Box } from '@mui/material';
import { DocumentActions, compatExportSpec } from '@/components/common/sheet-export';
import { MainLayout } from '@/components/layouts';
import { CONTENT_GUTTER, HEADER_HEIGHT } from '@/components/layouts/main-layout';
import { CONTENT_LINE, RAIL_BANNER_H } from '@/components/common/banner-controls';
import { PageBanner, PageTitle, RAIL_TITLE_ML } from '@/components/common';
import { usePlatforms, useEquipment, useWaveforms } from '@/services';
import { buildMatrix } from '@/components/catalog/compat-matrix-model';
import { readMatrixParams, writeMatrixParams } from '@/components/catalog/compat-matrix-params';
import { JointCompatibilityMatrix } from '@/components/catalog/JointCompatibilityMatrix';
import { chipToggleSty, panelToggleSty } from '@/components/catalog/chip-styles';
import '@/styles/catalog-tokens.css';

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

  // Every column the category filter admits, in default order - the picker's
  // vocabulary. Built by the same function, so the picker cannot offer a
  // column the matrix would refuse.
  const candidates = useMemo(
    () => buildMatrix({ ...base, categories: params.categories }).columns,
    [base, params.categories],
  );

  const update = (patch: Parameters<typeof writeMatrixParams>[1]) => {
    setSearchParams(writeMatrixParams(searchParams, patch), { replace: true });
  };

  const toggleCategory = (c: string) => {
    const next = params.categories.includes(c)
      ? params.categories.filter(x => x !== c)
      : [...params.categories, c];
    update({ categories: next });
  };

  // An empty selection means "every candidate", so switching one column off
  // from that state has to materialise the rest rather than select nothing.
  const shownIds = model.columns.map(c => c.id);
  const toggleColumn = (id: string) => {
    const on = shownIds.includes(id);
    const next = on ? shownIds.filter(x => x !== id) : [...shownIds, id];
    const everything = next.length === candidates.length && params.selected.length === 0;
    update({ selected: everything ? [] : next });
  };

  const printHref = `/catalog/compatibility/print${paramKey ? `?${paramKey}` : ''}`;

  return (
    <MainLayout>
      <PageBanner>
        {/* ml 1: on the 28px line the other catalog titles start on. */}
        <PageTitle sx={{ ml: RAIL_TITLE_ML }}>Compatibility Matrix</PageTitle>
        <Box sx={{ display: 'flex', gap: 0.75, ml: 1, flexWrap: 'wrap' }}>
          {model.availableCategories.map(c => (
            <button
              key={c}
              type="button"
              aria-pressed={params.categories.includes(c)}
              onClick={() => { toggleCategory(c); }}
              style={chipToggleSty(params.categories.includes(c), true)}
            >
              {c}
            </button>
          ))}
        </Box>
        {/* Columns and Hide empty rows, then share and Print - the order every
            printable page uses (see DocumentActions). The toggles keep their
            own panel-chip size; the cluster centres them, which is all the
            row needed. */}
        <DocumentActions onPrint={() => { window.open(printHref, '_blank'); }} spec={compatExportSpec()}>
          <button type="button" aria-pressed={picking} onClick={() => { setPicking(v => !v); }} style={panelToggleSty(picking)}>
            Columns {params.selected.length > 0 ? `(${String(model.columns.length)})` : ''}
          </button>
          <button type="button" aria-pressed={params.omitEmptyRows} onClick={() => { update({ omitEmptyRows: !params.omitEmptyRows }); }} style={panelToggleSty(params.omitEmptyRows)}>
            Hide empty rows
          </button>
        </DocumentActions>
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
        {picking && (
          <Box sx={{ mb: 2, p: 1.5, background: 'var(--shf-graphite-800)', border: '1px solid var(--shf-graphite-700)', borderRadius: '2px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--shf-graphite-300)' }}>
                Columns - in the order picked
              </Box>
              {/* Always in the row, hidden rather than unmounted when there is
                  nothing to reset: mounting it made the header a few pixels
                  taller than the caption alone, and the whole picker - and the
                  matrix under it - shifted every time a column was picked. */}
              <button
                type="button"
                onClick={() => { update({ selected: [] }); }}
                style={{ ...chipToggleSty(false), visibility: params.selected.length > 0 ? 'visible' : 'hidden' }}
                aria-hidden={params.selected.length === 0}
                tabIndex={params.selected.length > 0 ? 0 : -1}
              >
                Show all
              </button>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {candidates.map(c => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={shownIds.includes(c.id)}
                  onClick={() => { toggleColumn(c.id); }}
                  style={chipToggleSty(shownIds.includes(c.id))}
                  title={c.kind === 'equipment' ? 'Catalog radio (organic)' : `${c.category} platform`}
                >
                  {c.label}
                </button>
              ))}
            </Box>
          </Box>
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

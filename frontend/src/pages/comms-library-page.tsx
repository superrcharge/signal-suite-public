import { useSearchParams } from 'react-router';
import { Box } from '@mui/material';
import { MainLayout } from '@/components/layouts';
import { CONTENT_GUTTER, HEADER_HEIGHT } from '@/components/layouts/main-layout';
import { PageBanner, PageTitle, RAIL_TITLE_ML } from '@/components/common';
import { RAIL_BANNER_H } from '@/components/common/banner-controls';
import { DocumentActions, libraryExportSpec } from '@/components/common/sheet-export';
import { LibraryPane } from '@/components/catalog/library-pane';
import { chipToggleSty } from '@/components/catalog/chip-styles';
import { LIBRARIES, isLibraryKey, libraryLabel, libraryQuery, type LibraryKey } from '@/components/catalog/library-keys';
import '@/styles/catalog-tokens.css';

/**
 * The three centrally-managed reference tables, on a route of their own.
 *
 * They already existed as panes inside the 3-pane editor, reachable only by a
 * writer who opened the editor and knew to click one of three small buttons.
 * That put browse-only access to reference data behind a write-gated screen,
 * and it is why the Transport Library had no way to be read at all: the browse
 * page's chip row carried Waveforms and Services and stopped there, because a
 * chip row does not grow a fourth entry gracefully.
 *
 * **"Comms Library", not "RF Library".** Transports name the non-SATCOM paths
 * a PACE tier can point at, and the first of those is a fibre circuit, which
 * is not radio frequency at all. The name has to cover the set it holds.
 *
 * This page owns no CRUD of its own. Each pane already carries its own
 * controls and its own write gate, so browsing is open to everyone and the
 * editing affordances appear only for the roles that have them - which is the
 * whole reason the panes had to become self-gating before this route existed.
 */

export function CommsLibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Which library is open lives in the URL, unlike the editor's equivalent
  // local state: this is a page someone links to ("the transport list"), and
  // three libraries behind one route are worth addressing individually.
  const param = searchParams.get('lib');
  const active: LibraryKey = isLibraryKey(param) ? param : 'waveforms';
  const activeLabel = libraryLabel(active);

  const select = (next: LibraryKey) => {
    const params = new URLSearchParams(searchParams);
    // Waveforms is the default, so it stays out of the URL - the same
    // asymmetry the catalog tab and the compare toggles already use.
    if (next === 'waveforms') params.delete('lib');
    else params.set('lib', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <MainLayout>
      <PageBanner>
        {/* ml 1: the title starts on the 28px line the pane's own heading
            ("Waveform Library") and rows start on, not the bar's 20px inset. */}
        <PageTitle sx={{ ml: RAIL_TITLE_ML }}>Comms Library</PageTitle>
        <Box sx={{ display: 'flex', gap: 0.75, ml: 1 }}>
          {LIBRARIES.map(lib => (
            <button
              key={lib.key}
              type="button"
              aria-pressed={active === lib.key}
              onClick={() => { select(lib.key); }}
              style={chipToggleSty(active === lib.key, true)}
            >
              {lib.label}
            </button>
          ))}
        </Box>
        {/* Print and share for the open library, right end, the same slot
            every printable page uses (see DocumentActions). The pane itself is
            the sheet root, so share exports the table as it stands. */}
        <DocumentActions
          onPrint={() => { window.open(`/catalog/comms-library/print${libraryQuery(active)}`, '_blank'); }}
          spec={libraryExportSpec(activeLabel)}
        />
      </PageBanner>

      {/* Left-justified, not centred. Every other surface in this part of the
          app - the browse grid, the editor's three panes, the data sheet rail -
          starts at the left edge, and a centred column here read as a different
          kind of page.

          Wide, because the rows use the width: a waveform or service row puts
          its carriers in a column on the same line rather than beneath it, so
          every entry is one even line and the list grows half as fast. It was
          720 when these were a 440px editor column; that left most of a
          desktop window empty. Still capped, so an ultrawide monitor does not
          stretch the name column into a gap. */}
      <Box sx={{
        background: 'var(--shf-graphite-900)',
        // Fills the window under the header and banner on a short library
        // (Transports has four rows); from the viewport, because a
        // percentage min-height has nothing to resolve against here.
        minHeight: `calc(100vh - ${String(HEADER_HEIGHT + RAIL_BANNER_H)}px)`,
        mx: -CONTENT_GUTTER,
        mb: -CONTENT_GUTTER,
      }}>
        <Box sx={{ width: '100%', maxWidth: 1280 }}>
          <LibraryPane lib={active} />
        </Box>
      </Box>
    </MainLayout>
  );
}

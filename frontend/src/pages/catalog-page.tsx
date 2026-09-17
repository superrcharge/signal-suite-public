import { useState, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { Box, Chip, InputAdornment, TextField, Typography, CircularProgress, useMediaQuery, useTheme } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { MainLayout } from '@/components/layouts';
import { CONTENT_GUTTER, HEADER_HEIGHT } from '@/components/layouts/main-layout';
import {
  BrowseGrid,
  FacetSidebar,
  CATALOG_FACETS,
  applyFacets, buildFacetModels, clearApplied, clearPaused, clearTerm,
  decodeFacets, partitionSelection, tabFacets, setRange, toggleNone, toggleValue, writeFacets,
  CATALOG_RAIL_W,
} from '@/components/catalog';
import { PageBanner, RailTitle } from '@/components/common';
import { chipToggleSty, panelToggleSty } from '@/components/catalog/chip-styles';
import { useEquipment } from '@/services';
import { compareNatural } from '@/utils';
import '@/styles/catalog-tokens.css';

/**
 * Every tab is a `terminal_type` filter over equipment, which is what this page
 * browses. It used to carry `waveforms` and `services` too, and those were a
 * different kind of thing entirely: they replaced the browse grid with a
 * read-only view of a reference table. Both tables now live on
 * `/catalog/comms-library`, which browses *and* edits them, so a second
 * read-only surface was two places to look for one fact.
 */
const CATALOG_TABS = ['all', 'satcom', 'radio'] as const;
type CatalogTab = (typeof CATALOG_TABS)[number];

const TAB_LABELS: Record<CatalogTab, string> = {
  all: 'All',
  satcom: 'SATCOM',
  radio: 'Radio',
};

function isCatalogTab(value: string | null): value is CatalogTab {
  return value !== null && (CATALOG_TABS as readonly string[]).includes(value);
}

/** Where a retired library tab's URL now goes. */
const RETIRED_TABS: Record<string, string> = {
  waveforms: '/catalog/comms-library',
  services: '/catalog/comms-library?lib=services',
};

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const theme = useTheme();
  // Below md the rail becomes a strip above the grid, and starts closed: a
  // 240px column plus a 320px-minimum card leaves nothing for the card.
  const narrow = useMediaQuery(theme.breakpoints.down('md'));
  /**
   * Open/closed is a display preference, not a location, so it stays out of
   * the URL: a link pasted to a colleague should carry the filters, not the
   * reader's view of them.
   *
   * `null` means "nobody has said", so the width decides; a real boolean is a
   * choice and outlives a resize. It is deliberately not `useState(!narrow)`,
   * which latches whatever `useMediaQuery` answered on the very first render -
   * and that answer is `false` before the listener attaches, so a narrow load
   * would open the rail and never close it, while a zero-width first paint
   * closes it and never opens it. Both were observed.
   */
  const [filtersChoice, setFiltersChoice] = useState<boolean | null>(null);
  const filtersOpen = filtersChoice ?? !narrow;

  /**
   * The rail's own view state: which sections are open, and which have their
   * value tail expanded.
   *
   * It lives here rather than in `FacetSidebar` because the rail is
   * conditionally rendered, so closing it from the toolbar switch unmounts it
   * and state inside it would go with it - open a section, close the rail,
   * reopen it, and everything had collapsed again. `filtersChoice` already
   * survives that by living here. (The original cause was a library tab
   * unmounting the rail; those tabs are retired and the switch does the same
   * thing, so the decision outlived its first reason.)
   *
   * Not in the URL, for the same reason as `filtersChoice`: it is a display
   * preference, not a location, and a link pasted to a colleague should carry
   * the filters rather than the reader's view of them.
   *
   * **It tracks the open sections, not the closed ones, and that is what makes
   * "all collapsed" the default.** Eleven facets expanded is a rail metres
   * long that has to be scrolled past to reach the one you want, so the rail
   * opens as a list of headings - the facet names are the index. Seeding a
   * *collapsed* set with every facet id instead would need the facet list,
   * which does not exist on the first render: the equipment query has not
   * resolved, there are no models, and the set would seed empty and stay
   * empty. That is the same latch that caught the rail's own open/closed
   * default against `useMediaQuery` and the custom threshold box. An empty
   * set meaning "nothing is open" needs no data and cannot be caught by it.
   *
   * A closed section that is filtering still prints `n on` on its header, so
   * this hides controls and never hides an applied filter.
   */
  const [expandedFacets, setExpandedFacets] = useState<ReadonlySet<string>>(new Set());
  const [expandedTails, setExpandedTails] = useState<ReadonlySet<string>>(new Set());

  const toggleIn = (set: (fn: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void) =>
    (facetId: string) => {
      set(prev => {
        const next = new Set(prev);
        if (!next.delete(facetId)) next.add(facetId);
        return next;
      });
    };

  // The tab lives in the URL so the dashboard tiles can deep-link to it and so
  // a filtered view is shareable. Anything unrecognized falls back to All.
  const typeParam = searchParams.get('type');
  const filter: CatalogTab = isCatalogTab(typeParam) ? typeParam : 'all';

  // The two retired library tabs redirect rather than falling through to the
  // All fallback below, which would drop someone on the equipment grid with a
  // stale ?type= in the address bar and no hint that the list they asked for
  // moved. Declarative rather than an effect, so there is no frame of the
  // wrong grid first, and `replace` so Back does not bounce off it.
  const retired = typeParam === null ? undefined : RETIRED_TABS[typeParam];

  const setFilter = (next: CatalogTab) => {
    const params = new URLSearchParams(searchParams);
    // Omit the param for All so the bare /catalog URL stays clean.
    if (next === 'all') params.delete('type');
    else params.set('type', next);
    // replace: true - switching tabs is not a navigation worth a history entry.
    setSearchParams(params, { replace: true });
  };

  // Filters live in the URL beside the tab, so a filtered catalog is a link
  // someone can paste. Out-of-scope terms are kept and never written back:
  // switching All -> Radio -> All has to restore a SATCOM filter, not destroy
  // it, which is the same rule the compare page's selection follows.
  const selection = useMemo(() => decodeFacets(searchParams), [searchParams]);

  const applySelection = (next: typeof selection) => {
    // replace: true - a filter click is a view adjustment, not a place to
    // come back to with the Back button.
    setSearchParams(writeFacets(searchParams, next), { replace: true });
  };

  const { data, isLoading } = useEquipment();

  /**
   * The records the tab and the search box leave, before any facet applies.
   *
   * This split is load-bearing rather than tidiness. The facet sidebar reads
   * THIS list to decide which facets to draw and what values they offer, and
   * reading the facet-filtered result instead would let one selection erase
   * another facet: pick an orbit, every radio drops out, and the radio-only
   * Waveforms facet disappears - possibly the one the reader was about to use.
   */
  const pool = useMemo(() => {
    const items = data?.equipment ?? [];
    const alpha = (a: { nomenclature: string }, b: { nomenclature: string }) =>
      compareNatural(a.nomenclature, b.nomenclature);

    const matches = items.filter(eq => {
      if (filter !== 'all' && eq.terminal_type !== filter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = [
          eq.nomenclature,
          eq.nickname ?? '',
          eq.make ?? '',
          eq.one_liner ?? '',
          ...(eq.data?.services ?? []).map(s => s.abbrev + ' ' + s.name),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // All tab: SATCOM first (alpha), then Radio (alpha). Other tabs: just alpha.
    if (filter === 'all') {
      return [
        ...matches.filter(eq => eq.terminal_type !== 'radio').sort(alpha),
        ...matches.filter(eq => eq.terminal_type === 'radio').sort(alpha),
      ];
    }
    return [...matches].sort(alpha);
  }, [data, filter, search]);

  const facetTab = filter === 'satcom' || filter === 'radio' ? filter : 'all';
  const facets = useMemo(() => tabFacets(CATALOG_FACETS, facetTab), [facetTab]);
  const filtered = useMemo(
    () => applyFacets(pool, facets, selection),
    [pool, facets, selection],
  );
  // Every tab-scoped facet is applied; only the ones that can tell the pool
  // apart are drawn. A facet carrying an active term is always drawn even if
  // it cannot, or a link's filter would be working with no way to switch it
  // off - an invisible filter being strictly worse than a redundant control.
  const facetModels = useMemo(
    () => buildFacetModels(pool, facets, selection)
      .filter(m => m.discriminates || m.activeCount > 0),
    [pool, facets, selection],
  );
  // Applied versus held, in one place. `Filters (n)`, `Clear (n)`, the rail's
  // footer and the empty state all read `appliedCount`, so no control can print
  // a number for terms the page is not acting on - which was that bug.
  //
  // The label pool is the WHOLE equipment list, not `pool`. On
  // ?type=satcom&f.wf=tsm the tab pool holds only SATCOM records, so the only
  // records carrying TSM's display casing are exactly the ones the tab filtered
  // out, and the chip would read the lowercased URL key instead.
  const split = useMemo(
    () => partitionSelection(selection, CATALOG_FACETS, facetTab, data?.equipment ?? []),
    [selection, facetTab, data],
  );
  const activeFilters = split.appliedCount;
  // No "usable" guard any more. It existed because the waveforms and services
  // tabs carried none of these fields, so the switch was rendered disabled
  // there; `tabFacets` is a pure filter over the static CATALOG_FACETS and
  // every remaining tab is an equipment filter, so it can never be empty. A
  // permanently-true guard reads like a live one. If a tab ever does run out
  // of facets, `FacetSidebar` already says "Nothing here varies enough to
  // filter on" rather than rendering blank.
  const showSidebar = filtersOpen;

  const shownCount = filtered.length;
  const totalCount = data?.equipment.length ?? 0;

  // Matches the active tab chip exactly - these controls sit on the same
  // toolbar row, so amber has to mean "selected" in all of them or none.
  const toggleSty = (active: boolean) => chipToggleSty(active, true);

  // After every hook, never before one: an early return above them would make
  // the hook count depend on the URL.
  if (retired !== undefined) return <Navigate to={retired} replace />;

  return (
    <MainLayout>
      {/* This page is a full dark panel rather than a bar over page content, so
          the whole surface bleeds past the layout gutter instead of just a
          banner: otherwise the panel floated inset with the page colour showing
          around it. Derived from CONTENT_GUTTER for the same reason PageBanner
          is, so changing the layout's padding cannot leave this behind. */}
      <Box
        sx={{
          background: 'var(--shf-graphite-900)',
          // From the viewport, not a percentage: see comms-library-page.
          minHeight: `calc(100vh - ${String(HEADER_HEIGHT)}px)`,
          mx: -CONTENT_GUTTER,
          mt: -CONTENT_GUTTER,
          mb: -CONTENT_GUTTER,
        }}
      >
        {/* Browse toolbar */}
        {/* The same bar the sheet and editor pages open with, so the three
            catalog surfaces read as one: rail-width title, amber rule, 30px
            controls. `mx: 0, mt: 0` because the panel around this already
            cancels the layout gutter; PageBanner's own bleed would double it. */}
        <PageBanner sx={{ mx: 0, mt: 0, flexWrap: 'wrap' }}>
          {/* The page's name over the facet rail, with the bar's rule on the
              rail's edge - the same block the sheet and editor pages open
              with. The rule goes when the rail does: Filters off unmounts the
              rail, and a rule at the rail width would then line up with nothing. */}
          <RailTitle width={CATALOG_RAIL_W} divider={filtersOpen}>
            Equipment Catalog
          </RailTitle>
          {/* First control after the title, ahead of the tabs: it governs the
              rail on the left edge of the page, so it sits nearest the rail
              rather than out in the middle of the bar. It must stay mounted on
              every tab - unmounting it slides every control behind it 88px
              left, which is the whole row moving out from under the pointer
              mid-click. */}
          <button
            type="button"
            onClick={() => { setFiltersChoice(!filtersOpen); }}
            aria-pressed={filtersOpen}
            // 12 more than the bar's gap: the grid pads its cards by 28, so
            // this lands on the first card's left edge.
            style={{ ...toggleSty(filtersOpen), marginLeft: 12 }}
          >
            Filters{activeFilters > 0 ? ` (${String(activeFilters)})` : ''}
          </button>

          <Box sx={{ display: 'flex', gap: 0.75 }}>
            {CATALOG_TABS.map(opt => (
              <Chip
                key={opt}
                label={TAB_LABELS[opt]}
                onClick={() => setFilter(opt)}
                variant={filter === opt ? 'filled' : 'outlined'}
                size="small"
                sx={{
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontSize: 11,
                  borderRadius: '2px',
                  ...(filter === opt
                    ? { background: 'var(--shf-amber)', color: 'var(--shf-black)', borderColor: 'var(--shf-amber)' }
                    : { color: 'var(--shf-paper)', borderColor: 'var(--shf-graphite-600)' }),
                }}
              />
            ))}
          </Box>

          {/* Held terms need a marker outside the rail, because the rail is
              unmounted while Filters is closed and starts closed below md -
              which is precisely the state a shared link lands a reader in.
              Never amber: on this row amber means "narrowing this grid", and a
              held term narrows nothing. It opens the rail rather than toggling
              it, since toggling would close the panel holding the answer.
              Carries the `ml: auto` that pushes the count and the search to
              the right end, so the only thing it can push is a caption and
              the search box - a control appearing beside the tabs would slide
              them out from under the pointer on the very click that summons it. */}
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {split.pausedCount > 0 && (
              <button
                type="button"
                onClick={() => { setFiltersChoice(true); }}
                style={{ ...panelToggleSty(false), padding: '4px 10px', fontSize: 10 }}
              >
                Paused ({split.pausedCount})
              </button>
            )}
            <Typography
              variant="caption"
              sx={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--shf-graphite-400)' }}
            >
              {shownCount} of {totalCount}
            </Typography>
          </Box>
          <TextField
            size="small"
            placeholder="Search by name, nickname, manufacturer, service…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{
              // Right-justified, 400 wide when the row has room and down to
              // 200 when it does not: at the 1280 floor with the sidebar open
              // a fixed 400 wrapped the field onto a second row under the
              // title and the rail rule stopped short of the underline. A
              // wrapping row wraps on the flex basis before it shrinks, so
              // the basis is the small size and grow takes it to the cap.
              // mr: 1 puts its right edge on the last card's: the grid pads
              // by 28, the bar by 20.
              flex: '1 1 200px', maxWidth: 400, mr: 1,
              '& .MuiInputBase-root': { height: 30, background: 'var(--shf-graphite-700)', color: 'var(--shf-paper)', fontFamily: 'var(--font-body)', fontSize: 13 },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--shf-graphite-600)' },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'var(--shf-graphite-400)', fontSize: 18 }} />
                  </InputAdornment>
                ),
              }
            }}
          />

        </PageBanner>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
            <CircularProgress sx={{ color: 'var(--shf-amber)' }} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'stretch', flexDirection: narrow ? 'column' : 'row' }}>
            {showSidebar && (
              <FacetSidebar
                models={facetModels}
                stacked={narrow}
                appliedCount={activeFilters}
                paused={split.paused}
                shownCount={filtered.length}
                onToggleValue={(id, key) => { applySelection(toggleValue(selection, id, key)); }}
                onToggleBlank={id => { applySelection(toggleNone(selection, id)); }}
                onSetRange={(id, min, max) => { applySelection(setRange(selection, id, min, max)); }}
                onClearAll={() => { applySelection(clearApplied(selection, CATALOG_FACETS, facetTab)); }}
                onClearTerm={(facetId, term) => { applySelection(clearTerm(selection, facetId, term)); }}
                onClearPaused={() => { applySelection(clearPaused(selection, CATALOG_FACETS, facetTab)); }}
                expanded={expandedFacets}
                expandedTails={expandedTails}
                onToggleCollapsed={toggleIn(setExpandedFacets)}
                onToggleTail={toggleIn(setExpandedTails)}
                onSetAllExpanded={ids => { setExpandedFacets(new Set(ids)); }}
              />
            )}
            {/* minWidth: 0 is mandatory, not defensive. BrowseGrid is a
                `repeat(auto-fill, minmax(320px, 1fr))` grid, and a flex item's
                default `min-width: auto` refuses to shrink below its content -
                so without this the grid pushes the panel into a horizontal
                scroll instead of reflowing to fewer columns. */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {filtered.length === 0 && activeFilters > 0 ? (
                <Box sx={{ p: 6, textAlign: 'center' }}>
                  <Typography sx={{
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'var(--shf-graphite-400)', mb: 2,
                  }}>
                    No equipment matches these filters
                  </Typography>
                  <button
                    type="button"
                    onClick={() => { applySelection(clearApplied(selection, CATALOG_FACETS, facetTab)); }}
                    style={toggleSty(false)}
                  >
                    Clear all filters
                  </button>
                </Box>
              ) : (
                <BrowseGrid items={filtered} />
              )}
            </Box>
          </Box>
        )}
      </Box>
    </MainLayout>
  );
}

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Box, CircularProgress, Typography, useMediaQuery, useTheme } from '@mui/material';

import {
  BrowseGrid,
  FacetSidebar,
  CATALOG_FACETS,
  EMPTY_SELECTION,
  applyFacets, buildFacetModels, clearApplied, clearPaused, clearTerm,
  partitionSelection, tabFacets, setRange, toggleNone, toggleValue,
} from '@/components/catalog';
import type { FacetSelection } from '@/components/catalog';
import { chipSty, chipToggleSty } from '@/components/catalog/chip-styles';
import { useEquipment } from '@/services';
import { compareNatural } from '@/utils';
import type { Equipment } from '@/types';
import { PickerSearch } from './picker-search';
import { FilterCheck } from './filter-check';
import { equipmentLabel, FILTER_CHIP_TEXT, filterChipSty, missingChipSty, noteSty, trayLabelSty } from './pick-strip-styles';

/**
 * The catalog page's tabs, which are `terminal_type` filters over equipment.
 * Copied rather than imported: the page keeps them beside its URL handling,
 * and this picker has no URL.
 */
const CATALOG_TABS = ['all', 'satcom', 'radio'] as const;
type CatalogTab = (typeof CATALOG_TABS)[number];

const TAB_LABELS: Record<CatalogTab, string> = {
  all: 'All',
  satcom: 'SATCOM',
  radio: 'Radio',
};

const trayChipSty: CSSProperties = {
  ...chipSty('paper'),
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

const removeBtnSty: CSSProperties = {
  background: 'transparent', border: 0, padding: 0, margin: 0,
  color: 'inherit', font: 'inherit', fontSize: 12, lineHeight: 1,
  cursor: 'pointer',
};

/**
 * The Equipment Catalog's browse body, embedded: the same tabs, search box,
 * facet rail and card grid as `/catalog`, with every piece of state local so
 * it can sit inside a dialog without touching the page's URL.
 *
 * A card click toggles the record in `selectedIds` rather than opening its
 * data sheet, and the tray above the grid lists what is picked so far. The
 * tray reads from `selectedIds`, not from the filtered pool, so narrowing the
 * grid never hides a pick; an id the catalog no longer holds is drawn struck
 * through, the way the pick strips draw one, and can still be removed.
 */
export function CatalogPicker({ selectedIds, onToggle, height = '60vh' }: {
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** The rail's and the grid's scroll height; the picker is as tall as this plus its toolbar and tray. */
  height?: string;
}) {
  const theme = useTheme();
  // Below md the rail becomes a strip above the grid, as on the catalog page.
  const narrow = useMediaQuery(theme.breakpoints.down('md'));

  const [tab, setTab] = useState<CatalogTab>('all');
  const [search, setSearch] = useState('');
  // Closed by default: a dialog has less room than the page, and the tray
  // and grid are the point of the step.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selection, setSelection] = useState<FacetSelection>(EMPTY_SELECTION);
  // Open sections and expanded tails, keyed by facet id; see the catalog
  // page for why they live beside the rail rather than in it.
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

  const { data, isLoading } = useEquipment();
  const equipment = useMemo(() => data?.equipment ?? [], [data]);

  // The tab and search box's survivors, before any facet applies - the rail
  // reads this list, and reading the facet-filtered one would let a selection
  // under one facet erase another facet. The catalog page's pipeline.
  const pool = useMemo(() => {
    const alpha = (a: Equipment, b: Equipment) => compareNatural(a.nomenclature, b.nomenclature);
    const matches = equipment.filter(eq => {
      if (tab !== 'all' && eq.terminal_type !== tab) return false;
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
    if (tab === 'all') {
      return [
        ...matches.filter(eq => eq.terminal_type !== 'radio').sort(alpha),
        ...matches.filter(eq => eq.terminal_type === 'radio').sort(alpha),
      ];
    }
    return [...matches].sort(alpha);
  }, [equipment, tab, search]);

  const facets = useMemo(() => tabFacets(CATALOG_FACETS, tab), [tab]);
  const filtered = useMemo(() => applyFacets(pool, facets, selection), [pool, facets, selection]);
  const facetModels = useMemo(
    () => buildFacetModels(pool, facets, selection).filter(m => m.discriminates || m.activeCount > 0),
    [pool, facets, selection],
  );
  const split = useMemo(
    () => partitionSelection(selection, CATALOG_FACETS, tab, equipment),
    [selection, tab, equipment],
  );
  const activeFilters = split.appliedCount;

  // The tray: picks in natural order of their label, with the ids no record
  // answers to last.
  const byId = useMemo(() => new Map(equipment.map(e => [e.id, e])), [equipment]);
  const picked = useMemo(() => {
    const found: Equipment[] = [];
    const missing: string[] = [];
    for (const id of selectedIds) {
      const e = byId.get(id);
      if (e) found.push(e);
      else missing.push(id);
    }
    found.sort((a, b) => compareNatural(equipmentLabel(a), equipmentLabel(b)));
    return { found, missing };
  }, [selectedIds, byId]);

  const toggleSty = (active: boolean) => chipToggleSty(active, true);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Toolbar: the catalog banner's controls, without the banner. */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 1 }}>
        {/* Step 2's filter chip shape (maintainer, 10-24): hollow off, amber on, a reserved check. */}
        <button
          type="button"
          onClick={() => { setFiltersOpen(o => !o); }}
          aria-pressed={filtersOpen}
          style={{ ...filterChipSty(filtersOpen), ...FILTER_CHIP_TEXT }}
        >
          {`Filters${activeFilters > 0 ? ` (${String(activeFilters)})` : ''}`}
          <FilterCheck on={filtersOpen} />
        </button>

        <Box role="group" aria-label="Equipment type" sx={{ display: 'flex', gap: 0.75 }}>
          {CATALOG_TABS.map(opt => (
            <button
              key={opt}
              type="button"
              aria-pressed={tab === opt}
              onClick={() => setTab(opt)}
              style={{ ...filterChipSty(tab === opt), ...FILTER_CHIP_TEXT }}
            >
              {TAB_LABELS[opt]}
              <FilterCheck on={tab === opt} />
            </button>
          ))}
        </Box>

        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography
            variant="caption"
            sx={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--shf-paper)', fontWeight: 700 }}
          >
            {filtered.length} of {equipment.length}
          </Typography>
        </Box>
        <PickerSearch
          value={search}
          onChange={setSearch}
          placeholder="Search by name, nickname, manufacturer, service…"
          label="Search the catalog"
        />
      </Box>

      {/* The tray. Reads the selection, never the pool. */}
      <Box
        role="group"
        aria-label="Bringing"
        sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mb: 1, minHeight: 24 }}
      >
        <span style={trayLabelSty}>Bringing ({selectedIds.size})</span>
        {selectedIds.size === 0 && <span style={noteSty}>Nothing picked yet. Click a card to bring it.</span>}
        {picked.found.map(e => {
          const label = equipmentLabel(e);
          return (
            <span key={e.id} style={trayChipSty}>
              {label}
              <button type="button" aria-label={`Remove ${label}`} onClick={() => { onToggle(e.id); }} style={removeBtnSty}>×</button>
            </span>
          );
        })}
        {picked.missing.map(id => (
          <span key={'m-' + id} style={{ ...trayChipSty, ...missingChipSty, cursor: 'default' }} title="This catalog record no longer exists">
            {id}
            <button type="button" aria-label={`Remove ${id}`} onClick={() => { onToggle(id); }} style={removeBtnSty}>×</button>
          </span>
        ))}
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress sx={{ color: 'var(--shf-amber)' }} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'stretch', flexDirection: narrow ? 'column' : 'row', background: 'var(--shf-graphite-900)' }}>
          {filtersOpen && (
            <FacetSidebar
              models={facetModels}
              stacked={narrow}
              height={height}
              appliedCount={activeFilters}
              paused={split.paused}
              shownCount={filtered.length}
              onToggleValue={(id, key) => { setSelection(s => toggleValue(s, id, key)); }}
              onToggleBlank={id => { setSelection(s => toggleNone(s, id)); }}
              onSetRange={(id, min, max) => { setSelection(s => setRange(s, id, min, max)); }}
              onClearAll={() => { setSelection(s => clearApplied(s, CATALOG_FACETS, tab)); }}
              onClearTerm={(facetId, term) => { setSelection(s => clearTerm(s, facetId, term)); }}
              onClearPaused={() => { setSelection(s => clearPaused(s, CATALOG_FACETS, tab)); }}
              expanded={expandedFacets}
              expandedTails={expandedTails}
              onToggleCollapsed={toggleIn(setExpandedFacets)}
              onToggleTail={toggleIn(setExpandedTails)}
              onSetAllExpanded={ids => { setExpandedFacets(new Set(ids)); }}
            />
          )}
          {/* minWidth: 0, or the auto-fill grid refuses to shrink and pushes
              the dialog into a horizontal scroll - see the catalog page. The
              grid scrolls inside `height` so the rail and the cards share one
              scroll height. */}
          <Box sx={{ flex: 1, minWidth: 0, height, overflowY: 'auto' }}>
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
                  onClick={() => { setSelection(s => clearApplied(s, CATALOG_FACETS, tab)); }}
                  style={toggleSty(false)}
                >
                  Clear all filters
                </button>
              </Box>
            ) : (
              <BrowseGrid items={filtered} onSelect={eq => { onToggle(eq.id); }} selectedIds={selectedIds} />
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

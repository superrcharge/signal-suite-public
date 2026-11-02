import { Box, useMediaQuery } from '@mui/material';
import { platformTypeLabel } from '@/types';
import { ChipRow } from './chip-row';
import { chipToggleSty, panelToggleSty } from './chip-styles';
import { branchName } from './branch-colors';
import type { MatrixColumn } from './compat-matrix-model';
import { CAPTION_SX, GUTTER_W, PANEL_SX } from './matrix-panel-styles';

/**
 * The panels and banner controls of a matrix page, as components, so the
 * compatibility page and any page that draws the same grid from a different
 * selection compose them instead of copying them.
 */

/**
 * The banner's three panel toggles: Filters, Columns, Hide empty rows. The
 * counts are the ones the caller wants shown; Columns takes its count only
 * when something is picked, so the caller passes `null` otherwise.
 */
export function MatrixBannerToggles({
  filtering, onToggleFiltering, filterCount,
  picking, onTogglePicking, columnCount,
  omitEmptyRows, onToggleOmitEmptyRows,
}: {
  filtering: boolean;
  onToggleFiltering: () => void;
  filterCount: number;
  picking: boolean;
  onTogglePicking: () => void;
  /** The number of columns shown, or `null` to draw no count. */
  columnCount: number | null;
  omitEmptyRows: boolean;
  onToggleOmitEmptyRows: () => void;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 0.75, ml: 2, flexShrink: 0 }}>
      <button type="button" aria-pressed={filtering} onClick={onToggleFiltering} style={panelToggleSty(filtering)}>
        Filters {filterCount > 0 ? `(${String(filterCount)})` : ''}
      </button>
      <button type="button" aria-pressed={picking} onClick={onTogglePicking} style={panelToggleSty(picking)}>
        Columns {columnCount !== null ? `(${String(columnCount)})` : ''}
      </button>
      <button type="button" aria-pressed={omitEmptyRows} onClick={onToggleOmitEmptyRows} style={panelToggleSty(omitEmptyRows)}>
        Hide empty rows
      </button>
    </Box>
  );
}

/**
 * The "prints on N pages" readout and the Fit to one page control, as the
 * children of `DocumentActions`. `readout` is the full sentence, or `null`
 * to draw none. Compare's wording where it fits: the banner carries one more
 * toggle than compare's, and at the 1280 floor "prints on" was the 40px the
 * row ran past the content line by, so below 1400 it reads "10 pages", with
 * the full sentence as its tooltip. `roomy` overrides the breakpoint.
 */
export function MatrixFitReadout({ readout, fit, onToggleFit, roomy }: {
  readout: string | null;
  fit: boolean;
  onToggleFit: () => void;
  roomy?: boolean;
}) {
  const wide = useMediaQuery('(min-width: 1400px)');
  const full = roomy ?? wide;
  return (
    <>
      {readout !== null && (
        <span
          title={readout}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--shf-graphite-300)', whiteSpace: 'nowrap' }}
        >
          {full ? readout : readout.replace(/^prints on /, '')}
        </span>
      )}
      <Box sx={{ display: 'flex', border: '1px solid var(--shf-graphite-600)', borderRadius: '4px', overflow: 'hidden' }}>
        <button
          type="button"
          aria-pressed={fit}
          onClick={onToggleFit}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '0 10px', height: 28, border: 'none', cursor: 'pointer',
            background: fit ? 'var(--shf-amber)' : 'transparent',
            color: fit ? '#0A0A0A' : 'var(--shf-graphite-300)',
          }}
        >
          Fit to one page
        </button>
      </Box>
    </>
  );
}

/**
 * The Filters panel: its caption, the Clear button, the Branch row, then
 * whatever other rows the page passes as `children` (the compatibility page
 * passes Type).
 */
export function MatrixFiltersPanel({ filterCount, onClear, availableBranches, branches, onToggleBranch, children }: {
  filterCount: number;
  onClear: () => void;
  availableBranches: string[];
  branches: string[];
  onToggleBranch: (branch: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <Box sx={PANEL_SX}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box sx={CAPTION_SX}>Filters - any of each, all together</Box>
        {/* Hidden rather than unmounted, for the same reason as the
            Columns panel's buttons below: mounting it would shift
            everything under it. */}
        <button
          type="button"
          onClick={onClear}
          style={{ ...chipToggleSty(false), visibility: filterCount > 0 ? 'visible' : 'hidden' }}
          aria-hidden={filterCount === 0}
          tabIndex={filterCount > 0 ? 0 : -1}
        >
          Clear
        </button>
      </Box>
      <ChipRow gutter="Branch" gutterWidth={GUTTER_W}>
        {availableBranches.map(b => (
          <button
            key={b}
            type="button"
            aria-pressed={branches.includes(b)}
            onClick={() => { onToggleBranch(b); }}
            style={chipToggleSty(branches.includes(b), true)}
            title={branchName(b)}
          >
            {b}
          </button>
        ))}
      </ChipRow>
      {children}
    </Box>
  );
}

/**
 * The Columns panel: one row per group, in the order given, each with its
 * ALL tile. `onSetColumns` switches the given ids on or off; the page owns
 * what that does to its selection.
 */
export function MatrixColumnsPanel({
  groups, shownIds, allSelected, selectedCount,
  onSelectAll, onClear, onSetColumns,
}: {
  groups: { label: string; columns: MatrixColumn[] }[];
  shownIds: string[];
  allSelected: boolean;
  /** How many selection entries the page holds; Clear shows only when > 0. */
  selectedCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onSetColumns: (ids: string[], on: boolean) => void;
}) {
  return (
    <Box sx={PANEL_SX}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box sx={CAPTION_SX}>
          Columns - in the order picked
        </Box>
        {/* Always in the row, hidden rather than unmounted when there is
            nothing to do: mounting one made the header a few pixels
            taller than the caption alone, and the whole picker - and the
            matrix under it - shifted every time a column was picked.
            Select all takes everything the filters allow; Clear goes
            back to the blank grid the page opens on. */}
        <button
          type="button"
          onClick={onSelectAll}
          style={{ ...chipToggleSty(false), visibility: allSelected ? 'hidden' : 'visible' }}
          aria-hidden={allSelected}
          tabIndex={allSelected ? -1 : 0}
        >
          Select all
        </button>
        <button
          type="button"
          onClick={onClear}
          style={{ ...chipToggleSty(false), visibility: selectedCount > 0 ? 'visible' : 'hidden' }}
          aria-hidden={selectedCount === 0}
          tabIndex={selectedCount > 0 ? 0 : -1}
        >
          Clear
        </button>
      </Box>
      {/* One row per branch, in precedence order. A platform with
          several branches is in each of their rows; every copy is the
          same column. */}
      {groups.map(group => {
        const ids = group.columns.map(c => c.id);
        const allOn = ids.every(id => shownIds.includes(id));
        return (
          <ChipRow key={group.label} gutter={group.label} gutterWidth={GUTTER_W}>
            {/* One tile doing both jobs, as on the Compare panels. Named
                for its group, or a screen reader hears twenty buttons
                all called "ALL". */}
            <button
              type="button"
              aria-pressed={allOn}
              aria-label={`All ${group.label}`}
              onClick={() => { onSetColumns(ids, !allOn); }}
              style={{ ...chipToggleSty(allOn), fontWeight: 700, letterSpacing: '0.1em' }}
            >
              ALL
            </button>
            {group.columns.map(c => (
              <button
                key={c.id}
                type="button"
                aria-pressed={shownIds.includes(c.id)}
                onClick={() => { onSetColumns([c.id], !shownIds.includes(c.id)); }}
                style={chipToggleSty(shownIds.includes(c.id))}
                title={c.kind === 'equipment' ? 'Catalog radio' : `${platformTypeLabel(c.assetType)}${c.branches.length > 0 ? ` - ${c.branches.map(branchName).join(', ')}` : ''}`}
              >
                {c.label}
              </button>
            ))}
          </ChipRow>
        );
      })}
    </Box>
  );
}

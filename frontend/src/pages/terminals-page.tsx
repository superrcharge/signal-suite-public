import { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  Box,
  TextField,
  InputAdornment,
  Typography,
  IconButton,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import { useSearchParams } from 'react-router';
import {
  EmptyState, LoadingSpinner, PageBanner, PageTitle, ScopeSwitch,
  StatStrip, StatCell, PillBadge, SectionBadge, ListPagination,
  SEARCH_FIELD_SX, PANEL_SX, TABLE_HEAD_SX, TIGHT_CELL_SX, TOGGLE_SX,
} from '@/components/common';
import { MainLayout } from '@/components/layouts';
import { CONTENT_GUTTER, HEADER_HEIGHT } from '@/components/layouts/main-layout';
import { TerminalDrawer } from './terminal-drawer';
import { InlineTextCell, InlineSelectCell } from './inline-edit-cell';
import { useTerminals, useTerminal, useTerminalTags, useSections, useUpdateTerminal } from '@/services';
import { POP_PIN_OPTIONS, POP_PIN_LABELS, isStarshieldModel } from './terminal-constants';
import { STATUS_OPTIONS, STATUS_LABELS, STATUS_STYLES, ALERT_STATUSES } from './asset-status-constants';
import { ApiClientError } from '@/services/api-client';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts';
import { STATUS_COLORS, NEUTRAL_COLOR } from '@/theme/asset-colors';
import type { Terminal, UpdateTerminalRequest } from '@/types';
import { EMPTY_VALUE, emptyListDescription } from '@/utils';
import { useDebounce } from '@/hooks';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 0] as const; // 0 = Show All

/**
 * Kit/PIM and serial identifiers. Monospace so the digits stay column-aligned
 * down the table, which is the whole reason these two are not proportional.
 *
 * Deliberately carries no fontSize or color: the cells render it on a
 * `Typography variant="body2"`, so size and color come from the same place the
 * Name and Model cells get theirs and the four cannot drift. They used to be
 * 12px `text.secondary` and 11px `text.disabled`, which made the two values an
 * operator reads off a physical label the hardest text on the row.
 */
const MONO_ID_SX = { fontFamily: '"SF Mono","Fira Code",monospace' } as const;

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

/** The shape is `PillBadge`; the status-to-colour lookup is this page's. */
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES['alert']!;
  return (
    <PillBadge dot={s.dot} bg={s.bg} color={s.color} border={s.border}>
      {STATUS_LABELS[status] ?? status}
    </PillBadge>
  );
}

export function TerminalsPage() {
  const { canWrite } = useAuth();
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  // ?search= is a deep-link entrypoint only (the scope switch carries the term
  // across from the kits page). Typing after mount stays in local state.
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  // Hydrate the status filter from ?status=<key> on initial mount so
  // dashboard tile clicks pre-filter the page. After mount the URL is
  // not synced back - user clicks on the in-page stat strip mutate
  // local state only. URL is purely for deep-linking entrypoints.
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(() => {
    const initial = searchParams.get('status');
    return initial ? new Set([initial]) : new Set();
  });
  // ?model= carries comma-separated slugs (e.g. "mini,hp" from dashboard
  // family tiles) - split so each toggle highlights individually.
  //
  // Unlike search and status above, the URL is the source of truth for this
  // one. Deriving the set rather than mirroring it into state is what stops an
  // unrelated param write - drawer=edit, from the row Edit button - replaying a
  // stale ?model= over the filter the user is actually looking at.
  const modelParam = searchParams.get('model');
  const activeModels = useMemo(
    () => (modelParam ? new Set(modelParam.split(',')) : new Set<string>()),
    [modelParam],
  );
  // Narrowing the filter can leave the current page out of range.
  useEffect(() => { setPage(1); }, [modelParam]);
  const sectionFilter  = searchParams.get('sections') ?? undefined;
  const tagFilter      = searchParams.get('tag') ?? undefined;
  const drawerParam    = searchParams.get('drawer');
  const editId         = searchParams.get('id') ?? undefined;
  const focusParam     = searchParams.get('focus');
  const drawerFocus: 'name' | 'notes' | undefined =
    focusParam === 'notes' ? 'notes' : focusParam === 'name' ? 'name' : undefined;
  const drawerMode: 'add' | 'edit' | null =
    drawerParam === 'add' ? 'add' : drawerParam === 'edit' && editId ? 'edit' : null;
  const rawLimit = searchParams.get('limit');
  const pageLimit = rawLimit !== null ? parseInt(rawLimit, 10) : 50;

  const handlePageLimitChange = (newLimit: number) => {
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set('limit', String(newLimit));
      return n;
    });
    setPage(1);
  };

  const handleDrawerClose = () => setSearchParams((prev) => {
    const n = new URLSearchParams(prev);
    n.delete('drawer');
    n.delete('id');
    n.delete('focus');
    return n;
  });
  const handleEditClick = (id: string) => setSearchParams((prev) => {
    const n = new URLSearchParams(prev);
    n.set('drawer', 'edit');
    n.set('id', id);
    return n;
  });
  const handleNotesClick = (id: string) => setSearchParams((prev) => {
    const n = new URLSearchParams(prev);
    n.set('drawer', 'edit');
    n.set('id', id);
    n.set('focus', 'notes');
    return n;
  });
  // replace, not push - a filter click is a view adjustment, so Back should
  // leave the list rather than step backwards through every toggle.
  const handleModelChange = (next: Set<string>) => setSearchParams((prev) => {
    const n = new URLSearchParams(prev);
    if (next.size > 0) n.set('model', [...next].join(','));
    else n.delete('model');
    return n;
  }, { replace: true });

  const updateTerminal = useUpdateTerminal();
  const { showToast } = useToast();

  const saveField = async (id: string, data: UpdateTerminalRequest) => {
    try {
      await updateTerminal.mutateAsync({ id, data });
      showToast('Change saved');
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : 'Failed to save change.', { severity: 'error' });
      throw err;
    }
  };

  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading, error } = useTerminals({
    search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
    sections: sectionFilter,
    model: modelParam ?? undefined,
    tag: tagFilter,
    page,
    limit: pageLimit,
  });

  const { data: allTags } = useTerminalTags();

  // If the current ?tag= filter no longer exists (last terminal that
  // carried it lost the tag), strip it from the URL so the page
  // doesn't show 0 results with no obvious recovery.
  useEffect(() => {
    if (!tagFilter || !allTags) return;
    if (!allTags.includes(tagFilter)) {
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev);
        n.delete('tag');
        return n;
      });
    }
  }, [tagFilter, allTags, setSearchParams]);

  const handleTagClick = (tag: string | null) => {
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      if (tag) n.set('tag', tag);
      else n.delete('tag');
      return n;
    });
    setPage(1);
  };

  const { data: sectionsData } = useSections();
  const sectionColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    (sectionsData ?? []).forEach((s) => { map[s.key] = s.color; });
    return map;
  }, [sectionsData]);

  // PoP pins only apply to Starshield terminals - hide the column when the
  // active filter is exclusively Paradigm/OneWeb models.
  const showPopColumn = activeModels.size === 0 || [...activeModels].some(isStarshieldModel);

  const allTerminals = useMemo(() => data?.terminals ?? [], [data?.terminals]);
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // The edit target, resolved from the page first and fetched by id only when
  // the page does not hold it. The list is paginated, so an edit deep-link for
  // a terminal on another page found nothing - and the drawer reads a missing
  // terminal as Add mode, so it rendered a blank Add form at an edit URL and
  // created a duplicate on submit.
  const listHit = drawerMode === 'edit' && editId
    ? allTerminals.find((t) => t.id === editId)
    : undefined;
  const { data: fetchedTerminal, isLoading: fetchingTerminal } = useTerminal(
    drawerMode === 'edit' && editId && !listHit ? editId : undefined,
  );
  const editTarget = listHit ?? fetchedTerminal;

  // The drawer opens only once its terminal has resolved, so mode 'edit' and an
  // absent terminal can never coexist while it is open. Said out loud rather
  // than left as a drawer that silently never appears: an edit link is
  // shareable, and a genuinely deleted id has to read as deleted.
  const drawerOpen = canWrite && (drawerMode === 'add' || editTarget !== undefined);
  const editTargetMissing =
    drawerMode === 'edit' && Boolean(editId) && !isLoading && !fetchingTerminal && !editTarget;

  // Client-side status filter only - model filter is now server-side
  const terminals = useMemo(() => {
    if (activeStatuses.size === 0) return allTerminals;
    return allTerminals.filter((t) =>
      activeStatuses.has(t.status) ||
      (activeStatuses.has('alert') && ALERT_STATUSES.includes(t.status))
    );
  }, [allTerminals, activeStatuses]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleStatClick = (key: string) => {
    if (key === 'all') {
      setActiveStatuses(new Set());
      return;
    }
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  const errorMessage =
    error instanceof ApiClientError
      ? error.message
      : error
        ? 'Failed to load terminals'
        : null;

  const sc = data?.status_counts ?? {};
  const statCells = [
    { key: 'all',        label: 'Total',      value: total,                                                                           sub: 'All terminals',      color: STATUS_COLORS.total },
    { key: 'available',  label: 'Available',  value: sc['available'] ?? 0,                                                            sub: 'Ready to assign',    color: STATUS_COLORS.available },
    { key: 'alert',      label: 'ALERT',      value: (sc['alert'] ?? 0) + (sc['alert-blue'] ?? 0) + (sc['alert-green'] ?? 0),        sub: 'On Standby',         color: STATUS_COLORS.alert },
    { key: 'on-mission', label: 'On Mission', value: sc['on-mission'] ?? 0,                                                           sub: 'Exercise / Forward', color: STATUS_COLORS.onMission },
    { key: 'reserved',   label: 'Reserved',   value: sc['reserved'] ?? 0,                                                             sub: 'RTO Managed',        color: STATUS_COLORS.reserved },
    { key: 'inop',       label: 'INOP',       value: sc['inop'] ?? 0,                                                                 sub: 'Broken / Turn In',   color: STATUS_COLORS.inop },
  ];

  return (
    <MainLayout>
      {/* The page is a column exactly as tall as the content area, so the table
          below can be the thing that scrolls and its header can pin to the top
          of it. `stickyHeader` sticks within the nearest scrollport, and the
          table's container is already one - it carries `overflow: auto` for the
          horizontal scroll, and CSS will not let that be one axis only. Left
          unbounded it never scrolls vertically, so a sticky `th` would sit there
          and never move; the page scrolled instead, one level up.

          Same shape as `catalog-sheet-page` and `catalog-editor-page`: a definite
          height from the viewport, `overflow: hidden`, and children bounded by
          it. The bleed lives here rather than on the banner, which is why the
          banner is passed `mt: 0` - `catalog-page` does the same, for the same
          reason: its own bleed on top of this one would double it. */}
      <Box
        sx={{
          height: `calc(100vh - ${String(HEADER_HEIGHT)}px)`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          mx: -CONTENT_GUTTER,
          mt: -CONTENT_GUTTER,
          mb: -CONTENT_GUTTER,
          px: CONTENT_GUTTER,
        }}
      >
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}
      {editTargetMissing && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={handleDrawerClose}>
          That terminal no longer exists - it may have been deleted. Nothing has been opened for
          editing.
        </Alert>
      )}
      {/* No `sticky`: the page does not scroll any more, the table does, so the
          banner is simply always there. */}
      <PageBanner variant="plain" sx={{ mx: -CONTENT_GUTTER, mt: 0 }}>
        <PageTitle visuallyHidden>Terminals</PageTitle>
        {!isLoading && (
          <StatStrip>
            {statCells.map((cell) => (
              <StatCell
                key={cell.key}
                label={cell.label}
                value={cell.value}
                hint={cell.sub}
                color={cell.color}
                active={cell.key === 'all' ? activeStatuses.size === 0 : activeStatuses.has(cell.key)}
                onClick={() => { handleStatClick(cell.key); }}
              />
            ))}
          </StatStrip>
        )}

      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        {/* Search */}
        <TextField
          size="small"
          placeholder="Search name, kit, serial, owner…"
          value={search}
          onChange={handleSearchChange}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={SEARCH_FIELD_SX}
          aria-label="Search terminals"
        />

        {/* Terminals ⇄ Kits - keeps the section filter across the switch */}
        <ScopeSwitch active="terminals" count={total} search={debouncedSearch} />

        {/* Variant filter - multi-select, matches stat strip toggle behaviour */}
        <ToggleButtonGroup
          value={activeModels.size === 0 ? ['all'] : [...activeModels]}
          onChange={(_, newValues: string[]) => {
            if (newValues.length === 0) {
              // Last button deselected - fall back to "all"
              handleModelChange(new Set());
            } else if (newValues.includes('all') && activeModels.size > 0) {
              // User clicked "All" while specific models were active → clear filter
              handleModelChange(new Set());
            } else {
              // Strip the 'all' sentinel (MUI includes it when adding to current selection)
              handleModelChange(new Set(newValues.filter((v) => v !== 'all')));
            }
            // The page reset rides on the ?model= change, in the effect above.
          }}
          size="small"
          aria-label="Variant filter"
          sx={TOGGLE_SX}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="mini">Mini</ToggleButton>
          <ToggleButton value="hp">HP</ToggleButton>
          <ToggleButton value="hornet">Hornet</ToggleButton>
          <ToggleButton value="ragno">Ragno</ToggleButton>
          <ToggleButton value="ow7">OW-7</ToggleButton>
          <ToggleButton value="ow10">OW-10</ToggleButton>
          <ToggleButton value="ow11">OW-11</ToggleButton>
        </ToggleButtonGroup>

        {/* Tag filter - only shown when at least one tag exists. Mirrors
            the variant toggle visually but is exclusive to a single tag
            since users typically filter by one operation at a time. */}
        {allTags && allTags.length > 0 && (
          <ToggleButtonGroup
            value={tagFilter ?? ''}
            exclusive
            onChange={(_, v: string | null) => handleTagClick(v || null)}
            size="small"
            aria-label="Tag filter"
            sx={TOGGLE_SX}
          >
            <ToggleButton value="" aria-label="All tags">
              <LocalOfferOutlinedIcon sx={{ fontSize: 14, mr: 0.5 }} />
              All
            </ToggleButton>
            {allTags.map((tag) => (
              <ToggleButton key={tag} value={tag}>{tag}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}
      </Box>
      </PageBanner>
      {/* Content */}
      {isLoading ? (
        <LoadingSpinner message="Loading terminals..." />
      ) : terminals.length === 0 ? (
        <EmptyState
          title="No terminals found"
          description={emptyListDescription('terminals', debouncedSearch, [
            activeStatuses.size > 0 ? 'status' : '',
            activeModels.size > 0 ? 'variant' : '',
            tagFilter ? 'tag' : '',
            sectionFilter ? 'section' : '',
          ])}
        />
      ) : (
        <Paper
          elevation={0}
          sx={{ ...PANEL_SX, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
        <TableContainer
          // `overflow: auto` rather than `hidden`. The radius needs a non-visible
          // overflow to clip against, and `hidden` was doing that - but this table
          // is eleven columns wide and measured 1246px inside a 982px container at
          // the 1280x720 floor, so `hidden` silently swallowed the last 264px and
          // there was no way to reach them. Contracts solves the same problem with
          // `tableLayout: 'fixed'`; that is wrong here, because squeezing eleven
          // columns into 982px would ellipsise the serial and the name, which are
          // the two values an operator reads off a physical label.
          //
          // `flex: 1` is what bounds it, and bounding it is what gives the
          // header's `position: sticky` somewhere to stick.
          sx={{ flex: 1, overflow: 'auto' }}
        >
          <Table
            aria-label="terminals table"
            size="small"
            stickyHeader
            sx={{
              tableLayout: 'auto',
              // Half padding. Eleven columns at MUI's 16px a side spend 352px on
              // gutters alone against a 974px container - more than the 272px
              // the table was overflowing by. Contracts cured the identical
              // disease the same way; see the note on its table.
              '& th, & td': { px: 1 },
              // The outer edges keep the full inset so text does not touch the
              // paper's rounded border.
              '& th:first-child, & td:first-child': { pl: 2 },
              '& th:last-child, & td:last-child': { pr: 2 },
              // Model, Kit/PIM, Section, Status, PoP and Updated are short
              // fixed-format values whose header is wider than anything under
              // it, so they give back another 4px a side. Set by column on the
              // table rather than on the cell: a rule on the table outranks a
              // cell's own class, which is the trap the contracts table
              // documents - `px` on the cell silently loses to the rule above.
              //
              // `nth-child`, NOT `nth-of-type`. A body row's first cell is a
              // `th` (`component="th" scope="row"` on the name, for row-header
              // semantics), so `td:nth-of-type(2)` is the THIRD cell in the row
              // while `th:nth-of-type(2)` is the second in the head. Every rule
              // below then landed one column right of the header it was meant
              // for, and the columns stopped lining up with their titles.
              // `nth-child` counts element position regardless of tag, so head
              // and body agree. Contracts can use `nth-of-type` safely only
              // because its body rows carry no `th`.
              '& th:nth-child(2), & td:nth-child(2)': { px: 0.5 },
              '& th:nth-child(3), & td:nth-child(3)': { px: 0.5 },
              '& th:nth-child(5), & td:nth-child(5)': { px: 0.5 },
              '& th:nth-child(6), & td:nth-child(6)': { px: 0.5 },
              '& th:nth-child(8), & td:nth-child(8)': { px: 0.5 },
              '& th:nth-child(10), & td:nth-child(10)': { px: 0.5 },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Terminal Name</TableCell>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Model</TableCell>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Kit / PIM #</TableCell>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Serial #</TableCell>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Section</TableCell>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Status</TableCell>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Assigned To</TableCell>
                {showPopColumn && <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>PoP</TableCell>}
                <TableCell sx={TABLE_HEAD_SX}>Notes</TableCell>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Updated</TableCell>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }} aria-label="row actions" />
              </TableRow>
            </TableHead>
            <TableBody>
              {terminals.map((t: Terminal) => {
                const sectionColor = sectionColorMap[t.section] ?? NEUTRAL_COLOR;
                return (
                  <TableRow
                    key={t.id}
                    sx={{
                      '&:last-child td, &:last-child th': { border: 0 },
                      '&:hover': { bgcolor: 'action.hover' },
                      '&:hover .row-edit-btn, &:focus-within .row-edit-btn': { opacity: 1 },
                    }}
                  >
                    <TableCell component="th" scope="row" sx={TIGHT_CELL_SX}>
                      <InlineTextCell
                        value={t.name}
                        allowEmpty={false}
                        maxLength={100}
                        readOnly={!canWrite}
                        aria-label={`edit name for ${t.name}`}
                        onSave={(v) => saveField(t.id, { name: v })}
                        renderDisplay={(v) => <Typography component="span" variant="body2" sx={{
                          fontWeight: 600
                        }}>{v}</Typography>}
                      />
                    </TableCell>
                    <TableCell sx={TIGHT_CELL_SX}>
                      <InlineSelectCell
                        value={t.model ?? ''}
                        readOnly={!canWrite}
                        aria-label={`edit model for ${t.name}`}
                        onSave={(v) => saveField(t.id, { model: v || null })}
                        options={[
                          { value: '',      label: 'None'   },
                          { value: 'mini',  label: 'Mini'   },
                          { value: 'hp',    label: 'HP'     },
                          { value: 'hornet',label: 'Hornet' },
                          { value: 'ragno', label: 'Ragno'  },
                          { value: 'ow7',   label: 'OW-7'   },
                          { value: 'ow10',  label: 'OW-10'  },
                          { value: 'ow11',  label: 'OW-11'  },
                        ]}
                        renderDisplay={(v) => {
                          const label = v === 'mini' ? 'Mini' : v === 'hp' ? 'HP' : v === 'hornet' ? 'Hornet' : v === 'ragno' ? 'Ragno' : v === 'ow7' ? 'OW-7' : v === 'ow10' ? 'OW-10' : v === 'ow11' ? 'OW-11' : EMPTY_VALUE;
                          return <Typography component="span" variant="body2" color={v ? 'text.primary' : 'text.disabled'}>{label}</Typography>;
                        }}
                      />
                    </TableCell>
                    <TableCell sx={TIGHT_CELL_SX}>
                      {(t.model === 'hornet' || t.model === 'ragno') ? (
                        <InlineTextCell
                          value={t.pim}
                          readOnly={!canWrite}
                          aria-label={`edit pim for ${t.name}`}
                          onSave={(v) => saveField(t.id, { pim: v })}
                          renderDisplay={(v) => (
                            <Typography component="span" variant="body2" sx={MONO_ID_SX}>{v}</Typography>
                          )}
                        />
                      ) : (
                        <InlineTextCell
                          value={t.kit}
                          readOnly={!canWrite}
                          aria-label={`edit kit for ${t.name}`}
                          onSave={(v) => saveField(t.id, { kit: v })}
                          renderDisplay={(v) => (
                            <Typography component="span" variant="body2" sx={MONO_ID_SX}>{v}</Typography>
                          )}
                        />
                      )}
                    </TableCell>
                    <TableCell sx={TIGHT_CELL_SX}>
                      <InlineTextCell
                        value={t.serial}
                        readOnly={!canWrite}
                        aria-label={`edit serial for ${t.name}`}
                        onSave={(v) => saveField(t.id, { serial: v })}
                        renderDisplay={(v) => (
                          <Typography component="span" variant="body2" sx={MONO_ID_SX}>{v}</Typography>
                        )}
                      />
                    </TableCell>
                    <TableCell sx={TIGHT_CELL_SX}>
                      <InlineSelectCell
                        value={t.section ?? ''}
                        readOnly={!canWrite}
                        aria-label={`edit section for ${t.name}`}
                        onSave={(v) => saveField(t.id, { section: v })}
                        options={[
                          { value: '', label: 'None' },
                          ...(sectionsData ?? []).map((s) => ({
                            value: s.key,
                            label: s.label,
                            renderOption: (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
                                {s.label}
                              </Box>
                            ),
                          })),
                        ]}
                        renderDisplay={(v) => (
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            {v
                              ? <SectionBadge section={v.toUpperCase()} color={sectionColor} />
                              : <Typography component="span" variant="body2" sx={{
                              color: 'text.disabled'
                            }}>{EMPTY_VALUE}</Typography>
                            }
                            {t.tag && (
                              // Stays outlined: the filled icon at this size reads as a
                              // solid blob and loses the tag silhouette entirely. Visibility
                              // comes from size and contrast instead. It was a 12px outline
                              // in text.disabled, which is the same treatment as an
                              // empty-value placeholder - the one thing a present value must
                              // not look like. text.primary rather than a literal white,
                              // because the theme has a light mode where white would vanish.
                              // ml pushes it off the section badge and toward the status
                              // column, so it reads as a marker on the row rather than
                              // punctuation attached to the badge.
                              <Tooltip title={`Tag: ${t.tag}`} placement="top" enterDelay={300}>
                                <LocalOfferOutlinedIcon
                                  aria-label={`tagged ${t.tag}`}
                                  sx={{ fontSize: 17, color: 'text.primary', flexShrink: 0, ml: 1 }}
                                />
                              </Tooltip>
                            )}
                          </Box>
                        )}
                      />
                    </TableCell>
                    <TableCell sx={TIGHT_CELL_SX}>
                      <InlineSelectCell
                        value={t.status}
                        readOnly={!canWrite}
                        aria-label={`edit status for ${t.name}`}
                        onSave={(v) => saveField(t.id, { status: v })}
                        options={STATUS_OPTIONS}
                        renderDisplay={(v) => <StatusBadge status={v} />}
                      />
                    </TableCell>
                    <TableCell sx={TIGHT_CELL_SX}>
                      <InlineTextCell
                        value={t.owner ?? ''}
                        emptyLabel="Unassigned"
                        readOnly={!canWrite}
                        aria-label={`edit owner for ${t.name}`}
                        onSave={(v) => saveField(t.id, { owner: v })}
                        renderDisplay={(v) => <Typography component="span" variant="body2" sx={{
                          fontWeight: 500
                        }}>{v}</Typography>}
                      />
                    </TableCell>
                    {showPopColumn && (
                      <TableCell sx={TIGHT_CELL_SX}>
                        {isStarshieldModel(t.model) ? (
                          <InlineSelectCell
                            value={t.pop_pin ?? ''}
                            readOnly={!canWrite}
                            aria-label={`edit PoP pin for ${t.name}`}
                            onSave={(v) => saveField(t.id, { pop_pin: v })}
                            options={[
                              { value: '', label: 'Not pinned' },
                              ...POP_PIN_OPTIONS,
                            ]}
                            renderDisplay={(v) => (
                              <Typography component="span" variant="body2" color={v ? 'text.primary' : 'text.disabled'}>
                                {v ? POP_PIN_LABELS[v] ?? v : 'Not pinned'}
                              </Typography>
                            )}
                          />
                        ) : (
                          <Typography component="span" variant="body2" sx={{
                            color: 'text.disabled'
                          }}>{EMPTY_VALUE}</Typography>
                        )}
                      </TableCell>
                    )}
                    <TableCell
                      sx={{
                        maxWidth: 0,
                        cursor: canWrite ? 'pointer' : 'default',
                        '&:hover .notes-edit-icon': { opacity: canWrite ? 1 : 0 },
                      }}
                      onClick={canWrite ? () => handleNotesClick(t.id) : undefined}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                        {t.notes
                          ? (
                            <Tooltip title={t.notes} placement="top-start" enterDelay={400}>
                              <Typography
                                variant="body2"
                                sx={{
                                  color: 'text.secondary',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  minWidth: 0,
                                  flex: 1
                                }}>
                                {t.notes}
                              </Typography>
                            </Tooltip>
                          )
                          : <Typography
                          variant="body2"
                          sx={{
                            color: 'text.disabled',
                            fontStyle: 'italic'
                          }}>{canWrite ? 'Add note…' : EMPTY_VALUE}</Typography>
                        }
                        {canWrite && <EditIcon className="notes-edit-icon" sx={{ fontSize: 12, opacity: 0, color: 'text.disabled', transition: 'opacity .1s', flexShrink: 0 }} />}
                      </Box>
                    </TableCell>
                    <TableCell sx={TIGHT_CELL_SX}>
                      {/* Two spans rather than one string, because truncation
                          cuts the tail and the tail is the half worth keeping.
                          The updater's name gives up its width first; the
                          relative time never truncates. Full text on hover. */}
                      <Box
                        title={`${t.updated_by || 'Unknown'} · ${relativeTime(t.updated_at)}`}
                        sx={{ display: 'flex', alignItems: 'baseline', gap: '4px', maxWidth: 112 }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ color: 'text.secondary', fontSize: 11, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {t.updated_by || 'Unknown'}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ color: 'text.secondary', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}
                        >
                          · {relativeTime(t.updated_at)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ ...TIGHT_CELL_SX, pl: 0, pr: 1 }}>
                      {canWrite && (
                        <Tooltip title="Edit terminal">
                          <IconButton
                            className="row-edit-btn"
                            size="small"
                            onClick={() => handleEditClick(t.id)}
                            sx={{ opacity: 0, transition: 'opacity .12s' }}
                            aria-label={`edit ${t.name}`}
                          >
                            <EditIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
          <ListPagination
            total={total}
            noun="terminal"
            page={page}
            totalPages={totalPages}
            onPrev={handlePrev}
            onNext={handleNext}
            pageLimit={pageLimit}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageLimitChange={handlePageLimitChange}
          />
        </Paper>
      )}
      </Box>
      <TerminalDrawer
        open={drawerOpen}
        mode={drawerMode ?? 'add'}
        terminal={drawerMode === 'edit' ? editTarget : undefined}
        focusField={drawerFocus}
        onClose={handleDrawerClose}
      />
    </MainLayout>
  );
}

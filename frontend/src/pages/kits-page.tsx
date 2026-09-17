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
import CheckIcon from '@mui/icons-material/Check';
import { useSearchParams } from 'react-router';
import {
  EmptyState, LoadingSpinner, PageBanner, PageTitle, ScopeSwitch,
  StatStrip, StatCell, PillBadge, TagBadge, SectionBadge, ListPagination,
  SEARCH_FIELD_SX, PANEL_SX, TABLE_HEAD_SX, TIGHT_CELL_SX, TOGGLE_SX,
} from '@/components/common';
import { MainLayout } from '@/components/layouts';
import { CONTENT_GUTTER, HEADER_HEIGHT } from '@/components/layouts/main-layout';
import { KitDrawer } from './kit-drawer';
import { InlineTextCell, InlineSelectCell, type InlineSelectOption } from './inline-edit-cell';
import { useKits, useKit, useSections, useUpdateKit } from '@/services';
import { KIT_TYPE_LABELS, KIT_NETWORKS } from './kit-constants';
import { STATUS_OPTIONS, STATUS_LABELS, STATUS_STYLES, ALERT_STATUSES } from './asset-status-constants';
import { ApiClientError } from '@/services/api-client';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts';
import { STATUS_COLORS, KIT_TYPE_COLORS, NEUTRAL_COLOR, badgeStyle } from '@/theme/asset-colors';
import type { Kit, UpdateKitRequest } from '@/types';
import { EMPTY_VALUE, emptyListDescription } from '@/utils';
import { useDebounce } from '@/hooks';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 0] as const; // 0 = Show All

const YES_NO_OPTIONS: InlineSelectOption[] = [
  { value: 'true',  label: 'Yes' },
  { value: 'false', label: 'No' },
];

// Remote is cyan and IFK magenta rather than blue/purple; see KIT_TYPE_COLORS
// in `@/theme/asset-colors` for why.
const TYPE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  remote: badgeStyle(KIT_TYPE_COLORS.remote),
  ifk:    badgeStyle(KIT_TYPE_COLORS.ifk),
  atk:    badgeStyle(KIT_TYPE_COLORS.atk),
};

const CENTER_HEAD_SX = { ...TABLE_HEAD_SX, width: '1%', textAlign: 'center' } as const;
const CENTER_SX = { ...TIGHT_CELL_SX, textAlign: 'center' } as const;

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

/** The shapes are `PillBadge` and `TagBadge`; the lookups are this page's. */
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES['alert']!;
  return (
    <PillBadge dot={s.dot} bg={s.bg} color={s.color} border={s.border}>
      {STATUS_LABELS[status] ?? status}
    </PillBadge>
  );
}

function TypeBadge({ type }: { type: string }) {
  const s = TYPE_STYLES[type] ?? badgeStyle(NEUTRAL_COLOR);
  return (
    <TagBadge bg={s.bg} color={s.color} border={s.border}>
      {KIT_TYPE_LABELS[type] ?? type}
    </TagBadge>
  );
}

/** A checkmark for a true network flag; a subtle dash for false. */
function NetworkMark({ on }: { on: boolean }) {
  return on ? (
    <CheckIcon sx={{ fontSize: 15, color: STATUS_COLORS.available }} aria-label="yes" />
  ) : (
    <Typography component="span" variant="body2" sx={{ color: 'text.disabled' }} aria-label="no">{EMPTY_VALUE}</Typography>
  );
}

export function KitsPage() {
  const { canWrite } = useAuth();
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  // ?search= is a deep-link entrypoint only (the scope switch carries the term
  // across from the terminals page). Typing after mount stays in local state.
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  // Hydrate the status filter from ?status=<key> on initial mount so
  // dashboard tile clicks pre-filter the page.
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(() => {
    const initial = searchParams.get('status');
    return initial ? new Set([initial]) : new Set();
  });
  // ?type= carries comma-separated slugs (e.g. "remote" from the sidebar) -
  // split so each toggle highlights individually.
  //
  // Unlike search and status above, the URL is the source of truth for this
  // one. Deriving the set rather than mirroring it into state is what stops an
  // unrelated param write - drawer=edit, from the row Edit button - replaying a
  // stale ?type= over the filter the user is actually looking at.
  const typeParam = searchParams.get('type');
  const activeTypes = useMemo(
    () => (typeParam ? new Set(typeParam.split(',')) : new Set<string>()),
    [typeParam],
  );
  // Narrowing the filter can leave the current page out of range.
  useEffect(() => { setPage(1); }, [typeParam]);
  const sectionFilter  = searchParams.get('sections') ?? undefined;
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
  const handleTypeChange = (next: Set<string>) => setSearchParams((prev) => {
    const n = new URLSearchParams(prev);
    if (next.size > 0) n.set('type', [...next].join(','));
    else n.delete('type');
    return n;
  }, { replace: true });

  const updateKit = useUpdateKit();
  const { showToast } = useToast();

  const saveField = async (id: string, data: UpdateKitRequest) => {
    try {
      await updateKit.mutateAsync({ id, data });
      showToast('Change saved');
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : 'Failed to save change.', { severity: 'error' });
      throw err;
    }
  };

  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading, error } = useKits({
    search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
    sections: sectionFilter,
    type: typeParam ?? undefined,
    page,
    limit: pageLimit,
  });

  const { data: sectionsData } = useSections();
  const sectionColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    (sectionsData ?? []).forEach((s) => { map[s.key] = s.color; });
    return map;
  }, [sectionsData]);

  const allKits = useMemo(() => data?.kits ?? [], [data?.kits]);
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // The edit target, resolved from the page first and fetched by id only when
  // the page does not hold it. The list is paginated, so an edit deep-link for
  // a kit on another page found nothing - and the drawer reads a missing kit as
  // Add mode, so it rendered a blank Add form at an edit URL and created a
  // duplicate on submit.
  const listHit = drawerMode === 'edit' && editId
    ? allKits.find((k) => k.id === editId)
    : undefined;
  const { data: fetchedKit, isLoading: fetchingKit } = useKit(
    drawerMode === 'edit' && editId && !listHit ? editId : undefined,
  );
  const editTarget = listHit ?? fetchedKit;

  // The drawer opens only once its kit has resolved, so mode 'edit' and an
  // absent kit can never coexist while it is open. Said out loud rather than
  // left as a drawer that silently never appears: an edit link is shareable,
  // and a genuinely deleted id has to read as deleted.
  const drawerOpen = canWrite && (drawerMode === 'add' || editTarget !== undefined);
  const editTargetMissing =
    drawerMode === 'edit' && Boolean(editId) && !isLoading && !fetchingKit && !editTarget;

  // Client-side status filter only - type filter is server-side.
  const kits = useMemo(() => {
    if (activeStatuses.size === 0) return allKits;
    return allKits.filter((k) =>
      activeStatuses.has(k.status) ||
      (activeStatuses.has('alert') && ALERT_STATUSES.includes(k.status))
    );
  }, [allKits, activeStatuses]);

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
        ? 'Failed to load kits'
        : null;

  const sc = data?.status_counts ?? {};
  const statCells = [
    { key: 'all',        label: 'Total',      value: total,                                                                           sub: 'All kits',           color: STATUS_COLORS.total },
    { key: 'available',  label: 'Available',  value: sc['available'] ?? 0,                                                            sub: 'Ready to assign',    color: STATUS_COLORS.available },
    { key: 'alert',      label: 'ALERT',      value: (sc['alert'] ?? 0) + (sc['alert-blue'] ?? 0) + (sc['alert-green'] ?? 0),        sub: 'On Standby',         color: STATUS_COLORS.alert },
    { key: 'on-mission', label: 'On Mission', value: sc['on-mission'] ?? 0,                                                           sub: 'Exercise / Forward', color: STATUS_COLORS.onMission },
    { key: 'reserved',   label: 'Reserved',   value: sc['reserved'] ?? 0,                                                             sub: 'RTO Managed',        color: STATUS_COLORS.reserved },
    { key: 'inop',       label: 'INOP',       value: sc['inop'] ?? 0,                                                                 sub: 'Broken / Turn In',   color: STATUS_COLORS.inop },
  ];

  return (
    <MainLayout>
      {/* A column exactly as tall as the content area, so the table below is
          what scrolls and its header can pin to the top of it. See the longer
          note on `terminals-page`, which explains why `stickyHeader` needs a
          bounded scrollport and why the bleed lives here rather than on the
          banner. */}
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
          That kit no longer exists - it may have been deleted. Nothing has been opened for editing.
        </Alert>
      )}
      {/* No `sticky`: the page does not scroll any more, the table does. */}
      <PageBanner variant="plain" sx={{ mx: -CONTENT_GUTTER, mt: 0 }}>
        <PageTitle visuallyHidden>Kits</PageTitle>
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
          placeholder="Search name, owner, location, notes…"
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
          aria-label="Search kits"
        />

        {/* Terminals ⇄ Kits - keeps the section filter across the switch */}
        <ScopeSwitch active="kits" count={total} search={debouncedSearch} />

        {/* Type filter - multi-select, matches stat strip toggle behaviour */}
        <ToggleButtonGroup
          value={activeTypes.size === 0 ? ['all'] : [...activeTypes]}
          onChange={(_, newValues: string[]) => {
            if (newValues.length === 0) {
              handleTypeChange(new Set());
            } else if (newValues.includes('all') && activeTypes.size > 0) {
              handleTypeChange(new Set());
            } else {
              handleTypeChange(new Set(newValues.filter((v) => v !== 'all')));
            }
            // The page reset rides on the ?type= change, in the effect above.
          }}
          size="small"
          aria-label="Type filter"
          sx={TOGGLE_SX}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="remote">Remote</ToggleButton>
          <ToggleButton value="ifk">IFK</ToggleButton>
          <ToggleButton value="atk">ATK</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      </PageBanner>
      {/* Content */}
      {isLoading ? (
        <LoadingSpinner message="Loading kits..." />
      ) : kits.length === 0 ? (
        <EmptyState
          title="No kits found"
          description={emptyListDescription('kits', debouncedSearch, [
            activeStatuses.size > 0 ? 'status' : '',
            activeTypes.size > 0 ? 'type' : '',
            sectionFilter ? 'section' : '',
          ])}
        />
      ) : (
        <Paper
          elevation={0}
          sx={{ ...PANEL_SX, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
        <TableContainer
          // `overflow: auto`, not `hidden` - see the note on the terminals table.
          // Measured 1106px of columns inside a 982px container at 1280x720, so
          // `hidden` made the last 124px unreachable with no scrollbar to say so.
          // `flex: 1` bounds it, which is what gives the sticky header somewhere
          // to stick.
          sx={{ flex: 1, overflow: 'auto' }}
        >
          <Table aria-label="kits table" size="small" stickyHeader sx={{ tableLayout: 'auto' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Kit Name</TableCell>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Type</TableCell>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Section</TableCell>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Status</TableCell>
                {KIT_NETWORKS.map((n) => (
                  <TableCell key={n.key} sx={CENTER_HEAD_SX}>{n.label}</TableCell>
                ))}
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Assigned To</TableCell>
                <TableCell sx={TABLE_HEAD_SX}>Notes</TableCell>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }}>Updated</TableCell>
                <TableCell sx={{ ...TABLE_HEAD_SX, width: '1%' }} aria-label="row actions" />
              </TableRow>
            </TableHead>
            <TableBody>
              {kits.map((k: Kit) => {
                const sectionColor = sectionColorMap[k.section] ?? NEUTRAL_COLOR;
                return (
                  <TableRow
                    key={k.id}
                    sx={{
                      '&:last-child td, &:last-child th': { border: 0 },
                      '&:hover': { bgcolor: 'action.hover' },
                      '&:hover .row-edit-btn, &:focus-within .row-edit-btn': { opacity: 1 },
                    }}
                  >
                    <TableCell component="th" scope="row" sx={TIGHT_CELL_SX}>
                      <InlineTextCell
                        value={k.name}
                        allowEmpty={false}
                        maxLength={100}
                        readOnly={!canWrite}
                        aria-label={`edit name for ${k.name}`}
                        onSave={(v) => saveField(k.id, { name: v })}
                        renderDisplay={(v) => <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>{v}</Typography>}
                      />
                    </TableCell>
                    <TableCell sx={TIGHT_CELL_SX}>
                      <InlineSelectCell
                        value={k.type}
                        readOnly={!canWrite}
                        aria-label={`edit type for ${k.name}`}
                        onSave={(v) => saveField(k.id, { type: v })}
                        options={[
                          { value: 'remote', label: 'Remote' },
                          { value: 'ifk',    label: 'IFK' },
                          { value: 'atk',    label: 'ATK' },
                        ]}
                        renderDisplay={(v) => <TypeBadge type={v} />}
                      />
                    </TableCell>
                    <TableCell sx={TIGHT_CELL_SX}>
                      <InlineSelectCell
                        value={k.section ?? ''}
                        readOnly={!canWrite}
                        aria-label={`edit section for ${k.name}`}
                        onSave={(v) => saveField(k.id, { section: v })}
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
                          v
                            ? <SectionBadge section={v.toUpperCase()} color={sectionColor} />
                            : <Typography component="span" variant="body2" sx={{ color: 'text.disabled' }}>{EMPTY_VALUE}</Typography>
                        )}
                      />
                    </TableCell>
                    <TableCell sx={TIGHT_CELL_SX}>
                      <InlineSelectCell
                        value={k.status}
                        readOnly={!canWrite}
                        aria-label={`edit status for ${k.name}`}
                        onSave={(v) => saveField(k.id, { status: v })}
                        options={STATUS_OPTIONS}
                        renderDisplay={(v) => <StatusBadge status={v} />}
                      />
                    </TableCell>
                    {KIT_NETWORKS.map((n) => (
                      <TableCell key={n.key} sx={CENTER_SX}>
                        <InlineSelectCell
                          value={String(k[n.key])}
                          readOnly={!canWrite}
                          aria-label={`edit ${n.label} for ${k.name}`}
                          onSave={(v) => saveField(k.id, { [n.key]: v === 'true' })}
                          options={YES_NO_OPTIONS}
                          renderDisplay={(v) => <NetworkMark on={v === 'true'} />}
                        />
                      </TableCell>
                    ))}
                    <TableCell sx={TIGHT_CELL_SX}>
                      <InlineTextCell
                        value={k.owner ?? ''}
                        emptyLabel="Unassigned"
                        readOnly={!canWrite}
                        aria-label={`edit owner for ${k.name}`}
                        onSave={(v) => saveField(k.id, { owner: v })}
                        renderDisplay={(v) => <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>{v}</Typography>}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        maxWidth: 0,
                        cursor: canWrite ? 'pointer' : 'default',
                        '&:hover .notes-edit-icon': { opacity: canWrite ? 1 : 0 },
                      }}
                      onClick={canWrite ? () => handleNotesClick(k.id) : undefined}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                        {k.notes
                          ? (
                            <Tooltip title={k.notes} placement="top-start" enterDelay={400}>
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
                                {k.notes}
                              </Typography>
                            </Tooltip>
                          )
                          : <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>{canWrite ? 'Add note…' : EMPTY_VALUE}</Typography>
                        }
                        {canWrite && <EditIcon className="notes-edit-icon" sx={{ fontSize: 12, opacity: 0, color: 'text.disabled', transition: 'opacity .1s', flexShrink: 0 }} />}
                      </Box>
                    </TableCell>
                    <TableCell sx={TIGHT_CELL_SX}>
                      <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontSize: 11 }}>
                        {k.updated_by || 'Unknown'} · {relativeTime(k.updated_at)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ ...TIGHT_CELL_SX, pl: 0, pr: 1 }}>
                      {canWrite && (
                        <Tooltip title="Edit kit">
                          <IconButton
                            className="row-edit-btn"
                            size="small"
                            onClick={() => handleEditClick(k.id)}
                            sx={{ opacity: 0, transition: 'opacity .12s' }}
                            aria-label={`edit ${k.name}`}
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
            noun="kit"
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
      <KitDrawer
        open={drawerOpen}
        mode={drawerMode ?? 'add'}
        kit={drawerMode === 'edit' ? editTarget : undefined}
        focusField={drawerFocus}
        onClose={handleDrawerClose}
      />
    </MainLayout>
  );
}

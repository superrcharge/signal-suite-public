import { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  TextField,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  IconButton,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { useSearchParams } from 'react-router';
import {
  EmptyState, LoadingSpinner, PageBanner, PageTitle, StatStrip, StatCell,
  ListPagination, SEARCH_FIELD_SX, PANEL_SX, TABLE_HEAD_SX, OUTLINED_WHITE_SX,
} from '@/components/common';
import { MainLayout } from '@/components/layouts';
import { CONTENT_GUTTER, HEADER_HEIGHT } from '@/components/layouts/main-layout';
import { ContractDrawer, type ContractDrawerFocus } from './contract-drawer';
import { InlineTextCell, InlineSelectCell, type InlineSelectOption } from './inline-edit-cell';
import { useContracts, useUpdateContract } from '@/services';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts';
import { useDebounce } from '@/hooks/use-debounce';
import { CONTRACT_URGENCY_COLORS } from '@/theme/asset-colors';
import type { Contract, UpdateContractRequest } from '@/types';
import { EMPTY_VALUE } from '@/utils';

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86_400_000);
}

function popEndColor(dateStr: string | null): string | null {
  const d = daysUntil(dateStr);
  if (d === null) return null;
  if (d <= 30) return CONTRACT_URGENCY_COLORS.expiring;
  if (d <= 60) return CONTRACT_URGENCY_COLORS.caution;
  if (d <= 90) return CONTRACT_URGENCY_COLORS.watch;
  return null;
}

function popEndTooltip(dateStr: string | null): string {
  const d = daysUntil(dateStr);
  if (d === null) return '';
  if (d < 0) return `Expired ${Math.abs(d)}d ago`;
  if (d === 0) return 'Expires today';
  return `${d}d remaining`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return EMPTY_VALUE;
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

const QUARTER_OPTIONS: InlineSelectOption[] = [
  { value: '',   label: EMPTY_VALUE },
  { value: 'Q1', label: 'Q1' },
  { value: 'Q2', label: 'Q2' },
  { value: 'Q3', label: 'Q3' },
  { value: 'Q4', label: 'Q4' },
];

export function ContractsPage() {
  const { canWrite } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const fyFilter = searchParams.get('fy') ?? undefined;
  const page = parseInt(searchParams.get('page') ?? '1', 10);

  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
    setSearchParams((p) => { p.delete('page'); return p; });
  };

  const { data, isLoading } = useContracts({
    fy: fyFilter,
    search: debouncedSearch || undefined,
    page,
    sort_by: sortBy || undefined,
    sort_dir: sortBy ? sortDir : undefined,
  });
  const updateContract = useUpdateContract();
  const { showToast } = useToast();

  const contracts = data?.contracts ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const counts = data?.counts;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | undefined>(undefined);
  const [drawerFocus, setDrawerFocus] = useState<ContractDrawerFocus | undefined>(undefined);

  const openDrawer = (c?: Contract, focus?: ContractDrawerFocus) => {
    setEditingContract(c);
    setDrawerFocus(focus);
    setDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setEditingContract(undefined);
    setDrawerFocus(undefined);
  };

  const handlePrev = () => setSearchParams((p) => { p.set('page', String(page - 1)); return p; });
  const handleNext = () => setSearchParams((p) => { p.set('page', String(page + 1)); return p; });

  // Wraps mutation as a Promise for InlineTextCell / InlineSelectCell
  const save = (id: string, patch: UpdateContractRequest) =>
    new Promise<void>((resolve, reject) => {
      updateContract.mutate({ id, data: patch }, {
        onSuccess: () => { showToast('Change saved'); resolve(); },
        onError: (err) => {
          showToast(err instanceof Error ? err.message : 'Failed to save change.', { severity: 'error' });
          reject(err);
        },
      });
    });

  const statCells = [
    { label: 'Total',    value: counts?.total ?? 0,       sub: 'All contracts',   color: CONTRACT_URGENCY_COLORS.total },
    { label: 'Expiring', value: counts?.expiring_30 ?? 0, sub: 'Within 30 days',  color: CONTRACT_URGENCY_COLORS.expiring },
    { label: 'Caution',  value: counts?.expiring_60 ?? 0, sub: '31 – 60 days',    color: CONTRACT_URGENCY_COLORS.caution },
    { label: 'Watch',    value: counts?.expiring_90 ?? 0, sub: '61 – 90 days',    color: CONTRACT_URGENCY_COLORS.watch },
  ];

  if (isLoading && !data) return <MainLayout><LoadingSpinner /></MainLayout>;

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
      {/* No `sticky`: the page does not scroll any more, the table does. */}
      <PageBanner variant="plain" sx={{ mx: -CONTENT_GUTTER, mt: 0 }}>
        <PageTitle visuallyHidden>Contracts</PageTitle>
        <StatStrip>
          {statCells.map((cell) => (
            <StatCell key={cell.label} label={cell.label} value={cell.value} hint={cell.sub} color={cell.color} />
          ))}
        </StatStrip>

        {/* Toolbar */}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Search contracts…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSearchParams((p) => { p.delete('page'); return p; }); }}
            sx={SEARCH_FIELD_SX}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment> } }}
          />
          {fyFilter && (
            <Typography variant="body2" sx={{
              color: 'text.secondary'
            }}>
              Fiscal Year: <strong>{fyFilter}</strong>
            </Typography>
          )}
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
            {canWrite && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => openDrawer()}
                sx={OUTLINED_WHITE_SX}
              >
                Add Contract
              </Button>
            )}
          </Box>
        </Box>
      </PageBanner>
      {/* Table */}
      {/* Fixed layout, half the default cell padding.

          Fixed, so the columns are the same width on All Contracts as on one
          fiscal year: auto layout sizes each column from the rows present, so
          the table re-proportioned itself on every filter. The header row's
          widths are the columns; the three free-text columns take a share of
          the width, the dates, codes and pencil take what they measure (Start
          80, End 82, QTR 52 centred, FY 48, measured in the browser against
          the widest value at 4px gutters), and Notes has no width and so gets
          the remainder. At the 1280px floor
          with the sidebar open that remainder is about the width of its own
          header; it grows from there. The free-text cells pass maxWidth 100%
          so their ellipsis works against the column, not a fixed pixel cap.

          Half padding, because ten columns at MUI's 16px a side spent 320px
          on gutters alone, which is what pushed the table past the container
          and made the page scroll sideways. The outer edges keep the full
          inset so text does not touch the paper's rounded border. */}
      <Paper
        elevation={0}
        sx={{ ...PANEL_SX, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
      {/* `flex: 1` bounds the scrollport, which is what gives the sticky header
          somewhere to stick. */}
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table
          size="small"
          stickyHeader
          sx={{
            tableLayout: 'fixed',
            '& th, & td': { px: 1 },
            '& th:first-of-type, & td:first-of-type': { pl: 2 },
            // Start, End, QTR and FY are short fixed-format values and carry
            // 4px gutters. Set here by column, not on the cells: a rule on the
            // table (`.table td`) outranks a cell's own class, so `px` on the
            // cell silently lost to the 8px above and FY clipped to "F…" at a
            // width that fit its value. Every hover pencil in these columns is
            // absolutely positioned into the gutter instead of reserving a
            // 16px slot beside a value that is never wider than its header.
            '& th:nth-of-type(3), & td:nth-of-type(3)': { pl: 0.75, pr: 0.5 },
            '& th:nth-of-type(4), & td:nth-of-type(4)': { px: 0.5 },
            '& th:nth-of-type(5), & td:nth-of-type(5)': { px: 0.5 },
            '& th:nth-of-type(6), & td:nth-of-type(6)': { px: 0.5 },
            '& th:nth-of-type(7), & td:nth-of-type(7)': { pl: 0.5 },
          }}
        >
          {/* The shared head rule. This was the one table that had drifted -
              0.72rem and 0.05em against the 11px / 0.06em the other five use,
              plus a `text.secondary` colour none of them set. */}
          <TableHead sx={{ '& th': TABLE_HEAD_SX }}>
            <TableRow>
              <TableCell sx={{ width: '20%' }}>Contract Title</TableCell>
              <TableCell sx={{ width: 96, whiteSpace: 'nowrap' }}>Logform #</TableCell>
              <TableCell sx={{ width: 80 }}>Start</TableCell>
              <TableCell sx={{ width: 82 }}>
                <TableSortLabel
                  active={sortBy === 'pop_end'}
                  direction={sortBy === 'pop_end' ? sortDir : 'asc'}
                  onClick={() => handleSort('pop_end')}
                  sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit !important', textTransform: 'inherit', letterSpacing: 'inherit' }}
                >
                  End
                </TableSortLabel>
              </TableCell>
              {/* Centred, with the sort arrow overlaid at the cell's right edge so the
                  column can be as narrow as its three-letter header. */}
              <TableCell sx={{ width: 52, textAlign: 'center', position: 'relative', '& .MuiTableSortLabel-icon': { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', fontSize: 14, m: 0 } }}>
                <TableSortLabel
                  active={sortBy === 'execution_quarter'}
                  direction={sortBy === 'execution_quarter' ? sortDir : 'asc'}
                  onClick={() => handleSort('execution_quarter')}
                  sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit !important', textTransform: 'inherit', letterSpacing: 'inherit' }}
                >
                  QTR
                </TableSortLabel>
              </TableCell>
              <TableCell sx={{ width: 48 }}>FY</TableCell>
              <TableCell sx={{ width: '14%' }}>Company</TableCell>
              <TableCell sx={{ width: '13%' }}>POC</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell sx={{ width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {contracts.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} sx={{ py: 6, textAlign: 'center' }}>
                  <EmptyState
                    title="No contracts found"
                    description={debouncedSearch ? `No results for "${debouncedSearch}".` : 'Add your first contract to get started.'}
                  />
                </TableCell>
              </TableRow>
            )}
            {contracts.map((c) => {
              const endColor = popEndColor(c.pop_end);
              const endTip = popEndTooltip(c.pop_end);

              return (
                <TableRow
                  key={c.id}
                  hover
                  sx={{ '&:hover .contract-edit-btn': { opacity: 1 }, '& td': { fontSize: '0.82rem' } }}
                >
                  {/* Title */}
                  <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                    <InlineTextCell
                      value={c.title}
                      onSave={(v) => save(c.id, { title: v })}
                      allowEmpty={false}
                      maxWidth="100%"
                      readOnly={!canWrite}
                    />
                  </TableCell>

                  {/* Logform # */}
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {c.logform_number ? (
                      c.logform_url ? (
                        <Box
                          component="a"
                          href={c.logform_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ color: 'primary.main', fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                        >
                          {c.logform_number}
                        </Box>
                      ) : (
                        <Box component="span" sx={{ fontWeight: 600 }}>{c.logform_number}</Box>
                      )
                    ) : (
                      <Box component="span" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>{EMPTY_VALUE}</Box>
                    )}
                  </TableCell>

                  {/* POP Start - click opens drawer */}
                  <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                    {canWrite ? (
                      <Box
                        role="button"
                        tabIndex={0}
                        onClick={() => openDrawer(c)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openDrawer(c); }}
                        sx={{ cursor: 'pointer', position: 'relative', display: 'inline-flex', alignItems: 'center', '&:hover .inline-edit-icon': { opacity: 1 } }}
                      >
                        {formatDate(c.pop_start)}
                        <EditIcon className="inline-edit-icon" sx={{ position: 'absolute', right: -13, top: '50%', transform: 'translateY(-50%)', fontSize: 12, opacity: 0, color: 'text.disabled', transition: 'opacity .1s' }} />
                      </Box>
                    ) : formatDate(c.pop_start)}
                  </TableCell>

                  {/* POP End - colored + click opens drawer */}
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {canWrite ? (
                      <Tooltip title={endTip} disableHoverListener={!endTip}>
                        <Box
                          role="button"
                          tabIndex={0}
                          onClick={() => openDrawer(c)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openDrawer(c); }}
                          sx={{ cursor: 'pointer', position: 'relative', display: 'inline-flex', alignItems: 'center', color: endColor ?? 'text.primary', fontWeight: endColor ? 700 : 400, '&:hover .inline-edit-icon': { opacity: 1 } }}
                        >
                          {c.pop_end ? formatDate(c.pop_end) : <Box component="span" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>{EMPTY_VALUE}</Box>}
                          <EditIcon className="inline-edit-icon" sx={{ position: 'absolute', right: -13, top: '50%', transform: 'translateY(-50%)', fontSize: 12, opacity: 0, color: 'text.disabled', transition: 'opacity .1s' }} />
                        </Box>
                      </Tooltip>
                    ) : (
                      <Box component="span" sx={{ color: endColor ?? 'text.primary', fontWeight: endColor ? 700 : 400 }}>
                        {c.pop_end ? formatDate(c.pop_end) : EMPTY_VALUE}
                      </Box>
                    )}
                  </TableCell>

                  {/* Execution Quarter */}
                  <TableCell sx={{ whiteSpace: 'nowrap', textAlign: 'center', '& [role=button]': { justifyContent: 'center' }, position: 'relative', '& .inline-edit-icon': { position: 'absolute', right: -2, top: '50%', transform: 'translateY(-50%)' } }}>
                    <InlineSelectCell
                      value={c.execution_quarter ?? ''}
                      options={QUARTER_OPTIONS}
                      onSave={(v) => save(c.id, { execution_quarter: v || null })}
                      renderDisplay={(v) => v
                        ? <Box component="span" sx={{ color: 'text.secondary' }}>{v}</Box>
                        : <Box component="span" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>{EMPTY_VALUE}</Box>
                      }
                      readOnly={!canWrite}
                    />
                  </TableCell>

                  {/* Fiscal Year */}
                  <TableCell sx={{ whiteSpace: 'nowrap', position: 'relative', '& .inline-edit-icon': { position: 'absolute', right: -2, top: '50%', transform: 'translateY(-50%)' } }}>
                    <InlineTextCell
                      value={c.fiscal_year}
                      onSave={(v) => save(c.id, { fiscal_year: v })}
                      allowEmpty={false}
                      maxLength={4}
                      readOnly={!canWrite}
                    />
                  </TableCell>

                  {/* Company */}
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <InlineTextCell
                      value={c.company}
                      onSave={(v) => save(c.id, { company: v })}
                      allowEmpty={false}
                      maxWidth="100%"
                      readOnly={!canWrite}
                    />
                  </TableCell>

                  {/* POC */}
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <InlineTextCell
                      value={c.poc_name ?? ''}
                      onSave={(v) => save(c.id, { poc_name: v || null })}
                      placeholder="Add POC…"
                      emptyLabel={EMPTY_VALUE}
                      maxWidth="100%"
                      readOnly={!canWrite}
                    />
                  </TableCell>

                  {/* Notes - click opens drawer at notes field */}
                  <TableCell
                    onClick={canWrite ? () => openDrawer(c, 'notes') : undefined}
                    sx={{ cursor: canWrite ? 'pointer' : 'default', '&:hover .inline-edit-icon': canWrite ? { opacity: 1 } : {} }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                      <Tooltip title={c.notes || ''} disableHoverListener={!c.notes}>
                        <Typography
                          variant="inherit"
                          sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: c.notes ? 'text.primary' : 'text.disabled', fontStyle: c.notes ? 'normal' : 'italic' }}
                        >
                          {c.notes || EMPTY_VALUE}
                        </Typography>
                      </Tooltip>
                      {canWrite && <EditIcon className="inline-edit-icon" sx={{ fontSize: 12, opacity: 0, color: 'text.disabled', transition: 'opacity .1s', flexShrink: 0 }} />}
                    </Box>
                  </TableCell>

                  {/* Trailing pencil - opens drawer */}
                  {/* No cell padding of its own: the table-level px: 1 rule
                      wins on specificity, and 40 = 24px icon + 8px a side. */}
                  <TableCell sx={{ width: 1, whiteSpace: 'nowrap' }}>
                    {canWrite && (
                      <Tooltip title="Edit contract">
                        <IconButton
                          className="contract-edit-btn"
                          size="small"
                          onClick={() => openDrawer(c)}
                          sx={{ opacity: 0, transition: 'opacity .12s', color: 'text.secondary' }}
                        >
                          <EditIcon sx={{ fontSize: 14 }} />
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
          noun="contract"
          page={page}
          totalPages={totalPages}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      </Paper>
      </Box>
      <ContractDrawer
        open={drawerOpen}
        mode={editingContract ? 'edit' : 'add'}
        contract={editingContract}
        focusField={drawerFocus}
        onClose={handleDrawerClose}
      />
    </MainLayout>
  );
}

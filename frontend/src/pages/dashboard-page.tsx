import { useMemo } from 'react';
import { Box, Typography, Alert } from '@mui/material';
import { useNavigate } from 'react-router';
import {
  LoadingSpinner, PageBanner, PageTitle, PageSubtitle,
  StatLabel, StatValue, PANEL_SX,
} from '@/components/common';
import { MainLayout } from '@/components/layouts';
import { useTerminals, useKits, useSections, useContracts, useEquipment, useWaveforms } from '@/services';
import { ApiClientError } from '@/services/api-client';
import { useAuth } from '@/contexts/auth-context';
import { KIT_TYPE_OPTIONS, KIT_TYPE_LABELS } from './kit-constants';
import { ALERT_STATUSES } from './asset-status-constants';
import type { Terminal, Kit, Section } from '@/types';

import {
  STATUS_COLORS,
  KIT_TYPE_COLORS,
  CONTRACT_URGENCY_COLORS,
  TERMINAL_FAMILY_COLORS,
  CATALOG_COLORS,
  NEUTRAL_COLOR,
} from '@/theme/asset-colors';

// Single high-limit fetch so we can count across the entire fleet
// rather than one paginated page. Acceptable for the asset-tracker
// scale; if the fleet ever grows past this we can swap to a
// dedicated stats endpoint.
const ALL_TERMINALS_LIMIT = 1000;

const MODEL_LABELS: Record<string, string> = {
  mini: 'Mini', hp: 'HP', hornet: 'Hornet', ragno: 'Ragno',
  ow7: 'OW-7', ow10: 'OW-10', ow11: 'OW-11',
};
const MODEL_ORDER = ['mini', 'hp', 'hornet', 'ragno', 'ow7', 'ow10', 'ow11'];

// Column count shared by every row inside a stat panel. Rows with fewer
// tiles leave trailing columns empty rather than widening their tiles,
// which is what keeps the status and type rows aligned.
const PANEL_COLUMNS = 5;

const KIT_TYPE_ORDER = KIT_TYPE_OPTIONS.map((o) => o.value);
const ALL_KITS_LIMIT = 1000;

// Terminals with a null model count toward totals but appear in no
// family tile or model bubble - only known model types are shown.
function countByModel(rows: Terminal[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const t of rows) {
    if (t.model) acc[t.model] = (acc[t.model] ?? 0) + 1;
  }
  return acc;
}

// Kits always carry a type (required on create), so every kit lands in
// exactly one type bucket.
function countByType(rows: Kit[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const k of rows) {
    if (k.type) acc[k.type] = (acc[k.type] ?? 0) + 1;
  }
  return acc;
}

export function DashboardPage() {
  const navigate = useNavigate();
  // Contracts are internal, so the panel and the count behind it exist
  // only for admin and editor. Navigation shaping, not authorization - see
  // AuthContextValue.canSeeContracts.
  const { canSeeContracts } = useAuth();
  const { data: terminalsData, isLoading: terminalsLoading, error } = useTerminals({ limit: ALL_TERMINALS_LIMIT });
  const { data: kitsData, isLoading: kitsLoading } = useKits({ limit: ALL_KITS_LIMIT });
  const { data: sectionsData, isLoading: sectionsLoading } = useSections();
  const { data: contractsData, isLoading: contractsLoading } = useContracts({ limit: 1 }, canSeeContracts);
  const { data: equipmentData, isLoading: equipmentLoading } = useEquipment({});
  const { data: waveformsData, isLoading: waveformsLoading } = useWaveforms();

  const allTerminals: Terminal[] = useMemo(() => terminalsData?.terminals ?? [], [terminalsData]);
  const allKits: Kit[] = useMemo(() => kitsData?.kits ?? [], [kitsData]);
  const sections: Section[] = useMemo(() => sectionsData ?? [], [sectionsData]);
  const total = terminalsData?.total ?? allTerminals.length;
  const kitTotal = kitsData?.total ?? allKits.length;

  // Terminal-type breakdown - the overarching total split by family,
  // each with its sub-model composition. Counts come from the model
  // field (not name heuristics). Family colors deliberately avoid the
  // hard-reserved status colors.
  const typeCells = useMemo(() => {
    const mc = countByModel(allTerminals);
    const n = (k: string) => mc[k] ?? 0;
    return [
      { key: 'total',      label: 'Total',      value: total,                              sub: undefined as string[] | undefined,                            color: STATUS_COLORS.total, href: '/terminals' },
      { key: 'starshield', label: 'Starshield', value: n('mini') + n('hp'),                sub: [`${n('mini')} Mini`, `${n('hp')} HP`],                       color: TERMINAL_FAMILY_COLORS.starshield, href: '/terminals?model=mini,hp' },
      { key: 'paradigm',   label: 'Paradigm',   value: n('hornet') + n('ragno'),           sub: [`${n('hornet')} Hornet`, `${n('ragno')} Ragno`],             color: TERMINAL_FAMILY_COLORS.paradigm, href: '/terminals?model=hornet,ragno' },
      { key: 'oneweb',     label: 'OneWeb',     value: n('ow7') + n('ow10') + n('ow11'),   sub: [`${n('ow7')} OW-7`, `${n('ow10')} OW-10`, `${n('ow11')} OW-11`], color: TERMINAL_FAMILY_COLORS.oneweb, href: '/terminals?model=ow7,ow10,ow11' },
    ];
  }, [allTerminals, total]);

  // Status breakdown. Mirrors the terminals page's stat strip exactly
  // (minus Total, which lives in the type row above).
  // No subtext: what each status means is documented on the terminals
  // page strip, and the dashboard is a count view.
  const statusCells = useMemo(() => [
    { key: 'available',  label: 'Available',  value: allTerminals.filter((t) => t.status === 'available').length,          color: STATUS_COLORS.available, href: '/terminals?status=available' },
    { key: 'alert',      label: 'ALERT',      value: allTerminals.filter((t) => ALERT_STATUSES.includes(t.status)).length, color: STATUS_COLORS.alert, href: '/terminals?status=alert' },
    { key: 'on-mission', label: 'On Mission', value: allTerminals.filter((t) => t.status === 'on-mission').length,         color: STATUS_COLORS.onMission, href: '/terminals?status=on-mission' },
    { key: 'reserved',   label: 'Reserved',   value: allTerminals.filter((t) => t.status === 'reserved').length,           color: STATUS_COLORS.reserved, href: '/terminals?status=reserved' },
    { key: 'inop',       label: 'INOP',       value: allTerminals.filter((t) => t.status === 'inop').length,               color: STATUS_COLORS.inop, href: '/terminals?status=inop' },
  ], [allTerminals]);

  // Kits by status. Mirrors the /kits page stat strip verbatim - same
  // buckets, colors, and subtext - so the two agree at a glance. Total
  // lives in the type row below, exactly as it does for terminals.
  const kitStatusCells = useMemo(() => [
    { key: 'available',  label: 'Available',  value: allKits.filter((k) => k.status === 'available').length,            color: STATUS_COLORS.available, href: '/kits?status=available' },
    { key: 'alert',      label: 'ALERT',      value: allKits.filter((k) => ALERT_STATUSES.includes(k.status)).length,   color: STATUS_COLORS.alert, href: '/kits?status=alert' },
    { key: 'on-mission', label: 'On Mission', value: allKits.filter((k) => k.status === 'on-mission').length,           color: STATUS_COLORS.onMission, href: '/kits?status=on-mission' },
    { key: 'reserved',   label: 'Reserved',   value: allKits.filter((k) => k.status === 'reserved').length,             color: STATUS_COLORS.reserved, href: '/kits?status=reserved' },
    { key: 'inop',       label: 'INOP',       value: allKits.filter((k) => k.status === 'inop').length,                 color: STATUS_COLORS.inop, href: '/kits?status=inop' },
  ], [allKits]);

  // Kits by type - the overarching total split by type, mirroring the
  // Terminals by Type row. Every kit carries a type, so the three type
  // tiles sum to Total. Subtext is that type's ready-to-assign slice,
  // the number you actually want when sourcing a kit.
  const kitTypeCells = useMemo(() => {
    const counts = countByType(allKits);
    return [
      // sub stays declared so the union with the mapped type cells keeps a `sub` field
      { key: 'total', label: 'Total', value: kitTotal, sub: undefined as string[] | undefined, color: STATUS_COLORS.total, href: '/kits' },
      ...KIT_TYPE_OPTIONS.map((o) => ({
        key: o.value,
        label: o.label,
        value: counts[o.value] ?? 0,
        // Array form so it renders to the right of the count, matching
        // the terminal family tiles rather than stacking underneath.
        sub: [`${allKits.filter((k) => k.type === o.value && k.status === 'available').length} available`],
        color: KIT_TYPE_COLORS[o.value] ?? NEUTRAL_COLOR,
        href: `/kits?type=${o.value}`,
      })),
    ];
  }, [allKits, kitTotal]);

  // Section breakdown. One row per defined section + an Unassigned row
  // if any terminals lack a section. Each row carries a per-model count
  // (only models the section actually has - zeros are hidden).
  const sectionRows = useMemo(() => {
    const rows = sections.map((s) => {
      const inSection = allTerminals.filter((t) => t.section === s.key);
      return {
        key: s.key,
        label: s.label,
        total: inSection.length,
        models: countByModel(inSection),
        color: s.color,
        href: `/terminals?sections=${encodeURIComponent(s.key)}`,
      };
    });
    const unassigned = allTerminals.filter((t) => !t.section);
    if (unassigned.length > 0) {
      rows.push({
        key: '__unassigned__',
        label: 'Unassigned',
        total: unassigned.length,
        models: countByModel(unassigned),
        color: NEUTRAL_COLOR,
        href: '/terminals?sections=',
      });
    }
    return rows;
  }, [sections, allTerminals]);

  // Kits-by-section - parallel to sectionRows but bucketed by kit type.
  const kitSectionRows = useMemo(() => {
    const rows = sections.map((s) => {
      const inSection = allKits.filter((k) => k.section === s.key);
      return {
        key: s.key,
        label: s.label,
        total: inSection.length,
        items: countByType(inSection),
        color: s.color,
        href: `/kits?sections=${encodeURIComponent(s.key)}`,
      };
    });
    const unassigned = allKits.filter((k) => !k.section);
    if (unassigned.length > 0) {
      rows.push({
        key: '__unassigned__',
        label: 'Unassigned',
        total: unassigned.length,
        items: countByType(unassigned),
        color: NEUTRAL_COLOR,
        href: '/kits?sections=',
      });
    }
    return rows;
  }, [sections, allKits]);

  const contractCounts = contractsData?.counts;
  const contractCells = [
    // No subtext - matches the catalog panel beside it.
    { key: 'total',    label: 'Total',    value: contractCounts?.total       ?? 0, color: CONTRACT_URGENCY_COLORS.total },
    { key: 'expiring', label: 'Expiring', value: contractCounts?.expiring_30 ?? 0, color: CONTRACT_URGENCY_COLORS.expiring },
    { key: 'caution',  label: 'Caution',  value: contractCounts?.expiring_60 ?? 0, color: CONTRACT_URGENCY_COLORS.caution },
    { key: 'watch',    label: 'Watch',    value: contractCounts?.expiring_90 ?? 0, color: CONTRACT_URGENCY_COLORS.watch },
  ];

  // Equipment Catalog totals - SATCOM vs radio split by terminal_type,
  // plus the global waveform library count.
  const catalogCells = useMemo(() => {
    const items = equipmentData?.equipment ?? [];
    const satcom = items.filter((e) => e.terminal_type === 'satcom').length;
    const radio = items.filter((e) => e.terminal_type === 'radio').length;
    return [
      // No subtext - the labels already say what the numbers are.
      { key: 'satcom',    label: 'SATCOM',    value: satcom,                               color: CATALOG_COLORS.satcom, href: '/catalog?type=satcom' },
      { key: 'radio',     label: 'Radios',    value: radio,                                color: CATALOG_COLORS.radio, href: '/catalog?type=radio' },
      { key: 'waveforms', label: 'Waveforms', value: waveformsData?.waveforms.length ?? 0, color: CATALOG_COLORS.waveforms, href: '/catalog/comms-library' },
    ];
  }, [equipmentData, waveformsData]);

  const errorMessage = error instanceof ApiClientError ? error.message : error ? 'Failed to load dashboard data' : null;
  const isLoading = terminalsLoading || kitsLoading || sectionsLoading || contractsLoading || equipmentLoading || waveformsLoading;

  return (
    <MainLayout>
      <PageBanner variant="plain" sx={{ mb: 2 }}>
        <PageTitle sx={{ minWidth: 0 }}>
          Dashboard
          <PageSubtitle>Counts across every domain. Click any tile to open the list behind it.</PageSubtitle>
        </PageTitle>
      </PageBanner>
      {errorMessage && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage}</Alert>}
      {isLoading ? (
        <LoadingSpinner message="Loading dashboard..." />
      ) : (
        <>
          {/* One bordered panel per domain. Status and type rows live
              inside the same border so the two domains read as two
              groups rather than four separate objects. No rules inside a
              panel - spacing alone separates the rows and the tiles. */}
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'stretch', flexDirection: { xs: 'column', md: 'row' } }}>
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <BlockLabel>Terminals by Status</BlockLabel>
              <StatPanel>
                <StripRow>
                  {statusCells.map((cell) => (
                    <Tile key={cell.key} label={cell.label} value={cell.value} color={cell.color} onClick={() => navigate(cell.href)} />
                  ))}
                </StripRow>
              </StatPanel>
              <BlockLabel>Terminals by Type</BlockLabel>
              <StatPanel grow>
                <StripRow>
                  {typeCells.map((cell) => (
                    <Tile key={cell.key} label={cell.label} value={cell.value} sub={cell.sub} color={cell.color} onClick={() => navigate(cell.href)} />
                  ))}
                </StripRow>
              </StatPanel>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <BlockLabel>Kits by Status</BlockLabel>
              <StatPanel>
                <StripRow>
                  {kitStatusCells.map((cell) => (
                    <Tile key={cell.key} label={cell.label} value={cell.value} color={cell.color} onClick={() => navigate(cell.href)} />
                  ))}
                </StripRow>
              </StatPanel>
              <BlockLabel>Kits by Type</BlockLabel>
              <StatPanel grow>
                <StripRow>
                  {kitTypeCells.map((cell) => (
                    <Tile key={cell.key} label={cell.label} value={cell.value} sub={cell.sub} color={cell.color} onClick={() => navigate(cell.href)} />
                  ))}
                </StripRow>
              </StatPanel>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 3, alignItems: 'stretch', flexDirection: { xs: 'column', md: 'row' } }}>
            {/* Terminals by Section */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <BlockLabel>Terminals by Section</BlockLabel>
              {sectionRows.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.disabled', p: 2 }}>
                  No sections yet.
                </Typography>
              ) : (
                <Box sx={{ ...PANEL_SX, overflow: 'hidden' }}>
                  {sectionRows.map((row, i) => (
                    <SectionRow
                      key={row.key}
                      label={row.label}
                      total={row.total}
                      items={row.models}
                      itemOrder={MODEL_ORDER}
                      itemLabels={MODEL_LABELS}
                      color={row.color}
                      divider={i > 0}
                      onClick={() => navigate(row.href)}
                    />
                  ))}
                </Box>
              )}
            </Box>

            {/* No divider between the two breakdowns - each panel already
                carries its own border and heading, so the rule was noise. */}

            {/* Kits by Section */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <BlockLabel>Kits by Section</BlockLabel>
              {kitSectionRows.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.disabled', p: 2 }}>
                  No sections yet.
                </Typography>
              ) : (
                <Box sx={{ ...PANEL_SX, overflow: 'hidden' }}>
                  {kitSectionRows.map((row, i) => (
                    <SectionRow
                      key={row.key}
                      label={row.label}
                      total={row.total}
                      items={row.items}
                      itemOrder={KIT_TYPE_ORDER}
                      itemLabels={KIT_TYPE_LABELS}
                      color={row.color}
                      divider={i > 0}
                      onClick={() => navigate(row.href)}
                    />
                  ))}
                </Box>
              )}
            </Box>
          </Box>

          <Box sx={{ mt: 3, display: 'flex', gap: 3, alignItems: 'flex-start', flexDirection: { xs: 'column', md: 'row' } }}>
            {canSeeContracts && (
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <BlockLabel>Contracts</BlockLabel>
                <StatPanel>
                  <StripRow columns={contractCells.length}>
                    {contractCells.map((cell) => (
                      <Tile key={cell.key} label={cell.label} value={cell.value} color={cell.color} onClick={() => navigate('/contracts')} />
                    ))}
                  </StripRow>
                </StatPanel>
              </Box>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <BlockLabel>Catalog</BlockLabel>
              <StatPanel>
                <StripRow columns={catalogCells.length}>
                  {catalogCells.map((cell) => (
                    <Tile key={cell.key} label={cell.label} value={cell.value} color={cell.color} onClick={() => navigate(cell.href)} />
                  ))}
                </StripRow>
              </StatPanel>
            </Box>
          </Box>
        </>
      )}
    </MainLayout>
  );
}

/**
 * Bordered container for one row of stat tiles. `grow` lets the last
 * panel in a column absorb leftover height, so columns whose tiles have
 * different line counts (OneWeb lists three models, a kit type lists
 * one) still end at the same y and don't ripple into the blocks below.
 */
function StatPanel({ children, grow }: { children: React.ReactNode; grow?: boolean }) {
  return (
    <Box
      sx={{
        ...PANEL_SX,
        overflow: 'hidden', mb: 3,
        ...(grow && { flexGrow: 1 }),
      }}
    >
      {children}
    </Box>
  );
}

/**
 * Heading that sits *above* its bordered block, not inside it - the
 * pattern the section breakdowns already used. Shared by every block on
 * the page so the headings all read alike.
 */
function BlockLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{
        display: 'block', textTransform: 'uppercase', fontWeight: 800,
        letterSpacing: '0.08em', color: 'text.primary', fontSize: 13, mb: 1,
      }}
    >
      {children}
    </Typography>
  );
}

/**
 * Tile row. Every row in a panel uses the same fixed column count - not
 * one column per tile - so a 5-tile status row and a 4-tile type row
 * share identical column widths and line up, with the type row simply
 * leaving its last column empty. No separators; the border is the only
 * rule.
 */
function StripRow({ children, columns = PANEL_COLUMNS }: { children: React.ReactNode; columns?: number }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {children}
    </Box>
  );
}

interface TileProps {
  label: string;
  value: number;
  /** A string renders as one caption line; an array renders one line per entry. */
  sub?: string | string[];
  color: string;
  onClick: () => void;
}

function Tile({ label, value, sub, color, onClick }: TileProps) {
  return (
    <Box
      onClick={onClick}
      sx={{
        bgcolor: 'background.paper',
        p: 1.5,
        cursor: 'pointer',
        transition: 'background .12s, transform .12s',
        userSelect: 'none',
        '&:hover': { bgcolor: 'action.hover' },
        '&:active': { transform: 'translateY(1px)' },
      }}
    >
      {Array.isArray(sub) ? (
        // Two columns: label + count on the left, the breakdown list on
        // the right starting level with the label rather than hanging off
        // the count's baseline. Keeps the tile short and reads top-down.
        //
        // The row wraps, and the left column refuses to shrink below its
        // own text. A panel is half the page wide and always five columns,
        // so a tile is narrow even on a wide screen - without these two
        // rules the label shrank past its content and the nowrap
        // breakdown printed on top of it ("74 Mini" over "STARSHIELD").
        // Wrapping drops the breakdown under the count instead, which
        // keeps it inside the tile it belongs to at any width.
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, flexWrap: 'wrap' }}>
          <Box sx={{ minWidth: 0, flexShrink: 0 }}>
            <StatLabel color={color}>{label}</StatLabel>
            <StatValue>{value}</StatValue>
          </Box>
          <Box>
            {sub.map((line) => (
              <Typography
                key={line}
                variant="caption"
                sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5, whiteSpace: 'nowrap' }}
              >
                {line}
              </Typography>
            ))}
          </Box>
        </Box>
      ) : (
        <>
          <StatLabel color={color}>{label}</StatLabel>
          <StatValue>{value}</StatValue>
          {sub && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {sub}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

interface SectionRowProps {
  label: string;
  total: number;
  /** Per-bucket counts (terminal models, or kit types). */
  items: Record<string, number>;
  /** Canonical bucket order - only buckets with a non-zero count render. */
  itemOrder: string[];
  /** Bucket key → display label. */
  itemLabels: Record<string, string>;
  color: string;
  divider: boolean;
  onClick: () => void;
}

function SectionRow({ label, total, items, itemOrder, itemLabels, color, divider, onClick }: SectionRowProps) {
  const bubbles = itemOrder.filter((m) => (items[m] ?? 0) > 0);
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.25,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background .12s',
        '&:hover': { bgcolor: 'action.hover' },
        ...(divider && { borderTop: 1, borderColor: 'divider' }),
      }}
    >
      <Typography
        variant="caption"
        sx={{ textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.06em', color, minWidth: 96, flexShrink: 0 }}
      >
        {label}
      </Typography>
      {/* Reserve two digits and use tabular figures so the hyphen after
          the count sits at the same x on every row, whether a section
          has 3 terminals or 30. */}
      <Typography
        sx={{
          fontSize: 16, fontWeight: 800, color: 'text.primary', flexShrink: 0,
          minWidth: '2ch', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
        }}
      >
        {total}
      </Typography>
      <Typography sx={{ color: 'text.disabled', flexShrink: 0, fontWeight: 600 }}>–</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, flex: 1 }}>
        {bubbles.map((m) => (
          <Box
            key={m}
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              px: '9px',
              py: '2px',
              borderRadius: '999px',
              border: 1,
              borderColor: 'divider',
              bgcolor: 'action.hover',
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            <Box component="span" sx={{ fontWeight: 800, color: 'text.primary', fontFamily: '"SF Mono","Fira Code",monospace' }}>
              {items[m]}
            </Box>
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              {itemLabels[m]}
            </Box>
          </Box>
        ))}
        {bubbles.length === 0 && (
          <Typography
            variant="caption"
            sx={{
              color: 'text.disabled',
              fontStyle: 'italic'
            }}>
            None set
          </Typography>
        )}
      </Box>
    </Box>
  );
}

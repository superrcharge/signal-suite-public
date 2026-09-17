import { useState, type ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  Typography,
  Alert,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Collapse,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import {
  LoadingSpinner, EmptyState, PageBanner, PageTitle, PageSubtitle,
  ListPagination, PANEL_SX, TABLE_HEAD_SX, TIGHT_CELL_SX, ROW_HOVER_SX,
} from '@/components/common';
import { MainLayout } from '@/components/layouts';
import { useAuditEvents } from '@/services';
import { ApiClientError } from '@/services/api-client';
import { useAuth } from '@/contexts/auth-context';
import type { AuditEvent } from '@/services/audit-service';
import { EMPTY_VALUE } from '@/utils';

const PAGE_LIMIT = 50;

// Every resource type the backend actually records. This listed three of the
// nine that existed, so events for kits, contracts, equipment, services, nets
// and PACE cards were written to the log and then unreachable through the only
// filter the page offers - the rows were there, with no way to ask for them.
//
// The values are the literals the services pass as AuditEventInput.ResourceType,
// not guesses: note `pace_section` rather than `pace`. A Go test
// (backend/audit_wiring_test.go) fails if a service emits a type missing from
// this list, so it cannot drift again.
const RESOURCE_TYPES = [
  { value: '',             label: 'All resources' },
  { value: 'terminal',     label: 'Terminals' },
  { value: 'kit',          label: 'Kits' },
  { value: 'section',      label: 'Sections' },
  { value: 'contract',     label: 'Contracts' },
  { value: 'equipment',    label: 'Equipment' },
  { value: 'waveform',     label: 'Waveforms' },
  { value: 'service',      label: 'Services' },
  { value: 'transport',    label: 'Transports' },
  { value: 'platform',     label: 'Platforms' },
  { value: 'net',          label: 'Nets' },
  { value: 'pace_section', label: 'PACE cards' },
  { value: 'user',         label: 'Users' },
];

const ACTIONS = [
  { value: '',            label: 'All actions' },
  { value: 'create',      label: 'Create' },
  { value: 'update',      label: 'Update' },
  { value: 'delete',      label: 'Delete' },
  { value: 'role_change', label: 'Role change' },
];

const ACTION_COLORS: Record<string, { bg: string; fg: string }> = {
  create:      { bg: 'rgba(63,185,80,0.14)',  fg: '#3fb950' },
  update:      { bg: 'rgba(56,139,253,0.14)', fg: '#388bfd' },
  delete:      { bg: 'rgba(248,81,73,0.14)',  fg: '#f85149' },
  role_change: { bg: 'rgba(163,113,247,0.14)',fg: '#a371f7' },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function ActionChip({ action }: { action: string }) {
  const colors = ACTION_COLORS[action] ?? { bg: 'rgba(139,148,158,0.18)', fg: '#c9d1d9' };
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        px: 1,
        py: 0.25,
        borderRadius: '4px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        bgcolor: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.fg}33`,
      }}
    >
      {action}
    </Box>
  );
}

function ResourceTypeChip({ type }: { type: string }) {
  // Underscores become spaces so the one multi-word type reads as "Pace section"
  // rather than "Pace_section". capitalize only touches the first letter, so the
  // raw literal leaked into the UI.
  return (
    <Typography component="span" variant="caption" sx={{ textTransform: 'capitalize', color: 'text.secondary' }}>
      {type.replace(/_/g, ' ')}
    </Typography>
  );
}

/**
 * Renders a changes map as a compact key-by-key summary. Handles the
 * canonical diff shape ({ field: { old, new } }) plus a few hint keys
 * like `via`, `reassigned_terminals`, `reassigned_to`.
 */
function ChangesCell({ changes }: { changes: Record<string, unknown> }): ReactNode {
  const entries = Object.entries(changes ?? {});
  if (entries.length === 0) return (
    <Typography variant="body2" sx={{
      color: 'text.disabled'
    }}>{EMPTY_VALUE}</Typography>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {entries.map(([key, val]) => {
        if (val && typeof val === 'object' && 'old' in val && 'new' in val) {
          const v = val;
          return (
            <Box key={key} sx={{ display: 'flex', gap: 1, fontSize: 12, alignItems: 'baseline' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>{key}</Typography>
              <Typography
                variant="body2"
                sx={{
                  color: 'text.disabled',
                  textDecoration: 'line-through'
                }}>{String(v.old) || EMPTY_VALUE}</Typography>
              <Typography variant="body2">→</Typography>
              <Typography variant="body2" sx={{
                fontWeight: 500
              }}>{String(v.new) || EMPTY_VALUE}</Typography>
            </Box>
          );
        }
        return (
          <Box key={key} sx={{ display: 'flex', gap: 1, fontSize: 12 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>{key}</Typography>
            <Typography variant="body2">{String(val)}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export function AuditPage() {
  const { isAdmin } = useAuth();
  const [page, setPage] = useState(1);
  const [resourceType, setResourceType] = useState('');
  const [action, setAction] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, error } = useAuditEvents({
    resource_type: resourceType || undefined,
    action: action || undefined,
    page,
    limit: PAGE_LIMIT,
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  // Server-side 403 means we're not admin. Show a clean message.
  if (error instanceof ApiClientError && error.code === 'AUTH_FORBIDDEN') {
    return (
      <MainLayout>
        <Alert severity="warning">The audit log is admin-only.</Alert>
      </MainLayout>
    );
  }

  const errorMessage =
    error instanceof ApiClientError ? error.message : error ? 'Failed to load audit log' : null;

  return (
    <MainLayout>
      <PageBanner variant="plain" sx={{ mb: 2 }}>
        <PageTitle sx={{ minWidth: 0 }}>
          Audit Log
          <PageSubtitle>
            Every create, update, delete, and role change. Newest first. Admin-only.
            {!isAdmin && ' If you are seeing this, your role may have changed recently - reload the page.'}
          </PageSubtitle>
        </PageTitle>
      </PageBanner>
      <Paper elevation={0} sx={{ ...PANEL_SX, px: 2, py: 1.5, mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Resource</InputLabel>
          <Select
            value={resourceType}
            label="Resource"
            onChange={(e) => { setResourceType(e.target.value); setPage(1); }}
          >
            {RESOURCE_TYPES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Action</InputLabel>
          <Select
            value={action}
            label="Action"
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
          >
            {ACTIONS.map((a) => <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>)}
          </Select>
        </FormControl>
      </Paper>
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 3 }}>{errorMessage}</Alert>
      )}
      {isLoading ? (
        <LoadingSpinner message="Loading audit log..." />
      ) : events.length === 0 ? (
        <EmptyState title="No events" description="No audit events match the current filters." />
      ) : (
        <TableContainer component={Paper} elevation={0} sx={PANEL_SX}>
          <Table aria-label="audit log" size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 30 }} />
                <TableCell sx={TABLE_HEAD_SX}>When</TableCell>
                <TableCell sx={TABLE_HEAD_SX}>Who</TableCell>
                <TableCell sx={TABLE_HEAD_SX}>Action</TableCell>
                <TableCell sx={TABLE_HEAD_SX}>Resource</TableCell>
                <TableCell sx={TABLE_HEAD_SX}>What Changed:</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.map((e: AuditEvent) => {
                const expanded = expandedId === e.id;
                const hasChanges = e.changes && Object.keys(e.changes).length > 0;
                return (
                  <Row
                    key={e.id}
                    event={e}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : e.id)}
                    hasChanges={!!hasChanges}
                  />
                );
              })}
            </TableBody>
          </Table>
          <ListPagination
            total={total}
            noun="event"
            page={page}
            totalPages={totalPages}
            onPrev={handlePrev}
            onNext={handleNext}
          />
        </TableContainer>
      )}
    </MainLayout>
  );
}

function Row({
  event,
  expanded,
  hasChanges,
  onToggle,
}: {
  event: AuditEvent;
  expanded: boolean;
  hasChanges: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow
        sx={{
          ...ROW_HOVER_SX,
          cursor: hasChanges ? 'pointer' : 'default',
        }}
        onClick={hasChanges ? onToggle : undefined}
      >
        <TableCell sx={{ pl: 1, pr: 0 }}>
          {hasChanges ? (
            expanded
              ? <KeyboardArrowDownIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              : <KeyboardArrowRightIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          ) : null}
        </TableCell>
        <TableCell sx={TIGHT_CELL_SX}>
          <Tooltip title={absoluteTime(event.created_at)} placement="top-start" enterDelay={300}>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                fontSize: 11
              }}>
              {relativeTime(event.created_at)}
            </Typography>
          </Tooltip>
        </TableCell>
        <TableCell sx={TIGHT_CELL_SX}>
          <Typography variant="body2" sx={{
            fontWeight: 500
          }}>
            {event.actor_name || <Typography component="span" sx={{
              color: 'text.disabled'
            }}>unknown</Typography>}
          </Typography>
        </TableCell>
        <TableCell sx={TIGHT_CELL_SX}>
          <ActionChip action={event.action} />
        </TableCell>
        <TableCell sx={TIGHT_CELL_SX}>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2" sx={{
              fontWeight: 500
            }}>
              {event.resource_name || event.resource_id}
            </Typography>
            <ResourceTypeChip type={event.resource_type} />
          </Box>
        </TableCell>
        <TableCell>
          {hasChanges ? (
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                fontSize: 12
              }}>
              {Object.keys(event.changes ?? {}).join(', ')}
            </Typography>
          ) : (
            <Typography variant="body2" sx={{
              color: 'text.disabled'
            }}>{EMPTY_VALUE}</Typography>
          )}
        </TableCell>
      </TableRow>
      {hasChanges && (
        <TableRow>
          <TableCell colSpan={6} sx={{ py: 0, borderBottom: expanded ? undefined : 'none' }}>
            <Collapse in={expanded} timeout="auto" unmountOnExit>
              <Box sx={{ py: 1.5, px: 3 }}>
                <ChangesCell changes={event.changes ?? {}} />
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

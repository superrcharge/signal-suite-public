import { useState, type MouseEvent, type ReactNode } from 'react';
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
  Typography,
  Menu,
  MenuItem,
  Tooltip,
  CircularProgress,
  ButtonBase,
  IconButton,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import {
  LoadingSpinner, EmptyState, RoleBadge, PageBanner, PageTitle, PageSubtitle,
  StatStrip, StatCell, PANEL_SX, TABLE_HEAD_SX, ROW_HOVER_SX,
} from '@/components/common';
import { MainLayout } from '@/components/layouts';
import { useUsers, useUpdateUserRole } from '@/services';
import { ApiClientError } from '@/services/api-client';
import { useAuth } from '@/contexts/auth-context';
import { ROLES, type Role } from '@/types/roles';
import { ROLE_OPTIONS } from '@/types/role-meta';
import { useToast } from '@/contexts';
import { ROLE_COLORS } from '@/theme/asset-colors';
import type { User } from '@/types';

interface RoleButtonProps {
  role: Role;
  interactive: boolean;
  disabledReason?: string;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
}

function RoleButton({ role, interactive, disabledReason, onClick }: RoleButtonProps) {
  const content: ReactNode = (
    <RoleBadge
      role={role}
      interactive={interactive}
      muted={!interactive}
      minWidth={90}
      trailing={interactive ? <ExpandMoreIcon sx={{ fontSize: 14, ml: 0.25 }} /> : undefined}
    />
  );

  if (!interactive) {
    return disabledReason ? (
      <Tooltip title={disabledReason} placement="top-start" enterDelay={400}>
        <span>{content}</span>
      </Tooltip>
    ) : (
      <>{content}</>
    );
  }

  return (
    <ButtonBase
      onClick={onClick}
      sx={{ borderRadius: '4px' }}
      aria-label={`change role (currently ${role})`}
    >
      {content}
    </ButtonBase>
  );
}

// Falls back to viewer rather than null: this drives the badge every row must
// render, and viewer is the safe thing to show for a role we do not recognise.
function primaryRole(user: User): Role {
  const r = user.roles?.[0];
  return ROLES.includes(r as Role) ? (r as Role) : 'viewer';
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return 'never';
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

const PAGE_LIMIT = 30;

export function UsersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useUsers({ page, limit: PAGE_LIMIT });
  const { user: currentUser, isAdmin } = useAuth();
  const updateRole = useUpdateUserRole();

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  // Counts come from the server and span the whole table. They cannot be
  // derived from `users`, which holds only the current page.
  const roleCounts = data?.role_counts;
  const statCells = [
    { key: 'total', label: 'Total', value: total, sub: 'All users', color: ROLE_COLORS.total },
    ...ROLE_OPTIONS.map((opt) => ({
      key: opt.value,
      label: opt.label,
      value: roleCounts?.[opt.value] ?? 0,
      sub: opt.description,
      color: ROLE_COLORS[opt.value],
    })),
  ];

  const { showToast } = useToast();
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; user: User } | null>(null);

  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  const handleRoleClick = (e: MouseEvent<HTMLElement>, user: User) => {
    if (!isAdmin) return;
    if (user.id === currentUser?.id) return;
    setMenuAnchor({ el: e.currentTarget, user });
  };

  const handleMenuClose = () => setMenuAnchor(null);

  const handleRoleChange = (role: Role) => {
    const target = menuAnchor?.user;
    setMenuAnchor(null);
    if (!target || primaryRole(target) === role) return;
    updateRole.mutate(
      { userId: target.id, role },
      {
        onSuccess: () => {
          showToast(`${target.name} is now ${role}.`);
        },
        onError: (err) => {
          showToast(err instanceof ApiClientError ? err.message : 'Failed to change role.', { severity: 'error' });
        },
      }
    );
  };

  const errorMessage =
    error instanceof ApiClientError
      ? error.message
      : error
        ? 'Failed to load users'
        : null;

  const isPending = updateRole.isPending;

  return (
    <MainLayout>
      <PageBanner variant="plain">
        <PageTitle sx={{ minWidth: 0, mb: 1.5 }}>
          Users &amp; Roles
          <PageSubtitle>everyone who signs in appears here. New accounts default to Viewer.</PageSubtitle>
        </PageTitle>
        {/* Role counts. Non-interactive: unlike the terminals and kits strips
            there is no role filter on the users list for a cell to drive, so
            these carry no hover or cursor affordance - `StatCell` draws one
            only when it is given an `onClick`. */}
        {!isLoading && !errorMessage && (
          <StatStrip mb={0} ariaLabel="Role counts">
            {statCells.map((cell) => (
              <StatCell key={cell.key} label={cell.label} value={cell.value} hint={cell.sub} color={cell.color} />
            ))}
          </StatStrip>
        )}
      </PageBanner>
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 3 }}>{errorMessage}</Alert>
      )}
      {isLoading ? (
        <LoadingSpinner message="Loading users..." />
      ) : users.length === 0 ? (
        <EmptyState
          title="No users yet"
          description="As people sign in, they will appear here."
        />
      ) : (
        <TableContainer component={Paper} elevation={0} sx={PANEL_SX}>
          <Table aria-label="users table" size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={TABLE_HEAD_SX}>Name</TableCell>
                <TableCell sx={TABLE_HEAD_SX}>Email</TableCell>
                <TableCell sx={TABLE_HEAD_SX}>Role</TableCell>
                <TableCell sx={TABLE_HEAD_SX}>Last login</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => {
                const role = primaryRole(user);
                const isSelf = user.id === currentUser?.id;
                const clickable = isAdmin && !isSelf;
                const disabledReason = !isAdmin
                  ? 'Only admins can change roles'
                  : isSelf
                    ? 'You cannot change your own role'
                    : undefined;
                return (
                  <TableRow key={user.id} sx={{ '&:last-child td': { border: 0 }, ...ROW_HOVER_SX }}>
                    <TableCell>
                      <Typography variant="body2" sx={{
                        fontWeight: 600
                      }}>
                        {user.name}{isSelf && <Typography
                        component="span"
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          ml: 1
                        }}>(you)</Typography>}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{
                        color: 'text.secondary'
                      }}>{user.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <RoleButton
                        role={role}
                        interactive={clickable}
                        disabledReason={disabledReason}
                        onClick={(e) => handleRoleClick(e, user)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'text.secondary',
                          fontSize: 11
                        }}>
                        {relativeTime(user.last_login_at)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" sx={{
              color: 'text.secondary'
            }}>
              {total} user{total !== 1 ? 's' : ''}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title="Previous page">
                <span>
                  <IconButton size="small" onClick={handlePrev} disabled={page <= 1}>
                    <NavigateBeforeIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  whiteSpace: 'nowrap'
                }}>
                {page} / {totalPages}
              </Typography>
              <Tooltip title="Next page">
                <span>
                  <IconButton size="small" onClick={handleNext} disabled={page >= totalPages}>
                    <NavigateNextIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </TableContainer>
      )}
      <Menu
        anchorEl={menuAnchor?.el ?? null}
        open={!!menuAnchor}
        onClose={handleMenuClose}
        slotProps={{ paper: { sx: { minWidth: 280 } } }}
      >
        {ROLE_OPTIONS.map((opt) => (
          <MenuItem
            key={opt.value}
            selected={menuAnchor ? primaryRole(menuAnchor.user) === opt.value : false}
            disabled={isPending}
            onClick={() => handleRoleChange(opt.value)}
            sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1 }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                textTransform: 'capitalize'
              }}>{opt.label}</Typography>
            <Typography variant="caption" sx={{
              color: 'text.secondary'
            }}>{opt.description}</Typography>
          </MenuItem>
        ))}
      </Menu>
      {isPending && (
        <Box sx={{ position: 'fixed', bottom: 16, right: 16 }}>
          <CircularProgress size={24} />
        </Box>
      )}
    </MainLayout>
  );
}

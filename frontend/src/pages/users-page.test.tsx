import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@/test/utils';
import { UsersPage } from './users-page';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('@/contexts', async () => {
  const actual = await vi.importActual('@/contexts');
  return {
    ...actual,
    useAuth: () => ({
      user: { id: '1', name: 'Admin User', email: 'admin@test.com', roles: ['admin'] },
      isAuthenticated: true,
      isLoading: false,
      isError: false,
      role: 'admin',
      isAdmin: true,
      canWrite: true,
      canWriteRadio: true,
      refetch: vi.fn(),
    }),
    useThemeMode: () => ({
      mode: 'light',
      toggleTheme: vi.fn(),
    }),
  };
});

vi.mock('@/contexts/auth-context', async () => {
  const actual = await vi.importActual('@/contexts/auth-context');
  return {
    ...actual,
    useAuth: () => ({
      user: { id: '1', name: 'Admin User', email: 'admin@test.com', roles: ['admin'] },
      isAuthenticated: true,
      isLoading: false,
      isError: false,
      role: 'admin',
      isAdmin: true,
      canWrite: true,
      canWriteRadio: true,
      refetch: vi.fn(),
    }),
  };
});

vi.mock('@/services', () => ({
  useUsers: vi.fn(),
  useUpdateUserRole: () => ({ mutate: vi.fn(), isPending: false }),
  useLogout: () => ({ mutate: vi.fn() }),
  useSections: () => ({ data: [] }),
  // Added alongside sidebar's SectionEditDialog, which mounts when
  // UsersPage renders its MainLayout. The dialog pulls these hooks
  // even though it stays closed at render.
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useContractFiscalYears: () => ({ data: [] }),
  REASSIGN_TO_NONE: '__none__',
}));

import { useUsers } from '@/services';
const mockUseUsers = vi.mocked(useUsers);

// Ordered most-recently-active first, matching what the API returns - the
// backend sorts on last_login_at DESC NULLS LAST and the page does not re-sort.
const mockUsers = [
  {
    id: '1',
    email: 'admin@test.com',
    name: 'Admin User',
    roles: ['admin'],
    preferences: { theme: 'light' },
    last_login_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    email: 'editor@test.com',
    name: 'Editor User',
    roles: ['editor'],
    preferences: { theme: 'dark' },
    last_login_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
  {
    id: '3',
    email: 'rto@test.com',
    name: 'RTO User',
    roles: ['rto'],
    preferences: { theme: 'dark' },
    // Never signed in, so the column reads "never" and the row sorts last.
    created_at: '2024-01-03T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
  },
];

const mockRoleCounts = { admin: 1, editor: 1, viewer: 0, rto: 1 };

/**
 * The stat cell wrapping a given label, for asserting on its count.
 *
 * Scoped to the strip because the sidebar renders the current user's role with
 * the same caption styling, so "Editor" is not unique in the document.
 */
function statCell(label: string) {
  const strip = screen.getByRole('group', { name: 'Role counts' });
  return within(strip).getByText(label).parentElement!;
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    mockUseUsers.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useUsers>);

    render(<UsersPage />);

    expect(screen.getByText('Loading users...')).toBeInTheDocument();
  });

  it('renders empty state when no users exist', () => {
    mockUseUsers.mockReturnValue({
      data: { users: [], total: 0 },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useUsers>);

    render(<UsersPage />);

    expect(screen.getByText('No users yet')).toBeInTheDocument();
  });

  it('renders users with their current role chip', () => {
    mockUseUsers.mockReturnValue({
      data: { users: mockUsers, total: mockUsers.length },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useUsers>);

    render(<UsersPage />);

    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('admin@test.com')).toBeInTheDocument();
    expect(screen.getByText('Editor User')).toBeInTheDocument();
    expect(screen.getByText('editor@test.com')).toBeInTheDocument();
    // One badge per user row. The role names also appear in the stat strip,
    // but capitalised there ("Admin"), so these match rows only.
    expect(screen.getAllByText('admin').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('editor').length).toBeGreaterThanOrEqual(1);
  });

  it('renders API error when the users endpoint fails', () => {
    mockUseUsers.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to fetch'),
    } as unknown as ReturnType<typeof useUsers>);

    render(<UsersPage />);

    expect(screen.getByText('Failed to load users')).toBeInTheDocument();
  });

  describe('role stat strip', () => {
    const renderWithCounts = (
      data: Record<string, unknown> = {
        users: mockUsers,
        total: mockUsers.length,
        role_counts: mockRoleCounts,
      }
    ) => {
      mockUseUsers.mockReturnValue({
        data,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useUsers>);
      render(<UsersPage />);
    };

    it('renders a cell per role plus a total', () => {
      renderWithCounts();

      expect(statCell('Total')).toHaveTextContent('3');
      expect(statCell('Admin')).toHaveTextContent('1');
      expect(statCell('Editor')).toHaveTextContent('1');
      expect(statCell('RTO')).toHaveTextContent('1');
      expect(statCell('Viewer')).toHaveTextContent('0');
    });

    it('takes counts from the server rather than the loaded page', () => {
      // One user on this page, but the table holds 60. Counting the rendered
      // rows would report 1 editor instead of 47.
      renderWithCounts({
        users: [mockUsers[0]],
        total: 60,
        role_counts: { admin: 2, editor: 47, viewer: 8, rto: 3 },
      });

      expect(statCell('Total')).toHaveTextContent('60');
      expect(statCell('Editor')).toHaveTextContent('47');
      expect(statCell('RTO')).toHaveTextContent('3');
    });

    it('falls back to zero when the server omits a role', () => {
      renderWithCounts({ users: mockUsers, total: 3, role_counts: { admin: 1 } });

      expect(statCell('Admin')).toHaveTextContent('1');
      expect(statCell('RTO')).toHaveTextContent('0');
      expect(statCell('Viewer')).toHaveTextContent('0');
    });

    it('is hidden while loading and on error', () => {
      mockUseUsers.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as unknown as ReturnType<typeof useUsers>);
      const { unmount } = render(<UsersPage />);
      expect(screen.queryByRole('group', { name: 'Role counts' })).not.toBeInTheDocument();
      unmount();

      mockUseUsers.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('boom'),
      } as unknown as ReturnType<typeof useUsers>);
      render(<UsersPage />);
      expect(screen.queryByRole('group', { name: 'Role counts' })).not.toBeInTheDocument();
    });
  });

  describe('rto role', () => {
    beforeEach(() => {
      mockUseUsers.mockReturnValue({
        data: { users: mockUsers, total: mockUsers.length, role_counts: mockRoleCounts },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useUsers>);
    });

    it('renders an rto badge for an rto user', () => {
      render(<UsersPage />);

      expect(screen.getByText('RTO User')).toBeInTheDocument();
      expect(screen.getAllByText('rto').length).toBeGreaterThanOrEqual(1);
    });

    // The strip cell carries the permission summary - there is no separate
    // privileges legend, so this caption is the only place the scope is stated.
    it('describes the rto scope in its stat cell', () => {
      render(<UsersPage />);

      expect(statCell('RTO')).toHaveTextContent('Writes radio + waveforms; reads the rest');
    });
  });

  describe('last login column', () => {
    it('shows relative times, and "never" for users who have not signed in', () => {
      mockUseUsers.mockReturnValue({
        data: { users: mockUsers, total: mockUsers.length, role_counts: mockRoleCounts },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useUsers>);

      render(<UsersPage />);

      const rows = screen.getAllByRole('row');
      // rows[0] is the header; the rest follow the server's ordering.
      expect(within(rows[1]!).getByText('5m ago')).toBeInTheDocument();
      expect(within(rows[2]!).getByText('3h ago')).toBeInTheDocument();
      expect(within(rows[3]!).getByText('never')).toBeInTheDocument();
    });
  });
});

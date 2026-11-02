import { describe, it, expect, vi, beforeEach } from 'vitest';
import { within } from '@testing-library/react';
import { render, screen } from '@/test/utils';
import { DashboardPage } from './dashboard-page';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// One mutable fixture behind both useAuth mocks, so a test can drop a flag and
// see which tiles disappear. Defaults to admin.
const ADMIN_AUTH = {
  user: { id: '1', name: 'Admin User', email: 'admin@test.com', roles: ['admin'] },
  isAuthenticated: true,
  isLoading: false,
  isError: false,
  role: 'admin',
  isAdmin: true,
  isPlanner: false,
  canWrite: true,
  canSeeContracts: true, canSeeTrackers: true,
  refetch: vi.fn(),
};
const { auth } = vi.hoisted(() => {
  const auth: { current: Record<string, unknown> } = { current: {} };
  return { auth };
});

vi.mock('@/contexts', async () => {
  const actual = await vi.importActual('@/contexts');
  return {
    ...actual,
    useAuth: () => auth.current,
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
    useAuth: () => auth.current,
  };
});

// Closed mock - the page calls no service hook itself, so this lists only the
// sidebar/header hooks MainLayout mounts.
vi.mock('@/services', () => ({
  useSections: vi.fn(() => ({ data: [], isLoading: false, error: null })),
  useLogout: () => ({ mutate: vi.fn() }),
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useContractFiscalYears: () => ({ data: [] }),
  useOperations: () => ({ data: undefined, isLoading: false, isError: false }),
  REASSIGN_TO_NONE: '__none__',
}));

function tiles() {
  const nav = screen.getByRole('navigation', { name: 'Pages' });
  return within(nav).getAllByRole('link');
}

// The caption, not the link's textContent: the Terminals glyph is an aria-hidden emoji that textContent includes.
const caption = (a: HTMLElement) => a.querySelector('p')?.textContent;
const labels = () => tiles().map(caption);

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.current = { ...ADMIN_AUTH };
  });

  it('renders an h1 named Dashboard', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Dashboard/ })).toBeInTheDocument();
  });

  it('offers an admin every page except the Dashboard, in menu order', () => {
    render(<DashboardPage />);
    expect(labels()).toEqual([
      'Stats', 'Terminals', 'Kits', 'Catalog', 'PACE', 'Operations',
      'Contracts', 'Users', 'Settings',
    ]);
  });

  it('offers a planner only the planning pages', () => {
    auth.current = { ...ADMIN_AUTH, isAdmin: false, isPlanner: true, canSeeContracts: false, canSeeTrackers: false, role: 'planner' };
    render(<DashboardPage />);
    expect(labels()).toEqual(['Stats', 'Catalog', 'PACE', 'Operations', 'Settings']);
  });

  it('gives an editor Contracts but not Users', () => {
    auth.current = { ...ADMIN_AUTH, isAdmin: false, isPlanner: false, canSeeContracts: true, canSeeTrackers: true, role: 'editor' };
    render(<DashboardPage />);
    const shown = labels();
    expect(shown).toContain('Contracts');
    expect(shown).not.toContain('Users');
  });

  it('links each tile to its page', () => {
    render(<DashboardPage />);
    const byLabel = new Map(tiles().map((a) => [caption(a), a.getAttribute('href')]));
    expect(byLabel.get('Stats')).toBe('/stats');
    expect(byLabel.get('Operations')).toBe('/operations');
    expect(byLabel.get('Users')).toBe('/users');
  });
});

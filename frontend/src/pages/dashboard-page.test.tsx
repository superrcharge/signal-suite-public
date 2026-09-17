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
// see what the page hides. Defaults to admin.
const ADMIN_AUTH = {
  user: { id: '1', name: 'Admin User', email: 'admin@test.com', roles: ['admin'] },
  isAuthenticated: true,
  isLoading: false,
  isError: false,
  role: 'admin',
  isAdmin: true,
  canWrite: true,
  canSeeContracts: true,
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

// Closed mock - every hook the render tree pulls must be listed here,
// including the sidebar/header hooks MainLayout mounts.
vi.mock('@/services', () => ({
  useTerminals: vi.fn(),
  useKits: vi.fn(),
  useSections: vi.fn(),
  useContracts: vi.fn(),
  useEquipment: vi.fn(),
  useWaveforms: vi.fn(),
  useServices: vi.fn(),
  useLogout: () => ({ mutate: vi.fn() }),
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useContractFiscalYears: () => ({ data: [] }),
  REASSIGN_TO_NONE: '__none__',
}));

import { useTerminals, useKits, useSections, useContracts, useEquipment, useWaveforms } from '@/services';
const mockUseTerminals = vi.mocked(useTerminals);
const mockUseKits = vi.mocked(useKits);
const mockUseSections = vi.mocked(useSections);
const mockUseContracts = vi.mocked(useContracts);
const mockUseEquipment = vi.mocked(useEquipment);
const mockUseWaveforms = vi.mocked(useWaveforms);

function terminal(overrides: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    name: 'TERM',
    model: null,
    kit: '',
    pim: '',
    serial: '',
    section: '',
    status: 'available',
    owner: null,
    owner_email: null,
    owner_phone: null,
    pop_pin: null,
    notes: '',
    tag: null,
    updated_by: 'tester',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// "ASQD MINI 9" carries a hornet model on purpose - the family counts
// must come from the model field, not name substring matching.
const mockTerminals = [
  terminal({ name: 'ASQD MINI 1', model: 'mini', section: 'asqd' }),
  terminal({ name: 'ASQD MINI 2', model: 'mini', section: 'asqd' }),
  terminal({ name: 'ASQD HP 1', model: 'hp', section: 'asqd', status: 'inop' }),
  terminal({ name: 'ASQD MINI 9', model: 'hornet', section: 'asqd' }),
  terminal({ name: 'BSQD RAGNO 1', model: 'ragno', section: 'bsqd' }),
  terminal({ name: 'FLOATER OW 1', model: 'ow7', section: '' }),
];

function kit(overrides: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    name: 'KIT',
    type: 'remote',
    section: '',
    status: 'available',
    black: false,
    secret: false,
    topsecret: false,
    owner: null,
    owner_email: null,
    owner_phone: null,
    location: '',
    notes: '',
    updated_by: 'tester',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// Spread across all three types and five status buckets, including an
// alert-blue so the ALERT roll-up is exercised.
const mockKits = [
  kit({ name: 'REMOTE 1', type: 'remote', section: 'asqd' }),
  kit({ name: 'REMOTE 2', type: 'remote', status: 'inop' }),
  kit({ name: 'IFK 1', type: 'ifk', status: 'alert-blue' }),
  kit({ name: 'IFK 2', type: 'ifk', status: 'on-mission' }),
  kit({ name: 'ATK 1', type: 'atk', section: 'bsqd' }),
  kit({ name: 'ATK 2', type: 'atk', status: 'reserved' }),
];

const mockSections = [
  { key: 'asqd', label: 'A SQD', color: '#39d3f0', created_at: '', updated_at: '', pace_enabled: true },
  { key: 'bsqd', label: 'B SQD', color: '#e879f9', created_at: '', updated_at: '', pace_enabled: true },
];

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseTerminals.mockReturnValue({
      data: { terminals: mockTerminals, total: mockTerminals.length, page: 1, total_pages: 1, status_counts: {} },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useTerminals>);

    mockUseKits.mockReturnValue({
      data: { kits: [], total: 0, page: 1, total_pages: 1, status_counts: {} },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useKits>);

    mockUseSections.mockReturnValue({
      data: mockSections,
      isLoading: false,
    } as unknown as ReturnType<typeof useSections>);

    auth.current = { ...ADMIN_AUTH };
    mockUseContracts.mockReturnValue({
      data: { contracts: [], total: 0, counts: { total: 3, expiring_30: 1, expiring_60: 0, expiring_90: 2 } },
      isLoading: false,
    } as unknown as ReturnType<typeof useContracts>);

    mockUseEquipment.mockReturnValue({
      data: {
        equipment: [
          { id: 'a', terminal_type: 'satcom' },
          { id: 'b', terminal_type: 'satcom' },
          { id: 'c', terminal_type: 'radio' },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useEquipment>);

    mockUseWaveforms.mockReturnValue({
      data: { waveforms: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }, { id: 'w4' }] },
      isLoading: false,
    } as unknown as ReturnType<typeof useWaveforms>);
  });

  it('renders family tiles computed from the model field', () => {
    render(<DashboardPage />);

    // Total carries no subtext - the number speaks for itself.
    const typeStrip = screen.getByText('Terminals by Type').nextElementSibling as HTMLElement;
    expect(within(typeStrip).getByText('Total').parentElement!).toHaveTextContent('6');
    expect(screen.queryByText('Total terminal count')).not.toBeInTheDocument();
    // 2 mini + 1 hp - "ASQD MINI 9" is a hornet and must not count as Starshield.
    // Each sub-model count renders on its own line in the family tile.
    expect(screen.getByText('2 Mini')).toBeInTheDocument();
    expect(screen.getByText('1 HP')).toBeInTheDocument();
    expect(screen.getByText('1 Hornet')).toBeInTheDocument();
    expect(screen.getByText('1 Ragno')).toBeInTheDocument();
    expect(screen.getByText('1 OW-7')).toBeInTheDocument();
    expect(screen.getByText('0 OW-10')).toBeInTheDocument();
    expect(screen.getByText('0 OW-11')).toBeInTheDocument();
  });

  it('drops the Total tile from the status strip', () => {
    render(<DashboardPage />);

    const strip = screen.getByText('Terminals by Status').nextElementSibling as HTMLElement;
    expect(within(strip).getByText('Available')).toBeInTheDocument();
    expect(within(strip).getByText('INOP')).toBeInTheDocument();
    expect(within(strip).queryByText('Total')).not.toBeInTheDocument();
    // Status descriptions live on the terminals page, not the dashboard.
    expect(screen.queryByText('Ready to Assign')).not.toBeInTheDocument();
    expect(screen.queryByText('Broken / Turn In')).not.toBeInTheDocument();
    // …and the old "All Starshields" total tile is gone.
    expect(screen.queryByText('All Starshields')).not.toBeInTheDocument();
  });

  it('renders section rows with per-model bubbles, hiding zero counts', () => {
    render(<DashboardPage />);

    // Scope to the section list - section labels also render in the sidebar.
    const list = screen.getByText('Terminals by Section').nextElementSibling as HTMLElement;

    // A SQD has 2 Mini, 1 HP, 1 Hornet - and no Ragno/OneWeb bubbles.
    const asqdRow = within(list).getByText('A SQD').parentElement!;
    expect(asqdRow).toHaveTextContent('Mini');
    expect(asqdRow).toHaveTextContent('Hornet');
    expect(asqdRow).not.toHaveTextContent('Ragno');
    expect(asqdRow).not.toHaveTextContent('OW-10');

    // B SQD only has a Ragno.
    const bsqdRow = within(list).getByText('B SQD').parentElement!;
    expect(bsqdRow).toHaveTextContent('Ragno');
    expect(bsqdRow).not.toHaveTextContent('Mini');
  });

  // Contracts are internal: the panel and the count behind it exist only
  // for admin and editor. The hook is still called - hooks cannot be
  // conditional - but with `enabled` false, so no request leaves the page.
  it('renders the Contracts panel for a role that sees contracts', () => {
    render(<DashboardPage />);

    // The sidebar also says "Contracts", so the panel is found by its tiles.
    const strip = screen.getByText('Expiring').closest('[class*="MuiBox"]');
    expect(strip).not.toBeNull();
    expect(screen.getByText('Watch')).toBeInTheDocument();
    expect(mockUseContracts).toHaveBeenCalledWith({ limit: 1 }, true);
  });

  it('hides the Contracts panel and skips its query for a role that does not', () => {
    auth.current = { ...ADMIN_AUTH, role: 'viewer', isAdmin: false, canWrite: false, canSeeContracts: false };
    render(<DashboardPage />);

    expect(screen.queryByText('Contracts')).toBeNull();
    expect(screen.queryByText('Expiring')).toBeNull();
    expect(screen.queryByText('Watch')).toBeNull();
    expect(mockUseContracts).toHaveBeenCalledWith({ limit: 1 }, false);
  });

  it('splits the catalog panel into SATCOM, radios, and waveforms', () => {
    render(<DashboardPage />);
    // "Catalog", not "Equipment Catalog" - the sidebar owns that string.
    const strip = screen.getByText('Catalog').nextElementSibling as HTMLElement;
    const tile = (label: string) => within(strip).getByText(label).parentElement!;

    expect(tile('SATCOM')).toHaveTextContent('2');
    expect(tile('Radios')).toHaveTextContent('1');
    expect(tile('Waveforms')).toHaveTextContent('4');
  });

  it('renders an Unassigned row when terminals lack a section', () => {
    render(<DashboardPage />);

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  describe('kit stat strips', () => {
    beforeEach(() => {
      mockUseKits.mockReturnValue({
        data: { kits: mockKits, total: mockKits.length, page: 1, total_pages: 1, status_counts: {} },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useKits>);
    });

    it('counts kits by status, rolling the alert variants into one bucket', () => {
      render(<DashboardPage />);
      const strip = screen.getByText('Kits by Status').nextElementSibling as HTMLElement;

      const tile = (label: string) => within(strip).getByText(label).parentElement!;
      // Total belongs to the type strip, matching the terminals layout.
      expect(within(strip).queryByText('Total')).not.toBeInTheDocument();
      expect(tile('Available')).toHaveTextContent('2');
      // alert-blue must land in the ALERT bucket, not its own.
      expect(tile('ALERT')).toHaveTextContent('1');
      expect(tile('On Mission')).toHaveTextContent('1');
      expect(tile('Reserved')).toHaveTextContent('1');
      expect(tile('INOP')).toHaveTextContent('1');
    });

    it('counts kits by type with the available slice as subtext', () => {
      render(<DashboardPage />);
      const strip = screen.getByText('Kits by Type').nextElementSibling as HTMLElement;

      // Tiles split label+count and the breakdown into sibling columns,
      // so assert against the whole tile, not the label's parent.
      const row = strip.firstElementChild!;
      const tile = (label: string) =>
        [...row.children].find((el) => el.textContent?.includes(label)) as HTMLElement;
      // Total heads the type strip and equals the sum of the three types.
      expect(tile('Total')).toHaveTextContent('6');
      expect(tile('Remote')).toHaveTextContent('2');
      expect(tile('Remote')).toHaveTextContent('1 available');
      expect(tile('IFK')).toHaveTextContent('2');
      expect(tile('IFK')).toHaveTextContent('0 available');
      expect(tile('ATK')).toHaveTextContent('2');
      expect(tile('ATK')).toHaveTextContent('1 available');
    });

    it('renders zeroed kit strips when no kits exist', () => {
      mockUseKits.mockReturnValue({
        data: { kits: [], total: 0, page: 1, total_pages: 1, status_counts: {} },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useKits>);
      render(<DashboardPage />);

      const strip = screen.getByText('Kits by Type').nextElementSibling as HTMLElement;
      const row = strip.firstElementChild!;
      const tile = (label: string) =>
        [...row.children].find((el) => el.textContent?.includes(label)) as HTMLElement;
      expect(tile('Total')).toHaveTextContent('0');
      expect(tile('Remote')).toHaveTextContent('0 available');
    });
  });
});

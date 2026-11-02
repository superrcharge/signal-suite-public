import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { renderWithRoute, screen, within } from '@/test/utils';
import { OperationsPage } from './operations-page';
import { useOperations } from '@/services';

// Closed mock - every hook the render tree pulls must be listed, including the
// sidebar/header hooks MainLayout mounts and the drawer's own mutations.
vi.mock('@/services', () => ({
  useOperations: vi.fn(),
  useCreateOperation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateOperation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteOperation: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveOperationPhases: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveOperationSites: () => ({ mutate: vi.fn(), isPending: false }),
  useSections: () => ({
    data: [{ key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true }],
    isLoading: false,
  }),
  useCreateSection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useTerminals: () => ({ data: undefined, isLoading: false }),
  useKits: () => ({ data: undefined, isLoading: false }),
  useContracts: () => ({ data: undefined, isLoading: false }),
  useContractFiscalYears: () => ({ data: [] }),
  useLogout: () => ({ mutate: vi.fn() }),
  REASSIGN_TO_NONE: '__none__',
}));

let canWritePace = true;
const authState = () => ({
  canWrite: true,
  canWriteRadio: true,
  canWritePace,
  isAdmin: true,
  role: 'admin',
  user: { name: 'Tester' },
});

vi.mock('@/contexts', async () => ({
  ...(await vi.importActual('@/contexts')),
  useAuth: () => authState(),
  useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('@/contexts/auth-context', async () => ({
  ...(await vi.importActual('@/contexts/auth-context')),
  useAuth: () => authState(),
}));

const mockUseOperations = vi.mocked(useOperations);

beforeEach(() => {
  vi.clearAllMocks();
  canWritePace = true;
  mockUseOperations.mockReturnValue({
    data: {
      operations: [
        {
          id: 'op-1',
          name: 'Operation Avalanche',
          acronym: '',
          status: 'active',
          start_date: '2026-10-01',
          end_date: '',
          notes: '',
          created_by: '',
          updated_by: '',
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
          participant_count: 0,
        },
      ],
      total: 1,
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useOperations>);
});

const renderPage = (route = '/operations') => {
  renderWithRoute(<OperationsPage />, route);
  return within(screen.getByRole('main'));
};

describe('OperationsPage', () => {
  it('shows the title and the picker', () => {
    const page = renderPage();
    expect(page.getByRole('heading', { name: /operations/i })).toBeInTheDocument();
    // The tile drops the leading word "Operation" from the name.
    expect(page.getByText('Avalanche')).toBeInTheDocument();
    expect(page.queryByText('Operation Avalanche')).toBeNull();
  });

  it('offers Add Operation to a PACE writer', () => {
    const page = renderPage();
    expect(page.getByRole('button', { name: 'Add Operation' })).toBeInTheDocument();
  });

  it('hides Add Operation from a viewer', () => {
    canWritePace = false;
    const page = renderPage();
    expect(page.queryByRole('button', { name: 'Add Operation' })).toBeNull();
    expect(page.getByText('Avalanche')).toBeInTheDocument();
  });

  it('opens the drawer from the Add button', async () => {
    const user = userEvent.setup();
    const page = renderPage();
    await user.click(page.getByRole('button', { name: 'Add Operation' }));
    expect(await screen.findByRole('heading', { name: 'Add Operation' })).toBeInTheDocument();
  });

  it('opens the drawer from ?drawer=add for a writer', async () => {
    renderWithRoute(<OperationsPage />, '/operations?drawer=add');
    expect(await screen.findByRole('heading', { name: 'Add Operation' })).toBeInTheDocument();
  });

  it('never opens the drawer for a viewer', () => {
    canWritePace = false;
    renderPage('/operations?drawer=add');
    expect(screen.queryByRole('heading', { name: 'Add Operation' })).toBeNull();
  });

  it('opens the edit drawer for a known id', async () => {
    renderWithRoute(<OperationsPage />, '/operations?drawer=edit&id=op-1');
    expect(await screen.findByRole('heading', { name: 'Edit Operation' })).toBeInTheDocument();
  });
});

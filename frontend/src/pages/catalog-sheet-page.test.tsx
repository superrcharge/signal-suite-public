import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithRoute, screen } from '@/test/utils';
import { CatalogSheetPage } from './catalog-sheet-page';
import type { Equipment } from '@/types';

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useParams: () => ({ id: '00000000-0000-0000-0000-000000000000' }),
  useNavigate: () => vi.fn(),
}));

// Query state the tests move around, set in beforeEach or the test body.
let itemState: { data: Equipment | undefined; isLoading: boolean; isError: boolean };

// Closed mock - every hook the render tree pulls must be listed, including the
// sidebar/header hooks MainLayout mounts.
vi.mock('@/services', () => ({
  useEquipment: () => ({ data: { equipment: [], total: 0 }, isLoading: false }),
  useEquipmentItem: () => itemState,
  // MainLayout: sidebar, header and the section dialog
  useSections: () => ({ data: undefined, isLoading: false }),
  useContractFiscalYears: () => ({ data: [] }),
  useOperations: () => ({ data: undefined, isLoading: false, isError: false }),
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useTerminals: () => ({ data: undefined, isLoading: false }),
  useKits: () => ({ data: undefined, isLoading: false }),
  useContracts: () => ({ data: undefined, isLoading: false }),
  useLogout: () => ({ mutate: vi.fn() }),
  REASSIGN_TO_NONE: '__none__',
}));

type Role = 'admin' | 'rto' | 'viewer';
// Which role the mocked auth reports, set in beforeEach or the test body.
let authRole: Role;
const authFor = (role: Role) => ({
  user: { id: '1', name: 'Test User', email: 'test@test.com', roles: [role] },
  isAuthenticated: true, isLoading: false, isError: false,
  role, isAdmin: role === 'admin', canWrite: role === 'admin', canWriteRadio: role !== 'viewer',
  canWritePace: role !== 'viewer',
  refetch: vi.fn(),
});
vi.mock('@/contexts', async () => ({
  ...(await vi.importActual('@/contexts')),
  useAuth: () => authFor(authRole),
  useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }),
}));
vi.mock('@/contexts/auth-context', async () => ({
  ...(await vi.importActual('@/contexts/auth-context')),
  useAuth: () => authFor(authRole),
}));

const record = (terminal_type: 'satcom' | 'radio'): Equipment => ({
  id: '00000000-0000-0000-0000-000000000000',
  nomenclature: terminal_type === 'radio' ? 'AN/PRC-152' : 'GATR-2',
  terminal_type,
  operational_mode: [],
  data: { services: [], waveforms: [] },
  created_by: 't', updated_by: 't', created_at: '', updated_at: '',
} as unknown as Equipment);

const renderSheet = () =>
  renderWithRoute(<CatalogSheetPage />, '/catalog/00000000-0000-0000-0000-000000000000');

beforeEach(() => {
  itemState = { data: undefined, isLoading: true, isError: false };
  authRole = 'admin';
});

// An id that resolves to nothing used to keep Edit, Full Screen, the export
// menu and Print live beside "Equipment not found.", each of which led to a
// second not-found page.
describe('CatalogSheetPage document actions', () => {
  it('offers nothing to edit, open or print for an id that does not exist', () => {
    itemState = { data: undefined, isLoading: false, isError: true };
    renderSheet();

    expect(screen.getByText('Equipment not found.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit this record/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open full-screen/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print \/ save pdf/i })).toBeDisabled();
  });

  it('keeps them in place while the item loads, so they do not pop in once it lands', () => {
    renderSheet();

    expect(screen.getByRole('button', { name: /edit this record/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open full-screen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print \/ save pdf/i })).toBeEnabled();
  });
});

// Edit follows the editor's own rule, which reads the record as well as the
// user: an rto edits radio records only. It used to read canWrite alone, so an
// rto never saw Edit on a radio sheet the backend, the editor rail and the
// help all say they can edit.
describe('CatalogSheetPage Edit, by role and record', () => {
  // jsdom implements no FontFaceSet, and a loaded record measures itself once
  // the fonts are in. Same fixture catalog-compare-print-page.test.tsx uses.
  beforeEach(() => {
    if (!document.fonts) {
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { ready: Promise.resolve() },
      });
    }
  });

  it('offers an rto Edit on a radio record', () => {
    authRole = 'rto';
    itemState = { data: record('radio'), isLoading: false, isError: false };
    renderSheet();

    expect(screen.getByRole('button', { name: /edit this record/i })).toBeInTheDocument();
  });

  it('offers an rto no Edit on a SATCOM record, which only reaches a refusal', () => {
    authRole = 'rto';
    itemState = { data: record('satcom'), isLoading: false, isError: false };
    renderSheet();

    expect(screen.queryByRole('button', { name: /edit this record/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open full-screen/i })).toBeInTheDocument();
  });

  it('offers a viewer no Edit on either kind of record', () => {
    authRole = 'viewer';
    for (const kind of ['radio', 'satcom'] as const) {
      itemState = { data: record(kind), isLoading: false, isError: false };
      const { unmount } = renderSheet();

      expect(screen.queryByRole('button', { name: /edit this record/i })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('offers an admin Edit on a SATCOM record', () => {
    itemState = { data: record('satcom'), isLoading: false, isError: false };
    renderSheet();

    expect(screen.getByRole('button', { name: /edit this record/i })).toBeInTheDocument();
  });
});

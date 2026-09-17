import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithRoute, screen, fireEvent, within } from '@/test/utils';
import { KitsPage } from './kits-page';
import type { Kit } from '@/types';

// Closed mock - every hook the render tree pulls must be listed, including the
// sidebar/header hooks MainLayout mounts and the drawer's own mutations.
vi.mock('@/services', () => ({
  useKits: vi.fn(),
  useKit: vi.fn(),
  useCreateKit: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateKit: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteKit: () => ({ mutate: vi.fn(), isPending: false }),
  useSections: () => ({
    data: [{ key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true }],
    isLoading: false,
  }),
  useCreateSection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useTerminals: () => ({ data: undefined, isLoading: false }),
  useContracts: () => ({ data: undefined, isLoading: false }),
  useContractFiscalYears: () => ({ data: [] }),
  useLogout: () => ({ mutate: vi.fn() }),
  REASSIGN_TO_NONE: '__none__',
}));

const authState = () => ({
  canWrite: true,
  canWriteRadio: true,
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

import { useKits, useKit } from '@/services';
const mockUseKits = vi.mocked(useKits);
const mockUseKit = vi.mocked(useKit);

function kit(over: Partial<Kit> = {}): Kit {
  return {
    id: 'on-page',
    name: 'KIT-001',
    type: 'remote',
    status: 'available',
    black: false,
    secret: false,
    topsecret: false,
    section: 'asqd',
    owner: null,
    owner_email: null,
    owner_phone: null,
    location: '',
    notes: '',
    updated_by: 'someone',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

function listReturns(kits: Kit[]) {
  mockUseKits.mockReturnValue({
    data: { kits, total: kits.length, total_pages: 1 },
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useKits>);
}

function byIdReturns(found: Kit | undefined, isLoading = false) {
  mockUseKit.mockReturnValue({
    data: found,
    isLoading,
  } as unknown as ReturnType<typeof useKit>);
}

beforeEach(() => {
  vi.clearAllMocks();
  listReturns([kit()]);
  byIdReturns(undefined);
});

/**
 * The drawer reads a missing kit as Add mode, so an edit URL the page cannot
 * resolve used to present a blank Add Kit form at an edit URL - with no Delete,
 * and submitting it created a duplicate instead of editing. Nets was fixed for
 * this; terminals and kits were missed.
 */
describe('edit deep-link resolution', () => {
  it('opens an edit deep-link for a kit on the current page', () => {
    renderWithRoute(<KitsPage />, '/kits?drawer=edit&id=on-page');

    expect(screen.getByRole('heading', { name: 'Edit Kit' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('resolves a kit absent from the current page by id', () => {
    // The list is paginated, so a deep link can name a kit that exists and is
    // simply not on this page. That must open, not report a deletion.
    byIdReturns(kit({ id: 'other-page', name: 'KIT-099' }));
    renderWithRoute(<KitsPage />, '/kits?drawer=edit&id=other-page');

    expect(screen.getByRole('heading', { name: 'Edit Kit' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not fall through to an Add form when the id no longer resolves', () => {
    renderWithRoute(<KitsPage />, '/kits?drawer=edit&id=deleted');

    expect(screen.queryByRole('heading', { name: 'Add Kit' })).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/no longer exists/);
  });

  it('waits for the record rather than guessing while it loads', () => {
    mockUseKits.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useKits>);
    byIdReturns(undefined, true);
    renderWithRoute(<KitsPage />, '/kits?drawer=edit&id=on-page');

    expect(screen.queryByRole('heading', { name: 'Add Kit' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('leaves the add drawer alone', () => {
    renderWithRoute(<KitsPage />, '/kits?drawer=add');

    expect(screen.getByRole('heading', { name: 'Add Kit' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/**
 * Mirrors the terminals-page suite of the same name. The type filter used to
 * live in local state while being re-synced from ?type= by an effect keyed on
 * the whole searchParams object, so the row Edit button - which writes
 * drawer=edit&id= - replayed a stale ?type= and changed the list behind the
 * drawer. The URL is now the source of truth.
 */
describe('list filter survives the edit drawer', () => {
  const lastQuery = () => mockUseKits.mock.lastCall?.[0];
  // hidden: true because an open MUI Drawer is a modal - it aria-hides
  // everything behind it, which is exactly the toolbar being asserted on.
  const typeButton = (name: string) =>
    within(screen.getByRole('group', { name: 'Type filter', hidden: true }))
      .getByRole('button', { name, hidden: true });

  it('does not resurrect a stale ?type= when the drawer opens', () => {
    renderWithRoute(<KitsPage />, '/kits?type=remote');
    fireEvent.click(typeButton('All'));
    expect(lastQuery()).toMatchObject({ type: undefined });

    fireEvent.click(screen.getByRole('button', { name: 'edit KIT-001' }));

    expect(screen.getByRole('heading', { name: 'Edit Kit' })).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ type: undefined });
    expect(typeButton('All')).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not clear a filter selected after mount when the drawer opens', () => {
    renderWithRoute(<KitsPage />, '/kits');
    fireEvent.click(typeButton('Remote'));
    expect(lastQuery()).toMatchObject({ type: 'remote' });

    fireEvent.click(screen.getByRole('button', { name: 'edit KIT-001' }));

    expect(lastQuery()).toMatchObject({ type: 'remote' });
    expect(typeButton('Remote')).toHaveAttribute('aria-pressed', 'true');
  });

  it('still applies a ?type= deep link on arrival', () => {
    renderWithRoute(<KitsPage />, '/kits?type=remote');

    expect(lastQuery()).toMatchObject({ type: 'remote' });
    expect(typeButton('Remote')).toHaveAttribute('aria-pressed', 'true');
    expect(typeButton('All')).toHaveAttribute('aria-pressed', 'false');
  });
});

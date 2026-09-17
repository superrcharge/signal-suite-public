import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithRoute, screen, fireEvent, within } from '@/test/utils';
import { TerminalsPage } from './terminals-page';
import type { Terminal } from '@/types';

// Closed mock - every hook the render tree pulls must be listed, including the
// sidebar/header hooks MainLayout mounts and the drawer's own mutations.
vi.mock('@/services', () => ({
  useTerminals: vi.fn(),
  useTerminal: vi.fn(),
  useTerminalTags: () => ({ data: [] }),
  useCreateTerminal: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTerminal: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteTerminal: () => ({ mutate: vi.fn(), isPending: false }),
  useSections: () => ({
    data: [{ key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true }],
    isLoading: false,
  }),
  useCreateSection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // The drawer mounts inside this page and now reads the tag catalog.
  useTags: () => ({ data: [], isLoading: false }),
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useKits: () => ({ data: undefined, isLoading: false }),
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

// The page reads useAuth from '@/contexts/auth-context'; the header MainLayout
// mounts reads useAuth and useThemeMode from the '@/contexts' barrel.
vi.mock('@/contexts', async () => ({
  ...(await vi.importActual('@/contexts')),
  useAuth: () => authState(),
  useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('@/contexts/auth-context', async () => ({
  ...(await vi.importActual('@/contexts/auth-context')),
  useAuth: () => authState(),
}));

import { useTerminals, useTerminal } from '@/services';
const mockUseTerminals = vi.mocked(useTerminals);
const mockUseTerminal = vi.mocked(useTerminal);

function terminal(over: Partial<Terminal> = {}): Terminal {
  return {
    id: 'on-page',
    name: 'OW-10-001',
    model: 'ow10',
    kit: '',
    pim: '',
    serial: 'SN-1',
    section: 'asqd',
    status: 'available',
    owner: '',
    owner_email: '',
    owner_phone: '',
    pop_pin: '',
    notes: '',
    tag: '',
    updated_by: 'someone',
    updated_at: '2026-09-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    ...over,
  };
}

function listReturns(terminals: Terminal[]) {
  mockUseTerminals.mockReturnValue({
    data: { terminals, total: terminals.length, total_pages: 1 },
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useTerminals>);
}

function byIdReturns(found: Terminal | undefined, isLoading = false) {
  mockUseTerminal.mockReturnValue({
    data: found,
    isLoading,
  } as unknown as ReturnType<typeof useTerminal>);
}

beforeEach(() => {
  vi.clearAllMocks();
  listReturns([terminal()]);
  byIdReturns(undefined);
});

/**
 * The drawer reads a missing terminal as Add mode, so an edit URL the page
 * cannot resolve used to present a blank Add Terminal form at an edit URL -
 * with no Delete, and submitting it created a duplicate instead of editing.
 * Nets was fixed for this; terminals and kits were missed.
 */
describe('edit deep-link resolution', () => {
  it('opens an edit deep-link for a terminal on the current page', () => {
    renderWithRoute(<TerminalsPage />, '/terminals?drawer=edit&id=on-page');

    expect(screen.getByRole('heading', { name: 'Edit Terminal' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('resolves a terminal absent from the current page by id', () => {
    // The list is paginated, so a deep link can name a terminal that exists and
    // is simply not on this page. That must open, not report a deletion.
    byIdReturns(terminal({ id: 'other-page', name: 'OW-11-004' }));
    renderWithRoute(<TerminalsPage />, '/terminals?drawer=edit&id=other-page');

    expect(screen.getByRole('heading', { name: 'Edit Terminal' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not fall through to an Add form when the id no longer resolves', () => {
    renderWithRoute(<TerminalsPage />, '/terminals?drawer=edit&id=deleted');

    expect(screen.queryByRole('heading', { name: 'Add Terminal' })).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/no longer exists/);
  });

  it('waits for the record rather than guessing while it loads', () => {
    // Mid-load the page holds nothing and the by-id fetch has not answered, so
    // every edit deep-link looks unresolvable. Claiming a deletion here would
    // flash the warning on every load.
    mockUseTerminals.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useTerminals>);
    byIdReturns(undefined, true);
    renderWithRoute(<TerminalsPage />, '/terminals?drawer=edit&id=on-page');

    expect(screen.queryByRole('heading', { name: 'Add Terminal' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('leaves the add drawer alone', () => {
    renderWithRoute(<TerminalsPage />, '/terminals?drawer=add');

    expect(screen.getByRole('heading', { name: 'Add Terminal' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/**
 * The variant filter used to live in local state while being re-synced from
 * ?model= by an effect keyed on the whole searchParams object. Because the row
 * Edit button writes drawer=edit&id= to the URL, opening the drawer re-fired
 * that effect and replayed whatever stale ?model= the URL still carried - so
 * the user came back from the drawer looking at a different list than the one
 * they left. The URL is now the source of truth, and these lock that in.
 */
describe('list filter survives the edit drawer', () => {
  const lastQuery = () => mockUseTerminals.mock.lastCall?.[0];
  // hidden: true because an open MUI Drawer is a modal - it aria-hides
  // everything behind it, which is exactly the toolbar being asserted on.
  const variantButton = (name: string) =>
    within(screen.getByRole('group', { name: 'Variant filter', hidden: true }))
      .getByRole('button', { name, hidden: true });

  it('does not resurrect a stale ?model= when the drawer opens', () => {
    // Arrive from a sidebar model link, then widen the list to All.
    renderWithRoute(<TerminalsPage />, '/terminals?model=mini');
    fireEvent.click(variantButton('All'));
    expect(lastQuery()).toMatchObject({ model: undefined });

    fireEvent.click(screen.getByRole('button', { name: 'edit OW-10-001' }));

    expect(screen.getByRole('heading', { name: 'Edit Terminal' })).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ model: undefined });
    expect(variantButton('All')).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not clear a filter selected after mount when the drawer opens', () => {
    // The mirror case: no ?model= in the URL, so the stale value replayed was
    // "no filter" and opening the drawer wiped the user's selection instead.
    renderWithRoute(<TerminalsPage />, '/terminals');
    fireEvent.click(variantButton('Mini'));
    expect(lastQuery()).toMatchObject({ model: 'mini' });

    fireEvent.click(screen.getByRole('button', { name: 'edit OW-10-001' }));

    expect(lastQuery()).toMatchObject({ model: 'mini' });
    expect(variantButton('Mini')).toHaveAttribute('aria-pressed', 'true');
  });

  it('still applies a ?model= deep link on arrival', () => {
    // What the removed effect existed to serve (2cefa7c7) - a sidebar model
    // link must filter the list and light up its toggle.
    renderWithRoute(<TerminalsPage />, '/terminals?model=mini');

    expect(lastQuery()).toMatchObject({ model: 'mini' });
    expect(variantButton('Mini')).toHaveAttribute('aria-pressed', 'true');
    expect(variantButton('All')).toHaveAttribute('aria-pressed', 'false');
  });
});

/**
 * The message under "No terminals found" used to consider only the search term
 * and the status filter, so a variant filter that matched nothing announced
 * "No terminals have been added yet" over a table holding plenty of rows.
 * Observed with 13 terminals in the database and ?model=mini matching none.
 */
describe('empty-state description', () => {
  it('blames the variant filter rather than claiming nothing exists', () => {
    listReturns([]);
    renderWithRoute(<TerminalsPage />, '/terminals?model=mini');

    expect(screen.getByText(/match the current variant filter/i)).toBeInTheDocument();
    expect(screen.queryByText(/have been added yet/i)).toBeNull();
  });

  it('still reports a genuinely empty dataset', () => {
    listReturns([]);
    renderWithRoute(<TerminalsPage />, '/terminals');

    expect(screen.getByText(/No terminals have been added yet/i)).toBeInTheDocument();
  });
});

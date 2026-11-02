import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';

import { renderWithRoute, screen, within } from '@/test/utils';
import { NetsPage } from './nets-page';
import { NetsPrintPage } from './nets-print-page';

const { mockParams, mockNavigate, createMutate } = vi.hoisted(() => ({
  mockParams: { section: 'asqd' },
  mockNavigate: vi.fn(),
  createMutate: vi.fn(),
}));

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
}));
import type { Net } from '@/types';

// Closed mock - every hook the render tree pulls must be listed, including the
// sidebar/header hooks MainLayout mounts.
vi.mock('@/services', () => ({
  useNets: vi.fn(),
  useSections: () => ({
    data: [
      { key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true },
      { key: 'bsqd', label: 'B SQD', color: '#fff', pace_enabled: true },
    ],
    isLoading: false,
  }),
  useCreateNet: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateNet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteNet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTerminals: () => ({ data: undefined, isLoading: false }),
  useKits: () => ({ data: undefined, isLoading: false }),
  useContracts: () => ({ data: undefined, isLoading: false }),
  useEquipment: vi.fn(),
  useWaveforms: () => ({ data: { waveforms: [], total: 0 } }),
  useServices: () => ({ data: { services: [], total: 0 } }),
  useLogout: () => ({ mutate: vi.fn() }),
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useContractFiscalYears: () => ({ data: [] }),
  useOperations: () => ({ data: undefined, isLoading: false, isError: false }),
  REASSIGN_TO_NONE: '__none__',
}));

let mockCanWritePace = true;
const authState = () => ({
  canWrite: false,
  canWriteRadio: true,
  canWritePace: mockCanWritePace,
  isAdmin: false,
  role: 'rto',
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

import { useNets } from '@/services';
const mockUseNets = vi.mocked(useNets);

function net(over: Partial<Net> = {}): Net {
  return {
    id: 'id-1',
    section: 'asqd',
    name: 'NET 1',
    net_id: 'N01',
    radio_type: 'jem',
    theater: 'conus',
    tx_freq: '31.6875',
    rx_freq: '31.6875',
    freq_unit: 'MHz',
    roip: false,
    description: '',
    notes: '',
    created_by: '',
    updated_by: '',
    created_at: '',
    updated_at: '',
    ...over,
  };
}

const NETS = [
  net({ id: 'a', name: 'JEM ONLY', radio_type: 'jem' }),
  net({ id: 'b', name: 'MPU5 ONLY', radio_type: 'mpu5' }),
  net({ id: 'c', name: 'SHARED', radio_type: 'both', roip: true }),
];

beforeEach(() => {
  vi.clearAllMocks();
  createMutate.mockResolvedValue(undefined);
  mockCanWritePace = true;
  mockUseNets.mockReturnValue({
    data: { nets: NETS, total: NETS.length },
    isLoading: false,
  } as ReturnType<typeof useNets>);
});

describe('NetsPage', () => {
  it('defaults to the JEM tab', () => {
    renderWithRoute(<NetsPage />, '/nets/asqd');
    expect(screen.getByText('JEM ONLY')).toBeInTheDocument();
    expect(screen.queryByText('MPU5 ONLY')).toBeNull();
  });

  it('filters to MPU5 nets when that tab is selected', () => {
    renderWithRoute(<NetsPage />, '/nets/asqd?radio=mpu5');
    expect(screen.getByText('MPU5 ONLY')).toBeInTheDocument();
    expect(screen.queryByText('JEM ONLY')).toBeNull();
  });

  it('shows a shared net under both tabs rather than duplicating it', () => {
    renderWithRoute(<NetsPage />, '/nets/asqd');
    expect(screen.getAllByText('SHARED')).toHaveLength(1);
  });

  it('counts each radio including shared nets', () => {
    renderWithRoute(<NetsPage />, '/nets/asqd');
    // 1 jem + 1 both, and 1 mpu5 + 1 both.
    expect(screen.getByRole('tab', { name: /JEM Nets \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /MPU5 Nets \(2\)/ })).toBeInTheDocument();
  });

  it('marks which nets are ROIP', () => {
    renderWithRoute(<NetsPage />, '/nets/asqd');
    expect(screen.getAllByLabelText('ICE').length).toBeGreaterThan(0);
  });





  it('heads the identifier column Channel #, not Net ID', () => {
    // A row carries both `name` and `net_id`, and calling the second one an ID
    // made one net look like it spanned two values. The stored field is still
    // net_id -- only what an operator reads changed.
    renderWithRoute(<NetsPage />, '/nets/asqd');
    expect(screen.getByRole('columnheader', { name: 'Channel #' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Net ID' })).not.toBeInTheDocument();
  });

  it('gives an rto the edit and delete controls', () => {
    // This is the whole point of the feature: rto is the role it is built for,
    // and gating on canWrite (admin/editor only) hid every control from them.
    renderWithRoute(<NetsPage />, '/nets/asqd');
    expect(screen.getByLabelText('edit JEM ONLY')).toBeInTheDocument();
    expect(screen.getByLabelText('delete JEM ONLY')).toBeInTheDocument();
  });

  it('hides write controls from a read-only user', () => {
    mockCanWritePace = false;
    renderWithRoute(<NetsPage />, '/nets/asqd');
    expect(screen.queryByLabelText('edit JEM ONLY')).toBeNull();
    expect(screen.queryByLabelText('delete JEM ONLY')).toBeNull();
  });

  it('renders the frequency the same way the wheel does', () => {
    renderWithRoute(<NetsPage />, '/nets/asqd');
    const row = screen.getByText('JEM ONLY').closest('tr')!;
    expect(within(row).getByText('31.6875 MHz')).toBeInTheDocument();
  });

  it('offers Add Net from the nets page', async () => {
    // Add Net lives in the header's `+` menu rather than on this page, so
    // reaching it costs a click. The page itself has never had an add button -
    // its empty state points at the header.
    renderWithRoute(<NetsPage />, '/nets/asqd');
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    expect(screen.getByRole('menuitem', { name: /Add Net/ })).toBeInTheDocument();
  });

  describe('edit drawer', () => {
    it('keeps the radio tab when an edit drawer is opened', async () => {
      // The drawer params are merged into the query string, not swapped for it:
      // dropping `radio` snapped the list behind the drawer back to JEM.
      const user = userEvent.setup();
      renderWithRoute(<NetsPage />, '/nets/asqd?radio=mpu5');

      await user.click(screen.getByLabelText('edit MPU5 ONLY'));

      // The drawer is modal, so the tabs behind it are aria-hidden; which tab
      // stayed selected is still readable from the rows the table holds.
      expect(screen.getByRole('heading', { name: 'Edit Net' })).toBeInTheDocument();
      expect(screen.getByText('MPU5 ONLY')).toBeInTheDocument();
      expect(screen.queryByText('JEM ONLY')).toBeNull();
    });

    it('opens an edit deep-link for a net that belongs to the other tab', () => {
      renderWithRoute(<NetsPage />, '/nets/asqd?drawer=edit&id=b');
      expect(screen.getByRole('heading', { name: 'Edit Net' })).toBeInTheDocument();
    });

    it('does not fall through to an Add form when the id no longer resolves', () => {
      // The drawer reads net === null as Add mode, so a stale edit link used to
      // present a blank Add Net form at an edit URL - and submitting it created
      // a duplicate instead of editing anything.
      renderWithRoute(<NetsPage />, '/nets/asqd?drawer=edit&id=deleted');
      expect(screen.queryByRole('heading', { name: 'Add Net' })).toBeNull();
      expect(screen.getByRole('alert')).toHaveTextContent(/no longer exists/);
    });

    it('waits for the list rather than guessing while it loads', () => {
      // Mid-load allNets is empty, so every edit deep-link looks unresolvable.
      mockUseNets.mockReturnValue({
        data: undefined,
        isLoading: true,
      } as ReturnType<typeof useNets>);
      renderWithRoute(<NetsPage />, '/nets/asqd?drawer=edit&id=a');

      expect(screen.queryByRole('heading', { name: 'Add Net' })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('add drawer', () => {
    it('tells a viewer why an add deep-link opened nothing', () => {
      // An add URL is shareable, so a viewer can arrive at one from an rto's
      // link. The drawer is gated shut on them, and silence reads as a broken
      // page rather than as a permission boundary.
      mockCanWritePace = false;
      renderWithRoute(<NetsPage />, '/nets/asqd?drawer=add');

      expect(screen.queryByRole('heading', { name: 'Add Net' })).toBeNull();
      expect(screen.getByRole('alert')).toHaveTextContent(/do not have permission to add nets/);
    });

    it('still opens the add drawer for an rto', () => {
      renderWithRoute(<NetsPage />, '/nets/asqd?drawer=add');

      expect(screen.getByRole('heading', { name: 'Add Net' })).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('empty state', () => {
    function empty() {
      mockUseNets.mockReturnValue({
        data: { nets: [] as Net[], total: 0 },
        isLoading: false,
      } as ReturnType<typeof useNets>);
    }

    it('points a writer at Add Net', () => {
      empty();
      renderWithRoute(<NetsPage />, '/nets/asqd');

      expect(screen.getByText(/No CONUS JEM nets yet. Use Add Net/)).toBeInTheDocument();
    });

    it('does not point a viewer at a button they do not have', () => {
      // canWritePace hides Add Net from the header, so an ungated hint would
      // send a viewer looking for something that is not on their screen.
      empty();
      mockCanWritePace = false;
      renderWithRoute(<NetsPage />, '/nets/asqd');

      expect(screen.getByText('No CONUS JEM nets yet.')).toBeInTheDocument();
      expect(screen.queryByText(/Use Add Net/)).toBeNull();
    });
  });
});

describe('NetsPage document actions', () => {
  it('offers share and Print / Save PDF, and Print opens the print route for the open radio tab', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderWithRoute(<NetsPage />, '/nets/asqd?radio=mpu5');

    expect(screen.getByRole('button', { name: 'share this sheet' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Print / Save PDF' }));
    expect(String(open.mock.calls[0]?.[0])).toBe('/nets/asqd/print?radio=mpu5');
    open.mockRestore();
  });
});

describe('NetsPrintPage', () => {
  it('prints the open radio tab read only: rows, no Actions column, no pencils', () => {
    renderWithRoute(<NetsPrintPage />, '/nets/asqd/print?radio=jem');
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeInTheDocument();
  });
});

describe('NetsPage theater', () => {
  const Probe = () => {
    const loc = useLocation();
    return <output data-testid="location">{loc.pathname + loc.search}</output>;
  };
  const withTheaters = () => {
    mockUseNets.mockReturnValue({
      data: {
        nets: [
          ...NETS,
          net({ id: 'oc', name: 'OCONUS ONLY', radio_type: 'jem', theater: 'oconus' }),
          net({ id: 'bt', name: 'EVERYWHERE', radio_type: 'jem', theater: 'both' }),
        ],
        total: 5,
      },
      isLoading: false,
    } as ReturnType<typeof useNets>);
  };

  it('lists CONUS by default, with a both net in either list and a Theater column', () => {
    withTheaters();
    renderWithRoute(<NetsPage />, '/nets/asqd');

    expect(screen.getByRole('columnheader', { name: 'Theater' })).toBeInTheDocument();
    expect(screen.getByText('JEM ONLY')).toBeInTheDocument();
    expect(screen.getByText('EVERYWHERE')).toBeInTheDocument();
    expect(screen.queryByText('OCONUS ONLY')).toBeNull();
    // Two CONUS JEM-carried nets (JEM ONLY, SHARED) plus the both-theater one.
    expect(screen.getByRole('tab', { name: /JEM Nets \(3\)/ })).toBeInTheDocument();
  });

  it('lists OCONUS under ?theater=oconus and counts within it', () => {
    withTheaters();
    renderWithRoute(<NetsPage />, '/nets/asqd?theater=oconus');

    expect(screen.getByText('OCONUS ONLY')).toBeInTheDocument();
    expect(screen.getByText('EVERYWHERE')).toBeInTheDocument();
    expect(screen.queryByText('JEM ONLY')).toBeNull();
    expect(screen.getByRole('tab', { name: /JEM Nets \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /MPU5 Nets \(0\)/ })).toBeInTheDocument();
  });

  it('the switch keeps the radio tab and deletes the default', async () => {
    const user = userEvent.setup();
    withTheaters();
    renderWithRoute(<><NetsPage /><Probe /></>, '/nets/asqd?radio=mpu5');

    await user.click(screen.getByRole('button', { name: 'OCONUS' }));
    expect(screen.getByTestId('location').textContent).toBe('/nets/asqd?radio=mpu5&theater=oconus');
    await user.click(screen.getByRole('button', { name: 'CONUS' }));
    expect(screen.getByTestId('location').textContent).toBe('/nets/asqd?radio=mpu5');
  });

  it('Print carries both the radio and the theater', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderWithRoute(<NetsPage />, '/nets/asqd?radio=mpu5&theater=oconus');

    await user.click(screen.getByRole('button', { name: 'Print / Save PDF' }));
    expect(String(open.mock.calls[0]?.[0])).toBe('/nets/asqd/print?radio=mpu5&theater=oconus');
    open.mockRestore();
  });

  it('opens the add drawer in the theater on screen', () => {
    renderWithRoute(<NetsPage />, '/nets/asqd?theater=oconus&drawer=add');

    const theaterGroup = within(screen.getByRole('dialog')).getByRole('group', { name: 'Theater' });
    expect(within(theaterGroup).getByRole('button', { name: 'OCONUS' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('prints the theater in the read-only heading', () => {
    withTheaters();
    renderWithRoute(<NetsPrintPage />, '/nets/asqd/print?radio=jem&theater=oconus');
    expect(screen.getByText('A SQD - Nets Library - OCONUS JEM')).toBeInTheDocument();
    expect(screen.getByText('OCONUS ONLY')).toBeInTheDocument();
    expect(screen.queryByText('JEM ONLY')).toBeNull();
  });
});

describe('NetsPage after Create', () => {
  // A net that was created and is nowhere on screen reads as one that was
  // lost. Two ways that happened: the drawer filed it under another squadron,
  // or gave it a radio or theater the list on screen was filtering out. Each
  // case lands the page where the new net is visible.
  const create = async (route: string, pick: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) => {
    const user = userEvent.setup();
    renderWithRoute(<NetsPage />, route);
    const drawer = within(screen.getByRole('dialog'));
    await user.type(drawer.getByLabelText(/Name/), 'FIRES');
    await pick(user);
    await user.click(drawer.getByRole('button', { name: 'Create' }));
    return user;
  };

  it('lands on the squadron the net was filed under, and names it', async () => {
    const user = userEvent.setup();
    renderWithRoute(<NetsPage />, '/nets/asqd?drawer=add');
    const drawer = within(screen.getByRole('dialog'));

    await user.click(drawer.getByRole('combobox', { name: /Squadron/ }));
    await user.click(screen.getByRole('option', { name: 'B SQD' }));
    await user.type(drawer.getByLabelText(/Name/), 'FIRES');
    await user.click(drawer.getByRole('button', { name: 'Create' }));

    expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({ section: 'bsqd' }));
    expect(mockNavigate).toHaveBeenCalledWith('/nets/bsqd?radio=jem');
    expect(await screen.findByText('Net created in B SQD')).toBeInTheDocument();
  });

  it('switches to the MPU5 tab for an MPU5-only net created from the JEM tab', async () => {
    await create('/nets/asqd?drawer=add', async (user) => {
      await user.click(within(screen.getByRole('group', { name: 'Carried by' })).getByRole('button', { name: 'MPU5' }));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/nets/asqd?radio=mpu5');
  });

  it('switches to OCONUS for an OCONUS-only net created from CONUS', async () => {
    await create('/nets/asqd?drawer=add', async (user) => {
      await user.click(within(screen.getByRole('group', { name: 'Theater' })).getByRole('button', { name: 'OCONUS' }));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/nets/asqd?radio=jem&theater=oconus');
  });

  it('keeps the current tab and theater for a net carried by both', async () => {
    // A "both" net is visible under either value, so the list the user was
    // looking at is the one they get back, drawer closed.
    await create('/nets/asqd?radio=mpu5&theater=oconus&drawer=add', async (user) => {
      await user.click(within(screen.getByRole('group', { name: 'Theater' })).getByRole('button', { name: 'Both' }));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/nets/asqd?radio=mpu5&theater=oconus');
  });
});

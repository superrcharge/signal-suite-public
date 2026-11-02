import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, screen } from '@/test/utils';
import { renderWithRoute } from '@/test/utils';
import { Sidebar } from './sidebar';
import { useSections, useContractFiscalYears, useOperations } from '@/services';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

// SectionEditDialog renders inside the sidebar, so its hooks need mocking too.
vi.mock('@/services', () => ({
  useSections: vi.fn(),
  useContractFiscalYears: vi.fn(),
  useOperations: vi.fn(),
  useUpdateSection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const { auth } = vi.hoisted(() => ({
  auth: { current: { canWrite: true, canWriteRadio: true, isAdmin: true, role: 'admin', isPlanner: false, canSeeContracts: true, canSeeTrackers: true } },
}));

vi.mock('@/contexts/auth-context', async () => {
  const actual = await vi.importActual('@/contexts/auth-context');
  return {
    ...actual,
    useAuth: () => auth.current,
  };
});

const mockUseSections = vi.mocked(useSections);
const mockUseFiscalYears = vi.mocked(useContractFiscalYears);
const mockUseOperations = vi.mocked(useOperations);

const sections = [
  { key: 'noc', label: 'NOC', color: '#4caf50' },
  { key: 'field', label: 'Field', color: '#2196f3' },
];

function renderSidebar(route: string) {
  return renderWithRoute(
    <Sidebar open onClose={vi.fn()} width={240} isMobile={false} />,
    route,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    auth.current = { canWrite: true, canWriteRadio: true, isAdmin: true, role: 'admin', isPlanner: false, canSeeContracts: true, canSeeTrackers: true };
    mockUseSections.mockReturnValue({ data: sections } as ReturnType<typeof useSections>);
    mockUseFiscalYears.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useContractFiscalYears>);
    mockUseOperations.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useOperations>);
  });

  describe('All Terminals', () => {
    it('clears an active model filter instead of carrying it over', async () => {
      const user = userEvent.setup();
      renderSidebar('/terminals?model=ow7');

      await user.click(screen.getByText('All Terminals'));

      expect(navigateMock).toHaveBeenCalledWith('/terminals');
    });

    it('leaves the kits route rather than staying on it', async () => {
      const user = userEvent.setup();
      renderSidebar('/kits?type=remote');

      await user.click(screen.getByText('All Terminals'));

      expect(navigateMock).toHaveBeenCalledWith('/terminals');
    });

    it('clears an active section filter', async () => {
      const user = userEvent.setup();
      renderSidebar('/terminals?sections=noc,field');

      await user.click(screen.getByText('All Terminals'));

      expect(navigateMock).toHaveBeenCalledWith('/terminals');
    });
  });

  describe('All Kits', () => {
    // `allItem` does not use MUI's `selected` prop - unlike `navItem`, it signals
    // active purely by weighting its label to 700 and colouring it primary. So
    // that is what has to be asserted, and asserting Mui-selected here would
    // pass vacuously for every input.
    const isActive = (label: string) =>
      getComputedStyle(screen.getByText(label)).fontWeight === '700';

    it('is active on a bare /kits with nothing filtered', () => {
      renderSidebar('/kits');

      expect(isActive('All Kits')).toBe(true);
    });

    it('is not active while a type filter is applied', () => {
      renderSidebar('/kits?type=remote');

      expect(isActive('All Kits')).toBe(false);
    });

    // The regression this guards: the active test consulted activeKitType only,
    // so a section filter left "All Kits" lit at the same time as the section,
    // showing two mutually exclusive states as both current.
    it('is not active while a section filter is applied', () => {
      renderSidebar('/kits?sections=noc');

      expect(isActive('All Kits')).toBe(false);
      // The section itself is the thing that should read as current instead.
      // 'NOC' goes through `navItem`, which does use MUI's selected prop.
      expect(
        screen.getByText('NOC').closest('.MuiListItemButton-root')?.classList.contains('Mui-selected'),
      ).toBe(true);
    });

    it('is not active when a section and a type filter are both applied', () => {
      renderSidebar('/kits?sections=noc&type=remote');

      expect(isActive('All Kits')).toBe(false);
    });

    it('is not active from the terminals route', () => {
      renderSidebar('/terminals');

      expect(isActive('All Kits')).toBe(false);
    });
  });

  describe('All Sections', () => {
    it('keeps you on the route you are already viewing', async () => {
      const user = userEvent.setup();
      renderSidebar('/kits?sections=noc');

      // By Section is collapsed on first load; open it the way a user would.
      await user.click(screen.getByText('By Section:'));
      await user.click(screen.getByText('All Sections'));

      expect(navigateMock).toHaveBeenCalledWith('/kits');
    });

    it('preserves unrelated filters on the terminals route', async () => {
      const user = userEvent.setup();
      renderSidebar('/terminals?sections=noc&model=ow7');

      await user.click(screen.getByText('By Section:'));
      await user.click(screen.getByText('All Sections'));

      expect(navigateMock).toHaveBeenCalledWith('/terminals?model=ow7');
    });
  });

  // The planner role sees a planning-shaped sidebar. This hides nav; it denies
  // nothing - the reads behind these groups stay open to every role, which is
  // what authz_test.go asserts across all 30 GET routes.
  describe('planner navigation', () => {
    beforeEach(() => {
      auth.current = { canWrite: false, canWriteRadio: false, isAdmin: false, role: 'planner', isPlanner: true, canSeeContracts: false, canSeeTrackers: false };
    });

    it('keeps the catalog and PACE groups', () => {
      renderSidebar('/pace');

      expect(screen.getByText('Equipment Catalog')).toBeInTheDocument();
      expect(screen.getByText(/PACE Planning/)).toBeInTheDocument();
    });

    it('hides terminals, kits and by-section', () => {
      renderSidebar('/pace');

      expect(screen.queryByText('Terminals:')).toBeNull();
      expect(screen.queryByText('Kits:')).toBeNull();
      expect(screen.queryByText('By Section:')).toBeNull();
    });

    it('shows all three to an editor', () => {
      auth.current = { canWrite: true, canWriteRadio: true, isAdmin: false, role: 'editor', isPlanner: false, canSeeContracts: true, canSeeTrackers: true };
      renderSidebar('/terminals');

      expect(screen.getByText('Terminals:')).toBeInTheDocument();
      expect(screen.getByText('Kits:')).toBeInTheDocument();
      expect(screen.getByText('By Section:')).toBeInTheDocument();
    });

    // The trackers are admin and editor only (canSeeTrackers), so a viewer
    // and an rto lose them the same way a planner does.
    it.each(['viewer', 'rto'])('hides all three from a %s', (role) => {
      auth.current = { canWrite: false, canWriteRadio: role === 'rto', isAdmin: false, role, isPlanner: false, canSeeContracts: false, canSeeTrackers: false };
      renderSidebar('/catalog');

      expect(screen.queryByText('Terminals:')).toBeNull();
      expect(screen.queryByText('Kits:')).toBeNull();
      expect(screen.queryByText('By Section:')).toBeNull();
    });
  });

  // Contracts are internal and sit behind their own flag, canSeeContracts.
  // Same shape as the trackers rule - hiding nav, not denying anything - and
  // the fiscal-years query is skipped along with it.
  describe('contracts navigation', () => {
    it('shows the group to an editor', () => {
      auth.current = { canWrite: true, canWriteRadio: true, isAdmin: false, role: 'editor', isPlanner: false, canSeeContracts: true, canSeeTrackers: true };
      renderSidebar('/contracts');

      expect(screen.getByText('Contracts')).toBeInTheDocument();
      expect(mockUseFiscalYears).toHaveBeenCalledWith(true);
    });

    it.each([
      ['viewer', { canWrite: false, canWriteRadio: false }],
      ['rto', { canWrite: false, canWriteRadio: true }],
    ])('hides the group from a %s and skips the fiscal-years query', (role, writes) => {
      auth.current = { ...writes, isAdmin: false, role, isPlanner: false, canSeeContracts: false, canSeeTrackers: false };
      renderSidebar('/terminals');

      expect(screen.queryByText('Contracts')).toBeNull();
      expect(mockUseFiscalYears).toHaveBeenCalledWith(false);
    });
  });

  // Operations is ungated: every role reads operations, and the pages hide
  // their own write controls.
  describe('operations navigation', () => {
    const OPS = {
      data: {
        operations: [
          { id: 'op-1', name: 'Operation Avalanche', acronym: '' },
          { id: 'op-2', name: 'Operation Blizzard', acronym: '' },
          { id: 'op-3', name: 'Mountain Storm', acronym: 'MS' },
        ],
        total: 3,
      },
    } as unknown as ReturnType<typeof useOperations>;

    beforeEach(() => {
      mockUseOperations.mockReturnValue(OPS);
    });

    it.each([
      ['admin', { canWrite: true, canWriteRadio: true, isAdmin: true, isPlanner: false, canSeeContracts: true, canSeeTrackers: true }],
      ['planner', { canWrite: false, canWriteRadio: false, isAdmin: false, isPlanner: true, canSeeContracts: false, canSeeTrackers: false }],
      ['viewer', { canWrite: false, canWriteRadio: false, isAdmin: false, isPlanner: false, canSeeContracts: false, canSeeTrackers: false }],
    ])('shows the group and its operations to a %s', (role, flags) => {
      auth.current = { ...flags, role };
      renderSidebar('/terminals');

      expect(screen.getByText('Operations')).toBeInTheDocument();
      expect(screen.getByText('All Operations')).toBeInTheDocument();
      expect(screen.getByText('Operation Avalanche')).toBeInTheDocument();
      expect(screen.getByText('Operation Blizzard')).toBeInTheDocument();
    });

    it('names a row by its full name, never its acronym', () => {
      renderSidebar('/terminals');
      expect(screen.getByText('Mountain Storm')).toBeInTheDocument();
      expect(screen.queryByText('MS')).toBeNull();
      expect(screen.getByText('Operation Blizzard')).toBeInTheDocument();
    });

    it('opens the picker from All Operations', async () => {
      const user = userEvent.setup();
      renderSidebar('/terminals');

      await user.click(screen.getByText('All Operations'));

      expect(navigateMock).toHaveBeenCalledWith('/operations');
    });

    it('opens an operation from its row', async () => {
      const user = userEvent.setup();
      renderSidebar('/operations');

      await user.click(screen.getByText('Operation Blizzard'));

      expect(navigateMock).toHaveBeenCalledWith('/operations/op-2');
    });

    it('marks the operation row active on its own route, and All Operations on the picker', () => {
      const isActive = (label: string) =>
        getComputedStyle(screen.getByText(label)).fontWeight === '700';

      const { unmount } = renderSidebar('/operations/op-1');
      expect(screen.getByText('Operation Avalanche').closest('.Mui-selected')).not.toBeNull();
      expect(screen.getByText('Operation Blizzard').closest('.Mui-selected')).toBeNull();
      expect(isActive('All Operations')).toBe(false);
      unmount();

      renderSidebar('/operations');
      expect(screen.getByText('Operation Avalanche').closest('.Mui-selected')).toBeNull();
      expect(isActive('All Operations')).toBe(true);
    });
  });

  // The Editor link gates on canWriteRadio, not canWrite. POST
  // /api/v1/equipment admits rto and the service narrows it to
  // terminal_type = 'radio', so an rto writer holds a real write here and had
  // no link to it. The three cases below are the three answers the flag can
  // give, which is why the planner one is asserted rather than assumed from
  // the viewer one.
  describe('catalog Editor link', () => {
    it('renders for an rto writer, who can write radio equipment', () => {
      auth.current = { canWrite: false, canWriteRadio: true, isAdmin: false, role: 'rto', isPlanner: false, canSeeContracts: true, canSeeTrackers: true };
      renderSidebar('/catalog');

      expect(screen.getByText('Editor')).toBeInTheDocument();
    });

    it('renders for admin and editor', () => {
      renderSidebar('/catalog');

      expect(screen.getByText('Editor')).toBeInTheDocument();
    });

    it('stays hidden for a role that writes no equipment', () => {
      auth.current = { canWrite: false, canWriteRadio: false, isAdmin: false, role: 'viewer', isPlanner: false, canSeeContracts: true, canSeeTrackers: true };
      renderSidebar('/catalog');

      expect(screen.queryByText('Editor')).toBeNull();
    });
  });

  // Compare is a read, so unlike Editor it carries no gate at all. The viewer
  // case is the one that would regress if someone copied the Editor item to
  // make this one.
  describe('catalog Compare link', () => {
    it('renders for a viewer, since comparing writes nothing', () => {
      auth.current = { canWrite: false, canWriteRadio: false, isAdmin: false, role: 'viewer', isPlanner: false, canSeeContracts: true, canSeeTrackers: true };
      renderSidebar('/catalog');

      expect(screen.getByText('Compare')).toBeInTheDocument();
    });

    // "All Equipment" used to light up on anything starting with /catalog, so
    // adding a sub-route silently marked the wrong item active.
    it('does not mark All Equipment active while on the compare route', () => {
      renderSidebar('/catalog/compare');

      expect(screen.getByText('All Equipment')).toHaveStyle({ fontWeight: '600' });
      expect(screen.getByText('Compare')).toHaveStyle({ fontWeight: '700' });
    });

  });

  describe('catalog Comms Library link', () => {
    // Same trap as Compare above, next sub-route. isCatalogBrowse has to
    // exclude each one explicitly, which is the whole reason it is a named
    // boolean.
    it('does not mark All Equipment active while on the comms library route', () => {
      renderSidebar('/catalog/comms-library');

      expect(screen.getByText('All Equipment')).toHaveStyle({ fontWeight: '600' });
      expect(screen.getByText('Comms Library')).toHaveStyle({ fontWeight: '700' });
    });

    // Ungated, unlike Editor beside it: every pane inside carries its own
    // write gate, so a viewer browses the reference tables read-only.
    it('offers the comms library to a viewer', () => {
      auth.current = { canWrite: false, canWriteRadio: false, isAdmin: false, role: 'viewer', isPlanner: false, canSeeContracts: true, canSeeTrackers: true };
      renderSidebar('/catalog');

      expect(screen.getByText('Comms Library')).toBeInTheDocument();
      expect(screen.queryByText('Editor')).not.toBeInTheDocument();
    });

    // Where it goes, not just that it renders - the same omission that let the
    // browse page's "Edit library" button keep pointing at the old location.
    it('navigates to the comms library route', async () => {
      const user = userEvent.setup();
      renderSidebar('/catalog');

      // Equipment Catalog is collapsed on first load; open it first.
      await user.click(screen.getByText('Equipment Catalog'));
      await user.click(screen.getByText('Comms Library'));

      expect(navigateMock).toHaveBeenCalledWith('/catalog/comms-library');
    });
  });

  // First load opens Terminals and nothing else. A collapsed group stays
  // mounted (MUI Collapse at height 0, visibility hidden), so `getByText`
  // still finds its rows and visibility is the honest thing to assert.
  describe('default expansion', () => {
    it('opens only Terminals on a browser that has never toggled a group', () => {
      renderSidebar('/terminals');

      expect(screen.getByText('All Terminals')).toBeVisible();
      for (const row of ['All Kits', 'All Sections', 'All Equipment', 'All Contracts']) {
        expect(screen.getByText(row)).not.toBeVisible();
      }
    });

    it('lets a stored choice beat the default in both directions', () => {
      localStorage.setItem('signal-suite-sidebar-kits', 'true');
      localStorage.setItem('signal-suite-sidebar-terminals', 'false');
      renderSidebar('/terminals');

      expect(screen.getByText('All Kits')).toBeVisible();
      expect(screen.getByText('All Terminals')).not.toBeVisible();
    });

    it('expands a collapsed group from its banner and remembers it', async () => {
      const user = userEvent.setup();
      renderSidebar('/terminals');

      await user.click(screen.getByText('Kits:'));

      expect(screen.getByText('All Kits')).toBeVisible();
      expect(localStorage.getItem('signal-suite-sidebar-kits')).toBe('true');
    });
  });

  describe('scroll position', () => {
    it('survives a remount, so a PACE click does not throw the list back to the top', () => {
      // Every page renders its own MainLayout, so navigating to another route
      // unmounts this sidebar. The PACE group is at the bottom of the list and
      // every one of its items changes route, so without this each click
      // scrolled the list back to the top.
      const first = renderSidebar('/pace');
      const list = screen.getByTestId('sidebar-scroll');
      // jsdom has no layout, so scrollTop is set rather than scrolled to.
      Object.defineProperty(list, 'scrollTop', { value: 120, writable: true, configurable: true });
      fireEvent.scroll(list);
      first.unmount();

      renderSidebar('/pace/asqd');
      expect(screen.getByTestId('sidebar-scroll').scrollTop).toBe(120);
    });
  });
});

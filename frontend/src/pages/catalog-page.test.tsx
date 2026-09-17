import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { renderWithRoute, screen, waitFor, within } from '@/test/utils';
import { CatalogPage } from './catalog-page';

// Stubbed so the sidebar and header MainLayout mounts do not navigate for
// real. Nothing here asserts it: the page itself no longer calls useNavigate,
// since the only caller was the "Edit library" button that went with the tabs.
const navigateMock = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    // useSearchParams and useLocation are deliberately left real - the tab
    // lives in the URL and that round-trip is what these tests are checking.
    useNavigate: () => navigateMock,
  };
});

// Fixed, not varied per test. It used to flip canWrite / canWriteRadio to
// exercise the writer-only "Edit library" button; that button is gone with the
// library tabs, and catalog-page.tsx no longer reads useAuth at all. This
// exists only because the sidebar and header inside MainLayout do.
const authState = () => ({
  user: { id: '1', name: 'Test User', email: 'test@test.com', roles: ['admin'] },
  isAuthenticated: true,
  isLoading: false,
  isError: false,
  role: 'admin',
  isAdmin: true,
  canWrite: true,
  canWriteRadio: true,
  refetch: vi.fn(),
});

vi.mock('@/contexts', async () => {
  const actual = await vi.importActual('@/contexts');
  return {
    ...actual,
    useAuth: () => authState(),
    useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }),
  };
});

vi.mock('@/contexts/auth-context', async () => {
  const actual = await vi.importActual('@/contexts/auth-context');
  return { ...actual, useAuth: () => authState() };
});

// Closed mock - every hook the render tree pulls must be listed, including the
// sidebar/header hooks MainLayout mounts.
vi.mock('@/services', () => ({
  useTerminals: () => ({ data: undefined, isLoading: false }),
  useKits: () => ({ data: undefined, isLoading: false }),
  useSections: () => ({ data: undefined, isLoading: false }),
  useContracts: () => ({ data: undefined, isLoading: false }),
  useEquipment: vi.fn(),
  useLogout: () => ({ mutate: vi.fn() }),
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useContractFiscalYears: () => ({ data: [] }),
  REASSIGN_TO_NONE: '__none__',
}));

import { useEquipment } from '@/services';
const mockUseEquipment = vi.mocked(useEquipment);

const mockEquipment = [
  {
    id: 'gatr', nomenclature: 'GATR-2', terminal_type: 'satcom',
    operational_mode: [], data: { services: [{ abbrev: 'GX', name: 'Global Express' }], waveforms: [] },
    created_by: 't', updated_by: 't', created_at: '', updated_at: '',
  },
  {
    id: 'prc152', nomenclature: 'AN/PRC-152', nickname: 'Falcon', terminal_type: 'radio',
    operational_mode: [],
    data: { services: [], waveforms: [{ abbrev: 'SINCGARS', name: 'Single Channel' }] },
    created_by: 't', updated_by: 't', created_at: '', updated_at: '',
  },
];

// Facet-bearing records. The two above carry almost no spec data, which is
// realistic for a freshly imported catalog and is exactly the state in which
// most facets should hide themselves rather than offer one useless option.
const facetEquipment = [
  {
    id: 'gx-2', nomenclature: 'GX-2', terminal_type: 'satcom', make: 'Paradigm',
    operational_mode: ['COTP'],
    data: {
      services: [], waveforms: [], bands: [{ band: 'Ka' }, { band: 'Ku' }],
      swap: { weight: 41 }, standard_specs: { orbit: 'GEO', altPntAvailable: true },
    },
    created_by: 't', updated_by: 't', created_at: '', updated_at: '',
  },
  {
    id: 'be-900', nomenclature: 'BE-900', terminal_type: 'satcom', make: 'Ragno Systems',
    operational_mode: ['COTP'],
    data: {
      services: [], waveforms: [], bands: [{ band: 'Ku' }],
      swap: { weight: 165 }, standard_specs: { orbit: 'LEO', altPntAvailable: false },
    },
    created_by: 't', updated_by: 't', created_at: '', updated_at: '',
  },
  {
    id: 'mpu5', nomenclature: 'MPU5', terminal_type: 'radio', make: 'Persistent Systems',
    operational_mode: ['COTM'],
    data: {
      services: [],
      // Eleven, deliberately: `wf` collapses its tail past 8, and without a
      // facet long enough to have one there is nothing to test the tail with.
      waveforms: [
        { abbrev: 'TSM', name: 'Tactical Scalable MANET' },
        ...Array.from({ length: 10 }, (_, i) => ({
          abbrev: `WF-${String(i + 1).padStart(2, '0')}`, name: `Waveform ${String(i + 1)}`,
        })),
      ],
      bands: [{ band: 'L' }], swap: { weight: 3, weight_unit: 'lbs' },
    },
    created_by: 't', updated_by: 't', created_at: '', updated_at: '',
  },
  {
    id: 'prc-163', nomenclature: 'AN/PRC-163', terminal_type: 'radio', make: 'L3Harris',
    operational_mode: ['COTM'],
    data: {
      services: [], waveforms: [{ abbrev: 'SINCGARS', name: 'Single Channel' }],
      bands: [{ band: 'UHF' }], swap: { weight_oz: 38, weight_unit: 'oz' },
    },
    created_by: 't', updated_by: 't', created_at: '', updated_at: '',
  },
];

// Tab labels collide with sidebar nav text ("Radio", "SATCOM"), so scope the
// lookup to the toolbar's chip row rather than searching the whole document.
function chip(label: string) {
  const match = Array.from(document.querySelectorAll('.MuiChip-root')).find(
    el => el.textContent?.trim() === label,
  );
  if (!match) throw new Error(`No catalog tab chip labelled "${label}"`);
  return match as HTMLElement;
}

function isActive(label: string) {
  return chip(label).classList.contains('MuiChip-filled');
}

beforeEach(() => {
  navigateMock.mockClear();
  mockUseEquipment.mockReturnValue({
    data: { equipment: mockEquipment, total: mockEquipment.length },
    isLoading: false,
  } as unknown as ReturnType<typeof useEquipment>);
});

describe('CatalogPage tab routing', () => {
  it('opens on the Radio tab when ?type=radio is in the URL', () => {
    renderWithRoute(<CatalogPage />, '/catalog?type=radio');

    expect(isActive('Radio')).toBe(true);
    expect(isActive('All')).toBe(false);
    // Radio-only: the SATCOM item must not be in the grid.
    expect(screen.getByText('AN/PRC-152')).toBeInTheDocument();
    expect(screen.queryByText('GATR-2')).not.toBeInTheDocument();
  });

  it('opens on the SATCOM tab when ?type=satcom is in the URL', () => {
    renderWithRoute(<CatalogPage />, '/catalog?type=satcom');

    expect(isActive('SATCOM')).toBe(true);
    expect(screen.getByText('GATR-2')).toBeInTheDocument();
    expect(screen.queryByText('AN/PRC-152')).not.toBeInTheDocument();
  });

  it('falls back to All for an unrecognized type', () => {
    renderWithRoute(<CatalogPage />, '/catalog?type=bogus');

    expect(isActive('All')).toBe(true);
    expect(screen.getByText('GATR-2')).toBeInTheDocument();
    expect(screen.getByText('AN/PRC-152')).toBeInTheDocument();
  });

  it('switches tabs on click', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog');

    expect(isActive('All')).toBe(true);
    await user.click(chip('Radio'));

    // filter is derived only from the URL, so an active Radio chip proves the
    // search param was written and read back.
    expect(isActive('Radio')).toBe(true);
    expect(screen.queryByText('GATR-2')).not.toBeInTheDocument();
  });
});

/**
 * renderWithRoute wraps the element in a MemoryRouter with no <Routes>, so a
 * <Navigate> changes the location and leaves the same element mounted. Reading
 * the URL is therefore the only honest way to assert a redirect here - without
 * this probe the page simply re-renders as the All tab and the assertion would
 * be about the fallback rather than the redirect.
 */
function LocationProbe() {
  const { pathname, search } = useLocation();
  return <span data-testid="location">{pathname + search}</span>;
}

describe('CatalogPage retired library tabs', () => {
  // The waveforms and services tabs are gone; both tables live on
  // /catalog/comms-library now. A redirect rather than the All fallback,
  // which would drop someone on the equipment grid with a stale ?type= in the
  // address bar and nothing saying the list they asked for had moved.
  it.each([
    ['?type=waveforms', '/catalog/comms-library'],
    ['?type=services', '/catalog/comms-library?lib=services'],
  ])('redirects %s to %s', (query, destination) => {
    renderWithRoute(<><CatalogPage /><LocationProbe /></>, `/catalog${query}`);

    expect(screen.getByTestId('location')).toHaveTextContent(destination);
  });

  // The fallback still applies to anything else, and must not be turned into a
  // redirect: an unrecognised type is a typo, not a moved page.
  it('still falls back to All for an unrecognised type', () => {
    renderWithRoute(<><CatalogPage /><LocationProbe /></>, '/catalog?type=bogus');

    expect(screen.getByTestId('location')).toHaveTextContent('/catalog?type=bogus');
    expect(isActive('All')).toBe(true);
  });

  it('offers only the three equipment tabs', () => {
    renderWithRoute(<CatalogPage />, '/catalog');

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SATCOM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Radio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Waveforms' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Services' })).not.toBeInTheDocument();
    // The Cards/Matrix toggle and the Edit library button went with them.
    expect(screen.queryByRole('button', { name: 'Matrix' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit library' })).not.toBeInTheDocument();
  });
});

/**
 * The sidebar's own logic is unit-tested in `facet-selection.test.ts` with
 * nothing mounted. What is left to check here is the wiring: that it appears
 * where it should, that a click reaches the URL, and that the URL reaches the
 * grid.
 */
describe('CatalogPage facet sidebar', () => {
  const withFacetData = () => {
    mockUseEquipment.mockReturnValue({
      data: { equipment: facetEquipment, total: facetEquipment.length },
      isLoading: false,
    } as unknown as ReturnType<typeof useEquipment>);
  };

  const sidebar = () => screen.queryByRole('complementary', { name: 'Filters' });

  it('renders beside the grid on an equipment tab', () => {
    withFacetData();
    renderWithRoute(<CatalogPage />, '/catalog');
    expect(sidebar()).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Bands/ })).toBeInTheDocument();
  });

  /**
   * The switch used to render disabled on the waveforms and services tabs,
   * which carried none of these fields. With those tabs gone every remaining
   * tab is an equipment filter, so it is live everywhere - and it stays
   * mounted on all of them because it is the FIRST tile in the toolbar, and
   * unmounting it slides every control behind it 88px left.
   */
  it.each(['/catalog', '/catalog?type=satcom', '/catalog?type=radio'])(
    'offers a live Filters switch on %s',
    route => {
      withFacetData();
      renderWithRoute(<CatalogPage />, route);

      expect(screen.getByRole('button', { name: /^Filters$/ })).toBeEnabled();
    },
  );

  it('hides facets the tab cannot ask', () => {
    withFacetData();
    renderWithRoute(<CatalogPage />, '/catalog?type=radio');
    expect(screen.queryByRole('group', { name: /ALT-PNT/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Orbit/ })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Waveforms/ })).toBeInTheDocument();
  });

  it('applies a filter that arrives in the URL', () => {
    withFacetData();
    renderWithRoute(<CatalogPage />, '/catalog?f.weight=..20');
    expect(screen.getByText('MPU5')).toBeInTheDocument();
    expect(screen.getByText('AN/PRC-163')).toBeInTheDocument();
    expect(screen.queryByText('BE-900')).not.toBeInTheDocument();
  });

  // The URL grammar itself is pinned in facet-selection.test.ts. What this
  // checks is that a click reaches it and the result comes back to the grid -
  // asserted through the UI, since renderWithRoute uses a MemoryRouter and
  // window.location never moves.
  /**
   * Sections start closed - eleven expanded facets is a rail you scroll past
   * to reach the one you want - so a test that touches a facet's controls has
   * to open it first. The chips are `hidden` when closed, which takes them out
   * of the accessibility tree rather than merely out of view, so `getByRole`
   * genuinely cannot see them.
   */
  const openFacet = async (user: ReturnType<typeof userEvent.setup>, label: string | RegExp) => {
    await user.click(screen.getByRole('button', { name: label }));
  };

  it('narrows the grid when a value is clicked, and marks it pressed', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog');

    await openFacet(user, 'Bands');
    await user.click(screen.getByRole('button', { name: /^Ka, \d+ results$/ }));

    expect(screen.getByRole('button', { name: /^Ka, \d+ results$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('GX-2')).toBeInTheDocument();
    expect(screen.queryByText('BE-900')).not.toBeInTheDocument();
  });

  it('offers a way out when the filters match nothing', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog?f.make=nonesuch');

    expect(screen.getByText(/No equipment matches these filters/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Clear all filters/i }));

    expect(screen.queryByText(/No equipment matches these filters/i)).not.toBeInTheDocument();
    expect(screen.getByText('GX-2')).toBeInTheDocument();
  });

  it('clears only the facets, leaving the tab alone', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog?type=satcom&f.band=ka');

    await user.click(screen.getByRole('button', { name: /^Clear \(1\)$/ }));

    // The tab is not a facet, so Clear must not take it with them.
    expect(isActive('SATCOM')).toBe(true);
    expect(screen.queryByRole('button', { name: /^Clear \(\d+\)$/ })).not.toBeInTheDocument();
    expect(screen.getByText('BE-900')).toBeInTheDocument();
  });

  // A facet whose only option selects everything is furniture.
  it('leaves out a facet the catalog answers one way', () => {
    mockUseEquipment.mockReturnValue({
      data: {
        equipment: facetEquipment.filter(e => e.id === 'gx-2' || e.id === 'be-900')
          .map(e => ({ ...e, operational_mode: ['COTP'] })),
        total: 2,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useEquipment>);
    renderWithRoute(<CatalogPage />, '/catalog?type=satcom');
    // Both records are COTP, so the mode facet cannot separate them.
    expect(screen.queryByRole('group', { name: /Operational Mode/ })).not.toBeInTheDocument();
    // Orbit differs between them, so it stays.
    expect(screen.getByRole('group', { name: /Orbit/ })).toBeInTheDocument();
  });

  // The rail opens as a list of headings. Pinned because it is a default, and
  // a default nothing asserts is one a refactor can flip without a red test -
  // in particular, seeding a *collapsed* set from the facet list would look
  // correct and quietly do nothing, since the first render has no models.
  it('starts with every section closed', () => {
    withFacetData();
    renderWithRoute(<CatalogPage />, '/catalog');

    expect(screen.getByRole('button', { name: 'Bands' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Weight/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Ka, \d+ results$/ })).not.toBeInTheDocument();
  });

  it('expands a section and collapses it again', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog');

    // The +/- glyph is aria-hidden, so the accessible name is the label alone
    // and `aria-expanded` is what carries the state - which is what a screen
    // reader should hear rather than "plus Bands".
    const header = screen.getByRole('button', { name: 'Bands' });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    // `hidden` takes the chips out of the accessibility tree, not just out of view.
    expect(screen.queryByRole('button', { name: /^Ka, \d+ results$/ })).not.toBeInTheDocument();

    await user.click(header);

    const opened = screen.getByRole('button', { name: 'Bands' });
    expect(opened).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Ka, \d+ results$/ })).toBeInTheDocument();

    await user.click(opened);
    expect(screen.getByRole('button', { name: 'Bands' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Ka, \d+ results$/ })).not.toBeInTheDocument();
  });

  /**
   * Collapsing must not hide the fact that a facet is filtering. Same rule as
   * a one-answer facet staying drawn while active: an applied filter always
   * has something on screen saying so.
   */
  it('says on the header when a collapsed section is still filtering', () => {
    withFacetData();
    renderWithRoute(<CatalogPage />, '/catalog?f.band=ka');

    // No click needed: closed is the default now, so a link carrying a filter
    // lands on exactly the case this rule is about.
    expect(screen.getByRole('button', { name: /^Bands\s*1 on$/ })).toBeInTheDocument();
    // ...and the filter is still doing its job.
    expect(screen.queryByText('BE-900')).not.toBeInTheDocument();
  });

  it('expands and collapses every section at once', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog');

    // Everything starts closed, so the switch offers Expand all first.
    await user.click(screen.getByRole('button', { name: /Expand all/i }));
    expect(screen.getByRole('button', { name: /^Ka, \d+ results$/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Collapse all/i }));
    expect(screen.queryByRole('button', { name: /^Ka, \d+ results$/ })).not.toBeInTheDocument();
  });

  it('closes and reopens the rail from the toolbar switch', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog?f.band=ka');

    const toolbar = screen.getByRole('button', { name: /^Filters \(1\)$/ });
    await user.click(toolbar);
    expect(screen.queryByRole('complementary', { name: 'Filters' })).not.toBeInTheDocument();

    // Closing the rail must not drop the filter, and the switch has to keep
    // saying one is on - otherwise a narrowed grid has nothing explaining it.
    expect(screen.queryByText('BE-900')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Filters \(1\)$/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filters \(1\)$/ }));
    expect(screen.getByRole('complementary', { name: 'Filters' })).toBeInTheDocument();
  });

  /**
   * Collapsed sections and expanded tails are page state, not rail state.
   * They used to live inside FacetSidebar, which unmounts on a library tab,
   * so a glance at Waveforms silently reset the whole rail.
   */
  it('keeps an opened section through a library-tab round trip', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog');

    // Opened, not collapsed: closed is the default, so only the opened state
    // proves anything was carried across the unmount.
    await openFacet(user, 'Bands');
    expect(screen.getByRole('button', { name: 'Bands' })).toHaveAttribute('aria-expanded', 'true');

    // SATCOM, not the old Waveforms chip. That chip is gone, and 'Waveforms'
    // is also the name of a facet section header - so asking for it by that
    // name now silently hits the header instead of throwing.
    await user.click(screen.getByRole('button', { name: 'SATCOM' }));
    await user.click(screen.getByRole('button', { name: 'All' }));

    expect(screen.getByRole('button', { name: 'Bands' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps an expanded value tail through the same round trip', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog');

    // Expand all rather than one facet: the tail belongs to whichever facet
    // has more values than the truncation limit, which is a property of the
    // fixture rather than something this test should encode.
    await user.click(screen.getByRole('button', { name: /Expand all/i }));
    await user.click(screen.getByRole('button', { name: /Show all \(\d+\)/ }));
    expect(screen.getByRole('button', { name: /Show fewer/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'SATCOM' }));
    await user.click(screen.getByRole('button', { name: 'All' }));

    expect(screen.getByRole('button', { name: /Show fewer/ })).toBeInTheDocument();
  });

  /**
   * The custom threshold box reads the URL rather than seeding itself once.
   * A `useState` initializer runs before the equipment query resolves, so
   * there are no models yet and the box seeded empty and stayed empty - a
   * link arrived showing a filter that was visibly working over a blank box
   * claiming nothing was set.
   */
  it('shows the threshold a link arrived with', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog?f.weight=..45');

    await openFacet(user, /Weight/);
    const weightGroup = screen.getByRole('group', { name: /Weight/ });
    const box = within(weightGroup).getByRole('spinbutton');
    expect(box).toHaveValue(45);
  });

  it('hands the box back to a preset when one is clicked', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog?f.weight=..45');

    await openFacet(user, /Weight/);
    const weightGroup = screen.getByRole('group', { name: /Weight/ });
    await user.click(within(weightGroup).getByRole('button', { name: /^Under 20 lbs/ }));

    // The preset owns the range now, so the custom box has nothing to show.
    //
    // `waitFor` because the click updates the URL and the box clears on the
    // render that follows, not synchronously inside the click. Asserting
    // straight after it passed about half the time - a flake that says nothing
    // about the behaviour, only about which side of the re-render the
    // assertion happened to land on.
    await waitFor(() => {
      expect(within(weightGroup).getByRole('spinbutton')).toHaveValue(null);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A term scoped to the other kind of equipment is held in the URL and
// correctly not applied, and both counters used to count it anyway - so the
// buttons claimed a filter over a grid nothing had narrowed, with no chip to
// switch it off because the tab does not draw that facet.
// ─────────────────────────────────────────────────────────────────────────────

describe('CatalogPage paused facet terms', () => {
  const withFacetData = () => {
    mockUseEquipment.mockReturnValue({
      data: { equipment: facetEquipment, total: facetEquipment.length },
      isLoading: false,
    } as unknown as ReturnType<typeof useEquipment>);
  };

  const filtersTile = () => screen.getByRole('button', { name: /^Filters( \(\d+\))?$/ });

  /** The case the suite had no test for: the count after a tab switch. */
  it('stops counting a term the tab has stopped applying', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog?f.wf=tsm');

    expect(filtersTile()).toHaveTextContent('Filters (1)');
    expect(screen.getByText('MPU5')).toBeInTheDocument();
    expect(screen.queryByText('GX-2')).not.toBeInTheDocument();

    await user.click(chip('SATCOM'));

    // Not applied, so not counted - and the grid says so: both SATCOM records
    // are present, which is every record this tab has.
    expect(filtersTile()).toHaveTextContent(/^Filters$/);
    expect(screen.getByRole('button', { name: /^Paused \(1\)$/ })).toBeInTheDocument();
    expect(screen.getByText('GX-2')).toBeInTheDocument();
    expect(screen.getByText('BE-900')).toBeInTheDocument();

    // And it comes back, which is why it was kept.
    await user.click(chip('All'));
    expect(filtersTile()).toHaveTextContent('Filters (1)');
    expect(screen.getByText('MPU5')).toBeInTheDocument();
  });

  it('names the held term in the rail, with the tab that would apply it', () => {
    withFacetData();
    renderWithRoute(<CatalogPage />, '/catalog?type=satcom&f.wf=tsm');

    expect(screen.getByText(/Held for the RADIO tab/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Clear paused filter, Waveforms: TSM' }),
    ).toBeInTheDocument();
    // Nothing is being applied, so the rail offers no Clear at all.
    expect(screen.queryByRole('button', { name: /^Clear \(\d+\)$/ })).not.toBeInTheDocument();
  });

  /**
   * The marker has to live outside the rail. The rail is unmounted while
   * Filters is closed, which is the state a shared link lands a narrow window
   * in - and the state in which a held filter is most confusing.
   */
  it('still discloses the held term with the rail closed', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog?type=satcom&f.wf=tsm');

    await user.click(filtersTile());

    expect(screen.queryByRole('complementary', { name: 'Filters' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Paused \(1\)$/ })).toBeInTheDocument();
  });

  it('opens the rail from the Paused marker', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog?type=satcom&f.wf=tsm');

    await user.click(filtersTile());
    await user.click(screen.getByRole('button', { name: /^Paused \(1\)$/ }));

    expect(screen.getByRole('complementary', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByText(/Held for the RADIO tab/)).toBeInTheDocument();
  });

  it('drops just the one term when its chip is cleared', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog?type=satcom&f.wf=tsm');

    await user.click(screen.getByRole('button', { name: 'Clear paused filter, Waveforms: TSM' }));

    expect(screen.queryByRole('button', { name: /^Paused/ })).not.toBeInTheDocument();
    await user.click(chip('All'));
    expect(filtersTile()).toHaveTextContent(/^Filters$/);
    expect(screen.getByText('MPU5')).toBeInTheDocument();
    expect(screen.getByText('GX-2')).toBeInTheDocument();
  });

  /**
   * The second bug, which nobody filed: Clear used to return EMPTY_SELECTION,
   * so it destroyed a held radio term from the SATCOM tab - the destruction
   * `tabFacets` refuses to do through a tab switch, arriving through a button.
   */
  it('Clear drops what it counted and leaves the held term alone', async () => {
    withFacetData();
    const user = userEvent.setup();
    renderWithRoute(<CatalogPage />, '/catalog?type=satcom&f.band=ka&f.wf=tsm');

    expect(filtersTile()).toHaveTextContent('Filters (1)');
    await user.click(screen.getByRole('button', { name: /^Clear \(1\)$/ }));

    expect(screen.getByRole('button', { name: /^Paused \(1\)$/ })).toBeInTheDocument();
    await user.click(chip('All'));
    expect(filtersTile()).toHaveTextContent('Filters (1)');
    expect(screen.getByText('MPU5')).toBeInTheDocument();
  });

  /**
   * With only a held term, nothing filtered anything away - the tab did. The
   * page used to blame the filters and offer a Clear that removed nothing
   * visible while destroying the held term.
   */
  it('does not blame the filters for an empty tab', () => {
    mockUseEquipment.mockReturnValue({
      data: { equipment: facetEquipment.filter(e => e.terminal_type === 'radio'), total: 2 },
      isLoading: false,
    } as unknown as ReturnType<typeof useEquipment>);
    renderWithRoute(<CatalogPage />, '/catalog?type=satcom&f.wf=tsm');

    expect(screen.queryByRole('button', { name: /Clear all filters/i })).not.toBeInTheDocument();
  });
});

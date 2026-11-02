import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';

import { renderWithRoute, screen, within } from '@/test/utils';
import { CatalogCompatibilityPage } from './catalog-compatibility-page';
import type { Branch, Platform, PlatformType } from '@/types';

function platform(id: string, designation: string, category: Branch[], type: PlatformType = 'aircraft'): Platform {
  return {
    id, designation, category, type,
    popular_name: '', waveform_abbrevs: [], equipment_ids: [], notes: '',
    created_by: '', updated_by: '', created_at: '', updated_at: '',
  };
}

const PLATFORMS = [
  platform('p1', 'AH-64E', ['USA']),
  platform('p2', 'AH-1Z', ['USMC']),
  platform('p3', 'ACV-30', ['USMC'], 'ground vehicle'),
  platform('p4', 'F-35A', ['USAF']),
  // Two branches, and it carries the one library waveform, so its cell is the
  // supported one the branch-check tests read.
  { ...platform('p5', '11M NSW RIB', ['USN', 'USCG'], 'ship'), waveform_abbrevs: ['L16'] },
];

// Closed mock - every hook the render tree pulls must be listed, including the
// sidebar/header hooks MainLayout mounts.
vi.mock('@/services', () => ({
  usePlatforms: () => ({ data: { platforms: PLATFORMS, total: PLATFORMS.length }, isLoading: false }),
  useEquipment: () => ({ data: { equipment: [], total: 0 }, isLoading: false }),
  // One waveform, or the matrix draws its empty state instead of a grid.
  useWaveforms: () => ({ data: { waveforms: [{ id: 'w1', abbrev: 'L16', name: 'Link 16' }], total: 1 }, isLoading: false }),
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

const adminAuth = () => ({
  user: { id: '1', name: 'Test User', email: 'test@test.com', roles: ['admin'] },
  isAuthenticated: true, isLoading: false, isError: false,
  role: 'admin', isAdmin: true, canWrite: true, canWriteRadio: true,
  refetch: vi.fn(),
});
vi.mock('@/contexts', async () => ({
  ...(await vi.importActual('@/contexts')),
  useAuth: () => adminAuth(),
  useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }),
}));
vi.mock('@/contexts/auth-context', async () => ({
  ...(await vi.importActual('@/contexts/auth-context')),
  useAuth: () => adminAuth(),
}));

/** The query string, so a test can read what a shared link would carry. */
function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderPage() {
  renderWithRoute(<><CatalogCompatibilityPage /><Search /></>, '/catalog/compatibility');
  return userEvent.setup();
}

/** The matrix's column heads, left to right; none when the grid is not drawn. */
const matrixColumns = () => {
  const table = screen.queryByRole('table', { name: 'Joint compatibility matrix' });
  return table
    ? within(table).getAllByRole('columnheader').slice(1).map(h => h.firstElementChild?.textContent)
    : [];
};

const search = () => decodeURIComponent(screen.getByTestId('search').textContent ?? '');

/** Opens the Columns panel and presses one of its buttons. */
async function inColumns(user: ReturnType<typeof userEvent.setup>, name: string) {
  if (!screen.queryByText(/Columns - in the order picked/)) {
    await user.click(screen.getByRole('button', { name: /^Columns/ }));
  }
  const panel = screen.getByText(/Columns - in the order picked/).parentElement!.parentElement!;
  await user.click(within(panel).getByRole('button', { name }));
}

describe('CatalogCompatibilityPage default', () => {
  // Five hundred platforms side by side is a grid nobody can read, so the page
  // opens blank and says what to do.
  it('opens with no columns and a prompt to pick some', () => {
    renderPage();

    expect(matrixColumns()).toEqual([]);
    expect(screen.getByText(/No columns picked/)).toBeInTheDocument();
  });

  it('Select all draws every column, and Clear goes back to blank', async () => {
    const user = renderPage();

    await inColumns(user, 'Select all');
    expect(matrixColumns()).toEqual(['AH-64E', 'ACV-30', 'AH-1Z', '11M NSW RIB', 'F-35A']);
    expect(search()).toContain('cols=all');

    await inColumns(user, 'Clear');
    expect(matrixColumns()).toEqual([]);
    expect(search()).not.toContain('cols=');
  });
});

describe('CatalogCompatibilityPage filters', () => {
  // The banner used to carry ORGANIC / JOINT chips beside the title. They
  // filtered like the panel's rows without looking like them, and the category
  // they filtered on is gone. Every filter is in the Filters panel now.
  it('keeps no filter chips in the banner; the branch filter is in the Filters panel', async () => {
    const user = renderPage();

    expect(screen.queryByRole('button', { name: /^(organic|joint|coalition)$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'USA' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const filters = screen.getByText(/Filters - any of each/).parentElement!.parentElement!;
    expect(within(filters).getByText('Branch')).toBeInTheDocument();
    expect(within(filters).getByRole('button', { name: 'USA' })).toBeInTheDocument();
  });

  // The ask was filters that stack, not one at a time.
  it('keeps every branch chip clicked on, and Select all takes just what they allow', async () => {
    const user = renderPage();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));

    await user.click(screen.getByRole('button', { name: 'USA' }));
    await user.click(screen.getByRole('button', { name: 'USMC' }));
    await inColumns(user, 'Select all');

    expect(screen.getByRole('button', { name: 'USA', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'USMC', pressed: true })).toBeInTheDocument();
    expect(search()).toContain('branch=USA,USMC');
    expect(matrixColumns()).toEqual(['AH-64E', 'ACV-30', 'AH-1Z']);
  });

  it('combines branch and type, and the filter Clear drops both', async () => {
    const user = renderPage();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));

    await user.click(screen.getByRole('button', { name: 'USMC' }));
    await user.click(screen.getByRole('button', { name: 'aircraft' }));
    await inColumns(user, 'Select all');
    expect(matrixColumns()).toEqual(['AH-1Z']);
    expect(screen.getByRole('button', { name: /^Filters \(2\)/ })).toBeInTheDocument();

    const filters = screen.getByText(/Filters - any of each/).parentElement!.parentElement!;
    await user.click(within(filters).getByRole('button', { name: 'Clear' }));
    expect(matrixColumns()).toHaveLength(PLATFORMS.length);
  });
});

describe('CatalogCompatibilityPage column heads', () => {
  // The branch is the only tag a column carries: one chip per branch, so a
  // platform flown by two services shows both.
  it('draws one chip per branch under each column label', async () => {
    const user = renderPage();
    await inColumns(user, 'Select all');

    const table = screen.getByRole('table', { name: 'Joint compatibility matrix' });
    const heads = within(table).getAllByRole('columnheader');
    const rib = heads.find(h => h.firstElementChild?.textContent === '11M NSW RIB')!;
    expect(within(rib).getByText('USN')).toBeInTheDocument();
    expect(within(rib).getByText('USCG')).toBeInTheDocument();
    expect(rib).toHaveAttribute('title', '11M NSW RIB (US Navy, US Coast Guard)');
  });
});

// A platform flown by two branches is one column (the RIB, USN and USCG); each supported cell draws a
// check per branch, in that branch's colour, so the waveform reads as two
// fleets rather than one.
// The compare page's banner and Fit to one page, on the matrix: the panel
// toggles straight after the title, and Fit with its readout beside share and
// Print.
describe('CatalogCompatibilityPage banner and Fit to one page', () => {
  it('puts the panel toggles before Fit, and Fit before Print', () => {
    renderPage();
    const order = [/^Filters/, /^Columns/, /^Hide empty rows$/, /^Fit to one page$/, /^Print/]
      .map(name => screen.getByRole('button', { name }));
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('turns Fit on and off through the URL', async () => {
    const user = renderPage();
    const fit = screen.getByRole('button', { name: 'Fit to one page' });
    expect(fit).toHaveAttribute('aria-pressed', 'false');

    await user.click(fit);
    expect(fit).toHaveAttribute('aria-pressed', 'true');
    expect(search()).toContain('fit=1');

    await user.click(fit);
    expect(fit).toHaveAttribute('aria-pressed', 'false');
    expect(search()).not.toContain('fit=');
  });

  // jsdom lays nothing out, so the twin never measures: as on compare, the
  // readout waits for Fit, and then counts the arithmetic columns.
  it('says how many pages the selection prints on once Fit is on', async () => {
    const user = renderPage();
    await inColumns(user, 'Select all');
    expect(screen.queryByTitle(/prints on/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fit to one page' }));
    // Below 1400px (jsdom matches no media query) the readout drops "prints on"
    // to keep the banner on one line at the 1280 floor; the tooltip keeps it.
    const readout = screen.getByTitle('prints on 1 page');
    expect(readout).toHaveTextContent(/^1 page$/);
  });

  // The share menu exports the first marked sheet root in the page. The hidden
  // print-measuring twin sits before the real grid, so it must not be one.
  it('marks only the grid on screen as the sheet the share menu exports', async () => {
    const user = renderPage();
    await inColumns(user, 'Select all');
    const roots = [...document.querySelectorAll('[data-sheet-root]')];
    expect(roots).toHaveLength(1);
    expect(roots[0]!.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('carries fit=1 into the Print / Save PDF URL', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = renderPage();
    await user.click(screen.getByRole('button', { name: 'Fit to one page' }));
    await user.click(screen.getByRole('button', { name: /^Print/ }));

    expect(open).toHaveBeenCalledWith(expect.stringContaining('fit=1'), '_blank');
    open.mockRestore();
  });
});

describe('CatalogCompatibilityPage branch checks', () => {
  const ribCell = () => {
    const table = screen.getByRole('table', { name: 'Joint compatibility matrix' });
    const heads = within(table).getAllByRole('columnheader').slice(1);
    const i = heads.findIndex(h => h.firstElementChild?.textContent === '11M NSW RIB');
    return within(table).getAllByRole('cell')[i]!;
  };

  it('draws a coloured check per branch in a multi-branch column', async () => {
    const user = renderPage();
    await inColumns(user, 'Select all');

    const cell = ribCell();
    const checks = [...cell.querySelectorAll('[data-branch]')].map(el => el.getAttribute('data-branch'));
    expect(checks).toEqual(['USN', 'USCG']);
    expect(cell).toHaveAttribute('title', 'Supported - US Navy, US Coast Guard');
    expect(cell.querySelector('[data-branch="USN"]')).toHaveStyle({ color: '#0B1F4B' });
  });

  it('draws only the filtered branch under a branch filter', async () => {
    const user = renderPage();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('button', { name: 'USCG' }));
    await inColumns(user, 'Select all');

    const checks = [...ribCell().querySelectorAll('[data-branch]')].map(el => el.getAttribute('data-branch'));
    expect(checks).toEqual(['USCG']);
  });

  it('keys only the branches it drew', async () => {
    const user = renderPage();
    await inColumns(user, 'Select all');

    // The visible key, not the one inside the hidden print-measuring twin.
    const legend = screen.getAllByLabelText('Legend').find(el => !el.closest('[aria-hidden="true"]'))!;
    // Only the RIB carries a waveform, so only its two branches drew a check.
    expect(legend).toHaveTextContent('USN');
    expect(legend).toHaveTextContent('USCG');
    expect(legend).not.toHaveTextContent('USA');
  });
});

describe('CatalogCompatibilityPage column picker', () => {
  it('groups tiles by branch in precedence order, a multi-branch platform in each of its groups', async () => {
    const user = renderPage();
    await user.click(screen.getByRole('button', { name: /^Columns/ }));

    const groups = screen.getAllByRole('group').map(g => g.getAttribute('aria-labelledby'));
    const labels = groups.map(id => (id ? document.getElementById(id)?.textContent : ''));
    expect(labels).toEqual(['USA', 'USMC', 'USN', 'USAF', 'USCG']);
    expect(screen.getAllByRole('button', { name: '11M NSW RIB' })).toHaveLength(2);
  });

  it('adds a whole branch row with its ALL tile, and takes it away again', async () => {
    const user = renderPage();

    await inColumns(user, 'All USMC');
    expect(matrixColumns()).toEqual(['ACV-30', 'AH-1Z']);

    await inColumns(user, 'All USMC');
    expect(matrixColumns()).toEqual([]);
  });

  it('switching a row off from Select all keeps the rest', async () => {
    const user = renderPage();

    await inColumns(user, 'Select all');
    await inColumns(user, 'All USMC');

    expect(matrixColumns()).toEqual(['AH-64E', '11M NSW RIB', 'F-35A']);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithRoute, screen } from '@/test/utils';
import type { Equipment, EquipmentData, TerminalType } from '@/types';
import { CatalogComparePage } from './catalog-compare-page';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    // useSearchParams stays real. The selection lives in the URL and that
    // round trip is most of what these tests are checking.
    ...{ useNavigate: () => vi.fn() },
  };
});

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
  return { ...actual, useAuth: () => authState(), useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }) };
});

vi.mock('@/contexts/auth-context', async () => {
  const actual = await vi.importActual('@/contexts/auth-context');
  return { ...actual, useAuth: () => authState() };
});

// Closed mock. Every hook the render tree pulls must be listed, the
// sidebar/header hooks MainLayout mounts included. checkServiceMocks in
// scripts/verify.mjs reads that list out of the layout sources and is the
// authority on it, not a list written in a comment.
vi.mock('@/services', () => ({
  useTerminals: () => ({ data: undefined, isLoading: false }),
  useKits: () => ({ data: undefined, isLoading: false }),
  useSections: () => ({ data: undefined, isLoading: false }),
  useContracts: () => ({ data: undefined, isLoading: false }),
  useEquipment: vi.fn(),
  useWaveforms: () => ({ data: undefined, isLoading: false }),
  useServices: () => ({ data: undefined, isLoading: false }),
  useLogout: () => ({ mutate: vi.fn() }),
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useContractFiscalYears: () => ({ data: [] }),
  REASSIGN_TO_NONE: '__none__',
}));

import { useEquipment } from '@/services';
const mockUseEquipment = vi.mocked(useEquipment);

function equipment(
  id: string,
  nomenclature: string,
  terminal_type: TerminalType,
  data?: Partial<EquipmentData>,
): Equipment {
  return {
    id,
    nomenclature,
    terminal_type,
    operational_mode: [],
    data: data as EquipmentData | undefined,
    created_by: 'test',
    updated_by: 'test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

const catalog: Equipment[] = [
  equipment('hornet', 'HORNET', 'satcom', {
    standard_specs: { orbit: 'GEO', modem: 'iDirect' },
    bands: [{ band: 'Ka', eirp: 50 }],
    swap: { weight: 42 },
  }),
  equipment('be-900', 'BE-900', 'satcom', { standard_specs: {} }),
  equipment('mpu5', 'MPU5', 'radio', {
    standard_specs: { crypto: 'AES-256' },
    waveforms: [{ abbrev: 'MANET', name: 'MANET' }],
  }),
];

function renderAt(search: string) {
  return renderWithRoute(<CatalogComparePage />, `/catalog/compare${search}`);
}

/**
 * `usePrintPagination`'s hidden measuring twin renders a full, unpaginated
 * `CompareSheet` for the same selection this page already shows on screen -
 * that is the whole point of it, a real print-density layout to measure. It
 * is marked `aria-hidden="true"`, which `getByRole` already excludes by
 * default, but `getByText`/`getByLabelText` do not consult the accessibility
 * tree at all and so find the twin's copy of every value too. Any assertion
 * that expects exactly one match for text the twin would also render needs
 * to filter it out explicitly - this is that filter.
 */
function onScreenOnly(elements: HTMLElement[]): HTMLElement[] {
  return elements.filter(el => !el.closest('[aria-hidden="true"]'));
}

describe('CatalogComparePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEquipment.mockReturnValue({
      data: { equipment: catalog, total: catalog.length },
      isLoading: false,
    } as unknown as ReturnType<typeof useEquipment>);
  });

  it('prompts rather than drawing an empty grid when nothing is selected', () => {
    renderAt('');
    expect(screen.getByText(/pick equipment above/i)).toBeInTheDocument();
    expect(screen.queryByText('Manufacturer')).not.toBeInTheDocument();
  });

  it('renders a column per selected record, in the order the URL names them', () => {
    renderAt('?ids=mpu5,hornet&params=make');
    const headers = screen.getAllByRole('button', { name: /^Remove / });
    expect(headers.map(b => b.getAttribute('aria-label'))).toEqual(['Remove MPU5', 'Remove HORNET']);
  });

  // The promise that makes mixing SATCOM and radio in one matrix worth
  // allowing. If these two ever render alike, every real gap in the catalog
  // hides behind a legitimate-looking empty cell.
  it('distinguishes not-applicable from unfilled', () => {
    renderAt('?ids=hornet,be-900,mpu5&params=std:orbit');
    // hornet has GEO, be-900 is a satcom record with the field unset, mpu5 is
    // a radio and has no such field at all.
    expect(onScreenOnly(screen.getAllByText('GEO'))).toHaveLength(1);
    expect(onScreenOnly(screen.getAllByLabelText('no value'))).toHaveLength(1);
    expect(onScreenOnly(screen.getAllByLabelText('not applicable'))).toHaveLength(1);
  });

  it('hides a row that applies to no selected terminal type', () => {
    renderAt('?ids=hornet&params=make,std:crypto');
    expect(onScreenOnly(screen.getAllByText('Manufacturer'))).toHaveLength(1);
    expect(screen.queryByText('Crypto')).not.toBeInTheDocument();
  });

  it('shows that row again once a radio joins the selection', () => {
    renderAt('?ids=hornet,mpu5&params=make,std:crypto');
    expect(onScreenOnly(screen.getAllByText('Crypto'))).toHaveLength(1);
    expect(onScreenOnly(screen.getAllByText('AES-256'))).toHaveLength(1);
  });

  it('offers a derived band row only while the record producing it is selected', async () => {
    const user = userEvent.setup();
    renderAt('?ids=hornet&params=');
    await user.click(screen.getByRole('button', { name: /^Parameters/ }));
    expect(screen.getByRole('button', { name: 'Ka EIRP' })).toBeInTheDocument();
  });

  it('drops an id the catalog does not hold instead of throwing', () => {
    renderAt('?ids=hornet,ghost&params=make');
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Remove HORNET' })).toBeInTheDocument();
  });

  it('removes a column from the matrix header', async () => {
    const user = userEvent.setup();
    renderAt('?ids=hornet,mpu5&params=make');
    await user.click(screen.getByRole('button', { name: 'Remove MPU5' }));
    expect(screen.queryByRole('button', { name: 'Remove MPU5' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove HORNET' })).toBeInTheDocument();
  });

  it('adds a column from the equipment picker', async () => {
    const user = userEvent.setup();
    renderAt('?params=make');
    const panel = screen.getByRole('button', { name: 'BE-900' });
    await user.click(panel);
    expect(screen.getByRole('button', { name: 'Remove BE-900' })).toBeInTheDocument();
  });

  it('toggling a parameter changes the rows drawn', async () => {
    const user = userEvent.setup();
    renderAt('?ids=hornet&params=make');
    expect(onScreenOnly(screen.getAllByText('Manufacturer'))).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /^Parameters/ }));
    await user.click(screen.getByRole('button', { name: 'Modem' }));

    expect(onScreenOnly(screen.getAllByText('iDirect'))).toHaveLength(1);
  });

  it('says so when the selection holds no parameters', async () => {
    const user = userEvent.setup();
    renderAt('?ids=hornet&params=make');
    await user.click(screen.getByRole('button', { name: /^Parameters/ }));
    await user.click(screen.getByRole('button', { name: 'Manufacturer' }));
    expect(screen.getByText(/no parameters selected/i)).toBeInTheDocument();
  });

  // The counts live on the two switches and nowhere else. A separate
  // "2 selected, 2 parameters" line said the same thing twice.
  it('counts the selection on the two panel switches', () => {
    renderAt('?ids=hornet,mpu5&params=make,type');
    expect(screen.getByRole('button', { name: 'Equipment (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Parameters (2)' })).toBeInTheDocument();
  });

  it('offers print once there is a matrix to export', () => {
    renderAt('?ids=hornet&params=make');
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeInTheDocument();
  });

  // A separate test, not a second render in the one above: RTL cleans up
  // between tests, so two renders in one leave both trees mounted and the
  // negative query finds the first tree's button.
  it('hides print while there is nothing to export', () => {
    renderAt('');
    expect(screen.queryByRole('button', { name: 'Print / Save PDF' })).not.toBeInTheDocument();
  });

  // The live page must not go straight to the print dialog: Paper or Dark is
  // chosen on the preview, and print=1 skipped that choice, always printing
  // paper.
  it('opens the print preview, not the print dialog', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderAt('?ids=hornet&params=make');

    await userEvent.click(screen.getByRole('button', { name: 'Print / Save PDF' }));

    expect(open).toHaveBeenCalledTimes(1);
    const url = String(open.mock.calls[0]?.[0]);
    expect(url).toContain('/catalog/compare/print?');
    expect(url).toContain('ids=hornet');
    expect(url).not.toContain('print=1');
    open.mockRestore();
  });

  // Shared URL state with the print preview - see FIT_PARAM's own doc
  // comment - so this page's own toggle and the Print URL it feeds both have
  // to agree with `?fit=`.
  it('turns the Fit toggle on and off, writing and clearing ?fit=1', async () => {
    const user = userEvent.setup();
    renderAt('?ids=hornet&params=make');

    const toggle = screen.getByRole('button', { name: 'Fit to one page' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  // jsdom never lays anything out, so the hook's row half stays unmeasured
  // and the caption waits for Fit to be on before it commits to a number.
  it('says how many pages the comparison prints on once Fit is on', () => {
    renderAt('?ids=hornet&params=make&fit=1');
    expect(screen.getByText(/prints on 1 page$/)).toBeInTheDocument();
  });

  it('carries fit=1 into the Print / Save PDF URL once the toggle is on', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderAt('?ids=hornet&params=make');

    await user.click(screen.getByRole('button', { name: 'Fit to one page' }));
    await user.click(screen.getByRole('button', { name: 'Print / Save PDF' }));

    expect(open).toHaveBeenCalledTimes(1);
    const url = String(open.mock.calls[0]?.[0]);
    expect(url).toContain('fit=1');
    open.mockRestore();
  });

  it('names each equipment ALL tile for its group', () => {
    // No ids, so the equipment panel starts open.
    renderAt('');
    expect(screen.getByRole('button', { name: 'All SATCOM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All Radio' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'SATCOM' })).toBeInTheDocument();
  });

  // Unlike the retired library matrices, the well is unconditional here: a ragged
  // header would make two records look like different kinds of thing purely
  // because one of them has a picture.
  it('gives every column a photo well of the same size, photo or not', () => {
    renderAt('?ids=hornet,mpu5&params=make');
    expect(screen.getAllByTestId('compare-photo-well')).toHaveLength(2);
    expect(screen.getAllByLabelText('no photo')).toHaveLength(2);
  });

  it('renders a list cell as one chip per value', () => {
    renderAt('?ids=mpu5&params=waveforms');
    expect(onScreenOnly(screen.getAllByText('Waveforms'))).toHaveLength(1);
    expect(onScreenOnly(screen.getAllByText('MANET'))).toHaveLength(1);
  });
});

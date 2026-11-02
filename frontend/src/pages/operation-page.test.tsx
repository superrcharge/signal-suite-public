import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';

import { renderWithRoute, screen, within } from '@/test/utils';
import { ApiClientError } from '@/services/api-client';
import type { Equipment, GetOperationResponse, Participant, Platform } from '@/types';
import { OperationPage } from './operation-page';

const { mockParams } = vi.hoisted((): { mockParams: { id: string | undefined } } => ({ mockParams: { id: 'op-1' } }));

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useParams: () => mockParams,
}));

const GREEN: Participant = {
  id: 'p1', operation_id: 'op-1', organization_key: 'green',
  organization: { key: 'green', name: 'Green', short_label: 'GREEN', branch: 'USA', color: '#2E7D32', adhoc: false },
  platform_ids: [], equipment_ids: ['prc-152'], waveform_abbrevs: [], service_abbrevs: [], transport_ids: [],
  asset_phases: {},
  poc_name: 'Capt Lee', poc_phone: '', poc_email: '', notes: '',
  created_by: '', updated_by: '', created_at: '', updated_at: '2026-10-02T00:00:00Z',
};

const KILO: Participant = {
  id: 'p2', operation_id: 'op-1', organization_key: '',
  organization: { key: '', name: 'Task Force Kilo', short_label: 'TF KILO', branch: '', color: '', adhoc: true },
  platform_ids: ['ch-47'], equipment_ids: [], waveform_abbrevs: ['L16'], service_abbrevs: [], transport_ids: [],
  asset_phases: {},
  poc_name: '', poc_phone: '', poc_email: '', notes: '',
  created_by: '', updated_by: '', created_at: '', updated_at: '',
};

const RESPONSE: GetOperationResponse = {
  operation: {
    id: 'op-1',
    name: 'Operation Avalanche',
    acronym: '',
    status: 'active',
    start_date: '2026-10-01',
    end_date: '2026-10-14',
    notes: 'Line one\nLine two',
    created_by: '', updated_by: '', created_at: '', updated_at: '',
    participant_count: 2,
  },
  participants: [GREEN, KILO],
  phases: [],
  sites: [],
};

// With one location and a phase that places GREEN there and requires it to reach KILO: what the Web view draws.
const PLANNED: GetOperationResponse = {
  ...RESPONSE,
  phases: [{
    id: 'ph1', operation_id: 'op-1', position: 1, name: 'Phase I',
    supported_participant_id: null, placements: { p1: 's1' }, requirements: [{ id: 'r1', a: 'p1', b: 'p2' }],
  }],
  sites: [{ id: 's1', operation_id: 'op-1', position: 0, name: 'ISB' }],
};

const withParticipants = (participants: Participant[]): GetOperationResponse => ({
  operation: { ...RESPONSE.operation, participant_count: participants.length },
  participants,
  phases: [],
  sites: [],
});

const RADIOS: Equipment[] = [{
  id: 'prc-152', nomenclature: 'AN/PRC-152', terminal_type: 'radio', operational_mode: [],
  data: {
    services: [], waveforms: [{ abbrev: 'ANW2', name: 'ANW2' }], bands: [],
    standard_specs: {}, physical_specs: [], rf_specs: [], swap: {}, features: [],
  },
  created_by: '', updated_by: '', created_at: '', updated_at: '',
}];
// KILO's Chinook, which carries L16: the Matrix view draws what a platform
// supplies, and a bare waveform pick is no longer a source.
const PLATFORMS: Platform[] = [{
  id: 'ch-47', designation: 'CH-47F', popular_name: 'Chinook', category: ['USA'], type: 'aircraft',
  waveform_abbrevs: ['L16'], equipment_ids: [], notes: '',
  created_by: '', updated_by: '', created_at: '', updated_at: '',
}];
const WAVEFORMS = [
  { id: 'w1', abbrev: 'ANW2', name: 'Adaptive Networking Wideband' },
  { id: 'w2', abbrev: 'L16', name: 'Link 16' },
];

let operationState: { data: GetOperationResponse | undefined; isLoading: boolean; isError: boolean; error: unknown };

// Closed mock - every hook the render tree pulls must be listed: the
// sidebar/header hooks MainLayout mounts, the drawer's mutations, the
// board's catalog reads and the wizard's libraries and saves.
vi.mock('@/services', () => ({
  useOperation: () => operationState,
  useOperations: () => ({ data: undefined, isLoading: false, isError: false }),
  useCreateOperation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateOperation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteOperation: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveOperationPhases: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteParticipantById: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveOperationSites: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSavePhasePlan: () => ({ mutate: vi.fn(), isPending: false }),
  useOperationRfis: () => ({ data: { rfis: [] } }),
  useCreateRfi: () => ({ mutate: vi.fn(), isPending: false }),
  useAddRfiComment: () => ({ mutate: vi.fn(), isPending: false }),
  useResolveRfi: () => ({ mutate: vi.fn(), isPending: false }),
  useOrganizations: () => ({ data: { organizations: [], total: 0 }, isLoading: false }),
  useCreateOrganization: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEquipment: () => ({ data: { equipment: RADIOS, total: RADIOS.length }, isLoading: false, isError: false, error: null }),
  useWaveforms: () => ({ data: { waveforms: WAVEFORMS, total: WAVEFORMS.length }, isLoading: false, isError: false, error: null }),
  usePlatforms: () => ({ data: { platforms: PLATFORMS, total: PLATFORMS.length }, isLoading: false, isError: false, error: null }),
  useServices: () => ({ data: { services: [], total: 0 }, isLoading: false }),
  useTransports: () => ({ data: { transports: [], total: 0 }, isLoading: false }),
  useCreateParticipant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateParticipantById: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

const Probe = () => {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname + loc.search}</output>;
};

beforeEach(() => {
  canWritePace = true;
  mockParams.id = 'op-1';
  operationState = { data: RESPONSE, isLoading: false, isError: false, error: null };
});

// The page only, scoped to main: the header carries its own Operations nav
// button. Not used by the 404 cases, which render NotFoundPage outside
// MainLayout, nor once the drawer is open, which hides main from the tree.
const renderPage = (route = '/operations/op-1') => {
  renderWithRoute(<><OperationPage /><Probe /></>, route);
  return within(screen.getByRole('main'));
};
const renderBare = (route = '/operations/op-1') => {
  renderWithRoute(<><OperationPage /><Probe /></>, route);
};

describe('OperationPage', () => {
  it('names the operation in the banner and goes back to the picker', async () => {
    const user = userEvent.setup();
    const page = renderPage();
    expect(page.getByRole('heading', { name: 'Operation Avalanche' })).toBeInTheDocument();

    // The icon-only arrow, named Operations by its aria-label.
    await user.click(page.getByRole('button', { name: 'Operations' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations');
  });

  it('shows no status strip and no status word anywhere', () => {
    const page = renderPage();
    expect(screen.queryByTestId('operation-strip')).toBeNull();
    expect(page.queryByText('Active')).toBeNull();
    expect(page.queryByText(/Line one/)).toBeNull();
  });

  it('lays the banner out in three regions: the white back arrow, Participants and RFIs left, Loadout, the title, Matrix and Web centred, the amber Edit right (Join Operation lives in Participants)', () => {
    const page = renderPage();
    // Accessible names: the back control is an icon-only arrow whose name is
    // its aria-label, so textContent alone would read it as empty.
    const name = (b: HTMLElement) => b.getAttribute('aria-label') ?? b.textContent;
    const names = (region: string) =>
      within(screen.getByTestId(region)).queryAllByRole('button').map(name);
    expect(names('banner-left')).toEqual(['Operations', 'Participants (2)', 'RFIs']);
    expect(names('banner-centre')).toEqual(['Loadout', 'Matrix', 'Web']);
    expect(within(screen.getByTestId('banner-centre')).getByRole('heading', { name: 'Operation Avalanche' })).toBeInTheDocument();
    expect(names('banner-right')).toEqual(['Edit']);
    // Reading order across the bar: the three regions are siblings in that
    // order, and the title sits between the two view chips.
    const banner = screen.getByTestId('banner-left').parentElement!;
    expect(within(banner).getAllByRole('button').map(name))
      .toEqual(['Operations', 'Participants (2)', 'RFIs', 'Loadout', 'Matrix', 'Web', 'Edit']);
    const centre = screen.getByTestId('banner-centre');
    expect(Array.from(centre.children).map((el) => el.textContent)).toEqual(['Loadout', 'Operation Avalanche', 'Matrix', 'Web']);
    expect(page.getByRole('heading', { name: 'Operation Avalanche' })).toBeInTheDocument();
    // No second matrix: the catalog's joint matrix is the only one.
    expect(page.queryByRole('button', { name: 'Compatibility' })).toBeNull();
  });

  it('names the operation by its full name in the banner, never its acronym', () => {
    operationState = { data: { ...RESPONSE, operation: { ...RESPONSE.operation, acronym: 'AV' } }, isLoading: false, isError: false, error: null };
    const page = renderPage();
    expect(page.getByRole('heading', { name: 'Operation Avalanche' })).toBeInTheDocument();
    expect(page.queryByText('AV')).toBeNull();
  });

  it('shows a viewer Participants on the left, the view chips round the title, and nothing on the right', () => {
    canWritePace = false;
    renderPage();
    const name = (b: HTMLElement) => b.getAttribute('aria-label') ?? b.textContent;
    expect(within(screen.getByTestId('banner-left')).getAllByRole('button').map(name)).toEqual(['Operations', 'Participants (2)', 'RFIs']);
    expect(within(screen.getByTestId('banner-centre')).getByRole('heading', { name: 'Operation Avalanche' })).toBeInTheDocument();
    expect(within(screen.getByTestId('banner-right')).queryAllByRole('button')).toHaveLength(0);
    const banner = screen.getByTestId('banner-left').parentElement!;
    expect(within(banner).getAllByRole('button').map(name)).toEqual(['Operations', 'Participants (2)', 'RFIs', 'Loadout', 'Matrix', 'Web']);
  });

  it('404s an operation the server does not have', () => {
    operationState = {
      data: undefined, isLoading: false, isError: true,
      error: new ApiClientError('OPERATION_NOT_FOUND', 'operation not found', undefined, 404),
    };
    renderBare();
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  it('404s a route with no id rather than rendering an empty page', () => {
    mockParams.id = undefined;
    operationState = { data: undefined, isLoading: false, isError: false, error: null };
    renderBare('/operations/');
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  it('says any other failure in an alert, with the server’s message', () => {
    operationState = {
      data: undefined, isLoading: false, isError: true,
      error: new ApiClientError('INTERNAL', 'database is unavailable', undefined, 500),
    };
    const page = renderPage();
    expect(page.getByRole('alert')).toHaveTextContent('database is unavailable');
    expect(screen.queryByText('Page Not Found')).not.toBeInTheDocument();
  });

  it('falls back to a plain sentence for an error with no message', () => {
    operationState = { data: undefined, isLoading: false, isError: true, error: new TypeError('fetch failed') };
    const page = renderPage();
    expect(page.getByRole('alert')).toHaveTextContent('Could not load the operation');
  });
});

describe('OperationPage edit drawer', () => {
  it('offers Edit to a PACE writer, and the click opens the drawer through the URL', async () => {
    const user = userEvent.setup();
    const page = renderPage();
    await user.click(page.getByRole('button', { name: 'Edit' }));

    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?drawer=edit');
    expect(screen.getByRole('heading', { name: 'Edit Operation' })).toBeInTheDocument();
  });

  it('opens on ?drawer=edit with the operation prefilled, and closing drops the param', async () => {
    const user = userEvent.setup();
    renderBare('/operations/op-1?drawer=edit');
    expect(screen.getByRole('heading', { name: 'Edit Operation' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('Operation Avalanche');

    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1');
    expect(screen.queryByRole('heading', { name: 'Edit Operation' })).not.toBeInTheDocument();
  });

  it('hides Edit from a viewer and ignores ?drawer=edit for one', () => {
    canWritePace = false;
    const page = renderPage('/operations/op-1?drawer=edit');
    expect(page.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit Operation' })).not.toBeInTheDocument();
    // The page itself refuses nobody.
    expect(page.getByRole('heading', { name: 'Operation Avalanche' })).toBeInTheDocument();
  });
});

describe('OperationPage RFIs', () => {
  it('reads RFIs (2) when the operation carries two open RFIs', () => {
    operationState = {
      data: { ...RESPONSE, operation: { ...RESPONSE.operation, open_rfi_count: 2 } },
      isLoading: false, isError: false, error: null,
    };
    const page = renderPage();
    expect(page.getByRole('button', { name: 'RFIs (2)' })).toBeInTheDocument();
  });

  it('opens through the URL and closing drops the param', async () => {
    const user = userEvent.setup();
    const page = renderPage();
    await user.click(page.getByRole('button', { name: 'RFIs' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?dialog=rfis');
    const popup = within(screen.getByRole('dialog', { name: /RFIs/ }));
    expect(popup.getByText('No open RFIs.')).toBeInTheDocument();
    await user.click(popup.getByRole('button', { name: 'close' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1');
  });

  it('opens on ?dialog=rfis for a viewer, without Post RFI', () => {
    canWritePace = false;
    renderBare('/operations/op-1?dialog=rfis');
    const popup = within(screen.getByRole('dialog', { name: /RFIs/ }));
    expect(popup.getByText('No open RFIs.')).toBeInTheDocument();
    expect(popup.queryByRole('button', { name: 'Post RFI' })).toBeNull();
  });
});

describe('OperationPage participants popup', () => {
  const popup = () => within(screen.getByRole('dialog', { name: /Participants/ }));

  it('opens from the banner through the URL, lists who joined, and closing drops the param', async () => {
    const user = userEvent.setup();
    const page = renderPage();
    await user.click(page.getByRole('button', { name: 'Participants (2)' }));

    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?dialog=participants');
    expect(popup().getByText('2 have joined Operation Avalanche')).toBeInTheDocument();
    expect(popup().getByText('GREEN')).toBeInTheDocument();
    expect(popup().getByText('TF KILO')).toBeInTheDocument();

    await user.click(popup().getByRole('button', { name: 'close' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1');
  });

  it('opens on ?dialog=participants for a viewer, without the write controls', () => {
    canWritePace = false;
    renderBare('/operations/op-1?dialog=participants');
    expect(popup().getByText('GREEN')).toBeInTheDocument();
    expect(popup().queryByRole('button', { name: 'Join Operation' })).toBeNull();
    expect(popup().queryByRole('button', { name: /^Edit / })).toBeNull();
  });

  it('its Join Operation moves the URL to the wizard', async () => {
    const user = userEvent.setup();
    renderBare('/operations/op-1?dialog=participants');
    await user.click(popup().getByRole('button', { name: 'Join Operation' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?dialog=join');
    expect(screen.getByRole('heading', { name: 'Joining Operation Avalanche' })).toBeInTheDocument();
  });

  it('its Edit moves the URL to the wizard in edit mode for that row', async () => {
    const user = userEvent.setup();
    renderBare('/operations/op-1?dialog=participants');
    await user.click(popup().getByRole('button', { name: 'Edit TF KILO' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?dialog=join&pid=p2');
    expect(screen.getByRole('heading', { name: 'Editing TF KILO - Operation Avalanche' })).toBeInTheDocument();
  });

  it('a row click closes it and opens that participant’s tab on Loadout, dropping the dialog params and view but keeping phase', async () => {
    const user = userEvent.setup();
    renderBare('/operations/op-1?view=web&dialog=participants&phase=ph1');
    await user.click(popup().getByRole('button', { name: 'Open TF KILO' }));

    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?phase=ph1&unit=p2');
    expect(screen.queryByRole('dialog', { name: /Participants/ })).toBeNull();
    const page = within(screen.getByRole('main'));
    expect(page.getByRole('button', { name: 'Loadout' })).toHaveAttribute('aria-pressed', 'true');
    expect(page.getByRole('tab', { name: 'TF KILO' })).toHaveAttribute('aria-selected', 'true');
    expect(page.getByRole('tabpanel', { name: 'TF KILO' })).toBeInTheDocument();
  });

  it('a row click works for a viewer, who has no Edit in the row', async () => {
    canWritePace = false;
    const user = userEvent.setup();
    renderBare('/operations/op-1?dialog=participants');
    await user.click(popup().getByRole('button', { name: 'Open GREEN' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?unit=p1');
    expect(screen.queryByRole('dialog', { name: /Participants/ })).toBeNull();
  });
});

describe('OperationPage join wizard', () => {
  it('opens in create mode from the Participants popup through the URL, and closing drops the param', async () => {
    const user = userEvent.setup();
    renderPage();
    // Not in the banner (maintainer, 2026-10-12): Join Operation is the popup's own action.
    expect(within(screen.getByTestId('banner-right')).queryByRole('button', { name: 'Join Operation' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Participants (2)' }));
    await user.click(within(screen.getByRole('dialog', { name: /Participants/ })).getByRole('button', { name: 'Join Operation' }));

    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?dialog=join');
    expect(screen.getByRole('heading', { name: 'Joining Operation Avalanche' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1');
    expect(screen.queryByRole('heading', { name: 'Joining Operation Avalanche' })).toBeNull();
  });

  it('opens in edit mode on ?dialog=join&pid=, on step 2 (Platform) with the row prefilled, and closing drops both params', async () => {
    const user = userEvent.setup();
    renderBare('/operations/op-1?dialog=join&pid=p1');
    expect(screen.getByRole('heading', { name: 'Editing GREEN - Operation Avalanche' })).toBeInTheDocument();
    const steps = within(screen.getByRole('group', { name: 'Steps' }));
    expect(steps.getByRole('button', { name: '2 Platform' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1');
  });

  it('falls back to create mode for a pid no row has', () => {
    renderBare('/operations/op-1?dialog=join&pid=gone');
    expect(screen.getByRole('heading', { name: 'Joining Operation Avalanche' })).toBeInTheDocument();
  });

  it('never opens for a viewer', () => {
    canWritePace = false;
    const page = renderPage('/operations/op-1?dialog=join');
    expect(screen.queryByRole('heading', { name: 'Joining Operation Avalanche' })).toBeNull();
    expect(page.queryByRole('button', { name: 'Join Operation' })).toBeNull();
  });
});

describe('OperationPage body', () => {
  it('gives a writer with no participants the Join Operation prompt, which opens the wizard', async () => {
    const user = userEvent.setup();
    operationState = { data: withParticipants([]), isLoading: false, isError: false, error: null };
    const page = renderPage();
    expect(page.getByRole('button', { name: 'Participants (0)' })).toBeInTheDocument();
    expect(page.queryByRole('region')).toBeNull();
    expect(page.queryByRole('tab')).toBeNull();

    // One Join Operation button: the empty view's prompt; the banner has none.
    const joins = page.getAllByRole('button', { name: 'Join Operation' });
    expect(joins).toHaveLength(1);
    await user.click(joins[0]!);
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?dialog=join');
  });

  it('tells a viewer no one has joined, with no button', () => {
    canWritePace = false;
    operationState = { data: withParticipants([]), isLoading: false, isError: false, error: null };
    const page = renderPage();
    expect(page.getByText('No one has joined yet.')).toBeInTheDocument();
    expect(page.queryByRole('button', { name: 'Join Operation' })).toBeNull();
  });

  it('draws a board tab per participant and the open one’s panel, with the equipment resolved through the catalog', () => {
    const page = renderPage();
    expect(page.getAllByRole('tab').map((t) => t.textContent)).toEqual(['GREEN', 'TF KILO']);
    const green = within(page.getByRole('tabpanel', { name: 'GREEN' }));
    expect(green.getByText('AN/PRC-152')).toBeInTheDocument();
    expect(page.queryByRole('tabpanel', { name: 'TF KILO' })).toBeNull();
  });

  it('?unit= opens that participant’s tab, which a click on another tab writes into the URL', async () => {
    const user = userEvent.setup();
    renderBare('/operations/op-1?unit=p2');
    const page = within(screen.getByRole('main'));
    expect(page.getByRole('tab', { name: 'TF KILO' })).toHaveAttribute('aria-selected', 'true');
    expect(within(page.getByRole('tabpanel', { name: 'TF KILO' })).getByText('CH-47F')).toBeInTheDocument();

    await user.click(page.getByRole('tab', { name: 'GREEN' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?unit=p1');
    expect(page.getByRole('tabpanel', { name: 'GREEN' })).toBeInTheDocument();
  });

  it('presses Loadout by default and draws the board, with no matrix', () => {
    const page = renderPage();
    const group = within(page.getByRole('group', { name: 'View' }));
    expect(group.getByRole('button', { name: 'Loadout' })).toHaveAttribute('aria-pressed', 'true');
    expect(group.getByRole('button', { name: 'Matrix' })).toHaveAttribute('aria-pressed', 'false');
    expect(page.getByRole('tabpanel', { name: 'GREEN' })).toBeInTheDocument();
    expect(page.queryByRole('table')).toBeNull();
  });

  it('?view=cards, the retired name of Loadout, opens on Loadout like any unknown value', () => {
    renderBare('/operations/op-1?view=cards');
    const page = within(screen.getByRole('main'));
    expect(page.getByRole('button', { name: 'Loadout' })).toHaveAttribute('aria-pressed', 'true');
    expect(page.queryByRole('button', { name: 'Cards' })).toBeNull();
    expect(page.getByRole('tabpanel', { name: 'GREEN' })).toBeInTheDocument();
  });

  it('?view=units, the name before Loadout, opens on Loadout, with no Units chip and the tabs named Loadout', () => {
    renderBare('/operations/op-1?view=units');
    const page = within(screen.getByRole('main'));
    expect(within(page.getByRole('group', { name: 'View' })).getByRole('button', { name: 'Loadout' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(page.getByRole('group', { name: 'View' })).queryByRole('button', { name: 'Units' })).toBeNull();
    expect(page.getByRole('tablist', { name: 'Loadout' })).toBeInTheDocument();
    expect(page.getByRole('tabpanel', { name: 'GREEN' })).toBeInTheDocument();
  });

  it('?view=matrix presses Matrix and draws the participants as matrix columns instead of the board', () => {
    renderBare('/operations/op-1?view=matrix');
    const page = within(screen.getByRole('main'));
    expect(page.getByRole('button', { name: 'Matrix' })).toHaveAttribute('aria-pressed', 'true');
    expect(page.getByRole('button', { name: 'Loadout' })).toHaveAttribute('aria-pressed', 'false');
    expect(page.queryByRole('tabpanel')).toBeNull();
    const headers = page.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers[1]).toContain('GREEN');
    expect(headers[2]).toContain('TF KILO');
    // GREEN brought the PRC-152, which carries ANW2; KILO picked L16 directly.
    expect(page.getAllByRole('rowheader').map((r) => r.textContent).join(' ')).toMatch(/ANW2.*L16/);
    // No heading over the grid: the banner's title is the only one naming the operation.
    expect(page.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('?view=web presses Web and draws the phase picture instead of the board or the matrix', async () => {
    operationState = { data: PLANNED, isLoading: false, isError: false, error: null };
    renderBare('/operations/op-1?view=web');
    const page = within(screen.getByRole('main'));
    expect(page.getByRole('button', { name: 'Web' })).toHaveAttribute('aria-pressed', 'true');
    expect(page.getByRole('button', { name: 'Matrix' })).toHaveAttribute('aria-pressed', 'false');
    // The View group's chip: the picture's own Colour switch also has a Units button.
    expect(within(page.getByRole('group', { name: 'View' })).getByRole('button', { name: 'Loadout' })).toHaveAttribute('aria-pressed', 'false');
    expect(page.queryByRole('tabpanel')).toBeNull();
    expect(page.queryByRole('table')).toBeNull();
    // Two units, ISB and No location boxes, and the one requirement between them as a line.
    expect(await page.findByRole('img', { name: /Who must talk to whom/ })).toBeInTheDocument();
    expect(page.getAllByTestId('phase-unit')).toHaveLength(2);
    expect(page.getAllByTestId('phase-box-title').map((t) => t.textContent)).toEqual(['ISB', 'No location']);
    expect(page.getAllByTestId('phase-line')).toHaveLength(1);
    expect(page.queryByRole('button', { name: 'Hubs' })).toBeNull();
    expect(page.getByRole('region', { name: 'Phase I: who must talk to whom' })).toBeInTheDocument();
  });

  it('ends the banner on Web only with the standard share then Print / Save PDF, Edit to their left', () => {
    operationState = { data: PLANNED, isLoading: false, isError: false, error: null };
    renderBare('/operations/op-1?view=web');
    const names = within(screen.getByTestId('banner-right')).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(['Edit', 'share this sheet', 'Print / Save PDF']);
  });

  it('gives a reader the share menu and Print on Web too, as the only controls on the right', () => {
    canWritePace = false;
    operationState = { data: PLANNED, isLoading: false, isError: false, error: null };
    renderBare('/operations/op-1?view=web');
    expect(within(screen.getByTestId('banner-right')).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent))
      .toEqual(['share this sheet', 'Print / Save PDF']);
  });

  // Matrix gained the share menu on 2026-10-12 (maintainer: "Mirror Web"); Loadout, the board, still has nothing to export.
  it('has no share menu on Loadout', () => {
    operationState = { data: PLANNED, isLoading: false, isError: false, error: null };
    renderBare('/operations/op-1');
    expect(screen.queryByRole('button', { name: 'share this sheet' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Print / Save PDF' })).toBeNull();
  });

  it('ends the banner on Matrix with the same Edit, share, Print / Save PDF as Web', () => {
    operationState = { data: PLANNED, isLoading: false, isError: false, error: null };
    renderBare('/operations/op-1?view=matrix');
    const names = within(screen.getByTestId('banner-right')).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(['Edit', 'share this sheet', 'Print / Save PDF']);
  });

  it('gives a reader the share menu and Print on Matrix too, as the only controls on the right', () => {
    canWritePace = false;
    operationState = { data: PLANNED, isLoading: false, isError: false, error: null };
    renderBare('/operations/op-1?view=matrix');
    expect(within(screen.getByTestId('banner-right')).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent))
      .toEqual(['share this sheet', 'Print / Save PDF']);
  });

  it('marks the Matrix view\'s paper as the sheet the .png and the clipboard capture', () => {
    operationState = { data: PLANNED, isLoading: false, isError: false, error: null };
    renderBare('/operations/op-1?view=matrix');
    const roots = document.querySelectorAll('[data-sheet-root]');
    expect(roots).toHaveLength(1);
    expect(roots[0]!.contains(screen.getByRole('table', { name: 'Operation interoperability matrix' }))).toBe(true);
  });

  it('marks the Web view\'s paper as the sheet the .png and the clipboard capture', async () => {
    operationState = { data: PLANNED, isLoading: false, isError: false, error: null };
    renderBare('/operations/op-1?view=web');
    await screen.findAllByTestId('phase-unit');
    const roots = document.querySelectorAll('[data-sheet-root]');
    expect(roots).toHaveLength(1);
    expect(roots[0]!.contains(screen.getByRole('region', { name: 'Phase I: who must talk to whom' }))).toBe(true);
  });

  it('gives a writer the planning panel on Web', () => {
    operationState = { data: PLANNED, isLoading: false, isError: false, error: null };
    renderBare('/operations/op-1?view=web');
    expect(screen.getByRole('region', { name: 'Plan for Phase I' })).toBeInTheDocument();
  });

  it('shows a reader no planning panel on Web', async () => {
    canWritePace = false;
    operationState = { data: PLANNED, isLoading: false, isError: false, error: null };
    renderBare('/operations/op-1?view=web');
    expect(screen.queryByRole('region', { name: /^Plan for/ })).toBeNull();
    expect(await screen.findAllByTestId('phase-unit')).toHaveLength(2);
  });

  it('?view=links is retired and opens on Loadout like any unknown value', () => {
    renderBare('/operations/op-1?view=links');
    const page = within(screen.getByRole('main'));
    expect(page.getByRole('button', { name: 'Loadout' })).toHaveAttribute('aria-pressed', 'true');
    expect(page.getByRole('tabpanel', { name: 'GREEN' })).toBeInTheDocument();
    expect(page.queryByTestId('phase-unit')).toBeNull();
  });

  it('clicking Web writes ?view=web, Matrix swaps it, and Loadout drops it', async () => {
    const user = userEvent.setup();
    operationState = { data: PLANNED, isLoading: false, isError: false, error: null };
    const page = renderPage();
    await user.click(page.getByRole('button', { name: 'Web' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?view=web');
    expect(await within(screen.getByRole('main')).findAllByTestId('phase-unit')).toHaveLength(2);

    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Matrix' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?view=matrix');

    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Loadout' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1');
  });

  it('keeps ?phase= when the view changes, and offers the phase switch on Matrix and Web but not Loadout', async () => {
    const user = userEvent.setup();
    const plan = { supported_participant_id: null, placements: {}, requirements: [] };
    const phases = [
      { id: 'ph1', operation_id: 'op-1', position: 1, name: 'Phase I', ...plan },
      { id: 'ph2', operation_id: 'op-1', position: 2, name: 'Phase II', ...plan },
    ];
    operationState = { data: { ...RESPONSE, phases }, isLoading: false, isError: false, error: null };
    renderBare('/operations/op-1?view=matrix&phase=ph2');
    const main = () => within(screen.getByRole('main'));
    expect(main().getByRole('button', { name: 'Phase II' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(main().getByRole('button', { name: 'Web' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?view=web&phase=ph2');
    expect(main().getByRole('button', { name: 'Phase II' })).toHaveAttribute('aria-pressed', 'true');
    // Web is always about one phase, so there is no All phases to go back to.
    expect(main().queryByRole('button', { name: 'All phases' })).toBeNull();

    await user.click(within(main().getByRole('group', { name: 'View' })).getByRole('button', { name: 'Loadout' }));
    expect(main().queryByRole('group', { name: 'Phase' })).toBeNull();
  });

  it('clicking Matrix writes ?view=matrix, and Loadout drops it again', async () => {
    const user = userEvent.setup();
    const page = renderPage();
    await user.click(page.getByRole('button', { name: 'Matrix' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?view=matrix');
    expect(within(screen.getByRole('main')).getByRole('table')).toBeInTheDocument();

    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Loadout' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1');
    expect(within(screen.getByRole('main')).getByRole('tabpanel', { name: 'GREEN' })).toBeInTheDocument();
  });

  it('a unit’s Edit opens the wizard in edit mode for that row', async () => {
    const user = userEvent.setup();
    const page = renderPage();
    await user.click(within(page.getByRole('tabpanel', { name: 'GREEN' })).getByRole('button', { name: 'Edit GREEN' }));
    expect(screen.getByTestId('location').textContent).toBe('/operations/op-1?dialog=join&pid=p1');
    expect(screen.getByRole('heading', { name: 'Editing GREEN - Operation Avalanche' })).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { cleanup, render, screen, waitFor, within } from '@/test/utils';
import { ApiClientError } from '@/services/api-client';
import { SECTION_COLOR_PALETTE, STATUS_COLORS } from '@/theme/asset-colors';
import type {
  CreateParticipantRequest, Equipment, GetOperationResponse, Operation, Organization, Participant, Phase, Platform,
  SavePhasePlanRequest, Site, UpdateParticipantRequest,
} from '@/types';
import { JoinOperationDialog } from './join-operation-dialog';
import type { JoinStep } from './join-operation-dialog';

/**
 * Mounted on its own: the page that opens it is the next slice, and the
 * bodies a Join sends, the 409 and the edit-mode PATCH are what matter here.
 */

const spies = vi.hoisted(() => ({
  create: vi.fn<(args: { operationId: string; data: CreateParticipantRequest }) => Promise<Participant>>(),
  update: vi.fn<(args: { operationId: string; participantId: string; data: UpdateParticipantRequest }) => Promise<Participant>>(),
  createOrg: vi.fn<(data: Partial<Organization> & { key: string; name: string }) => Promise<Organization>>(),
  savePlan: vi.fn<(args: { operationId: string; phaseId: string; data: SavePhasePlanRequest }) => Promise<void>>(),
  saveSites: vi.fn<(args: { operationId: string; data: { sites: { id?: string; name: string }[] } }) => Promise<Site[]>>(),
}));

// What `useOperation` returns: nothing until a test is about phase plans, which
// is how the page's own query reads before it has loaded.
const opState = vi.hoisted((): { data: GetOperationResponse | undefined } => ({ data: undefined }));

const stamps = { created_by: 't', updated_by: 't', created_at: '', updated_at: '' };
const ORGS = [
  { key: 'green', name: 'Green', short_label: 'GREEN', branch: 'USA', color: '#2E7D32', section_key: 'asqd', notes: '', operation_count: 1, ...stamps },
  { key: 'blue', name: 'Blue', short_label: 'BLUE', branch: 'USN', color: '#1565C0', section_key: '', notes: '', operation_count: 0, ...stamps },
  { key: 'oga_1', name: 'Other Agency', short_label: '', branch: '', color: '', section_key: '', notes: '', operation_count: 0, ...stamps },
];
const SECTIONS = [{ key: 'asqd', label: 'A Squadron', color: '#000' }];
const radioData = (waveforms: string[], services: string[]): Equipment['data'] => ({
  services: services.map(a => ({ abbrev: a, name: a })),
  waveforms: waveforms.map(a => ({ abbrev: a, name: a })),
  bands: [], standard_specs: {}, physical_specs: [], rf_specs: [], swap: {}, features: [],
});
const EQUIPMENT: Equipment[] = [
  { id: 'tsc-198', nomenclature: 'AN/TSC-198', nickname: 'Phoenix', terminal_type: 'satcom', operational_mode: [], ...stamps },
  { id: 'prc-117', nomenclature: 'AN/PRC-117G', nickname: 'Manpack', terminal_type: 'radio', operational_mode: [], data: radioData(['SRW', 'ANW2'], ['WGS']), ...stamps },
  { id: 'prc-152', nomenclature: 'AN/PRC-152', nickname: '', terminal_type: 'radio', operational_mode: [], ...stamps },
];
const WAVEFORMS = [
  { id: 'w1', abbrev: 'SRW', name: 'Soldier Radio Waveform', description: '', ...stamps },
  { id: 'w2', abbrev: 'ANW2', name: '', description: '', ...stamps },
  { id: 'w3', abbrev: 'L16', name: 'Link 16', description: '', ...stamps },
];
const SERVICES = [{ id: 's1', abbrev: 'WGS', name: 'Wideband Global SATCOM', description: '', ...stamps }];
const TRANSPORTS = [{ id: 't1', name: 'Base fiber', kind: 'fiber', provider: '', description: '', owned_by: '', owner_country: '', ...stamps }];
// A Black Hawk carrying MUOS of its own and listing the PRC-117, and a
// Stryker with nothing typed against it.
const PLATFORMS: Platform[] = [
  { id: 'uh-60', designation: 'UH-60M', popular_name: 'Black Hawk', category: ['USA'], type: 'aircraft', waveform_abbrevs: ['MUOS'], equipment_ids: ['prc-117'], notes: '', ...stamps },
  { id: 'stryker', designation: 'M1126', popular_name: 'Stryker', category: ['USA', 'USMC'], type: 'ground vehicle', waveform_abbrevs: [], equipment_ids: [], notes: '', ...stamps },
];

vi.mock('@/services', () => ({
  useOrganizations: () => ({ data: { organizations: ORGS, total: ORGS.length }, isLoading: false }),
  useSections: () => ({ data: SECTIONS, isLoading: false }),
  useCreateOrganization: () => ({ mutateAsync: spies.createOrg, isPending: false }),
  useEquipment: () => ({ data: { equipment: EQUIPMENT, total: EQUIPMENT.length }, isLoading: false }),
  usePlatforms: () => ({ data: { platforms: PLATFORMS, total: PLATFORMS.length }, isLoading: false }),
  useWaveforms: () => ({ data: { waveforms: WAVEFORMS, total: WAVEFORMS.length }, isLoading: false }),
  useServices: () => ({ data: { services: SERVICES, total: SERVICES.length }, isLoading: false }),
  useTransports: () => ({ data: { transports: TRANSPORTS, total: TRANSPORTS.length }, isLoading: false }),
  useCreateParticipant: () => ({ mutateAsync: spies.create, isPending: false }),
  useUpdateParticipantById: () => ({ mutateAsync: spies.update, isPending: false }),
  useSavePhasePlan: () => ({ mutateAsync: spies.savePlan, isPending: false }),
  useSaveOperationSites: () => ({ mutateAsync: spies.saveSites, isPending: false }),
  useOperation: () => ({ data: opState.data }),
}));

const OPERATION: Operation = {
  id: 'op-1', name: 'Operation Avalanche', acronym: '', status: 'active', start_date: '2026-10-01', end_date: '',
  notes: '', participant_count: 1, created_by: '', updated_by: '', created_at: '', updated_at: '',
};

const GREEN: Participant = {
  id: 'p1', operation_id: 'op-1', organization_key: 'green',
  organization: { key: 'green', name: 'Green', short_label: 'GREEN', branch: 'USA', color: '#2E7D32', adhoc: false },
  platform_ids: [], equipment_ids: ['tsc-198'], waveform_abbrevs: ['SRW'], service_abbrevs: [], transport_ids: [],
  asset_phases: {},
  poc_name: 'Capt Lee', poc_phone: '', poc_email: '', notes: '',
  created_by: 't', updated_by: 't', created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
};

const EMPTY_PICKS = {
  platform_ids: [], equipment_ids: [], waveform_abbrevs: [], service_abbrevs: [], transport_ids: [],
  poc_name: '', poc_phone: '', poc_email: '', notes: '',
};

const savedRow = (over: Partial<Participant>): Participant => ({ ...GREEN, id: 'p-new', ...over });

beforeEach(() => {
  spies.create.mockReset().mockResolvedValue(savedRow({ organization_key: 'blue' }));
  spies.update.mockReset().mockResolvedValue(GREEN);
  spies.savePlan.mockReset().mockResolvedValue(undefined);
  spies.saveSites.mockReset().mockImplementation(({ data }) => Promise.resolve(data.sites.map((x, i) => ({
    id: x.id ?? `s-new-${String(i)}`, operation_id: 'op-1', position: i + 1, name: x.name,
  }))));
  opState.data = undefined;
  spies.createOrg.mockReset().mockImplementation(data =>
    Promise.resolve({ short_label: '', branch: '', color: '', section_key: '', notes: '', operation_count: 0, ...stamps, ...data }));
});

function setup({ participant, initialStep, participants = [GREEN], operation = OPERATION, phases }: { participant?: Participant; initialStep?: JoinStep; participants?: Participant[]; operation?: Operation; phases?: Phase[] } = {}) {
  const onClose = vi.fn();
  const onJoined = vi.fn();
  render(
    <JoinOperationDialog
      open
      operation={operation}
      phases={phases}
      participants={participants}
      participant={participant}
      initialStep={initialStep}
      onClose={onClose}
      onJoined={onJoined}
    />,
  );
  return { user: userEvent.setup(), onClose, onJoined };
}

function rerenderable(participant: Participant) {
  return (
    <JoinOperationDialog
      open
      operation={OPERATION}
      participants={[GREEN]}
      participant={participant}
      onClose={vi.fn()}
    />
  );
}

function setupRerenderable({ participant }: { participant: Participant }) {
  const view = render(rerenderable(participant));
  return { user: userEvent.setup(), view };
}

const steps = () => within(screen.getByRole('group', { name: 'Steps' }));
const stepButton = (label: string) => steps().getByRole('button', { name: label });
const orgRow = (name: string) => within(screen.getByRole('group', { name: 'Organizations' })).getByRole('button', { name: new RegExp(name) });
// Back and Continue carry their destination ("Back to step 2", "Continue to
// step 4"), so a bare label matches by prefix; every other button matches whole.
const primary = (name: string) =>
  screen.getByRole('button', { name: name === 'Back' || name === 'Continue' ? new RegExp(`^${name}( to step \\d)?$`) : name });

describe('JoinOperationDialog step 1', () => {
  it('opens on step 1 with the later steps and Join disabled until an organization is named', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Joining Operation Avalanche' })).toBeInTheDocument();
    expect(stepButton('1 Organization')).toHaveAttribute('aria-current', 'step');
    for (const label of ['2 Platform', '3 Equipment', '4 Gear & phases', '5 Transports', '6 Comms links', '7 Contact', '8 Review']) {
      expect(stepButton(label)).toBeDisabled();
    }
    expect(primary('Join now, add equipment later')).toBeDisabled();
    expect(primary('Continue')).toBeDisabled();
    expect(primary('Back')).toBeDisabled();
  });

  it('keeps the step strip outside the scrolling body, with no band behind it', () => {
    setup();
    const strip = screen.getByRole('group', { name: 'Steps' });
    expect(strip.closest('.MuiDialogContent-root')).toBeNull();
    expect(['', 'transparent', 'rgba(0, 0, 0, 0)']).toContain(getComputedStyle(strip).backgroundColor);
  });

  it('anchors the dialog to the top at a fixed width, so only the bottom edge moves', () => {
    setup();
    const container = document.querySelector('.MuiDialog-container');
    if (!container) throw new Error('no dialog container');
    expect(getComputedStyle(container).alignItems).toBe('flex-start');
    const paper = document.querySelector('.MuiDialog-paper');
    if (!paper) throw new Error('no dialog paper');
    expect(getComputedStyle(paper).width).toBe('1200px');
    expect(getComputedStyle(paper).maxHeight).toBe(`${window.innerHeight - 64}px`);
  });

  it('colours the tiles in as the wizard progresses: done and current are filled, ahead are not, and only the current one is aria-current', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('3 Equipment'));
    const states = Array.from(screen.getByRole('group', { name: 'Steps' }).querySelectorAll('button')).map((b) => b.getAttribute('data-state'));
    expect(states).toEqual(['done', 'done', 'current', 'todo', 'todo', 'todo', 'todo', 'todo']);
    const current = Array.from(screen.getByRole('group', { name: 'Steps' }).querySelectorAll('button[aria-current="step"]'));
    expect(current.map((b) => b.textContent)).toEqual(['3 Equipment']);
    await user.click(stepButton('7 Contact'));
    const later = Array.from(screen.getByRole('group', { name: 'Steps' }).querySelectorAll('button')).map((b) => b.getAttribute('data-state'));
    expect(later).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'current', 'todo']);
  });

  it('draws the steps as a progression: filled up to and including the active, amber-outlined ahead, a chevron between each pair', async () => {
    const { user } = setup();
    const strip = screen.getByRole('group', { name: 'Steps' });
    // Six chevrons for seven tiles, decorative and hidden from the tree.
    const chevrons = Array.from(strip.querySelectorAll('span[aria-hidden="true"]'));
    expect(chevrons.map((c) => c.textContent)).toEqual(['›', '›', '›', '›', '›', '›', '›']);
    expect(chevrons[0]).toHaveStyle({ fontSize: '14px', color: 'var(--shf-graphite-400)' });
    // The tiles and the glyphs alternate, so the order is tile, chevron, tile, and so on.
    expect(Array.from(strip.children).map((el) => el.tagName)).toEqual([
      'BUTTON', 'SPAN', 'BUTTON', 'SPAN', 'BUTTON', 'SPAN', 'BUTTON', 'SPAN', 'BUTTON', 'SPAN', 'BUTTON', 'SPAN', 'BUTTON', 'SPAN', 'BUTTON',
    ]);

    await user.click(orgRow('Blue'));
    await user.click(stepButton('3 Equipment'));
    const look = (label: string) => {
      const { background, color, border } = stepButton(label).style;
      return { background, color, border };
    };
    for (const label of ['1 Organization', '2 Platform', '3 Equipment']) {
      expect(look(label)).toEqual({ background: 'var(--shf-amber)', color: 'var(--shf-black)', border: '1px solid var(--shf-amber)' });
    }
    for (const label of ['4 Gear & phases', '5 Transports', '6 Comms links', '7 Contact', '8 Review']) {
      expect(look(label)).toEqual({ background: 'transparent', color: 'var(--shf-amber)', border: '1px solid var(--shf-amber)' });
    }
  });

  it('titles the wizard with the full operation name, never the acronym, and shows no step heading or caption', async () => {
    const { user } = setup({ operation: { ...OPERATION, acronym: 'AV' } });
    expect(screen.getByRole('heading', { name: 'Joining Operation Avalanche' })).toBeInTheDocument();
    expect(screen.queryByText('AV')).toBeNull();
    expect(screen.queryByText('Select your organization')).toBeNull();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('2 Platform'));
    expect(screen.queryByText('Declare your platform')).toBeNull();
    expect(screen.queryByText(/Skip this if you are dismounted/)).toBeNull();
    expect(screen.queryByText(/Clears the picks below/)).toBeNull();
    await user.click(stepButton('3 Equipment'));
    expect(screen.queryByText('Add equipment')).toBeNull();
    await user.click(stepButton('4 Gear & phases'));
    expect(screen.queryByText('Carried by your platform and equipment')).toBeNull();
    expect(screen.queryByText(/Add anything this organization brings/)).toBeNull();
    // The data group label stays: it names content, not the step. No
    // waveform or service strip: those come from the assets.
    await user.click(stepButton('5 Transports'));
    expect(screen.getByRole('group', { name: 'Transports' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Waveforms' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Services' })).toBeNull();
    await user.click(stepButton('7 Contact'));
    expect(screen.queryByText('Contact')).toBeNull();
    expect(screen.getByText('POC name')).toBeInTheDocument();
    await user.click(stepButton('8 Review'));
    expect(screen.queryByText('Review')).toBeNull();
  });

  it('names the organization and the operation in the edit-mode title', () => {
    setup({ participant: { ...GREEN, organization: { ...GREEN.organization, short_label: '' } } });
    expect(screen.getByRole('heading', { name: 'Editing Green - Operation Avalanche' })).toBeInTheDocument();
  });

  it('picking a library row enables the steps, and Join on step 1 posts the key with empty picks', async () => {
    const { user, onClose, onJoined } = setup();
    await user.click(orgRow('Blue'));
    expect(orgRow('Blue')).toHaveAttribute('aria-pressed', 'true');
    for (const label of ['2 Platform', '3 Equipment', '4 Gear & phases', '5 Transports', '6 Comms links', '7 Contact', '8 Review']) {
      expect(stepButton(label)).toBeEnabled();
    }
    await user.click(primary('Join now, add equipment later'));
    await waitFor(() => { expect(spies.create).toHaveBeenCalledTimes(1); });
    expect(spies.create).toHaveBeenCalledWith({
      operationId: 'op-1',
      data: { organization_key: 'blue', ...EMPTY_PICKS },
    });
    expect(spies.create.mock.calls[0]?.[0].data).not.toHaveProperty('adhoc');
    await waitFor(() => { expect(onClose).toHaveBeenCalled(); });
    expect(onJoined).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-new' }));
  });

  it('disables a row whose organization is already on the operation', () => {
    setup();
    const green = orgRow('Green');
    expect(green).toBeDisabled();
    expect(within(green).getByText('already joined')).toBeInTheDocument();
    expect(orgRow('Blue')).toBeEnabled();
  });

  it('Other with a name posts an adhoc identity and no organization_key', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Other' }));
    await user.type(screen.getByLabelText('Other name'), 'Coalition');
    await user.type(screen.getByLabelText('Other short label'), 'CP');
    await user.click(within(screen.getByRole('group', { name: 'Other branch' })).getByRole('button', { name: 'USA' }));
    const swatch = SECTION_COLOR_PALETTE[0] as string;
    await user.click(within(screen.getByRole('group', { name: 'Other color' })).getByRole('button', { name: swatch }));
    expect(screen.getByText('Lives only in this operation. It is not added to the Organization Library.')).toBeInTheDocument();
    expect(stepButton('2 Platform')).toBeEnabled();

    await user.click(primary('Join now, add equipment later'));
    await waitFor(() => { expect(spies.create).toHaveBeenCalledTimes(1); });
    const data = spies.create.mock.calls[0]?.[0].data;
    expect(data?.adhoc).toEqual({ name: 'Coalition', short_label: 'CP', branch: 'USA', color: swatch });
    expect(data).not.toHaveProperty('organization_key');
  });

  it('a library row clears Other, and typing in Other clears the row', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Other' }));
    await user.type(screen.getByLabelText('Other name'), 'Coalition');
    await user.click(orgRow('Blue'));
    expect(screen.getByLabelText('Other name')).toHaveValue('');
    await user.type(screen.getByLabelText('Other name'), 'C');
    expect(orgRow('Blue')).toHaveAttribute('aria-pressed', 'false');
  });

  it('Add to library creates the organization and selects its key', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Add to library' }));
    await user.type(screen.getByLabelText('Key'), 'red');
    await user.type(screen.getByLabelText('Name'), 'Red');
    await user.click(primary('Add and select'));
    await waitFor(() => { expect(spies.createOrg).toHaveBeenCalledTimes(1); });
    expect(spies.createOrg).toHaveBeenCalledWith({ key: 'red', name: 'Red', short_label: '', branch: '', color: '', section_key: '', notes: '' });
    await waitFor(() => { expect(orgRow('Red')).toHaveAttribute('aria-pressed', 'true'); });
    expect(screen.queryByLabelText('Key')).not.toBeInTheDocument();

    await user.click(primary('Join now, add equipment later'));
    await waitFor(() => { expect(spies.create).toHaveBeenCalledTimes(1); });
    expect(spies.create.mock.calls[0]?.[0].data.organization_key).toBe('red');
  });
});

const platformRow = (name: string) => within(screen.getByRole('group', { name: 'Platforms' })).getByRole('button', { name: new RegExp(name) });

describe('JoinOperationDialog steps 2 to 6', () => {
  it('step 2 groups the library by type, with Dismounted pressed until a platform is picked, and posts platform_ids', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('2 Platform'));
    expect(stepButton('2 Platform')).toHaveAttribute('aria-current', 'step');
    const groupEl = screen.getByRole('group', { name: 'Platforms' });
    const group = within(groupEl);
    // A grid of 360px columns, with Dismounted and each type caption across
    // the full width and the platform rows as direct grid children.
    expect(groupEl.style.display).toBe('grid');
    expect(groupEl.style.gridTemplateColumns).toBe('repeat(auto-fill, minmax(360px, 1fr))');
    expect(platformRow('Dismounted / no platform').style.gridColumn).toBe('1 / -1');
    expect(platformRow('UH-60M').style.gridColumn).toBe('');
    expect(platformRow('UH-60M').parentElement).toBe(groupEl);
    // Aircraft before ground vehicles, in PLATFORM_TYPES order; no group for a type with no rows.
    // The Type filter chips carry the same words, so the captions are the divs.
    const captionEls = group.getAllByText(/^(Aircraft|Ship|Ground vehicle|Ground station)$/).filter((e) => e.tagName === 'DIV');
    expect(captionEls.map((e) => e.textContent)).toEqual(['Aircraft', 'Ground vehicle']);
    expect(captionEls.map((e) => e.style.gridColumn)).toEqual(['1 / -1', '1 / -1']);
    expect(platformRow('Dismounted / no platform')).toHaveAttribute('aria-pressed', 'true');
    expect(platformRow('Dismounted / no platform')).toHaveTextContent(/^Dismounted \/ no platform$/);
    // The row: designation, popular name and branch; no waveform count,
    // which did not fit a 360px row beside a real popular name.
    expect(platformRow('UH-60M')).toHaveTextContent('Black Hawk');
    expect(platformRow('UH-60M')).toHaveTextContent('USA');
    expect(platformRow('UH-60M')).not.toHaveTextContent(/waveform/);

    await user.click(platformRow('UH-60M'));
    await user.click(platformRow('M1126'));
    expect(platformRow('UH-60M')).toHaveAttribute('aria-pressed', 'true');
    expect(platformRow('Dismounted / no platform')).toHaveAttribute('aria-pressed', 'false');
    await user.click(primary('Join'));
    await waitFor(() => { expect(spies.create).toHaveBeenCalledTimes(1); });
    expect(spies.create.mock.calls[0]?.[0].data.platform_ids).toEqual(['uh-60', 'stryker']);
  });

  it('step 2 filters the grid by branch and type, any of each and all together, over the values the library has', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('2 Platform'));
    const group = within(screen.getByRole('group', { name: 'Platforms' }));
    const branchRow = within(group.getByRole('group', { name: 'Branch' }));
    const typeRow = within(group.getByRole('group', { name: 'Type' }));
    // Only the branches and types some platform has: no USN chip, no Ship chip.
    expect(branchRow.getAllByRole('button').map((b) => b.textContent)).toEqual(['USA', 'USMC']);
    expect(branchRow.getByRole('button', { name: 'USMC' })).toHaveAttribute('title', 'US Marine Corps');
    expect(typeRow.getAllByRole('button').map((b) => b.textContent)).toEqual(['Aircraft', 'Ground vehicle']);
    // The filter rows sit under Dismounted and above the first group caption.
    const dismounted = platformRow('Dismounted / no platform');
    const branchGroup = group.getByRole('group', { name: 'Branch' });
    expect(dismounted.compareDocumentPosition(branchGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(branchGroup.compareDocumentPosition(platformRow('UH-60M')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // USMC leaves the Stryker alone, and the Aircraft group is gone with its caption.
    await user.click(branchRow.getByRole('button', { name: 'USMC' }));
    expect(branchRow.getByRole('button', { name: 'USMC' })).toHaveAttribute('aria-pressed', 'true');
    expect(group.queryByRole('button', { name: /UH-60M/ })).toBeNull();
    expect(platformRow('M1126')).toBeInTheDocument();
    expect(group.queryByText('Aircraft', { selector: 'div' })).toBeNull();
    // Branch is any-of: adding USA brings the Black Hawk back.
    await user.click(branchRow.getByRole('button', { name: 'USA' }));
    expect(platformRow('UH-60M')).toBeInTheDocument();
    // Across rows it is all-of: USMC alone plus Aircraft matches nothing.
    await user.click(branchRow.getByRole('button', { name: 'USA' }));
    await user.click(typeRow.getByRole('button', { name: 'Aircraft' }));
    expect(group.queryByRole('button', { name: /M1126/ })).toBeNull();
    expect(group.queryByRole('button', { name: /UH-60M/ })).toBeNull();
    expect(group.getByText('No platform matches the filters.')).toBeInTheDocument();
    // Dismounted stays whatever the filters say, and a pick survives filtering.
    expect(platformRow('Dismounted / no platform')).toBeInTheDocument();
    await user.click(typeRow.getByRole('button', { name: 'Aircraft' }));
    await user.click(branchRow.getByRole('button', { name: 'USMC' }));
    await user.click(platformRow('UH-60M'));
    await user.click(branchRow.getByRole('button', { name: 'USMC' }));
    expect(group.queryByRole('button', { name: /UH-60M/ })).toBeNull();
    await user.click(branchRow.getByRole('button', { name: 'USMC' }));
    expect(platformRow('UH-60M')).toHaveAttribute('aria-pressed', 'true');
  });

  it('Dismounted clears the platform picks', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('2 Platform'));
    await user.click(platformRow('UH-60M'));
    await user.click(platformRow('Dismounted / no platform'));
    expect(platformRow('UH-60M')).toHaveAttribute('aria-pressed', 'false');
    expect(platformRow('Dismounted / no platform')).toHaveAttribute('aria-pressed', 'true');
    await user.click(primary('Join'));
    await waitFor(() => { expect(spies.create).toHaveBeenCalledTimes(1); });
    expect(spies.create.mock.calls[0]?.[0].data.platform_ids).toEqual([]);
  });

  it('step 3 toggles a card into the posted equipment_ids', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('3 Equipment'));
    expect(stepButton('3 Equipment')).toHaveAttribute('aria-current', 'step');
    await user.click(screen.getByText('AN/PRC-117G'));
    expect(within(screen.getByRole('group', { name: 'Bringing' })).getByText('AN/PRC-117G')).toBeInTheDocument();
    await user.click(primary('Join'));
    await waitFor(() => { expect(spies.create).toHaveBeenCalledTimes(1); });
    expect(spies.create.mock.calls[0]?.[0].data.equipment_ids).toEqual(['prc-117']);
  });

  it('step 4 lists what a picked platform and radio carry, platform first, and a transport is the only direct pick', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('2 Platform'));
    await user.click(platformRow('UH-60M'));
    await user.click(stepButton('3 Equipment'));
    await user.click(screen.getByText('AN/PRC-152'));
    await user.click(stepButton('4 Gear & phases'));
    const carried = within(screen.getByRole('list', { name: 'Carried by your platform and equipment' }));
    const rows = carried.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    // Each pick is its own panel, an amber bar for a platform and a graphite
    // one for equipment, headed by the designation with the popular name
    // beside it. The Black Hawk: its own MUOS, then the PRC-117G it lists
    // with that radio's waveforms.
    expect(rows[0]!.style.borderLeft).toBe('3px solid var(--shf-amber)');
    expect(rows[1]!.style.borderLeft).toBe('3px solid var(--shf-graphite-400)');
    const hawk = within(rows[0]!);
    expect(hawk.getByText('UH-60M')).toBeInTheDocument();
    expect(hawk.getByText('Black Hawk')).toBeInTheDocument();
    expect(hawk.getByText('MUOS')).toBeInTheDocument();
    expect(hawk.getByText('AN/PRC-117G')).toBeInTheDocument();
    expect(hawk.getByText('SRW')).toBeInTheDocument();
    expect(hawk.getByText('ANW2')).toBeInTheDocument();
    const radio = within(rows[1]!);
    expect(radio.getByText('AN/PRC-152')).toBeInTheDocument();
    expect(radio.getByText('nothing listed')).toBeInTheDocument();

    expect(screen.queryByRole('group', { name: 'Waveforms' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Services' })).toBeNull();
    await user.click(stepButton('5 Transports'));
    await user.click(within(screen.getByRole('group', { name: 'Transports' })).getByRole('button', { name: 'Base fiber (Fiber)' }));
    await user.click(primary('Join'));
    await waitFor(() => { expect(spies.create).toHaveBeenCalledTimes(1); });
    const data = spies.create.mock.calls[0]?.[0].data;
    // The API fields stay and go empty: waveforms and services are the assets'.
    expect(data?.waveform_abbrevs).toEqual([]);
    expect(data?.service_abbrevs).toEqual([]);
    expect(data?.transport_ids).toEqual(['t1']);
  });

  it('step 7 fields land in the payload, trimmed', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('7 Contact'));
    await user.type(screen.getByLabelText('POC name'), ' Capt Lee ');
    await user.type(screen.getByLabelText('POC phone'), 'DSN 555-0100');
    await user.type(screen.getByLabelText('POC email'), 'lee@example.mil');
    await user.type(screen.getByLabelText('Notes'), 'Bringing two terminals');
    await user.click(primary('Join'));
    await waitFor(() => { expect(spies.create).toHaveBeenCalledTimes(1); });
    expect(spies.create.mock.calls[0]?.[0].data).toMatchObject({
      poc_name: 'Capt Lee', poc_phone: 'DSN 555-0100', poc_email: 'lee@example.mil', notes: 'Bringing two terminals',
    });
  });

  it('step 8 summarises the draft, with the platform and derived waveforms deduped and no Services line, and Edit jumps back', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('2 Platform'));
    await user.click(platformRow('UH-60M'));
    await user.click(stepButton('3 Equipment'));
    await user.click(screen.getByText('AN/PRC-117G'));
    await user.click(stepButton('8 Review'));

    expect(screen.queryByRole('button', { name: /^Continue to step/ })).not.toBeInTheDocument();
    expect(screen.getByText('BLUE')).toBeInTheDocument();
    expect(screen.getByText('UH-60M')).toBeInTheDocument();
    expect(screen.getByText('1 item: AN/PRC-117G')).toBeInTheDocument();
    // The Black Hawk's MUOS and the PRC-117G's SRW and ANW2, each once:
    // the Black Hawk lists the PRC-117G too, so its waveforms arrive twice.
    expect(screen.getAllByText('SRW')).toHaveLength(1);
    expect(screen.getAllByText('MUOS')).toHaveLength(1);
    expect(screen.getAllByText('ANW2')).toHaveLength(1);
    expect(screen.getByText('Waveforms')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit waveforms' })).toBeInTheDocument();
    // No Services line and no direct-pick line: WGS is read off the
    // equipment panel on step 4, not summarised here.
    expect(screen.queryByText('Services')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit services' })).toBeNull();
    expect(screen.queryByText('WGS')).toBeNull();
    expect(screen.getByText('Transports')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit transports' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit platform' }));
    expect(stepButton('2 Platform')).toHaveAttribute('aria-current', 'step');
    expect(platformRow('UH-60M')).toHaveAttribute('aria-pressed', 'true');

    await user.click(stepButton('8 Review'));
    await user.click(screen.getByRole('button', { name: 'Edit organization' }));
    expect(stepButton('1 Organization')).toHaveAttribute('aria-current', 'step');
    expect(orgRow('Blue')).toHaveAttribute('aria-pressed', 'true');
  });

  it('the review says Dismounted when no platform was picked', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('8 Review'));
    expect(screen.getByText('Dismounted')).toBeInTheDocument();
  });

  it('Continue and Back walk the steps in order', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(primary('Continue'));
    expect(stepButton('2 Platform')).toHaveAttribute('aria-current', 'step');
    await user.click(primary('Continue'));
    expect(stepButton('3 Equipment')).toHaveAttribute('aria-current', 'step');
    await user.click(primary('Back'));
    await user.click(primary('Back'));
    expect(stepButton('1 Organization')).toHaveAttribute('aria-current', 'step');
  });
});

describe('JoinOperationDialog edit mode', () => {
  it('opens on step 2, Platform, with the saved picks loaded and step 1 read-only, and Save PATCHes by id with expected_updated_at', async () => {
    const { user, onClose } = setup({ participant: { ...GREEN, platform_ids: ['stryker'] } });
    expect(screen.getByRole('heading', { name: 'Editing GREEN - Operation Avalanche' })).toBeInTheDocument();
    expect(stepButton('2 Platform')).toHaveAttribute('aria-current', 'step');
    expect(platformRow('M1126')).toHaveAttribute('aria-pressed', 'true');
    expect(platformRow('Dismounted / no platform')).toHaveAttribute('aria-pressed', 'false');
    await user.click(stepButton('3 Equipment'));
    expect(within(screen.getByRole('group', { name: 'Bringing' })).getByText('AN/TSC-198')).toBeInTheDocument();

    await user.click(stepButton('1 Organization'));
    expect(screen.queryByRole('group', { name: 'Organizations' })).not.toBeInTheDocument();
    const box = screen.getByLabelText('Organization');
    expect(within(box).getByText('GREEN')).toBeInTheDocument();
    expect(within(box).getByText('Green')).toBeInTheDocument();

    await user.click(stepButton('7 Contact'));
    expect(screen.getByLabelText('POC name')).toHaveValue('Capt Lee');
    await user.type(screen.getByLabelText('POC phone'), 'DSN 555-0100');
    await user.click(primary('Save'));
    await waitFor(() => { expect(spies.update).toHaveBeenCalledTimes(1); });
    expect(spies.update).toHaveBeenCalledWith({
      operationId: 'op-1',
      participantId: 'p1',
      data: {
        platform_ids: ['stryker'],
        // GREEN's stored direct SRW is not carried forward: the PATCH
        // replaces every list, and direct picks are transports only now.
        equipment_ids: ['tsc-198'], waveform_abbrevs: [], service_abbrevs: [], transport_ids: [],
        poc_name: 'Capt Lee', poc_phone: 'DSN 555-0100', poc_email: '', notes: '',
        expected_updated_at: '2026-10-02T00:00:00Z',
      },
    });
    await waitFor(() => { expect(onClose).toHaveBeenCalled(); });
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('keeps typed text when a refetch hands it a new participant object for the same row', async () => {
    const row = { ...GREEN, platform_ids: ['stryker'] };
    const { user, view } = setupRerenderable({ participant: row });
    await user.click(stepButton('7 Contact'));
    await user.type(screen.getByLabelText('Notes'), 'bring spares');
    view.rerender(rerenderable({ ...row, platform_ids: [...row.platform_ids], updated_at: '2026-10-02T00:00:10Z' }));
    expect(screen.getByLabelText('Notes')).toHaveValue('bring spares');
    await user.click(primary('Save'));
    await waitFor(() => { expect(spies.update).toHaveBeenCalledTimes(1); });
    // The lock is the updated_at read when the wizard opened, not the refetched one.
    expect(spies.update.mock.calls[0]?.[0].data.expected_updated_at).toBe('2026-10-02T00:00:00Z');
  });

  it('honours initialStep', () => {
    setup({ participant: GREEN, initialStep: 7 });
    expect(stepButton('7 Contact')).toHaveAttribute('aria-current', 'step');
  });
});

describe('JoinOperationDialog errors and close', () => {
  it('shows a 409 and keeps the dialog open', async () => {
    spies.create.mockRejectedValue(new ApiClientError('PARTICIPANT_ADHOC_NAME_EXISTS', 'An Other named Coalition is already on this operation', undefined, 409));
    const { user, onClose } = setup();
    await user.click(screen.getByRole('button', { name: 'Other' }));
    await user.type(screen.getByLabelText('Other name'), 'Coalition');
    await user.click(primary('Join now, add equipment later'));
    expect(await screen.findByRole('alert')).toHaveTextContent('An Other named Coalition is already on this operation');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Other name')).toHaveValue('Coalition');
  });

  it('the stale-save 409 in edit mode stays open too', async () => {
    spies.update.mockRejectedValue(new ApiClientError('PARTICIPANT_STALE', 'Someone else saved this participant first', undefined, 409));
    const { user, onClose } = setup({ participant: GREEN });
    await user.click(primary('Save'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else saved this participant first');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the close button calls onClose', async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

const PLAN = { supported_participant_id: null, placements: {}, requirements: [] };
const PHASES: Phase[] = [
  { id: 'ph1', operation_id: 'op-1', position: 1, name: 'Phase I', ...PLAN },
  { id: 'ph2', operation_id: 'op-1', position: 2, name: 'Phase II', ...PLAN },
  { id: 'ph3', operation_id: 'op-1', position: 3, name: 'Phase III', ...PLAN },
];
const ALL = ['ph1', 'ph2', 'ph3'];
const phaseGroup = (asset: string) => within(screen.getByRole('group', { name: `${asset} phases` }));
const phaseChip = (asset: string, phase: string) => screen.getByRole('button', { name: `${asset} in ${phase}` });

describe('JoinOperationDialog phases', () => {
  it('draws no phase chips with one phase or none', async () => {
    for (const phases of [[PHASES[0] as Phase], []]) {
      const { user } = setup({ phases });
      await user.click(orgRow('Blue'));
      await user.click(stepButton('2 Platform'));
      await user.click(platformRow('UH-60M'));
      await user.click(stepButton('4 Gear & phases'));
      expect(screen.queryByRole('group', { name: /phases$/ })).toBeNull();
      expect(screen.queryByText('In phase')).toBeNull();
      cleanup();
    }
  });

  it('starts a new pick in every phase and posts the map for every picked asset, ids in position order', async () => {
    const { user } = setup({ phases: PHASES });
    await user.click(orgRow('Blue'));
    await user.click(stepButton('2 Platform'));
    await user.click(platformRow('UH-60M'));
    await user.click(stepButton('3 Equipment'));
    await user.click(screen.getByText('AN/PRC-152'));
    await user.click(stepButton('5 Transports'));
    await user.click(within(screen.getByRole('group', { name: 'Transports' })).getByRole('button', { name: 'Base fiber (Fiber)' }));
    expect(phaseGroup('Base fiber (Fiber)').getAllByRole('button').map((c) => c.textContent)).toEqual(['Phase I', 'Phase II', 'Phase III']);
    await user.click(stepButton('4 Gear & phases'));

    for (const asset of ['UH-60M', 'AN/PRC-152']) {
      const chips = phaseGroup(asset).getAllByRole('button');
      expect(chips.map((c) => c.textContent)).toEqual(['Phase I', 'Phase II', 'Phase III']);
      for (const c of chips) expect(c).toHaveAttribute('aria-pressed', 'true');
    }
    await user.click(primary('Join'));
    await waitFor(() => { expect(spies.create).toHaveBeenCalledTimes(1); });
    expect(spies.create.mock.calls[0]?.[0].data.asset_phases).toEqual({
      'uh-60': ALL, 'prc-152': ALL, t1: ALL,
    });
  });

  it('toggling a chip changes only that asset and that phase, and a phase can be switched back on', async () => {
    const { user } = setup({ phases: PHASES });
    await user.click(orgRow('Blue'));
    await user.click(stepButton('2 Platform'));
    await user.click(platformRow('UH-60M'));
    await user.click(platformRow('M1126'));
    await user.click(stepButton('4 Gear & phases'));

    await user.click(phaseChip('UH-60M', 'Phase II'));
    expect(phaseChip('UH-60M', 'Phase II')).toHaveAttribute('aria-pressed', 'false');
    expect(phaseChip('M1126', 'Phase II')).toHaveAttribute('aria-pressed', 'true');
    await user.click(phaseChip('M1126', 'Phase I'));
    await user.click(phaseChip('M1126', 'Phase III'));
    await user.click(phaseChip('M1126', 'Phase I'));
    await user.click(primary('Join'));
    await waitFor(() => { expect(spies.create).toHaveBeenCalledTimes(1); });
    expect(spies.create.mock.calls[0]?.[0].data.asset_phases).toEqual({
      'uh-60': ['ph1', 'ph3'],
      stryker: ['ph1', 'ph2'],
    });
  });

  it('editing keeps the stored marks, treats a keyless asset as in every phase, and drops a key for an asset no longer picked', async () => {
    const { user } = setup({
      phases: PHASES,
      participant: {
        ...GREEN,
        platform_ids: ['stryker'],
        equipment_ids: ['tsc-198'],
        asset_phases: { 'tsc-198': ['ph1', 'ph3'], 'prc-152': ['ph2'] },
      },
    });
    await user.click(stepButton('4 Gear & phases'));
    expect(phaseChip('AN/TSC-198', 'Phase I')).toHaveAttribute('aria-pressed', 'true');
    expect(phaseChip('AN/TSC-198', 'Phase II')).toHaveAttribute('aria-pressed', 'false');
    expect(phaseChip('AN/TSC-198', 'Phase III')).toHaveAttribute('aria-pressed', 'true');
    for (const p of ['Phase I', 'Phase II', 'Phase III']) expect(phaseChip('M1126', p)).toHaveAttribute('aria-pressed', 'true');

    await user.click(primary('Save'));
    await waitFor(() => { expect(spies.update).toHaveBeenCalledTimes(1); });
    expect(spies.update.mock.calls[0]?.[0].data.asset_phases).toEqual({
      stryker: ALL,
      'tsc-198': ['ph1', 'ph3'],
    });
  });

  it('unpicking drops the asset from the map, and picking it again starts it in every phase', async () => {
    const { user } = setup({
      phases: PHASES,
      participant: {
        ...GREEN,
        platform_ids: ['uh-60', 'stryker'],
        equipment_ids: [],
        asset_phases: { 'uh-60': ['ph1'], stryker: ['ph2'] },
      },
    });
    await user.click(platformRow('UH-60M'));
    await user.click(platformRow('M1126'));
    await user.click(platformRow('M1126'));
    await user.click(stepButton('4 Gear & phases'));
    expect(screen.queryByRole('group', { name: 'UH-60M phases' })).toBeNull();
    for (const p of ['Phase I', 'Phase II', 'Phase III']) expect(phaseChip('M1126', p)).toHaveAttribute('aria-pressed', 'true');

    await user.click(primary('Save'));
    await waitFor(() => { expect(spies.update).toHaveBeenCalledTimes(1); });
    expect(spies.update.mock.calls[0]?.[0].data.asset_phases).toEqual({ stryker: ALL });
  });

  it('Dismounted drops every platform key', async () => {
    const { user } = setup({
      phases: PHASES,
      participant: { ...GREEN, platform_ids: ['uh-60'], equipment_ids: [], asset_phases: { 'uh-60': ['ph1'] } },
    });
    await user.click(platformRow('Dismounted / no platform'));
    await user.click(primary('Save'));
    await waitFor(() => { expect(spies.update).toHaveBeenCalledTimes(1); });
    expect(spies.update.mock.calls[0]?.[0].data.asset_phases).toEqual({});
  });

  it('the review captions an asset that is not in every phase, "No phase" for none, and nothing for one in all', async () => {
    const { user } = setup({ phases: PHASES });
    await user.click(orgRow('Blue'));
    await user.click(stepButton('2 Platform'));
    await user.click(platformRow('UH-60M'));
    await user.click(stepButton('3 Equipment'));
    await user.click(screen.getByText('AN/PRC-152'));
    await user.click(stepButton('5 Transports'));
    await user.click(within(screen.getByRole('group', { name: 'Transports' })).getByRole('button', { name: 'Base fiber (Fiber)' }));
    await user.click(stepButton('4 Gear & phases'));

    await user.click(phaseChip('UH-60M', 'Phase I'));
    for (const p of ['Phase I', 'Phase II', 'Phase III']) await user.click(phaseChip('AN/PRC-152', p));
    await user.click(stepButton('8 Review'));

    expect(screen.getByText('UH-60M: Phase II, Phase III')).toBeInTheDocument();
    expect(screen.getByText('AN/PRC-152: No phase')).toBeInTheDocument();
    expect(screen.queryByText(/Base fiber \(Fiber\): /)).toBeNull();
  });

  it('a review with every asset in every phase carries no phase caption', async () => {
    const { user } = setup({ phases: PHASES });
    await user.click(orgRow('Blue'));
    await user.click(stepButton('2 Platform'));
    await user.click(platformRow('UH-60M'));
    await user.click(stepButton('8 Review'));
    expect(screen.queryByText(/Phase I/)).toBeNull();
    expect(screen.queryByText(/No phase/)).toBeNull();
  });
});

// The operation as the page has loaded it, for the Phases step. GREEN is the
// unit being edited and carries the PRC-117G (SRW, ANW2) and the PRC-152
// (nothing typed against it). WHITE shares the 117 with it; RED shares the 117
// and a transport with BLUE, which makes BLUE a relay through RED; ORANGE has
// only the 152, so shares nothing; BLACK is in Phase II only.
const SITES: Site[] = [
  { id: 's1', operation_id: 'op-1', position: 1, name: 'ISB' },
  { id: 's2', operation_id: 'op-1', position: 2, name: 'FSB' },
];
const unit = (id: string, label: string, over: Partial<Participant>): Participant => ({
  ...GREEN, id, organization_key: label.toLowerCase(),
  organization: { key: label.toLowerCase(), name: label, short_label: label, branch: '', color: '', adhoc: false },
  platform_ids: [], equipment_ids: [], transport_ids: [], asset_phases: {}, ...over,
});
const ME = unit('p1', 'GREEN', { equipment_ids: ['prc-117', 'prc-152'], updated_at: '2026-10-02T00:00:00Z' });
const ROSTER: Participant[] = [
  ME,
  unit('p2', 'WHITE', { equipment_ids: ['prc-117'] }),
  unit('p3', 'RED', { equipment_ids: ['prc-117'], transport_ids: ['t1'] }),
  unit('p4', 'BLUE', { transport_ids: ['t1'] }),
  unit('p5', 'ORANGE', { equipment_ids: ['prc-152'] }),
  unit('p6', 'BLACK', { equipment_ids: ['prc-117'], asset_phases: { 'prc-117': ['ph2'] } }),
];
// Phase I: ME at ISB, WHITE at FSB, ME must talk to WHITE and WHITE to RED.
// Phase II: only WHITE is placed, and ME must talk to RED. Phase III: nothing.
const PLANNED: Phase[] = [
  {
    ...(PHASES[0] as Phase), supported_participant_id: 'p2', placements: { p1: 's1', p2: 's2' },
    requirements: [{ id: 'r1', a: 'p1', b: 'p2' }, { id: 'r2', a: 'p2', b: 'p3' }],
  },
  { ...(PHASES[1] as Phase), placements: { p2: 's1' }, requirements: [{ id: 'r3', a: 'p1', b: 'p3' }] },
  PHASES[2] as Phase,
];

function loadOperation(over: { participants?: Participant[]; phases?: Phase[]; sites?: Site[] } = {}) {
  opState.data = {
    operation: OPERATION, participants: over.participants ?? ROSTER, phases: over.phases ?? PLANNED, sites: over.sites ?? SITES,
  };
}
const editMe = (over: Partial<Participant> = {}, initialStep: JoinStep = 6) => {
  loadOperation();
  return setup({ participant: { ...ME, ...over }, phases: PLANNED, initialStep });
};
const phaseCard = (name: string) => {
  const heading = within(screen.getByRole('list', { name: 'Phases' })).getByText(name, { selector: 'span' });
  return heading.closest('[role="listitem"]') as HTMLElement;
};
const siteSelect = (phase: string) => screen.getByRole('combobox', { name: `Location in ${phase}` });
const talkChip = (unitLabel: string, phase: string) => screen.getByRole('button', { name: `Must talk to ${unitLabel} in ${phase}` });
const talkGroup = (phase: string) => within(screen.getByRole('group', { name: `Must talk to in ${phase}` }));

describe('JoinOperationDialog step 6, Phases', () => {
  it('sits between Transports and Contact in an eight-step strip', () => {
    editMe();
    const labels = Array.from(screen.getByRole('group', { name: 'Steps' }).querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual([
      '1 Organization', '2 Platform', '3 Equipment', '4 Gear & phases', '5 Transports', '6 Comms links', '7 Contact', '8 Review',
    ]);
    expect(stepButton('6 Comms links')).toHaveAttribute('aria-current', 'step');
    const states = Array.from(screen.getByRole('group', { name: 'Steps' }).querySelectorAll('button')).map((b) => b.getAttribute('data-state'));
    expect(states).toEqual(['done', 'done', 'done', 'done', 'done', 'current', 'todo', 'todo']);
  });

  it('draws one row per phase in position order, named, with a Location select and a Must talk to group', () => {
    editMe();
    const rows = within(screen.getByRole('list', { name: 'Phases' })).getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('span')?.textContent)).toEqual(['Phase I', 'Phase II', 'Phase III']);
    for (const p of ['Phase I', 'Phase II', 'Phase III']) {
      expect(siteSelect(p)).toBeEnabled();
      expect(within(phaseCard(p)).getByText('Must talk to:')).toBeInTheDocument();
    }
    // One chip per other unit, never one for this unit itself.
    expect(talkGroup('Phase I').getAllByRole('button').map((b) => b.textContent)).toEqual(['WHITE', 'RED', 'BLUE', 'ORANGE', 'BLACK']);
  });

  it('starts each Location select from the stored placement, "No location" where there is none, and a change is the new value', async () => {
    const { user } = editMe();
    expect(siteSelect('Phase I')).toHaveValue('s1');
    expect(siteSelect('Phase II')).toHaveValue('');
    expect(within(siteSelect('Phase II')).getByRole('option', { name: 'No location' })).toBeInTheDocument();
    // The last option adds a location rather than choosing one.
    expect(within(siteSelect('Phase II')).getAllByRole('option').map((o) => o.textContent)).toEqual(['No location', 'ISB', 'FSB', '+ Add location...']);
    await user.selectOptions(siteSelect('Phase II'), 'FSB');
    expect(siteSelect('Phase II')).toHaveValue('s2');
    expect(siteSelect('Phase I')).toHaveValue('s1');
    await user.selectOptions(siteSelect('Phase I'), 'No location');
    expect(siteSelect('Phase I')).toHaveValue('');
  });

  it('presses the chips for the stored pairs, and a chip toggles its pair on and off', async () => {
    const { user } = editMe();
    expect(talkChip('WHITE', 'Phase I')).toHaveAttribute('aria-pressed', 'true');
    expect(talkChip('RED', 'Phase I')).toHaveAttribute('aria-pressed', 'false');
    // The stored pair of two other units is not this unit's.
    expect(talkChip('RED', 'Phase II')).toHaveAttribute('aria-pressed', 'true');
    await user.click(talkChip('RED', 'Phase I'));
    expect(talkChip('RED', 'Phase I')).toHaveAttribute('aria-pressed', 'true');
    expect(talkChip('RED', 'Phase II')).toHaveAttribute('aria-pressed', 'true');
    await user.click(talkChip('WHITE', 'Phase I'));
    expect(talkChip('WHITE', 'Phase I')).toHaveAttribute('aria-pressed', 'false');
    await user.click(talkChip('WHITE', 'Phase I'));
    expect(talkChip('WHITE', 'Phase I')).toHaveAttribute('aria-pressed', 'true');
  });

  it('says how each pressed pair stands: direct with the means, relay through a unit, no link, or not in the phase', async () => {
    const { user } = editMe();
    const phaseOne = talkGroup('Phase I');
    expect(phaseOne.getByRole('img', { name: 'Direct: SRW, ANW2' })).toBeInTheDocument();
    // A chip that is not pressed carries no status.
    expect(phaseOne.queryByRole('img', { name: /Relay|No link|Not in this phase/ })).toBeNull();
    await user.click(talkChip('BLUE', 'Phase I'));
    expect(phaseOne.getByRole('img', { name: 'Relay through RED' })).toBeInTheDocument();
    await user.click(talkChip('ORANGE', 'Phase I'));
    expect(phaseOne.getByRole('img', { name: 'No link' })).toBeInTheDocument();
    await user.click(talkChip('BLACK', 'Phase I'));
    expect(phaseOne.getByRole('img', { name: 'Not in this phase' })).toBeInTheDocument();
    // BLACK is in Phase II, and the same pair there reads as the others do.
    await user.click(talkChip('BLACK', 'Phase II'));
    // RED is already pressed there with the same answer.
    expect(talkGroup('Phase II').getAllByRole('img', { name: 'Direct: SRW, ANW2' })).toHaveLength(2);
  });

  it('keeps a fixed-width status slot beside every chip, so pressing one does not move its neighbours', async () => {
    const { user } = editMe();
    const group = screen.getByRole('group', { name: 'Must talk to in Phase I' });
    const slots = () => Array.from(group.querySelectorAll('button')).filter((b) => b.nextElementSibling?.getAttribute('role') === 'img');
    const chips = group.querySelectorAll('button').length;
    expect(chips).toBeGreaterThan(1);
    expect(slots()).toHaveLength(chips);
    expect(talkChip('RED', 'Phase I')).toHaveAttribute('aria-pressed', 'false');
    await user.click(talkChip('RED', 'Phase I'));
    expect(group.querySelectorAll('button')).toHaveLength(chips);
    expect(slots()).toHaveLength(chips);
  });

  it('shows the detail in a tooltip on a pressed chip, and none on an unpressed one', async () => {
    const { user } = editMe();
    await user.hover(talkChip('WHITE', 'Phase I'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Direct: SRW, ANW2');
    await user.unhover(talkChip('WHITE', 'Phase I'));
    await waitFor(() => { expect(screen.queryByRole('tooltip')).toBeNull(); });
    await user.hover(talkChip('RED', 'Phase I'));
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('wears the Web legend colours for the statuses', async () => {
    const { user } = editMe();
    await user.click(talkChip('BLUE', 'Phase I'));
    await user.click(talkChip('ORANGE', 'Phase I'));
    const phaseOne = talkGroup('Phase I');
    expect(phaseOne.getByRole('img', { name: 'Direct: SRW, ANW2' })).toHaveStyle({ color: STATUS_COLORS.available });
    expect(phaseOne.getByRole('img', { name: 'Relay through RED' })).toHaveStyle({ color: 'var(--shf-amber)' });
    expect(phaseOne.getByRole('img', { name: 'No link' })).toHaveStyle({ color: 'var(--shf-error)' });
  });

  it('opens step 4 with step 3\'s "Bringing (n)" label over the picks it carries forward', async () => {
    const { user } = editMe();
    await user.click(stepButton('4 Gear & phases'));
    expect(screen.getByText(/^Bringing \(\d+\)$/)).toBeInTheDocument();
    expect(screen.getByText('Picked in steps 2 and 3. Select the relevant phases for each piece of equipment.')).toBeInTheDocument();
  });

  it('re-reads the status as gear is taken out of a phase in step 4', async () => {
    const { user } = editMe();
    expect(talkGroup('Phase I').getByRole('img', { name: 'Direct: SRW, ANW2' })).toBeInTheDocument();
    await user.click(stepButton('4 Gear & phases'));
    await user.click(phaseChip('AN/PRC-117G', 'Phase I'));
    await user.click(stepButton('6 Comms links'));
    // Only the PRC-152 is left in Phase I, and it shares nothing with WHITE.
    expect(talkGroup('Phase I').getByRole('img', { name: 'No link' })).toBeInTheDocument();
    expect(talkGroup('Phase I').queryByRole('img', { name: 'Direct: SRW, ANW2' })).toBeNull();
    expect(siteSelect('Phase I')).toBeEnabled();
    // Phase II still has the 117.
    expect(talkGroup('Phase II').getByRole('img', { name: 'Direct: SRW, ANW2' })).toBeInTheDocument();
  });

  it('mutes a phase the draft has no gear in, with its controls disabled, and says why', async () => {
    const { user } = editMe();
    await user.click(stepButton('4 Gear & phases'));
    for (const p of ['AN/PRC-117G', 'AN/PRC-152']) await user.click(phaseChip(p, 'Phase II'));
    await user.click(stepButton('6 Comms links'));
    const card = phaseCard('Phase II');
    expect(within(card).getByText('Not in this phase - no gear marked for it in steps 4 and 5')).toBeInTheDocument();
    expect(card.style.opacity).toBe('0.6');
    expect(siteSelect('Phase II')).toBeDisabled();
    for (const b of talkGroup('Phase II').getAllByRole('button')) expect(b).toBeDisabled();
    // The others are as they were.
    expect(phaseCard('Phase I').style.opacity).toBe('1');
    expect(within(phaseCard('Phase I')).queryByText(/Not in this phase/)).toBeNull();
    expect(siteSelect('Phase I')).toBeEnabled();
  });

  it('says so when no gear is picked at all, since step 4 has nothing to mark', async () => {
    loadOperation();
    const { user } = setup({ phases: PLANNED });
    await user.click(orgRow('Blue'));
    await user.click(stepButton('6 Comms links'));
    expect(within(phaseCard('Phase I')).getByText('Not in this phase - no gear picked yet in steps 2 to 5')).toBeInTheDocument();
    expect(siteSelect('Phase I')).toBeDisabled();
  });

  it('offers an Add location button in place of the select when the operation has no locations', () => {
    loadOperation({ sites: [] });
    setup({ participant: ME, phases: PLANNED, initialStep: 6 });
    expect(screen.getAllByRole('button', { name: 'Add location' })).toHaveLength(3);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(talkChip('WHITE', 'Phase I')).toBeEnabled();
  });

  it('adds a location from a row, to the end of the operation\'s list, and chooses it for that row', async () => {
    const { user, onClose } = editMe();
    await user.selectOptions(siteSelect('Phase II'), '+ Add location...');
    await user.type(screen.getByRole('textbox', { name: 'New location name' }), '  MSS ');
    await user.click(within(phaseCard('Phase II')).getByRole('button', { name: 'Add' }));
    await waitFor(() => { expect(spies.saveSites).toHaveBeenCalledTimes(1); });
    expect(spies.saveSites.mock.calls[0]?.[0]).toEqual({
      operationId: 'op-1', data: { sites: [{ id: 's1', name: 'ISB' }, { id: 's2', name: 'FSB' }, { name: 'MSS' }] },
    });
    await waitFor(() => { expect(screen.queryByRole('textbox', { name: 'New location name' })).toBeNull(); });
    await user.click(primary('Save'));
    await waitFor(() => { expect(onClose).toHaveBeenCalled(); });
    // Phase II now places this unit at the new location; WHITE's placement stays.
    expect(spies.savePlan.mock.calls[0]?.[0]).toMatchObject({ phaseId: 'ph2', data: { placements: { p1: 's-new-2', p2: 's1' } } });
  });

  it('refuses a blank name or one already on the list without asking the server, and Cancel closes the field', async () => {
    const { user } = editMe();
    await user.selectOptions(siteSelect('Phase II'), '+ Add location...');
    const card = within(phaseCard('Phase II'));
    await user.click(card.getByRole('button', { name: 'Add' }));
    expect(card.getByRole('alert')).toHaveTextContent('Name the location.');
    await user.type(screen.getByRole('textbox', { name: 'New location name' }), 'isb');
    await user.click(card.getByRole('button', { name: 'Add' }));
    expect(card.getByRole('alert')).toHaveTextContent('isb is already a location.');
    expect(spies.saveSites).not.toHaveBeenCalled();
    await user.click(card.getByRole('button', { name: 'Cancel' }));
    expect(siteSelect('Phase II')).toHaveValue('');
  });

  it('keeps the field open and says why when the server refuses the new location', async () => {
    spies.saveSites.mockRejectedValueOnce(new ApiClientError('OPERATION_SITE_NAME_EXISTS', 'Two locations have the same name', undefined, 409));
    const { user } = editMe();
    await user.selectOptions(siteSelect('Phase II'), '+ Add location...');
    await user.type(screen.getByRole('textbox', { name: 'New location name' }), 'MSS');
    await user.click(within(phaseCard('Phase II')).getByRole('button', { name: 'Add' }));
    expect(await within(phaseCard('Phase II')).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'New location name' })).toHaveValue('MSS');
  });

  it('waits for the operation to load rather than offering a plan it cannot merge into', () => {
    setup({ participant: ME, phases: PLANNED, initialStep: 6 });
    expect(screen.getByText("Loading the operation's phases.")).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Phases' })).toBeNull();
  });

  it('adds a Phases section to the review with the location and each partner with its status, and Edit goes back to step 6', async () => {
    const { user } = editMe();
    await user.click(talkChip('BLUE', 'Phase III'));
    await user.click(stepButton('8 Review'));
    expect(screen.getByText('Phases')).toBeInTheDocument();
    expect(screen.getByText('Phase I: ISB')).toBeInTheDocument();
    expect(screen.getByText('Must talk to WHITE (✓ SRW, ANW2)')).toBeInTheDocument();
    expect(screen.getByText('Phase II: No location')).toBeInTheDocument();
    expect(screen.getByText('Must talk to RED (✓ SRW, ANW2)')).toBeInTheDocument();
    expect(screen.getByText('Phase III: No location')).toBeInTheDocument();
    expect(screen.getByText('Must talk to BLUE (↻ via RED)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit phases' }));
    expect(stepButton('6 Comms links')).toHaveAttribute('aria-current', 'step');
  });

  it('the review says a phase the unit is not in, and has no Phases section when the operation has no phases', async () => {
    const { user } = editMe({ asset_phases: { 'prc-117': ['ph1'], 'prc-152': ['ph1'] } });
    await user.click(stepButton('8 Review'));
    expect(screen.getByText('Phase II: Not in this phase')).toBeInTheDocument();
    cleanup();
    loadOperation({ phases: [] });
    setup({ participant: ME, phases: [], initialStep: 8 });
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.queryByText('Phases')).toBeNull();
  });
});

describe('JoinOperationDialog saving the plan', () => {
  it('saves the participant first, then one merged PUT for each phase this unit changed and none for the rest', async () => {
    const { user, onClose } = editMe();
    await user.selectOptions(siteSelect('Phase I'), 'FSB');
    await user.click(talkChip('RED', 'Phase I'));
    await user.click(talkChip('WHITE', 'Phase I'));
    await user.selectOptions(siteSelect('Phase II'), 'ISB');
    await user.click(primary('Save'));

    await waitFor(() => { expect(onClose).toHaveBeenCalled(); });
    expect(spies.update).toHaveBeenCalledTimes(1);
    expect(spies.savePlan).toHaveBeenCalledTimes(2);
    expect(spies.update.mock.invocationCallOrder[0] as number).toBeLessThan(spies.savePlan.mock.invocationCallOrder[0] as number);
    // Phase I: the supported unit and WHITE's placement are kept, the pair of
    // two other units stays, WHITE's pair with this unit goes and RED's comes.
    expect(spies.savePlan.mock.calls[0]?.[0]).toEqual({
      operationId: 'op-1',
      phaseId: 'ph1',
      data: {
        supported_participant_id: 'p2',
        placements: { p1: 's2', p2: 's2' },
        requirements: [{ a: 'p2', b: 'p3' }, { a: 'p1', b: 'p3' }],
      },
    });
    // Phase II: WHITE's placement and this unit's stored pair with RED survive.
    expect(spies.savePlan.mock.calls[1]?.[0]).toEqual({
      operationId: 'op-1',
      phaseId: 'ph2',
      data: { supported_participant_id: null, placements: { p1: 's1', p2: 's1' }, requirements: [{ a: 'p1', b: 'p3' }] },
    });
  });

  it('removes this unit from a phase when its location is cleared and its pairs are all off, leaving the others', async () => {
    const { user, onClose } = editMe();
    await user.selectOptions(siteSelect('Phase I'), 'No location');
    await user.click(talkChip('WHITE', 'Phase I'));
    await user.click(primary('Save'));
    await waitFor(() => { expect(onClose).toHaveBeenCalled(); });
    expect(spies.savePlan).toHaveBeenCalledTimes(1);
    expect(spies.savePlan.mock.calls[0]?.[0].data).toEqual({
      supported_participant_id: 'p2', placements: { p2: 's2' }, requirements: [{ a: 'p2', b: 'p3' }],
    });
  });

  it('sends no plan at all when nothing on step 6 changed, and a change put back is not a change', async () => {
    const { user, onClose } = editMe();
    await user.click(talkChip('RED', 'Phase I'));
    await user.click(talkChip('RED', 'Phase I'));
    await user.selectOptions(siteSelect('Phase I'), 'FSB');
    await user.selectOptions(siteSelect('Phase I'), 'ISB');
    await user.click(primary('Save'));
    await waitFor(() => { expect(onClose).toHaveBeenCalled(); });
    expect(spies.update).toHaveBeenCalledTimes(1);
    expect(spies.savePlan).not.toHaveBeenCalled();
  });

  it('sends nothing for a phase the draft has no gear in, even if it was edited before the gear came out', async () => {
    const { user, onClose } = editMe();
    await user.selectOptions(siteSelect('Phase II'), 'FSB');
    await user.click(stepButton('4 Gear & phases'));
    for (const p of ['AN/PRC-117G', 'AN/PRC-152']) await user.click(phaseChip(p, 'Phase II'));
    await user.click(primary('Save'));
    await waitFor(() => { expect(onClose).toHaveBeenCalled(); });
    expect(spies.update.mock.calls[0]?.[0].data.asset_phases).toEqual({
      'prc-117': ['ph1', 'ph3'], 'prc-152': ['ph1', 'ph3'],
    });
    expect(spies.savePlan).not.toHaveBeenCalled();
  });

  it('a new join saves under the id the server gave it, carrying the other units as they are', async () => {
    loadOperation();
    spies.create.mockResolvedValue(savedRow({ id: 'new-1', organization_key: 'blue' }));
    const { user, onClose, onJoined } = setup({ phases: PLANNED });
    await user.click(orgRow('Blue'));
    await user.click(stepButton('3 Equipment'));
    await user.click(screen.getByText('AN/PRC-117G'));
    await user.click(stepButton('6 Comms links'));
    await user.selectOptions(siteSelect('Phase I'), 'ISB');
    await user.click(talkChip('WHITE', 'Phase I'));
    expect(talkGroup('Phase I').getByRole('img', { name: 'Direct: SRW, ANW2' })).toBeInTheDocument();
    await user.click(primary('Join'));

    await waitFor(() => { expect(onClose).toHaveBeenCalled(); });
    expect(spies.create).toHaveBeenCalledTimes(1);
    expect(spies.update).not.toHaveBeenCalled();
    expect(spies.savePlan).toHaveBeenCalledTimes(1);
    expect(spies.savePlan.mock.calls[0]?.[0]).toEqual({
      operationId: 'op-1',
      phaseId: 'ph1',
      data: {
        supported_participant_id: 'p2',
        placements: { p1: 's1', p2: 's2', 'new-1': 's1' },
        requirements: [{ a: 'p1', b: 'p2' }, { a: 'p2', b: 'p3' }, { a: 'new-1', b: 'p2' }],
      },
    });
    expect(onJoined).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-1' }));
  });

  it('a failing PUT names the phase, keeps the dialog open, and a retry saves the row again rather than creating it twice', async () => {
    loadOperation();
    spies.create.mockResolvedValue(savedRow({ id: 'new-1', organization_key: 'blue', updated_at: 't1' }));
    spies.update.mockResolvedValue(savedRow({ id: 'new-1', organization_key: 'blue', updated_at: 't2' }));
    spies.savePlan.mockRejectedValueOnce(new ApiClientError('OPERATION_UNKNOWN_SITE', 'That location is gone', undefined, 400));
    const { user, onClose, onJoined } = setup({ phases: PLANNED });
    await user.click(orgRow('Blue'));
    await user.click(stepButton('3 Equipment'));
    await user.click(screen.getByText('AN/PRC-117G'));
    await user.click(stepButton('6 Comms links'));
    await user.selectOptions(siteSelect('Phase I'), 'ISB');
    await user.click(primary('Join'));

    expect(await screen.findByRole('alert')).toHaveTextContent("Saved the unit, but Phase I's plan did not save: That location is gone");
    expect(onClose).not.toHaveBeenCalled();
    expect(onJoined).not.toHaveBeenCalled();
    expect(spies.create).toHaveBeenCalledTimes(1);
    // The picks are where they were.
    expect(siteSelect('Phase I')).toHaveValue('s1');

    await user.click(primary('Join'));
    await waitFor(() => { expect(onClose).toHaveBeenCalled(); });
    expect(spies.create).toHaveBeenCalledTimes(1);
    expect(spies.update).toHaveBeenCalledTimes(1);
    expect(spies.update.mock.calls[0]?.[0]).toMatchObject({
      participantId: 'new-1', data: { expected_updated_at: 't1' },
    });
    expect(spies.savePlan).toHaveBeenCalledTimes(2);
    expect(onJoined).toHaveBeenCalledWith(expect.objectContaining({ updated_at: 't2' }));
  });

  it('an edit that fails on the participant save stays on the old message and sends no plan', async () => {
    spies.update.mockRejectedValue(new ApiClientError('PARTICIPANT_STALE', 'Someone else saved this participant first', undefined, 409));
    const { user, onClose } = editMe();
    await user.selectOptions(siteSelect('Phase I'), 'FSB');
    await user.click(primary('Save'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else saved this participant first');
    expect(spies.savePlan).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('JoinOperationDialog closing', () => {
  const typeNotes = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
    await user.click(orgRow('Blue'));
    await user.click(stepButton('7 Contact'));
    await user.type(screen.getByLabelText('Notes'), text);
  };

  it('Cancel on a clean wizard closes at once with no confirm', async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });

  it('Cancel after an edit asks, and Keep editing returns with the text intact', async () => {
    const { user, onClose } = setup();
    await typeNotes(user, 'Two terminals');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    expect(screen.getByText('Nothing you entered here has been saved.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => { expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument(); });
    expect(screen.getByLabelText('Notes')).toHaveValue('Two terminals');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Discard closes the wizard', async () => {
    const { user, onClose } = setup();
    await typeNotes(user, 'Two terminals');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the X on a dirty wizard shows the same confirm', async () => {
    const { user, onClose } = setup();
    await typeNotes(user, 'Two terminals');
    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('in edit mode with no edits the X closes at once', async () => {
    const { user, onClose } = editMe();
    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });
});

describe('JoinOperationDialog eight steps', () => {
  it('shows eight tiles in the order Organization to Review', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    const labels = Array.from(screen.getByRole('group', { name: 'Steps' }).querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual([
      '1 Organization', '2 Platform', '3 Equipment', '4 Gear & phases', '5 Transports', '6 Comms links', '7 Contact', '8 Review',
    ]);
  });

  it('step 4 Gear has no transport list or header', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('4 Gear & phases'));
    expect(screen.getByText(/^Bringing \(\d+\)$/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Transports' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Picked transports' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Transports/ })).toBeNull();
  });

  it('step 5 Transports shows the search box and the list without a click', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('5 Transports'));
    expect(screen.getByRole('textbox', { name: 'Search transports' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Transports' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Transports/ })).toBeNull();
  });

  it('Continue on step 7 reads Continue to step 8, and step 8 has no Continue', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('7 Contact'));
    expect(screen.getByRole('button', { name: 'Continue to step 8' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue to step 8' }));
    expect(stepButton('8 Review')).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByRole('button', { name: /^Continue to step/ })).toBeNull();
  });

  it('the review Edit for transports opens step 5', async () => {
    const { user } = setup();
    await user.click(orgRow('Blue'));
    await user.click(stepButton('8 Review'));
    await user.click(screen.getByRole('button', { name: 'Edit transports' }));
    expect(stepButton('5 Transports')).toHaveAttribute('aria-current', 'step');
  });
});

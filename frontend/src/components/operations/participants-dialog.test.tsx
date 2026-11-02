import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { cleanup, render, screen, within } from '@/test/utils';
import type { Operation, Participant, Platform } from '@/types';
import { ParticipantsDialog } from './participants-dialog';

// A PRC-152 that carries two waveforms: the popup's count is the effective
// set, not the direct picks alone.
const EQUIPMENT = [{
  id: 'prc-152', nomenclature: 'AN/PRC-152', terminal_type: 'radio', operational_mode: [],
  data: {
    services: [], waveforms: [{ abbrev: 'ANW2', name: 'ANW2' }, { abbrev: 'SRW', name: 'SRW' }], bands: [],
    standard_specs: {}, physical_specs: [], rf_specs: [], swap: {}, features: [],
  },
  created_by: 't', updated_by: 't', created_at: '', updated_at: '',
}];

// A Stryker carrying L16 and listing the PRC-152: a row that declared it
// counts one platform and the Stryker's waveforms.
const PLATFORMS: Platform[] = [{
  id: 'stryker', designation: 'M1126', popular_name: 'Stryker', category: ['USA'], type: 'ground vehicle',
  waveform_abbrevs: ['L16'], equipment_ids: ['prc-152'], notes: '',
  created_by: 't', updated_by: 't', created_at: '', updated_at: '',
}];

const removeMutate = vi.fn();
const createMutateAsync = vi.fn();
const showToast = vi.fn();
vi.mock('@/contexts', async () => ({
  ...(await vi.importActual('@/contexts')),
  useToast: () => ({ showToast }),
}));
vi.mock('@/services', () => ({
  useCreateOrganization: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useEquipment: () => ({ data: { equipment: EQUIPMENT, total: EQUIPMENT.length }, isLoading: false }),
  usePlatforms: () => ({ data: { platforms: PLATFORMS, total: PLATFORMS.length }, isLoading: false }),
  useDeleteParticipantById: () => ({ mutate: removeMutate, isPending: false }),
}));

let canWritePace = true;
vi.mock('@/contexts/auth-context', async () => ({
  ...(await vi.importActual('@/contexts/auth-context')),
  useAuth: () => ({ canWritePace, canWrite: true, canWriteRadio: true, isAdmin: true, role: 'admin', user: { name: 'Tester' } }),
}));

const OPERATION: Operation = {
  id: 'op-1', name: 'Operation Avalanche', acronym: '', status: 'active', start_date: '2026-10-01', end_date: '',
  notes: '', participant_count: 2, created_by: '', updated_by: '', created_at: '', updated_at: '',
};

const stamps = { created_by: 't', updated_by: 't', created_at: '', updated_at: '' };

const GREEN: Participant = {
  id: 'p1', operation_id: 'op-1', organization_key: 'green',
  organization: { key: 'green', name: 'Green', short_label: 'GREEN', branch: 'USA', color: '#2E7D32', adhoc: false },
  platform_ids: [], equipment_ids: ['tsc-198', 'prc-152'], waveform_abbrevs: ['SRW'], service_abbrevs: [], transport_ids: [],
  asset_phases: {},
  poc_name: 'Capt Lee', poc_phone: '', poc_email: '', notes: '',
  ...stamps,
};

const KILO: Participant = {
  id: 'p2', operation_id: 'op-1', organization_key: '',
  organization: { key: '', name: 'Task Force Kilo', short_label: 'TF KILO', branch: '', color: '', adhoc: true },
  platform_ids: [], equipment_ids: [], waveform_abbrevs: [], service_abbrevs: [], transport_ids: [],
  asset_phases: {},
  poc_name: '', poc_phone: '', poc_email: '', notes: '',
  ...stamps,
};

function setup(participants: Participant[] = [GREEN, KILO], operation: Operation = OPERATION) {
  const onClose = vi.fn();
  const onJoin = vi.fn();
  const onEdit = vi.fn();
  const onOpen = vi.fn();
  render(
    <ParticipantsDialog open operation={operation} participants={participants} onClose={onClose} onJoin={onJoin} onEdit={onEdit} onOpen={onOpen} />,
  );
  return { user: userEvent.setup(), onClose, onJoin, onEdit, onOpen };
}

const dialog = () => within(screen.getByRole('dialog', { name: /Participants/ }));

beforeEach(() => {
  canWritePace = true;
});

describe('ParticipantsDialog rows', () => {
  it('shows each row with its label, name, branch chip, colour pip, effective counts and POC', () => {
    setup();
    const d = dialog();
    expect(d.getByText('GREEN')).toBeInTheDocument();
    // GREEN's name is its short label in another case, so it is not echoed.
    expect(d.queryByText('Green')).toBeNull();
    expect(d.getByText('USA')).toBeInTheDocument();
    // Two items; the PRC-152 carries ANW2 and SRW, and SRW was also picked
    // directly, so the effective set is two, not the one direct pick.
    expect(d.getByText('2 items · 2 waveforms')).toBeInTheDocument();
    expect(d.getByText('POC: Capt Lee')).toBeInTheDocument();

    const pips = d.getAllByTestId('participant-pip');
    expect(pips).toHaveLength(2);
    expect(pips[0]).toHaveStyle({ backgroundColor: 'rgb(46, 125, 50)' });
  });

  it('shows an Other row without a branch chip or a tag', () => {
    setup([KILO]);
    const d = dialog();
    expect(d.getByText('TF KILO')).toBeInTheDocument();
    expect(d.getByText('Task Force Kilo')).toBeInTheDocument();
    expect(d.queryByText('ad hoc')).toBeNull();
    expect(d.queryByText('USA')).toBeNull();
    expect(d.getByText('0 items · 0 waveforms')).toBeInTheDocument();
  });

  it('leads the counts with the platforms when any were declared, and counts their waveforms', () => {
    setup([{ ...KILO, platform_ids: ['stryker'] }]);
    // One Stryker: L16 of its own plus the PRC-152's ANW2 and SRW, with no item picked directly.
    expect(dialog().getByText('1 platform · 0 items · 3 waveforms')).toBeInTheDocument();
  });

  it('puts the POC on its own line under the counts, and draws no such line without one', () => {
    setup([{ ...GREEN, platform_ids: ['stryker'] }, KILO]);
    const d = dialog();
    const rows = d.getAllByRole('listitem');
    // A platform, items and a POC: three counts on one line, the POC on the next.
    const counts = within(rows[0]!).getByText('1 platform · 2 items · 3 waveforms');
    const poc = within(rows[0]!).getByText('POC: Capt Lee');
    expect(poc).not.toBe(counts);
    expect(counts.compareDocumentPosition(poc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(counts.parentElement).toBe(poc.parentElement);
    expect(poc).toHaveStyle({ fontFamily: 'var(--font-mono)' });
    // KILO has no POC: the counts line alone, and no "POC:" anywhere in the row.
    expect(within(rows[1]!).getByText('0 items · 0 waveforms')).toBeInTheDocument();
    expect(within(rows[1]!).queryByText(/^POC:/)).toBeNull();
  });

  it('keeps the rows in the order given', () => {
    setup([KILO, GREEN]);
    const items = dialog().getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('TF KILO');
    expect(items[1]).toHaveTextContent('GREEN');
  });
});

describe('ParticipantsDialog subtitle', () => {
  it('says no one has joined for an empty list', () => {
    setup([]);
    expect(dialog().getByText('No one has joined yet')).toBeInTheDocument();
    expect(dialog().getByText('No one has joined yet.')).toBeInTheDocument();
  });

  it('counts one in the singular', () => {
    setup([GREEN]);
    expect(dialog().getByText('1 has joined Operation Avalanche')).toBeInTheDocument();
  });

  it('counts several in the plural', () => {
    setup();
    expect(dialog().getByText('2 have joined Operation Avalanche')).toBeInTheDocument();
  });

  it('names the operation by its full name, never its acronym', () => {
    setup(undefined, { ...OPERATION, acronym: 'AV' });
    expect(dialog().getByText('2 have joined Operation Avalanche')).toBeInTheDocument();
    expect(dialog().queryByText(/AV/)).toBeNull();
  });
});

describe('ParticipantsDialog write controls', () => {
  it('offers Edit and Join Operation to a PACE writer, and no Check out', () => {
    setup();
    const d = dialog();
    expect(d.getByRole('button', { name: 'Edit GREEN' })).toBeInTheDocument();
    expect(d.queryByRole('button', { name: /^Check out / })).toBeNull();
    expect(d.getByRole('button', { name: 'Edit TF KILO' })).toBeInTheDocument();
    expect(d.getByRole('button', { name: 'Join Operation' })).toBeInTheDocument();
    expect(d.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('shows a viewer the list and Close only', () => {
    canWritePace = false;
    setup();
    const d = dialog();
    expect(d.getByText('GREEN')).toBeInTheDocument();
    expect(d.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(d.queryByRole('button', { name: /^Check out / })).toBeNull();
    expect(d.queryByRole('button', { name: 'Join Operation' })).toBeNull();
    expect(d.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('Edit hands the row to onEdit', async () => {
    const { user, onEdit } = setup();
    await user.click(dialog().getByRole('button', { name: 'Edit TF KILO' }));
    expect(onEdit).toHaveBeenCalledWith(KILO);
  });

  it('Join Operation calls onJoin', async () => {
    const { user, onJoin } = setup();
    await user.click(dialog().getByRole('button', { name: 'Join Operation' }));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('Close calls onClose', async () => {
    const { user, onClose } = setup();
    await user.click(dialog().getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ParticipantsDialog open a unit', () => {
  it('hands a clicked row to onOpen, for a writer and for a viewer, and Edit stays a separate control', async () => {
    const { user, onOpen, onEdit } = setup();
    await user.click(dialog().getByRole('button', { name: 'Open TF KILO' }));
    expect(onOpen).toHaveBeenCalledWith(KILO);
    expect(onEdit).not.toHaveBeenCalled();

    canWritePace = false;
    cleanup();
    const viewer = setup();
    await viewer.user.click(dialog().getByRole('button', { name: 'Open GREEN' }));
    expect(viewer.onOpen).toHaveBeenCalledWith(GREEN);
    expect(dialog().queryByRole('button', { name: /^Edit / })).toBeNull();
  });

  it('opens a row from the keyboard, Enter or Space on the focused row', async () => {
    const { user, onOpen } = setup();
    dialog().getByRole('button', { name: 'Open GREEN' }).focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenLastCalledWith(GREEN);
    await user.keyboard(' ');
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('puts one Open button on each row, in the order given', () => {
    setup([KILO, GREEN]);
    expect(dialog().getAllByRole('button', { name: /^Open / }).map((b) => b.getAttribute('aria-label')))
      .toEqual(['Open TF KILO', 'Open GREEN']);
  });
});

describe('ParticipantsDialog remove a unit', () => {
  beforeEach(() => { removeMutate.mockReset(); canWritePace = true; });

  it('puts the X left of Edit on each row, for writers only', () => {
    setup();
    const row = dialog().getByRole('button', { name: 'Remove GREEN' }).parentElement!;
    expect(Array.from(row.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))).toEqual(['Remove GREEN', 'Edit GREEN']);
    cleanup();
    canWritePace = false;
    setup();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
  });

  it('asks by name and operation first, and removes nothing on Cancel', async () => {
    const { user, onOpen } = setup();
    await user.click(dialog().getByRole('button', { name: 'Remove TF KILO' }));
    expect(onOpen).not.toHaveBeenCalled();
    const confirm = within(screen.getByRole('dialog', { name: /^Remove .+\?$/ }));
    expect(confirm.getByText('Its gear, locations and must-talk pairs go with it.')).toBeInTheDocument();
    await user.click(confirm.getByRole('button', { name: 'Cancel' }));
    expect(removeMutate).not.toHaveBeenCalled();
  });

  it('removes that participant row on Remove', async () => {
    const { user } = setup();
    await user.click(dialog().getByRole('button', { name: 'Remove GREEN' }));
    await user.click(within(screen.getByRole('dialog', { name: /^Remove .+\?$/ })).getByRole('button', { name: 'Remove' }));
    expect(removeMutate).toHaveBeenCalledWith({ operationId: 'op-1', participantId: GREEN.id }, expect.anything());
  });

  it('keeps the confirmation open and says why when the delete fails', async () => {
    removeMutate.mockImplementation((_vars: unknown, opts: { onError: (e: Error) => void }) => { opts.onError(new Error('boom')); });
    const { user } = setup();
    await user.click(dialog().getByRole('button', { name: 'Remove GREEN' }));
    await user.click(within(screen.getByRole('dialog', { name: /^Remove .+\?$/ })).getByRole('button', { name: 'Remove' }));
    expect(within(screen.getByRole('dialog', { name: /^Remove .+\?$/ })).getByRole('alert')).toBeInTheDocument();
  });
});

describe('ParticipantsDialog add to library on remove', () => {
  const confirmDialog = () => within(screen.getByRole('dialog', { name: /^Remove .+\?$/ }));
  beforeEach(() => {
    removeMutate.mockReset(); createMutateAsync.mockReset(); showToast.mockReset(); canWritePace = true;
  });

  it('offers only Cancel and Remove for a library row', async () => {
    const { user } = setup();
    await user.click(dialog().getByRole('button', { name: 'Remove GREEN' }));
    expect(confirmDialog().getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(confirmDialog().getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(confirmDialog().queryByRole('button', { name: 'Add to library and remove' })).toBeNull();
    expect(confirmDialog().queryByText(/isn't currently in the library/)).toBeNull();
  });

  it('creates the organization, then removes the row and toasts, for an Other row', async () => {
    createMutateAsync.mockResolvedValue({});
    removeMutate.mockImplementation((_v: unknown, opts: { onSuccess: () => void }) => { opts.onSuccess(); });
    const { user } = setup();
    await user.click(dialog().getByRole('button', { name: 'Remove TF KILO' }));
    expect(confirmDialog().getByText("Task Force Kilo isn't currently in the library, add for future use?")).toBeInTheDocument();
    await user.click(confirmDialog().getByRole('button', { name: 'Add to library and remove' }));
    expect(createMutateAsync).toHaveBeenCalledWith({
      key: 'task_force_kilo', name: 'Task Force Kilo', short_label: 'TF KILO', branch: '', color: '', section_key: '', notes: '',
    });
    expect(removeMutate).toHaveBeenCalledWith({ operationId: 'op-1', participantId: KILO.id }, expect.anything());
    expect(showToast).toHaveBeenCalledWith('Added TF KILO to the library and removed it from Operation Avalanche');
  });

  it('shows the error and removes nothing when the create fails', async () => {
    createMutateAsync.mockRejectedValue(new Error('exists'));
    const { user } = setup();
    await user.click(dialog().getByRole('button', { name: 'Remove TF KILO' }));
    await user.click(confirmDialog().getByRole('button', { name: 'Add to library and remove' }));
    expect(await confirmDialog().findByRole('alert')).toBeInTheDocument();
    expect(removeMutate).not.toHaveBeenCalled();
  });
});

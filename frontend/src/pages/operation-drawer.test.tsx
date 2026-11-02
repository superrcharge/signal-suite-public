import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor, within } from '@/test/utils';
import { ApiClientError } from '@/services/api-client';
import { OperationDrawer } from './operation-drawer';
import type { Operation, Participant, Phase, Site } from '@/types';

const { createMutate, updateMutate, deleteMutate, phasesMutate, sitesMutate } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  deleteMutate: vi.fn(),
  phasesMutate: vi.fn(),
  sitesMutate: vi.fn(),
}));

vi.mock('@/services', () => ({
  useCreateOperation: () => ({ mutate: createMutate, isPending: false }),
  useUpdateOperation: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteOperation: () => ({ mutate: deleteMutate, isPending: false }),
  useSaveOperationPhases: () => ({ mutate: phasesMutate, isPending: false }),
  useSaveOperationSites: () => ({ mutate: sitesMutate, isPending: false }),
}));

const OPERATION: Operation = {
  id: 'op-1',
  name: 'Operation Avalanche',
  acronym: 'AV',
  status: 'active',
  start_date: '2026-10-01',
  end_date: '2026-10-14',
  notes: 'Cold weather',
  created_by: '',
  updated_by: '',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  participant_count: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps an implementation a test set; the phases tests set them.
  updateMutate.mockReset();
  phasesMutate.mockReset();
  sitesMutate.mockReset();
});

describe('OperationDrawer', () => {
  it('creates with the name and an upper-cased acronym, no dates and no status, which the server defaults', async () => {
    const user = userEvent.setup();
    render(<OperationDrawer open onClose={vi.fn()} />);
    expect(screen.getByText('Add Operation')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^name/i), 'Blizzard');
    await user.type(screen.getByLabelText(/^acronym/i), 'bz');
    expect(screen.getByText('Shown in place of the name, e.g. OMS')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0]?.[0]).toEqual({
      name: 'Blizzard',
      acronym: 'BZ',
      notes: '',
    });
    expect(createMutate.mock.calls[0]?.[0]).not.toHaveProperty('start_date');
    expect(createMutate.mock.calls[0]?.[0]).not.toHaveProperty('end_date');
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it('offers no date fields', () => {
    render(<OperationDrawer open operation={OPERATION} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('Start Date')).toBeNull();
    expect(screen.queryByLabelText('End Date')).toBeNull();
  });

  it('caps the acronym at 20 and renders it uppercase', () => {
    render(<OperationDrawer open operation={OPERATION} onClose={vi.fn()} />);
    const acronym = screen.getByLabelText(/^acronym/i);
    expect(acronym).toHaveValue('AV');
    expect(acronym).toHaveAttribute('maxlength', '20');
    expect(acronym).toHaveStyle({ textTransform: 'uppercase' });
  });

  it('does not submit without a name', () => {
    render(<OperationDrawer open onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('offers no Status field', () => {
    render(<OperationDrawer open operation={OPERATION} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('Status')).toBeNull();
    expect(screen.queryByText('Active')).toBeNull();
  });

  it('edits, sending the whole form under the operation id', async () => {
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} onClose={vi.fn()} />);
    expect(screen.getByText('Edit Operation')).toBeInTheDocument();

    const name = screen.getByLabelText(/^name/i);
    await user.clear(name);
    await user.type(name, 'Whiteout');
    await user.clear(screen.getByLabelText(/^acronym/i));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // A cleared acronym is sent blank, which the server reads as "clear it".
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0]?.[0]).toEqual({
      id: 'op-1',
      data: {
        name: 'Whiteout',
        acronym: '',
        notes: 'Cold weather',
      },
    });
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('deletes only after the confirm dialog', async () => {
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Delete operation?')).toBeInTheDocument();
    // The full name, never the acronym: the confirm names what is about to go.
    expect(screen.getByText('Operation Avalanche')).toBeInTheDocument();
    expect(screen.queryByText('AV')).toBeNull();

    const buttons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(buttons[buttons.length - 1] as HTMLElement);
    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate.mock.calls[0]?.[0]).toBe('op-1');
  });

  it('offers no Delete when adding', () => {
    render(<OperationDrawer open onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

const PLAN = { supported_participant_id: null, placements: {}, requirements: [] };
const PHASES: Phase[] = [
  { id: 'ph1', operation_id: 'op-1', position: 1, name: 'Phase I', ...PLAN },
  { id: 'ph2', operation_id: 'op-1', position: 2, name: 'Phase II', ...PLAN },
  { id: 'ph3', operation_id: 'op-1', position: 3, name: 'Phase III', ...PLAN },
];
const SITES: Site[] = [
  { id: 's1', operation_id: 'op-1', position: 0, name: 'ISB' },
  { id: 's2', operation_id: 'op-1', position: 1, name: 'FSB' },
  { id: 's3', operation_id: 'op-1', position: 2, name: 'MSS' },
];

// One organization: a Black Hawk with no key (so in every phase), a radio in
// Phases I and II only, and a transport in Phase I only.
const GREEN: Participant = {
  id: 'p1', operation_id: 'op-1', organization_key: 'green',
  organization: { key: 'green', name: 'Green', short_label: 'GREEN', branch: 'USA', color: '#2E7D32', adhoc: false },
  platform_ids: ['uh-60'], equipment_ids: ['prc-152'], waveform_abbrevs: [], service_abbrevs: [], transport_ids: ['t1'],
  asset_phases: { 'prc-152': ['ph1', 'ph2'], t1: ['ph1'] },
  poc_name: '', poc_phone: '', poc_email: '', notes: '',
  created_by: '', updated_by: '', created_at: '', updated_at: '',
};

/** The operation PATCH succeeds at once, so the drawer moves on to the phases PUT. */
const patchSucceeds = () => {
  updateMutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: () => void }) => { opts?.onSuccess?.(); });
};

const phaseName = (n: number) => screen.getByLabelText(`Phase ${n} name`);

describe('OperationDrawer phases', () => {
  it('lists the phases in order when editing, and none when adding', () => {
    const { unmount } = render(<OperationDrawer open operation={OPERATION} phases={PHASES} onClose={vi.fn()} />);
    const group = within(screen.getByRole('group', { name: 'Phases' }));
    expect(group.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value)).toEqual(['Phase I', 'Phase II', 'Phase III']);
    expect(phaseName(1)).toHaveAttribute('maxlength', '60');
    expect(group.getByRole('button', { name: 'Move phase 1 up' })).toBeDisabled();
    expect(group.getByRole('button', { name: 'Move phase 3 down' })).toBeDisabled();
    unmount();

    render(<OperationDrawer open phases={PHASES} onClose={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Phases' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add phase' })).toBeNull();
  });

  it('sends only the operation PATCH when the phases were not touched', async () => {
    patchSucceeds();
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} onSaved={onSaved} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(phasesMutate).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('adds, renames and reorders, then PUTs the list with ids kept and the new phase bare, after the PATCH', async () => {
    patchSucceeds();
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} onSaved={onSaved} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Add phase' }));
    // The next "Phase N" no row is using.
    expect(phaseName(4)).toHaveValue('Phase IV');
    await user.click(screen.getByRole('button', { name: 'Move phase 3 up' }));
    await user.clear(phaseName(1));
    await user.type(phaseName(1), '  Alpha ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(phasesMutate).toHaveBeenCalledTimes(1);
    expect(phasesMutate.mock.calls[0]?.[0]).toEqual({
      operationId: 'op-1',
      data: {
        phases: [
          { id: 'ph1', name: 'Alpha' },
          { id: 'ph3', name: 'Phase III' },
          { id: 'ph2', name: 'Phase II' },
          { name: 'Phase IV' },
        ],
      },
    });
    // Nothing is said to the page until the PUT lands.
    expect(onSaved).not.toHaveBeenCalled();
    (phasesMutate.mock.calls[0]?.[1] as { onSuccess: () => void }).onSuccess();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('names a new phase past one a rename already took', async () => {
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} onClose={vi.fn()} />);
    await user.clear(phaseName(1));
    await user.type(phaseName(1), 'phase iv');
    await user.click(screen.getByRole('button', { name: 'Add phase' }));
    expect(phaseName(4)).toHaveValue('Phase V');
  });

  it('removes an unmarked phase and a freshly added one without asking', async () => {
    patchSucceeds();
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} participants={[]} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Add phase' }));
    await user.click(screen.getByRole('button', { name: 'Remove phase 4' }));
    expect(screen.queryByText('Remove phase?')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remove phase 2' }));
    expect(screen.queryByText('Remove phase?')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(phasesMutate.mock.calls[0]?.[0]).toEqual({
      operationId: 'op-1',
      data: { phases: [{ id: 'ph1', name: 'Phase I' }, { id: 'ph3', name: 'Phase III' }] },
    });
  });

  it('asks before removing a phase assets are marked in, naming it and the marks that go with it', async () => {
    patchSucceeds();
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} participants={[GREEN]} onClose={vi.fn()} />);

    // Phase II holds the Black Hawk (no key means every phase) and the radio.
    await user.click(screen.getByRole('button', { name: 'Remove phase 2' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Remove phase?' }));
    expect(dialog.getByText('Phase II')).toBeInTheDocument();
    expect(dialog.getByText(/2 asset marks across 1 organization/)).toBeInTheDocument();
    expect(phaseName(2)).toHaveValue('Phase II');

    // Cancel leaves the list alone.
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: 'Remove phase?' })).toBeNull(); });
    expect(phaseName(2)).toHaveValue('Phase II');
    expect(phasesMutate).not.toHaveBeenCalled();

    // Phase III is the Black Hawk alone, which is singular.
    await user.click(screen.getByRole('button', { name: 'Remove phase 3' }));
    expect(screen.getByText(/1 asset mark across 1 organization/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByLabelText('Phase 3 name')).toBeNull();
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: 'Remove phase?' })).toBeNull(); });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(phasesMutate.mock.calls[0]?.[0]).toEqual({
      operationId: 'op-1',
      data: { phases: [{ id: 'ph1', name: 'Phase I' }, { id: 'ph2', name: 'Phase II' }] },
    });
  });

  it('will not remove the last phase', () => {
    render(<OperationDrawer open operation={OPERATION} phases={[PHASES[0] as Phase]} onClose={vi.fn()} />);
    const remove = screen.getByRole('button', { name: 'Remove phase 1' });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute('title', 'An operation needs at least one phase');
  });

  it('refuses a duplicate or blank name before anything is sent', async () => {
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} onClose={vi.fn()} />);

    await user.clear(phaseName(2));
    await user.type(phaseName(2), ' phase i');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Two phases have the same name');

    await user.clear(phaseName(2));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Every phase needs a name');
    expect(updateMutate).not.toHaveBeenCalled();
    expect(phasesMutate).not.toHaveBeenCalled();
  });

  it('shows the server refusing a duplicate name, keeps the drawer open and the phase edits in place', async () => {
    patchSucceeds();
    phasesMutate.mockImplementation((_vars: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(new ApiClientError('OPERATION_PHASE_NAME_EXISTS', 'phase name already used', undefined, 409));
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} onSaved={onSaved} onClose={vi.fn()} />);
    await user.clear(phaseName(3));
    await user.type(phaseName(3), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Two phases have the same name');
    expect(onSaved).not.toHaveBeenCalled();
    expect(phaseName(3)).toHaveValue('Renamed');
  });
});

const siteName = (n: number) => screen.getByLabelText(`Location ${n} name`);

describe('OperationDrawer locations', () => {
  it('lists the locations in order when editing, with none required, and nothing when adding', () => {
    const { unmount } = render(<OperationDrawer open operation={OPERATION} phases={PHASES} sites={SITES} onClose={vi.fn()} />);
    const group = within(screen.getByRole('group', { name: 'Locations' }));
    expect(group.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value)).toEqual(['ISB', 'FSB', 'MSS']);
    expect(siteName(1)).toHaveAttribute('maxlength', '60');
    expect(group.getByRole('button', { name: 'Move location 1 up' })).toBeDisabled();
    expect(group.getByRole('button', { name: 'Move location 3 down' })).toBeDisabled();
    unmount();

    render(<OperationDrawer open sites={SITES} onClose={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Locations' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add location' })).toBeNull();
  });

  it('allows zero locations, and sits under the Phases list', () => {
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} sites={[]} onClose={vi.fn()} />);
    const locations = screen.getByRole('group', { name: 'Locations' });
    expect(within(locations).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(locations).getByRole('button', { name: 'Add location' })).toBeEnabled();
    const phases = screen.getByRole('group', { name: 'Phases' });
    expect(phases.compareDocumentPosition(locations) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sends no sites PUT when the locations were not touched', async () => {
    patchSucceeds();
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} sites={SITES} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(sitesMutate).not.toHaveBeenCalled();
  });

  it('adds, renames and reorders, then PUTs the list with ids kept and the new location bare, after the PATCH', async () => {
    patchSucceeds();
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} sites={SITES} onSaved={onSaved} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Add location' }));
    // The next "Location N" no row is using.
    expect(siteName(4)).toHaveValue('Location 4');
    await user.click(screen.getByRole('button', { name: 'Move location 3 up' }));
    await user.clear(siteName(1));
    await user.type(siteName(1), '  The X ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(phasesMutate).not.toHaveBeenCalled();
    expect(sitesMutate).toHaveBeenCalledTimes(1);
    expect(sitesMutate.mock.calls[0]?.[0]).toEqual({
      operationId: 'op-1',
      data: { sites: [{ id: 's1', name: 'The X' }, { id: 's3', name: 'MSS' }, { id: 's2', name: 'FSB' }, { name: 'Location 4' }] },
    });
    // Nothing is said to the page until the PUT lands.
    expect(onSaved).not.toHaveBeenCalled();
    (sitesMutate.mock.calls[0]?.[1] as { onSuccess: () => void }).onSuccess();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('names a new location past one a rename already took', async () => {
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} sites={SITES} onClose={vi.fn()} />);
    await user.clear(siteName(1));
    await user.type(siteName(1), 'location 4');
    await user.click(screen.getByRole('button', { name: 'Add location' }));
    expect(siteName(4)).toHaveValue('Location 5');
  });

  it('saves the phases before the locations when both changed', async () => {
    patchSucceeds();
    phasesMutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: () => void }) => { opts?.onSuccess?.(); });
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} sites={SITES} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Add phase' }));
    await user.click(screen.getByRole('button', { name: 'Remove location 3' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(phasesMutate).toHaveBeenCalledTimes(1);
    expect(sitesMutate).toHaveBeenCalledTimes(1);
    expect(phasesMutate.mock.invocationCallOrder[0]).toBeLessThan(sitesMutate.mock.invocationCallOrder[0] as number);
    expect(sitesMutate.mock.calls[0]?.[0]).toEqual({
      operationId: 'op-1',
      data: { sites: [{ id: 's1', name: 'ISB' }, { id: 's2', name: 'FSB' }] },
    });
  });

  it('removes an unplaced location and a freshly added one without asking, and may empty the list', async () => {
    patchSucceeds();
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} sites={SITES.slice(0, 1)} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Add location' }));
    await user.click(screen.getByRole('button', { name: 'Remove location 2' }));
    await user.click(screen.getByRole('button', { name: 'Remove location 1' }));
    expect(screen.queryByText('Remove location?')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(sitesMutate.mock.calls[0]?.[0]).toEqual({ operationId: 'op-1', data: { sites: [] } });
  });

  it('asks before removing a location units are placed at, naming it and how many placements go with it', async () => {
    patchSucceeds();
    const placed: Phase[] = [
      { ...PHASES[0] as Phase, placements: { p1: 's1', p2: 's2' } },
      { ...PHASES[1] as Phase, placements: { p1: 's1' } },
    ];
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={placed} sites={SITES} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Remove location 1' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Remove location?' }));
    expect(dialog.getByText('ISB')).toBeInTheDocument();
    expect(dialog.getByText(/2 placements/)).toBeInTheDocument();
    expect(siteName(1)).toHaveValue('ISB');

    // Cancel leaves the list alone.
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: 'Remove location?' })).toBeNull(); });
    expect(siteName(1)).toHaveValue('ISB');
    expect(sitesMutate).not.toHaveBeenCalled();

    // FSB has one placement, which is singular.
    await user.click(screen.getByRole('button', { name: 'Remove location 2' }));
    expect(screen.getByText(/1 placement\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: 'Remove location?' })).toBeNull(); });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(sitesMutate.mock.calls[0]?.[0]).toEqual({
      operationId: 'op-1',
      data: { sites: [{ id: 's1', name: 'ISB' }, { id: 's3', name: 'MSS' }] },
    });
  });

  it('refuses a duplicate or blank name before anything is sent', async () => {
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} sites={SITES} onClose={vi.fn()} />);

    await user.clear(siteName(2));
    await user.type(siteName(2), ' isb');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Two locations have the same name');

    await user.clear(siteName(2));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Every location needs a name');
    expect(updateMutate).not.toHaveBeenCalled();
    expect(sitesMutate).not.toHaveBeenCalled();
  });

  it('shows the server refusing a duplicate name, keeps the drawer open and the location edits in place', async () => {
    patchSucceeds();
    sitesMutate.mockImplementation((_vars: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(new ApiClientError('OPERATION_SITE_NAME_EXISTS', 'site name already used', undefined, 409));
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<OperationDrawer open operation={OPERATION} phases={PHASES} sites={SITES} onSaved={onSaved} onClose={vi.fn()} />);
    await user.clear(siteName(3));
    await user.type(siteName(3), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Two locations have the same name');
    expect(onSaved).not.toHaveBeenCalled();
    expect(siteName(3)).toHaveValue('Renamed');
  });
});

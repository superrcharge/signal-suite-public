import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';

import { renderWithRoute, screen, waitFor, within } from '@/test/utils';
import type { Equipment, Operation, Participant, Phase, Platform, Site, Waveform } from '@/types';
import { OperationWebView } from './operation-web-view';

const stamps = { created_by: 't', updated_by: 't', created_at: '', updated_at: '' };

const OPERATION: Operation = {
  id: 'op-1', name: 'Operation Avalanche', acronym: 'AV', status: 'active', start_date: '2026-10-01', end_date: '',
  notes: '', participant_count: 2, ...stamps,
};

// A PRC-152 carrying ANW2.
const EQUIPMENT: Equipment[] = [{
  id: 'prc-152', nomenclature: 'AN/PRC-152', terminal_type: 'radio', operational_mode: [],
  data: {
    services: [], waveforms: [{ abbrev: 'ANW2', name: 'ANW2' }], bands: [],
    standard_specs: {}, physical_specs: [], rf_specs: [], swap: {}, features: [],
  },
  ...stamps,
}];
const WAVEFORMS: Waveform[] = [
  { id: 'w1', abbrev: 'ANW2', name: 'Adaptive Networking Wideband', description: '', ...stamps },
  { id: 'w2', abbrev: 'L16', name: 'Link 16', description: '', ...stamps },
];
// A Chinook that carries L16 on its own, and ANW2 through the PRC-152 it lists.
const PLATFORMS: Platform[] = [{
  id: 'ch-47', designation: 'CH-47F', popular_name: 'Chinook', category: ['USA'], type: 'aircraft',
  waveform_abbrevs: ['L16'], equipment_ids: ['prc-152'], notes: '', ...stamps,
}];

const state = vi.hoisted(() => ({ loading: false, error: false }));
const { saveMutate } = vi.hoisted(() => ({ saveMutate: vi.fn() }));

vi.mock('@/services', () => ({
  useEquipment: () => ({ data: { equipment: EQUIPMENT, total: EQUIPMENT.length }, isLoading: state.loading, isError: state.error }),
  useWaveforms: () => ({ data: { waveforms: WAVEFORMS, total: WAVEFORMS.length }, isLoading: state.loading, isError: false }),
  usePlatforms: () => ({ data: { platforms: PLATFORMS, total: PLATFORMS.length }, isLoading: state.loading, isError: false }),
  useTransports: () => ({ data: { transports: [], total: 0 }, isLoading: state.loading, isError: false }),
  useServices: () => ({ data: { services: [], total: 0 }, isLoading: state.loading, isError: false }),
  useSavePhasePlan: () => ({ mutate: saveMutate, isPending: false }),
}));

const GREEN: Participant = {
  id: 'p1', operation_id: 'op-1', organization_key: 'green',
  organization: { key: 'green', name: 'Green', short_label: 'GREEN', branch: 'USA', color: '#2E7D32', adhoc: false },
  platform_ids: [], equipment_ids: ['prc-152'], waveform_abbrevs: [], service_abbrevs: [], transport_ids: [],
  asset_phases: {},
  poc_name: '', poc_phone: '', poc_email: '', notes: '',
  ...stamps,
};

const KILO: Participant = {
  id: 'p2', operation_id: 'op-1', organization_key: '',
  organization: { key: '', name: 'Task Force Kilo', short_label: 'TF KILO', branch: '', color: '', adhoc: true },
  platform_ids: ['ch-47'], equipment_ids: [], waveform_abbrevs: [], service_abbrevs: [], transport_ids: [],
  asset_phases: {},
  poc_name: '', poc_phone: '', poc_email: '', notes: '',
  ...stamps,
};

const PLAN = { supported_participant_id: null, placements: {}, requirements: [] };
const PHASES: Phase[] = [
  // p9 is on no row here: a stored placement for a unit that is not present, which a save must send back as it was.
  { id: 'ph1', operation_id: 'op-1', position: 1, name: 'Phase I', ...PLAN, placements: { p1: 's1', p9: 's2' } },
  { id: 'ph2', operation_id: 'op-1', position: 2, name: 'Phase II', ...PLAN },
];
const SITES: Site[] = [
  { id: 's1', operation_id: 'op-1', position: 0, name: 'ISB' },
  { id: 's2', operation_id: 'op-1', position: 1, name: 'MSS' },
];
// GREEN's radio is in Phase I only; KILO's Chinook is in both.
const GREEN_P1: Participant = { ...GREEN, asset_phases: { 'prc-152': ['ph1'] } };
const KILO_BOTH: Participant = { ...KILO, asset_phases: { 'ch-47': ['ph1', 'ph2'] } };

const Probe = () => <output data-testid="search">{useLocation().search}</output>;
const renderAt = (
  route: string,
  over: { participants?: Participant[]; phases?: Phase[]; sites?: Site[]; canWrite?: boolean } = {},
) => renderWithRoute(
  <>
    <OperationWebView
      operation={OPERATION}
      participants={over.participants ?? [GREEN_P1, KILO_BOTH]}
      phases={over.phases ?? PHASES}
      sites={over.sites ?? SITES}
      canWrite={over.canWrite ?? true}
    />
    <Probe />
  </>,
  route,
);
const search = () => screen.getByTestId('search').textContent;
const panel = (name = 'Plan for Phase I') => within(screen.getByRole('region', { name }));

beforeEach(() => { saveMutate.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('OperationWebView', () => {
  it('is always about one phase: the first by default, no All phases, headed with the operation and the phase', () => {
    renderAt('/operations/op-1?view=web');
    const phase = within(screen.getByRole('group', { name: 'Phase' }));
    expect(phase.getAllByRole('button').map((b) => b.textContent)).toEqual(['Phase I', 'Phase II']);
    expect(phase.getByRole('button', { name: 'Phase I' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'All phases' })).toBeNull();
    // No visible heading; the picture's region carries the phase for a screen reader.
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(screen.getByRole('region', { name: 'Phase I: who must talk to whom' })).toBeInTheDocument();
    // The operation's name lives in the page banner, not over the picture.
    expect(screen.queryByText('AV')).toBeNull();
  });

  it('reads ?phase= for the phase, and an id the operation does not have as the first', () => {
    renderAt('/operations/op-1?view=web&phase=ph2');
    expect(screen.getByRole('button', { name: 'Phase II' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Phase II: who must talk to whom' })).toBeInTheDocument();
  });

  it('reads an unknown phase as the first', () => {
    renderAt('/operations/op-1?view=web&phase=gone');
    expect(screen.getByRole('button', { name: 'Phase I' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('has no layout switch, and ignores ?layout=', () => {
    renderAt('/operations/op-1?view=web&layout=ring');
    expect(screen.queryByRole('group', { name: 'Layout' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hub' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Flow' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ring' })).toBeNull();
  });

  it('has an All, Gaps or Focus switch, on All, and Focus follows ?focus= across a change of phase', async () => {
    const user = userEvent.setup();
    renderAt('/operations/op-1?view=web&focus=p2');
    const show = within(screen.getByRole('group', { name: 'Show' }));
    expect(show.getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'Gaps', 'Focus']);
    expect(show.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(show.getByRole('button', { name: 'Focus' }));
    expect(within(screen.getByRole('group', { name: 'Focus unit' })).getByRole('button', { name: 'TF KILO' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Phase II' }));
    expect(search()).toBe('?view=web&focus=p2&phase=ph2');
    // TF KILO is in Phase II as well, so it stays the focus.
    expect(within(screen.getByRole('group', { name: 'Focus unit' })).getByRole('button', { name: 'TF KILO' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('the phase chips write ?phase= and narrow the picture to the units in that phase, leaving other params alone', async () => {
    const user = userEvent.setup();
    renderAt('/operations/op-1?view=web');
    expect(await screen.findAllByTestId('phase-unit')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Phase II' }));
    expect(search()).toBe('?view=web&phase=ph2');
    // GREEN's radio is not in Phase II, so GREEN is not drawn.
    await waitFor(() => { expect(screen.getAllByTestId('phase-unit')).toHaveLength(1); });
    expect(screen.getByRole('region', { name: 'Phase II: who must talk to whom' })).toBeInTheDocument();
  });

  it('draws a box per location and the units in the box the phase places them in', async () => {
    renderAt('/operations/op-1?view=web');
    const boxes = await screen.findAllByTestId('phase-box');
    expect(within(boxes[0]!).getByTestId('phase-box-title')).toHaveTextContent('ISB');
    expect(screen.getAllByTestId('phase-box-title').map((t) => t.textContent)).toEqual(['ISB', 'No location']);
    expect(screen.getByText('Not used this phase: MSS')).toBeInTheDocument();
  });

  it('offers no phase switch for one phase, and still names it', () => {
    renderAt('/operations/op-1?view=web', { phases: [PHASES[0]!] });
    expect(screen.queryByRole('group', { name: 'Phase' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Phase I: who must talk to whom' })).toBeInTheDocument();
  });

  describe('the planning panel', () => {
    it('is there for writers, beside the picture', () => {
      renderAt('/operations/op-1?view=web');
      const p = panel();
      expect(p.getByLabelText('Tier select')).toHaveValue('');
      expect(p.getByLabelText('Location of GREEN')).toHaveValue('s1');
      expect(p.getByLabelText('Location of TF KILO')).toHaveValue('');
      expect(p.getByRole('button', { name: 'Save' })).toBeDisabled();
      expect(p.getByRole('button', { name: 'Reset' })).toBeDisabled();
    });

    it('puts the plan toggle at the end of the phase row, in both states, not beside the picture', async () => {
      const user = userEvent.setup();
      renderAt('/operations/op-1?view=web');
      expect(await screen.findAllByTestId('phase-unit')).toHaveLength(2);
      const row = screen.getByRole('group', { name: 'Phase' }).parentElement!;
      // The label says what a click does: Hide plan while it is open, View plan while it is not.
      expect(row.lastElementChild).toBe(screen.getByRole('button', { name: 'Hide plan' }));
      expect(screen.getByRole('button', { name: 'Hide plan' })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: 'Hide plan' })).not.toHaveAttribute('aria-pressed');
      await user.click(screen.getByRole('button', { name: 'Hide plan' }));
      expect(row.lastElementChild).toBe(screen.getByRole('button', { name: 'View plan' }));
      expect(screen.getByRole('button', { name: 'View plan' })).toHaveAttribute('aria-expanded', 'false');
    });

    it('hides and shows with a button, remembers the choice for this viewer, and leaves the picture drawn either way', async () => {
      const user = userEvent.setup();
      const first = renderAt('/operations/op-1?view=web');
      expect(await screen.findAllByTestId('phase-unit')).toHaveLength(2);
      await user.click(screen.getByRole('button', { name: 'Hide plan' }));
      expect(screen.queryByRole('region', { name: /^Plan for/ })).toBeNull();
      expect(screen.getByRole('button', { name: 'View plan' })).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getAllByTestId('phase-unit')).toHaveLength(2);
      expect(localStorage.getItem('signal-suite-operation-plan-panel')).toBe('hidden');
      // A later visit starts the way it was left.
      first.unmount();
      renderAt('/operations/op-1?view=web');
      expect(screen.queryByRole('region', { name: /^Plan for/ })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'View plan' }));
      expect(screen.getByRole('region', { name: 'Plan for Phase I' })).toBeInTheDocument();
      expect(localStorage.getItem('signal-suite-operation-plan-panel')).toBe('shown');
    });

    it('keeps an unsaved edit while the panel is hidden', async () => {
      const user = userEvent.setup();
      renderAt('/operations/op-1?view=web');
      await user.selectOptions(panel().getByLabelText('Tier select'), 'p2');
      await user.click(screen.getByRole('button', { name: 'Hide plan' }));
      await user.click(screen.getByRole('button', { name: 'View plan' }));
      expect(panel().getByLabelText('Tier select')).toHaveValue('p2');
    });

    it('is not there for a reader, who gets the picture alone', async () => {
      renderAt('/operations/op-1?view=web', { canWrite: false });
      expect(screen.queryByRole('region', { name: /^Plan for/ })).toBeNull();
      expect(screen.queryByLabelText('Tier select')).toBeNull();
      expect(await screen.findAllByTestId('phase-unit')).toHaveLength(2);
      expect(screen.queryByRole('button', { name: 'Plan' })).toBeNull();
    });

    it('offers only the units present in the phase, and says to add locations when there are none', () => {
      renderAt('/operations/op-1?view=web&phase=ph2', { sites: [] });
      const p = panel('Plan for Phase II');
      expect(within(p.getByLabelText('Tier select')).getAllByRole('option').map((o) => o.textContent)).toEqual(['None', 'TF KILO']);
      expect(p.getByText(/no locations yet/i)).toBeInTheDocument();
      expect(p.queryByLabelText('Location of TF KILO')).toBeNull();
    });

    it('adds a requirement, shows it in the picture before it is saved, and saves the right body', async () => {
      const user = userEvent.setup();
      renderAt('/operations/op-1?view=web');
      expect(screen.getByText('No requirements set for this phase')).toBeInTheDocument();
      const p = panel();
      await user.selectOptions(p.getByLabelText('First unit'), 'p1');
      // The partner list leaves the first unit out.
      expect(within(p.getByLabelText('Second unit')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Unit', 'TF KILO']);
      await user.selectOptions(p.getByLabelText('Second unit'), 'p2');
      await user.click(p.getByRole('button', { name: 'Add' }));

      expect(p.getByText('GREEN ↔ TF KILO')).toBeInTheDocument();
      expect(await screen.findByTestId('phase-line')).toHaveAttribute('data-status', 'direct');
      expect(screen.getByTestId('phase-requirement')).toHaveTextContent('GREEN - TF KILO');
      expect(saveMutate).not.toHaveBeenCalled();

      await user.selectOptions(p.getByLabelText('Tier select'), 'p2');
      await user.selectOptions(p.getByLabelText('Location of TF KILO'), 's2');
      await user.click(p.getByRole('button', { name: 'Save' }));
      expect(saveMutate).toHaveBeenCalledTimes(1);
      expect(saveMutate.mock.calls[0]?.[0]).toEqual({
        operationId: 'op-1',
        phaseId: 'ph1',
        data: {
          supported_participant_id: 'p2',
          // p9 is not in this phase and goes back as it was.
          placements: { p1: 's1', p2: 's2', p9: 's2' },
          requirements: [{ a: 'p1', b: 'p2' }],
        },
      });
    });

    it('will not offer a pair twice, nor a unit with itself', async () => {
      const user = userEvent.setup();
      const paired: Phase[] = [{ ...PHASES[0]!, requirements: [{ id: 'r1', a: 'p1', b: 'p2' }] }, PHASES[1]!];
      renderAt('/operations/op-1?view=web', { phases: paired });
      const p = panel();
      await user.selectOptions(p.getByLabelText('First unit'), 'p1');
      expect(within(p.getByLabelText('Second unit')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Unit']);
      expect(p.getByRole('button', { name: 'Add' })).toBeDisabled();
    });

    it('removes a requirement, and Save then sends the list without it', async () => {
      const user = userEvent.setup();
      const paired: Phase[] = [{ ...PHASES[0]!, requirements: [{ id: 'r1', a: 'p1', b: 'p2' }] }, PHASES[1]!];
      renderAt('/operations/op-1?view=web', { phases: paired });
      expect(await screen.findByTestId('phase-line')).toBeInTheDocument();
      const p = panel();
      await user.click(p.getByRole('button', { name: 'Remove GREEN and TF KILO' }));
      expect(screen.queryByTestId('phase-line')).toBeNull();
      await user.click(p.getByRole('button', { name: 'Save' }));
      expect((saveMutate.mock.calls[0]?.[0] as { data: { requirements: unknown[] } }).data.requirements).toEqual([]);
    });

    it('lists a requirement whose unit is not in the phase, so it can be removed, and sends it back untouched', async () => {
      const user = userEvent.setup();
      // GREEN is not in Phase II.
      const stored: Phase[] = [PHASES[0]!, { ...PHASES[1]!, requirements: [{ id: 'r1', a: 'p1', b: 'p2' }] }];
      renderAt('/operations/op-1?view=web&phase=ph2', { phases: stored });
      expect(screen.getByTestId('phase-requirement')).toHaveTextContent('not in this phase: GREEN');
      const p = panel('Plan for Phase II');
      expect(p.getByText('GREEN ↔ TF KILO')).toBeInTheDocument();
      await user.selectOptions(p.getByLabelText('Location of TF KILO'), 's1');
      await user.click(p.getByRole('button', { name: 'Save' }));
      expect((saveMutate.mock.calls[0]?.[0] as { data: { requirements: unknown[] } }).data.requirements).toEqual([{ a: 'p1', b: 'p2' }]);
    });

    it('enables Save and Reset only when the draft differs, and Reset puts the phase back', async () => {
      const user = userEvent.setup();
      renderAt('/operations/op-1?view=web');
      const p = panel();
      await user.selectOptions(p.getByLabelText('Tier select'), 'p1');
      expect(p.getByRole('button', { name: 'Save' })).toBeEnabled();
      expect(screen.getAllByTestId('phase-unit').find((u) => u.getAttribute('data-unit') === 'p1')).toHaveAttribute('data-supported', 'true');
      await user.click(p.getByRole('button', { name: 'Reset' }));
      expect(p.getByLabelText('Tier select')).toHaveValue('');
      expect(p.getByRole('button', { name: 'Save' })).toBeDisabled();
      expect(screen.getAllByTestId('phase-unit').every((u) => u.getAttribute('data-supported') === 'false')).toBe(true);
    });

    it('asks before switching phase with an unsaved plan, and stays when told no', async () => {
      const user = userEvent.setup();
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderAt('/operations/op-1?view=web');
      await user.selectOptions(panel().getByLabelText('Tier select'), 'p2');
      await user.click(screen.getByRole('button', { name: 'Phase II' }));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(confirm.mock.calls[0]?.[0]).toMatch(/Discard unsaved changes to the plan for Phase I and open Phase II\?/);
      expect(search()).toBe('?view=web');
      expect(panel().getByLabelText('Tier select')).toHaveValue('p2');
    });

    it('switches and drops the draft when told yes', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderAt('/operations/op-1?view=web');
      await user.selectOptions(panel().getByLabelText('Tier select'), 'p2');
      await user.click(screen.getByRole('button', { name: 'Phase II' }));
      expect(search()).toBe('?view=web&phase=ph2');
      expect(panel('Plan for Phase II').getByLabelText('Tier select')).toHaveValue('');
      await user.click(screen.getByRole('button', { name: 'Phase I' }));
      expect(panel().getByLabelText('Tier select')).toHaveValue('');
    });

    it('switches without asking when the plan is clean', async () => {
      const user = userEvent.setup();
      const confirm = vi.spyOn(window, 'confirm');
      renderAt('/operations/op-1?view=web');
      await user.click(screen.getByRole('button', { name: 'Phase II' }));
      expect(confirm).not.toHaveBeenCalled();
      expect(search()).toBe('?view=web&phase=ph2');
    });

    it('keeps an unsaved draft when the same phase is sent again, and follows it when clean', async () => {
      const user = userEvent.setup();
      // The server sending the phase again is a new array, as a refetch makes.
      const Harness = () => {
        const [phases, setPhases] = useState(PHASES);
        const send = (supported: string | null) => { setPhases([{ ...PHASES[0]!, supported_participant_id: supported }, PHASES[1]!]); };
        return (
          <>
            <button type="button" onClick={() => { send(null); }}>send same</button>
            <button type="button" onClick={() => { send('p1'); }}>send changed</button>
            <OperationWebView operation={OPERATION} participants={[GREEN_P1, KILO_BOTH]} phases={phases} sites={SITES} canWrite />
          </>
        );
      };
      renderWithRoute(<Harness />, '/operations/op-1?view=web');
      await user.selectOptions(panel().getByLabelText('Tier select'), 'p2');
      await user.click(screen.getByRole('button', { name: 'send same' }));
      expect(panel().getByLabelText('Tier select')).toHaveValue('p2');
      await user.click(panel().getByRole('button', { name: 'Reset' }));
      await user.click(screen.getByRole('button', { name: 'send changed' }));
      expect(panel().getByLabelText('Tier select')).toHaveValue('p1');
    });
  });

  it('says no one has joined with no participants, and draws no picture or panel', () => {
    renderAt('/operations/op-1?view=web', { participants: [] });
    expect(screen.getByText('No one has joined yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('region', { name: /^Plan for/ })).toBeNull();
  });

  it('says so when the operation has no phases', () => {
    renderAt('/operations/op-1?view=web', { phases: [] });
    expect(screen.getByText('This operation has no phases.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows the loading line while the catalog or library is in flight', () => {
    state.loading = true;
    try {
      renderAt('/operations/op-1?view=web');
      expect(screen.getByText('Loading…')).toBeInTheDocument();
      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.queryByRole('region', { name: /^Plan for/ })).toBeNull();
    } finally {
      state.loading = false;
    }
  });

  it('says the libraries could not load rather than drawing an empty picture', () => {
    state.error = true;
    try {
      renderAt('/operations/op-1?view=web');
      expect(screen.getByText(/Could not load the catalog/)).toBeInTheDocument();
      expect(screen.queryByRole('img')).toBeNull();
    } finally {
      state.error = false;
    }
  });
});

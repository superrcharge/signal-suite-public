import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';

import { render, renderWithRoute, screen, waitFor, within } from '@/test/utils';
import type { Equipment, Participant, Phase, Platform, Waveform } from '@/types';
import { OperationMatrixView } from './operation-matrix-view';

const stamps = { created_by: 't', updated_by: 't', created_at: '', updated_at: '' };

// A PRC-152 carrying ANW2: an organization that brought it carries ANW2
// without picking it directly.
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
  { id: 'w3', abbrev: 'MUOS', name: 'MUOS', description: '', ...stamps },
];

// A Black Hawk that carries MUOS on its own: an organization that declared
// it carries MUOS without a radio or a direct pick.
const PLATFORMS: Platform[] = [{
  id: 'uh-60', designation: 'UH-60M', popular_name: 'Black Hawk', category: ['USA'], type: 'aircraft',
  waveform_abbrevs: ['MUOS'], equipment_ids: [], notes: '', ...stamps,
}, {
  // A Chinook that carries L16 on its own, and ANW2 only through the PRC-152 it lists.
  id: 'ch-47', designation: 'CH-47F', popular_name: 'Chinook', category: ['USA'], type: 'aircraft',
  waveform_abbrevs: ['L16'], equipment_ids: ['prc-152'], notes: '', ...stamps,
}];

const state = vi.hoisted(() => ({ loading: false }));

vi.mock('@/services', () => ({
  useEquipment: () => ({ data: { equipment: EQUIPMENT, total: EQUIPMENT.length }, isLoading: state.loading, isError: false }),
  useWaveforms: () => ({ data: { waveforms: WAVEFORMS, total: WAVEFORMS.length }, isLoading: state.loading, isError: false }),
  usePlatforms: () => ({ data: { platforms: PLATFORMS, total: PLATFORMS.length }, isLoading: state.loading, isError: false }),
  useTransports: () => ({ data: { transports: [], total: 0 }, isLoading: state.loading, isError: false }),
  useServices: () => ({ data: { services: [], total: 0 }, isLoading: state.loading, isError: false }),
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

describe('OperationMatrixView', () => {
  it('draws one column per participant, labelled by short label, and no radio columns', () => {
    render(<OperationMatrixView participants={[GREEN, KILO]} phases={[]} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    // The grid's own first column, then one per organization and nothing after.
    expect(headers[0]).toBe('Capability');
    expect(headers.slice(1)).toHaveLength(2);
    expect(headers[1]).toContain('GREEN');
    expect(headers[2]).toContain('TF KILO');
    expect(headers.some((h) => h?.includes('AN/PRC-152'))).toBe(false);
  });

  it('names the asset that gives an organization a waveform, and drops rows no one carries', async () => {
    const user = userEvent.setup();
    render(<OperationMatrixView participants={[GREEN, KILO]} phases={[]} />);
    const rows = screen.getAllByRole('rowheader').map((r) => r.textContent);
    expect(rows.some((r) => r?.includes('ANW2'))).toBe(true);
    expect(rows.some((r) => r?.includes('L16'))).toBe(true);
    // MUOS is in the library and no one brought it: omitted, not an all-dashes row.
    expect(rows.some((r) => r?.includes('MUOS'))).toBe(false);

    const table = within(screen.getByRole('table'));
    // GREEN carries ANW2 on the radio it brought; KILO's Chinook carries it only through the radio it lists.
    // The chip's detail is the app tooltip above it, not a native title.
    await user.hover(table.getByText('AN/PRC-152'));
    await waitFor(() => { expect(screen.getByRole('tooltip')).toHaveTextContent('AN/PRC-152'); });
    await user.unhover(table.getByText('AN/PRC-152'));
    expect(table.getAllByText('CH-47F')).toHaveLength(2);
    await user.hover(table.getAllByText('CH-47F')[0]!);
    await waitFor(() => { expect(screen.getByRole('tooltip')).toHaveTextContent('CH-47F via AN/PRC-152'); });
    await user.unhover(table.getAllByText('CH-47F')[0]!);
    await user.hover(table.getAllByText('CH-47F')[1]!);
    await waitFor(() => { expect(screen.getByRole('tooltip')).toHaveTextContent(/^CH-47F$/); });
    // A name, never a check, while the organizations are collapsed.
    expect(table.queryAllByTestId('matrix-check')).toHaveLength(0);
  });

  it('names a waveform the organization carries only through a declared platform', () => {
    render(<OperationMatrixView participants={[GREEN, { ...KILO, platform_ids: ['ch-47', 'uh-60'] }]} phases={[]} />);
    const rows = screen.getAllByRole('rowheader').map((r) => r.textContent);
    expect(rows.some((r) => r?.includes('MUOS'))).toBe(true);
    // ANW2, L16, MUOS: the Black Hawk is in the MUOS row alone.
    const muos = screen.getAllByRole('row').find((r) => r.textContent?.startsWith('MUOS'))!;
    expect(within(muos).getByText('UH-60M')).toBeInTheDocument();
  });

  it('draws no Reach row and no Requirements row', () => {
    render(<OperationMatrixView participants={[GREEN, KILO]} phases={[]} />);
    expect(screen.queryByTestId('interop-reach')).toBeNull();
    expect(screen.queryByTestId('interop-requirements')).toBeNull();
    expect(screen.queryByText('Talks to all')).toBeNull();
    expect(screen.queryByText('Requirements')).toBeNull();
    expect(screen.queryByTestId('interop-shared')).toBeNull();
  });

  it('draws no heading over the grid, which keeps an accessible name; the banner names the operation', () => {
    render(<OperationMatrixView participants={[GREEN, KILO]} phases={[]} />);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(screen.queryByText(/Current compatibility/)).toBeNull();
    expect(screen.getByRole('table', { name: 'Operation interoperability matrix' })).toBeInTheDocument();
  });

  it('draws no legend, above or beneath the grid', () => {
    render(<OperationMatrixView participants={[GREEN, KILO]} phases={[]} />);
    expect(screen.queryByLabelText('Legend')).toBeNull();
    expect(screen.queryByText(/Not supported/)).toBeNull();
    expect(screen.queryByText('Catalog radio')).toBeNull();
  });

  it('says no one has joined with no participants, and draws no grid', () => {
    render(<OperationMatrixView participants={[]} phases={[]} />);
    expect(screen.getByText('No one has joined yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the loading line while the catalog or library is in flight', () => {
    state.loading = true;
    try {
      render(<OperationMatrixView participants={[GREEN]} phases={[]} />);
      expect(screen.getByText('Loading…')).toBeInTheDocument();
      expect(screen.queryByRole('table')).toBeNull();
    } finally {
      state.loading = false;
    }
  });
});

describe('OperationMatrixView phases and expansion', () => {
  const PLAN = { supported_participant_id: null, placements: {}, requirements: [] };
  const PHASES: Phase[] = [
    { id: 'ph1', operation_id: 'op-1', position: 1, name: 'Phase I', ...PLAN },
    { id: 'ph2', operation_id: 'op-1', position: 2, name: 'Phase II', ...PLAN },
  ];
  // GREEN's radio is in Phase I only; KILO's Chinook is in both.
  const GREEN_P1: Participant = { ...GREEN, asset_phases: { 'prc-152': ['ph1'] } };
  const KILO_BOTH: Participant = { ...KILO, asset_phases: { 'ch-47': ['ph1', 'ph2'] } };

  const Probe = () => <output data-testid="search">{useLocation().search}</output>;
  const renderAt = (route: string) => renderWithRoute(
    <><OperationMatrixView participants={[GREEN_P1, KILO_BOTH]} phases={PHASES} /><Probe /></>,
    route,
  );

  it('draws the phase switch above the grid, with no per-phase strip on All phases', () => {
    renderAt('/operations/op-1?view=matrix');
    const group = screen.getByRole('group', { name: 'Phase' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['All phases', 'Phase I', 'Phase II']);
    expect(within(group).getByRole('button', { name: 'All phases' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/by phase/)).toBeNull();
    expect(screen.queryByTitle(/Phase I+: \d/)).toBeNull();
  });

  it('?phase= draws only the organizations and assets in that phase, with nothing struck or captioned', () => {
    renderAt('/operations/op-1?view=matrix&phase=ph2');
    expect(screen.getByRole('button', { name: 'Phase II' })).toHaveAttribute('aria-pressed', 'true');
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    // GREEN has nothing in Phase II: not a column at all.
    expect(headers.some((h) => h?.includes('GREEN'))).toBe(false);
    expect(headers.some((h) => h?.includes('TF KILO'))).toBe(true);
    // KILO's Chinook still gives both rows, and GREEN's radio is not drawn anywhere.
    const rows = screen.getAllByRole('rowheader').map((r) => r.textContent);
    expect(rows.some((r) => r?.includes('ANW2'))).toBe(true);
    expect(rows.some((r) => r?.includes('L16'))).toBe(true);
    expect(screen.queryByText('AN/PRC-152')).toBeNull();
    expect(screen.queryByText(/not in/)).toBeNull();
    expect(screen.queryByTestId('interop-reach')).toBeNull();
  });

  it('draws no Requirements row under a chosen phase either, even when the phase sets requirements', () => {
    const required: Phase[] = [{ ...PHASES[0]!, requirements: [{ id: 'ph1-r', a: 'p1', b: 'p2' }] }, PHASES[1]!];
    renderWithRoute(
      <OperationMatrixView participants={[GREEN_P1, KILO_BOTH]} phases={required} />,
      '/operations/op-1?view=matrix&phase=ph1',
    );
    expect(screen.queryByTestId('interop-requirements')).toBeNull();
    expect(screen.queryByText('Requirements')).toBeNull();
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Waveforms');
    expect(screen.getAllByRole('columnheader')[1]!.style.borderTop).not.toBe('3px solid var(--shf-error)');
  });

  it('switching phase narrows the columns to the organizations present in it', async () => {
    const user = userEvent.setup();
    renderAt('/operations/op-1?view=matrix');
    const orgs = () => screen.getAllByRole('columnheader').slice(1).map((h) => h.textContent);
    expect(orgs()).toEqual([expect.stringContaining('GREEN'), expect.stringContaining('TF KILO')]);
    await user.click(screen.getByRole('button', { name: 'Phase II' }));
    expect(orgs()).toEqual([expect.stringContaining('TF KILO')]);
    await user.click(screen.getByRole('button', { name: 'Phase I' }));
    expect(orgs()).toEqual([expect.stringContaining('GREEN'), expect.stringContaining('TF KILO')]);
    await user.click(screen.getByRole('button', { name: 'All phases' }));
    expect(orgs()).toHaveLength(2);
  });

  it('reads a phase id the operation does not have as All phases', () => {
    renderAt('/operations/op-1?view=matrix&phase=gone');
    expect(screen.getByRole('button', { name: 'All phases' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('choosing a phase writes ?phase=, and All phases drops it, leaving the other params alone', async () => {
    const user = userEvent.setup();
    renderAt('/operations/op-1?view=matrix');
    await user.click(screen.getByRole('button', { name: 'Phase I' }));
    expect(screen.getByTestId('search').textContent).toBe('?view=matrix&phase=ph1');
    await user.click(screen.getByRole('button', { name: 'All phases' }));
    expect(screen.getByTestId('search').textContent).toBe('?view=matrix');
  });

  it('opens an organization from ?expand= and ignores a key no column has', () => {
    renderAt('/operations/op-1?view=matrix&expand=green,gone');
    expect(screen.getByRole('button', { name: 'Collapse GREEN' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Expand TF KILO' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(screen.getByRole('table')).getAllByTestId('matrix-check').length).toBeGreaterThan(0);
  });

  it('the expand toggle writes and clears ?expand=', async () => {
    const user = userEvent.setup();
    renderAt('/operations/op-1?view=matrix');
    await user.click(screen.getByRole('button', { name: 'Expand GREEN' }));
    expect(screen.getByTestId('search').textContent).toBe('?view=matrix&expand=green');
    await user.click(screen.getByRole('button', { name: 'Collapse GREEN' }));
    expect(screen.getByTestId('search').textContent).toBe('?view=matrix');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, within } from '@/test/utils';
import { NetDrawer } from './net-drawer';
import type { Net } from '@/types';

const createMutate = vi.fn();
const updateMutate = vi.fn();
const onCreated = vi.fn();

// The card-bearing squadrons the page hands the drawer. Two, so a test can
// move a net from the one it started in.
const SQUADRONS = [
  { key: 'asqd', label: 'A SQD', color: '#3b8fd6', pace_enabled: true },
  { key: 'bsqd', label: 'B SQD', color: '#4caf50', pace_enabled: true },
];

vi.mock('@/services', () => ({
  useCreateNet: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateNet: () => ({ mutateAsync: updateMutate, isPending: false }),
}));

function net(over: Partial<Net> = {}): Net {
  return {
    id: 'id-1',
    section: 'asqd',
    name: 'NET 1',
    net_id: 'N01',
    radio_type: 'jem',
    theater: 'conus',
    roip: false,
    tx_freq: '31.6875',
    rx_freq: '31.6875',
    freq_unit: 'MHz',
    description: '',
    notes: '',
    created_by: '',
    updated_by: '',
    created_at: '',
    updated_at: '',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createMutate.mockResolvedValue(undefined);
  updateMutate.mockResolvedValue(undefined);
});

describe('NetDrawer', () => {


  it('defaults ROIP off, and records it when ticked', async () => {
    const user = userEvent.setup();
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={null} onClose={vi.fn()} />);

    const roip = screen.getByRole('checkbox', { name: /ROIP/ });
    expect(roip).not.toBeChecked();

    await user.type(screen.getByLabelText(/Name/), 'NET 9');
    await user.click(roip);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const arg = createMutate.mock.calls[0]?.[0] as { data: { roip: boolean } };
    expect(arg.data.roip).toBe(true);
  });

  it('loads a stored ROIP flag back into the form', () => {
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={net({ roip: true })} onClose={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /ROIP/ })).toBeChecked();
  });

  it('defaults a new net to both radios so it is never silently confined', () => {
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={null} onClose={vi.fn()} />);
    // Scoped to the radio group: the Theater group has a Both of its own.
    const radios = within(screen.getByRole('group', { name: 'Carried by' }));
    expect(radios.getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('loads an existing net into the form', () => {
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={net()} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Name/)).toHaveValue('NET 1');
    expect(screen.getByRole('button', { name: 'JEM' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'MHz' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('labels the identifier field Channel #, and still stores it as net_id', () => {
    // Radio operators call this value a channel. The rename is display-only:
    // the field the drawer writes is unchanged.
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={net()} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Channel #')).toHaveValue('N01');
    expect(screen.queryByLabelText('Net ID')).not.toBeInTheDocument();
  });

  it('falls back to Both when a stored radio type is unrecognised', () => {
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={net({ radio_type: 'legacy' })} onClose={vi.fn()} />);
    // Scoped to the radio group: the Theater group has a Both of its own.
    const radios = within(screen.getByRole('group', { name: 'Carried by' }));
    expect(radios.getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('refuses to save without a name', async () => {
    const user = userEvent.setup();
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={null} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('updates rather than creates when given a net', async () => {
    const user = userEvent.setup();
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={net()} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'id-1' }),
    );
    expect(createMutate).not.toHaveBeenCalled();
  });



  it('keeps what the user typed when the same net arrives as a new object', async () => {
    // `net` comes out of the nets query, so any refetch of that list -- window
    // focus, another editor saving -- hands back a fresh object for the same
    // net. Keying the reset on object identity wiped the open form.
    const user = userEvent.setup();
    const { rerender } = render(
      <NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={net()} onClose={vi.fn()} />,
    );

    const name = screen.getByLabelText(/Name/);
    await user.clear(name);
    await user.type(name, 'NET 1 RENAMED');

    rerender(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={net()} onClose={vi.fn()} />);
    expect(name).toHaveValue('NET 1 RENAMED');
  });

  it('reloads when the drawer is retargeted at a different net', () => {
    // The other half: a genuinely different net must replace the form, or the
    // previous edit would bleed into the next one.
    const { rerender } = render(
      <NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={net()} onClose={vi.fn()} />,
    );
    rerender(
      <NetDrawer
        open
        section="asqd" squadrons={SQUADRONS} onCreated={onCreated}
        net={net({ id: 'id-2', name: 'NET 2' })}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Name/)).toHaveValue('NET 2');
  });

  it('sends freeform TX/RX untouched', async () => {
    const user = userEvent.setup();
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={null} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/Name/), 'NET 9');
    await user.type(screen.getByLabelText(/TX frequency/), '225.000 - 399.975');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const arg = createMutate.mock.calls[0]?.[0] as { data: { tx_freq: string } };
    expect(arg.data.tx_freq).toBe('225.000 - 399.975');
  });
});

describe('NetDrawer theater', () => {
  it('starts a new net in the page theater and sends it', async () => {
    const user = userEvent.setup();
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} theater="oconus" net={null} onClose={vi.fn()} />);

    const theaters = within(screen.getByRole('group', { name: 'Theater' }));
    expect(theaters.getByRole('button', { name: 'OCONUS' })).toHaveAttribute('aria-pressed', 'true');

    await user.type(screen.getByLabelText(/Name/), 'FIRES');
    await user.click(theaters.getByRole('button', { name: 'Both' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const arg = createMutate.mock.calls[0]?.[0] as { data: { theater: string } };
    expect(arg.data.theater).toBe('both');
  });

  it('defaults to CONUS without a page, loads a stored theater, and falls back to Both', () => {
    const { unmount } = render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={null} onClose={vi.fn()} />);
    let theaters = within(screen.getByRole('group', { name: 'Theater' }));
    expect(theaters.getByRole('button', { name: 'CONUS' })).toHaveAttribute('aria-pressed', 'true');
    unmount();

    const stored = render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={net({ theater: 'oconus' })} onClose={vi.fn()} />);
    theaters = within(screen.getByRole('group', { name: 'Theater' }));
    expect(theaters.getByRole('button', { name: 'OCONUS' })).toHaveAttribute('aria-pressed', 'true');
    stored.unmount();

    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={net({ theater: 'mars' })} onClose={vi.fn()} />);
    theaters = within(screen.getByRole('group', { name: 'Theater' }));
    expect(theaters.getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('NetDrawer squadron', () => {
  // A net never moves between squadrons once created, so the one place to get
  // it right is before Create. The select shows which library the net will land
  // in, pre-selected to the one on screen, and lets the user change it.
  it('shows the squadron on screen pre-selected, and files the net there by default', async () => {
    const user = userEvent.setup();
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={null} onClose={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: /Squadron/ })).toHaveTextContent('A SQD');

    await user.type(screen.getByLabelText(/Name/), 'FIRES');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({ section: 'asqd' }));
  });

  it('files the net under the squadron chosen in the drawer, not the one it opened on', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={null} onClose={onClose} />);

    await user.click(screen.getByRole('combobox', { name: /Squadron/ }));
    await user.click(screen.getByRole('option', { name: 'B SQD' }));
    await user.type(screen.getByLabelText(/Name/), 'FIRES');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({ section: 'bsqd' }));
    // The page is told where it went, with what it needs to land on the net,
    // and owns the close: the drawer must not close under a navigation.
    expect(onCreated).toHaveBeenCalledWith({ section: 'bsqd', radioType: 'both', theater: 'conus' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reports the radio and theater the net was given, so the page can show it', async () => {
    const user = userEvent.setup();
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={null} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/Name/), 'FIRES');
    await user.click(within(screen.getByRole('group', { name: 'Carried by' })).getByRole('button', { name: 'MPU5' }));
    await user.click(within(screen.getByRole('group', { name: 'Theater' })).getByRole('button', { name: 'OCONUS' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(onCreated).toHaveBeenCalledWith({ section: 'asqd', radioType: 'mpu5', theater: 'oconus' });
  });

  it('has no squadron field when editing, because the API does not move a net', () => {
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={net()} onClose={vi.fn()} />);
    expect(screen.queryByRole('combobox', { name: /Squadron/ })).toBeNull();
  });

  it('refuses to create with no squadron rather than posting to an empty path', async () => {
    const user = userEvent.setup();
    render(<NetDrawer open section="" squadrons={[]} onCreated={onCreated} net={null} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/Name/), 'FIRES');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('Squadron is required.')).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });
});

describe('NetDrawer create toast', () => {
  it('names the squadron the net was filed under', async () => {
    // The squadron is the one fact about a net that cannot be corrected
    // afterwards, so the confirmation says it rather than just "created".
    const user = userEvent.setup();
    render(<NetDrawer open section="asqd" squadrons={SQUADRONS} onCreated={onCreated} net={null} onClose={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: /Squadron/ }));
    await user.click(screen.getByRole('option', { name: 'B SQD' }));
    await user.type(screen.getByLabelText(/Name/), 'FIRES');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Net created in B SQD')).toBeInTheDocument();
  });
});

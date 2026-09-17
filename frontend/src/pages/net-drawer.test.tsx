import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '@/test/utils';
import { NetDrawer } from './net-drawer';
import type { Net } from '@/types';

const createMutate = vi.fn();
const updateMutate = vi.fn();

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
    render(<NetDrawer open section="asqd" net={null} onClose={vi.fn()} />);

    const roip = screen.getByRole('checkbox', { name: /ROIP/ });
    expect(roip).not.toBeChecked();

    await user.type(screen.getByLabelText(/Name/), 'NET 9');
    await user.click(roip);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const arg = createMutate.mock.calls[0]?.[0] as { data: { roip: boolean } };
    expect(arg.data.roip).toBe(true);
  });

  it('loads a stored ROIP flag back into the form', () => {
    render(<NetDrawer open section="asqd" net={net({ roip: true })} onClose={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /ROIP/ })).toBeChecked();
  });

  it('defaults a new net to both radios so it is never silently confined', () => {
    render(<NetDrawer open section="asqd" net={null} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('loads an existing net into the form', () => {
    render(<NetDrawer open section="asqd" net={net()} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Name/)).toHaveValue('NET 1');
    expect(screen.getByRole('button', { name: 'JEM' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'MHz' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('labels the identifier field Channel #, and still stores it as net_id', () => {
    // Radio operators call this value a channel. The rename is display-only:
    // the field the drawer writes is unchanged.
    render(<NetDrawer open section="asqd" net={net()} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Channel #')).toHaveValue('N01');
    expect(screen.queryByLabelText('Net ID')).not.toBeInTheDocument();
  });

  it('falls back to Both when a stored radio type is unrecognised', () => {
    render(<NetDrawer open section="asqd" net={net({ radio_type: 'legacy' })} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('refuses to save without a name', async () => {
    const user = userEvent.setup();
    render(<NetDrawer open section="asqd" net={null} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('updates rather than creates when given a net', async () => {
    const user = userEvent.setup();
    render(<NetDrawer open section="asqd" net={net()} onClose={vi.fn()} />);

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
      <NetDrawer open section="asqd" net={net()} onClose={vi.fn()} />,
    );

    const name = screen.getByLabelText(/Name/);
    await user.clear(name);
    await user.type(name, 'NET 1 RENAMED');

    rerender(<NetDrawer open section="asqd" net={net()} onClose={vi.fn()} />);
    expect(name).toHaveValue('NET 1 RENAMED');
  });

  it('reloads when the drawer is retargeted at a different net', () => {
    // The other half: a genuinely different net must replace the form, or the
    // previous edit would bleed into the next one.
    const { rerender } = render(
      <NetDrawer open section="asqd" net={net()} onClose={vi.fn()} />,
    );
    rerender(
      <NetDrawer
        open
        section="asqd"
        net={net({ id: 'id-2', name: 'NET 2' })}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Name/)).toHaveValue('NET 2');
  });

  it('sends freeform TX/RX untouched', async () => {
    const user = userEvent.setup();
    render(<NetDrawer open section="asqd" net={null} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/Name/), 'NET 9');
    await user.type(screen.getByLabelText(/TX frequency/), '225.000 - 399.975');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const arg = createMutate.mock.calls[0]?.[0] as { data: { tx_freq: string } };
    expect(arg.data.tx_freq).toBe('225.000 - 399.975');
  });
});

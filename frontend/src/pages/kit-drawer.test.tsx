import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '@/test/utils';
import { KitDrawer } from './kit-drawer';

const { createMutate, updateMutate } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
}));

vi.mock('@/services', () => ({
  useCreateKit: () => ({ mutate: createMutate, isPending: false }),
  useUpdateKit: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteKit: () => ({ mutate: vi.fn(), isPending: false }),
  useSections: () => ({
    data: [{ key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true }],
    isLoading: false,
  }),
  useCreateSection: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * The terminals drawer had the same defect and the same fix. An edit with no
 * kit fell through to the create below it, so an edit URL the caller could not
 * resolve created a duplicate instead of editing anything.
 */
describe('an edit with no kit', () => {
  it('neither updates nor creates on submit', async () => {
    const user = userEvent.setup();
    render(<KitDrawer open mode="edit" kit={undefined} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/kit name/i), 'KIT-001');
    await user.click(screen.getByRole('button', { name: /add kit/i }));

    expect(createMutate).not.toHaveBeenCalled();
    expect(updateMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it('still creates when the mode really is add', async () => {
    const user = userEvent.setup();
    render(<KitDrawer open mode="add" kit={undefined} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/kit name/i), 'KIT-002');
    await user.click(screen.getByRole('button', { name: /add kit/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
  });
});

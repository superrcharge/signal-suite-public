import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '@/test/utils';
import { TerminalDrawer } from './terminal-drawer';
import type { Terminal } from '@/types';

const { createMutate, updateMutate, TAG_CATALOG } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  TAG_CATALOG: [
    { name: 'Operation Avalanche', created_at: '2026-01-01T00:00:00Z', terminal_count: 3 },
    { name: 'EXERCISE 1', created_at: '2026-01-02T00:00:00Z', terminal_count: 0 },
  ],
}));

vi.mock('@/services', () => ({
  useCreateTerminal: () => ({ mutate: createMutate, isPending: false }),
  useUpdateTerminal: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteTerminal: () => ({ mutate: vi.fn(), isPending: false }),
  useSections: () => ({
    data: [{ key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true }],
    isLoading: false,
  }),
  useCreateSection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTags: () => ({ data: TAG_CATALOG, isLoading: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * isEdit is `mode === 'edit' && !!terminal`, which is the right predicate for a
 * drawer that may legitimately be adding. What was wrong was submitting: an
 * edit with no terminal fell through to the create below it, so an edit URL the
 * caller could not resolve created a duplicate. The caller now waits for the
 * record; this keeps that true for any future caller.
 */
describe('an edit with no terminal', () => {
  it('neither updates nor creates on submit', async () => {
    const user = userEvent.setup();
    render(
      <TerminalDrawer open mode="edit" terminal={undefined} onClose={vi.fn()} />,
    );

    // The heading reads Add Terminal here, which is the symptom rather than the
    // bug: what mattered is that submitting it wrote a new row.
    await user.type(screen.getByLabelText(/terminal name/i), 'OW-10-001');
    await user.click(screen.getByRole('button', { name: /add terminal/i }));

    expect(createMutate).not.toHaveBeenCalled();
    expect(updateMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it('still creates when the mode really is add', async () => {
    const user = userEvent.setup();
    render(
      <TerminalDrawer open mode="add" terminal={undefined} onClose={vi.fn()} />,
    );

    await user.type(screen.getByLabelText(/terminal name/i), 'OW-10-002');
    await user.click(screen.getByRole('button', { name: /add terminal/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
  });
});

// A fully-typed fixture rather than a cast: the drawer maps every field into
// form state, so a partial object would only compile by lying about the type.
function taggedTerminal(tag: string): Terminal {
  return {
    id: 'id-1',
    name: 'MINI 1',
    model: null,
    kit: '',
    pim: '',
    serial: '',
    section: '',
    status: 'available',
    owner: null,
    owner_email: null,
    owner_phone: null,
    pop_pin: null,
    notes: '',
    tag,
    updated_by: 'tester',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('tag field', () => {
  // freeSolo: the catalog is a set of suggestions, not a closed list. A brand
  // new tag has to survive to the request, and the backend registers it there.
  it('submits a tag that is not in the catalog', async () => {
    const user = userEvent.setup();
    render(<TerminalDrawer open mode="add" onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/terminal name/i), 'MINI 9');
    await user.type(screen.getByRole('combobox', { name: 'Tag' }), 'Brand New Op');
    await user.click(screen.getByRole('button', { name: /add terminal/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'Brand New Op' }),
      expect.anything(),
    );
  });

  it('submits a tag picked from the catalog', async () => {
    const user = userEvent.setup();
    render(<TerminalDrawer open mode="add" onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/terminal name/i), 'MINI 9');
    await user.type(screen.getByRole('combobox', { name: 'Tag' }), 'Operation');
    await user.click(await screen.findByRole('option', { name: 'Operation Avalanche' }));
    await user.click(screen.getByRole('button', { name: /add terminal/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'Operation Avalanche' }),
      expect.anything(),
    );
  });

  // The clear convention the backend depends on: "" reaches normalizeTag and
  // NULLs the column, where undefined or null would mean "field not provided"
  // on a PATCH and silently leave the old tag in place.
  it('clearing the field on an edit submits an empty string', async () => {
    const user = userEvent.setup();
    render(
      <TerminalDrawer
        open
        mode="edit"
        terminal={taggedTerminal('Operation Avalanche')}
        onClose={vi.fn()}
      />
    );

    await user.clear(screen.getByRole('combobox', { name: 'Tag' }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    // Read the payload through an explicit tuple type rather than a nested
    // expect.objectContaining, which resolves to `any` and trips no-unsafe-assignment.
    const [payload] = updateMutate.mock.calls[0] as [{ data: { tag: string } }];
    expect(payload.data.tag).toBe('');
  });

  // MUI v9 renderInput params expose slotProps, not inputProps. Writing
  // inputProps (as every older example does) type-checks, renders, and caps
  // nothing, so this asserts the cap actually reached the DOM.
  it('caps the tag at the column width', () => {
    render(<TerminalDrawer open mode="add" onClose={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Tag' })).toHaveAttribute('maxlength', '100');
  });
});

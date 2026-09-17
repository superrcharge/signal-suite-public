import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@/test/utils';
import { SettingsPage } from './settings-page';

// The Settings page had no test file at all, while being the only screen that
// can delete a tag off every terminal at once. These cover the two things a
// reader of that panel has to be able to trust: that the list is complete, and
// that the confirmation says how much the delete will actually touch.

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

// vi.hoisted, because vi.mock factories are hoisted above every top-level
// const and would otherwise read this before initialization.
const { adminAuth, deleteMutate, createMutate, tagsRef } = vi.hoisted(() => ({
  adminAuth: () => ({
    user: { id: '1', name: 'Admin User', email: 'admin@test.com', roles: ['admin'] },
    isAuthenticated: true,
    isLoading: false,
    isError: false,
    role: 'admin',
    isAdmin: true,
    canWrite: true,
    canWriteRadio: true,
    refetch: vi.fn(),
  }),
  deleteMutate: vi.fn(),
  createMutate: vi.fn(),
  tagsRef: { current: [] as Array<{ name: string; created_at: string; terminal_count: number }> },
}));

vi.mock('@/contexts', async () => {
  const actual = await vi.importActual('@/contexts');
  return {
    ...actual,
    useAuth: adminAuth,
    useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }),
  };
});

vi.mock('@/contexts/auth-context', async () => {
  const actual = await vi.importActual('@/contexts/auth-context');
  return { ...actual, useAuth: adminAuth };
});

// Closed mock - every hook the render tree pulls must be listed, including the
// sidebar/header hooks MainLayout mounts.
vi.mock('@/services', () => ({
  useSections: () => ({ data: [], isLoading: false }),
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useTags: () => ({ data: tagsRef.current, isLoading: false }),
  useCreateTag: () => ({ mutate: createMutate, isPending: false, isError: false, error: null }),
  useDeleteTag: () => ({ mutate: deleteMutate, isPending: false }),
  useContractFiscalYears: () => ({ data: [] }),
  useLogout: () => ({ mutate: vi.fn() }),
  REASSIGN_TO_NONE: '__none__',
}));

const tag = (name: string, terminal_count: number) => ({
  name,
  created_at: '2026-01-01T00:00:00Z',
  terminal_count,
});

function rowFor(name: string) {
  return screen.getByText(name).closest('tr') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  tagsRef.current = [];
});

describe('SettingsPage tag panel', () => {
  it('reports how many terminals carry each tag', () => {
    tagsRef.current = [tag('Operation Avalanche', 3), tag('Solo Op', 1)];
    render(<SettingsPage />);

    expect(within(rowFor('Operation Avalanche')).getByText('3 terminals')).toBeInTheDocument();
    // Singular, because "1 terminals" is the kind of thing that ships forever.
    expect(within(rowFor('Solo Op')).getByText('1 terminal')).toBeInTheDocument();
  });

  // An unused tag is a supported state, not a missing value: pre-creating one
  // for an upcoming operation is the whole reason the Add tag button exists.
  it('lists a tag no terminal uses, at zero', () => {
    tagsRef.current = [tag('ZZ Unused', 0)];
    render(<SettingsPage />);

    expect(screen.getByText('ZZ Unused')).toBeInTheDocument();
    expect(within(rowFor('ZZ Unused')).getByText('0 terminals')).toBeInTheDocument();
  });

  it('names the affected count before deleting a tag in use', async () => {
    const user = userEvent.setup();
    tagsRef.current = [tag('Operation Avalanche', 3)];
    render(<SettingsPage />);

    await user.click(screen.getByLabelText('delete tag Operation Avalanche'));

    expect(screen.getByText(/remove the tag from 3 terminals/i)).toBeInTheDocument();
  });

  it('says plainly when a delete will touch nothing', async () => {
    const user = userEvent.setup();
    tagsRef.current = [tag('ZZ Unused', 0)];
    render(<SettingsPage />);

    await user.click(screen.getByLabelText('delete tag ZZ Unused'));

    expect(screen.getByText(/no terminals currently use this tag/i)).toBeInTheDocument();
  });

  // The dialog holds the whole entry so it can quote the count, but the
  // mutation takes the name. Passing the object would send "[object Object]".
  it('deletes by name, not by entry', async () => {
    const user = userEvent.setup();
    tagsRef.current = [tag('Operation Avalanche', 3)];
    render(<SettingsPage />);

    await user.click(screen.getByLabelText('delete tag Operation Avalanche'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate).toHaveBeenCalledWith('Operation Avalanche', expect.anything());
  });

  it('creates a tag from the trimmed input', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.type(screen.getByLabelText('New tag name'), '  Operation Verify  ');
    await user.click(screen.getByRole('button', { name: /add tag/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate).toHaveBeenCalledWith('Operation Verify', expect.anything());
  });
});

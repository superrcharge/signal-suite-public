import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';

import { renderWithRoute, screen, waitFor, within } from '@/test/utils';
import { Header } from './header';

/**
 * Its own file, with its own mock, because header.test.tsx keeps its
 * `@/services` mock to the two hooks the header itself calls - that shortness
 * is what that file proves. The Add Net drawer mounts on the click and calls
 * the two net mutation hooks, so a test that opens it needs them stubbed. The
 * guard stays guarding; this file is where the drawer is exercised.
 */
const { createMutate } = vi.hoisted(() => ({ createMutate: vi.fn() }));

vi.mock('@/services', () => ({
  useLogout: () => ({ mutate: vi.fn() }),
  useSections: () => ({
    data: [
      { key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true },
      { key: 'bsqd', label: 'B SQD', color: '#fff', pace_enabled: true },
    ],
    isLoading: false,
  }),
  useCreateNet: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateNet: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/contexts/theme-context', async () => {
  const actual = await vi.importActual('@/contexts/theme-context');
  return { ...actual, useThemeMode: () => ({ mode: 'dark' }) };
});

vi.mock('@/contexts/auth-context', async () => {
  const actual = await vi.importActual('@/contexts/auth-context');
  return {
    ...actual,
    useAuth: () => ({
      canWrite: true,
      canWriteRadio: true,
      canWritePace: true,
      isPlanner: false,
      canSeeContracts: true, canSeeTrackers: true,
      isAdmin: true,
      isAuthenticated: true,
      role: 'rto',
      user: { name: 'Tester', email: 't@example.mil', roles: ['rto'] },
    }),
  };
});

const Probe = () => {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname + loc.search}</output>;
};

const renderAt = (route: string) =>
  renderWithRoute(
    <>
      <Header onMenuClick={vi.fn()} sidebarOpen sidebarWidth={240} />
      <Probe />
    </>,
    route,
  );

const location = () => screen.getByTestId('location').textContent;

const openAddNet = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'add' }));
  await user.click(screen.getByRole('menuitem', { name: /^Add Net/ }));
  return within(screen.getByRole('dialog'));
};

beforeEach(() => {
  vi.clearAllMocks();
  createMutate.mockResolvedValue(undefined);
});

describe('Header Add Net', () => {
  it('opens the drawer in place from a route that names no squadron, with Squadron empty', async () => {
    // Like Add Terminal and Add Kit: the click is the add, not a trip to the
    // page where adding is allowed. With no squadron in the URL the select
    // starts empty rather than guessing one.
    const user = userEvent.setup();
    renderAt('/terminals');

    const drawer = await openAddNet(user);

    expect(drawer.getByRole('heading', { name: 'Add Net' })).toBeInTheDocument();
    expect(drawer.getByRole('combobox', { name: /Squadron/ })).not.toHaveTextContent(/SQD/);
    expect(location()).toBe('/terminals');
  });

  it('pre-selects the squadron whose library is on screen', async () => {
    const user = userEvent.setup();
    renderAt('/nets/asqd');

    const drawer = await openAddNet(user);

    expect(drawer.getByRole('combobox', { name: /Squadron/ })).toHaveTextContent('A SQD');
    expect(location()).toBe('/nets/asqd');
  });

  it('pre-selects the squadron from the PACE editor without leaving it', async () => {
    // The prefix match seeds from /pace/:section/edit too. It used to be
    // excluded because the button navigated and the draft would be lost;
    // opening a drawer over the editor loses nothing.
    const user = userEvent.setup();
    renderAt('/pace/asqd/edit');

    const drawer = await openAddNet(user);

    expect(drawer.getByRole('combobox', { name: /Squadron/ })).toHaveTextContent('A SQD');
    expect(location()).toBe('/pace/asqd/edit');
  });

  it('keeps the theater of the list it was pressed on', async () => {
    const user = userEvent.setup();
    renderAt('/nets/asqd?theater=oconus');

    const drawer = await openAddNet(user);

    const theaters = within(drawer.getByRole('group', { name: 'Theater' }));
    expect(theaters.getByRole('button', { name: 'OCONUS' })).toHaveAttribute('aria-pressed', 'true');
    expect(location()).toBe('/nets/asqd?theater=oconus');
  });

  it('refuses to create until a squadron is chosen', async () => {
    const user = userEvent.setup();
    renderAt('/terminals');

    const drawer = await openAddNet(user);
    await user.type(drawer.getByLabelText(/Name/), 'FIRES');
    await user.click(drawer.getByRole('button', { name: 'Create' }));

    expect(drawer.getByText('Squadron is required.')).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('lands on the chosen squadron library after Create', async () => {
    const user = userEvent.setup();
    renderAt('/terminals');

    const drawer = await openAddNet(user);
    await user.click(drawer.getByRole('combobox', { name: /Squadron/ }));
    await user.click(screen.getByRole('option', { name: 'B SQD' }));
    await user.type(drawer.getByLabelText(/Name/), 'FIRES');
    await user.click(drawer.getByRole('button', { name: 'Create' }));

    expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({ section: 'bsqd' }));
    // The toast lands after the create resolves. The navigation is a router
    // transition, which React may commit a tick later than the toast's state.
    expect(await screen.findByText('Net created in B SQD')).toBeInTheDocument();
    await waitFor(() => expect(location()).toBe('/nets/bsqd?radio=jem'));
  });

  it('stays on the PACE editor after Create, so the draft survives', async () => {
    const user = userEvent.setup();
    renderAt('/pace/asqd/edit');

    const drawer = await openAddNet(user);
    await user.type(drawer.getByLabelText(/Name/), 'FIRES');
    await user.click(drawer.getByRole('button', { name: 'Create' }));

    expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({ section: 'asqd' }));
    expect(location()).toBe('/pace/asqd/edit');
    expect(screen.queryByRole('heading', { name: 'Add Net' })).toBeNull();
    expect(await screen.findByText('Net created in A SQD')).toBeInTheDocument();
  });
});

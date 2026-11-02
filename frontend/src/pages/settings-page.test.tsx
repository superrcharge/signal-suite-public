import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, renderWithRoute, screen, waitFor, within } from '@/test/utils';
import { ApiClientError } from '@/services/api-client';
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
const {
  ADMIN, authRef, adminAuth, deleteMutate, createMutate, tagsRef,
  orgsRef, createOrgMutateAsync, updateOrgMutateAsync, deleteOrgMutate, auditRef,
} = vi.hoisted(() => {
  const ADMIN = {
    user: { id: '1', name: 'Admin User', email: 'admin@test.com', roles: ['admin'] },
    isAuthenticated: true,
    isLoading: false,
    isError: false,
    role: 'admin',
    isAdmin: true,
    canWrite: true,
    canWriteRadio: true,
    canWritePace: true,
    refetch: () => undefined,
  };
  // Swapped per test for the role-alert cases; reset to admin in beforeEach.
  const authRef: { current: Record<string, unknown> } = { current: ADMIN };
  return {
    ADMIN,
    authRef,
    adminAuth: () => authRef.current,
    deleteMutate: vi.fn(),
    createMutate: vi.fn(),
    tagsRef: { current: [] as Array<{ name: string; created_at: string; terminal_count: number }> },
    orgsRef: { current: [] as Array<Record<string, unknown>> },
    createOrgMutateAsync: vi.fn(),
    updateOrgMutateAsync: vi.fn(),
    deleteOrgMutate: vi.fn(),
    auditRef: { current: [] as Array<Record<string, unknown>> },
  };
});

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
  useOrganizations: () => ({ data: { organizations: orgsRef.current, total: orgsRef.current.length }, isLoading: false }),
  useCreateOrganization: () => ({ mutateAsync: createOrgMutateAsync, isPending: false }),
  useUpdateOrganization: () => ({ mutateAsync: updateOrgMutateAsync, isPending: false }),
  useDeleteOrganization: () => ({ mutate: deleteOrgMutate, isPending: false }),
  // The Audit log tab renders the AuditLog body from pages/audit-page.tsx.
  useAuditEvents: () => ({
    data: { events: auditRef.current, total: auditRef.current.length, page: 1, total_pages: 1 },
    isLoading: false,
    error: null,
  }),
  useContractFiscalYears: () => ({ data: [] }),
  useOperations: () => ({ data: undefined, isLoading: false, isError: false }),
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
  orgsRef.current = [];
  auditRef.current = [];
  authRef.current = ADMIN;
});

const auditEvent = (id: string, resource_name: string) => ({
  id,
  actor_name: 'Admin User',
  resource_type: 'operation',
  resource_id: id,
  resource_name,
  action: 'create',
  changes: {},
  created_at: '2026-10-13T00:00:00Z',
});

/**
 * The page is tabbed, and only the open tab's panel is mounted, so a test of
 * one panel opens its tab through the URL the way a link would.
 */
function renderTab(tab: string) {
  return renderWithRoute(<SettingsPage />, `/settings?tab=${tab}`);
}

/** A non-writing role: none of the Sections, Tags or Audit log panels. */
function signInAs(role: 'viewer' | 'rto' | 'planner') {
  authRef.current = {
    ...ADMIN,
    user: { id: '2', name: 'Other User', email: 'other@test.com', roles: [role] },
    role,
    isAdmin: false,
    canWrite: false,
    canWriteRadio: role === 'rto',
    canWritePace: role !== 'viewer',
  };
}

// The fallback alert used to say "viewer access" to everyone without the
// panels, which told an rto or a planner - both of whom write elsewhere -
// that they were read-only.
describe('SettingsPage access alert', () => {
  it.each([
    ['viewer', 'Viewer'],
    ['rto', 'RTO'],
    ['planner', 'Planner'],
  ] as const)('names the %s role rather than calling everyone a viewer', (role, label) => {
    signInAs(role);
    render(<SettingsPage />);

    expect(screen.getByText(new RegExp(`You currently have ${label} access`))).toBeInTheDocument();
    expect(screen.queryByText('Sections')).not.toBeInTheDocument();
    expect(screen.queryByText('Tags')).not.toBeInTheDocument();
  });

  it('shows no access alert to a role that has the panels', () => {
    render(<SettingsPage />);

    expect(screen.queryByText(/You currently have/)).not.toBeInTheDocument();
  });
});

describe('SettingsPage tag panel', () => {
  it('reports how many terminals carry each tag', () => {
    tagsRef.current = [tag('Operation Avalanche', 3), tag('Solo Op', 1)];
    renderTab('tags');

    expect(within(rowFor('Operation Avalanche')).getByText('3 terminals')).toBeInTheDocument();
    // Singular, because "1 terminals" is the kind of thing that ships forever.
    expect(within(rowFor('Solo Op')).getByText('1 terminal')).toBeInTheDocument();
  });

  // An unused tag is a supported state, not a missing value: pre-creating one
  // for an upcoming operation is the whole reason the Add tag button exists.
  it('lists a tag no terminal uses, at zero', () => {
    tagsRef.current = [tag('ZZ Unused', 0)];
    renderTab('tags');

    expect(screen.getByText('ZZ Unused')).toBeInTheDocument();
    expect(within(rowFor('ZZ Unused')).getByText('0 terminals')).toBeInTheDocument();
  });

  it('names the affected count before deleting a tag in use', async () => {
    const user = userEvent.setup();
    tagsRef.current = [tag('Operation Avalanche', 3)];
    renderTab('tags');

    await user.click(screen.getByLabelText('delete tag Operation Avalanche'));

    expect(screen.getByText(/remove the tag from 3 terminals/i)).toBeInTheDocument();
  });

  it('says plainly when a delete will touch nothing', async () => {
    const user = userEvent.setup();
    tagsRef.current = [tag('ZZ Unused', 0)];
    renderTab('tags');

    await user.click(screen.getByLabelText('delete tag ZZ Unused'));

    expect(screen.getByText(/no terminals currently use this tag/i)).toBeInTheDocument();
  });

  // The dialog holds the whole entry so it can quote the count, but the
  // mutation takes the name. Passing the object would send "[object Object]".
  it('deletes by name, not by entry', async () => {
    const user = userEvent.setup();
    tagsRef.current = [tag('Operation Avalanche', 3)];
    renderTab('tags');

    await user.click(screen.getByLabelText('delete tag Operation Avalanche'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate).toHaveBeenCalledWith('Operation Avalanche', expect.anything());
  });

  it('creates a tag from the trimmed input', async () => {
    const user = userEvent.setup();
    renderTab('tags');

    await user.type(screen.getByLabelText('New tag name'), '  Operation Verify  ');
    await user.click(screen.getByRole('button', { name: /add tag/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate).toHaveBeenCalledWith('Operation Verify', expect.anything());
  });
});

/** An editor: Sections, Tags and Organizations, but no Audit log. */
function signInAsEditor() {
  authRef.current = {
    ...ADMIN,
    user: { id: '3', name: 'Editor User', email: 'editor@test.com', roles: ['editor'] },
    role: 'editor',
    isAdmin: false,
  };
}

const tabNames = () => screen.getAllByRole('tab').map((t) => t.textContent);

// The page was one 1947px scroll at 1280x720. A tab the reader cannot use is
// not drawn at all, rather than drawn and refused, and the open tab lives in
// the URL so a reload or a help link lands on it.
describe('SettingsPage tabs', () => {
  it('draws all five tabs for an admin, in order, opening on Sections', () => {
    render(<SettingsPage />);

    expect(tabNames()).toEqual(['Sections', 'Tags', 'Organizations', 'Import/Export', 'Audit log']);
    expect(screen.getByRole('tab', { name: 'Sections' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent(/Rename, recolor, or delete sections/);
  });

  it('draws Sections, Tags, Organizations and Data for an editor', () => {
    signInAsEditor();
    render(<SettingsPage />);

    expect(tabNames()).toEqual(['Sections', 'Tags', 'Organizations', 'Import/Export']);
  });

  it.each(['rto', 'planner'] as const)('draws Organizations and Data for an %s', (role) => {
    signInAs(role);
    render(<SettingsPage />);

    expect(tabNames()).toEqual(['Organizations', 'Import/Export']);
    expect(screen.getByRole('tab', { name: 'Organizations' })).toHaveAttribute('aria-selected', 'true');
  });

  // A strip of one tab is a heading pretending to be a control.
  it('draws no tab strip for a viewer, only the data panel and the access alert', () => {
    signInAs('viewer');
    render(<SettingsPage />);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('Import/Export')).toBeInTheDocument();
    expect(screen.getByText(/You currently have Viewer access/)).toBeInTheDocument();
  });

  it('opens the tab ?tab= names', () => {
    renderTab('organizations');

    expect(screen.getByRole('tab', { name: 'Organizations' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /add organization/i })).toBeInTheDocument();
    expect(screen.queryByText(/Rename, recolor, or delete sections/)).not.toBeInTheDocument();
  });

  it('falls back to the first tab for an unknown ?tab=', () => {
    renderTab('nonsense');

    expect(screen.getByRole('tab', { name: 'Sections' })).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to the first permitted tab for a ?tab= the role may not open', () => {
    signInAs('rto');
    renderTab('audit');

    expect(screen.queryByRole('tab', { name: 'Audit log' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Organizations' })).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to the data panel for a viewer sent to ?tab=organizations', () => {
    signInAs('viewer');
    renderTab('organizations');

    expect(screen.queryByRole('button', { name: /add organization/i })).not.toBeInTheDocument();
    expect(screen.getByText('Import/Export')).toBeInTheDocument();
  });

  it('switches panel when a tab is clicked', async () => {
    const user = userEvent.setup();
    renderTab('sections');

    await user.click(screen.getByRole('tab', { name: 'Tags' }));

    expect(screen.getByRole('tab', { name: 'Tags' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('New tag name')).toBeInTheDocument();
  });
});

// The Audit log tab is the log itself, the same AuditLog component /audit
// renders, not a panel holding a link to it.
describe('SettingsPage audit log tab', () => {
  it('renders the audit table inline for an admin', () => {
    auditRef.current = [auditEvent('e1', 'Exercise One')];
    renderTab('audit');

    expect(screen.getByRole('tab', { name: 'Audit log' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toContainElement(screen.getByRole('table', { name: 'audit log' }));
    const table = screen.getByRole('table', { name: 'audit log' });
    expect(within(table).getByText('Exercise One')).toBeInTheDocument();
    // The filters come with it, and no link out to /audit is left behind.
    expect(screen.getByRole('combobox', { name: 'Resource' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Action' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open audit log/i })).not.toBeInTheDocument();
  });

  // The page's own hidden "Audit Log" title is the /audit route's chrome; the
  // Settings tab must not bring a second h1 with it.
  it('does not bring the audit page title into Settings', () => {
    renderTab('audit');

    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Settings']);
  });

  it('draws no audit log for an editor sent to ?tab=audit', () => {
    signInAsEditor();
    renderTab('audit');

    expect(screen.queryByRole('table', { name: 'audit log' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sections' })).toHaveAttribute('aria-selected', 'true');
  });
});

const org = (key: string, name: string, operation_count: number, extra: Record<string, unknown> = {}) => ({
  key,
  name,
  short_label: key.toUpperCase(),
  branch: '',
  color: '#2E7D32',
  section_key: '',
  notes: '',
  operation_count,
  created_by: 't',
  updated_by: 't',
  created_at: '',
  updated_at: '',
  ...extra,
});

describe('SettingsPage organizations tab', () => {
  it('lists each organization with its label, branch and how many operations use it', () => {
    orgsRef.current = [
      org('green', 'Green Team', 2, { branch: 'USA' }),
      org('blue', 'Blue Team', 1),
      org('gold', 'Gold Team', 0),
    ];
    renderTab('organizations');

    const green = rowFor('Green Team');
    expect(within(green).getByText('GREEN')).toBeInTheDocument();
    expect(within(green).getByText('USA')).toBeInTheDocument();
    expect(within(green).getByText('2 operations')).toBeInTheDocument();
    // Singular, and zero spelled out rather than blank.
    expect(within(rowFor('Blue Team')).getByText('1 operation')).toBeInTheDocument();
    expect(within(rowFor('Gold Team')).getByText('0 operations')).toBeInTheDocument();
  });

  it('disables Delete while an operation has the organization, and says why', async () => {
    const user = userEvent.setup();
    orgsRef.current = [org('green', 'Green Team', 2), org('gold', 'Gold Team', 0)];
    renderTab('organizations');

    const del = screen.getByLabelText('delete organization Green Team');
    expect(del).toBeDisabled();
    expect(screen.getByLabelText('delete organization Gold Team')).toBeEnabled();

    // The span around the disabled button is what carries the hover.
    await user.hover(del.parentElement as HTMLElement);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Joined to 2 operations; remove it from them first');
  });

  it('confirms by name before deleting, and deletes by key', async () => {
    const user = userEvent.setup();
    orgsRef.current = [org('gold', 'Gold Team', 0)];
    renderTab('organizations');

    await user.click(screen.getByLabelText('delete organization Gold Team'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Delete organization?')).toBeInTheDocument();
    expect(within(dialog).getByText(/Gold Team will be removed from the library/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteOrgMutate).toHaveBeenCalledTimes(1);
    expect(deleteOrgMutate).toHaveBeenCalledWith('gold', expect.anything());
  });

  // The icon is disabled while the count is above zero, so a 409 here means
  // someone joined it since the list loaded. It must not vanish silently.
  it('keeps the confirmation open with the server message on a refused delete', async () => {
    const user = userEvent.setup();
    deleteOrgMutate.mockImplementation((_key: string, opts: { onError: (e: unknown) => void }) => {
      opts.onError(new ApiClientError('ORGANIZATION_IN_USE', 'organization is checked in to operation "Exercise One"', undefined, 409));
    });
    orgsRef.current = [org('gold', 'Gold Team', 0)];
    renderTab('organizations');

    await user.click(screen.getByLabelText('delete organization Gold Team'));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    expect(within(screen.getByRole('dialog')).getByText(/checked in to operation "Exercise One"/)).toBeInTheDocument();
  });

  it('saves an edit through useUpdateOrganization, with the key read-only', async () => {
    const user = userEvent.setup();
    updateOrgMutateAsync.mockResolvedValue(undefined);
    orgsRef.current = [org('green', 'Green Team', 2, { branch: 'USA' })];
    renderTab('organizations');

    await user.click(screen.getByLabelText('edit organization Green Team'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Edit organization')).toBeInTheDocument();
    // A value, not a box: the server has no rename.
    expect(within(dialog).getByLabelText('Key').tagName).not.toBe('INPUT');

    const name = within(dialog).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Green Squadron');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => { expect(updateOrgMutateAsync).toHaveBeenCalledTimes(1); });
    expect(updateOrgMutateAsync).toHaveBeenCalledWith({
      key: 'green',
      data: { name: 'Green Squadron', short_label: 'GREEN', branch: 'USA', color: '#2E7D32', section_key: '', notes: '' },
    });
    await waitFor(() => { expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); });
  });

  it('keeps the edit dialog open with the server message when a save is refused', async () => {
    const user = userEvent.setup();
    updateOrgMutateAsync.mockRejectedValue(new ApiClientError('ORGANIZATION_NAME_EXISTS', 'an organization with that name already exists', undefined, 409));
    orgsRef.current = [org('green', 'Green Team', 0)];
    renderTab('organizations');

    await user.click(screen.getByLabelText('edit organization Green Team'));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));

    expect(await within(screen.getByRole('dialog')).findByText('an organization with that name already exists')).toBeInTheDocument();
  });

  it('adds an organization through useCreateOrganization', async () => {
    const user = userEvent.setup();
    createOrgMutateAsync.mockResolvedValue(undefined);
    renderTab('organizations');

    await user.click(screen.getByRole('button', { name: /add organization/i }));
    const dialog = screen.getByRole('dialog');
    // Add is refused until the key is a valid slug and a name is set - the
    // wizard's rule, from the same helper.
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Key'), 'Red_1');
    await user.type(within(dialog).getByLabelText('Name'), 'Red Team');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => { expect(createOrgMutateAsync).toHaveBeenCalledTimes(1); });
    expect(createOrgMutateAsync).toHaveBeenCalledWith({
      key: 'red_1', name: 'Red Team', short_label: '', branch: '', color: '', section_key: '', notes: '',
    });
  });
});

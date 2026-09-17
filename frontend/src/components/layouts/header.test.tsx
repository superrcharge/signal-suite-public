import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { renderWithRoute, screen } from '@/test/utils';
import { HEADER_CONTROL_H, MD_UP } from '@/components/common/header-trigger-sx';
import { createAppTheme } from '@/theme';
import { Header } from './header';

/**
 * Two hooks, and the shortness of that list is the point of this file.
 *
 * Fifteen test files mock `@/services` with a closed object like this one, and
 * the header renders inside MainLayout in every one of them. A service hook
 * added to the header therefore breaks all fifteen at once, in a way that reads
 * as fifteen unrelated failures rather than as one cause. Keeping this mock down
 * to what the header genuinely needs turns that into one loud, local failure
 * here instead.
 *
 * `useSections` is here deliberately, and its arrival narrowed what this file
 * proves. Which squadrons run a comms card used to be a hardcoded list of five,
 * so the header could answer it synchronously and this mock could be
 * `useLogout` alone. Migration 036 made it a `pace_enabled` column, so Add Net's
 * gate needs the sections query - and `useSections` is already stubbed in all
 * nine tests that mount MainLayout, so it costs nothing there.
 *
 * What this still catches, and what actually breaks fifteen files, is a **CSV**
 * service hook reaching the header: `useCsvImport`, an export mutation, the
 * fiscal-year vocabulary. All of that belongs to the dialogs, which mount only
 * when one is opened. Read the narrowing as a consequence, not a regression.
 */
vi.mock('@/services', () => ({
  useLogout: () => ({ mutate: vi.fn() }),
  useSections: () => ({
    data: [{ key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true }],
    isLoading: false,
  }),
}));

// The app is dark-only, so this is the whole shape of the context now. The
// previous version mocked `toggleMode` while the header destructured
// `toggleTheme`, so the toggle's onClick was undefined under test for as long
// as the button existed - it was never actually covered. The button is gone;
// the assertion below is what keeps it gone.
vi.mock('@/contexts/theme-context', async () => {
  const actual = await vi.importActual('@/contexts/theme-context');
  return { ...actual, useThemeMode: () => ({ mode: 'dark' }) };
});

const { auth } = vi.hoisted(() => ({
  auth: {
    current: {
      canWrite: true,
      canWriteRadio: true,
      canWritePace: true,
      isPlanner: false, canSeeContracts: true,
      isAdmin: true,
      isAuthenticated: true, role: 'admin',
      user: { name: 'Tester', email: 't@example.mil', roles: ['admin'] },
    },
  },
}));

vi.mock('@/contexts/auth-context', async () => {
  const actual = await vi.importActual('@/contexts/auth-context');
  return { ...actual, useAuth: () => auth.current };
});

const renderAt = (route: string) =>
  renderWithRoute(<Header onMenuClick={vi.fn()} sidebarOpen sidebarWidth={240} />, route);

/**
 * Both header clusters are one icon-only trigger plus a menu now, so their
 * contents cost a click to reach. Each trigger is named only by its
 * `aria-label`; menu items carrying a caption line have that in their
 * accessible name too, hence the leading-anchor regex.
 */
const openMenu = (name: 'import and export' | 'add') =>
  userEvent.click(screen.getByRole('button', { name }));

const item = (label: string) =>
  screen.queryByRole('menuitem', { name: new RegExp(`^${label}`, 'i') });

// Every top-level route, plus the section-scoped and nested ones.
const ROUTES = [
  '/dashboard',
  '/terminals',
  '/kits',
  '/contracts',
  '/catalog',
  '/nets',
  '/nets/asqd',
  '/pace',
  '/pace/asqd',
  '/users',
  '/settings',
  '/audit',
];

describe('Header CSV controls', () => {
  // "Static and identical on every page" as a test rather than as a comment.
  // The previous arrangement put these on five pages and nowhere else, so three
  // of the nine datasets had no control anywhere in the app.
  it.each(ROUTES)('offers the same control on %s', (route) => {
    renderAt(route);
    expect(screen.getByRole('button', { name: 'import and export' })).toBeInTheDocument();
  });

  it('offers all three datasets actions behind that one control', async () => {
    renderAt('/terminals');
    await openMenu('import and export');

    expect(item('Export')).toBeInTheDocument();
    expect(item('Template')).toBeInTheDocument();
    expect(item('Import')).toBeInTheDocument();
  });

  it('mounts no dialog and no file input until something is clicked', () => {
    renderAt('/terminals');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The hidden input lives inside the import dialog now. On the header it
    // would mean the import machinery had been mounted on every route.
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('draws the share trigger as the same button as the add trigger', () => {
    // They are not their own family. An early go at treating them as one used
    // amber, which read as a warning on two controls that warn about nothing.
    //
    // `outlined` was tried once before and rejected as "right hue, wrong
    // weight" - but that judgement was made while three solid CSV buttons still
    // sat beside them, so an outlined trigger was the odd one out in the row.
    // Collapsing both clusters removed every solid button from the header, and
    // with nothing left to be lighter *than*, the objection went with them.
    //
    // The equivalence used to be asserted over three CSV buttons against Add
    // Terminal. Those are menu items now and carry no MuiButton class at all,
    // so that comparison could only ever pass vacuously. It moved to where the
    // rule actually lives: the two triggers flanking HelpButton, which must
    // read as one pair.
    //
    // Still expressed as "same variant class as the other one" rather than a
    // bare assertion on each, so it keeps holding if either is ever restyled.
    renderAt('/terminals');

    const variantOf = (name: string) =>
      Array.from(screen.getByRole('button', { name }).classList)
        .filter((c) => c.startsWith('MuiButton-') && !c.includes('Size'))
        .sort()
        .join(' ');

    const reference = variantOf('add');
    expect(reference).toContain('MuiButton-outlined');
    expect(variantOf('import and export')).toBe(reference);
  });

  it('gives all three outlined header controls one height', () => {
    // The set is share, "I need help!" and add. They are the only controls in
    // the bar whose box is drawn, so they are the only ones compared by eye -
    // and they drifted apart exactly as a value copied into three files does:
    // the help pill rendered 30.8px against the other two at 28.
    //
    // HEADER_CONTROL_SX in components/common/header-trigger-sx.ts is now the
    // single source, and this asserts the three agree *and* that they agree on
    // the value that file states. Comparing them only to each other would pass
    // just as happily if all three silently became MUI's default - verified by
    // deleting `height` from HEADER_CONTROL_SX, which turns this red with
    // "expected 'auto' to be '24px'".
    //
    // **Know what this does not cover.** jsdom has no `matchMedia`, so
    // HelpButton's `useMediaQuery` is always false and it renders its *icon*
    // variant here, never the labelled pill - which is the branch the 30.8px
    // drift was actually in. Removing the height from the labelled branch
    // alone leaves this test green; that was checked, not assumed. The icon
    // variant shares HEADER_TRIGGER_SX with the other two, so what this really
    // pins is that all three read from the shared module and that the module
    // still says 24. The labelled pill is held by the module, not by a test.
    //
    // The same is now true of the md size. The height is responsive - 24 below
    // md, 28 from md up - and jsdom applies no @media rule, so only the xs
    // value is visible here. The md value is held by the module too.
    //
    // jsdom computes no layout either, so this reads the declared CSS emotion
    // injects rather than a measured box. That is the right thing to pin
    // regardless: the bug was a wrong declaration, not a wrong measurement.
    renderAt('/terminals');

    for (const name of ['import and export', 'I need help!', 'add']) {
      const el = screen.getByRole('button', { name });
      expect(getComputedStyle(el).height).toBe(`${String(HEADER_CONTROL_H.xs)}px`);
    }
  });

  it('steps the outlined set up at the same width the theme calls md', () => {
    // The outlined controls step up through MD_UP, a literal media query, so
    // jsdom can still see their base height. Everything else in the bar steps
    // up through `{ xs, md }`, which reads the theme. Customise the theme's
    // breakpoints and those two would part, resizing the bar at two widths.
    expect(createAppTheme('dark').breakpoints.up('md')).toBe(MD_UP);
  });

  it('offers Add Net on every route, and only deep-links where a squadron is named', async () => {
    // It used to appear only on /nets/:section and /pace/:section, so the Add
    // cluster grew and shrank as you moved around. The squadron question is
    // still real - a net belongs to one - so off those routes it goes to the
    // picker rather than guessing a squadron.
    for (const route of ['/terminals', '/kits', '/dashboard', '/pace/asqd/edit']) {
      const view = renderAt(route);
      await openMenu('add');
      expect(item('Add Net')).toBeInTheDocument();
      view.unmount();
    }
  });

  it('keeps the Add actions, which are not CSV, behind their own trigger', async () => {
    renderAt('/terminals');
    await openMenu('add');
    expect(item('Add Terminal')).toBeInTheDocument();
    expect(item('Add Kit')).toBeInTheDocument();
  });

  it('shows a viewer Export and Template, but not Import, and no + at all', async () => {
    auth.current = { canWrite: false, canWriteRadio: false, canWritePace: false, isPlanner: false, canSeeContracts: false, isAdmin: false, isAuthenticated: true, role: 'viewer', user: { name: 'Val', email: 'v@example.mil', roles: ['viewer'] } };
    try {
      renderAt('/terminals');

      // Export is a read and Template is a header row the backend serves to
      // anyone - TestImportTemplatesAreReachableWithoutAuth asserts those
      // routes never 401, so hiding the button contradicted the server. Import
      // targets a write endpoint, so a viewer would get a control whose every
      // destination 403s.
      await openMenu('import and export');
      expect(item('Export')).toBeInTheDocument();
      expect(item('Template')).toBeInTheDocument();
      expect(item('Import')).toBeNull();

      // And nothing a viewer could add, so the + is absent rather than opening
      // an empty menu.
      expect(screen.queryByRole('button', { name: 'add' })).not.toBeInTheDocument();
    } finally {
      auth.current = { canWrite: true, canWriteRadio: true, canWritePace: true, isPlanner: false, canSeeContracts: true, isAdmin: true, isAuthenticated: true, role: 'admin', user: { name: 'Tester', email: 't@example.mil', roles: ['admin'] } };
    }
  });

  // The planner role sees a planning-shaped header. Hiding nav, not denying
  // anything: the reads behind these pages stay open to every role.
  it('shapes the page menu and the Add cluster for a planner', async () => {
    auth.current = {
      canWrite: false,
      canWriteRadio: false,
      canWritePace: true,
      isAdmin: false,
      isPlanner: true, canSeeContracts: false,
      isAuthenticated: true, role: 'planner',
      user: { name: 'Pat', email: 'p@example.mil', roles: ['planner'] },
    };
    try {
      renderAt('/pace');

      // Writes it has: nets and PACE. Writes it does not: terminals and kits.
      // A one-item menu is still a menu: the control does not change shape with
      // the viewer's role.
      await openMenu('add');
      expect(item('Add Net')).toBeInTheDocument();
      expect(item('Add Terminal')).toBeNull();
      expect(item('Add Kit')).toBeNull();
      await userEvent.keyboard('{Escape}');

      // Export and Template stay: both are reads, open to everyone.
      await openMenu('import and export');
      expect(item('Export')).toBeInTheDocument();
      await userEvent.keyboard('{Escape}');

      const menu = screen.getByRole('button', { name: /page navigation|PACE/i });
      await userEvent.click(menu);

      for (const kept of ['Catalog', 'PACE', 'Settings']) {
        expect(screen.getByRole('menuitem', { name: new RegExp(kept, 'i') })).toBeInTheDocument();
      }
      for (const hidden of ['Terminals', 'Kits', 'Contracts', 'Users', 'Dashboard']) {
        expect(screen.queryByRole('menuitem', { name: new RegExp(`^${hidden}$`, 'i') })).toBeNull();
      }
    } finally {
      auth.current = {
        canWrite: true, canWriteRadio: true, canWritePace: true,
        isAdmin: true, isPlanner: false, canSeeContracts: true, isAuthenticated: true, role: 'admin', user: { name: 'Tester', email: 't@example.mil', roles: ['admin'] },
      };
    }
  });

  // Contracts are internal, so the page-menu entry sits behind
  // canSeeContracts rather than the planner rule: a viewer or rto keeps
  // Terminals and Kits and loses only Contracts, and an editor keeps Contracts
  // while Audit Log stays admin-only through the same `gate` field.
  it.each([
    ['viewer', { canWrite: false, canWriteRadio: false, canWritePace: false }],
    ['rto', { canWrite: false, canWriteRadio: true, canWritePace: true }],
  ])('hides Contracts from the page menu for a %s', async (role, writes) => {
    auth.current = {
      ...writes, isAdmin: false, isPlanner: false, canSeeContracts: false,
      isAuthenticated: true, role, user: { name: 'Rae', email: 'r@example.mil', roles: [role] },
    };
    try {
      renderAt('/terminals');
      await userEvent.click(screen.getByRole('button', { name: /page navigation|Terminals/i }));

      expect(screen.getByRole('menuitem', { name: /^Terminals$/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /^Kits$/i })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: /^Contracts$/i })).toBeNull();
      // The two pages whose reads the server refuses below admin.
      expect(screen.queryByRole('menuitem', { name: /^Users$/i })).toBeNull();
      expect(screen.queryByRole('menuitem', { name: /^Audit Log$/i })).toBeNull();
    } finally {
      auth.current = {
        canWrite: true, canWriteRadio: true, canWritePace: true,
        isAdmin: true, isPlanner: false, canSeeContracts: true, isAuthenticated: true, role: 'admin', user: { name: 'Tester', email: 't@example.mil', roles: ['admin'] },
      };
    }
  });

  it('shows Contracts to an editor and keeps Users and Audit Log admin-only', async () => {
    auth.current = {
      canWrite: true, canWriteRadio: true, canWritePace: true, isAdmin: false, isPlanner: false, canSeeContracts: true,
      isAuthenticated: true, role: 'editor', user: { name: 'Ed', email: 'e@example.mil', roles: ['editor'] },
    };
    try {
      renderAt('/terminals');
      await userEvent.click(screen.getByRole('button', { name: /page navigation|Terminals/i }));

      expect(screen.getByRole('menuitem', { name: /^Contracts$/i })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: /^Users$/i })).toBeNull();
      expect(screen.queryByRole('menuitem', { name: /^Audit Log$/i })).toBeNull();
    } finally {
      auth.current = {
        canWrite: true, canWriteRadio: true, canWritePace: true,
        isAdmin: true, isPlanner: false, canSeeContracts: true, isAuthenticated: true, role: 'admin', user: { name: 'Tester', email: 't@example.mil', roles: ['admin'] },
      };
    }
  });
});

describe('Header role display', () => {
  // The chip is not gated on a breakpoint, unlike the CSV labels beside it.
  // Those collapse to an icon that still means "export"; a role pill collapsed
  // to an icon means nothing. So it is on every route, at every width.
  it.each(ROUTES)('shows the role chip on %s', (route) => {
    renderAt(route);
    expect(screen.getByLabelText('your role: admin')).toBeInTheDocument();
  });

  it('names the role and what it grants in the account menu', async () => {
    renderAt('/terminals');
    await userEvent.click(screen.getByRole('button', { name: 'account menu' }));

    expect(screen.getByText('Every domain, plus user roles and the audit log')).toBeInTheDocument();
  });

  it('reads roles[] rather than the primary role field', async () => {
    // The array the API did not write: a legacy value or an Entra group name
    // ahead of the real role. `role` is roles[0], so it goes stale here while
    // permissions - which scan the whole slice - do not. The menu must describe
    // the role the user actually holds, and must not render the unknown entry
    // as an uppercase pill.
    auth.current = {
      canWrite: true, canWriteRadio: true, canWritePace: true,
      isAdmin: true, isPlanner: false, canSeeContracts: true, isAuthenticated: true, role: 'admin',
      user: { name: 'Legacy', email: 'l@example.mil', roles: ['Legacy-Ops-Group', 'editor'] },
    };
    try {
      renderAt('/terminals');
      await userEvent.click(screen.getByRole('button', { name: 'account menu' }));

      expect(screen.getByText('Writes every domain; no user management')).toBeInTheDocument();
      expect(screen.queryByText(/Legacy-Ops-Group/i)).toBeNull();
    } finally {
      auth.current = {
        canWrite: true, canWriteRadio: true, canWritePace: true,
        isAdmin: true, isPlanner: false, canSeeContracts: true, isAuthenticated: true, role: 'admin',
        user: { name: 'Tester', email: 't@example.mil', roles: ['admin'] },
      };
    }
  });

  it('describes a viewer as a viewer', async () => {
    auth.current = { canWrite: false, canWriteRadio: false, canWritePace: false, isPlanner: false, canSeeContracts: false, isAdmin: false, isAuthenticated: true, role: 'viewer', user: { name: 'Val', email: 'v@example.mil', roles: ['viewer'] } };
    try {
      renderAt('/terminals');
      expect(screen.getByLabelText('your role: viewer')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'account menu' }));
      expect(screen.getByText('Reads everything; no writes')).toBeInTheDocument();
    } finally {
      auth.current = {
        canWrite: true, canWriteRadio: true, canWritePace: true,
        isAdmin: true, isPlanner: false, canSeeContracts: true, isAuthenticated: true, role: 'admin',
        user: { name: 'Tester', email: 't@example.mil', roles: ['admin'] },
      };
    }
  });
});

describe('Header theme toggle', () => {
  // Removed deliberately: the app is dark-only, and a toggle back to a palette
  // the provider will not serve is a control that does nothing. Asserted on
  // every route because the header is identical on all of them, so a
  // reintroduction anywhere fails here.
  it.each(ROUTES)('offers no theme toggle on %s', (route) => {
    renderAt(route);
    expect(screen.queryByRole('button', { name: 'toggle theme' })).not.toBeInTheDocument();
  });
});

/**
 * The lockup is static and unconditional: not a link, not behind auth, on
 * every route. A wordmark that vanished for a signed-out user, or on one
 * page, would read as the app having lost its name there.
 */
describe('Header identity', () => {
  it.each(ROUTES)('carries the Signal Suite lockup at %s', (route) => {
    renderAt(route);
    expect(screen.getByRole('img', { name: 'Signal Suite' })).toBeInTheDocument();
  });

  it('keeps the lockup when nobody is signed in', () => {
    const before = auth.current;
    auth.current = { ...before, isAuthenticated: false, role: null as unknown as typeof before.role, user: null as unknown as typeof before.user };
    try {
      renderAt('/');
      expect(screen.getByRole('img', { name: 'Signal Suite' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'account menu' })).not.toBeInTheDocument();
    } finally {
      auth.current = before;
    }
  });
});

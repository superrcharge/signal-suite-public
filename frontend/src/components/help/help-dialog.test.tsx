import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '@/test/utils';
import { HELP_GROUPS } from '@/help/help-content';
import { HelpDialog } from './help-dialog';

/**
 * Two hooks used by HelpDialog, both mocked here rather than through
 * `@/services`: `useAuth` (role gating) and `useNavigate` (the "Take me
 * there" button). Neither is `@/services`, so this file plays no part in the
 * mock-coverage rule that governs the header - see the doc comment atop
 * help-button.tsx for why that constraint exists at all.
 */
const { auth } = vi.hoisted(() => ({
  auth: {
    current: {
      role: 'admin',
      isAdmin: true,
      canWrite: true,
      canWriteRadio: true,
      canWritePace: true,
      canSeeContracts: true,
      isPlanner: false,
      isAuthenticated: true,
      isLoading: false,
      isError: false,
      user: { name: 'Tester', email: 't@example.mil', roles: ['admin'] },
      refetch: vi.fn(),
    },
  },
}));

vi.mock('@/contexts/auth-context', async () => {
  const actual = await vi.importActual('@/contexts/auth-context');
  return { ...actual, useAuth: () => auth.current };
});

const navigateMock = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => navigateMock };
});

const ADMIN_AUTH = { ...auth.current };
const VIEWER_AUTH = {
  role: 'viewer',
  isAdmin: false,
  canWrite: false,
  canWriteRadio: false,
  canWritePace: false,
  canSeeContracts: false,
  isPlanner: false,
  isAuthenticated: true,
  isLoading: false,
  isError: false,
  user: { name: 'Val', email: 'v@example.mil', roles: ['viewer'] },
  refetch: vi.fn(),
};

// The one admin-gated topic every gating test below hangs off: "Who can
// manage users and read the audit log?" in the "Roles & Access" group,
// route /audit, gate 'isAdmin'.
const ADMIN_ONLY_QUESTION = 'Who can manage users and read the audit log?';

describe('HelpDialog', () => {
  it('renders every group heading, and keeps topic content hidden until expanded', async () => {
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    for (const group of HELP_GROUPS) {
      expect(screen.getByText(group.title)).toBeInTheDocument();
    }

    // Collapsed on open: a group's Accordion unmounts its content, so a
    // topic's question is not even in the DOM yet, let alone its answer.
    expect(screen.queryByText('How do I add a SATCOM terminal?')).not.toBeInTheDocument();

    await user.click(screen.getByText('Terminals & Kits'));
    expect(screen.getByText('How do I add a SATCOM terminal?')).toBeInTheDocument();
    // The group is open now, but the topic itself still is not - no "Who:"
    // line anywhere yet.
    expect(screen.queryByText(/Who:/)).not.toBeInTheDocument();

    await user.click(screen.getByText('How do I add a SATCOM terminal?'));
    expect(screen.getByText(/Who:/)).toBeInTheDocument();
  });

  it('filters on typing, auto-expanding the matching group and hiding the rest', async () => {
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Search help...'), 'audit log');

    // The matching group auto-expands - no click needed to see the question.
    expect(screen.getByText('Roles & Access')).toBeInTheDocument();
    expect(screen.getByText(ADMIN_ONLY_QUESTION)).toBeInTheDocument();

    // A group with nothing matching is not rendered at all.
    expect(screen.queryByText('Terminals & Kits')).not.toBeInTheDocument();
  });

  it('shows the empty-state copy when nothing matches', async () => {
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Search help...'), 'zzznotarealterm');

    expect(screen.getByText('Nothing matches that. Try a shorter word.')).toBeInTheDocument();
    expect(screen.queryByText('Roles & Access')).not.toBeInTheDocument();
  });

  it('shows "Take me there" to an admin on a topic gated isAdmin', async () => {
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    await user.click(screen.getByText('Roles & Access'));
    await user.click(screen.getByText(ADMIN_ONLY_QUESTION));

    expect(screen.getByRole('button', { name: 'Take me there' })).toBeInTheDocument();
  });

  it('hides "Take me there" from a viewer, but keeps the question and the Who line', async () => {
    const user = userEvent.setup();
    auth.current = VIEWER_AUTH;
    try {
      render(<HelpDialog onClose={vi.fn()} />);

      await user.click(screen.getByText('Roles & Access'));
      await user.click(screen.getByText(ADMIN_ONLY_QUESTION));

      // The answer survives even though the button does not - "why can I not
      // do this" is the question this feature exists to answer.
      expect(screen.getByText(ADMIN_ONLY_QUESTION)).toBeInTheDocument();
      // The Who: line renders the role as a RoleBadge - the same pill the
      // header chip and the Users page use - so assert the label and the badge
      // rather than a concatenated string.
      expect(screen.getByText('Who:')).toBeInTheDocument();
      expect(screen.getByText('admin')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Take me there' })).not.toBeInTheDocument();
    } finally {
      auth.current = ADMIN_AUTH;
    }
  });

  it('still finds a topic by a control whose step is now an icon', async () => {
    // The regression this exists for: steps used to hold the literal words
    // "Import and export", and the search haystack is built by joining them.
    // Tokenising the step to '@share' so it can draw the real icon would have
    // silently dropped that phrase out of search - and search is the dialog's
    // primary affordance, so the loss is invisible until someone cannot find
    // anything. matchesSearch resolves each step through specFor().name.
    //
    // Asserted on the phrase that exists ONLY as the control's accessible name.
    // "export" alone would pass off the group title and prove nothing.
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Search help...'), 'import and export');

    expect(screen.getByText('Import & Export')).toBeInTheDocument();
    expect(screen.getByText('How do I export data?')).toBeInTheDocument();
    expect(screen.queryByText('Nothing matches that. Try a shorter word.')).not.toBeInTheDocument();
  });

  it('draws a step that names an icon-only control as that icon', async () => {
    // The share trigger carries no text, so the step cannot quote any. The
    // chip is named for a screen reader by the control's own accessible name.
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    await user.click(screen.getByText('Import & Export'));
    await user.click(screen.getByText('How do I export data?'));

    expect(screen.getByLabelText('Import and export')).toBeInTheDocument();
    // Download CSV is a real button, so it keeps its words.
    expect(screen.getByText('Download CSV')).toBeInTheDocument();
  });

  it('navigates and closes the dialog when "Take me there" is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HelpDialog onClose={onClose} />);

    await user.click(screen.getByText('Roles & Access'));
    await user.click(screen.getByText(ADMIN_ONLY_QUESTION));
    await user.click(screen.getByRole('button', { name: 'Take me there' }));

    expect(navigateMock).toHaveBeenCalledWith('/audit');
    expect(onClose).toHaveBeenCalled();
  });
});

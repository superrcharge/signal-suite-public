import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, within } from '@/test/utils';
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
      canSeeContracts: true, canSeeTrackers: true,
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
  canSeeContracts: false, canSeeTrackers: false,
  isPlanner: false,
  isAuthenticated: true,
  isLoading: false,
  isError: false,
  user: { name: 'Val', email: 'v@example.mil', roles: ['viewer'] },
  refetch: vi.fn(),
};

// The one admin-gated topic every gating test below hangs off: "Who can
// manage users and read the audit log?" in the "Roles & Access" group,
// route /settings?tab=audit, gate 'isAdmin'.
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
    // Each typed word is marked inside the question, separately: the search
    // matches by words, so "audit log" is two hits, not one phrase. Asserted
    // through the marks rather than getByText on the whole sentence, because
    // the sentence is split around them and a string matcher reads one node.
    const question = screen.getAllByText('audit', { selector: 'mark' })
      .map((m) => m.closest('p'))
      .find((p) => p?.textContent === ADMIN_ONLY_QUESTION);
    expect(question).toBeTruthy();
    expect(within(question as HTMLElement).getByText('log', { selector: 'mark' })).toBeInTheDocument();

    // A group with nothing matching is not rendered at all.
    expect(screen.queryByText('Terminals & Kits')).not.toBeInTheDocument();
  });

  it('shows the empty-state copy when nothing matches', async () => {
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Search help...'), 'zzznotarealterm');

    expect(screen.getByText('Nothing matches those words. Try another word for it.')).toBeInTheDocument();
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
    // anything. The search resolves each step through specFor().name.
    //
    // The search is by words now, so "import" and "export" are two hits.
    // "import" exists on the export topic ONLY as the share control's
    // accessible name: if the step were indexed raw, the topic would match
    // one word and drop out of the best tier behind the topics matching both.
    // The group title is never searched or marked, so it still reads whole;
    // the question carries a mark on "export", so it is reached through that.
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Search help...'), 'import and export');

    expect(screen.getByText('Import & Export')).toBeInTheDocument();
    const question = screen.getAllByText('export', { selector: 'mark' })
      .map((m) => m.closest('p'))
      .find((p) => p?.textContent === 'How do I export data?');
    expect(question).toBeTruthy();
    expect(screen.queryByText('Nothing matches those words. Try another word for it.')).not.toBeInTheDocument();
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

  it('says "matched a keyword" on a topic found only through its hidden keywords', async () => {
    // 'drill down' is a keyword on "Can I click a number on the Stats page?"
    // and appears in none of that topic's visible text. Without the caption
    // the topic would sit in the list with nothing marked, which in a list of
    // marked rows reads as a false positive.
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Search help...'), 'drill down');

    const question = screen.getByText('Can I click a number on the Stats page?');
    expect(question.parentElement).toHaveTextContent('matched a keyword');
    expect(document.querySelector('mark')).toBeNull();
  });

  it('names a step hit on the collapsed row, and marks the chip once the topic is opened', async () => {
    // 'Download CSV' is a step on "How do I export data?" and not in its
    // question. Steps are unmounted while a topic is collapsed, and searching
    // does not open topics - a broad term would open eight answers at once -
    // so the row says where the hit is until the reader opens it. The caption
    // names the STRONGEST field: both words are also keywords of the topic,
    // and keywords outrank steps, so it says keyword rather than steps.
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Search help...'), 'download csv');

    const question = screen.getByText('How do I export data?');
    expect(question).toHaveTextContent('matched a keyword');
    expect(question.querySelector('mark')).toBeNull();
    expect(screen.queryByText('Who:')).not.toBeInTheDocument();

    await user.click(question);
    // Two words, two marks on the chip.
    const chip = screen.getByText('Download', { selector: 'mark' }).closest('span');
    expect(chip).toHaveTextContent('Download CSV');
    expect(within(chip as HTMLElement).getByText('CSV', { selector: 'mark' })).toBeInTheDocument();
  });

  it('names a note hit on the collapsed row, and marks the phrase once the topic is opened', async () => {
    // "Enter saves, Escape cancels." is the inline-edit note under
    // "How do I edit a terminal?" and nowhere in the question or steps.
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Search help...'), 'escape cancels');

    const question = screen.getByText('How do I edit a terminal?');
    expect(question).toHaveTextContent('matched in the note');
    expect(question.querySelector('mark')).toBeNull();

    await user.click(question);
    // "cancels" was typed; the search stems it to "cancel" and marks that
    // prefix of the word on the page.
    const mark = screen.getByText('Escape', { selector: 'mark' });
    expect(mark.closest('p')).toHaveTextContent('Enter saves, Escape cancels.');
    expect(within(mark.closest('p') as HTMLElement).getByText('cancel', { selector: 'mark' })).toBeInTheDocument();
  });

  it('still matches words that sit in two adjacent step names', async () => {
    // The export topic's steps resolve to "Import and export", "Export",
    // "Download CSV". The old search joined them with a space so the phrase
    // "export download" could run across the boundary; the word search does
    // not care about adjacency at all. "export" is also in the question, the
    // strongest field, so the row marks it there and carries no caption.
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Search help...'), 'export download');

    const question = screen.getAllByText('export', { selector: 'mark' })
      .map((m) => m.closest('p'))
      .find((p) => p?.textContent === 'How do I export data?');
    expect(question).toBeTruthy();
    expect(question).not.toHaveTextContent('matched');
  });

  it('finds a question from a differently worded one', async () => {
    // The report that produced the word search: "how to add a net" is the
    // same question as "How do I add a net?" and used to return nothing,
    // because the whole typed string was matched with includes and "to" is
    // not in the stored text. The filler words carry no signal; "add" and
    // "net" are what the reader means, and each is marked.
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Search help...'), 'how to add a net');

    const question = screen.getAllByText('add', { selector: 'mark' })
      .map((m) => m.closest('p'))
      .find((p) => p?.textContent === 'How do I add a net?');
    expect(question).toBeTruthy();
    expect(within(question as HTMLElement).getByText('net', { selector: 'mark' })).toBeInTheDocument();
    // The topic matching both words leads; one that matches only "add" does
    // not appear beside it.
    expect(screen.queryByText('How do I add a SATCOM terminal?')).not.toBeInTheDocument();
  });

  it('removes every mark when the search is cleared', async () => {
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);
    const box = screen.getByPlaceholderText('Search help...');

    await user.type(box, 'audit log');
    expect(document.querySelectorAll('mark').length).toBeGreaterThan(0);

    await user.clear(box);
    expect(document.querySelector('mark')).toBeNull();
  });

  it('leaves topics as the reader left them while searching', async () => {
    const user = userEvent.setup();
    render(<HelpDialog onClose={vi.fn()} />);

    // The reader opened the group but not the topic.
    await user.click(screen.getByText('Roles & Access'));
    expect(screen.getByText(ADMIN_ONLY_QUESTION)).toBeInTheDocument();
    expect(screen.queryByText('Who:')).not.toBeInTheDocument();

    // Searching marks the question and leaves the topic closed. Only the
    // GROUP opens on a search; opening every matching topic was tried and a
    // broad term turned the list into a wall of answers.
    const box = screen.getByPlaceholderText('Search help...');
    await user.type(box, 'audit log');
    const mark = screen.getAllByText('audit', { selector: 'mark' })
      .find((m) => m.closest('p')?.textContent === ADMIN_ONLY_QUESTION);
    expect(mark).toBeTruthy();
    expect(screen.queryByText('Who:')).not.toBeInTheDocument();

    // A topic the reader opens stays open through further typing.
    await user.click(mark as HTMLElement);
    expect(screen.getByText('Who:')).toBeInTheDocument();
    await user.type(box, '?');
    expect(screen.getByText('Who:')).toBeInTheDocument();
  });

  it('anchors the paper to the top so the search box does not move as results change', () => {
    // MUI centres a dialog vertically, and the list under the search box
    // changes height on every keystroke, so the box the reader was typing
    // into bounced to stay centred. Top-aligned, only the bottom edge moves.
    render(<HelpDialog onClose={vi.fn()} />);

    expect(document.querySelector('.MuiDialog-container')).toHaveStyle({ alignItems: 'flex-start' });
  });

  it('navigates and closes the dialog when "Take me there" is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HelpDialog onClose={onClose} />);

    await user.click(screen.getByText('Roles & Access'));
    await user.click(screen.getByText(ADMIN_ONLY_QUESTION));
    await user.click(screen.getByRole('button', { name: 'Take me there' }));

    // The Audit log tab, since /audit became a redirect to it.
    expect(navigateMock).toHaveBeenCalledWith('/settings?tab=audit');
    expect(onClose).toHaveBeenCalled();
  });
});

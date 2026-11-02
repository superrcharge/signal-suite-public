import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { cleanup, render, screen, within } from '@/test/utils';
import type { Operation, Participant, RFI } from '@/types';
import { RfiDialog } from './rfi-dialog';

const createMutate = vi.fn();
const commentMutate = vi.fn();
const resolveMutate = vi.fn();
let rfis: RFI[] = [];

vi.mock('@/services', () => ({
  useOperationRfis: () => ({ data: { rfis } }),
  useCreateRfi: () => ({ mutate: createMutate, isPending: false }),
  useAddRfiComment: () => ({ mutate: commentMutate, isPending: false }),
  useResolveRfi: () => ({ mutate: resolveMutate, isPending: false }),
}));

let canWritePace = true;
let userId = 'u-poster';
vi.mock('@/contexts/auth-context', async () => ({
  ...(await vi.importActual('@/contexts/auth-context')),
  useAuth: () => ({ canWritePace, canWrite: true, canWriteRadio: true, isAdmin: true, role: 'admin', user: { id: userId, name: 'Tester' } }),
}));

const OPERATION: Operation = {
  id: 'op-1', name: 'Operation Avalanche', acronym: '', status: 'active', start_date: '2026-10-01', end_date: '',
  notes: '', participant_count: 2, created_by: '', updated_by: '', created_at: '', updated_at: '',
};

const stamps = { created_by: 't', updated_by: 't', created_at: '', updated_at: '' };
const unit = (id: string, key: string, short: string, color: string): Participant => ({
  id, operation_id: 'op-1', organization_key: key,
  organization: { key, name: short, short_label: short, branch: 'USA', color, adhoc: false },
  platform_ids: [], equipment_ids: [], waveform_abbrevs: [], service_abbrevs: [], transport_ids: [],
  asset_phases: {}, poc_name: '', poc_phone: '', poc_email: '', notes: '', ...stamps,
});
const PARTICIPANTS = [unit('p1', 'green', 'GREEN', '#2E7D32'), unit('p2', 'kilo', 'TF KILO', '#1565C0')];

const rfi = (over: Partial<RFI>): RFI => ({
  id: 'r1', operation_id: 'op-1', participant_id: 'p1', question: 'Which net carries fires?', status: 'open',
  created_by: 'Alex Poster', created_by_id: 'u-poster', resolved_by: '', resolved_at: null,
  created_at: '2026-10-30T10:00:00Z', updated_at: '2026-10-30T10:00:00Z',
  comments: [{
    id: 'c1', rfi_id: 'r1', body: 'Net 4, I think.', created_by: 'Sam Reply', created_by_id: 'u-other',
    created_at: '2026-10-30T11:00:00Z',
  }],
  ...over,
});

const renderDialog = () => render(
  <RfiDialog open operation={OPERATION} participants={PARTICIPANTS} onClose={vi.fn()} />,
);
const popup = () => within(screen.getByRole('dialog', { name: /RFIs/ }));

beforeEach(() => {
  cleanup();
  createMutate.mockReset();
  commentMutate.mockReset();
  resolveMutate.mockReset();
  canWritePace = true;
  userId = 'u-poster';
  rfis = [rfi({})];
});

describe('RfiDialog', () => {
  it('renders an open RFI with its unit, poster, question and comments', () => {
    renderDialog();
    expect(popup().getByText('Operation Avalanche')).toBeInTheDocument();
    expect(popup().getByText('GREEN')).toBeInTheDocument();
    expect(popup().getByText(/Alex Poster/)).toBeInTheDocument();
    expect(popup().getByText('Which net carries fires?')).toBeInTheDocument();
    expect(popup().getByText(/Sam Reply/)).toBeInTheDocument();
    expect(popup().getByText('Net 4, I think.')).toBeInTheDocument();
  });

  it('says so when nothing is open', () => {
    rfis = [];
    renderDialog();
    expect(popup().getByText('No open RFIs.')).toBeInTheDocument();
  });

  it('gives a reader the list and Close only', () => {
    canWritePace = false;
    renderDialog();
    expect(popup().getByText('Which net carries fires?')).toBeInTheDocument();
    expect(popup().queryByRole('button', { name: 'Post RFI' })).toBeNull();
    expect(popup().queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(popup().queryByRole('button', { name: 'Resolve' })).toBeNull();
    expect(popup().getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('gives a writer Post RFI and Reply', () => {
    renderDialog();
    expect(popup().getByRole('button', { name: 'Post RFI' })).toBeInTheDocument();
    expect(popup().getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });

  it('shows Resolve only to the user who posted the RFI', () => {
    userId = 'u-other';
    renderDialog();
    expect(popup().queryByRole('button', { name: 'Resolve' })).toBeNull();
    cleanup();
    userId = 'u-poster';
    renderDialog();
    expect(popup().getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
  });

  it('posts an RFI as the picked unit', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(popup().getByRole('button', { name: 'Post RFI' }));
    const post = popup().getByRole('button', { name: 'Post' });
    expect(post).toBeDisabled();

    await user.click(popup().getByRole('combobox', { name: /Asking as/ }));
    await user.click(screen.getByRole('option', { name: /TF KILO/ }));
    await user.type(popup().getByRole('textbox', { name: 'Question' }), ' Where is the relay? ');
    expect(popup().getByText('21 / 2000')).toBeInTheDocument();
    await user.click(post);

    expect(createMutate).toHaveBeenCalledWith(
      { operationId: 'op-1', data: { participant_id: 'p2', question: 'Where is the relay?' } },
      expect.any(Object),
    );
  });

  it('replies to a thread', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(popup().getByRole('textbox', { name: 'Reply' }), 'Copy that');
    await user.click(popup().getByRole('button', { name: 'Reply' }));
    expect(commentMutate).toHaveBeenCalledWith(
      { operationId: 'op-1', rfiId: 'r1', data: { body: 'Copy that' } },
      expect.any(Object),
    );
  });

  it('resolves an RFI', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(popup().getByRole('button', { name: 'Resolve' }));
    expect(resolveMutate).toHaveBeenCalledWith({ operationId: 'op-1', rfiId: 'r1' }, expect.any(Object));
  });

  it('shows a failed mutation as an alert', async () => {
    resolveMutate.mockImplementation((_vars: unknown, opts: { onError: (e: Error) => void }) => {
      opts.onError(new Error('Only the person who posted an RFI can resolve it'));
    });
    const user = userEvent.setup();
    renderDialog();
    await user.click(popup().getByRole('button', { name: 'Resolve' }));
    expect(popup().getByRole('alert')).toHaveTextContent(/Could not resolve the RFI|Only the person/);
  });

  it('folds resolved RFIs into a collapsed section that opens on click', async () => {
    rfis = [
      rfi({}),
      rfi({
        id: 'r2', question: 'Old question', status: 'resolved', resolved_by: 'Alex Poster',
        resolved_at: '2026-10-30T12:00:00Z', comments: [],
      }),
    ];
    const user = userEvent.setup();
    renderDialog();
    const toggle = popup().getByRole('button', { name: 'Resolved (1)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(popup().queryByText('Old question')).toBeNull();

    await user.click(toggle);
    expect(popup().getByText('Old question')).toBeInTheDocument();
    expect(popup().getByText(/Resolved by Alex Poster on/)).toBeInTheDocument();
    // Read-only: only the one open card carries Reply and Resolve.
    expect(popup().getAllByRole('button', { name: 'Resolve' })).toHaveLength(1);
  });

  it('omits the Resolved section when none are resolved', () => {
    renderDialog();
    expect(popup().queryByRole('button', { name: /^Resolved/ })).toBeNull();
  });

  it('names a removed unit', () => {
    rfis = [rfi({ participant_id: null })];
    renderDialog();
    expect(popup().getByText('Unit removed')).toBeInTheDocument();
  });
});

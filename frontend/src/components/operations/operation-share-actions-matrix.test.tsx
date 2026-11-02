import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { downloadNativeDeck } from '@/components/common/sheet-export/sheet-export';
import { renderWithRoute, screen, waitFor } from '@/test/utils';
import type { Operation, Participant } from '@/types';
import { DECK_INPUT, DECK_PARTICIPANTS, DECK_PHASES, DECK_SITES } from './phase-deck-fixtures';
import { OperationShareActions } from './operation-share-actions';

vi.mock('@/components/common/sheet-export/sheet-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/common/sheet-export/sheet-export')>()),
  downloadNativeDeck: vi.fn(() => Promise.resolve({ ok: true })),
}));

// Closed mock: the libraries the Matrix reads, and nothing else.
vi.mock('@/services', () => ({
  useEquipment: () => ({ data: { equipment: [...DECK_INPUT.equipmentById.values()], total: 3 }, isLoading: false, isError: false }),
  useWaveforms: () => ({ data: { waveforms: DECK_INPUT.waveforms, total: 2 }, isLoading: false, isError: false }),
  usePlatforms: () => ({ data: { platforms: [], total: 0 }, isLoading: false, isError: false }),
  useTransports: () => ({ data: { transports: [], total: 0 }, isLoading: false, isError: false }),
  useServices: () => ({ data: { services: [], total: 0 }, isLoading: false, isError: false }),
}));

const OPERATION = { id: 'op-1', name: 'Night Owl' } as Operation;

const open = vi.fn();
beforeEach(() => {
  open.mockClear();
  vi.mocked(downloadNativeDeck).mockClear();
  vi.stubGlobal('open', open);
  localStorage.clear();
});
afterEach(() => { vi.unstubAllGlobals(); });

const render = (route: string, participants: Participant[] = DECK_PARTICIPANTS) => renderWithRoute(
  <OperationShareActions operation={OPERATION} participants={participants} phases={DECK_PHASES} sites={DECK_SITES} view="matrix" />,
  route,
);

describe('OperationShareActions on the Matrix view', () => {
  it('is the same control as on Web: the share menu, then Print / Save PDF, last in the bar', () => {
    render('/operations/op-1?view=matrix');
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['share this sheet', 'Print / Save PDF']);
  });

  it('offers the same three items in the same order, the .pptx saying what the deck is', async () => {
    const user = userEvent.setup();
    render('/operations/op-1?view=matrix');
    await user.click(screen.getByRole('button', { name: 'share this sheet' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.querySelector('p')?.textContent)).toEqual(['Download .pptx', 'Copy image', 'Download .png']);
    expect(screen.getByText('The phase on screen, a table you can edit')).toBeInTheDocument();
  });

  it('opens the print route in a new tab, with the phase it was on', async () => {
    const user = userEvent.setup();
    render('/operations/op-1?view=matrix&phase=ph2');
    await user.click(screen.getByRole('button', { name: 'Print / Save PDF' }));
    expect(open).toHaveBeenCalledWith('/operations/op-1/matrix/print?phase=ph2', '_blank');
  });

  it('opens it with no phase when All phases is on screen, which Matrix defaults to, unlike Web', async () => {
    const user = userEvent.setup();
    render('/operations/op-1?view=matrix');
    await user.click(screen.getByRole('button', { name: 'Print / Save PDF' }));
    expect(open).toHaveBeenCalledWith('/operations/op-1/matrix/print', '_blank');
  });

  it('is not offered for printing when no one has joined', () => {
    render('/operations/op-1?view=matrix', []);
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeDisabled();
  });

  it('builds the matrix deck for the phase on screen only, as a native table', async () => {
    const user = userEvent.setup();
    render('/operations/op-1?view=matrix&phase=ph1');
    await user.click(screen.getByRole('button', { name: 'share this sheet' }));
    await user.click(screen.getByRole('menuitem', { name: /Download \.pptx/ }));
    await waitFor(() => { expect(downloadNativeDeck).toHaveBeenCalledTimes(1); });
    const [spec] = vi.mocked(downloadNativeDeck).mock.calls[0]!;
    // Not All phases plus every phase: the one phase the user is looking at.
    expect(spec.count).toBe(1);
    expect(spec.stem).toBe('night-owl-matrix');
    const first = await spec.buildSlide(0);
    expect(first.pictures).toEqual([]);
    expect(first.objects?.map((o) => o.kind)).toEqual(['text', 'table']);
  });

  it('says why there is no deck when no one has joined, and builds nothing', async () => {
    const user = userEvent.setup();
    render('/operations/op-1?view=matrix', []);
    await user.click(screen.getByRole('button', { name: 'share this sheet' }));
    await user.click(screen.getByRole('menuitem', { name: /Download \.pptx/ }));
    expect(await screen.findByText('No one has joined yet, so there is nothing to export.')).toBeInTheDocument();
    expect(downloadNativeDeck).not.toHaveBeenCalled();
  });

  it('takes the image from the Matrix\'s own paper, which is not there until the view draws it', async () => {
    const user = userEvent.setup();
    render('/operations/op-1?view=matrix');
    await user.click(screen.getByRole('button', { name: 'share this sheet' }));
    await user.click(screen.getByRole('menuitem', { name: /Download \.png/ }));
    expect(await screen.findByText('The sheet is not ready yet. Try again in a moment.')).toBeInTheDocument();
  });
});

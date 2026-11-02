import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { downloadNativeDeck } from '@/components/common/sheet-export/sheet-export';
import { renderWithRoute, screen, waitFor } from '@/test/utils';
import type { Operation } from '@/types';
import { DECK_INPUT, DECK_PARTICIPANTS, DECK_PHASES, DECK_SITES } from './phase-deck-fixtures';
import { OperationShareActions } from './operation-share-actions';

vi.mock('@/components/common/sheet-export/sheet-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/common/sheet-export/sheet-export')>()),
  downloadNativeDeck: vi.fn(() => Promise.resolve({ ok: true })),
}));

// Closed mock: the libraries the Web view reads, and nothing else.
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

const render = (route: string, phases = DECK_PHASES) => renderWithRoute(
  <OperationShareActions operation={OPERATION} participants={DECK_PARTICIPANTS} phases={phases} sites={DECK_SITES} />,
  route,
);

describe('OperationShareActions', () => {
  it('puts the share menu, then Print / Save PDF, last in the bar', () => {
    render('/operations/op-1?view=web');
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(['share this sheet', 'Print / Save PDF']);
  });

  it('opens the print route in a new tab, with the mode, the unit and the phase it was on', async () => {
    const user = userEvent.setup();
    localStorage.setItem('signal-suite-operation-show', 'focus');
    render('/operations/op-1?view=web&phase=ph2&focus=pb');
    await user.click(screen.getByRole('button', { name: 'Print / Save PDF' }));
    expect(open).toHaveBeenCalledWith('/operations/op-1/print?show=focus&focus=pb&phase=ph2', '_blank');
  });

  it('opens it on the phase the screen defaults to, and All, when nothing is chosen on screen', async () => {
    const user = userEvent.setup();
    render('/operations/op-1?view=web');
    await user.click(screen.getByRole('button', { name: 'Print / Save PDF' }));
    // The page's default is the first phase it was handed, which the fixture deliberately lists out of position order.
    expect(open).toHaveBeenCalledWith('/operations/op-1/print?show=all&phase=ph2', '_blank');
  });

  it('is not offered for printing when the operation has no phases', () => {
    render('/operations/op-1?view=web', []);
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeDisabled();
  });

  it('says the .pptx is editable, and builds the native deck when it is chosen', async () => {
    const user = userEvent.setup();
    localStorage.setItem('signal-suite-operation-show', 'gaps');
    render('/operations/op-1?view=web&phase=ph1');
    await user.click(screen.getByRole('button', { name: 'share this sheet' }));
    expect(screen.getByText('One slide per phase, editable in PowerPoint')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /Download \.pptx/ }));
    await waitFor(() => { expect(downloadNativeDeck).toHaveBeenCalledTimes(1); });
    const [spec] = vi.mocked(downloadNativeDeck).mock.calls[0]!;
    expect(spec.count).toBe(3);
    expect(spec.stem).toBe('night-owl-comms-by-phase');
    // The slides are built from the page's own data, so the first is the first phase by position.
    expect(await spec.buildSlide(0)).toMatchObject({ pictures: [] });
  });
});

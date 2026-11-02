import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DECK_INPUT, DECK_OPERATION, DECK_PARTICIPANTS, DECK_PHASES, DECK_SITES } from '@/components/operations/phase-deck-fixtures';
import { renderWithRoute, screen } from '@/test/utils';
import type { Operation } from '@/types';
import { OperationPrintPage } from './operation-print-page';

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useParams: () => ({ id: 'op-1' }),
}));

vi.mock('@/services', () => ({
  useOperation: () => ({
    data: { operation: { id: 'op-1', name: DECK_OPERATION.name } as Operation, participants: DECK_PARTICIPANTS, phases: DECK_PHASES.slice(0, 1), sites: DECK_SITES },
    isLoading: false,
    isError: false,
  }),
  useEquipment: () => ({ data: { equipment: [...DECK_INPUT.equipmentById.values()], total: 3 }, isLoading: false, isError: false }),
  useWaveforms: () => ({ data: { waveforms: DECK_INPUT.waveforms, total: 2 }, isLoading: false, isError: false }),
  usePlatforms: () => ({ data: { platforms: [], total: 0 }, isLoading: false, isError: false }),
  useTransports: () => ({ data: { transports: [], total: 0 }, isLoading: false, isError: false }),
  useServices: () => ({ data: { services: [], total: 0 }, isLoading: false, isError: false }),
}));

/** The sheet as the page sees it: how wide it was asked to be, and a picture that wants `drawn` pixels. */
const drawn = vi.hoisted(() => ({ width: '100%', height: 0 }));
vi.mock('@/components/operations/phase-deck-sheet', () => ({
  SHEET_PAD_X: 32,
  PhaseSheet: ({ width }: { width: number }) => (
    <div data-testid="sheet" data-width={width}>
      <svg role="img" width={drawn.width} />
    </div>
  ),
}));

/** A ResizeObserver the test can fire, which is what a layout settling is to the page. */
const watchers: (() => void)[] = [];
class FiringObserver {
  constructor(callback: () => void) { watchers.push(callback); }
  observe = vi.fn();
  disconnect = vi.fn();
}
const fire = () => { act(() => { watchers.forEach((w) => { w(); }); }); };

beforeEach(() => {
  watchers.length = 0;
  vi.stubGlobal('ResizeObserver', FiringObserver);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => drawn.height);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const fit = () => document.querySelector<HTMLElement>('[data-print-fit]')!;

describe('a printed page that has to be fitted', () => {
  it('leaves a sheet that fits the paper alone: at the paper\'s width, no scale', () => {
    drawn.width = '100%';
    drawn.height = 738;
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    fire();
    expect(screen.getByTestId('sheet')).toHaveAttribute('data-width', '979');
    expect(fit().style.transform).toBe('');
  });

  it('scales a sheet taller than the page to the page\'s height, so a phase is one page', () => {
    drawn.width = '100%';
    drawn.height = 1476;
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    fire();
    expect(fit().getAttribute('data-print-fit')).toBe('0.5');
    expect(fit().style.transform).toContain('scale(0.5)');
  });

  it('widens the sheet to a picture that needs more than the paper has, and scales it back to the paper, rather than printing a scrollbar', () => {
    drawn.width = '1400';
    drawn.height = 700;
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    fire();
    // The picture asks for 1400 and the sheet adds the paper either side of it.
    expect(screen.getByTestId('sheet')).toHaveAttribute('data-width', '1464');
    expect(Number(fit().getAttribute('data-print-fit'))).toBeCloseTo(979 / 1464, 5);
    // Centred on the page after the scale: the sheet is 979 wide on the paper.
    expect(fit().style.transform).toMatch(/^translateX\(0px\) scale\(0\.668/);
  });

  it('never narrows a sheet it has widened, so a layout that changes with the width cannot flap', () => {
    drawn.width = '1400';
    drawn.height = 700;
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    fire();
    drawn.width = '100%';
    fire();
    expect(screen.getByTestId('sheet')).toHaveAttribute('data-width', '1464');
  });
});

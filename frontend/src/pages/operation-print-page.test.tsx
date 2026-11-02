import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import userEvent from '@testing-library/user-event';

import { DECK_INPUT, DECK_OPERATION, DECK_PARTICIPANTS, DECK_PHASES, DECK_SITES } from '@/components/operations/phase-deck-fixtures';
import { renderWithRoute, screen, waitFor, within } from '@/test/utils';
import type { Operation } from '@/types';
import { OperationPrintPage } from './operation-print-page';

const { mockNavigate, mockParams, query } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockParams: { id: 'op-1' },
  query: { operation: { state: 'ready' }, catalog: { loading: false, error: false } },
}));

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
}));

const OPERATION = { id: 'op-1', name: DECK_OPERATION.name } as Operation;

// Closed mock: the page reads the operation and the five libraries the Web view does, and nothing else.
vi.mock('@/services', () => ({
  useOperation: () => {
    const { state } = query.operation;
    return {
      data: state === 'ready' || state === 'empty'
        ? { operation: OPERATION, participants: DECK_PARTICIPANTS, phases: state === 'empty' ? [] : DECK_PHASES, sites: DECK_SITES }
        : undefined,
      isLoading: state === 'loading',
      isError: state === 'error',
    };
  },
  useEquipment: () => ({ data: { equipment: [...DECK_INPUT.equipmentById.values()], total: 3 }, isLoading: query.catalog.loading, isError: query.catalog.error }),
  useWaveforms: () => ({ data: { waveforms: DECK_INPUT.waveforms, total: 2 }, isLoading: false, isError: false }),
  usePlatforms: () => ({ data: { platforms: [], total: 0 }, isLoading: false, isError: false }),
  useTransports: () => ({ data: { transports: [], total: 0 }, isLoading: false, isError: false }),
  useServices: () => ({ data: { services: [], total: 0 }, isLoading: false, isError: false }),
}));

let printSpy: MockInstance<() => void>;

beforeEach(() => {
  query.operation.state = 'ready';
  query.catalog.loading = false;
  query.catalog.error = false;
  mockNavigate.mockClear();
  printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
});

afterEach(() => {
  printSpy.mockRestore();
  // Only the rules this page and the shell injected: clearing every <style> in the head takes MUI's with it.
  document.head.querySelectorAll('style').forEach((el) => {
    if (el.textContent?.includes('letter landscape') || el.textContent?.includes('data-operation-print')) el.remove();
  });
});

const pages = () => Array.from(document.querySelectorAll<HTMLElement>('[data-operation-print-page]'));
/** The page's title: the sheet's first child. */
const titleOf = (page: HTMLElement) => page.querySelector('[data-sheet-root]')?.firstElementChild?.textContent;

describe('OperationPrintPage', () => {
  it('prints one page per phase, in phase order, each the sheet the deck\'s slide is: the title, then the picture', async () => {
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    await screen.findAllByRole('img');
    expect(pages().map(titleOf)).toEqual(['Night Owl - Staging', 'Night Owl - Infil', 'Night Owl - Exfil']);
    expect(screen.getAllByRole('img', { name: /Who must talk to whom/ })).toHaveLength(3);
    // Key and list, the same as the slide: Staging has two requirements.
    expect(within(pages()[0]!).getAllByTestId('phase-requirement')).toHaveLength(2);
    expect(within(pages()[0]!).getByRole('list', { name: 'Key' })).toBeInTheDocument();
  });

  it('switches between all phases and one phase from chips in the toolbar, which never print', async () => {
    const user = userEvent.setup();
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    await screen.findAllByRole('img');
    const chips = within(screen.getByRole('group', { name: 'Phase' }));
    expect(chips.getAllByRole('button').map((b) => b.textContent)).toEqual(['All phases', 'Staging', 'Infil', 'Exfil']);
    expect(chips.getByRole('button', { name: 'All phases' })).toHaveAttribute('aria-pressed', 'true');
    // Outside the printed root, so the print dialog never shows them.
    expect(document.querySelector('[data-operation-print-root]')?.contains(screen.getByRole('group', { name: 'Phase' }))).toBe(false);

    await user.click(chips.getByRole('button', { name: 'Infil' }));
    expect(pages().map(titleOf)).toEqual(['Night Owl - Infil']);
    expect(pages()[0]!.style.breakAfter).toBe('auto');

    await user.click(chips.getByRole('button', { name: 'All phases' }));
    expect(pages().map(titleOf)).toEqual(['Night Owl - Staging', 'Night Owl - Infil', 'Night Owl - Exfil']);
  });

  it('reads ?only= for the phase to print, and an id it does not have as all of them', async () => {
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print?only=nope');
    await screen.findAllByRole('img');
    expect(pages()).toHaveLength(3);
  });

  it('breaks the page after every phase but the last, so a phase is a page', async () => {
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    await screen.findAllByRole('img');
    expect(pages().map((p) => p.style.breakAfter)).toEqual(['page', 'page', 'auto']);
  });

  it('draws every page in the Show mode the query names, and Gaps says what it found', async () => {
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print?show=gaps&phase=ph1');
    await screen.findAllByRole('img');
    expect(pages().map((p) => within(p).getByTestId('phase-gaps-message').textContent)).toEqual([
      '1 gap in this phase: 1 no link',
      'No gaps - every requirement in this phase is direct',
      '1 gap in this phase: 1 no link',
    ]);
  });

  it('draws All when the query names no mode, or one it does not know, with no controls on it', async () => {
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print?show=sideways');
    await screen.findAllByRole('img');
    expect(screen.queryByTestId('phase-gaps-message')).toBeNull();
    expect(within(pages()[0]!).getAllByTestId('phase-requirement')).toHaveLength(2);
    expect(screen.queryByText('Show:')).toBeNull();
  });

  it('keeps Focus on the unit the query names for every phase, and says so on the page the unit is not in', async () => {
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print?show=focus&focus=pb&phase=ph1');
    await screen.findAllByRole('img', { name: /Who BRAVO must talk to/ });
    expect(pages()).toHaveLength(3);
    expect(within(pages()[0]!).getAllByTestId('phase-requirement')).toHaveLength(1);
    expect(within(pages()[2]!).getByTestId('deck-unit-absent').textContent).toBe('BRAVO is not in this phase');
    expect(titleOf(pages()[2]!)).toBe('Night Owl - Exfil');
  });

  it('injects the landscape Letter page rule into the head, and a print-only rule that drops the on-screen shadow and gap', () => {
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    const injected = Array.from(document.head.querySelectorAll('style')).map((el) => el.textContent ?? '').join('\n');
    expect(injected).toContain('@page { size: letter landscape;');
    expect(injected).toContain('[data-operation-print-page] { box-shadow: none !important; margin: 0 !important; }');
    // Not in an emotion class, where an @page is dropped: a rule of its own in a <style> of its own.
    const own = Array.from(document.head.querySelectorAll('style')).find((el) => el.textContent?.startsWith('@page'));
    expect(own).toBeDefined();
  });

  describe('preview zoom', () => {
    const wrapper = () => document.querySelector<HTMLElement>('[data-preview-zoom]')!;
    const label = () => within(screen.getByRole('group', { name: 'Preview zoom' }));

    it('starts at 100% with the sheets unzoomed', async () => {
      renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
      await screen.findAllByRole('img');
      expect(label().getByText('100%', { selector: 'span' })).toBeInTheDocument();
      expect(wrapper().style.zoom).toBe('1');
    });

    it('zooms in by a quarter, out by a fifth, and the 100% chip resets', async () => {
      const user = userEvent.setup();
      renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
      await screen.findAllByRole('img');
      await user.click(label().getByRole('button', { name: 'Zoom in' }));
      expect(label().getByText('125%')).toBeInTheDocument();
      expect(wrapper().style.zoom).toBe('1.25');
      expect(label().getByRole('button', { name: '100%' })).toHaveAttribute('aria-pressed', 'false');
      await user.click(label().getByRole('button', { name: '100%' }));
      expect(label().getByText('100%', { selector: 'span' })).toBeInTheDocument();
      expect(wrapper().style.zoom).toBe('1');
      await user.click(label().getByRole('button', { name: 'Zoom out' }));
      expect(label().getByText('80%')).toBeInTheDocument();
    });

    it('stops at 50%', async () => {
      const user = userEvent.setup();
      renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
      await screen.findAllByRole('img');
      for (let i = 0; i < 12; i += 1) await user.click(label().getByRole('button', { name: 'Zoom out' }));
      expect(label().getByText('50%')).toBeInTheDocument();
    });

    it('is undone for print by a rule in the injected style, so the paper keeps the sheet\'s own scale', () => {
      renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
      const injected = Array.from(document.head.querySelectorAll('style')).map((el) => el.textContent ?? '').join('\n');
      expect(injected).toContain('@media print');
      expect(injected).toContain('zoom: 1 !important');
    });
  });

  it('goes back to the operation on the phase and unit it was opened from, on the Web view', async () => {
    const user = userEvent.setup();
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print?show=focus&focus=pb&phase=ph2');
    await user.click(screen.getByRole('button', { name: /Back to operation/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/operations/op-1?view=web&phase=ph2&focus=pb');
  });

  it('goes back to the Web view alone when it was opened with no phase or unit', async () => {
    const user = userEvent.setup();
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    await user.click(screen.getByRole('button', { name: /Back to operation/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/operations/op-1?view=web');
  });

  it('holds Print / Save PDF until every picture has laid out, then prints', async () => {
    const user = userEvent.setup();
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    const print = screen.getByRole('button', { name: 'Print / Save PDF' });
    await waitFor(() => { expect(print).toBeEnabled(); });
    await user.click(print);
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('says what is wrong rather than printing nothing: still loading, no operation, no catalog, no phases', () => {
    query.operation.state = 'loading';
    const loading = renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    expect(pages()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeDisabled();
    loading.unmount();

    query.operation.state = 'error';
    const failed = renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    expect(screen.getByText('Could not load this operation.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeDisabled();
    failed.unmount();

    query.operation.state = 'ready';
    query.catalog.error = true;
    const noCatalog = renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    expect(screen.getByText(/Could not load the catalog/)).toBeInTheDocument();
    noCatalog.unmount();

    query.catalog.error = false;
    query.operation.state = 'empty';
    renderWithRoute(<OperationPrintPage />, '/operations/op-1/print');
    expect(screen.getByText('This operation has no phases to print.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeDisabled();
  });
});

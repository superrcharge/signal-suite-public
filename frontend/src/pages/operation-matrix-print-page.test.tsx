import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import userEvent from '@testing-library/user-event';

import { PAGE_H, PAGE_W } from '@/components/operations/matrix-print-paging';
import { DECK_INPUT, DECK_OPERATION, DECK_PARTICIPANTS, DECK_PHASES, DECK_SITES } from '@/components/operations/phase-deck-fixtures';
import { renderWithRoute, screen, within } from '@/test/utils';
import type { Operation } from '@/types';
import { OperationMatrixPrintPage } from './operation-matrix-print-page';
import { PAGE_H as WEB_PAGE_H, PAGE_W as WEB_PAGE_W } from './operation-print-page';

const { mockNavigate, mockParams, query } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockParams: { id: 'op-1' },
  query: { operation: { state: 'ready' }, catalog: { loading: false, error: false }, noOne: false },
}));

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
}));

const OPERATION = { id: 'op-1', name: DECK_OPERATION.name } as Operation;

// Closed mock: the operation and the five libraries the Matrix reads, and nothing else.
vi.mock('@/services', () => ({
  useOperation: () => {
    const { state } = query.operation;
    return {
      data: state === 'ready'
        ? { operation: OPERATION, participants: query.noOne ? [] : DECK_PARTICIPANTS, phases: DECK_PHASES, sites: DECK_SITES }
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
  query.noOne = false;
  mockNavigate.mockClear();
  printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
});

afterEach(() => {
  printSpy.mockRestore();
  document.head.querySelectorAll('style').forEach((el) => {
    if (el.textContent?.includes('letter landscape') || el.textContent?.includes('data-operation-matrix-print')) el.remove();
  });
});

const pages = () => Array.from(document.querySelectorAll<HTMLElement>('[data-operation-matrix-print-page]'));
/** The page's title: the sheet's first child, inside the fitted box. */
const titleOf = (page: HTMLElement) => page.querySelector('[data-print-fit]')?.firstElementChild?.firstElementChild?.textContent;

describe('OperationMatrixPrintPage', () => {
  it('prints the one scope that was on screen, not every phase: All phases when none is named, the title over the grid', () => {
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print');
    expect(pages().map(titleOf)).toEqual(['Night Owl - Matrix - All phases']);
    expect(within(pages()[0]!).getByRole('table', { name: 'Operation interoperability matrix' })).toBeInTheDocument();
    expect(within(pages()[0]!).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Capability', 'ALPHAUSA', 'BRAVOUSA', 'CHARLIEUSA']);
  });

  it('opens on the phase the Matrix was showing (?phase=), with its chip pressed', () => {
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print?phase=ph3');
    expect(pages().map(titleOf)).toEqual(['Night Owl - Matrix - Exfil']);
    // Exfil has no BRAVO.
    expect(within(pages()[0]!).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Capability', 'ALPHAUSA', 'CHARLIEUSA']);
    expect(within(screen.getByRole('group', { name: 'Phase' })).getByRole('button', { name: 'Exfil' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('draws the screen\'s grid collapsed, with no switch on a head to open it', () => {
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print?expand=alpha');
    expect(screen.queryByRole('button', { name: /^(Expand|Collapse) / })).toBeNull();
    // Nothing is expanded either, whatever the query says: one column per organization.
    expect(within(pages()[0]!).getAllByRole('columnheader')).toHaveLength(4);
  });

  it('narrows to one phase with ?only=, and an id it does not have reads as all of them', () => {
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print?only=ph2');
    expect(pages().map(titleOf)).toEqual(['Night Owl - Matrix - Infil']);
  });

  it('prints All phases for an id the operation does not have', () => {
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print?only=nope');
    expect(pages().map(titleOf)).toEqual(['Night Owl - Matrix - All phases']);
  });

  it('switches between All phases and one phase from chips in the toolbar, which never print', async () => {
    const user = userEvent.setup();
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print');
    const chips = within(screen.getByRole('group', { name: 'Phase' }));
    expect(chips.getAllByRole('button').map((b) => b.textContent)).toEqual(['All phases', 'Staging', 'Infil', 'Exfil']);
    expect(chips.getByRole('button', { name: 'All phases' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-operation-matrix-print-root]')?.contains(screen.getByRole('group', { name: 'Phase' }))).toBe(false);

    await user.click(chips.getByRole('button', { name: 'Exfil' }));
    expect(pages().map(titleOf)).toEqual(['Night Owl - Matrix - Exfil']);
    expect(pages()[0]!.style.breakAfter).toBe('auto');

    // All phases is the combined grid, as on the Matrix itself, and wins over a ?phase=.
    await user.click(chips.getByRole('button', { name: 'All phases' }));
    expect(pages().map(titleOf)).toEqual(['Night Owl - Matrix - All phases']);
  });

  it('lets the All phases chip win over the ?phase= it was opened with', async () => {
    const user = userEvent.setup();
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print?phase=ph3');
    await user.click(within(screen.getByRole('group', { name: 'Phase' })).getByRole('button', { name: 'All phases' }));
    expect(pages().map(titleOf)).toEqual(['Night Owl - Matrix - All phases']);
  });

  it('sets the chips in the centre of the toolbar, between Back and Print / Save PDF', () => {
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print');
    const toolbar = screen.getByTestId('print-toolbar');
    expect(toolbar.contains(screen.getByRole('group', { name: 'Phase' }))).toBe(true);
    const row = toolbar.parentElement!;
    expect(getComputedStyle(row).gridTemplateColumns).toBe('1fr auto 1fr');
    expect(getComputedStyle(toolbar).justifySelf).toBe('center');
    expect(Array.from(row.children).map((c) => c.contains(screen.getByRole('button', { name: /Back to operation/ })) || c.contains(screen.getByRole('button', { name: 'Print / Save PDF' })))).toEqual([true, false, true]);
  });

  it('does not break after the last page', () => {
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print');
    expect(pages().map((p) => p.style.breakAfter)).toEqual(['auto']);
  });

  it('injects the landscape Letter page rule and its own print-only rule into the head, and not the Web route\'s', () => {
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print');
    const injected = Array.from(document.head.querySelectorAll('style')).map((el) => el.textContent ?? '').join('\n');
    expect(injected).toContain('@page { size: letter landscape;');
    expect(injected).toContain('[data-operation-matrix-print-page] { box-shadow: none !important; margin: 0 !important; }');
    expect(injected).not.toContain('[data-operation-print-page]');
    expect(Array.from(document.head.querySelectorAll('style')).some((el) => el.textContent?.startsWith('@page'))).toBe(true);
  });

  it('has a page the size of the Web route\'s, which a component cannot import from a page', () => {
    expect([PAGE_W, PAGE_H]).toEqual([WEB_PAGE_W, WEB_PAGE_H]);
  });

  it('goes back to the Matrix on the phase it was opened from', async () => {
    const user = userEvent.setup();
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print?phase=ph2');
    await user.click(screen.getByRole('button', { name: /Back to operation/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/operations/op-1?view=matrix&phase=ph2');
  });

  it('goes back to the Matrix alone when it was opened with no phase', async () => {
    const user = userEvent.setup();
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print');
    await user.click(screen.getByRole('button', { name: /Back to operation/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/operations/op-1?view=matrix');
  });

  it('prints from Print / Save PDF', async () => {
    const user = userEvent.setup();
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print');
    await user.click(screen.getByRole('button', { name: 'Print / Save PDF' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('says what is wrong rather than printing nothing: still loading, no operation, no catalog, no one joined', () => {
    query.operation.state = 'loading';
    const loading = renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print');
    expect(pages()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeDisabled();
    loading.unmount();

    query.operation.state = 'error';
    const failed = renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print');
    expect(screen.getByText('Could not load this operation.')).toBeInTheDocument();
    failed.unmount();

    query.operation.state = 'ready';
    query.catalog.error = true;
    const noCatalog = renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print');
    expect(screen.getByText(/Could not load the catalog/)).toBeInTheDocument();
    noCatalog.unmount();

    query.catalog.error = false;
    query.noOne = true;
    renderWithRoute(<OperationMatrixPrintPage />, '/operations/op-1/matrix/print');
    expect(screen.getByText(/No one has joined this operation yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeDisabled();
  });
});

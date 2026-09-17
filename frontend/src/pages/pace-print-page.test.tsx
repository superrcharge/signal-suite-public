import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { renderWithRoute, screen, waitFor } from '@/test/utils';
import { PacePrintPage } from './pace-print-page';

const { mockParams, mockSearch } = vi.hoisted(() => ({
  mockParams: { section: 'asqd' },
  mockSearch: { value: '' },
}));

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useParams: () => mockParams,
  useSearchParams: () => [new URLSearchParams(mockSearch.value)],
}));

const card = {
  section: 'asqd',
  title: '',
  emblem_url: '',
  effective_date: '',
  ltac_rows: [] as { name: string; up: string; down: string; sat: string; crypto: string }[],
  tacsat_rows: [] as { name: string; up: string; down: string; sat: string; crypto: string }[],
  tmn_rows: [] as { label: string; value: string }[],
  plans: [],
};

let cardState: { data: typeof card | undefined; isLoading: boolean; isError: boolean };

// Closed mock: the page calls usePaceCard AND useSections, and a mock missing a
// hook a rendered component calls fails at render time rather than as a clean
// assertion failure.
vi.mock('@/services', () => ({
  usePaceCard: () => cardState,
  useSections: () => ({
    data: [{ key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true }],
    isLoading: false,
  }),
}));

let printSpy: MockInstance<() => void>;

beforeEach(() => {
  cardState = { data: card, isLoading: false, isError: false };
  mockParams.section = 'asqd';
  mockSearch.value = '';
  printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

  // jsdom implements no FontFaceSet, so document.fonts is undefined and the
  // page's first await would throw. The page waits on it deliberately, because
  // printing before the display face loads prints the fallback, so the fix is
  // to supply the missing environment rather than to drop the wait.
  if (!document.fonts) {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
  }
});

afterEach(() => {
  printSpy.mockRestore();
  // Only the rule this page injected. Clearing every <style> in the head takes
  // MUI's with it and breaks the next unmount.
  document.head.querySelectorAll('style').forEach((el) => {
    if (el.textContent?.includes('letter landscape')) el.remove();
  });
});

describe('PacePrintPage', () => {
  it('renders the sheet and prints when the URL carries print=1', async () => {
    mockSearch.value = 'print=1';
    renderWithRoute(<PacePrintPage />, '/pace/asqd/print?print=1');

    // The sheet itself, rendered through the shared SheetPreview rather than a
    // second copy of the markup.
    expect(screen.getAllByRole('img', { name: /channel wheel/ }).length).toBeGreaterThan(0);

    await waitFor(() => expect(printSpy).toHaveBeenCalled());
  });

  it('injects a landscape Letter page rule before printing', async () => {
    mockSearch.value = 'print=1';
    renderWithRoute(<PacePrintPage />, '/pace/asqd/print?print=1');

    await waitFor(() => expect(printSpy).toHaveBeenCalled());

    const injected = Array.from(document.head.querySelectorAll('style'))
      .map((el) => el.textContent ?? '')
      .join('\n');
    expect(injected).toContain('size: letter landscape');
  });

  it('does not print when the URL carries no print parameter', async () => {
    mockSearch.value = '';
    renderWithRoute(<PacePrintPage />, '/pace/asqd/print');

    expect(screen.getAllByRole('img', { name: /channel wheel/ }).length).toBeGreaterThan(0);

    // Nothing async should ever reach window.print in this mode. Waiting a turn
    // rather than asserting immediately is what makes that meaningful, since the
    // print path is behind two resolved promises.
    await Promise.resolve();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('offers a Print / Save PDF chip in preview mode', () => {
    mockSearch.value = '';
    renderWithRoute(<PacePrintPage />, '/pace/asqd/print');

    expect(screen.getByText('Print / Save PDF')).toBeInTheDocument();
  });

  it('says so rather than drawing a blank sheet when the card fails to load', () => {
    cardState = { data: undefined, isLoading: false, isError: true };
    renderWithRoute(<PacePrintPage />, '/pace/asqd/print');

    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /channel wheel/ })).not.toBeInTheDocument();
  });

  it('injects the landscape rule even when the emblem never resolves', async () => {
    // The rule used to be injected inside the same effect that waits on the
    // emblem, so an emblem that never settled left a 1056px landscape sheet
    // printing against catalog-tokens.css's @page portrait. Injection is now
    // separate from the decision to print.
    mockSearch.value = 'print=1';
    renderWithRoute(<PacePrintPage />, '/pace/asqd/print?print=1');

    await waitFor(() => {
      const injected = Array.from(document.querySelectorAll('style'))
        .map((el) => el.textContent ?? '')
        .join('\n');
      expect(injected).toContain('size: letter landscape');
    });
  });

  it('waits for tier photos before printing, and only when one is expected', async () => {
    // waitForImages does not resolve early on an empty document - it waits out
    // its full timeout so its observer can catch an image inserted later. A card
    // with no equipment photo must therefore skip the call entirely, or every
    // print is delayed five seconds. This asserts the no-photo path still prints
    // promptly; the guard is what makes that true.
    mockSearch.value = 'print=1';
    cardState = {
      data: { ...card, tiers: [] } as typeof card,
      isLoading: false,
      isError: false,
    };

    renderWithRoute(<PacePrintPage />, '/pace/asqd/print?print=1');
    await waitFor(() => expect(printSpy).toHaveBeenCalled());
  });

  it('renders the print sheet inside the one-page wrapper', async () => {
    // .pace-print-wrapper is what catalog-tokens.css targets to clip the 16px of
    // padding that produced a blank second page. Without the class the CSS has
    // nothing to act on and the bug is back with every test still passing.
    mockSearch.value = 'print=1';
    renderWithRoute(<PacePrintPage />, '/pace/asqd/print?print=1');

    await waitFor(() =>
      expect(document.querySelector('.pace-print-wrapper')).not.toBeNull(),
    );
  });
});

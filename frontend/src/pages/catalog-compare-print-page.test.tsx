import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { fireEvent, renderWithRoute, screen, waitFor } from '@/test/utils';
import type { Equipment, EquipmentData, TerminalType } from '@/types';
import { DARK, INK, PRINT_MARGIN_IN } from '@/components/catalog';
import { CatalogComparePrintPage } from './catalog-compare-print-page';

const { mockSearch, mockSetSearchParams, mockNavigate, mockWaitForImages } = vi.hoisted(() => ({
  mockSearch: { value: '' },
  mockSetSearchParams: vi.fn(),
  mockNavigate: vi.fn(),
  mockWaitForImages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useSearchParams: () => [new URLSearchParams(mockSearch.value), mockSetSearchParams],
  useNavigate: () => mockNavigate,
}));

let equipmentState: {
  data: { equipment: Equipment[]; total: number } | undefined;
  isLoading: boolean;
  isError: boolean;
};

// Closed mock, but the print page renders no MainLayout, so it never hits
// scripts/verify.mjs's checkServiceMocks - see that function's rendersLayout
// helper, which only demands the sidebar/header hooks be stubbed for a test
// file whose rendered tree actually includes <MainLayout>. useEquipment
// alone is everything this route calls.
vi.mock('@/services', () => ({
  useEquipment: () => equipmentState,
}));

vi.mock('@/utils', async () => {
  const actual = await vi.importActual('@/utils');
  return { ...actual, waitForImages: mockWaitForImages };
});

function equipment(
  id: string,
  nomenclature: string,
  terminal_type: TerminalType,
  data?: Partial<EquipmentData>,
  photo_url?: string,
): Equipment {
  return {
    id,
    nomenclature,
    terminal_type,
    operational_mode: [],
    data: data as EquipmentData | undefined,
    photo_url,
    created_by: 'test',
    updated_by: 'test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

const PHOTO_URL = 'https://acct.blob.core.windows.net/equipment-photos/s2/p.jpg';
// Long enough that a truncating layout (ellipsis, nowrap) would visibly clip
// it. Print has no hover title to recover a clipped name with, which is the
// whole reason CompareSheet's header cells wrap instead.
const LONG_NAME = 'AN/TSC-190(V)3 TROJAN SPIRIT LITE SATELLITE COMMUNICATIONS TERMINAL SET';

// Nine records, SATCOM and radio mixed, so the selection balances into a
// [5, 4] pair of pages the way balanceColumns(9, 6) does (see
// compare-page-guides.test.ts's worked example). std:orbit is SATCOM-only,
// so a radio column reads `n/a`; s2 is a SATCOM record with no orbit typed
// in, so it reads blank - the two empty-cell kinds this feature exists to
// keep apart.
const catalog: Equipment[] = [
  equipment('s1', 'AN/PSC-5A', 'satcom', { standard_specs: { orbit: 'GEO' } }),
  equipment('s2', LONG_NAME, 'satcom', { standard_specs: {} }, PHOTO_URL),
  equipment('s3', 'AN/TSC-185', 'satcom', { standard_specs: { orbit: 'MEO' } }),
  equipment('r1', 'AN/PRC-117G', 'radio', { standard_specs: { crypto: 'AES-256' } }),
  equipment('r2', 'AN/PRC-152', 'radio', {}),
  equipment('r3', 'AN/VRC-110', 'radio', {}),
  equipment('s4', 'AN/TSC-93', 'satcom', { standard_specs: { orbit: 'GEO' } }),
  equipment('s5', 'AN/MSC-63', 'satcom', { standard_specs: { orbit: 'GEO' } }),
  equipment('r4', 'AN/PRC-158', 'radio', {}),
];

const NINE_IDS = catalog.map(eq => eq.id).join(',');

let printSpy: MockInstance<() => void>;

let rafSpy: MockInstance<(cb: FrameRequestCallback) => number>;

beforeEach(() => {
  equipmentState = { data: { equipment: catalog, total: catalog.length }, isLoading: false, isError: false };
  mockSearch.value = '';
  mockSetSearchParams.mockReset();
  mockNavigate.mockReset();
  mockWaitForImages.mockClear();
  printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

  // jsdom implements requestAnimationFrame, but its callback fires on the
  // next macrotask anyway - the print effect awaits two of these, so the
  // stub here just has to settle promptly rather than actually paint
  // anything, which jsdom cannot do.
  rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    setTimeout(() => { cb(performance.now()); }, 0);
    return 0;
  });

  // jsdom implements no FontFaceSet. The page waits on document.fonts.ready
  // deliberately - printing before the display face loads prints the
  // fallback - so the fix is to supply the missing environment, not drop
  // the wait. Same fixture pace-print-page.test.tsx uses.
  if (!document.fonts) {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
  }
});

afterEach(() => {
  printSpy.mockRestore();
  rafSpy.mockRestore();
  // Only rules this page injected. Clearing every <style> in the head takes
  // MUI's with it and breaks the next unmount.
  document.head.querySelectorAll('style').forEach((el) => {
    if (el.textContent?.includes('letter landscape')) el.remove();
  });
});

function renderAt(search: string) {
  mockSearch.value = search;
  return renderWithRoute(<CatalogComparePrintPage />, `/catalog/compare/print?${search}`);
}

/**
 * `usePrintPagination`'s hidden measuring twin renders a full, unpaginated
 * `CompareSheet` per column chunk purely to measure it - the same content
 * preview mode already shows on screen. It is `aria-hidden="true"`, which
 * `getByRole` already excludes by default; `document.querySelectorAll` and
 * `getByText`/`getByLabelText` do not consult the accessibility tree at all,
 * so an assertion counting elements or expecting one match has to filter the
 * twin out explicitly.
 */
function onScreenOnly<T extends Element>(elements: ArrayLike<T>): T[] {
  return Array.from(elements).filter(el => !el.closest('[aria-hidden="true"]'));
}

describe('CatalogComparePrintPage', () => {
  it('injects the landscape @page rule as soon as print mode is on, even before data is ready', () => {
    equipmentState = { data: undefined, isLoading: true, isError: false };
    renderAt(`print=1&ids=${NINE_IDS}&params=make`);

    const injected = Array.from(document.head.querySelectorAll('style'))
      .map(el => el.textContent ?? '')
      .join('\n');
    expect(injected).toContain('size: letter landscape');
    expect(injected).toContain(`margin: ${PRINT_MARGIN_IN}in`);
  });

  it('removes the injected style on unmount', () => {
    const { unmount } = renderAt(`print=1&ids=${NINE_IDS}&params=make`);
    unmount();

    const injected = Array.from(document.head.querySelectorAll('style'))
      .map(el => el.textContent ?? '')
      .join('\n');
    expect(injected).not.toContain('size: letter landscape');
  });

  it('never calls window.print outside print mode, and offers the preview controls', async () => {
    renderAt(`ids=${NINE_IDS}&params=make`);

    expect(screen.getByRole('button', { name: 'Paper' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeInTheDocument();

    // Nothing async in this mode should ever reach window.print. Waiting a
    // turn is what makes that meaningful, since the print path in print
    // mode is behind two resolved promises.
    await Promise.resolve();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('prints once fonts are ready, and waits for images only when a column has a photo', async () => {
    renderAt('print=1&ids=s2&params=make');

    // jsdom never lays anything out, so `usePrintPagination` never measures
    // and the print effect falls all the way back to MEASURE_TIMEOUT_MS
    // before it prints anyway - see that constant's own doc comment.
    await waitFor(() => expect(printSpy).toHaveBeenCalled(), { timeout: 4000 });
    expect(mockWaitForImages).toHaveBeenCalled();
  });

  it('still prints under StrictMode, whose dev remount cancels the first attempt', async () => {
    // The print effect used to mark itself done before its async chain ran.
    // StrictMode's mount, cleanup, remount then cancelled the only chain
    // while the ref told the remount it had already printed, so in dev the
    // dialog never opened at all. main.tsx renders under StrictMode.
    mockSearch.value = 'print=1&ids=s1&params=make';
    renderWithRoute(
      <StrictMode><CatalogComparePrintPage /></StrictMode>,
      '/catalog/compare/print?print=1&ids=s1&params=make',
    );

    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  it('does not wait for images when no selected column has a photo', async () => {
    renderAt('print=1&ids=s1&params=make');

    await waitFor(() => expect(printSpy).toHaveBeenCalled(), { timeout: 4000 });
    expect(mockWaitForImages).not.toHaveBeenCalled();
  });

  it('says so rather than printing a blank sheet when the catalog fails to load', async () => {
    equipmentState = { data: undefined, isLoading: false, isError: true };
    renderAt(`print=1&ids=${NINE_IDS}&params=make`);

    expect(screen.getByText(/could not load the equipment catalog/i)).toBeInTheDocument();
    await Promise.resolve();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('says so rather than printing a blank sheet when nothing is selected', async () => {
    renderAt('print=1');

    expect(screen.getByText(/nothing to print/i)).toBeInTheDocument();
    expect(screen.getByText('Back to compare')).toBeInTheDocument();
    await Promise.resolve();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('balances nine columns into two pages of five and four, each its own table with a thead', () => {
    renderAt(`ids=${NINE_IDS}&params=make`);

    const tables = onScreenOnly(document.querySelectorAll('table'));
    expect(tables).toHaveLength(2);

    const headerCounts = tables.map((table) => {
      expect(table.querySelector('thead')).not.toBeNull();
      // One th per column plus the "Parameter" corner cell.
      return table.querySelectorAll('thead th').length - 1;
    });
    expect(headerCounts.sort((a, b) => b - a)).toEqual([5, 4]);
  });

  it('does not truncate a long nomenclature in the printed header', () => {
    renderAt(`ids=${NINE_IDS}&params=make`);
    expect(onScreenOnly(screen.getAllByText(LONG_NAME))).toHaveLength(1);
  });

  it('defaults to the paper (INK) scheme', () => {
    renderAt(`ids=${NINE_IDS}&params=make`);
    const root = document.querySelector('[style*="--cmp-bg"]');
    expect(root).not.toBeNull();
    const style = root?.getAttribute('style') ?? '';
    expect(style).toContain('--cmp-bg');
    expect(style).toContain(INK.bg);
  });

  it('switches to the DARK scheme with ?ink=dark, and darkens the print body background', () => {
    renderAt(`print=1&ids=${NINE_IDS}&params=make&ink=dark`);

    const root = document.querySelector('[style*="--cmp-bg"]');
    expect(root?.getAttribute('style') ?? '').toContain(DARK.bg);

    const injected = Array.from(document.head.querySelectorAll('style'))
      .map(el => el.textContent ?? '')
      .join('\n');
    expect(injected).toContain(`background: ${DARK.bg}`);
  });

  it('sets ink=dark on the URL when Dark is clicked', () => {
    renderAt(`ids=${NINE_IDS}&params=make`);

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    expect(mockSetSearchParams).toHaveBeenCalled();
    const [nextParams, opts] = mockSetSearchParams.mock.calls[0] as [URLSearchParams, { replace: boolean }];
    expect(nextParams.get('ink')).toBe('dark');
    expect(opts).toEqual({ replace: true });
  });

  it('draws n/a and blank as two distinct, present empty-cell kinds', () => {
    renderAt(`ids=${NINE_IDS}&params=make,std:orbit`);

    // r1-r4 are radio; std:orbit applies to SATCOM only.
    expect(screen.getAllByLabelText('not applicable').length).toBeGreaterThan(0);
    // s2's standard_specs carries no orbit.
    expect(screen.getAllByLabelText('no value').length).toBeGreaterThan(0);
  });

  describe('Fit to one page', () => {
    it('is off (unpressed) with no fit param, and sets fit=1 when clicked', () => {
      renderAt(`ids=${NINE_IDS}&params=make`);

      const toggle = screen.getByRole('button', { name: 'Fit to one page' });
      expect(toggle).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(toggle);

      expect(mockSetSearchParams).toHaveBeenCalled();
      const [nextParams, opts] = mockSetSearchParams.mock.calls[0] as [URLSearchParams, { replace: boolean }];
      expect(nextParams.get('fit')).toBe('1');
      expect(opts).toEqual({ replace: true });
    });

    it('is pressed with ?fit=1, and clicking removes the param', () => {
      renderAt(`ids=${NINE_IDS}&params=make&fit=1`);

      const toggle = screen.getByRole('button', { name: 'Fit to one page' });
      expect(toggle).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(toggle);

      const [nextParams] = mockSetSearchParams.mock.calls[0] as [URLSearchParams];
      expect(nextParams.has('fit')).toBe(false);
    });

    it('carries fit=1 into the Print / Save PDF URL when it is on', () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      renderAt(`ids=${NINE_IDS}&params=make&fit=1`);

      fireEvent.click(screen.getByRole('button', { name: 'Print / Save PDF' }));

      expect(openSpy).toHaveBeenCalled();
      const [url] = openSpy.mock.calls[0] as [string];
      expect(url).toContain('fit=1');
      openSpy.mockRestore();
    });

    it('does not put fit in the Print / Save PDF URL when it is off', () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      renderAt(`ids=${NINE_IDS}&params=make`);

      fireEvent.click(screen.getByRole('button', { name: 'Print / Save PDF' }));

      const [url] = openSpy.mock.calls[0] as [string];
      expect(url).not.toContain('fit=');
      openSpy.mockRestore();
    });

    // fit is shared URL state with the live page (see FIT_PARAM's own doc
    // comment), so Back to compare has to keep it - unlike `print` and
    // `ink`, which the preview owns alone and which backHref still drops.
    it('keeps fit on the Back to compare navigation', () => {
      renderAt(`ids=${NINE_IDS}&params=make&fit=1`);

      fireEvent.click(screen.getByText('Back to compare'));

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      const [href] = mockNavigate.mock.calls[0] as [string];
      expect(href).toContain('fit=1');
    });
  });
  // The photo well's frame is conditional as of the fix that added this
  // block. Both directions are asserted deliberately: a test that only
  // checked the photo case would pass just as well against an unconditional
  // `border: none`, which is the regression it is here to prevent.
  describe('the photo well frame', () => {
    // Throws rather than asserting, so the caller gets a defined HTMLElement
    // and `noUncheckedIndexedAccess` stays satisfied without a non-null
    // assertion at every use site.
    function wellAt(column: number): HTMLElement {
      const [row] = onScreenOnly(document.querySelectorAll('[data-print-part="photos"]'));
      if (!row) throw new Error('no on-screen photo row was rendered');

      const cell = row.querySelectorAll('td')[column];
      if (!cell) throw new Error(`no photo cell at column ${String(column)}`);

      const well = cell.firstElementChild;
      if (!(well instanceof HTMLElement)) throw new Error('photo cell has no well');
      return well;
    }

    // A full-width well fits a `objectFit: contain` image into `d.photo` of
    // height, so on anything but a perfectly proportioned landscape shot the
    // border boxed two margins of white paper around a stranded picture.
    it('draws no frame around a record that has a photo', () => {
      renderAt('ids=s2&params=make');

      const well = wellAt(0);
      expect(well.querySelector('[aria-label="no photo"]')).toBeNull();
      // jsdom decomposes these two shorthands inconsistently - `none` reads
      // back through `borderStyle`, while `1px solid <color>` leaves the
      // longhands empty and survives only on `border` - so neither property
      // alone can express both cases. The presence of "solid" is the one
      // predicate that holds for both, which is all this needs to assert.
      expect(well.style.border).not.toContain('solid');
    });

    // Where there is no image there are no bounds to state, and a bare NO
    // PHOTO label reads as a gap someone forgot rather than an empty slot.
    it('keeps the frame on a record with no photo', () => {
      renderAt('ids=s2,s1&params=make');

      const withPhoto = wellAt(0);
      const without = wellAt(1);
      expect(withPhoto.style.border).not.toContain('solid');
      expect(without.querySelector('[aria-label="no photo"]')).not.toBeNull();
      expect(without.style.border).toContain('1px solid');
    });
  });
});

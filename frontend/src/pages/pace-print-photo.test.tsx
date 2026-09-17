import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { renderWithRoute, waitFor } from '@/test/utils';
import { PacePrintPage } from './pace-print-page';

const { mockParams, mockSearch, mockApiFetch, emblemState } = vi.hoisted(() => ({
  mockParams: { section: 'asqd' },
  mockSearch: { value: 'print=1' },
  mockApiFetch: vi.fn(),
  emblemState: { ready: true },
}));

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useParams: () => mockParams,
  useSearchParams: () => [new URLSearchParams(mockSearch.value)],
}));

vi.mock('@/auth/api-client', () => ({ apiFetch: mockApiFetch }));

// The emblem hook is mocked here specifically so `ready` can be held false.
// The other print test lets it resolve, which is why it cannot tell whether the
// landscape rule is gated on the emblem or not.
vi.mock('@/components/pace/use-pace-emblem', () => ({
  usePaceEmblem: () => ({ emblemHref: 'data:image/svg+xml,placeholder', ready: emblemState.ready }),
}));

// A raw Azure blob URL, exactly the shape equipment.photo_url stores. The
// container is private, so a browser fetching this directly is refused and draws
// its broken-image glyph. Nothing may put this string in a src.
const RAW_BLOB_URL = 'https://acct.blob.core.windows.net/equipment-photos/eq-1/p.jpg';

const card = {
  section: 'asqd',
  title: '',
  emblem_url: '',
  effective_date: '',
  ltac_rows: [],
  tacsat_rows: [],
  tmn_rows: [],
  plans: [],
  tiers: [
    {
      tier: 'P',
      source: 'equipment',
      equipment_id: 'eq-1',
      equipment_photo_url: RAW_BLOB_URL,
      equipment_nomenclature: 'AN/EXAMPLE-1',
      transport_id: '',
      service_abbrev: '',
      custom_label: '',
      detail: '',
    },
  ],
};

vi.mock('@/services', () => ({
  usePaceCard: () => ({ data: card, isLoading: false, isError: false }),
  useSections: () => ({ data: [{ key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true }], isLoading: false }),
}));

let printSpy: MockInstance<() => void>;

describe('PacePrintPage equipment photo', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob([new Uint8Array([1])], { type: 'image/jpeg' })),
    });
    emblemState.ready = true;
    mockSearch.value = 'print=1';
    printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
    if (!document.fonts) {
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { ready: Promise.resolve() },
      });
    }
  });

  it('never puts the stored blob URL in a src', async () => {
    // The bug: equipment.photo_url is a raw private-container URL and the tile
    // used it as an img src, so the browser's unauthenticated fetch was refused
    // and it drew a broken image. The squadron emblem had exactly this bug in
    // an earlier release and was fixed the same way; this tile was the last place doing it.
    renderWithRoute(<PacePrintPage />, '/pace/asqd/print?print=1');

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    const srcs = Array.from(document.querySelectorAll('img')).map((el) => el.getAttribute('src'));
    expect(srcs).not.toContain(RAW_BLOB_URL);
    expect(document.body.innerHTML).not.toContain(RAW_BLOB_URL);
  });

  it('reads the photo back through the equipment API with the caller token', async () => {
    renderWithRoute(<PacePrintPage />, '/pace/asqd/print?print=1');

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/equipment/eq-1/photo'),
    );
  });

  it('injects the landscape rule even when the emblem never resolves', async () => {
    // catalog-tokens.css declares @page portrait and is imported by this page
    // and by SheetPreview, so the landscape rule wins only by being appended
    // later. It used to be injected inside the effect that waits on the emblem,
    // so an emblem that never settled left a 1056px landscape sheet printing
    // against a portrait page.
    emblemState.ready = false;
    renderWithRoute(<PacePrintPage />, '/pace/asqd/print?print=1');

    await waitFor(() => {
      const injected = Array.from(document.querySelectorAll('style'))
        .map((el) => el.textContent ?? '')
        .join('\n');
      expect(injected).toContain('size: letter landscape');
    });

    // And it must still not have printed, because the emblem has not settled.
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('does not print while a tier photo is still loading', async () => {
    // The ordering, asserted without paying waitForImages' 5s fallback. jsdom
    // never fires load on an img, so the image stays pending for the whole
    // timeout - which is precisely the state this pins: the page must not have
    // printed yet. Before the fix there was no image wait at all and print fired
    // as soon as fonts settled, putting an empty tile on the sheet.
    renderWithRoute(<PacePrintPage />, '/pace/asqd/print?print=1');

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(printSpy).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen, waitFor } from '@/test/utils';
import { SectionPicker } from './SectionPicker';

vi.mock('@/services', () => ({
  useSections: () => ({
    data: [
      { key: 'asqd', label: 'A SQD', color: '#3b8fd6', pace_enabled: true },
      { key: 'bsqd', label: 'B SQD', color: '#4caf50', pace_enabled: true },
    ],
    isLoading: false,
  }),
}));

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('@/auth/api-client', () => ({ apiFetch: apiFetchMock }));

beforeEach(() => {
  apiFetchMock.mockReset();
  // jsdom has no createObjectURL.
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => 'blob:emblem',
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
});

// The emblem path cannot be exercised by hand on a dev machine: the endpoint
// behind it writes to Azure Blob Storage and returns 501 when that is not
// configured, so a local browser only ever sees the no-emblem branch. These
// cover the other one.
describe('SectionPicker', () => {
  it('shows a squadron emblem when that squadron has one', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob()) });

    render(<SectionPicker hrefFor={(k) => `/pace/${k}`} />);

    await waitFor(() => {
      expect(document.querySelectorAll('img').length).toBe(2);
    });
  });

  it('falls back to the squadron colour rather than a placeholder emblem', async () => {
    // A 404 is the normal answer for a squadron that has not uploaded one, so
    // it must not surface as the sheet's SAMPLE EMBLEM placeholder here.
    apiFetchMock.mockResolvedValue({ ok: false, blob: () => Promise.resolve(new Blob()) });

    render(<SectionPicker hrefFor={(k) => `/pace/${k}`} />);

    expect(screen.getByText('A SQD')).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelectorAll('img').length).toBe(0);
    });
  });

  it('lists one tile per card-bearing squadron', () => {
    apiFetchMock.mockResolvedValue({ ok: false, blob: () => Promise.resolve(new Blob()) });

    render(<SectionPicker hrefFor={(k) => `/pace/${k}`} />);

    expect(screen.getByText('A SQD')).toBeInTheDocument();
    expect(screen.getByText('B SQD')).toBeInTheDocument();
  });
});

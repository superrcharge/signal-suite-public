import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';

import { renderWithRoute, screen } from '@/test/utils';
import { CatalogCompatibilityPrintPage } from './catalog-compatibility-print-page';
import type { Platform } from '@/types';

const PLATFORMS: Platform[] = [
  {
    id: 'p1', designation: 'UH-60L', popular_name: 'Black Hawk', category: ['USA', 'OGA'], type: 'aircraft',
    waveform_abbrevs: ['L16'], equipment_ids: [], notes: '',
    created_by: '', updated_by: '', created_at: '', updated_at: '',
  },
];

// Closed mock: the print route mounts no layout, so these three are all it pulls.
vi.mock('@/services', () => ({
  usePlatforms: () => ({ data: { platforms: PLATFORMS, total: PLATFORMS.length }, isLoading: false, isError: false }),
  useEquipment: () => ({ data: { equipment: [], total: 0 }, isLoading: false, isError: false }),
  useWaveforms: () => ({ data: { waveforms: [{ id: 'w1', abbrev: 'L16', name: 'Link 16' }], total: 1 }, isLoading: false, isError: false }),
}));

const navigate = vi.fn();
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: () => navigate,
}));

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderAt(query: string) {
  renderWithRoute(<><CatalogCompatibilityPrintPage /><Search /></>, `/catalog/compatibility/print${query}`);
  return userEvent.setup();
}

const search = () => decodeURIComponent(screen.getByTestId('search').textContent ?? '');

afterEach(() => {
  vi.restoreAllMocks();
  navigate.mockReset();
  document.head.querySelectorAll('style').forEach(s => { if (s.textContent?.includes('@page')) s.remove(); });
});

// The compare preview's Fit to one page, on the matrix: one toggle, the
// shared `fit` param, and the zoom it landed on shown beside it.
describe('CatalogCompatibilityPrintPage Fit to one page', () => {
  it('is off with no param, and turns on by setting fit=1', async () => {
    const user = renderAt('?cols=all');
    const fit = screen.getByRole('button', { name: 'Fit to one page' });
    expect(fit).toHaveAttribute('aria-pressed', 'false');

    await user.click(fit);
    expect(fit).toHaveAttribute('aria-pressed', 'true');
    expect(search()).toContain('fit=1');
    expect(screen.getByText('at 100%')).toBeInTheDocument();
  });

  it('is on with fit=1, and a click removes it', async () => {
    const user = renderAt('?cols=all&fit=1');
    const fit = screen.getByRole('button', { name: 'Fit to one page' });
    expect(fit).toHaveAttribute('aria-pressed', 'true');

    await user.click(fit);
    expect(search()).not.toContain('fit=');
  });

  it('opens the print URL with print=1, keeping fit', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = renderAt('?cols=all&fit=1');
    await user.click(screen.getByRole('button', { name: /^Print/ }));

    expect(open).toHaveBeenCalledWith(expect.stringMatching(/print=1/), '_blank');
    expect(open.mock.calls[0]![0]).toContain('fit=1');
  });

  it('keeps fit on the way back, and drops print', async () => {
    const user = renderAt('?cols=all&fit=1');
    await user.click(screen.getByRole('button', { name: /Back to compatibility/i }));

    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('fit=1'));
    expect(navigate.mock.calls[0]![0]).not.toContain('print=');
  });
});

describe('CatalogCompatibilityPrintPage pages', () => {
  it('previews each page with a caption naming its columns and rows', () => {
    renderAt('?cols=all');
    expect(screen.getByText(/^Page 1 of 1 \(columns 1-1, L16 to L16\)$/)).toBeInTheDocument();
  });

  it('says there is nothing to print when no columns are picked', () => {
    renderAt('');
    expect(screen.getByText(/Nothing to print/)).toBeInTheDocument();
  });

  // Print mode injects the letter landscape @page through document.head -
  // never an emotion sx object, which silently drops it (AGENTS.md).
  it('injects the landscape @page in print mode and draws the pages without the toolbar', () => {
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderAt('?cols=all&print=1');

    const css = [...document.head.querySelectorAll('style')].map(s => s.textContent ?? '').join(' ');
    expect(css).toContain('size: letter landscape');
    expect(css).toContain('margin: 0.25in');
    expect(screen.queryByRole('button', { name: 'Fit to one page' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('table', { name: 'Joint compatibility matrix' }).length).toBeGreaterThan(0);
  });
});

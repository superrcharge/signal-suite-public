import { describe, expect, it, vi } from 'vitest';

import { renderWithRoute, screen, within } from '@/test/utils';
import { PaceIndexPage } from './pace-index-page';

vi.mock('@/services', () => ({
  useSections: () => ({
    data: [
      { key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true },
      { key: 'bsqd', label: 'B SQD', color: '#fff', pace_enabled: true },
      { key: 'esqd', label: 'E SQD', color: '#fff' },
      { key: 'zsqd', label: 'Z SQD', color: '#fff' },
      { key: 'ALERT', label: 'ALERT', color: '#fff' },
    ],
    isLoading: false,
  }),
  useTerminals: () => ({ data: undefined, isLoading: false }),
  useKits: () => ({ data: undefined, isLoading: false }),
  useContracts: () => ({ data: undefined, isLoading: false }),
  useEquipment: vi.fn(),
  useWaveforms: vi.fn(),
  useServices: vi.fn(),
  useLogout: () => ({ mutate: vi.fn() }),
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useContractFiscalYears: () => ({ data: [] }),
  REASSIGN_TO_NONE: '__none__',
}));

const authState = () => ({ canWrite: true, canWriteRadio: true, isAdmin: true, role: 'admin' });
vi.mock('@/contexts', async () => ({
  ...(await vi.importActual('@/contexts')),
  useAuth: () => authState(),
  useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }),
}));
vi.mock('@/contexts/auth-context', async () => ({
  ...(await vi.importActual('@/contexts/auth-context')),
  useAuth: () => authState(),
}));

describe('PaceIndexPage', () => {
  // Scoped to the main landmark: the sidebar lists every section, card-bearing
  // or not, so an unscoped query would match there instead of on the page.
  const renderPage = () => {
    renderWithRoute(<PaceIndexPage />, '/pace');
    return within(screen.getByRole('main'));
  };

  it('lists only the squadrons that produce a card', () => {
    const page = renderPage();
    expect(page.getByText('A SQD')).toBeInTheDocument();
    expect(page.getByText('B SQD')).toBeInTheDocument();
  });

  it('omits sections that exist but have no card', () => {
    const page = renderPage();
    // E SQD, Z SQD and ALERT are sections that do not produce a PACE card.
    expect(page.queryByText('E SQD')).toBeNull();
    expect(page.queryByText('Z SQD')).toBeNull();
    expect(page.queryByText('ALERT')).toBeNull();
  });
});

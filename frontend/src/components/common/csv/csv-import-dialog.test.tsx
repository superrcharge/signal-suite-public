import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@/test/utils';
import { CsvImportDialog } from './csv-import-dialog';

vi.mock('@/auth/api-client', () => ({ apiFetch: vi.fn() }));

vi.mock('@/services', () => ({
  useSections: () => ({ data: [] }),
  useContractFiscalYears: () => ({ data: [] }),
}));

// A viewer, who holds no write gate at all.
vi.mock('@/contexts/auth-context', async () => {
  const actual = await vi.importActual('@/contexts/auth-context');
  return {
    ...actual,
    useAuth: () => ({
      canWrite: false,
      canWriteRadio: false,
      canWritePace: false,
      isAdmin: false,
    }),
  };
});

/**
 * Rendered directly, because the header control will not mount this dialog for
 * a viewer - it opens on the union of the three write gates, so a reader never
 * reaches it. That is exactly why the branch needs a test of its own: it is
 * unreachable through the page, and an empty `<select>` is the silent version
 * of the bug this dialog's gate was added to fix.
 *
 * Unreachable today is not the same as wrong to handle. It becomes reachable
 * the moment a gate is added whose datasets are all export-only.
 */
describe('CsvImportDialog', () => {
  it('says so rather than offering an empty dataset list', () => {
    render(<CsvImportDialog onClose={vi.fn()} />);

    expect(screen.getByText(/cannot import into any dataset/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Dataset' })).not.toBeInTheDocument();
  });

  it('ignores a preselect the role cannot import', () => {
    render(<CsvImportDialog preselect="terminals" onClose={vi.fn()} />);

    expect(screen.queryByRole('combobox', { name: 'Dataset' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose file/i })).toBeDisabled();
  });
});

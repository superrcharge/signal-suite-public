import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '@/test/utils';
import { CsvToolbar } from './csv-toolbar';

const { auth } = vi.hoisted(() => ({
  auth: { current: { canWrite: true, canWriteRadio: true, isAdmin: true, role: 'admin' } },
}));

vi.mock('@/contexts/auth-context', async () => ({
  ...(await vi.importActual('@/contexts/auth-context')),
  useAuth: () => auth.current,
}));

vi.mock('@/contexts', async () => ({
  ...(await vi.importActual('@/contexts')),
  useAuth: () => auth.current,
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/services/csv-service', () => ({
  useCsvImport: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  auth.current = { canWrite: true, canWriteRadio: true, isAdmin: true, role: 'admin' };
});

/**
 * The Settings catalogue is the one place this component is still used, and it
 * had no test - so the Template rule was enforced in the header and unasserted
 * here, which is how the two surfaces would have drifted.
 */
describe('CsvToolbar role gating', () => {
  it('offers a viewer Export and Template, but not Import', () => {
    auth.current = { canWrite: false, canWriteRadio: false, isAdmin: false, role: 'viewer' };
    render(<CsvToolbar resource="terminals" />);

    // Template is a header row the backend serves to anyone; Import writes.
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByText('Template')).toBeInTheDocument();
    expect(screen.queryByText('Import')).not.toBeInTheDocument();
  });

  it('offers an admin all three', () => {
    render(<CsvToolbar resource="terminals" />);

    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByText('Template')).toBeInTheDocument();
    expect(screen.getByText('Import')).toBeInTheDocument();
  });
});

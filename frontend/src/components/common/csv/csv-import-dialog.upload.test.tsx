import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '@/auth/api-client';
import { fireEvent, render, screen } from '@/test/utils';
import { CsvImportDialog } from './csv-import-dialog';

// Only the network is mocked. useCsvImport and postCsvImport run for real, so
// these tests cover the whole path from the file picker to what the user sees,
// which is the path that was broken with every unit around it green.
vi.mock('@/auth/api-client', () => ({ apiFetch: vi.fn() }));

vi.mock('@/services', () => ({
  useSections: () => ({ data: [] }),
  useContractFiscalYears: () => ({ data: [] }),
  useOperations: () => ({ data: undefined, isLoading: false, isError: false }),
}));

// A planner-shaped writer: holds the PACE gate, which Platforms sits behind.
vi.mock('@/contexts/auth-context', async () => {
  const actual = await vi.importActual('@/contexts/auth-context');
  return {
    ...actual,
    useAuth: () => ({
      canWrite: false,
      canWriteRadio: false,
      canWritePace: true,
      isAdmin: false,
    }),
  };
});

const fetchMock = vi.mocked(apiFetch);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function upload() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('no file input');
  const file = new File(['designation\nF-15C\n'], 'platforms.csv', { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => fetchMock.mockReset());

describe('CsvImportDialog upload', () => {
  it('posts to the platforms import route', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(207, { success: true, data: { imported: 1, errors: [], message: 'Imported 1 platform.' } }),
    );
    render(<CsvImportDialog preselect="platforms" onClose={vi.fn()} />);

    upload();

    expect(await screen.findByText('Imported 1 platform.')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/platforms/import');
  });

  it('posts to the organizations import route', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(207, { success: true, data: { imported: 1, errors: [], message: 'Imported 1 organization.' } }),
    );
    render(<CsvImportDialog preselect="organizations" onClose={vi.fn()} />);

    upload();

    expect(await screen.findByText('Imported 1 organization.')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/organizations/import');
  });

  it('lists every row when the whole file was rejected, instead of a failure toast', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        success: true,
        data: {
          imported: 0,
          errors: [{ row: 10, name: 'F-15C', errors: ['duplicate - designation already exists'] }],
          message: 'Imported 0 platforms, 1 row skipped.',
        },
      }),
    );
    render(<CsvImportDialog preselect="platforms" onClose={vi.fn()} />);

    upload();

    expect(await screen.findByText('Imported 0 of 1 row')).toBeInTheDocument();
    expect(screen.getByText('duplicate - designation already exists')).toBeInTheDocument();
    expect(screen.queryByText(/import failed/i)).not.toBeInTheDocument();
  });

  it('says a role refusal is about the role', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, {
        success: false,
        error: { code: 'AUTH_FORBIDDEN', message: 'insufficient permissions' },
      }),
    );
    render(<CsvImportDialog preselect="platforms" onClose={vi.fn()} />);

    upload();

    expect(await screen.findByText(/your role cannot import this dataset/i)).toBeInTheDocument();
  });

  it("shows the server's reason for a file it refused outright", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        success: false,
        error: { code: 'PLATFORM_IMPORT_HAS_ID', message: 'csv has an id column - remove it to import' },
      }),
    );
    render(<CsvImportDialog preselect="platforms" onClose={vi.fn()} />);

    upload();

    expect(await screen.findByText('csv has an id column - remove it to import')).toBeInTheDocument();
  });
});

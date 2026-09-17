import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '@/test/utils';
import { CsvDialog } from './csv-dialog';

const { mockApiFetch } = vi.hoisted(() => ({ mockApiFetch: vi.fn() }));
vi.mock('@/auth/api-client', () => ({ apiFetch: mockApiFetch }));

vi.mock('@/services', () => ({
  useSections: () => ({
    data: [
      { key: 'asqd', label: 'A SQD', color: '#fff' },
      { key: 'bsqd', label: 'B SQD', color: '#000' },
    ],
  }),
  useContractFiscalYears: () => ({ data: ['FY26', 'FY27'] }),
}));

function csvResponse() {
  return {
    ok: true,
    blob: () => Promise.resolve(new Blob(['a\n'], { type: 'text/csv' })),
    headers: { get: () => 'attachment; filename="server-chosen.csv"' },
  };
}

function requestedUrl(): URL {
  const { calls } = mockApiFetch.mock;
  const [href] = calls[calls.length - 1] as [string];
  return new URL(href, 'https://example.test');
}

function columnsSent(): string[] {
  return (requestedUrl().searchParams.get('columns') ?? '').split(',').filter(Boolean);
}

describe('CsvDialog', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(csvResponse());
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('sends every column explicitly when all are selected', async () => {
    // The regression that let the contracts bug ship. "Everything is ticked"
    // used to mean "send no columns param", and the backend then fell back to
    // its own list - which was not the same list.
    const user = userEvent.setup();
    render(<CsvDialog resource="terminals" mode="export" onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /download csv/i }));

    const sent = columnsSent();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0]).toBe('id');
    expect(sent).toContain('pop_pin');
  });

  it('sends the remaining columns when one is unticked', async () => {
    const user = userEvent.setup();
    render(<CsvDialog resource="terminals" mode="export" onClose={vi.fn()} />);

    const before = (await screen.findAllByRole('checkbox')).length;
    await user.click(screen.getByLabelText('Notes'));
    await user.click(screen.getByRole('button', { name: /download csv/i }));

    expect(columnsSent()).not.toContain('notes');
    expect(before).toBeGreaterThan(0);
  });

  it('drops a fully-selected facet but never the columns', async () => {
    const user = userEvent.setup();
    render(<CsvDialog resource="terminals" mode="export" onClose={vi.fn()} />);

    // Everything selected: the facet is genuinely "no filter", so it is omitted.
    await user.click(screen.getByRole('button', { name: /download csv/i }));
    expect(requestedUrl().searchParams.get('sections')).toBeNull();
    expect(requestedUrl().searchParams.get('columns')).not.toBeNull();

    // Narrow it and it appears.
    await user.click(screen.getByLabelText('A SQD'));
    await user.click(screen.getByRole('button', { name: /download csv/i }));
    expect(requestedUrl().searchParams.get('sections')).toBe('bsqd');
  });

  it('renders no facets for a flat library and still exports', async () => {
    const user = userEvent.setup();
    render(<CsvDialog resource="waveforms" mode="export" onClose={vi.fn()} />);

    expect(screen.queryByText('Sections')).not.toBeInTheDocument();
    expect(screen.queryByText('Statuses')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /download csv/i }));
    expect(columnsSent()).toContain('abbrev');
  });

  it('offers only importable columns in template mode, and says what it dropped', () => {
    render(<CsvDialog resource="terminals" mode="template" onClose={vi.fn()} />);

    // Server-owned columns are not something a person can fill in.
    expect(screen.queryByLabelText('Updated At')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Terminal Name/)).toBeInTheDocument();
    expect(screen.getByText(/set by the server and cannot be imported/i)).toBeInTheDocument();
  });

  it('keeps a required column checked and locked', () => {
    render(<CsvDialog resource="terminals" mode="template" onClose={vi.fn()} />);

    const nameBox = screen.getByLabelText(/Terminal Name/).closest('label')?.querySelector('input');
    expect(nameBox).toBeChecked();
    expect(nameBox).toBeDisabled();
  });

  it('hits the template endpoint in template mode', async () => {
    const user = userEvent.setup();
    render(<CsvDialog resource="terminals" mode="template" onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /download template/i }));
    expect(requestedUrl().pathname).toBe('/api/v1/terminals/import/template');
    expect(columnsSent()).toContain('name');
  });

  it('substitutes the squadron for a section-scoped domain', async () => {
    const user = userEvent.setup();
    render(<CsvDialog resource="nets" mode="export" section="asqd" onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /download csv/i }));
    expect(requestedUrl().pathname).toBe('/api/v1/export/nets/asqd');
  });

  it('offers no template toggle for an export-only domain', () => {
    render(<CsvDialog resource="pace-channels" mode="export" section="asqd" onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Template' })).not.toBeInTheDocument();
  });

  // Ticking a dataset opens it. With one dataset selected `expanded` already
  // did this; from the second onward nothing opened until the chevron was
  // found - and Nets and PACE keep their squadron dropdown inside that panel,
  // so the dialog demanded a squadron while hiding the control for choosing
  // one.
  it('expands a dataset when it is ticked, with no chevron click', async () => {
    const user = userEvent.setup();
    render(<CsvDialog preselect="terminals" mode="export" onClose={vi.fn()} />);

    // Terminals is the only one selected, so its panel is open and Nets is not.
    expect(screen.queryAllByText('Squadron')).toHaveLength(0);

    await user.click(screen.getByRole('checkbox', { name: /^nets$/i }));

    expect(screen.getAllByText('Squadron').length).toBeGreaterThan(0);
  });

  it('surfaces the server message and stays open on failure', async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'unknown export column "nope"' } }),
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CsvDialog resource="waveforms" mode="export" onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /download csv/i }));

    expect(await screen.findByText(/unknown export column/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  // A report of "Download failed. Please try again." could not be narrowed at
  // all: every error path in the export handlers returns a JSON error message,
  // so that string meant the response was not an API error - and the status
  // that would have said which was discarded.
  it('names the status when the body is not an API error', async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new Error('not json')),
    });
    const user = userEvent.setup();
    render(<CsvDialog resource="waveforms" mode="export" onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /download csv/i }));

    expect(await screen.findByText(/HTTP 502/)).toBeInTheDocument();
  });

  it('surfaces a thrown fetch or token error rather than erasing it', async () => {
    mockApiFetch.mockRejectedValue(new Error('interaction_required'));
    const user = userEvent.setup();
    render(<CsvDialog resource="waveforms" mode="export" onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /download csv/i }));

    expect(await screen.findByText(/interaction_required/)).toBeInTheDocument();
  });
});

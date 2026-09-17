import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor } from '@/test/utils';
import { CsvDialog } from './csv-dialog';

const { mockApiFetch } = vi.hoisted(() => ({ mockApiFetch: vi.fn() }));
vi.mock('@/auth/api-client', () => ({ apiFetch: mockApiFetch }));

// asqd runs a PACE card; zsqd deliberately does not, which is what separates the
// Nets squadron list from the PACE one.
vi.mock('@/services', () => ({
  useSections: () => ({
    data: [
      { key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true },
      { key: 'zsqd', label: 'Z SQD', color: '#000' },
    ],
  }),
  useContractFiscalYears: () => ({ data: ['FY26'] }),
}));

function csvResponse() {
  return {
    ok: true,
    blob: () => Promise.resolve(new Blob(['a\n'], { type: 'text/csv' })),
    headers: { get: () => null },
  };
}

function lastCall(): [string, RequestInit | undefined] {
  const { calls } = mockApiFetch.mock;
  return calls[calls.length - 1] as [string, RequestInit | undefined];
}

function postedDatasets(): { resource: string; section?: string }[] {
  const [, init] = lastCall();
  const body = typeof init?.body === 'string' ? init.body : '';
  return (JSON.parse(body) as { datasets: { resource: string; section?: string }[] }).datasets;
}

const download = () => screen.getByRole('button', { name: /download/i });

describe('CsvDialog, multi-dataset', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(csvResponse());
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('offers every dataset, and nothing is selected without a preselect', () => {
    render(<CsvDialog mode="export" onClose={vi.fn()} />);

    for (const label of [
      'Terminals',
      'Kits',
      'Contracts',
      'Equipment Catalog',
      'Waveform Library',
      'Services Library',
      'Transport Library',
      'Nets',
      'PACE Channels',
    ]) {
      expect(screen.getByLabelText(label)).not.toBeChecked();
    }
    expect(screen.getByText('Select at least one dataset.')).toBeInTheDocument();
    expect(download()).toBeDisabled();
  });

  it('preselects the route dataset and expands it, since it is the only one', () => {
    render(<CsvDialog mode="export" preselect="terminals" onClose={vi.fn()} />);

    expect(screen.getByLabelText('Terminals')).toBeChecked();
    // Expanded means its own columns are on screen. No useEffect does this - it
    // is derived from "exactly one dataset is selected".
    expect(screen.getByLabelText(/Terminal Name/)).toBeInTheDocument();
  });

  // The whole point of the split: one dataset must keep producing the plain GET
  // it always produced, never a zip.
  it('sends one dataset as a plain GET', async () => {
    const user = userEvent.setup();
    render(<CsvDialog mode="export" preselect="terminals" onClose={vi.fn()} />);

    await user.click(download());

    const [url, init] = lastCall();
    expect(url).toContain('/api/v1/export/terminals');
    expect(init).toBeUndefined();
  });

  it('posts a bundle once a second dataset is ticked', async () => {
    const user = userEvent.setup();
    render(<CsvDialog mode="export" preselect="terminals" onClose={vi.fn()} />);

    await user.click(screen.getByLabelText('Kits'));
    expect(screen.getByRole('button', { name: /download zip \(2\)/i })).toBeEnabled();

    await user.click(download());

    const [url, init] = lastCall();
    expect(url).toBe('/api/v1/export/bundle');
    expect(init?.method).toBe('POST');
    expect(postedDatasets().map((d) => d.resource)).toEqual(['terminals', 'kits']);
  });

  it('opens the dataset just ticked and closes the one before it', async () => {
    const user = userEvent.setup();
    render(<CsvDialog mode="export" preselect="terminals" onClose={vi.fn()} />);

    expect(screen.getByLabelText(/Terminal Name/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Kits'));

    // Ticking a dataset opens it: its squadron dropdown and column list are
    // what the dialog then asks the user to fill in, and requiring the chevron
    // hid them. Nine expanded lists at once is still unreadable, so exactly one
    // stays open - the one just clicked. waitFor because Collapse unmounts its
    // children when the transition ends, not on the click.
    expect(screen.getByLabelText(/Kit Name/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByLabelText(/Terminal Name/)).not.toBeInTheDocument(),
    );
  });

  it('collapses an open panel from its chevron', async () => {
    const user = userEvent.setup();
    render(<CsvDialog mode="export" preselect="terminals" onClose={vi.fn()} />);
    await user.click(screen.getByLabelText('Kits'));

    // The chevron is no longer how a panel is opened, but it is still how one
    // is shut, so it keeps its coverage.
    await user.click(screen.getByRole('button', { name: /hide kits columns/i }));

    await waitFor(() =>
      expect(screen.queryByLabelText(/Kit Name/)).not.toBeInTheDocument(),
    );
  });

  it('selects and deselects every dataset', async () => {
    const user = userEvent.setup();
    render(<CsvDialog mode="export" onClose={vi.fn()} />);

    await user.click(screen.getByLabelText('Select all'));
    expect(screen.getByLabelText('PACE Channels')).toBeChecked();
    expect(screen.getByLabelText('Terminals')).toBeChecked();

    await user.click(screen.getByLabelText('Select all'));
    expect(screen.getByLabelText('PACE Channels')).not.toBeChecked();
  });

  it('refuses to submit a section-scoped dataset with no squadron', async () => {
    const user = userEvent.setup();
    render(<CsvDialog mode="export" onClose={vi.fn()} />);

    await user.click(screen.getByLabelText('Nets'));

    // A URL still carrying ":section" would 404, so this is caught here where
    // the message can name the dataset.
    expect(screen.getByText('Pick a squadron for Nets.')).toBeInTheDocument();
    expect(download()).toBeDisabled();
  });

  it('carries the route squadron onto a section-scoped preselect', async () => {
    const user = userEvent.setup();
    render(<CsvDialog mode="export" preselect="nets" section="asqd" onClose={vi.fn()} />);

    expect(screen.queryByText(/Pick a squadron/)).not.toBeInTheDocument();
    await user.click(download());
    expect(lastCall()[0]).toContain('/api/v1/export/nets/asqd');
  });

  it('refuses a squadron the dataset does not accept', () => {
    // Z SQD is a section but runs no PACE card. Arriving from /pace/zsqd - or
    // from a squadron whose card was switched off in Settings after the page
    // loaded - must not export an empty file and call it a download.
    render(<CsvDialog mode="export" preselect="pace-channels" section="zsqd" onClose={vi.fn()} />);

    expect(screen.getByText('Pick a squadron for PACE Channels.')).toBeInTheDocument();
    expect(download()).toBeDisabled();
  });

  it('accepts the same squadron for Nets, which takes any section', async () => {
    const user = userEvent.setup();
    render(<CsvDialog mode="export" preselect="nets" section="zsqd" onClose={vi.fn()} />);

    expect(screen.queryByText(/Pick a squadron/)).not.toBeInTheDocument();
    await user.click(download());
    expect(lastCall()[0]).toContain('/api/v1/export/nets/zsqd');
  });

  it('offers every section as a Nets squadron', async () => {
    const user = userEvent.setup();
    render(<CsvDialog mode="export" preselect="nets" onClose={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    // radionet only checks that the section exists, so any of them is valid.
    expect(screen.getByRole('option', { name: 'Z SQD' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'A SQD' })).toBeInTheDocument();
  });

  it('offers only PACE squadrons for PACE Channels', async () => {
    const user = userEvent.setup();
    render(<CsvDialog mode="export" preselect="pace-channels" onClose={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    // Z SQD runs no PACE card, so its export would be empty. Offering it would
    // be offering a download that cannot succeed - which is why there are two
    // squadron lists rather than one.
    expect(screen.queryByRole('option', { name: 'Z SQD' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'A SQD' })).toBeInTheDocument();
  });

  it('disables the export-only datasets in template mode', async () => {
    const user = userEvent.setup();
    render(<CsvDialog mode="export" preselect="contracts" onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Template' }));

    expect(screen.getByLabelText(/Contracts/)).toBeDisabled();
    expect(screen.getByLabelText(/PACE Channels/)).toBeDisabled();
    expect(screen.getByLabelText('Terminals')).toBeEnabled();
    // Contracts was ticked for export and has no template, so nothing is left
    // to download rather than a request the backend would 400.
    expect(download()).toBeDisabled();
  });

  it('names the template bundle for templates', async () => {
    const user = userEvent.setup();
    render(<CsvDialog mode="template" preselect="terminals" onClose={vi.fn()} />);

    await user.click(screen.getByLabelText('Kits'));
    await user.click(download());

    expect(lastCall()[0]).toBe('/api/v1/template/bundle');
  });
});

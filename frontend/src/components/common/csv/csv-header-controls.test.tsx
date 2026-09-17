import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { renderWithRoute, screen, within } from '@/test/utils';
import { CsvHeaderControls } from './csv-header-controls';

vi.mock('@/auth/api-client', () => ({ apiFetch: vi.fn() }));

vi.mock('@/services', () => ({
  useSections: () => ({
    data: [
      { key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true },
      { key: 'zsqd', label: 'Z SQD', color: '#000' },
    ],
  }),
  useContractFiscalYears: () => ({ data: ['FY26'] }),
}));

/**
 * Mutable, and it has to be: the Import dialog now filters its dataset list by
 * role, so a fixed all-permissive mock would make the one thing worth asserting
 * unobservable. It used to be exactly that, and it omitted `canWritePace`
 * entirely - which is part of why a planner being offered five datasets the
 * server refuses could not surface here.
 */
const ROLES = {
  admin: { canWrite: true, canWriteRadio: true, canWritePace: true, isAdmin: true },
  rto: { canWrite: false, canWriteRadio: true, canWritePace: true, isAdmin: false },
  planner: { canWrite: false, canWriteRadio: false, canWritePace: true, isAdmin: false },
  viewer: { canWrite: false, canWriteRadio: false, canWritePace: false, isAdmin: false },
};

let auth: (typeof ROLES)[keyof typeof ROLES] = ROLES.admin;

vi.mock('@/contexts/auth-context', async () => {
  const actual = await vi.importActual('@/contexts/auth-context');
  return { ...actual, useAuth: () => auth };
});

beforeEach(() => {
  auth = ROLES.admin;
});

const renderAt = (route: string) => renderWithRoute(<CsvHeaderControls />, route);

/** The dataset names the Import select is currently offering. */
async function importOptions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: 'Dataset' }));
  const names = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
  await user.keyboard('{Escape}');
  return names;
}

/**
 * Export, Template and Import are menu items now, not buttons, so reaching one
 * takes two clicks. The trigger is an icon at every width and is named only by
 * its `aria-label`; each item's accessible name carries its caption line too,
 * hence the regex rather than an exact string.
 */
async function pick(user: ReturnType<typeof userEvent.setup>, item: 'Export' | 'Template' | 'Import') {
  await user.click(screen.getByRole('button', { name: 'import and export' }));
  await user.click(screen.getByRole('menuitem', { name: new RegExp(`^${item}`) }));
}

describe('CsvHeaderControls', () => {
  it('opens the export dialog with the route dataset ticked', async () => {
    const user = userEvent.setup();
    renderAt('/kits');

    await pick(user, 'Export');

    expect(screen.getByLabelText('Kits')).toBeChecked();
    // The route contributes a pre-tick and nothing else - the other eight are
    // still on offer, which is what makes this control identical everywhere.
    expect(screen.getByLabelText('Transport Library')).not.toBeChecked();
  });

  // This used to read ?type=waveforms off the catalog tab. That tab is retired;
  // the Comms Library is the page showing the waveform table now, and ?lib= is
  // what the pre-tick reads.
  it('reads the open library, so Waveforms is reachable from the page showing it', async () => {
    const user = userEvent.setup();
    renderAt('/catalog/comms-library');

    await pick(user, 'Export');

    expect(screen.getByLabelText('Waveform Library')).toBeChecked();
    expect(screen.getByLabelText('Equipment Catalog')).not.toBeChecked();
  });

  it('ticks nothing on a route that is not about a dataset', async () => {
    const user = userEvent.setup();
    renderAt('/settings');

    await pick(user, 'Export');
    expect(screen.getByText('Select at least one dataset.')).toBeInTheDocument();
  });

  it('carries the squadron from a per-squadron route', async () => {
    const user = userEvent.setup();
    renderAt('/pace/asqd');

    await pick(user, 'Export');

    expect(screen.getByLabelText('PACE Channels')).toBeChecked();
    expect(screen.queryByText(/Pick a squadron/)).not.toBeInTheDocument();
  });

  it('opens the template dialog in template mode', async () => {
    const user = userEvent.setup();
    renderAt('/terminals');

    await pick(user, 'Template');
    expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument();
  });

  it('opens a single-dataset import dialog', async () => {
    const user = userEvent.setup();
    renderAt('/terminals');

    await pick(user, 'Import');

    // One file, one header row, one table - so this is a select, not a
    // checklist, and the copy says why.
    expect(screen.getByText(/One file loads into one dataset/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Dataset' })).toHaveTextContent('Terminals');
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('will not import until a squadron is chosen for a per-squadron dataset', async () => {
    const user = userEvent.setup();
    renderAt('/nets');

    await pick(user, 'Import');

    // /nets with no squadron: the dataset is known, the destination is not.
    expect(screen.getByText(/Rows import into the squadron you pick here/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose file/i })).toBeDisabled();

    await user.click(screen.getByRole('combobox', { name: 'Squadron' }));
    await user.click(screen.getByRole('option', { name: 'A SQD' }));
    expect(screen.getByRole('button', { name: /choose file/i })).toBeEnabled();
  });

  // The earlier bug. The header control opens on any write gate at all, so the
  // dialog is the only thing standing between a planner and five datasets the
  // server refuses. It used to filter on `importPath` alone.
  describe('the Import dialog offers only what the role may write', () => {
    it('gives a planner the PACE datasets and nothing else', async () => {
      auth = ROLES.planner;
      const user = userEvent.setup();
      renderAt('/pace/asqd');

      await pick(user, 'Import');

      expect(await importOptions(user)).toEqual([
        'Transport Library',
        'Platform Library',
        'Nets',
      ]);
    });

    it('gives an rto the radio datasets and nothing else', async () => {
      auth = ROLES.rto;
      const user = userEvent.setup();
      renderAt('/catalog');

      await pick(user, 'Import');

      const names = await importOptions(user);
      expect(names).toContain('Equipment Catalog');
      expect(names).toContain('Waveform Library');
      // The three the issue names, each of which answers 403 for an rto.
      expect(names).not.toContain('Terminals');
      expect(names).not.toContain('Kits');
      expect(names).not.toContain('Services Library');
    });

    it('still gives an admin every importable dataset', async () => {
      const user = userEvent.setup();
      renderAt('/terminals');

      await pick(user, 'Import');

      // The other direction, and the one that keeps the gate from being a
      // blanket hide: an admin loses nothing. One per gate, so a flag wired to
      // the wrong constant shows up here rather than only in the role cases.
      const names = await importOptions(user);
      expect(names).toEqual(
        expect.arrayContaining([
          'Terminals',
          'Kits',
          'Services Library',
          'Equipment Catalog',
          'Waveform Library',
          'Transport Library',
          'Platform Library',
          'Nets',
        ]),
      );
    });
  });

  // A route pre-ticks a dataset, and a route is not a statement about the
  // reader's role. Without the same gate on the preselect, one dataset would
  // still slip past on the page it belongs to.
  it('does not preselect a dataset the role cannot import', async () => {
    auth = ROLES.planner;
    const user = userEvent.setup();
    renderAt('/terminals');

    await pick(user, 'Import');

    // /terminals pre-ticks Terminals for an admin (asserted above). A planner
    // gets no pre-tick at all, because the gate applies to the preselect too.
    expect(screen.getByRole('combobox', { name: 'Dataset' })).not.toHaveTextContent('Terminals');
    expect(await importOptions(user)).not.toContain('Terminals');
  });

  it('closes a dialog without leaving the other mounted', async () => {
    const user = userEvent.setup();
    renderAt('/terminals');

    await pick(user, 'Import');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});

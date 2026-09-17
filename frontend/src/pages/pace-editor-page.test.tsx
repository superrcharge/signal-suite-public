import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';

import { renderWithRoute, screen, within } from '@/test/utils';
import { PaceEditorPage } from './pace-editor-page';
import type { SavePaceCardRequest } from '@/types';

const { mockParams } = vi.hoisted(() => ({ mockParams: { section: 'asqd' } }));

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useParams: () => mockParams,
  useNavigate: () => vi.fn(),
}));

const card = {
  section: 'asqd',
  title: 'EXERCISE ONE',
  effective_date: '2026-08-20',
  // Present and empty, matching PaceCard. Without it the inferred fixture type
  // has no emblem_url, so a test that spreads one in fails tsc while vitest
  // passes - vitest does not typecheck, which is why the gap is easy to miss.
  emblem_url: '',
  plans: [
    {
      id: 'p1', radio_type: 'jem', label: 'JEM', channel_count: 16,
      notes: '', updated_by: '', updated_at: '',
      channels: [{
        channel_number: 4,
        net: { id: 'jem1', name: 'JEM NET', net_id: 'J01', radio_type: 'jem', waveform_abbrev: '' },
        tx_freq: '30.5', rx_freq: '30.5', freq_unit: 'MHz',
        label_override: '', is_overridden: false,
      }],
    },
    {
      id: 'p2', radio_type: 'mpu5', label: 'MPU5', channel_count: 16,
      notes: '', updated_by: '', updated_at: '', channels: [],
    },
  ],
};

const nets = [
  { id: 'jem1', name: 'JEM NET', net_id: 'J01', radio_type: 'jem', tx_freq: '30.5', rx_freq: '30.5', freq_unit: 'MHz', roip: false, description: '', notes: '', created_by: '', updated_by: '', created_at: '', updated_at: '' },
  { id: 'mpu1', name: 'MPU5 NET', net_id: 'W01', radio_type: 'mpu5', tx_freq: '1.4', rx_freq: '1.4', freq_unit: 'GHz', roip: false, description: '', notes: '', created_by: '', updated_by: '', created_at: '', updated_at: '' },
  { id: 'both1', name: 'SHARED NET', net_id: 'B01', radio_type: 'both', tx_freq: '243', rx_freq: '243', freq_unit: 'MHz', roip: false, description: '', notes: '', created_by: '', updated_by: '', created_at: '', updated_at: '' },
];

// One stable spy, not a fresh vi.fn() per render: the save payload is the whole
// point of most of these tests, and a per-call spy records the call somewhere
// the test can never see it.
const saveMutate = vi.fn();

/** The payload handleSave actually sent. */
function savedRequest(): SavePaceCardRequest {
  const arg = saveMutate.mock.calls[0]?.[0] as { data: SavePaceCardRequest } | undefined;
  if (!arg) throw new Error('save was never called');
  return arg.data;
}
const savedPlan = (radio: 'jem' | 'mpu5') =>
  savedRequest().plans.find((p) => p.radio_type === radio)!;

// Section 06 alone. A label query over the whole page also walks every titled box
// in the three band tables, which pushed the tier tests past their timeout.
const tiers = () => within(screen.getByText('PACE options').closest('section')!);
// Any one form section, by its title. Same reason as tiers(): a page-wide label
// query walks all 46 titled band boxes and ran the slow tests past 15s under
// the full suite.
const inSection = (title: string) => within(screen.getByText(title).closest('section')!);

// Query state the tests move around: swap it, then rerender to stand in for a
// refetch resolving.
let cardState: { data: typeof card | undefined; isLoading: boolean; isError: boolean };
let netsState: { data: { nets: typeof nets; total: number } | undefined; isLoading: boolean; isError: boolean };

// The catalog is swappable so a test can pick a radio instead of a SATCOM
// terminal. A radio's capabilities are waveforms, and the tier resolves either
// through the one service_abbrev column, so the difference has to be
// exercisable from a fixture.
const SATCOM_TERMINAL = { id: 'tsc-154v3', nomenclature: 'AN/TSC-154(V)3', terminal_type: 'satcom' };
// The radio carries a nickname and the SATCOM terminal deliberately does not,
// so the preview exercises both arms of the tile's title fallback.
const RADIO = { id: 'prc-158', nomenclature: 'AN/PRC-158', nickname: 'Falcon', terminal_type: 'radio' };
let equipmentListState: { data: { equipment: unknown[]; total: number }; isLoading: boolean };
let equipmentItemState: { data: unknown; isLoading: boolean };

vi.mock('@/services', () => ({
  usePaceCard: () => cardState,
  useSavePaceCard: () => ({ mutateAsync: saveMutate, isPending: false }),
  useUploadPaceEmblem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePaceEmblem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useNets: () => netsState,
  useSections: () => ({ data: [{ key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true }], isLoading: false }),
  useTerminals: () => ({ data: undefined, isLoading: false }),
  useKits: () => ({ data: undefined, isLoading: false }),
  useContracts: () => ({ data: undefined, isLoading: false }),
  // Section 06 destructures these, so a bare vi.fn() returning undefined would
  // throw at render rather than fail as an assertion.
  useEquipment: () => equipmentListState,
  useEquipmentItem: () => equipmentItemState,
  useTransports: () => ({
    data: { transports: [{ id: 't1', name: 'Verizon LTE', kind: 'cellular' }], total: 1 },
    isLoading: false,
  }),
  useWaveforms: vi.fn(),
  useServices: vi.fn(),
  useLogout: () => ({ mutate: vi.fn() }),
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useContractFiscalYears: () => ({ data: [] }),
  REASSIGN_TO_NONE: '__none__',
}));

let mockCanWritePace = true;
const authState = () => ({
  canWrite: false, canWriteRadio: true, canWritePace: mockCanWritePace, isAdmin: false, role: 'rto',
});
vi.mock('@/contexts', async () => ({
  ...(await vi.importActual('@/contexts')),
  useAuth: () => authState(),
  useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }),
}));
vi.mock('@/contexts/auth-context', async () => ({
  ...(await vi.importActual('@/contexts/auth-context')),
  useAuth: () => authState(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  saveMutate.mockResolvedValue(undefined);
  mockCanWritePace = true;
  mockParams.section = 'asqd';
  cardState ={ data: card, isLoading: false, isError: false };
  netsState = { data: { nets, total: nets.length }, isLoading: false, isError: false };
  equipmentListState = { data: { equipment: [SATCOM_TERMINAL, RADIO], total: 2 }, isLoading: false };
  equipmentItemState = {
    data: {
      ...SATCOM_TERMINAL,
      data: { services: [{ abbrev: 'WGS', name: 'Wideband Global SATCOM', cir: { dl: 4, ul: 1 } }] },
    },
    isLoading: false,
  };
});

describe('PaceEditorPage', () => {
  it('loads the saved card header into the form', () => {
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
    expect(screen.getByDisplayValue('EXERCISE ONE')).toBeInTheDocument();
  });

  it('ticks Include date when a date is stored, and shows the field', () => {
    // The nullable date is its own flag; there is no separate boolean.
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
    // Named: every markable field now carries its own "changed" checkbox too.
    expect(screen.getByRole('checkbox', { name: 'Include date' })).toBeChecked();
    expect(screen.getByDisplayValue('2026-08-20')).toBeInTheDocument();
  });

  it('offers only nets the radio carries', () => {
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
    const combos = screen.getAllByRole('combobox');
    const jemOptions = within(combos[0]!).getAllByRole('option').map((o) => o.textContent);

    // A shared net belongs on either wheel; an MPU5-only net must not be offered.
    expect(jemOptions).toContain('JEM NET');
    expect(jemOptions).toContain('SHARED NET');
    expect(jemOptions).not.toContain('MPU5 NET');
  });

  it('renders a row for every channel, assigned or not', () => {
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
    // 16 JEM rows; the MPU5 section is collapsed by default. Addressed by the
    // channel label rather than by counting every combobox on the page, which
    // also swept up the Section 06 source selects.
    expect(inSection('JEM channels').getAllByLabelText(/^Channel \d+ net$/)).toHaveLength(16);
  });

  it('lays the channels out down two columns, not across them', () => {
    // 1..8 down the left column, 9..16 down the right, which is the wheel:
    // channel 1 is at 6 o'clock, 2..8 are its left side, 9 is at the top and
    // 10..16 are its right side. Filling across instead would put every odd
    // channel in one column and every even one in the other.
    //
    // gridAutoFlow is what makes that true and is deliberately kept out of a
    // media query so it can be asserted here -- the breakpoint rides on the
    // row count instead, which jsdom does not evaluate. So the row count and
    // gridTemplateColumns are not what this checks.
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

    // Up from the select to the grid's own child. Found by the grid rather than
    // by counting parents, because an assigned channel's select sits one level
    // deeper, inside the wrapper that carries its "changed" tick.
    const rowOf = (el: HTMLElement) => {
      let node = el;
      while (node.parentElement && getComputedStyle(node.parentElement).gridAutoFlow !== 'column') {
        node = node.parentElement;
      }
      return node;
    };
    const rows = inSection('JEM channels')
      .getAllByLabelText<HTMLSelectElement>(/^Channel \d+ net$/)
      .map(rowOf);

    // That walk is positional, so pin it: row n must carry the number n.
    rows.forEach((row, i) => expect(row).toHaveTextContent(new RegExp(`^${String(i + 1)}`)));

    const grid = rows[0]!.parentElement!;
    expect(getComputedStyle(grid).display).toBe('grid');
    expect(getComputedStyle(grid).gridAutoFlow).toBe('column');
    // DOM order stays 1..16 whichever way the grid flows, so the tab order
    // runs down the left column and then down the right.
    expect(Array.from(grid.children)).toEqual(rows);
  });

  it('preselects the saved net on its channel', () => {
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
    // getAllByRole returns HTMLElement; these are selects and .value is the
    // point of the assertion.
    const combos = inSection('JEM channels').getAllByLabelText<HTMLSelectElement>(/^Channel \d+ net$/);
    expect(combos[3]!.value).toBe('jem1'); // channel 4
    expect(combos[0]!.value).toBe('');     // channel 1 unassigned
  });

  it('starts with Save disabled until something changes', () => {
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('previews the wheels from form state', () => {
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
    expect(screen.getByRole('img', { name: /JEM channel wheel: 1 of 16/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /MPU5 channel wheel: 0 of 16/ })).toBeInTheDocument();
  });

  it("carries the net ID into the preview wheel's accessible table", () => {
    // The preview builds its assignments from the draft plus the nets list
    // rather than from the card, so it is a second mapping that has to carry
    // netId - and it had the same omission as the sheet.
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

    const table = screen.getByRole('table', { name: /JEM channel wheel/, hidden: true });
    // Row 0 is the header, so the fixture's channel 4 is row 4. The channel
    // number is a row header, so the cells are Net, Channel #, Frequency.
    const row = within(table).getAllByRole('row', { hidden: true })[4]!;
    const cells = within(row).getAllByRole('cell', { hidden: true });

    expect(cells[0]).toHaveTextContent('JEM NET');
    expect(cells[1]).toHaveTextContent('J01');
  });

  it('is closed to a user without radio write access', () => {
    mockCanWritePace = false;
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('404s a section that has no PACE card', () => {
    mockParams.section = 'zsqd';
    renderWithRoute(<PaceEditorPage />, '/pace/zsqd/edit');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  describe('sheet tables', () => {
    it('sends the LTAC name that was typed into the first row', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      await user.type(screen.getByPlaceholderText('LTAC 1 name'), 'ALPHA NET');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      // channel rides along empty on an LTAC row: the field is on the shared
      // row type and only the TACSAT table prints it.
      expect(savedRequest().ltac_rows).toEqual([
        { name: 'ALPHA NET', channel: '', up: '', down: '', sat: '', crypto: '', highlights: [] },
      ]);
    });

    it('sends the TACSAT channel typed between name and up', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      await user.type(screen.getByPlaceholderText('TACSAT 1 name'), 'BRAVO NET');
      await user.type(screen.getByPlaceholderText('TACSAT 1 ch'), '12');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(savedRequest().tacsat_rows).toEqual([
        { name: 'BRAVO NET', channel: '12', up: '', down: '', sat: '', crypto: '', highlights: [] },
      ]);
    });

    it('lays each entry out on two lines: name, up, down over ch, sat, crypto', () => {
      // Six cells and six ticks do not fit one half-pane line, so an entry is
      // two lines of three. Pinned by which fields share a line, not by pixels.
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
      const lineOf = (placeholder: string) =>
        screen.getByPlaceholderText(placeholder).closest('[data-band-line]');

      expect(lineOf('TACSAT 1 name')).toBe(lineOf('TACSAT 1 down'));
      expect(lineOf('TACSAT 1 ch')).toBe(lineOf('TACSAT 1 crypto'));
      expect(lineOf('TACSAT 1 name')).not.toBe(lineOf('TACSAT 1 ch'));
      // LTAC has no channel, and its SAT still starts line 2.
      expect(lineOf('LTAC 1 sat')).not.toBe(lineOf('LTAC 1 up'));
    });

    it('titles every box in every entry, not just the first row', () => {
      // A heading block over the first row was tried and stopped meaning
      // anything once the table scrolled, so each box is labelled itself.
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      // Eight LTAC and eight TACSAT entries each carry one of these.
      for (const title of ['name', 'up', 'down', 'sat', 'crypto']) {
        expect(inSection('Sheet tables').getAllByLabelText(title, { selector: 'input' })).toHaveLength(16);
      }
      // CH is TACSAT only.
      expect(inSection('Sheet tables').getAllByLabelText('ch', { selector: 'input' })).toHaveLength(8);
      // The last entry is titled exactly like the first.
      expect(screen.getByPlaceholderText('TACSAT 8 up')).toBe(
        inSection('Sheet tables').getAllByLabelText('up', { selector: 'input' })[15],
      );
      // Every tick in a column still has its own name.
      expect(screen.getByRole('checkbox', { name: 'Mark TACSAT 8 up as changed' })).toBeInTheDocument();
    });

    it('offers a channel field on TACSAT but not on LTAC', () => {
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      expect(screen.getByPlaceholderText('TACSAT 1 ch')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('LTAC 1 ch')).toBeNull();
    });

    it('drops the padding rows rather than storing eight blanks', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      // The grid is a fixed 8 rows for typing into; only what was typed is a
      // row as far as the server is concerned.
      await user.type(screen.getByPlaceholderText('TACSAT 1 name'), 'BRAVO NET');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(savedRequest().tacsat_rows).toHaveLength(1);
      expect(savedRequest().ltac_rows).toHaveLength(0);
    });

    it('seeds the TACTICAL MISSION NETWORK labels for a card with none stored', () => {
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
      expect(screen.getByDisplayValue('DATA SYNC')).toBeInTheDocument();
      expect(screen.getByDisplayValue('CHAT')).toBeInTheDocument();
      expect(screen.getByDisplayValue('MEDICAL')).toBeInTheDocument();
    });
  });

  describe('save payload', () => {
    it('sends only the assigned positions', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      await user.type(screen.getByDisplayValue('EXERCISE ONE'), '!');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      // 16 rows on the form, one assigned. The wheel fills the gaps, so the
      // other 15 are not sent as blank channels.
      expect(savedPlan('jem').channels).toHaveLength(1);
      expect(savedPlan('jem').channels[0]).toMatchObject({
        channel_number: 4,
        net_id: 'jem1',
      });
      expect(savedPlan('mpu5').channels).toHaveLength(0);
    });

    it('trims the overrides rather than storing the padding', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      // Only the assigned row shows override inputs, so these are channel 4's.
      await user.type(screen.getByPlaceholderText('TX override'), '  31.5  ');
      await user.type(screen.getByPlaceholderText('RX override'), ' 31.6 ');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(savedPlan('jem').channels[0]).toMatchObject({
        tx_freq_override: '31.5',
        rx_freq_override: '31.6',
      });
    });

    it('clears the date column when Include date is unticked', async () => {
      // Unticking has to clear the stored value, not just hide it -- otherwise
      // the card renders no date while the row still carries one.
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      await user.click(screen.getByRole('checkbox', { name: 'Include date' }));
      expect(screen.queryByDisplayValue('2026-08-20')).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(savedRequest().effective_date).toBe('');
    });

    it('sends the stored date when Include date is left ticked', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      await user.type(screen.getByDisplayValue('EXERCISE ONE'), '!');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(savedRequest().effective_date).toBe('2026-08-20');
    });
  });

  it('keeps in-progress edits when the card refetches underneath', async () => {
    // useSavePaceCard invalidates on success, so a refetch lands while the user
    // may already be typing again. Resetting the draft on the new object would
    // discard every keystroke since Save and clear `dirty` with them, disabling
    // Save with nothing on screen to say the work was lost.
    const user = userEvent.setup();
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

    const title = screen.getByDisplayValue('EXERCISE ONE');
    await user.type(title, ' BR');
    // Same card, new object -- what react-query hands back after a refetch. The
    // next keystroke is the render that sees it.
    cardState = { ...cardState, data: { ...card } };
    await user.type(title, 'AVO');

    expect(title).toHaveValue('EXERCISE ONE BRAVO');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('adopts the server copy once a save has cleared the form', async () => {
    // The other half of the contract: a genuine post-save reload must still
    // land, or the form would quietly drift from what was actually stored.
    const user = userEvent.setup();
    saveMutate.mockImplementation(() => {
      cardState = { ...cardState, data: { ...card, title: 'EXERCISE TWO' } };
      return Promise.resolve(undefined);
    });
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

    await user.type(screen.getByDisplayValue('EXERCISE ONE'), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByDisplayValue('EXERCISE TWO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('waits for the nets before offering any channel select', () => {
    // A select rendered before its options exist shows an assigned channel as
    // "- select -", and re-picking there loses that row's TX/RX overrides.
    netsState = { data: undefined, isLoading: true, isError: false };
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  });

  it('says so when the nets cannot be loaded', () => {
    netsState = { data: undefined, isLoading: false, isError: true };
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
    expect(screen.getByRole('alert')).toHaveTextContent(/nets/i);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  });

  it('is offered Add Net, which does not deep-link into this squadron', async () => {
    // Add Net is now on every route, so the three Add buttons read as one
    // cluster instead of one that comes and goes with the page. It is here too.
    //
    // What this route still does not get is the /nets/:section?drawer=add
    // deep-link. The anchored match excludes /pace/:section/edit, so the button
    // falls back to the picker like any other non-section route.
    //
    // Worth knowing: leaving this page by any route discards the draft, because
    // one Save covers the whole card and beforeunload does not fire on an SPA
    // navigation. That is true of every link on the page, not of this button
    // specifically, which is why it is no longer singled out for removal.
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    expect(screen.getByRole('menuitem', { name: /Add Net/ })).toBeInTheDocument();
  });

  it('reports a failed card fetch instead of offering a blank card to save', () => {
    cardState = { data: undefined, isLoading: false, isError: true };
    renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load this card/);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  describe('changed marks', () => {
    it('sends a ticked TX mark on its own channel, and enables Save', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      // A tick is an edit like any other: it goes through patch, so it is
      // what marks the form dirty.
      await user.click(screen.getByRole('checkbox', { name: 'Mark channel 4 TX as changed' }));
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(savedPlan('jem').channels[0]?.highlights).toEqual(['tx']);
    });

    it('offers a net tick only on an assigned channel', () => {
      // An empty position has no row to carry a mark, so a tick there would
      // be dropped on save without a word.
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
      expect(screen.getByRole('checkbox', { name: 'Mark channel 4 net as changed' })).toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: 'Mark channel 1 net as changed' })).toBeNull();
    });

    it('sends the version and its mark', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      await user.type(inSection('Card header').getByLabelText('Version'), ' v2 ');
      await user.click(screen.getByRole('checkbox', { name: 'Mark Version as changed' }));
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(savedRequest().version).toBe('v2');
      expect(savedRequest().highlights).toEqual(['version']);
    });

    it('clears every mark in one go, and keeps the values', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      await user.click(screen.getByRole('checkbox', { name: 'Mark Title as changed' }));
      await user.click(screen.getByRole('checkbox', { name: 'Mark channel 4 net as changed' }));
      expect(screen.getByText(/^2 values marked as changed/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Clear all marks' }));
      expect(screen.getByRole('button', { name: 'Clear all marks' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(savedRequest().highlights).toEqual([]);
      expect(savedPlan('jem').channels[0]).toMatchObject({ net_id: 'jem1', highlights: [] });
      expect(savedRequest().title).toBe('EXERCISE ONE');
    });
  });

  describe('live preview', () => {
    it('draws an emblem in the wheel hubs', () => {
      // The preview never received an emblem, so its hubs were empty while the
      // Section 02 thumbnail updated. Uploading one looked like it had failed.
      const { container } = renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      // One per wheel. Falls back to the generated placeholder when the
      // squadron has none stored, which is what this fixture has.
      expect(container.querySelectorAll('svg image')).toHaveLength(2);
    });

    it('draws the four PACE tiles beside the wheels', () => {
      // The tiles used to be visible only on the saved card, so checking one
      // meant Save, back to the card, look, and back in to edit. They are the
      // same PaceTile the sheet prints, so they cannot drift from it -- but they
      // can silently fall out of the pane, which is how the emblem was lost.
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      // This fixture stores no tiers, so every tile is in its empty state: the
      // bare letter above, the spelled-out word inside as grey subtext.
      for (const letter of ['P', 'A', 'C', 'E']) {
        expect(screen.getByText(letter)).toBeInTheDocument();
      }
    });

    it('updates a tile as its tier is edited, without a save', () => {
      // The whole point of putting them here. PaceTier's display fields are
      // resolved server-side, so an unsaved draft carries only ids and the
      // preview has to resolve them itself.
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      const sourceSelects = tiers().getAllByLabelText('Source');
      fireEvent.change(sourceSelects[0]!, { target: { value: 'custom' } });
      fireEvent.change(tiers().getByLabelText('Label'), {
        target: { value: 'Runway fibre drop' },
      });

      // In the tile as text. The editor field holds it as an input value, which
      // getByText does not see, so this can only be the preview.
      expect(screen.getByText('Runway fibre drop')).toBeInTheDocument();
      // And the letter has become the word, which is what a set tile does.
      expect(screen.getByText('Primary')).toBeInTheDocument();
    });

    // The width cap is deliberately not asserted here. It lives in an MUI sx
    // prop, which compiles to an emotion class that jsdom does not resolve, so
    // any assertion on it would be testing the styling engine rather than the
    // fix. It was verified in a real browser instead: 1088px before, 528 after.
  });

  describe('Section 02, the Current emblem thumbnail', () => {
    // This block only renders when the card has an emblem_url, and no fixture in
    // this file set one - so the thumbnail was never rendered by any test, and
    // the bug below lived in that gap.
    const STORED = 'https://acct.blob.core.windows.net/emblems/asqd.png';

    it('does not point the img at the raw stored blob URL', () => {
      cardState = { ...cardState, data: { ...card, emblem_url: STORED } };
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      const img = screen.getByAltText('Squadron emblem');

      // The stored value is a raw Azure blob URL on a container with
      // allowBlobPublicAccess false, so a browser fetching it directly is
      // refused - which is why usePaceEmblem exists and why the wheel hubs go
      // through it. This thumbnail was the last call site still passing the raw
      // URL, so it rendered the broken-image glyph while the wheel right below
      // it, fed from the same hook, drew correctly.
      expect(img).not.toHaveAttribute('src', STORED);

      // And it must be showing something: the hook returns the generated
      // placeholder until the real bytes are in hand, so a hub or thumbnail is
      // never empty and never broken.
      expect(img.getAttribute('src')).toBeTruthy();
    });
  });

  describe('Section 06, PACE options', () => {
    it('renders a row per tier', () => {
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      expect(screen.getByText('Section 06')).toBeInTheDocument();
      expect(screen.getByText('PACE options')).toBeInTheDocument();
      expect(screen.getByText('P - Primary')).toBeInTheDocument();
      expect(screen.getByText('E - Emergency')).toBeInTheDocument();
    });

    it('sends a custom tier with its label', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      // The P row is the first Source select on the page.
      const sourceSelects = tiers().getAllByLabelText('Source');
      await user.selectOptions(sourceSelects[0]!, 'custom');
      await user.type(tiers().getByLabelText('Label'), 'Runway fibre drop');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      const tier = savedRequest().tiers?.find((t) => t.tier === 'P');
      expect(tier?.source).toBe('custom');
      expect(tier?.custom_label).toBe('Runway fibre drop');
    });

    it('marks the field a tier is missing, and refuses to save without it', async () => {
      // Reported from the running app: a tier had Source "Custom" with Detail
      // filled in and Label left empty, and Save returned "a tier names a source
      // but carries no matching reference" -- naming neither the tier nor the
      // field, with four tiers and three sources to check by hand.
      //
      // Detail sits directly under Label and is optional, which is what makes
      // the tier look configured.
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      await user.selectOptions(tiers().getAllByLabelText('Source')[0]!, 'custom');
      // Detail renders on all four tiers; Label only on the one set to custom.
      await user.type(tiers().getAllByLabelText('Detail')[0]!, 'Cellular bonded');

      const label = tiers().getByLabelText('Label');
      expect(label).toHaveAttribute('aria-invalid', 'true');
      expect(label).toHaveAccessibleDescription('Required while Source is "Custom"');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      // Named well enough to act on with Section 06 collapsed, which it is by
      // default -- "marked below" would point at nothing.
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('tier P (Primary)');
      expect(alert).toHaveTextContent('Source "Custom" but no Label');
      expect(alert).toHaveTextContent('"Not set"');

      // The round trip is what this replaces, so it must not happen at all.
      expect(saveMutate).not.toHaveBeenCalled();
    });

    it('clears the mark and saves once the missing field is filled', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      await user.selectOptions(tiers().getAllByLabelText('Source')[0]!, 'custom');
      await user.type(tiers().getByLabelText('Label'), 'Runway fibre drop');

      expect(tiers().getByLabelText('Label')).not.toHaveAttribute('aria-invalid');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(savedRequest().tiers?.find((t) => t.tier === 'P')?.custom_label).toBe('Runway fibre drop');
    });

    it('reveals the equipment and capability selects only for a catalog tier', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      expect(tiers().queryByLabelText('Equipment')).toBeNull();

      await user.selectOptions(tiers().getAllByLabelText('Source')[0]!, 'equipment');

      expect(tiers().getByLabelText('Equipment')).toBeInTheDocument();
      // Disabled until a terminal is chosen, because the services it offers are
      // read off that record.
      expect(tiers().getByLabelText('Service')).toBeDisabled();

      await user.selectOptions(tiers().getByLabelText('Equipment'), 'tsc-154v3');
      expect(tiers().getByLabelText('Service')).toBeEnabled();
    });

    it('groups the equipment list so a radio is not mistaken for a terminal', async () => {
      // Every catalog record has always been selectable here, radios included,
      // while the control was labelled "Catalog terminal" and listed them flat.
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
      await user.selectOptions(tiers().getAllByLabelText('Source')[0]!, 'equipment');

      const picker = tiers().getByLabelText('Equipment');
      const groups = within(picker).getAllByRole('group');
      expect(groups.map((g) => g.getAttribute('label')))
        .toEqual(['SATCOM terminals', 'Radios']);
    });

    it('offers a radio its waveforms, under a Waveform label', async () => {
      // The tier stores one abbreviation whatever the equipment is; only where
      // it is looked up changes. Reading `services` alone left a radio with a
      // dropdown that was enabled and empty.
      equipmentItemState = {
        data: {
          ...RADIO,
          data: {
            services: [],
            waveforms: [{ abbrev: 'ANW2', name: 'Adaptive Networking Wideband Waveform' }],
          },
        },
        isLoading: false,
      };
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
      await user.selectOptions(tiers().getAllByLabelText('Source')[0]!, 'equipment');
      await user.selectOptions(tiers().getByLabelText('Equipment'), 'prc-158');

      const capability = tiers().getByLabelText('Waveform');
      expect(capability).toBeEnabled();
      expect(tiers().queryByLabelText('Service')).toBeNull();
      expect(within(capability).getByRole('option', { name: 'ANW2 - Adaptive Networking Wideband Waveform' }))
        .toBeInTheDocument();
    });

    it('disables the capability select when the equipment offers none', async () => {
      // Enabled-and-empty reads as broken. The component dims a disabled select
      // so it reads as not-yet instead.
      equipmentItemState = {
        data: { ...RADIO, data: { services: [], waveforms: [] } },
        isLoading: false,
      };
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
      await user.selectOptions(tiers().getAllByLabelText('Source')[0]!, 'equipment');
      await user.selectOptions(tiers().getByLabelText('Equipment'), 'prc-158');

      expect(tiers().getByLabelText('Waveform')).toBeDisabled();
    });

    it("carries a radio's waveform abbreviation and nickname into the preview tile", async () => {
      equipmentItemState = {
        data: {
          ...RADIO,
          data: {
            services: [],
            waveforms: [{ abbrev: 'ANW2', name: 'Adaptive Networking Wideband Waveform' }],
          },
        },
        isLoading: false,
      };
      equipmentListState = {
        data: {
          equipment: [{
            ...RADIO,
            data: {
              services: [],
              waveforms: [{ abbrev: 'ANW2', name: 'Adaptive Networking Wideband Waveform' }],
            },
          }],
          total: 1,
        },
        isLoading: false,
      };
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
      await user.selectOptions(tiers().getAllByLabelText('Source')[0]!, 'equipment');
      await user.selectOptions(tiers().getByLabelText('Equipment'), 'prc-158');
      await user.selectOptions(tiers().getByLabelText('Waveform'), 'ANW2');

      // The preview must resolve these the same way loadTiers does, or the
      // editor and the printed sheet disagree about the same draft. The tile
      // prints the abbreviation, and titles itself with the catalog nickname.
      expect(screen.getByText('ANW2')).toBeInTheDocument();
      // Unique to the tile: the equipment picker labels its options by
      // nomenclature, so a nickname on screen can only have come from a tile.
      expect(screen.getByText('Falcon')).toBeInTheDocument();
      // The spelled-out name still reaches the operator, in the picker.
      expect(screen.getByRole('option', { name: 'ANW2 - Adaptive Networking Wideband Waveform' }))
        .toBeInTheDocument();
    });

    it("carries a service's abbreviation into the preview tile, titled by nomenclature", async () => {
      equipmentListState = {
        data: {
          equipment: [{
            ...SATCOM_TERMINAL,
            data: { services: [{ abbrev: 'WGS', name: 'Wideband Global SATCOM', cir: { dl: 4, ul: 1 } }] },
          }],
          total: 1,
        },
        isLoading: false,
      };
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');
      await user.selectOptions(tiers().getAllByLabelText('Source')[0]!, 'equipment');
      await user.selectOptions(tiers().getByLabelText('Equipment'), 'tsc-154v3');
      await user.selectOptions(tiers().getByLabelText('Service'), 'WGS');

      expect(screen.getByText('WGS')).toBeInTheDocument();
      expect(screen.getByText('CIR 4/1 Mbps')).toBeInTheDocument();
      // This terminal records no nickname, so nothing here should read as one.
      // The tile's fallback to the nomenclature is asserted in
      // pace-section-page.test.tsx, where no picker competes for the string.
      expect(screen.queryByText('Falcon')).not.toBeInTheDocument();
    });

    it('reveals the transport select for a transport tier', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      await user.selectOptions(tiers().getAllByLabelText('Source')[0]!, 'transport');

      expect(tiers().getByLabelText('Transport')).toBeInTheDocument();
    });

    it('drops the previous source fields when the source changes', async () => {
      const user = userEvent.setup();
      renderWithRoute(<PaceEditorPage />, '/pace/asqd/edit');

      const source = tiers().getAllByLabelText('Source')[0]!;
      await user.selectOptions(source, 'equipment');
      await user.selectOptions(tiers().getByLabelText('Equipment'), 'tsc-154v3');
      await user.selectOptions(source, 'custom');
      await user.type(tiers().getByLabelText('Label'), 'Typed instead');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      const tier = savedRequest().tiers?.find((t) => t.tier === 'P');
      expect(tier?.equipment_id).toBe('');
      expect(tier?.custom_label).toBe('Typed instead');
    });
  });
});

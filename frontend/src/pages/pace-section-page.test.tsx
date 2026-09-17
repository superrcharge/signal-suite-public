import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithRoute, screen, within } from '@/test/utils';
import { PaceSectionPage } from './pace-section-page';
import { SHEET_CHANGED } from '@/components/pace/pace-constants';
import type { PaceTier } from '@/types';

const { mockParams } = vi.hoisted(() => ({ mockParams: { section: 'asqd' } }));

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useParams: () => mockParams,
}));

const emptyTier = (tier: string): PaceTier => ({
  tier, source: 'none',
  equipment_id: '', transport_id: '', service_abbrev: '', custom_label: '', detail: '',
  equipment_nomenclature: '', equipment_nickname: '', equipment_photo_url: '',
  transport_name: '', service_cir: '', service_mir: '',
});

const card = {
  section: 'asqd',
  emblem_url: '',
  // The server pads to all four letters, so the fixture does too.
  tiers: ['P', 'A', 'C', 'E'].map(emptyTier),
  ltac_rows: [] as { name: string; up: string; down: string; sat: string; crypto: string }[],
  tacsat_rows: [] as { name: string; up: string; down: string; sat: string; crypto: string }[],
  tmn_rows: [] as { label: string; value: string }[],
  plans: [
    {
      id: 'p1', radio_type: 'jem', label: 'JEM', channel_count: 16,
      notes: '', updated_by: '', updated_at: '',
      channels: [{
        channel_number: 4,
        net: { id: 'n1', name: 'NET ONE', net_id: 'N01', radio_type: 'jem', waveform_abbrev: '' },
        tx_freq: '30.5000', rx_freq: '30.5000', freq_unit: 'MHz',
        label_override: '', is_overridden: false,
      }],
    },
    {
      id: 'p2', radio_type: 'mpu5', label: 'MPU5', channel_count: 16,
      notes: '', updated_by: '', updated_at: '', channels: [],
    },
  ],
};

let cardState: { data: typeof card | undefined; isLoading: boolean; isError: boolean };
let sectionsState: { data: { key: string; label: string; color: string; pace_enabled?: boolean }[] | undefined; isLoading: boolean };

vi.mock('@/services', () => ({
  usePaceCard: () => cardState,
  useSavePaceCard: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSections: () => sectionsState,
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

// Every case here runs as an admin unless it says otherwise. Without this
// override there is no way to render as a viewer, so a claim that something
// shows "for every role" would have nothing checking the other half of it.
let authOverrides: Record<string, unknown> = {};
const authState = () => ({ canWrite: true, canWriteRadio: true, canWritePace: true, isAdmin: true, role: 'admin', ...authOverrides });
vi.mock('@/contexts', async () => ({
  ...(await vi.importActual('@/contexts')),
  useAuth: () => authState(),
  useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }),
}));
vi.mock('@/contexts/auth-context', async () => ({
  ...(await vi.importActual('@/contexts/auth-context')),
  useAuth: () => authState(),
}));

const SECTIONS = [
  { key: 'asqd', label: 'A SQD', color: '#fff', pace_enabled: true },
  { key: 'zsqd', label: 'Z SQD', color: '#fff' },
  // Section labels are user-editable DB values, and this one ends up spliced
  // into the placeholder emblem's SVG markup.
  { key: 'bsqd', label: 'B SQD <script>alert(1)</script>', color: '#fff', pace_enabled: true },
];

beforeEach(() => {
  cardState = { data: card, isLoading: false, isError: false };
  sectionsState = { data: SECTIONS, isLoading: false };
  authOverrides = {};
});

describe('PaceSectionPage changed marks', () => {
  it('prints the version after the date, and only the marked values red', () => {
    mockParams.section = 'asqd';
    cardState = {
      // Object.assign rather than a spread literal: the fixture's inferred
      // type predates the marks, and a literal would fail the excess-property
      // check on fields the real PaceCard does carry.
      data: Object.assign({}, card, {
        effective_date: '2026-08-20',
        version: 'v2',
        highlights: ['version'],
        ltac_rows: [
          { name: 'ALPHA NET', channel: '', up: '225.000', down: '243.000', sat: '', crypto: '', highlights: ['up'] },
        ],
      }),
      isLoading: false,
      isError: false,
    };
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    const version = screen.getByText('v2');
    expect(version).toHaveAttribute('data-changed', 'true');
    expect(version).toHaveStyle({ color: SHEET_CHANGED });
    // Only what was marked: the date beside the version and the downlink in
    // the same row stay as they were.
    expect(screen.getByText('20 AUG 2026')).not.toHaveAttribute('data-changed');
    expect(screen.getByText('225.000')).toHaveStyle({ color: SHEET_CHANGED });
    expect(screen.getByText('243.000')).not.toHaveAttribute('data-changed');
  });
});

describe('PaceSectionPage', () => {
  it('renders the card for a squadron that has one', () => {
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');
    // The action bar names the squadron, mirroring catalog-sheet-page.
    expect(within(screen.getByRole('main')).getByText('A SQD')).toBeInTheDocument();
  });

  it('404s a section that exists but has no PACE card', () => {
    // Z SQD is a real section; it just does not produce a card. Asserting on the
    // 404 rather than on the absence of a nav label, which was absent either
    // way and let this pass with the gate removed entirely.
    mockParams.section = 'zsqd';
    renderWithRoute(<PaceSectionPage />, '/pace/zsqd');
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  it('404s an unknown section key rather than rendering a card', () => {
    mockParams.section = 'garbage';
    renderWithRoute(<PaceSectionPage />, '/pace/garbage');
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  // The gate has to wait for the sections query now that a card is a column
  // rather than a constant. Returning NotFoundPage before it lands would flash
  // "404" for a squadron that exists, on every single load.
  it('waits for the sections query rather than 404ing a squadron that exists', () => {
    sectionsState = { data: undefined, isLoading: true };
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    expect(screen.queryByText('Page Not Found')).toBeNull();
  });

  it('offers the same actions as a catalog sheet: back and edit', () => {
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');
    // Scoped to main: the header carries its own PACE nav button.
    const page = within(screen.getByRole('main'));
    expect(page.getByRole('button', { name: /Wheels/ })).toBeInTheDocument();
    expect(page.getByRole('button', { name: /Edit/ })).toBeInTheDocument();
  });

  it('offers the sheet export beside Print, without a role gate', () => {
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');
    const page = within(screen.getByRole('main'));
    // Named by aria-label, since it is an icon at every width. Outside
    // canWritePace for the same reason Print is: exporting is a read action.
    expect(page.getByRole('button', { name: 'share this sheet' })).toBeInTheDocument();
    expect(page.getByRole('button', { name: /Print \/ Save PDF/ })).toBeInTheDocument();
  });

  // The exporter finds the sheet by this attribute. It has to sit on the Paper
  // that is exactly PAGE_W x PAGE_H, not on the scrolling wrapper around it.
  it('marks the page-sized Paper as the export root', () => {
    mockParams.section = 'asqd';
    const { container } = renderWithRoute(<PaceSectionPage />, '/pace/asqd');
    const roots = container.querySelectorAll('[data-sheet-root]');
    expect(roots).toHaveLength(1);
    expect(roots[0]).toHaveStyle({ width: '1056px', height: '816px' });
  });

  it('renders both wheels', () => {
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');
    expect(screen.getByRole('img', { name: /JEM channel wheel/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /MPU5 channel wheel/ })).toBeInTheDocument();
  });

  it('renders the net the API returned, not sample data', () => {
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');
    expect(screen.getAllByText('NET ONE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('30.5000 MHz').length).toBeGreaterThan(0);
  });

  it('reports how many channels are assigned', () => {
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');
    // One net on JEM, none on MPU5.
    expect(screen.getByRole('img', { name: /JEM channel wheel: 1 of 16/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /MPU5 channel wheel: 0 of 16/ })).toBeInTheDocument();
  });

  it('says a card failed to load rather than drawing a plausible blank one', () => {
    // An empty sheet is exactly what a squadron with no card yet looks like, so
    // falling through to it on a fetch error presents a blank card as the
    // squadron's comms plan.
    mockParams.section = 'asqd';
    cardState = { data: undefined, isLoading: false, isError: true };
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    expect(screen.getByText(/Could not load this squadron/)).toBeInTheDocument();
    expect(screen.queryByText('Untitled card')).toBeNull();
    expect(screen.queryByRole('img', { name: /channel wheel/ })).toBeNull();
  });

  it('never puts the stored blob URL in the hub, because the browser cannot fetch it', () => {
    // This asserted the opposite until the emblem was found rendering as a
    // broken image on every card. The container is created with
    // allowBlobPublicAccess false, so an unauthenticated <image href> pointing
    // at storage is refused and draws the broken-image glyph scaled to the hub.
    // The bytes now come through the API instead, and the hub shows the
    // generated placeholder until they arrive.
    mockParams.section = 'asqd';
    cardState = {
      data: { ...card, emblem_url: 'https://blob/pace/asqd/emblem.png' },
      isLoading: false,
      isError: false,
    };
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    const wheels = screen.getAllByRole('img', { name: /channel wheel/ });
    expect(wheels.length).toBeGreaterThan(0);
    for (const wheel of wheels) {
      const href = wheel.querySelector('image')?.getAttribute('href') ?? '';
      expect(href).not.toContain('blob/pace/asqd/emblem.png');
      expect(href.startsWith('data:image/svg+xml')).toBe(true);
    }
  });

  it('falls back to the placeholder when the squadron has no emblem', () => {
    // A hub is never left empty: a squadron with nothing uploaded still gets
    // its own label drawn rather than a hole in the wheel.
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    const wheel = screen.getAllByRole('img', { name: /channel wheel/ })[0]!;
    const href = wheel.querySelector('image')?.getAttribute('href') ?? '';
    expect(href.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(href)).toContain('SAMPLE EMBLEM');
  });

  it('prints the three block titles and the frequency column headers', () => {
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    const page = within(screen.getByRole('main'));
    expect(page.getByText('LTAC')).toBeInTheDocument();
    expect(page.getByText('TACSAT')).toBeInTheDocument();
    expect(page.getByText('TACTICAL MISSION NETWORK')).toBeInTheDocument();
    // Both tables carry the same five columns, so each header appears twice.
    for (const col of ['NAME', 'UP', 'DOWN', 'SAT', 'CRYPTO']) {
      expect(page.getAllByText(col)).toHaveLength(2);
    }
  });

  it('renders a stored LTAC row on the sheet', () => {
    mockParams.section = 'asqd';
    cardState = {
      data: {
        ...card,
        ltac_rows: [
          { name: 'ALPHA NET', up: '225.000', down: '243.000', sat: 'A', crypto: 'KY-58' },
        ],
      },
      isLoading: false,
      isError: false,
    };
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    const page = within(screen.getByRole('main'));
    expect(page.getByText('ALPHA NET')).toBeInTheDocument();
    expect(page.getByText('225.000')).toBeInTheDocument();
  });

  it('keeps a block with no rows as a heading row and nothing beneath it', () => {
    // The sheet holds its structure when a squadron has filled in one table
    // only, rather than collapsing the empty one out of the layout.
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    const page = within(screen.getByRole('main'));
    expect(page.getAllByText('NAME')).toHaveLength(2);
    expect(page.queryByText('ALPHA NET')).toBeNull();
  });

  it('escapes the section label it splices into the placeholder emblem', () => {
    // The label is a DB value going into raw SVG markup. Consumed through
    // <image href>, where browsers disable scripting, so not exploitable today
    // -- but one element swap from being an XSS, and escaping costs nothing.
    mockParams.section = 'bsqd';
    renderWithRoute(<PaceSectionPage />, '/pace/bsqd');

    const emblem = screen.getAllByRole('img', { name: /channel wheel/ })[0]!;
    const svg = decodeURIComponent(emblem.querySelector('image')?.getAttribute('href') ?? '');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('offers Print / Save PDF to an editor', () => {
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeInTheDocument();
  });

  it("carries each channel's net ID into the wheel's accessible table", () => {
    // The wheel has always rendered a Channel # column; wheelPropsFor never sent
    // the value, so it was blank for every channel on every card. A screen
    // reader user got an empty column and no way to tell which net was which.
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    expect(screen.getAllByText('N01').length).toBeGreaterThan(0);
  });

  it("fills the wheel table's Channel # column from the API", () => {
    // The sheet keeps the ID off the dial deliberately, so this column is the
    // only place it is exposed. wheelPropsFor mapped every other channel field
    // and silently dropped this one, leaving the column blank on a live card
    // while the API was returning N01 all along. Pinned to the cell rather than
    // to the string appearing somewhere on the page, so moving the value into
    // the wrong column still fails.
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    const table = screen.getByRole('table', { name: /JEM channel wheel/, hidden: true });
    // Row 0 is the header, so the fixture's channel 4 is row 4. The channel
    // number is a row header, so the cells are Net, Channel #, Frequency.
    const row = within(table).getAllByRole('row', { hidden: true })[4]!;
    const cells = within(row).getAllByRole('cell', { hidden: true });

    expect(cells[0]).toHaveTextContent('NET ONE');
    expect(cells[1]).toHaveTextContent('N01');
  });

  it('renders a resolved terminal inside its PACE tile', () => {
    cardState = {
      data: {
        ...card,
        tiers: [
          {
            ...emptyTier('P'),
            source: 'equipment',
            equipment_id: 'tsc-198',
            equipment_nomenclature: 'AN/TSC-198',
            equipment_nickname: 'Phoenix',
            service_abbrev: 'WGS',
            service_cir: '4/1 Mbps',
            detail: 'primary path',
          },
          emptyTier('A'), emptyTier('C'), emptyTier('E'),
        ],
      },
      isLoading: false,
      isError: false,
    };
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    // The nickname titles the tile, not the nomenclature: the people reading a
    // printed card know their terminals by it.
    expect(screen.getByText('Phoenix')).toBeInTheDocument();
    expect(screen.queryByText('AN/TSC-198')).not.toBeInTheDocument();
    // The acronym, not the spelled-out capability. The full name lives in the
    // editor's capability picker, which is where it is read.
    expect(screen.getByText('WGS')).toBeInTheDocument();
    expect(screen.getByText('CIR 4/1 Mbps')).toBeInTheDocument();
    expect(screen.getByText('primary path')).toBeInTheDocument();
  });

  it('falls back to the nomenclature when the terminal has no nickname', () => {
    // Not every catalog record carries one, and the field is projected as an
    // empty string rather than null. Titling the tile blank would lose the only
    // line that says which terminal the tier is, so the nomenclature is the
    // floor rather than the preferred rendering.
    cardState = {
      data: {
        ...card,
        tiers: [
          {
            ...emptyTier('P'),
            source: 'equipment',
            equipment_id: 'tsc-198',
            equipment_nomenclature: 'AN/TSC-198',
            equipment_nickname: '',
            service_abbrev: 'WGS',
          },
          emptyTier('A'), emptyTier('C'), emptyTier('E'),
        ],
      },
      isLoading: false,
      isError: false,
    };
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    expect(screen.getByText('AN/TSC-198')).toBeInTheDocument();
  });

  it('prints a radio tier with its waveform abbreviation and no rate lines', () => {
    // A radio reaches the tile through the same service_abbrev column, which
    // prints straight off the tier row and needs no join. Only a service
    // carries committed rates, so the absence of CIR/MIR here is correct rather
    // than a join that failed to match.
    cardState = {
      data: {
        ...card,
        tiers: [
          {
            ...emptyTier('P'),
            source: 'equipment',
            equipment_id: 'prc-158',
            equipment_nomenclature: 'AN/PRC-158',
            equipment_nickname: 'Falcon',
            service_abbrev: 'ANW2',
          },
          emptyTier('A'), emptyTier('C'), emptyTier('E'),
        ],
      },
      isLoading: false,
      isError: false,
    };
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    expect(screen.getByText('Falcon')).toBeInTheDocument();
    expect(screen.getByText('ANW2')).toBeInTheDocument();
    expect(screen.queryByText(/^CIR /)).not.toBeInTheDocument();
    expect(screen.queryByText(/^MIR /)).not.toBeInTheDocument();
  });

  it('centres a tile photo against the text column beside it', () => {
    // The photo is a fixed 78px tall and the text column beside it is usually
    // taller, so flex-start hung the picture off the top of a block it should
    // sit level with.
    //
    // Asserted on the computed style, which jsdom does resolve for emotion's
    // injected rules.
    cardState = {
      data: {
        ...card,
        tiers: [
          {
            ...emptyTier('P'),
            source: 'equipment',
            equipment_id: 'tsc-198',
            equipment_nomenclature: 'AN/TSC-198',
            // What selects the two-column layout at all. A tier without one
            // keeps the centred single column and has no row to assert on.
            equipment_photo_url: 'https://example.invalid/tsc-198.png',
            service_abbrev: 'WGS',
          },
          emptyTier('A'), emptyTier('C'), emptyTier('E'),
        ],
      },
      isLoading: false,
      isError: false,
    };
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    // Up from the nomenclature to the first flex ROW above it. The text column
    // holding the nomenclature is a flex column, and the row above that is the
    // one the photo shares with it.
    let el: HTMLElement | null = screen.getByText('AN/TSC-198');
    while (el) {
      const st = getComputedStyle(el);
      if (st.display === 'flex' && st.flexDirection !== 'column') break;
      el = el.parentElement;
    }
    expect(el).not.toBeNull();
    expect(getComputedStyle(el!).alignItems).toBe('center');
  });

  it('centres a tile’s content in the tile, not against its top', () => {
    // The block -- photo, name, service, both rates, detail -- is shorter than
    // the 186px tile in every case, and a set tile used to pin it to the top and
    // leave the slack underneath, while an empty tile centred its placeholder.
    // Splitting the slack is what makes the four tiles read as a row.
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    // The fixture's tiers are all source "none", so any tile serves; the rule is
    // that the tile box centres regardless of whether it is set.
    const box = Array.from(document.querySelectorAll('div')).find(
      (d) => Math.round(d.getBoundingClientRect().height) === 186 || getComputedStyle(d).height === '186px',
    );
    expect(box).toBeDefined();
    expect(getComputedStyle(box!).justifyContent).toBe('center');
  });

  it('renders an unset tier as the letter and its label, with no body', () => {
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    // Every tier in the fixture is source "none", so all four labels show and
    // nothing resolved appears. This is the empty state the sheet has always
    // had, not a missing one.
    for (const label of ['Primary', 'Alternate', 'Contingency', 'Emergency']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText(/CIR /)).toBeNull();
  });

  it('offers Print / Save PDF to a viewer too, because printing is a read action', () => {
    authOverrides = { canWrite: false, canWriteRadio: false, canWritePace: false, isAdmin: false, role: 'viewer' };
    mockParams.section = 'asqd';
    renderWithRoute(<PaceSectionPage />, '/pace/asqd');

    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeInTheDocument();
    // The Edit button is the control that IS gated, so its absence is what
    // proves the viewer role actually took effect.
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});

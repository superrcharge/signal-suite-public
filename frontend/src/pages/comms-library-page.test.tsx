import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithRoute, screen, waitFor, within } from '@/test/utils';
import { CommsLibraryPage } from './comms-library-page';
import { CommsLibraryPrintPage } from './comms-library-print-page';

let mockCanWrite = true;
let mockCanWriteRadio = true;
// Transports gate on this one: a transport is a path a PACE tier names, so the
// pane follows PACE's writers. Omitting it here reads `undefined` in the pane
// and hides the controls from everyone, which the admin cases below catch.
let mockCanWritePace = true;

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  // useSearchParams stays real - which library is open is URL state and that
  // round trip is half of what these tests check.
  return { ...actual, useNavigate: () => vi.fn() };
});

const authState = () => ({
  user: { id: '1', name: 'Test User', email: 'test@test.com', roles: ['admin'] },
  isAuthenticated: true,
  isLoading: false,
  isError: false,
  role: mockCanWrite ? 'admin' : 'viewer',
  isAdmin: mockCanWrite,
  canWrite: mockCanWrite,
  canWriteRadio: mockCanWriteRadio,
  canWritePace: mockCanWritePace,
  refetch: vi.fn(),
});

vi.mock('@/contexts', async () => {
  const actual = await vi.importActual('@/contexts');
  return { ...actual, useAuth: () => authState(), useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }) };
});
vi.mock('@/contexts/auth-context', async () => {
  const actual = await vi.importActual('@/contexts/auth-context');
  return { ...actual, useAuth: () => authState() };
});

// Closed mock - every hook the tree pulls must be here, the layout's included.
// `checkServiceMocks` in scripts/verify.mjs reads the layout's hook list at
// runtime and fails this file if one is missing.
//
// `mutateAsync`, not `mutate`: the shared ReferenceLibraryPane awaits every
// write, because it owns `editingId` and so owns whether the editor closes on a
// failure. A double without it makes the pane's catch swallow a TypeError,
// which surfaces as "the create did not clear the form" rather than as
// anything naming the real problem.
const noMutation = () => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  isPending: false, isError: false, error: null,
});
// The create hooks resolve, because what happens AFTER the await is the point
// of the "creating while filtered" test below - a write that never settles
// would pass that test by never running the code it is about.
const okMutation = () => ({
  mutate: vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => { opts?.onSuccess?.(); }),
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  isPending: false, isError: false, error: null,
});
// The two create writes the ownership tests read back. Hoisted because the
// @/services factory below is.
const createSpies = vi.hoisted(() => ({
  service: vi.fn().mockResolvedValue(undefined),
  transport: vi.fn().mockResolvedValue(undefined),
  platform: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services', () => ({
  useTerminals: () => ({ data: undefined, isLoading: false }),
  useKits: () => ({ data: undefined, isLoading: false }),
  useSections: () => ({ data: undefined, isLoading: false }),
  useContracts: () => ({ data: undefined, isLoading: false }),
  useEquipment: () => ({ data: undefined, isLoading: false }),
  useWaveforms: vi.fn(),
  useServices: vi.fn(),
  useWaveformUsage: vi.fn(),
  useServiceUsage: vi.fn(),
  useTransports: vi.fn(),
  usePlatforms: vi.fn(),
  useCreateWaveform: () => okMutation(),
  useUpdateWaveform: () => noMutation(),
  useDeleteWaveform: () => noMutation(),
  useCreateService: () => ({ ...okMutation(), mutateAsync: createSpies.service }),
  useUpdateService: () => noMutation(),
  useDeleteService: () => noMutation(),
  useCreateTransport: () => ({ ...okMutation(), mutateAsync: createSpies.transport }),
  useUpdateTransport: () => noMutation(),
  useDeleteTransport: () => noMutation(),
  useCreatePlatform: () => ({ ...okMutation(), mutateAsync: createSpies.platform }),
  useUpdatePlatform: () => noMutation(),
  useDeletePlatform: () => noMutation(),
  useLogout: () => ({ mutate: vi.fn() }),
  useUpdateSection: () => noMutation(),
  useDeleteSection: () => noMutation(),
  useContractFiscalYears: () => ({ data: [] }),
  useOperations: () => ({ data: undefined, isLoading: false, isError: false }),
  REASSIGN_TO_NONE: '__none__',
}));

import { useWaveforms, useServices, useTransports, usePlatforms, useWaveformUsage, useServiceUsage } from '@/services';
const mockUseWaveforms = vi.mocked(useWaveforms);
const mockUseServices = vi.mocked(useServices);
const mockUseTransports = vi.mocked(useTransports);
const mockUsePlatforms = vi.mocked(usePlatforms);
const mockUseWaveformUsage = vi.mocked(useWaveformUsage);
const mockUseServiceUsage = vi.mocked(useServiceUsage);

const stamps = { created_by: 't', updated_by: 't', created_at: '', updated_at: '' };

beforeEach(() => {
  // Undefined is the honest default: the panes read `usage?.usage[key] ?? []`,
  // so every entry reads as unused unless a test says otherwise. It is also
  // what the pane sees on first paint, before the query resolves.
  mockUseWaveformUsage.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useWaveformUsage>);
  mockUseServiceUsage.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useServiceUsage>);
  mockCanWrite = true;
  mockCanWriteRadio = true;
  mockCanWritePace = true;
  mockUseWaveforms.mockReturnValue({
    data: {
      waveforms: [
        { id: 'w1', abbrev: 'SINCGARS', name: 'Single Channel', description: 'Combat net radio', ...stamps },
        { id: 'w2', abbrev: 'TSM', name: 'TrellisWare Streamscape', description: 'Scalable MANET waveform', ...stamps },
      ],
      total: 2,
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useWaveforms>);
  mockUseServices.mockReturnValue({
    data: {
      services: [
        { id: 's1', abbrev: 'GX', name: 'Global Express', description: '', owned_by: 'Viasat, Inc.', owner_country: 'United States', ...stamps },
        { id: 's2', abbrev: 'ONEWEB', name: 'Eutelsat OneWeb', description: '', owned_by: 'Eutelsat Group', owner_country: 'France', ...stamps },
      ],
      total: 2,
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useServices>);
  mockUseTransports.mockReturnValue({
    data: {
      transports: [
        { id: 't1', name: 'Verizon LTE', kind: 'cellular', provider: '', description: '', owned_by: 'Verizon Communications', owner_country: 'United States', ...stamps },
        // A kind outside the built-in four. Only a custom kind can show that
        // the picker reads the unfiltered list: the four defaults are offered
        // whether or not any row uses them, so filtering cannot remove them.
        { id: 't2', name: 'Hilltop relay', kind: 'troposcatter', provider: '', description: '', owned_by: '', owner_country: '', ...stamps },
      ],
      total: 2,
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useTransports>);
  mockUsePlatforms.mockReturnValue({
    data: {
      platforms: [
        {
          id: 'p1', designation: 'F-35A', popular_name: 'Lightning II',
          category: ['USAF', 'USN', 'USMC'], type: 'aircraft',
          // The only haystack that spreads an array, so the only one where a
          // search can match something the row does not print as plain text.
          waveform_abbrevs: ['MADL'], equipment_ids: [], notes: '', ...stamps,
        },
        {
          id: 'p2', designation: 'DDG-51', popular_name: '', category: ['USN'],
          type: 'ship', waveform_abbrevs: [], equipment_ids: [], notes: '', ...stamps,
        },
      ],
      total: 2,
    },
    isLoading: false,
  } as unknown as ReturnType<typeof usePlatforms>);
});

describe('CommsLibraryPage', () => {
  it('opens on Waveforms and switches to each of the four', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');

    expect(screen.getByRole('button', { name: 'Waveforms' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('SINCGARS')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Services' }));
    expect(screen.getByText('GX')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Transports' }));
    expect(screen.getByText('Verizon LTE')).toBeInTheDocument();
  });

  it('opens the library a link names', () => {
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=transports');
    expect(screen.getByRole('button', { name: 'Transports' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Verizon LTE')).toBeInTheDocument();
  });

  it('falls back to Waveforms on an unrecognised lib', () => {
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=bogus');
    expect(screen.getByRole('button', { name: 'Waveforms' })).toHaveAttribute('aria-pressed', 'true');
  });

  /**
   * The reason the panes had to become self-gating before this route existed.
   *
   * WaveformLibraryPane had no gate of its own - it only ever rendered inside
   * the write-gated editor page. Mounting it on a route anyone can open would
   * have handed waveform create, edit and delete to every viewer.
   */
  it('shows a viewer the libraries without any way to change them', () => {
    mockCanWrite = false;
    mockCanWriteRadio = false;
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');

    expect(screen.getByText('SINCGARS')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a waveform/i })).not.toBeInTheDocument();
  });

  it('gates waveforms on canWriteRadio, which an rto has', () => {
    mockCanWrite = false;
    mockCanWriteRadio = true;
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');
    expect(screen.getByRole('button', { name: /Add a waveform/i })).toBeInTheDocument();
  });

  /**
   * Ported from `catalog-editor-page.test.tsx` when the panes moved here.
   *
   * The four libraries do not share one gate, and each follows its own route
   * rather than its neighbours in the chip row:
   *
   *   Waveforms  - canWriteRadio. Radio reference data, so `rto` writes them.
   *   Services   - canWrite. SATCOM reference data hanging off equipment
   *                records, so `rto` reads and does not write.
   *   Transports - canWritePace. A transport is a path a PACE tier names, and
   *                nothing in the equipment domain references one, so it
   *                follows the card rather than the catalog.
   *   Platforms  - canWritePace. A column of the compatibility matrix a PACE
   *                planner reads, so PACE's writers maintain it.
   *
   * So a role can hold a real write in one of these four and none in another,
   * and both directions have to be pinned or hiding every control
   * unconditionally would pass.
   */
  describe('role gating across the four', () => {
    const asRto = () => { mockCanWrite = false; mockCanWriteRadio = true; mockCanWritePace = true; };
    const asViewer = () => { mockCanWrite = false; mockCanWriteRadio = false; mockCanWritePace = false; };

    it('lets an rto write waveforms', () => {
      asRto();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');
      expect(screen.getByRole('button', { name: /Add a waveform/i })).toBeInTheDocument();
    });

    it('still shows an rto the service library, with no way to change it', () => {
      asRto();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=services');
      expect(screen.getByText('Global Express')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add a service/i })).not.toBeInTheDocument();
      // Matched on the aria-label, not the glyph. The rows carry
      // `aria-label="Edit GX"` now, so a query for the bare glyph would find
      // nothing whether the gate works or not - passing vacuously, which is
      // worse than failing.
      expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
    });

    // An rto writes transports because an rto builds PACE cards, and a
    // transport is a path a tier names. This asserted the opposite until the
    // gate was corrected: transports had been filed as equipment-side
    // reference data, which nothing in the equipment domain bears out.
    it('lets an rto write transports, since an rto builds PACE cards', () => {
      asRto();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=transports');
      expect(screen.getByText('Verizon LTE')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Add a transport/i })).toBeInTheDocument();
    });

    // The refusal direction for transports, which viewer is now the only role
    // to land in. Without it, the gate could be dropped entirely and every
    // other transport assertion here would still pass.
    it('still shows a viewer the transport library, with no way to change it', () => {
      asViewer();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=transports');
      expect(screen.getByText('Verizon LTE')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add a transport/i })).not.toBeInTheDocument();
    });

    // The fourth row of the matrix, which did not exist until the platform pane
    // was converted: no test had ever opened ?lib=platforms, so the closed
    // @/services mock was missing all four platform hooks and the first test to
    // click that chip would have died on `usePlatforms is not a function`.
    // `checkServiceMocks` does not catch that - it only enforces the hooks the
    // layout imports.
    it('lets a planner write the platform library', () => {
      mockCanWrite = false;
      mockCanWriteRadio = false;
      mockCanWritePace = true;
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');

      expect(screen.getByText('F-35A')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Add a platform/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit F-35A' })).toBeInTheDocument();
    });

    it('still shows a viewer the platform library, with no way to change it', () => {
      asViewer();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');

      expect(screen.getByText('F-35A')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add a platform/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
    });

    // The other direction. Without these, hiding the controls unconditionally
    // would pass every assertion above.
    it('gives an admin all three', () => {
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=services');
      expect(screen.getByRole('button', { name: /Add a service/i })).toBeInTheDocument();
    });

    it('gives an admin the transport library too', () => {
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=transports');
      expect(screen.getByRole('button', { name: /Add a transport/i })).toBeInTheDocument();
    });
  });

  describe('search', () => {
    // One case per field, because the haystack is a join and a field dropped
    // out of it fails silently - the other two keep the test green.
    it.each([
      ['description', 'manet', 'TSM', 'SINCGARS'],
      ['abbrev', 'sincg', 'SINCGARS', 'TSM'],
      ['name', 'trellisware', 'TSM', 'SINCGARS'],
    ])('narrows the list on %s', async (_field, query, kept, dropped) => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');

      expect(screen.getByText('SINCGARS')).toBeInTheDocument();
      expect(screen.getByText('TSM')).toBeInTheDocument();

      await user.type(screen.getByLabelText('Search waveforms'), query);

      expect(screen.getByText(kept)).toBeInTheDocument();
      expect(screen.queryByText(dropped)).not.toBeInTheDocument();
    });

    // Both sides of the comparison are lowercased and the query is trimmed.
    // Neither is visible in a query that is already lowercase and unpadded,
    // so each needs a case that is not.
    it.each([['mixed case', 'MaNeT'], ['padding', '  manet  ']])(
      'ignores %s in the query',
      async (_label, query) => {
        const user = userEvent.setup();
        renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');

        await user.type(screen.getByLabelText('Search waveforms'), query);

        expect(screen.getByText('TSM')).toBeInTheDocument();
        expect(screen.queryByText('SINCGARS')).not.toBeInTheDocument();
      },
    );

    // The other two panes were entirely untested. Transport's haystack is the
    // odd one - four fields, and two of them (kind, provider) exist nowhere else.
    it('searches services on abbrev', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=services');

      await user.type(screen.getByLabelText('Search services'), 'gx');

      expect(screen.getByText('GX')).toBeInTheDocument();
    });

    it('searches transports on the kind, which no other pane has', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=transports');

      await user.type(screen.getByLabelText('Search transports'), 'cellular');
      expect(screen.getByText('Verizon LTE')).toBeInTheDocument();

      await user.clear(screen.getByLabelText('Search transports'));
      await user.type(screen.getByLabelText('Search transports'), 'zzzznope');
      expect(screen.queryByText('Verizon LTE')).not.toBeInTheDocument();
    });

    it('is per library, so switching starts clean', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');

      await user.type(screen.getByLabelText('Search waveforms'), 'manet');
      await user.click(screen.getByRole('button', { name: 'Services' }));

      expect(screen.getByLabelText('Search services')).toHaveValue('');
      expect(screen.getByText('GX')).toBeInTheDocument();
    });

    // The add form is not a search result and must not be filtered away with
    // the rows - it is how you act on an empty result.
    it('keeps the add form when nothing matches', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');

      await user.type(screen.getByLabelText('Search waveforms'), 'zzzznope');

      expect(screen.queryByText('SINCGARS')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Add a waveform/i })).toBeInTheDocument();
    });

    // A bare empty body reads as broken, and reads identically to a library
    // nobody has filled in yet. Those are different facts and the reader is
    // the only one who can tell them apart - so say which it is.
    it('says a search matched nothing, quoting the term', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');

      await user.type(screen.getByLabelText('Search waveforms'), 'zzzznope');

      expect(screen.getByText('No waveforms match "zzzznope".')).toBeInTheDocument();
    });

    it('distinguishes an empty library from a search that matched nothing', () => {
      mockUseTransports.mockReturnValue({
        data: { transports: [], total: 0 },
        isLoading: false,
      } as unknown as ReturnType<typeof useTransports>);
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=transports');

      expect(screen.getByText('No transports yet. Add one above.')).toBeInTheDocument();
    });

    // A reader cannot add one, so telling them to is wrong. This is the first
    // thing a viewer sees on Transports, which is empty in a fresh database.
    it('does not tell a reader to add the first row', () => {
      mockCanWrite = false;
      mockCanWriteRadio = false;
      // Transports gate on canWritePace, so a reader here means a viewer -
      // every other role builds PACE cards and may add a path one names.
      mockCanWritePace = false;
      mockUseTransports.mockReturnValue({
        data: { transports: [], total: 0 },
        isLoading: false,
      } as unknown as ReturnType<typeof useTransports>);
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=transports');

      expect(screen.getByText('No transports yet.')).toBeInTheDocument();
    });
  });

  // The one genuinely non-obvious decision in this feature, and the one a
  // refactor to `transports.map(...)` would undo while every other test here
  // stayed green.
  describe('the transport kind picker reads the unfiltered library', () => {
    it('keeps a custom kind on offer while a search hides the row using it', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=transports');
      await user.click(screen.getByRole('button', { name: /Add a transport/i }));

      expect(screen.getByRole('option', { name: 'Troposcatter' })).toBeInTheDocument();

      // Hides the only row carrying that kind. Which kinds the library holds
      // is not a claim the search is making, so the option has to survive.
      await user.type(screen.getByLabelText('Search transports'), 'verizon');

      expect(screen.queryByText('Hilltop relay')).not.toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Troposcatter' })).toBeInTheDocument();
    });
  });

  // #234. The per-entry usage count and the named carrier list, deleted with
  // the Waveforms and Services browse tabs in 67470d7 and brought back where a
  // librarian is already standing rather than as a second matrix.
  describe('library usage readout', () => {
    it('counts the assets carrying each waveform, and names them', () => {
      mockUseWaveformUsage.mockReturnValue({
        data: { usage: { sincgars: ['AN/PRC-158', 'AN/PRC-163'] }, total: 1 },
      } as unknown as ReturnType<typeof useWaveformUsage>);
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');

      expect(screen.getByText('2 assets')).toBeInTheDocument();
      expect(screen.getByText('AN/PRC-158')).toBeInTheDocument();
      expect(screen.getByText('AN/PRC-163')).toBeInTheDocument();
    });

    it('singularises a count of one', () => {
      mockUseWaveformUsage.mockReturnValue({
        data: { usage: { sincgars: ['AN/PRC-158'] }, total: 1 },
      } as unknown as ReturnType<typeof useWaveformUsage>);
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');

      expect(screen.getByText('1 asset')).toBeInTheDocument();
    });

    /**
     * The backend omits an unused abbrev from the map rather than mapping it to
     * an empty list, so a missing key means zero and never "not loaded". TSM is
     * in the fixture library and absent from this map.
     */
    it('reads a missing key as unused rather than as loading', () => {
      mockUseWaveformUsage.mockReturnValue({
        data: { usage: { sincgars: ['AN/PRC-158'] }, total: 1 },
      } as unknown as ReturnType<typeof useWaveformUsage>);
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');

      expect(screen.getByText('unused')).toBeInTheDocument();
    });

    it('matches the abbrev case-insensitively, the way the library is unique', () => {
      // The map is keyed normalised; the library row is not.
      mockUseWaveformUsage.mockReturnValue({
        data: { usage: { tsm: ['MPU5'] }, total: 1 },
      } as unknown as ReturnType<typeof useWaveformUsage>);
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');

      expect(screen.getByText('MPU5')).toBeInTheDocument();
    });

    it('counts the terminals offering each service', () => {
      mockUseServiceUsage.mockReturnValue({
        data: { usage: { gx: ['GX-2', 'GX-10'] }, total: 1 },
      } as unknown as ReturnType<typeof useServiceUsage>);
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=services');

      expect(screen.getByText('2 terminals')).toBeInTheDocument();
      expect(screen.getByText('GX-2')).toBeInTheDocument();
    });
  });

  describe('platform search', () => {
    it('matches on the designation', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');

      await user.type(screen.getByLabelText('Search platforms'), 'ddg');

      expect(screen.getByText('DDG-51')).toBeInTheDocument();
      expect(screen.queryByText('F-35A')).not.toBeInTheDocument();
    });

    it('matches on a branch', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');

      await user.type(screen.getByLabelText('Search platforms'), 'usmc');

      expect(screen.getByText('F-35A')).toBeInTheDocument();
      expect(screen.queryByText('DDG-51')).not.toBeInTheDocument();
    });

    // The only haystack of the four that spreads an array, so the only one
    // where a match can come from something the row does not print as text.
    it('matches on a carried waveform abbrev', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');

      await user.type(screen.getByLabelText('Search platforms'), 'madl');

      expect(screen.getByText('F-35A')).toBeInTheDocument();
      expect(screen.queryByText('DDG-51')).not.toBeInTheDocument();
    });
  });

  // The library filters by what a platform is - its branches and its type -
  // not by what it carries, which the row shows and the matrix answers.
  describe('platform filter bar', () => {
    const bar = () => screen.getByRole('group', { name: 'Category' }).closest('div[style]')!.parentElement!.parentElement!;

    it('offers Category and Type rows, and no waveform filter', () => {
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');
      expect(screen.getByRole('group', { name: 'Category' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Type' })).toBeInTheDocument();
      expect(screen.queryByText(/Filter by waveform/i)).not.toBeInTheDocument();
      expect(within(bar()).queryByRole('button', { name: /^MADL/ })).not.toBeInTheDocument();
    });

    it('filters by a branch', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');
      await user.click(within(screen.getByRole('group', { name: 'Category' })).getByRole('button', { name: /^USMC 1$/ }));
      expect(screen.getByText('F-35A')).toBeInTheDocument();
      expect(screen.queryByText('DDG-51')).not.toBeInTheDocument();
    });

    it('filters by a type, and combines with a branch', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');
      await user.click(within(screen.getByRole('group', { name: 'Type' })).getByRole('button', { name: /^Ship 1$/ }));
      expect(screen.getByText('DDG-51')).toBeInTheDocument();
      expect(screen.queryByText('F-35A')).not.toBeInTheDocument();

      await user.click(within(screen.getByRole('group', { name: 'Category' })).getByRole('button', { name: /^USAF 1$/ }));
      expect(screen.queryByText('DDG-51')).not.toBeInTheDocument();
      expect(screen.getByText(/No platforms with category USAF and type Ship/)).toBeInTheDocument();
    });

    it('shows carried waveforms as plain tiles, not buttons', () => {
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');
      const tile = screen.getByTitle('Carried waveform');
      expect(tile).toHaveTextContent('MADL');
      expect(tile.tagName).toBe('SPAN');
    });
  });

  // The category is the branches operating a platform: a closed list shown as
  // one chip each on the row, and picked as toggles in the form.
  describe('platform branches', () => {
    it('shows one chip per branch on the row, spelled out on hover', () => {
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');

      const cell = screen.getByTitle('US Marine Corps, US Navy, US Air Force');
      expect(cell).toHaveTextContent('USMCUSNUSAF');
    });

    // OGA is filled black, which on the dark form is what an unpressed toggle
    // looks like, so pressed it inverts.
    it('inverts a pressed OGA toggle so it reads as selected on the dark form', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');

      await user.click(screen.getByRole('button', { name: /Add a platform/i }));
      const oga = within(screen.getByRole('group', { name: 'Category - branch' })).getByRole('button', { name: 'OGA' });
      await user.click(oga);

      expect(oga).toHaveAttribute('aria-pressed', 'true');
      // backgroundColor, not the background shorthand: from jsdom 30.1.3 the
      // computed shorthand serializes every longhand, as browsers do, so it no
      // longer equals a bare colour.
      expect(oga).toHaveStyle({ backgroundColor: '#F2F2F2', color: '#111111' });
    });

    // Pressing changes colour only. A pressed chip that took the display chip's
    // tighter padding, missing border and bold weight came out about 10px
    // narrower and shifted every toggle after it.
    it('keeps a toggle the same size pressed and unpressed', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');

      await user.click(screen.getByRole('button', { name: /Add a platform/i }));
      const usn = within(screen.getByRole('group', { name: 'Category - branch' })).getByRole('button', { name: 'USN' });
      // Read off the inline style: jsdom cannot resolve var() inside the
      // border shorthand, so a computed border width means nothing here.
      const geometry = () => {
        const st = usn.style;
        return [st.padding, st.borderWidth || st.border.split(' ')[0], st.fontWeight, st.letterSpacing, st.fontSize];
      };
      const before = geometry();
      await user.click(usn);

      expect(usn).toHaveAttribute('aria-pressed', 'true');
      expect(geometry()).toEqual(before);
    });

    it('sends the toggled branches in precedence order, whatever order they were clicked', async () => {
      const user = userEvent.setup();
      createSpies.platform.mockClear();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');

      await user.click(screen.getByRole('button', { name: /Add a platform/i }));
      await user.type(screen.getByLabelText('Designation'), 'AH-1Z');
      const picker = screen.getByRole('group', { name: 'Category - branch' });
      await user.click(within(picker).getByRole('button', { name: 'USN' }));
      await user.click(within(picker).getByRole('button', { name: 'USA' }));
      await user.click(within(picker).getByRole('button', { name: 'USMC' }));
      await user.click(within(picker).getByRole('button', { name: 'USN' }));
      expect(within(picker).getByRole('button', { name: 'USA', pressed: true })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Add to Platform Library/i }));

      await waitFor(() => {
        expect(createSpies.platform).toHaveBeenCalledWith(
          expect.objectContaining({ designation: 'AH-1Z', category: ['USA', 'USMC'] }),
        );
      });
    });
  });

  // Creating a row while a non-matching search is active used to file it
  // straight back out of view: the mutation succeeded, the form cleared, and
  // nothing appeared. Indistinguishable from a silent failure.
  describe('creating while filtered', () => {
    it('clears the search so the new row is visible', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');

      const box = screen.getByLabelText('Search waveforms');
      await user.type(box, 'zzzznope');
      await user.click(screen.getByRole('button', { name: /Add a waveform/i }));
      await user.type(screen.getByPlaceholderText('SINCGARS'), 'HAVEQUICK');
      await user.click(screen.getByRole('button', { name: /Add to Waveform Library/i }));

      // waitFor because the clear now lands after the awaited write settles,
      // rather than synchronously inside an onSuccess callback.
      await waitFor(() => { expect(box).toHaveValue(''); });
    });
  });
});

// Who owns a service or transport, and where. The panes share OwnerCell for the
// wide layout and MetaLine for the narrow one, so each layout is pinned once.
describe('CommsLibraryPage ownership', () => {
  const setWide = (wide: boolean) => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: wide, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
  };
  beforeEach(() => { setWide(false); });

  it('puts owner and country on one line beneath the row on a narrow screen', () => {
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=services');
    expect(screen.getByText('Viasat, Inc. · United States')).toBeInTheDocument();
  });

  it('gives owner and country their own column on a wide screen', () => {
    setWide(true);
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=services');
    expect(screen.getByText('Eutelsat Group')).toBeInTheDocument();
    expect(screen.getByText('France')).toBeInTheDocument();
  });

  it('folds kind, provider and owner into the transport line on a narrow screen', () => {
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=transports');
    expect(screen.getByText('Cellular · Verizon Communications, United States')).toBeInTheDocument();
  });

  // One case per new field: the haystack is a join, and a field dropped out of
  // it fails silently while the others keep a broader test green.
  it('searches services on the owner country', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=services');

    await user.type(screen.getByLabelText('Search services'), 'france');

    expect(screen.getByText('ONEWEB')).toBeInTheDocument();
    expect(screen.queryByText('GX')).not.toBeInTheDocument();
  });

  it('searches transports on the owner', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=transports');

    await user.type(screen.getByLabelText('Search transports'), 'verizon communications');

    expect(screen.getByText('Verizon LTE')).toBeInTheDocument();
    expect(screen.queryByText('Hilltop relay')).not.toBeInTheDocument();
  });

  // The edit box is the same grid of inputs as the add form, and without its
  // column titles a reader had to guess which box was the owner and which the
  // country from whatever values happened to be in them.
  it('titles the fields when an existing record is being edited', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=services');
    expect(screen.queryByText('Owned by')).not.toBeInTheDocument();

    await user.click(screen.getByText('Global Express'));

    for (const h of ['Abbrev', 'Name', 'Owned by', 'Country', 'Description']) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
    expect(screen.getByDisplayValue('Viasat, Inc.')).toBeInTheDocument();
  });

  it("sends a new service's owner and country, trimmed", async () => {
    const user = userEvent.setup();
    createSpies.service.mockClear();
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=services');

    await user.click(screen.getByRole('button', { name: /Add a service/i }));
    await user.type(screen.getByPlaceholderText('GX'), 'HCX');
    await user.type(screen.getByPlaceholderText('Viasat'), ' Viasat, Inc. ');
    await user.type(screen.getByPlaceholderText('United States'), 'United States ');
    await user.click(screen.getByRole('button', { name: /Add to Service Library/i }));

    await waitFor(() => {
      expect(createSpies.service).toHaveBeenCalledWith(
        expect.objectContaining({ abbrev: 'HCX', owned_by: 'Viasat, Inc.', owner_country: 'United States' }),
      );
    });
  });

  it("sends a new transport's owner and country, trimmed", async () => {
    const user = userEvent.setup();
    createSpies.transport.mockClear();
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=transports');

    await user.click(screen.getByRole('button', { name: /Add a transport/i }));
    await user.type(screen.getByPlaceholderText('Verizon LTE'), 'T-Mobile US Cellular');
    await user.type(screen.getByPlaceholderText('Owned by'), ' Deutsche Telekom');
    await user.type(screen.getByPlaceholderText('Country'), 'Germany ');
    await user.click(screen.getByRole('button', { name: /Add to Transport Library/i }));

    await waitFor(() => {
      expect(createSpies.transport).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'T-Mobile US Cellular', owned_by: 'Deutsche Telekom', owner_country: 'Germany' }),
      );
    });
  });
});

describe('CommsLibraryPage document actions', () => {
  it('offers Print / Save PDF and share on every library, and Print opens the print route for the open one', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=services');

    expect(screen.getByRole('button', { name: 'share this sheet' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Print / Save PDF' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(String(open.mock.calls[0]?.[0])).toBe('/catalog/comms-library/print?lib=services');
    open.mockRestore();
  });

  it('leaves the default library out of the print URL, as the page does', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');
    await user.click(screen.getByRole('button', { name: 'Print / Save PDF' }));
    expect(String(open.mock.calls[0]?.[0])).toBe('/catalog/comms-library/print');
    open.mockRestore();
  });
});

describe('CommsLibraryPrintPage', () => {
  it('prints the named library read only: rows, no add form, no pencils, even for a writer', () => {
    mockCanWrite = true;
    renderWithRoute(<CommsLibraryPrintPage />, '/catalog/comms-library/print?lib=services');

    expect(screen.getByText('GX')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add (to .* Library|a )/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Back to library' })).toBeInTheDocument();
  });

  it('falls back to Waveforms on an unrecognised lib', () => {
    renderWithRoute(<CommsLibraryPrintPage />, '/catalog/comms-library/print?lib=bogus');
    expect(screen.getByText('SINCGARS')).toBeInTheDocument();
  });
});

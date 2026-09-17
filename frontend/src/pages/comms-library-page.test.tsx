import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithRoute, screen, waitFor } from '@/test/utils';
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
  useCreateService: () => okMutation(),
  useUpdateService: () => noMutation(),
  useDeleteService: () => noMutation(),
  useCreateTransport: () => okMutation(),
  useUpdateTransport: () => noMutation(),
  useDeleteTransport: () => noMutation(),
  useCreatePlatform: () => okMutation(),
  useUpdatePlatform: () => noMutation(),
  useDeletePlatform: () => noMutation(),
  useLogout: () => ({ mutate: vi.fn() }),
  useUpdateSection: () => noMutation(),
  useDeleteSection: () => noMutation(),
  useContractFiscalYears: () => ({ data: [] }),
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
    data: { services: [{ id: 's1', abbrev: 'GX', name: 'Global Express', description: '', ...stamps }], total: 1 },
    isLoading: false,
  } as unknown as ReturnType<typeof useServices>);
  mockUseTransports.mockReturnValue({
    data: {
      transports: [
        { id: 't1', name: 'Verizon LTE', kind: 'cellular', provider: '', description: '', ...stamps },
        // A kind outside the built-in four. Only a custom kind can show that
        // the picker reads the unfiltered list: the four defaults are offered
        // whether or not any row uses them, so filtering cannot remove them.
        { id: 't2', name: 'Hilltop relay', kind: 'troposcatter', provider: '', description: '', ...stamps },
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
          category: 'joint', kind: 'aircraft', operator: 'USAF',
          // The only haystack that spreads an array, so the only one where a
          // search can match something the row does not print as plain text.
          waveform_abbrevs: ['MADL'], equipment_ids: [], notes: '', ...stamps,
        },
        {
          id: 'p2', designation: 'DDG-51', popular_name: '', category: 'organic',
          kind: 'ship', operator: '', waveform_abbrevs: [], equipment_ids: [], notes: '', ...stamps,
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
    expect(screen.queryByRole('button', { name: /Add to Waveform Library/i })).not.toBeInTheDocument();
  });

  it('gates waveforms on canWriteRadio, which an rto has', () => {
    mockCanWrite = false;
    mockCanWriteRadio = true;
    renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');
    expect(screen.getByRole('button', { name: /Add to Waveform Library/i })).toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: /Add to Waveform Library/i })).toBeInTheDocument();
    });

    it('still shows an rto the service library, with no way to change it', () => {
      asRto();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=services');
      expect(screen.getByText('Global Express')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add to Service Library/i })).not.toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: /Add to Transport Library/i })).toBeInTheDocument();
    });

    // The refusal direction for transports, which viewer is now the only role
    // to land in. Without it, the gate could be dropped entirely and every
    // other transport assertion here would still pass.
    it('still shows a viewer the transport library, with no way to change it', () => {
      asViewer();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=transports');
      expect(screen.getByText('Verizon LTE')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add to Transport Library/i })).not.toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: /Add to Platform Library/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit F-35A' })).toBeInTheDocument();
    });

    it('still shows a viewer the platform library, with no way to change it', () => {
      asViewer();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=platforms');

      expect(screen.getByText('F-35A')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add to Platform Library/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
    });

    // The other direction. Without these, hiding the controls unconditionally
    // would pass every assertion above.
    it('gives an admin all three', () => {
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=services');
      expect(screen.getByRole('button', { name: /Add to Service Library/i })).toBeInTheDocument();
    });

    it('gives an admin the transport library too', () => {
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library?lib=transports');
      expect(screen.getByRole('button', { name: /Add to Transport Library/i })).toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: /Add to Waveform Library/i })).toBeInTheDocument();
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

      expect(screen.getByRole('option', { name: 'Troposcatter' })).toBeInTheDocument();

      // Hides the only row carrying that kind. Which kinds the library holds
      // is not a claim the search is making, so the option has to survive.
      await user.type(screen.getByLabelText('Search transports'), 'verizon');

      expect(screen.queryByText('Hilltop relay')).not.toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Troposcatter' })).toBeInTheDocument();
    });
  });

  // The per-entry usage count and the named carrier list, deleted with
  // the Waveforms and Services browse tabs in an earlier commit and brought back where a
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

  // Creating a row while a non-matching search is active used to file it
  // straight back out of view: the mutation succeeded, the form cleared, and
  // nothing appeared. Indistinguishable from a silent failure.
  describe('creating while filtered', () => {
    it('clears the search so the new row is visible', async () => {
      const user = userEvent.setup();
      renderWithRoute(<CommsLibraryPage />, '/catalog/comms-library');

      const box = screen.getByLabelText('Search waveforms');
      await user.type(box, 'zzzznope');
      await user.type(screen.getByPlaceholderText('SINCGARS'), 'HAVEQUICK');
      await user.click(screen.getByRole('button', { name: /Add to Waveform Library/i }));

      // waitFor because the clear now lands after the awaited write settles,
      // rather than synchronously inside an onSuccess callback.
      await waitFor(() => { expect(box).toHaveValue(''); });
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
    expect(screen.queryByRole('button', { name: /Add to .* Library/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Back to library' })).toBeInTheDocument();
  });

  it('falls back to Waveforms on an unrecognised lib', () => {
    renderWithRoute(<CommsLibraryPrintPage />, '/catalog/comms-library/print?lib=bogus');
    expect(screen.getByText('SINCGARS')).toBeInTheDocument();
  });
});

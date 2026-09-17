import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import userEvent from '@testing-library/user-event';

import { renderWithRoute, screen, within } from '@/test/utils';
import { CatalogEditorPage, EquipmentFormPane } from './catalog-editor-page';
import { blankDraft } from './catalog-editor-draft';
import type { Equipment, EquipmentService, Service } from '@/types';

// The route id is the only thing that decides whether the editor opens a stored
// record or a blank draft, so it moves per test.
const { mockParams } = vi.hoisted(() => ({
  mockParams: { id: undefined as string | undefined },
}));

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useParams: () => mockParams,
  useNavigate: () => vi.fn(),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

// GX carries CIR figures and is in the library; WGS is in the library with no
// rates; LEGACY is in neither library nor any other record - the shape a
// hand-entered row has once it is stored.
const svcGX: EquipmentService = {
  abbrev: 'GX', name: 'Inmarsat Global Express', description: 'commercial ka beam',
  cir: { dl: 5, ul: 1 },
};
const svcWGS: EquipmentService = {
  abbrev: 'WGS', name: 'Wideband Global SATCOM', description: 'military wideband',
};
const svcLegacy: EquipmentService = {
  abbrev: 'LEGACY', name: 'Retired Beam', description: 'typed in by hand',
  mir: { dl: 2 },
};

const equipment = {
  id: 'gatr', nomenclature: 'GATR-2', terminal_type: 'satcom', operational_mode: [],
  data: { services: [svcGX, svcWGS, svcLegacy], waveforms: [] },
  created_by: 't', updated_by: 't', created_at: '', updated_at: '',
} as unknown as Equipment;

const libServices = [
  { id: 's1', abbrev: 'GX', name: 'Inmarsat Global Express', description: 'Ka-band commercial', created_by: 't', updated_by: 't', created_at: '', updated_at: '' },
  { id: 's2', abbrev: 'WGS', name: 'Wideband Global SATCOM', description: 'Military X/Ka', created_by: 't', updated_by: 't', created_at: '', updated_at: '' },
] as unknown as Service[];

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Query state the tests move around, swapped in beforeEach or in the test body
// before the render.
let itemState: { data: Equipment | undefined; isLoading: boolean };
let servicesState: {
  data: { services: Service[]; total: number } | undefined;
  isLoading: boolean;
  isError: boolean;
};

// Stable spies, not fresh vi.fn()s per render: the save payload is what proves a
// hand-entered service actually reached the server.
const updateEquipment = vi.fn();

// Closed mock - every hook the render tree pulls must be listed, including the
// sidebar/header hooks MainLayout mounts.
vi.mock('@/services', () => ({
  // Editor
  useEquipment: () => ({ data: { equipment: [], total: 0 }, isLoading: false }),
  useEquipmentItem: () => itemState,
  useCreateEquipment: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateEquipment: () => ({ mutate: updateEquipment, isPending: false }),
  useDeleteEquipment: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadEquipmentPhoto: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useWaveforms: () => ({ data: { waveforms: [], total: 0 }, isLoading: false }),
  useCreateWaveform: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useUpdateWaveform: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteWaveform: () => ({ mutate: vi.fn(), isPending: false }),
  useServices: () => servicesState,
  useCreateService: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useUpdateService: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteService: () => ({ mutate: vi.fn(), isPending: false }),
  useTransports: () => ({ data: { transports: [], total: 0 }, isLoading: false }),
  useCreateTransport: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useUpdateTransport: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTransport: () => ({ mutate: vi.fn(), isPending: false }),
  // MainLayout: sidebar, header and the section dialog
  useSections: () => ({ data: undefined, isLoading: false }),
  useContractFiscalYears: () => ({ data: [] }),
  useUpdateSection: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSection: () => ({ mutate: vi.fn(), isPending: false }),
  useTerminals: () => ({ data: undefined, isLoading: false }),
  useKits: () => ({ data: undefined, isLoading: false }),
  useContracts: () => ({ data: undefined, isLoading: false }),
  useLogout: () => ({ mutate: vi.fn() }),
  REASSIGN_TO_NONE: '__none__',
}));

const adminAuth = () => ({
  user: { id: '1', name: 'Test User', email: 'test@test.com', roles: ['admin'] },
  isAuthenticated: true, isLoading: false, isError: false,
  role: 'admin', isAdmin: true, canWrite: true, canWriteRadio: true,
  refetch: vi.fn(),
});

/** An rto writer: radio equipment yes, SATCOM reference data no. This role is
 *  unreachable in the browser - dev returns a hardcoded admin - so the role
 *  gating on this page exists only here. */
const rtoAuth = () => ({
  ...adminAuth(),
  user: { id: '2', name: 'Radio Op', email: 'rto@test.com', roles: ['rto'] },
  role: 'rto', isAdmin: false, canWrite: false, canWriteRadio: true,
});

// Swapped by the role tests, restored in beforeEach.
let auth = adminAuth;
const authState = () => auth();
vi.mock('@/contexts', async () => ({
  ...(await vi.importActual('@/contexts')),
  useAuth: () => authState(),
  useThemeMode: () => ({ mode: 'light', toggleTheme: vi.fn() }),
}));
vi.mock('@/contexts/auth-context', async () => ({
  ...(await vi.importActual('@/contexts/auth-context')),
  useAuth: () => authState(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Section 03 of the form. The datasheet preview repeats the abbrevs, so every
 *  service query is scoped here rather than to the whole document. */
const servicesSection = () => screen.getByText('Services Available').closest('section')!;

/** The row-list cards, in render order. SHFRowList puts each row's ✕ in an
 *  absolutely-positioned toolbar inside the card, which is the only stable
 *  handle on the card itself. */
function serviceRows(): HTMLElement[] {
  return within(servicesSection())
    .queryAllByRole('button', { name: '✕' })
    .map(btn => btn.parentElement!.parentElement as HTMLElement);
}

/** The row whose abbrev reads `abbrev`, however that row renders it: a span for
 *  a library-owned row, an input for a hand-entered one. */
function serviceRow(abbrev: string): HTMLElement {
  const row = serviceRows().find(
    r => within(r).queryByText(abbrev) ?? within(r).queryByDisplayValue(abbrev),
  );
  if (!row) throw new Error(`no service row for "${abbrev}"`);
  return row;
}

/** CIR DL, CIR UL, MIR DL, MIR UL - the rate inputs, in form order. */
const rateInputs = (row: HTMLElement) =>
  within(row).getAllByRole<HTMLInputElement>('spinbutton');

const addServiceButton = () =>
  within(servicesSection()).queryByRole('button', { name: '+ Add Service' });

/** The services the last Save actually sent. */
function savedServices(): EquipmentService[] {
  const arg = updateEquipment.mock.calls[0]?.[0] as
    { data: { data: { services: EquipmentService[] } } } | undefined;
  if (!arg) throw new Error('save was never called');
  return arg.data.data.services;
}

let confirmSpy: MockInstance<(message?: string) => boolean>;

beforeEach(() => {
  vi.clearAllMocks();
  auth = adminAuth;
  mockParams.id = 'gatr';
  itemState = { data: equipment, isLoading: false };
  servicesState = { data: { services: libServices, total: libServices.length }, isLoading: false, isError: false };
  // Stubbed per test: jsdom has no confirm, and whether it was asked at all is
  // the whole point of the removal tests.
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
});

// ─── A. Manual service entry ────────────────────────────────────────────────
//
// The chips are the normal route, but they made the Service Library a hard
// dependency: an empty or failing library left a SATCOM terminal with no way to
// enter its services at all.

describe('CatalogEditorPage manual service entry', () => {
  it('offers Add Service even with a populated library', () => {
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');
    expect(addServiceButton()).toBeInTheDocument();
  });

  it('adds an empty, editable row on Add Service', async () => {
    mockParams.id = undefined;
    itemState = { data: undefined, isLoading: false };
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/editor');

    expect(serviceRows()).toHaveLength(0);
    await user.click(addServiceButton()!);

    const [row] = serviceRows();
    expect(row).toBeDefined();
    const abbrev = within(row!).getByPlaceholderText('GX');
    expect(abbrev).toHaveValue('');
    await user.type(abbrev, 'MUOS');
    expect(within(serviceRow('MUOS')).getByPlaceholderText('GX')).toHaveValue('MUOS');
  });

  it('keeps abbrev and name editable on a row the library does not own', () => {
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');
    const row = serviceRow('LEGACY');

    expect(within(row).getByPlaceholderText('GX')).toHaveValue('LEGACY');
    expect(within(row).getByPlaceholderText('Inmarsat Global Express')).toHaveValue('Retired Beam');
  });

  it('reads abbrev and name rather than editing them on a library row', () => {
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');
    const row = serviceRow('GX');

    // The library owns these two fields, so the row shows them as text.
    expect(within(row).queryByPlaceholderText('GX')).toBeNull();
    expect(within(row).queryByPlaceholderText('Inmarsat Global Express')).toBeNull();
    expect(within(row).getByText('GX')).toBeInTheDocument();
    expect(within(row).getByText('Inmarsat Global Express')).toBeInTheDocument();
  });

  it('still takes a hand-entered service when the library is empty', async () => {
    servicesState = { data: { services: [], total: 0 }, isLoading: false, isError: false };
    mockParams.id = undefined;
    itemState = { data: undefined, isLoading: false };
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/editor');

    // No chips to click, so the row list is the only way in.
    expect(within(servicesSection()).getByText(/No services in the library yet/)).toBeInTheDocument();
    await user.click(addServiceButton()!);
    await user.type(within(serviceRows()[0]!).getByPlaceholderText('GX'), 'MUOS');

    expect(within(serviceRow('MUOS')).getByPlaceholderText('GX')).toHaveValue('MUOS');
  });

  it('still takes a hand-entered service when the library query fails', async () => {
    servicesState = { data: undefined, isLoading: false, isError: true };
    mockParams.id = undefined;
    itemState = { data: undefined, isLoading: false };
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/editor');

    await user.click(addServiceButton()!);
    await user.type(within(serviceRows()[0]!).getByPlaceholderText('GX'), 'MUOS');

    expect(within(serviceRow('MUOS')).getByPlaceholderText('GX')).toHaveValue('MUOS');
  });

  // An unreachable library and an empty one both leave globalServices empty, so
  // without this the user is told to go fill a library that may be fine.
  it('says the library could not load rather than that it is empty', () => {
    servicesState = { data: undefined, isLoading: false, isError: true };
    mockParams.id = undefined;
    itemState = { data: undefined, isLoading: false };
    renderWithRoute(<CatalogEditorPage />, '/catalog/editor');

    const section = servicesSection();
    expect(within(section).getByText(/Could not load the Service Library/)).toBeInTheDocument();
    expect(within(section).queryByText(/No services in the library yet/)).not.toBeInTheDocument();
  });

  it('sends a hand-entered service and its rates on Save', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    await user.click(addServiceButton()!);
    const rows = serviceRows();
    const row = rows[rows.length - 1]!;
    await user.type(within(row).getByPlaceholderText('GX'), 'MUOS');
    await user.type(rateInputs(row)[0]!, '7');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(savedServices()).toEqual([
      svcGX, svcWGS, svcLegacy,
      { abbrev: 'MUOS', name: '', description: '', cir: { dl: 7 } },
    ]);
  });
});

// ─── B. The removal confirm gate ────────────────────────────────────────────
//
// Rates are typed in per terminal, so re-adding the service from the library
// does not bring them back. Every path that can drop a row asks first.

describe('CatalogEditorPage service removal', () => {
  it('asks before a library chip drops a row carrying rates', async () => {
    confirmSpy.mockReturnValue(false);
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    await user.click(within(servicesSection()).getByRole('button', { name: 'GX' }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('GX'));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('CIR/MIR'));
    // Cancelled: the row and both figures are still there.
    const row = serviceRow('GX');
    expect(rateInputs(row)[0]).toHaveValue(5);
    expect(rateInputs(row)[1]).toHaveValue(1);
  });

  it('drops the row once the library chip prompt is confirmed', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    await user.click(within(servicesSection()).getByRole('button', { name: 'GX' }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(serviceRows()).toHaveLength(2);
    expect(() => serviceRow('GX')).toThrow();
  });

  it('asks before the orphan chip drops a row carrying rates', async () => {
    confirmSpy.mockReturnValue(false);
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    await user.click(within(servicesSection()).getByRole('button', { name: 'LEGACY ✕' }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('LEGACY'));
    expect(rateInputs(serviceRow('LEGACY'))[2]).toHaveValue(2);
  });

  it('drops the row once the orphan chip prompt is confirmed', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    await user.click(within(servicesSection()).getByRole('button', { name: 'LEGACY ✕' }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(serviceRows()).toHaveLength(2);
    expect(() => serviceRow('LEGACY')).toThrow();
  });

  it("asks before the row's own ✕ drops a row carrying rates", async () => {
    confirmSpy.mockReturnValue(false);
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    await user.click(within(serviceRow('GX')).getByRole('button', { name: '✕' }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('GX'));
    expect(rateInputs(serviceRow('GX'))[0]).toHaveValue(5);
  });

  it("drops the row once the row's own ✕ prompt is confirmed", async () => {
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    await user.click(within(serviceRow('GX')).getByRole('button', { name: '✕' }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(serviceRows()).toHaveLength(2);
    expect(() => serviceRow('GX')).toThrow();
  });

  it('drops a row with no rates without asking, by chip or by ✕', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    await user.click(within(serviceRow('WGS')).getByRole('button', { name: '✕' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(serviceRows()).toHaveLength(2);

    // Re-tick from the library, then remove it the other way.
    await user.click(within(servicesSection()).getByRole('button', { name: 'WGS' }));
    expect(serviceRows()).toHaveLength(3);
    await user.click(within(servicesSection()).getByRole('button', { name: 'WGS' }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(serviceRows()).toHaveLength(2);
  });

  it('does not ask when an edit keeps every row', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    // A description edit on a library row, and a retyped abbrev on a
    // hand-entered one - the abbrev is the row's identity, so without the
    // length check first this would read as a removal on every keystroke.
    await user.type(within(serviceRow('GX')).getByDisplayValue('commercial ka beam'), '!');
    await user.type(within(serviceRow('LEGACY')).getByPlaceholderText('GX'), '-2');

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(serviceRows()).toHaveLength(3);
    expect(within(serviceRow('LEGACY-2')).getByPlaceholderText('GX')).toHaveValue('LEGACY-2');
  });

  it('does not ask when a reorder keeps every row', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    await user.click(within(serviceRows()[0]!).getByRole('button', { name: '▼' }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(serviceRows()).toHaveLength(3);
    // GX moved down a slot; its rates rode along.
    expect(within(serviceRows()[1]!).getByText('GX')).toBeInTheDocument();
    expect(rateInputs(serviceRows()[1]!)[0]).toHaveValue(5);
  });
});

// Best Effort is the one way rate figures used to disappear without passing the
// confirm gate above: row count does not change, so nothing prompted, and the
// numbers were cleared outright. The flag now stands on its own - the fields
// disable and the datasheet prints "best effort" over any figures - so ticking
// it is reversible.
describe('catalog editor - Best Effort keeps the rates it hides', () => {
  const beCheckbox = (row: HTMLElement) =>
    within(row).getByRole('checkbox', { name: /Best Effort/ });

  it('disables the rate fields but leaves their values in place', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    const row = serviceRow('GX');
    expect(rateInputs(row)[0]).toHaveValue(5);

    await user.click(beCheckbox(row));

    const [cirDl, cirUl] = rateInputs(serviceRow('GX'));
    expect(cirDl).toBeDisabled();
    expect(cirDl).toHaveValue(5);
    expect(cirUl).toHaveValue(1);
  });

  it('gives the rates back when it is unticked', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    await user.click(beCheckbox(serviceRow('GX')));
    await user.click(beCheckbox(serviceRow('GX')));

    const [cirDl, cirUl] = rateInputs(serviceRow('GX'));
    expect(cirDl).toBeEnabled();
    expect(cirDl).toHaveValue(5);
    expect(cirUl).toHaveValue(1);
  });

  it('never prompts, because nothing is being discarded', async () => {
    const user = userEvent.setup();
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    await user.click(beCheckbox(serviceRow('GX')));

    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

// ─── D. Role gating in the new-record rail ─────────────────────────────────
//
// The library panes moved to /catalog/comms-library and their gating is
// covered in comms-library-page.test.tsx. What is left here is the editor's
// own rail.
//
// The editor admits an rto writer, because POST /api/v1/equipment does, and
// then narrows per record: a blank draft starts radio, and a stored satcom
// record meets the refusal screen instead of the form.

describe('reference libraries and an rto writer', () => {
  beforeEach(() => {
    auth = rtoAuth;
    // A stored satcom record meets an rto with the refusal screen instead of
    // the editor, so the way in is a blank draft - which starts on the radio
    // side for this role.
    mockParams.id = undefined;
    itemState = { data: undefined, isLoading: false };
  });

  it('offers + RADIO alone in the new-record rail, since + SATCOM only ever refuses', () => {
    renderWithRoute(<CatalogEditorPage />, '/catalog/editor');

    expect(screen.getByRole('button', { name: '+RADIO' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+SATCOM' })).toBeNull();
  });
});

describe('reference libraries and admin', () => {
  // The other direction. Without these, hiding the controls unconditionally
  // would pass every assertion above.
  beforeEach(() => {
    mockParams.id = undefined;
    itemState = { data: undefined, isLoading: false };
  });

  it('offers both + SATCOM and + RADIO', () => {
    renderWithRoute(<CatalogEditorPage />, '/catalog/editor');

    expect(screen.getByRole('button', { name: '+SATCOM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+RADIO' })).toBeInTheDocument();
  });
});

// ─── E. The photo control carries its own gate ─────────────────────────────
//
// The upload control sits in EquipmentFormPane and used to read no permission
// at all - it was safe only because CatalogEditorPage early-returns a refusal
// before rendering the pane. That is the shape the earlier WaveformLibraryPane
// fix named: a gate inherited from a parent is not a gate the component has. It
// now takes `canEdit` as a prop.
//
// Note what these can and cannot pin. Because the page refuses first, `canEdit`
// is always true by the time the pane renders, so the false branch is not
// reachable from here by construction - which is precisely why the prop is
// worth having and not worth deleting as dead. What is pinned below is the
// positive direction on both roles that reach the form (so the control cannot
// be dropped or hidden unconditionally), and the page-level refusal that is the
// only way the control is withheld today.

describe('the photo control', () => {
  beforeEach(() => {
    mockParams.id = 'gatr';
    // A saved record: the photo controls replace the "Save the record first"
    // placeholder only once the record exists.
    itemState = { data: equipment, isLoading: false };
  });

  it('offers Upload Photo to an admin on a saved record', () => {
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    expect(screen.getByRole('button', { name: /Upload Photo/i })).toBeInTheDocument();
  });

  it('offers it to an rto on a radio record, which that role may edit', () => {
    auth = rtoAuth;
    itemState = {
      data: { ...equipment, id: 'prc152', nomenclature: 'AN/PRC-152', terminal_type: 'radio' } as unknown as Equipment,
      isLoading: false,
    };
    renderWithRoute(<CatalogEditorPage />, '/catalog/prc152/edit');

    expect(screen.getByRole('button', { name: /Upload Photo/i })).toBeInTheDocument();
  });

  it('withholds it from an rto on a SATCOM record, which refuses before the form', () => {
    auth = rtoAuth;
    renderWithRoute(<CatalogEditorPage />, '/catalog/gatr/edit');

    expect(screen.getByText(/only edit radio equipment/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upload Photo/i })).toBeNull();
  });

  // The gate's own direction, which the page cannot reach: it refuses before
  // rendering the pane, so canEdit is always true by the time the photo block
  // exists. Rendering the pane directly is the only way to assert the control
  // DISAPPEARS - and without this, the gate could be deleted and every
  // assertion above would still pass.
  describe('rendered directly, so canEdit can be false', () => {
    const paneProps = (canEdit: boolean) => ({
      // A saved record, so the photo controls replace the "save first" note.
      draft: { ...blankDraft('satcom'), id: 'gatr', nomenclature: 'GATR-2' },
      isNew: false,
      globalWaveforms: [],
      globalServices: libServices,
      servicesUnavailable: false,
      onPatch: vi.fn(),
      canEdit,
    });

    it('hides Upload Photo when canEdit is false', () => {
      renderWithRoute(<EquipmentFormPane {...paneProps(false)} />, '/catalog/gatr/edit');

      expect(screen.queryByRole('button', { name: /Upload Photo/i })).toBeNull();
    });

    it('shows it when canEdit is true, so the assertion above is not vacuous', () => {
      renderWithRoute(<EquipmentFormPane {...paneProps(true)} />, '/catalog/gatr/edit');

      expect(screen.getByRole('button', { name: /Upload Photo/i })).toBeInTheDocument();
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { useLocation } from 'react-router';

import { cleanup, renderWithRoute, screen, within } from '@/test/utils';
import type { Equipment, Participant, Phase, Platform, Site } from '@/types';
import { ParticipantBoard } from './participant-board';
import { PAIR_COLOR } from './phase-plan-model';

const stamps = { created_by: 't', updated_by: 't', created_at: '', updated_at: '' };
const EQUIPMENT: Equipment[] = [
  {
    id: 'tsc-198', nomenclature: 'AN/TSC-198', nickname: 'Phoenix', terminal_type: 'satcom', operational_mode: [],
    data: {
      services: [{ abbrev: 'WGS', name: 'WGS' }], waveforms: [{ abbrev: 'MUOS', name: 'MUOS' }], bands: [],
      standard_specs: {}, physical_specs: [], rf_specs: [], swap: {}, features: [],
    },
    ...stamps,
  },
  {
    id: 'prc-152', nomenclature: 'AN/PRC-152', nickname: '', terminal_type: 'radio', operational_mode: [],
    data: {
      services: [], waveforms: [{ abbrev: 'ANW2', name: 'ANW2' }, { abbrev: 'SRW', name: 'SRW' }], bands: [],
      standard_specs: {}, physical_specs: [], rf_specs: [], swap: {}, features: [],
    },
    ...stamps,
  },
  {
    id: 'rt-1', nomenclature: 'AN/PRC-RT1', nickname: '', terminal_type: 'radio', operational_mode: [],
    data: {
      services: [], waveforms: [{ abbrev: 'L16', name: 'L16' }], bands: [],
      standard_specs: {}, physical_specs: [], rf_specs: [], swap: {}, features: [],
    },
    ...stamps,
  },
];
const TRANSPORTS =[{ id: 't1', name: 'Base fiber', kind: 'fiber', provider: '', description: '', owned_by: '', owner_country: '', ...stamps }];

// A Stryker carrying L16 of its own and listing the PRC-152, and a Black
// Hawk with nothing typed against it.
const PLATFORMS: Platform[] = [
  { id: 'stryker', designation: 'M1126', popular_name: 'Stryker', category: ['USA'], type: 'ground vehicle', waveform_abbrevs: ['L16'], equipment_ids: ['prc-152'], notes: '', ...stamps },
  { id: 'uh-60', designation: 'UH-60M', popular_name: '', category: ['USA', 'USN'], type: 'aircraft', waveform_abbrevs: [], equipment_ids: [], notes: '', ...stamps },
];

// The library the By phase table's model is built from, in the order its rows
// come: ANW2 and SRW are what the PRC-152 carries, L16 the Stryker's and the
// RT-1's, MUOS the TSC-198's.
const WAVEFORMS = ['ANW2', 'SRW', 'L16', 'MUOS'].map((abbrev, i) => ({ id: `w${String(i)}`, abbrev, name: abbrev }));

vi.mock('@/services', () => ({
  useEquipment: () => ({ data: { equipment: EQUIPMENT, total: EQUIPMENT.length }, isLoading: false }),
  usePlatforms: () => ({ data: { platforms: PLATFORMS, total: PLATFORMS.length }, isLoading: false }),
  useTransports: () => ({ data: { transports: TRANSPORTS, total: TRANSPORTS.length }, isLoading: false }),
  useWaveforms: () => ({ data: { waveforms: WAVEFORMS, total: WAVEFORMS.length }, isLoading: false }),
  useServices: () => ({ data: { services: [], total: 0 }, isLoading: false }),
}));

const GREEN: Participant = {
  id: 'p1', operation_id: 'op-1', organization_key: 'green',
  organization: { key: 'green', name: 'Green', short_label: 'GREEN', branch: 'USA', color: '#2E7D32', adhoc: false },
  platform_ids: [], equipment_ids: ['tsc-198', 'prc-152', 'gone-1'], waveform_abbrevs: ['SRW', 'L16'], service_abbrevs: ['WGS', 'INMARSAT'], transport_ids: ['t1'],
  asset_phases: {},
  poc_name: 'Capt Lee', poc_phone: '555-0100', poc_email: '', notes: '',
  ...stamps,
};

const KILO: Participant = {
  id: 'p2', operation_id: 'op-1', organization_key: '',
  organization: { key: '', name: 'Task Force Kilo', short_label: 'TF KILO', branch: '', color: '', adhoc: true },
  platform_ids: [], equipment_ids: [], waveform_abbrevs: [], service_abbrevs: [], transport_ids: [],
  asset_phases: {},
  poc_name: '', poc_phone: '', poc_email: '', notes: '',
  ...stamps,
};

const Probe = () => {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname + loc.search}</output>;
};

function setup({ participants = [GREEN, KILO], canWrite = true, phases, sites, route = '/' }: {
  participants?: Participant[]; canWrite?: boolean; phases?: Phase[]; sites?: Site[]; route?: string;
} = {}) {
  const onJoin = vi.fn();
  const onEdit = vi.fn();
  renderWithRoute(
    <>
      <ParticipantBoard participants={participants} phases={phases} sites={sites} canWrite={canWrite} onJoin={onJoin} onEdit={onEdit} />
      <Probe />
    </>,
    route,
  );
  return { user: userEvent.setup(), onJoin, onEdit };
}

/** The open unit's panel; the tab it belongs to is chosen by `?unit=`. */
const panel = () => within(screen.getByRole('tabpanel'));
/** The panel's Brings part, so a phase name in the By phase table is not read as an asset's caption. */
const brings = (label: string) => within(screen.getByRole('region', { name: `${label} brings` }));
const GREEN_TAB = '/?unit=p1';
const KILO_TAB = '/?unit=p2';

describe('ParticipantBoard tabs', () => {
  it('draws one tab per participant, in order, each with its colour pip, and opens the first', () => {
    setup();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['GREEN', 'TF KILO']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    const pips = screen.getAllByTestId('tab-pip');
    expect(pips[0]).toHaveStyle({ backgroundColor: 'rgb(46, 125, 50)' });
    // One panel, labelled by the open tab.
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel', { name: 'GREEN' })).toBeInTheDocument();
  });

  it('opens the tab ?unit= names, and the first for an absent or unknown one', () => {
    setup({ route: KILO_TAB });
    expect(screen.getByRole('tab', { name: 'TF KILO' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'TF KILO' })).toBeInTheDocument();
    cleanup();

    setup({ route: '/?unit=gone' });
    expect(screen.getByRole('tab', { name: 'GREEN' })).toHaveAttribute('aria-selected', 'true');
  });

  it('writes ?unit= when a tab is clicked, keeping the other params, and swaps the panel', async () => {
    const { user } = setup({ route: '/?phase=ph2' });
    await user.click(screen.getByRole('tab', { name: 'TF KILO' }));
    expect(screen.getByTestId('location').textContent).toBe('/?phase=ph2&unit=p2');
    expect(screen.getByRole('tab', { name: 'TF KILO' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'TF KILO' })).toBeInTheDocument();
    expect(screen.queryByRole('tabpanel', { name: 'GREEN' })).toBeNull();
  });

  it('moves between tabs with the arrow keys', async () => {
    const { user } = setup();
    screen.getByRole('tab', { name: 'GREEN' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'TF KILO' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('location').textContent).toBe('/?unit=p2');
  });

  it('scrolls the open tab into view on load, so a link to a unit past the visible tabs does not open cut off', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      setup({ route: KILO_TAB });
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('tab', { name: 'TF KILO' }));
    } finally {
      // @ts-expect-error jsdom does not define it; remove the stub so other tests see the real environment.
      delete Element.prototype.scrollIntoView;
    }
  });

  it('no longer draws a card grid: no region per participant', () => {
    setup();
    expect(screen.queryByRole('region', { name: 'GREEN' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'TF KILO' })).toBeNull();
  });
});

describe('ParticipantBoard unit panel', () => {
  it('heads the open unit with its label, name, branch chip and colour pip', () => {
    setup({ route: GREEN_TAB });
    const green = panel();
    // GREEN's name is its short label in another case, so it is not echoed.
    expect(green.getByText('GREEN')).toBeInTheDocument();
    expect(green.queryByText('Green')).toBeNull();
    expect(green.getByText('USA')).toBeInTheDocument();
    expect(green.getByTestId('participant-pip')).toHaveStyle({ backgroundColor: 'rgb(46, 125, 50)' });
    cleanup();

    setup({ route: KILO_TAB });
    const kilo = panel();
    expect(kilo.getByText('Task Force Kilo')).toBeInTheDocument();
    expect(kilo.queryByText('ad hoc')).toBeNull();
    expect(kilo.queryByText('USA')).toBeNull();
  });

  it('says the same four parts in the same order for every unit, and None where a unit brings nothing', () => {
    for (const route of [GREEN_TAB, KILO_TAB]) {
      setup({ route });
      const sections = within(screen.getByRole('tabpanel')).getAllByRole('region');
      // The gear has no heading of its own (the tab says whose it is); the other two parts do.
      expect(sections.map((s) => s.getAttribute('aria-label')?.replace(/^.* (brings|by phase|point of contact)$/, '$1')))
        .toEqual(['brings', 'by phase', 'point of contact']);
      expect(sections.slice(1).map((s) => s.firstElementChild?.textContent)).toEqual(['By phase', 'POC']);
      expect(within(sections[0]!).queryByText('Brings')).toBeNull();
      cleanup();
    }
    setup({ route: KILO_TAB });
    // KILO has no platform, no equipment, no transport and no POC: four Nones, and no list.
    expect(panel().getAllByText('None')).toHaveLength(4);
    expect(brings('TF KILO').getAllByText('None')).toHaveLength(3);
    expect(panel().queryByRole('list')).toBeNull();
    // The Brings subsections are always in the order Platforms, Equipment, Transports.
    const captions = brings('TF KILO').getAllByText(/^(Platforms|Equipment|Transports)$/).map((c) => c.textContent);
    expect(captions).toEqual(['Platforms', 'Equipment', 'Transports']);
    // A unit that brings something keeps the same captions.
    cleanup();
    setup({ route: GREEN_TAB });
    expect(brings('GREEN').getAllByText(/^(Platforms|Equipment|Transports)$/).map((c) => c.textContent))
      .toEqual(['Platforms', 'Equipment', 'Transports']);
    expect(brings('GREEN').getAllByText('None')).toHaveLength(1);
  });

  it('heads each picked record with the kind badge, nomenclature and nickname, and strikes a missing id', () => {
    setup({ route: GREEN_TAB });
    const rows = within(panel().getByRole('list', { name: 'GREEN equipment' })).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('SATCOM')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('AN/TSC-198')).toHaveStyle({ fontSize: '15px', textTransform: 'uppercase' });
    expect(within(rows[0]!).getByText('"Phoenix"')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Radio')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('AN/PRC-152')).toHaveStyle({ fontSize: '15px' });
    expect(rows[2]).toHaveTextContent('gone-1');
    expect(rows[2]).toHaveStyle({ textDecoration: 'line-through' });
  });

  it('puts a radio’s waveforms under its heading as amber chips, smaller than the heading', () => {
    setup();
    const rows = within(panel().getByRole('list', { name: 'GREEN equipment' })).getAllByRole('listitem');
    const radio = within(rows[1]!);
    expect(radio.getByText('ANW2')).toHaveStyle({ fontSize: '10px', color: 'var(--shf-amber)' });
    expect(radio.getByText('SRW')).toBeInTheDocument();
    expect(radio.queryByText('WGS')).toBeNull();
    expect(within(rows[0]!).queryByText('ANW2')).toBeNull();
  });

  it('puts a SATCOM item’s services under its heading as paper chips, then any waveforms it lists in amber', () => {
    setup();
    const rows = within(panel().getByRole('list', { name: 'GREEN equipment' })).getAllByRole('listitem');
    const satcom = within(rows[0]!);
    expect(satcom.getByText('WGS')).toHaveStyle({ fontSize: '10px', color: 'var(--shf-paper)' });
    expect(satcom.getByText('MUOS')).toHaveStyle({ color: 'var(--shf-amber)' });
    expect(satcom.getByText('WGS').compareDocumentPosition(satcom.getByText('MUOS')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says None in italics under each caption a unit brings nothing for, and no longer says Dismounted', () => {
    setup({ route: KILO_TAB });
    expect(brings('TF KILO').getAllByText('None')[0]).toHaveStyle({ fontStyle: 'italic' });
    expect(panel().queryByText('Dismounted')).toBeNull();
    cleanup();
    // Radios and no platform: Platforms says None while Equipment lists them.
    setup({ route: GREEN_TAB });
    expect(brings('GREEN').queryByText('Dismounted')).toBeNull();
    expect(brings('GREEN').getAllByText('None')).toHaveLength(1);
    expect(brings('GREEN').getByText('Platforms').parentElement).toHaveTextContent('None');
  });

  it('heads a declared platform above the equipment with the PLATFORM badge, designation, popular name, branches and what it carries', () => {
    setup({ participants: [{ ...GREEN, platform_ids: ['stryker', 'uh-60', 'gone-pl'], equipment_ids: ['tsc-198'], waveform_abbrevs: ['L16', 'HAVEQUICK'] }] });
    const green = panel();
    const rows = within(green.getByRole('list', { name: 'GREEN platforms' })).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    const stryker = within(rows[0]!);
    expect(stryker.getByText('Platform')).toHaveStyle({ textTransform: 'uppercase' });
    expect(stryker.getByText('M1126')).toHaveStyle({ fontSize: '15px' });
    expect(stryker.getByText('"Stryker"')).toHaveStyle({ color: 'var(--shf-amber)' });
    expect(stryker.getByText('USA')).toBeInTheDocument();
    // Its own L16, then the PRC-152's ANW2 and SRW, then "carries" and the radio by nomenclature.
    expect(stryker.getByText('L16')).toHaveStyle({ fontSize: '10px', color: 'var(--shf-amber)' });
    expect(stryker.getByText('ANW2')).toBeInTheDocument();
    expect(stryker.getByText('SRW')).toBeInTheDocument();
    expect(stryker.getByText('carries')).toBeInTheDocument();
    expect(stryker.getByText('AN/PRC-152')).toBeInTheDocument();

    const hawk = within(rows[1]!);
    expect(hawk.getByText('UH-60M')).toBeInTheDocument();
    expect(hawk.queryByText(/"/)).toBeNull();
    expect(hawk.getByText('USN')).toBeInTheDocument();
    expect(hawk.queryByText('carries')).toBeNull();

    expect(rows[2]).toHaveTextContent('gone-pl');
    expect(rows[2]).toHaveStyle({ textDecoration: 'line-through' });

    // The platform list precedes the equipment list, and a stored direct
    // pick is drawn nowhere on the card: L16 once, under the Stryker, and
    // HAVEQUICK, which no asset carries, not at all.
    const platforms = green.getByRole('list', { name: 'GREEN platforms' });
    const equipment = green.getByRole('list', { name: 'GREEN equipment' });
    expect(platforms.compareDocumentPosition(equipment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(green.getAllByText('L16')).toHaveLength(1);
    expect(green.queryByText('HAVEQUICK')).toBeNull();
  });

  it('lists the transports under their own caption as rows, draws no stored direct waveform or service pick, and keeps the POC line', () => {
    setup();
    const green = panel();
    expect(green.getByText('Transports')).toHaveStyle({ textTransform: 'uppercase' });
    expect(green.queryByText('Also brings')).toBeNull();
    // SRW and WGS once each, under the radio and the terminal that carry them.
    expect(green.getAllByText('SRW')).toHaveLength(1);
    expect(green.getAllByText('WGS')).toHaveLength(1);
    // The stored direct picks the assets do not carry are not drawn.
    expect(green.queryByText('L16')).toBeNull();
    expect(green.queryByText('INMARSAT')).toBeNull();
    const rows = within(green.getByRole('list', { name: 'GREEN transports' })).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText('Transport')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Base fiber (Fiber)')).toBeInTheDocument();
    expect(green.getByText('POC')).toBeInTheDocument();
    expect(green.getByText('Capt Lee · 555-0100')).toBeInTheDocument();
  });

  it('labels a transport the library no longer has by its id', () => {
    setup({ participants: [{ ...GREEN, transport_ids: ['t1', 'gone-t'] }] });
    const rows = within(panel().getByRole('list', { name: 'GREEN transports' })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['TransportBase fiber (Fiber)', 'Transportgone-t']);
  });
});

describe('ParticipantBoard unit layout', () => {
  it('ends on the POC section: name, phone and email on one row, or None, with no button in it', () => {
    setup();
    const section = screen.getByRole('region', { name: 'GREEN point of contact' });
    expect(section.lastElementChild).toBe(within(section).getByTestId('participant-poc'));
    expect(within(section).getByText('POC')).toBeInTheDocument();
    expect(within(section).getByText('Capt Lee · 555-0100')).toBeInTheDocument();
    expect(within(section).queryByRole('button')).toBeNull();
    // The panel's last child is that section.
    expect(screen.getByRole('tabpanel').lastElementChild).toBe(section);
    cleanup();

    setup({ participants: [{ ...GREEN, poc_email: 'lee@example.mil' }] });
    expect(screen.getByText('Capt Lee · 555-0100 · lee@example.mil')).toBeInTheDocument();
    cleanup();

    setup({ route: KILO_TAB });
    const kilo = screen.getByRole('region', { name: 'TF KILO point of contact' });
    expect(within(kilo).getByText('None')).toBeInTheDocument();
    expect(within(kilo).queryByTestId('participant-poc')).toBeNull();
  });

  it('puts Edit in the header row beside the label, not in a section', () => {
    setup();
    const edit = panel().getByRole('button', { name: 'Edit GREEN' });
    expect(edit.parentElement?.contains(panel().getByTestId('participant-pip'))).toBe(true);
    for (const section of within(screen.getByRole('tabpanel')).getAllByRole('region')) {
      expect(within(section).queryByRole('button')).toBeNull();
    }
  });

  it('keeps the POC for a reader, who gets no Edit', () => {
    setup({ canWrite: false });
    expect(panel().getByTestId('participant-poc')).toBeInTheDocument();
  });
});

describe('ParticipantBoard write controls', () => {
  it('gives a writer Edit on the open unit and no Join Operation tile, and no Check out', () => {
    setup();
    expect(panel().getByRole('button', { name: 'Edit GREEN' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Check out / })).toBeNull();
    // One Edit at a time, for the unit on screen.
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(1);
    // The dashed tile is gone: Join Operation lives in the banner.
    expect(screen.queryByRole('button', { name: 'Join Operation' })).toBeNull();
  });

  it('gives a reader the tabs and the panel alone', () => {
    setup({ canWrite: false });
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Check out / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Join Operation' })).toBeNull();
  });

  it('replaces the tabs with a caption for a reader when no one has joined', () => {
    setup({ participants: [], canWrite: false });
    expect(screen.getByText('No one has joined yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('shows a writer the Join Operation prompt alone when no one has joined', async () => {
    const { user, onJoin } = setup({ participants: [] });
    expect(screen.queryByText('No one has joined yet.')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Join Operation' }));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('Edit hands the open unit’s row to onEdit', async () => {
    const { user, onEdit } = setup({ route: KILO_TAB });
    await user.click(panel().getByRole('button', { name: 'Edit TF KILO' }));
    expect(onEdit).toHaveBeenCalledWith(KILO);
  });
});

const PHASES: Phase[] = ['I', 'II', 'III', 'IV'].map((n, i) => ({
  id: `ph${i + 1}`, operation_id: 'op-1', position: i + 1, name: `Phase ${n}`,
  supported_participant_id: null, placements: {}, requirements: [],
}));

const PARTIAL: Participant = {
  ...GREEN,
  platform_ids: ['stryker'],
  equipment_ids: ['prc-152', 'tsc-198'],
  transport_ids: ['t1'],
  asset_phases: { stryker: [], 'prc-152': ['ph2', 'ph3'], 'tsc-198': ['ph1', 'ph3', 'ph4'], t1: ['ph1'] },
};

describe('ParticipantBoard phase captions', () => {
  it('captions an asset in some phases, collapsing neighbours into a run, and "No phase" for none', () => {
    setup({ participants: [PARTIAL], phases: PHASES });
    const green = brings('GREEN');
    const row = (text: string) => green.getByText(text).closest('li');
    expect(row('Phase II-III')).toHaveTextContent('AN/PRC-152');
    expect(row('Phase I, Phase III-IV')).toHaveTextContent('AN/TSC-198');
    expect(row('No phase')).toHaveTextContent('M1126');
    // A transport row says it under its label, as every other asset does.
    expect(row('Phase I')).toHaveTextContent('Base fiber (Fiber)');
  });

  it('prints nothing for an asset present throughout, with or without a key', () => {
    setup({
      participants: [{ ...PARTIAL, asset_phases: { 'prc-152': ['ph1', 'ph2', 'ph3', 'ph4'] } }],
      phases: PHASES,
    });
    const green = brings('GREEN');
    expect(green.queryByText(/^Phase /)).toBeNull();
    expect(green.queryByText('No phase')).toBeNull();
    expect(green.getByText('Base fiber (Fiber)').closest('li')).not.toHaveTextContent(/Phase/);
  });

  it('prints nothing with one phase or none, even for an asset marked in none', () => {
    for (const phases of [[PHASES[0] as Phase], undefined]) {
      setup({ participants: [PARTIAL], phases });
      expect(brings('GREEN').queryByText('No phase')).toBeNull();
      expect(brings('GREEN').getByText('Base fiber (Fiber)').closest('li')).not.toHaveTextContent(/Phase/);
      cleanup();
    }
  });

  it('names the phases outright when they are not neighbours, and in the operation order', () => {
    setup({
      participants: [{ ...PARTIAL, asset_phases: { 'prc-152': ['ph4', 'ph1'], 'tsc-198': ['ph1', 'ph2'] } }],
      phases: PHASES,
    });
    const green = brings('GREEN');
    expect(green.getByText('Phase I, Phase IV').closest('li')).toHaveTextContent('AN/PRC-152');
    expect(green.getByText('Phase I-II').closest('li')).toHaveTextContent('AN/TSC-198');
  });
});

// A five-unit operation with two phases, built so each answer a requirement can
// have is on GREEN's page. GREEN carries the PRC-152 (ANW2, SRW), and only in
// Phase I. RED rides a Stryker, which has L16 and carries the PRC-152, so RED
// shares ANW2 and SRW with GREEN. WHITE has an RT-1 (L16) alone, so it shares
// nothing with GREEN but L16 with RED: a relay through RED. BLACK has the
// TSC-198 and shares nothing with anyone: no link. KILO carries the
// PRC-152 in Phase II only, so it is absent from Phase I.
const unit = (id: string, label: string, over: Partial<Participant>): Participant => ({
  ...KILO, id, organization_key: id, organization: { key: id, name: label, short_label: label, branch: '', color: '', adhoc: false },
  ...over,
});
const P_GREEN = unit('g', 'GREEN', { equipment_ids: ['prc-152'], asset_phases: { 'prc-152': ['ph1'] }, poc_name: 'Capt Lee' });
const P_RED = unit('r', 'RED', { platform_ids: ['stryker'] });
const P_WHITE = unit('w', 'WHITE', { equipment_ids: ['rt-1'] });
const P_BLACK = unit('b', 'BLACK', { equipment_ids: ['tsc-198'] });
const P_KILO = unit('k', 'KILO', { equipment_ids: ['prc-152'], asset_phases: { 'prc-152': ['ph2'] } });
const PLAN_UNITS = [P_GREEN, P_RED, P_WHITE, P_BLACK, P_KILO];

const PLAN_SITES: Site[] = [
  { id: 's1', operation_id: 'op-1', position: 0, name: 'ISB' },
  { id: 's2', operation_id: 'op-1', position: 1, name: 'FSB' },
];
const PLAN_PHASES: Phase[] = [
  {
    id: 'ph1', operation_id: 'op-1', position: 1, name: 'Phase I',
    supported_participant_id: 'g', placements: { g: 's1' },
    requirements: [{ id: 'r1', a: 'g', b: 'r' }, { id: 'r2', a: 'g', b: 'w' }, { id: 'r3', a: 'b', b: 'g' }, { id: 'r4', a: 'g', b: 'k' }],
  },
  {
    id: 'ph2', operation_id: 'op-1', position: 2, name: 'Phase II',
    supported_participant_id: null, placements: { r: 's2' },
    requirements: [{ id: 'r5', a: 'r', b: 'k' }],
  },
];

describe('ParticipantBoard by phase', () => {
  const byPhase = (label: string) => within(screen.getByRole('table', { name: `${label} by phase` }));
  const rowOf = (label: string, phase: string) => within(byPhase(label).getByRole('rowheader', { name: phase }).closest('tr')!);
  const plan = (unitId: string) => setup({ participants: PLAN_UNITS, phases: PLAN_PHASES, sites: PLAN_SITES, route: `/?unit=${unitId}` });

  it('has one row per phase under Phase, Location, Tier select and Must talk', () => {
    plan('g');
    expect(byPhase('GREEN').getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Phase', 'Location', 'Tier select', 'Must talk']);
    expect(byPhase('GREEN').getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Phase I', 'Phase II']);
  });

  it('reads each requirement in the Web legend’s glyphs: direct, relay, no link, and a partner that is not in the phase', () => {
    plan('g');
    const row = rowOf('GREEN', 'Phase I');
    // Direct: the first shared means and how many more.
    expect(row.getByText('RED - ANW2 +1')).toBeInTheDocument();
    // Relay: through RED, which shares a means with each.
    expect(row.getByText('WHITE via RED')).toBeInTheDocument();
    // None, with the requirement written the other way round: BLACK names GREEN.
    expect(row.getByText('BLACK - no link')).toBeInTheDocument();
    expect(row.getByText('KILO - not in this phase')).toBeInTheDocument();
    const kinds = within(row.getByText('RED - ANW2 +1').closest('ul')!).getAllByRole('img', { hidden: true }).map((g) => g.getAttribute('data-status'));
    expect(kinds).toEqual(['direct', 'relay', 'cannot', 'absent']);
  });

  it('colours the glyph by status, as the legend does, and mutes a partner that is absent', () => {
    plan('g');
    const row = rowOf('GREEN', 'Phase I');
    const glyph = (text: string) => row.getByText(text).previousElementSibling as HTMLElement;
    expect(glyph('RED - ANW2 +1')).toHaveAttribute('data-status', 'direct');
    expect(glyph('RED - ANW2 +1')).toHaveStyle({ color: PAIR_COLOR.direct });
    expect(glyph('BLACK - no link')).toHaveStyle({ color: PAIR_COLOR.cannot });
    expect(glyph('WHITE via RED')).toHaveStyle({ color: PAIR_COLOR.relay });
    expect(glyph('KILO - not in this phase')).toHaveStyle({ color: 'var(--shf-graphite-400)' });
  });

  it('names the site the unit sits at, with a dash where the phase places it nowhere', () => {
    plan('g');
    expect(rowOf('GREEN', 'Phase I').getByText('ISB')).toBeInTheDocument();
    cleanup();
    plan('r');
    const phaseI = rowOf('RED', 'Phase I');
    expect(phaseI.queryByText('ISB')).toBeNull();
    expect(phaseI.getByText('-')).toBeInTheDocument();
    expect(rowOf('RED', 'Phase II').getByText('FSB')).toBeInTheDocument();
  });

  it('tags the unit a phase supports, and only that unit', () => {
    plan('g');
    expect(rowOf('GREEN', 'Phase I').getByText('TIER SELECT')).toBeInTheDocument();
    cleanup();
    plan('r');
    expect(byPhase('RED').queryByText('TIER SELECT')).toBeNull();
  });

  it('lists a requirement under both of the units it names', () => {
    plan('r');
    // r1 names GREEN and RED; r5 names RED and KILO.
    expect(rowOf('RED', 'Phase I').getByText('GREEN - ANW2 +1')).toBeInTheDocument();
    expect(rowOf('RED', 'Phase II').getByText('KILO - ANW2 +1')).toBeInTheDocument();
    cleanup();
    plan('b');
    expect(rowOf('BLACK', 'Phase I').getByText('GREEN - no link')).toBeInTheDocument();
  });

  it('reads Not in this phase across the row for a phase the unit has nothing in', () => {
    plan('g');
    const row = rowOf('GREEN', 'Phase II');
    expect(row.getByText('Not in this phase')).toHaveAttribute('colspan', '3');
    expect(row.queryByText('TIER SELECT')).toBeNull();
    expect(row.queryByText('ISB')).toBeNull();
    cleanup();
    plan('k');
    expect(rowOf('KILO', 'Phase I').getByText('Not in this phase')).toBeInTheDocument();
    expect(rowOf('KILO', 'Phase II').queryByText('Not in this phase')).toBeNull();
  });

  it('says No requirements for a phase the unit is in but nothing names it, and has no phases line without phases', () => {
    plan('w');
    // WHITE is in both phases (no asset_phases key) but only r2 names it, in Phase I.
    expect(rowOf('WHITE', 'Phase II').getByText('No requirements')).toBeInTheDocument();
    expect(rowOf('WHITE', 'Phase I').getByText('GREEN via RED')).toBeInTheDocument();
    cleanup();
    setup({ participants: PLAN_UNITS });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('This operation has no phases.')).toBeInTheDocument();
  });

  it('follows the tab: another unit’s page has its own table', async () => {
    const { user } = plan('g');
    await user.click(screen.getByRole('tab', { name: 'RED' }));
    expect(screen.getByRole('table', { name: 'RED by phase' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'GREEN by phase' })).toBeNull();
  });
});

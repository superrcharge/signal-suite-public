import type { Equipment, Operation, Participant, Phase, Site, Waveform } from '@/types';
import type { InteropInput } from './interop-model';

/**
 * A three-unit, three-phase operation for the deck tests.
 *
 * A and B share ANW2 on the same radio, so they are direct. C carries a
 * different waveform and shares nothing with either, so any pair with C is a
 * gap. B's radio is in Phases I and II only, so Phase III has no B.
 */
const stamps = { created_by: 't', updated_by: 't', created_at: '', updated_at: '' };

const radio = (id: string, ...abbrevs: string[]): Equipment => ({
  id, nomenclature: id.toUpperCase(), terminal_type: 'radio', operational_mode: [],
  data: { services: [], waveforms: abbrevs.map((abbrev) => ({ abbrev, name: abbrev })), bands: [], standard_specs: {}, physical_specs: [], rf_specs: [], swap: {}, features: [] },
  ...stamps,
});

const unit = (id: string, label: string, equipmentId: string, phases: string[]): Participant => ({
  id, operation_id: 'op-1', organization_key: label.toLowerCase(),
  organization: { key: label.toLowerCase(), name: `${label} org`, short_label: label, branch: 'USA', color: '', adhoc: false },
  platform_ids: [], equipment_ids: [equipmentId], waveform_abbrevs: [], service_abbrevs: [], transport_ids: [],
  asset_phases: { [equipmentId]: phases },
  poc_name: '', poc_phone: '', poc_email: '', notes: '',
  ...stamps,
});

export const DECK_OPERATION: Pick<Operation, 'name'> = { name: 'Night Owl' };

export const DECK_PARTICIPANTS: Participant[] = [
  unit('pa', 'ALPHA', 'r1', ['ph1', 'ph2', 'ph3']),
  unit('pb', 'BRAVO', 'r1b', ['ph1', 'ph2']),
  unit('pc', 'CHARLIE', 'r2', ['ph1', 'ph2', 'ph3']),
];

const WAVEFORMS: Waveform[] = [
  { id: 'w1', abbrev: 'ANW2', name: 'Adaptive Networking Wideband', description: '', ...stamps },
  { id: 'w2', abbrev: 'L16', name: 'Link 16', description: '', ...stamps },
];

export const DECK_INPUT: Omit<InteropInput, 'phaseId'> = {
  participants: DECK_PARTICIPANTS,
  equipmentById: new Map([radio('r1', 'ANW2'), radio('r1b', 'ANW2'), radio('r2', 'L16')].map((e) => [e.id, e])),
  platformById: new Map(),
  transportById: new Map(),
  waveforms: WAVEFORMS,
  services: [],
};

const phase = (id: string, position: number, name: string, pairs: [string, string][]): Phase => ({
  id, operation_id: 'op-1', position, name, supported_participant_id: null,
  placements: { pa: 's1', pb: 's1', pc: 's2' },
  requirements: pairs.map(([a, b], i) => ({ id: `${id}-r${String(i)}`, a, b })),
});

/** Deliberately out of position order, so the deck is shown to follow `position`, not the array. */
export const DECK_PHASES: Phase[] = [
  phase('ph2', 2, 'Infil', [['pa', 'pb']]),
  phase('ph1', 1, 'Staging', [['pa', 'pb'], ['pa', 'pc']]),
  phase('ph3', 3, 'Exfil', [['pa', 'pc'], ['pa', 'pb']]),
];

export const DECK_SITES: Site[] = [
  { id: 's1', operation_id: 'op-1', position: 0, name: 'ISB' },
  { id: 's2', operation_id: 'op-1', position: 1, name: 'FSB' },
];

/**
 * The same operation with a fourth unit, DELTA, whose radio carries both
 * waveforms, so A and C, who share nothing, can reach each other through it: a
 * relay. DELTA has no placement, so it sits in the No location box, and A is
 * the tier select. One phase, three requirements: direct, relay, direct.
 */
export const RELAY_PARTICIPANTS: Participant[] = [...DECK_PARTICIPANTS, unit('pd', 'DELTA', 'r3', ['ph1'])];

export const RELAY_INPUT: Omit<InteropInput, 'phaseId'> = {
  ...DECK_INPUT,
  participants: RELAY_PARTICIPANTS,
  equipmentById: new Map([...DECK_INPUT.equipmentById, ['r3', radio('r3', 'ANW2', 'L16')]]),
};

export const RELAY_PHASES: Phase[] = [
  { ...phase('ph1', 1, 'Staging', [['pa', 'pb'], ['pa', 'pc'], ['pc', 'pd']]), supported_participant_id: 'pa' },
];

/** One phase with forty requirements, taller than a slide, to be fitted rather than cut. */
export const TALL_PHASES: Phase[] = [
  phase('ph1', 1, 'Staging', Array.from({ length: 40 }, (_, i): [string, string] => (i % 2 === 0 ? ['pa', 'pb'] : ['pa', 'pc']))),
];

/**
 * The tokens the deck's slides name, as the six hex digits the page resolves
 * them to, for tests that have no stylesheet to read them from. A token missing
 * here throws, so a slide that starts naming a new one is noticed.
 */
const TOKEN_HEX: Record<string, string> = {
  'var(--shf-paper)': 'F4F2EC', 'var(--shf-white)': 'FFFFFF', 'var(--shf-black)': '0A0A0A',
  'var(--fg-1)': '0A0A0A', 'var(--fg-2)': '2A2D31', 'var(--fg-3)': '5A5F66',
  'var(--border-soft)': 'D9D4C5', 'var(--shf-graphite-600)': '2F343A',
  'var(--shf-amber)': 'F2A900', 'var(--shf-amber-deep)': 'B87F00', 'var(--shf-error)': 'F85149',
};

export function testColor(css: string): string {
  if (css.startsWith('#')) return css.slice(1).toUpperCase();
  const hex = TOKEN_HEX[css];
  if (hex === undefined) throw new Error(`The test palette has no ${css}.`);
  return hex;
}

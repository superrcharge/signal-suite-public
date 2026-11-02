import { describe, expect, it } from 'vitest';

import type { Equipment, Participant, Platform, Service, Transport, Waveform } from '@/types';
import {
  assetSources,
  buildInterop,
  isPresent,
  type InteropInput,
} from './interop-model';

const stamps = { created_by: '', updated_by: '', created_at: '', updated_at: '' };

const radio = (id: string, abbrevs: string[]): Equipment => ({
  id, nomenclature: id.toUpperCase(), terminal_type: 'radio', operational_mode: [],
  data: {
    services: [], waveforms: abbrevs.map((a) => ({ abbrev: a, name: a })), bands: [],
    standard_specs: {}, physical_specs: [], rf_specs: [], swap: {}, features: [],
  },
  ...stamps,
});
const satcom = (id: string, services: string[]): Equipment => ({
  id, nomenclature: id.toUpperCase(), terminal_type: 'satcom', operational_mode: [],
  data: {
    services: services.map((a) => ({ abbrev: a, name: a })), waveforms: [], bands: [],
    standard_specs: {}, physical_specs: [], rf_specs: [], swap: {}, features: [],
  },
  ...stamps,
});
const platform = (id: string, own: string[], equipmentIds: string[] = []): Platform => ({
  id, designation: id.toUpperCase(), popular_name: '', category: [], type: 'aircraft',
  waveform_abbrevs: own, equipment_ids: equipmentIds, notes: '', ...stamps,
});
const transport = (id: string, name: string): Transport => ({
  id, name, kind: 'fiber', provider: '', description: '', owned_by: '', owner_country: '', ...stamps,
});
const waveform = (abbrev: string, name = abbrev): Waveform => ({ id: abbrev, abbrev, name, description: '', ...stamps });
const service = (abbrev: string, name: string): Service => ({
  id: abbrev, abbrev, name, description: '', owned_by: '', owner_country: '', ...stamps,
});

function participant(key: string, over: Partial<Participant> = {}): Participant {
  return {
    id: `row-${key}`, operation_id: 'op-1', organization_key: key,
    organization: { key, name: `${key} org`, short_label: key.toUpperCase(), branch: 'USA', color: '#123456', adhoc: false },
    platform_ids: [], equipment_ids: [], waveform_abbrevs: [], service_abbrevs: [], transport_ids: [],
    asset_phases: {},
    poc_name: '', poc_phone: '', poc_email: '', notes: '',
    ...stamps,
    ...over,
  };
}

const PLATFORMS = new Map<string, Platform>([
  ['uh60', platform('uh60', ['L16'], ['prc-152'])],
  ['mq9', platform('mq9', ['SRW'], ['tsc-198'])],
]);
const EQUIPMENT = new Map<string, Equipment>([
  ['prc-152', radio('prc-152', ['ANW2', 'SRW'])],
  ['prc-117', radio('prc-117', ['SRW'])],
  ['tsc-198', satcom('tsc-198', ['WGS', 'MUOS'])],
]);
const TRANSPORTS = new Map<string, Transport>([['t1', transport('t1', 'Backhaul')]]);
const WAVEFORMS = [waveform('SRW', 'Soldier Radio Waveform'), waveform('L16', 'Link 16'), waveform('ANW2')];
const SERVICES = [service('WGS', 'Wideband Global SATCOM')];

function input(participants: Participant[], over: Partial<InteropInput> = {}): InteropInput {
  return {
    participants, platformById: PLATFORMS, equipmentById: EQUIPMENT, transportById: TRANSPORTS,
    waveforms: WAVEFORMS, services: SERVICES, phaseId: null,
    ...over,
  };
}

const row = (m: ReturnType<typeof buildInterop>, section: string, key: string) =>
  m.rows.find((r) => r.section === section && r.key === key);

describe('isPresent', () => {
  const p = participant('blue', { asset_phases: { a: ['ph1', 'ph2'], none: [] } });

  it('is present in a phase the asset lists, and absent from one it does not', () => {
    expect(isPresent(p, 'a', 'ph1')).toBe(true);
    expect(isPresent(p, 'a', 'ph3')).toBe(false);
  });

  it('treats an asset with no key as present in every phase and under no phase', () => {
    expect(isPresent(p, 'missing', 'ph9')).toBe(true);
    expect(isPresent(p, 'missing', null)).toBe(true);
  });

  it('puts an asset with an empty list in no phase, but keeps it under the null phase only when listed', () => {
    expect(isPresent(p, 'none', 'ph1')).toBe(false);
    expect(isPresent(p, 'none', null)).toBe(false);
    expect(isPresent(p, 'a', null)).toBe(true);
  });
});

describe('assetSources', () => {
  it('lists platforms, then equipment, then transports, skipping unknown platforms and equipment but not transports', () => {
    const p = participant('blue', {
      platform_ids: ['uh60', 'gone'], equipment_ids: ['prc-117', 'gone'], transport_ids: ['t1', 'ghost'],
    });
    const sources = assetSources(p, { platformById: PLATFORMS, equipmentById: EQUIPMENT, transportById: TRANSPORTS, phaseId: null });

    expect(sources.map((s) => [s.kind, s.id, s.label])).toEqual([
      ['platform', 'uh60', 'UH60'],
      ['equipment', 'prc-117', 'PRC-117'],
      ['transport', 't1', 'Backhaul (Fiber)'],
      ['transport', 'ghost', 'ghost'],
    ]);
  });

  it('gives a platform its own waveforms and its radio waveforms, naming the radio only where the own list is silent', () => {
    const p = participant('blue', { platform_ids: ['uh60'] });
    const [src] = assetSources(p, { platformById: PLATFORMS, equipmentById: EQUIPMENT, transportById: TRANSPORTS, phaseId: null });

    expect(src?.waveforms).toEqual(['L16', 'ANW2', 'SRW']);
    expect(src?.via).toEqual({ l16: [], anw2: ['PRC-152'], srw: ['PRC-152'] });
  });

  it('lets the platform own list win over a carried radio that also supplies the waveform', () => {
    const pl = new Map([['x', platform('x', ['SRW'], ['prc-152'])]]);
    const p = participant('blue', { platform_ids: ['x'] });
    const [src] = assetSources(p, { platformById: pl, equipmentById: EQUIPMENT, transportById: TRANSPORTS, phaseId: null });

    expect(src?.via.srw).toEqual([]);
    expect(src?.via.anw2).toEqual(['PRC-152']);
  });

  it('takes services from a satcom terminal, on a platform and on its own, and none from a radio', () => {
    const p = participant('blue', { platform_ids: ['mq9'], equipment_ids: ['tsc-198', 'prc-152'] });
    const sources = assetSources(p, { platformById: PLATFORMS, equipmentById: EQUIPMENT, transportById: TRANSPORTS, phaseId: null });

    expect(sources.map((s) => s.services)).toEqual([['WGS', 'MUOS'], ['WGS', 'MUOS'], []]);
  });

  it('keeps only the assets present in the phase', () => {
    const p = participant('blue', {
      platform_ids: ['uh60'], equipment_ids: ['prc-117'], asset_phases: { uh60: ['ph1'], 'prc-117': ['ph2'] },
    });
    const base = { platformById: PLATFORMS, equipmentById: EQUIPMENT, transportById: TRANSPORTS };

    expect(assetSources(p, { ...base, phaseId: 'ph1' }).map((s) => s.id)).toEqual(['uh60']);
    expect(assetSources(p, { ...base, phaseId: 'ph2' }).map((s) => s.id)).toEqual(['prc-117']);
  });
});

describe('buildInterop', () => {
  it('names the carrying platform in the cell, with the radio in via, when only a carried radio supplies the waveform', () => {
    const m = buildInterop(input([
      participant('blue', { platform_ids: ['uh60'] }),
      participant('green', { equipment_ids: ['prc-117'] }),
    ]));
    const srw = row(m, 'waveform', 'srw');

    expect(srw?.cells[0]?.sources.map((s) => s.id)).toEqual(['uh60']);
    expect(srw?.cells[0]?.sources[0]?.via.srw).toEqual(['PRC-152']);
    expect(srw?.cells[1]?.sources.map((s) => s.id)).toEqual(['prc-117']);
    expect(srw?.shared).toBe(2);
  });

  it('reports a waveform from the platform own list with an empty via', () => {
    const m = buildInterop(input([participant('blue', { platform_ids: ['uh60'] })]));

    expect(row(m, 'waveform', 'l16')?.cells[0]?.sources[0]?.via.l16).toEqual([]);
  });

  it('gives two sources in one cell when two assets of an organization supply the same waveform, in source order', () => {
    const m = buildInterop(input([participant('blue', { platform_ids: ['uh60'], equipment_ids: ['prc-117'] })]));

    expect(row(m, 'waveform', 'srw')?.cells[0]?.sources.map((s) => s.id)).toEqual(['uh60', 'prc-117']);
  });

  it('orders waveform rows by the library, names them from it, and gives an abbrev the library lacks no row', () => {
    const extra = new Map(EQUIPMENT).set('odd', radio('odd', ['ZZZ']));
    const m = buildInterop(input([participant('blue', { equipment_ids: ['prc-152', 'odd'] })], { equipmentById: extra }));

    expect(m.rows.map((r) => r.key)).toEqual(['srw', 'anw2']);
    expect(m.rows[0]?.label).toBe('SRW');
    expect(m.rows[0]?.name).toBe('Soldier Radio Waveform');
  });

  it('adds service rows from satcom terminals only, named from the library when it has them, and none from a radio', () => {
    const m = buildInterop(input([participant('blue', { equipment_ids: ['tsc-198', 'prc-152'] })]));
    const services = m.rows.filter((r) => r.section === 'service');

    expect(services.map((r) => [r.key, r.label, r.name])).toEqual([
      ['muos', 'MUOS', ''],
      ['wgs', 'WGS', 'Wideband Global SATCOM'],
    ]);
    expect(services[0]?.cells[0]?.sources.map((s) => s.id)).toEqual(['tsc-198']);
  });

  it('makes each transport its own row, labelled by transportLabel', () => {
    const m = buildInterop(input([
      participant('blue', { transport_ids: ['t1'] }),
      participant('green', { transport_ids: ['t1'] }),
    ]));
    const t = m.rows.filter((r) => r.section === 'transport');

    expect(t).toHaveLength(1);
    expect(t[0]?.key).toBe('t1');
    expect(t[0]?.label).toBe('Backhaul (Fiber)');
    expect(t[0]?.shared).toBe(2);
  });

  it('orders the sections waveform, service, transport and drops a row nobody carries', () => {
    const m = buildInterop(input([
      participant('blue', { equipment_ids: ['tsc-198', 'prc-117'], transport_ids: ['t1'] }),
    ]));

    expect(m.rows.map((r) => r.section)).toEqual(['waveform', 'service', 'service', 'transport']);
    expect(row(m, 'waveform', 'l16')).toBeUndefined();
  });

  it('describes each column by the organization key, label, name, branch and colour', () => {
    const adhoc = participant('', {
      id: 'row-adhoc', organization_key: '',
      organization: { key: '', name: 'Task Force Kilo', short_label: 'TF KILO', branch: '', color: '', adhoc: true },
    });
    const m = buildInterop(input([participant('blue'), adhoc]));

    expect(m.columns.map((c) => [c.key, c.label, c.name, c.branch])).toEqual([
      ['blue', 'BLUE', 'blue org', 'USA'],
      ['row-adhoc', 'TF KILO', 'Task Force Kilo', ''],
    ]);
    expect(m.columns[0]?.color).toBe('#123456');
  });

  it('counts the organizations with a non-empty cell as shared', () => {
    const m = buildInterop(input([
      participant('blue', { equipment_ids: ['prc-117'] }),
      participant('green', { equipment_ids: ['prc-152'] }),
      participant('red', { equipment_ids: [] }),
    ]));

    expect(row(m, 'waveform', 'srw')?.shared).toBe(2);
    expect(row(m, 'waveform', 'anw2')?.shared).toBe(1);
  });

  describe('under a chosen phase', () => {
    const blue = participant('blue', { equipment_ids: ['prc-117'], asset_phases: { 'prc-117': ['ph1'] } });
    const green = participant('green', { equipment_ids: ['prc-152'], asset_phases: { 'prc-152': ['ph2'] } });
    const empty = participant('red');

    it('keeps every organization under All phases, whatever it brought', () => {
      const all = buildInterop(input([blue, green, empty], { phaseId: null }));

      expect(all.phaseId).toBeNull();
      expect(all.columns.map((c) => c.key)).toEqual(['blue', 'green', 'red']);
      expect(row(all, 'waveform', 'anw2')).toBeDefined();
    });

    it('draws only the organizations with a source present in the phase', () => {
      const ph1 = buildInterop(input([blue, green, empty], { phaseId: 'ph1' }));

      expect(ph1.columns.map((c) => c.key)).toEqual(['blue']);
      expect(ph1.columns[0]?.sources.map((s) => s.id)).toEqual(['prc-117']);
      expect(buildInterop(input([blue, green, empty], { phaseId: 'ph2' })).columns.map((c) => c.key)).toEqual(['green']);
    });

    it('draws only the rows some present organization provides, with the cells of the drawn columns', () => {
      const ph1 = buildInterop(input([blue, green, empty], { phaseId: 'ph1' }));

      // The PRC-152 is GREEN's and is out of Phase I: ANW2 has no one, so it is not a row at all.
      expect(row(ph1, 'waveform', 'anw2')).toBeUndefined();
      // SRW: BLUE's PRC-117 alone.
      expect(ph1.rows.map((r) => r.key)).toEqual(['srw']);
      expect(row(ph1, 'waveform', 'srw')?.shared).toBe(1);
      expect(row(ph1, 'waveform', 'srw')?.cells.map((c) => c.sources.map((s) => s.id))).toEqual([['prc-117']]);
    });

    it('keeps only the present source of an organization that brought two', () => {
      const both = participant('blue', {
        platform_ids: ['uh60'], equipment_ids: ['prc-117'], asset_phases: { uh60: ['ph2'], 'prc-117': ['ph1'] },
      });
      const ph1 = buildInterop(input([both], { phaseId: 'ph1' }));

      expect(ph1.columns[0]?.sources.map((s) => s.id)).toEqual(['prc-117']);
      expect(row(ph1, 'waveform', 'srw')?.cells[0]?.sources.map((s) => s.id)).toEqual(['prc-117']);
      // The Black Hawk's own L16 is not there, so it is not a row.
      expect(row(ph1, 'waveform', 'l16')).toBeUndefined();
    });

    it('draws no transport or service row whose only source is out of the phase', () => {
      const p = participant('blue', { transport_ids: ['t1'], equipment_ids: ['tsc-198'], asset_phases: { t1: ['ph2'], 'tsc-198': ['ph2'] } });

      expect(buildInterop(input([p], { phaseId: 'ph1' })).rows).toEqual([]);
      const ph2 = buildInterop(input([p], { phaseId: 'ph2' }));
      expect(row(ph2, 'transport', 't1')?.shared).toBe(1);
      expect(row(ph2, 'service', 'wgs')?.cells[0]?.sources.map((s) => s.id)).toEqual(['tsc-198']);
    });

    it('leaves out an asset in no phase at all, and with it the organization', () => {
      const p = participant('blue', { equipment_ids: ['prc-117'], asset_phases: { 'prc-117': [] } });
      const ph1 = buildInterop(input([p], { phaseId: 'ph1' }));

      expect(ph1.columns).toEqual([]);
      expect(ph1.rows).toEqual([]);
    });
  });
});


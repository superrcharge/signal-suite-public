import { describe, expect, it } from 'vitest';

import type { Equipment, Platform } from '@/types';
import { effectiveWaveforms, equipmentServices, equipmentWaveforms, platformWaveforms } from './participant-waveforms';

const stamps = { created_by: '', updated_by: '', created_at: '', updated_at: '' };
const radio = (id: string, abbrevs: string[]): Equipment => ({
  id, nomenclature: id.toUpperCase(), terminal_type: 'radio', operational_mode: [],
  data: {
    services: [], waveforms: abbrevs.map((a) => ({ abbrev: a, name: a })), bands: [],
    standard_specs: {}, physical_specs: [], rf_specs: [], swap: {}, features: [],
  },
  ...stamps,
});
const BY_ID = new Map<string, Equipment>([
  ['prc-152', radio('prc-152', ['ANW2', 'SRW', 'srw'])],
  ['prc-117', radio('prc-117', ['SRW', 'L16'])],
  ['tsc-198', { id: 'tsc-198', nomenclature: 'AN/TSC-198', terminal_type: 'satcom', operational_mode: [], ...stamps }],
  ['tsc-199', {
    id: 'tsc-199', nomenclature: 'AN/TSC-199', terminal_type: 'satcom', operational_mode: [],
    data: {
      services: [{ abbrev: 'WGS', name: 'WGS' }, { abbrev: 'wgs', name: 'WGS' }, { abbrev: 'MUOS', name: 'MUOS' }],
      waveforms: [], bands: [], standard_specs: {}, physical_specs: [], rf_specs: [], swap: {}, features: [],
    },
    ...stamps,
  }],
]);

describe('effectiveWaveforms', () => {
  it('unions the picked equipment’s waveforms in equipment order, then the direct picks not already present', () => {
    expect(effectiveWaveforms({ equipment_ids: ['prc-117', 'prc-152'], waveform_abbrevs: ['MUOS', 'anw2'] }, BY_ID))
      .toEqual(['SRW', 'L16', 'ANW2', 'MUOS']);
  });

  it('counts a radio’s own waveforms when nothing was picked directly', () => {
    expect(effectiveWaveforms({ equipment_ids: ['prc-152'], waveform_abbrevs: [] }, BY_ID)).toEqual(['ANW2', 'SRW']);
  });

  it('skips an id the catalog does not have, a record with no data, and a blank abbrev', () => {
    expect(effectiveWaveforms({ equipment_ids: ['gone', 'tsc-198'], waveform_abbrevs: ['', ' ', 'L16'] }, BY_ID)).toEqual(['L16']);
  });

  it('is empty for a row with nothing', () => {
    expect(effectiveWaveforms({ equipment_ids: [], waveform_abbrevs: [] }, BY_ID)).toEqual([]);
  });
});

describe('equipmentWaveforms', () => {
  it('lists one record’s waveforms, deduped case-insensitively, and nothing for a missing record', () => {
    expect(equipmentWaveforms(BY_ID.get('prc-152'))).toEqual(['ANW2', 'SRW']);
    expect(equipmentWaveforms(BY_ID.get('tsc-198'))).toEqual([]);
    expect(equipmentWaveforms(undefined)).toEqual([]);
  });
});

describe('equipmentServices', () => {
  it('lists one record’s services, deduped case-insensitively, and nothing for a record without data or a missing one', () => {
    expect(equipmentServices(BY_ID.get('tsc-199'))).toEqual(['WGS', 'MUOS']);
    expect(equipmentServices(BY_ID.get('tsc-198'))).toEqual([]);
    expect(equipmentServices(undefined)).toEqual([]);
  });
});

// A Stryker carrying L16 directly and listing the PRC-117 among its radios,
// and a Blackhawk with nothing typed against it.
const PLATFORMS = new Map<string, Platform>([
  ['stryker', {
    id: 'stryker', designation: 'M1126', popular_name: 'Stryker', category: ['USA'], type: 'ground vehicle',
    waveform_abbrevs: ['L16', 'l16', 'MUOS'], equipment_ids: ['prc-117', 'gone'], notes: '', ...stamps,
  }],
  ['uh-60', {
    id: 'uh-60', designation: 'UH-60M', popular_name: 'Black Hawk', category: ['USA'], type: 'aircraft',
    waveform_abbrevs: [], equipment_ids: [], notes: '', ...stamps,
  }],
]);

describe('effectiveWaveforms with platforms', () => {
  it('derives each picked platform first: its own abbrevs, then its radios, before the equipment and the direct picks', () => {
    expect(effectiveWaveforms(
      { platform_ids: ['stryker'], equipment_ids: ['prc-152'], waveform_abbrevs: ['srw', 'HAVEQUICK'] },
      BY_ID,
      PLATFORMS,
    )).toEqual(['L16', 'MUOS', 'SRW', 'ANW2', 'HAVEQUICK']);
  });

  it('counts a platform’s waveforms when the organization picked no radio of its own', () => {
    expect(effectiveWaveforms({ platform_ids: ['stryker'], equipment_ids: [], waveform_abbrevs: [] }, BY_ID, PLATFORMS))
      .toEqual(['L16', 'MUOS', 'SRW']);
  });

  it('adds nothing for a platform with nothing typed against it, an unknown id, or no map at all', () => {
    expect(effectiveWaveforms({ platform_ids: ['uh-60', 'gone'], equipment_ids: [], waveform_abbrevs: ['L16'] }, BY_ID, PLATFORMS))
      .toEqual(['L16']);
    expect(effectiveWaveforms({ platform_ids: ['stryker'], equipment_ids: [], waveform_abbrevs: ['L16'] }, BY_ID))
      .toEqual(['L16']);
  });
});

describe('platformWaveforms', () => {
  it('lists one platform’s own abbrevs then its radios’ waveforms, deduped, and nothing for a missing one', () => {
    expect(platformWaveforms(PLATFORMS.get('stryker'), BY_ID)).toEqual(['L16', 'MUOS', 'SRW']);
    expect(platformWaveforms(PLATFORMS.get('uh-60'), BY_ID)).toEqual([]);
    expect(platformWaveforms(undefined, BY_ID)).toEqual([]);
  });
});

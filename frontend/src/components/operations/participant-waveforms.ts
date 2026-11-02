import type { Equipment, Participant, Platform } from '@/types';
import { norm } from './pick-strip-styles';

/**
 * The lists a waveform derivation reads. `platform_ids` is optional so the
 * callers that predate platforms, and a draft with none, fit unchanged.
 */
export type WaveformSource = Pick<Participant, 'equipment_ids' | 'waveform_abbrevs'> & {
  platform_ids?: string[];
};

/**
 * The waveforms a participant actually carries: what each picked platform
 * carries, in platform order (its own abbrevs, then the waveforms of the
 * catalog radios it lists), then every picked equipment record's own
 * waveforms, in equipment order, then the direct picks not already among
 * them. Deduped case-insensitively, first spelling kept. It is the union
 * the compatibility matrix resolves for a platform, so a count or a chip
 * list built from it agrees with the matrix - a row that picked a PRC-152
 * and nothing else is not "0 waveforms", and neither is one that declared
 * an airframe and no radio of its own.
 *
 * Pure. Takes the lists rather than a `Participant`, so the wizard's draft
 * fits as well as a saved row. `platformById` is optional for the same
 * reason `platform_ids` is: a caller without platforms gets the old answer.
 */
export function effectiveWaveforms(
  participant: WaveformSource,
  equipmentById: ReadonlyMap<string, Equipment>,
  platformById?: ReadonlyMap<string, Platform>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (a: string) => {
    const k = norm(a);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(a);
  };
  for (const id of participant.platform_ids ?? []) {
    const pl = platformById?.get(id);
    if (!pl) continue;
    for (const a of pl.waveform_abbrevs) add(a);
    for (const eid of pl.equipment_ids) {
      for (const w of equipmentById.get(eid)?.data?.waveforms ?? []) add(w.abbrev);
    }
  }
  for (const id of participant.equipment_ids) {
    for (const w of equipmentById.get(id)?.data?.waveforms ?? []) add(w.abbrev);
  }
  for (const a of participant.waveform_abbrevs) add(a);
  return out;
}

/**
 * One platform's own waveforms plus those of the catalog radios it lists,
 * deduped the same way: what the board draws beneath a platform heading and
 * the wizard's step 4 lists for it.
 */
export function platformWaveforms(
  pl: Platform | undefined,
  equipmentById: ReadonlyMap<string, Equipment>,
): string[] {
  if (!pl) return [];
  return effectiveWaveforms(
    { platform_ids: [pl.id], equipment_ids: [], waveform_abbrevs: [] },
    equipmentById,
    new Map([[pl.id, pl]]),
  );
}

/** One equipment record's own waveform abbrevs, deduped the same way. */
export function equipmentWaveforms(eq: Equipment | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of eq?.data?.waveforms ?? []) {
    const k = norm(w.abbrev);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(w.abbrev);
  }
  return out;
}

/** One equipment record's own service abbrevs, deduped like its waveforms. */
export function equipmentServices(eq: Equipment | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of eq?.data?.services ?? []) {
    const k = norm(s.abbrev);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s.abbrev);
  }
  return out;
}

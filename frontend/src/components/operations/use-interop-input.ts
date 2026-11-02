import { useMemo } from 'react';

import { useEquipment, usePlatforms, useServices, useTransports, useWaveforms } from '@/services';
import type { Participant } from '@/types';
import type { InteropInput } from './interop-model';

/**
 * What `buildInterop` takes, from the five libraries the
 * Matrix and Web views both read. All equipment, not only radios: a SATCOM
 * terminal supplies services, and a platform lists terminals as well as radios.
 * The services library is for row names only, but it loads and fails with the
 * rest so a row never flips from its library name to its bare abbreviation
 * after the grid has drawn.
 */
export function useInteropInput(participants: Participant[]): {
  isLoading: boolean;
  isError: boolean;
  input: Omit<InteropInput, 'phaseId'>;
} {
  const e = useEquipment();
  const w = useWaveforms();
  const p = usePlatforms();
  const t = useTransports();
  const s = useServices();
  const isLoading = e.isLoading || w.isLoading || p.isLoading || t.isLoading || s.isLoading;
  const isError = e.isError || w.isError || p.isError || t.isError || s.isError;

  const input = useMemo(() => ({
    participants,
    equipmentById: new Map((e.data?.equipment ?? []).map((x) => [x.id, x])),
    platformById: new Map((p.data?.platforms ?? []).map((x) => [x.id, x])),
    transportById: new Map((t.data?.transports ?? []).map((x) => [x.id, x])),
    waveforms: w.data?.waveforms ?? [],
    services: s.data?.services ?? [],
  }), [participants, e.data, p.data, t.data, w.data, s.data]);

  return { isLoading, isError, input };
}

import { useMemo } from 'react';

import { useSections } from '@/services';
import type { Section } from '@/types';
import { hasPaceCard, paceSections } from './pace-constants';

export interface PaceSections {
  /** The card-bearing sections. */
  sections: Section[];
  /** Whether one section key runs a card. False while the query is in flight. */
  hasCard: (key: string) => boolean;
  /**
   * True until the sections query has answered.
   *
   * Load-bearing at every 404 gate. Before this was a database flag the answer
   * was available synchronously, so `!hasPaceCard(section)` could return
   * NotFoundPage on the first render. It cannot now: the first render has no
   * sections, so a gate that does not wait shows "not found" for a squadron that
   * exists, every time, for as long as the request takes.
   */
  isLoading: boolean;
}

/**
 * Which squadrons run a JEM/MPU5 comms card, from the sections table.
 *
 * For the call sites that hold a route param rather than a section record. Where
 * the section object is already in hand, call `hasPaceCard` directly and add no
 * query.
 */
export function usePaceSections(): PaceSections {
  const { data, isLoading } = useSections();

  return useMemo(() => {
    const enabled = paceSections(data);
    const keys = new Set(enabled.map((s) => s.key));
    return {
      sections: enabled,
      hasCard: (key: string) => keys.has(key),
      isLoading,
    };
  }, [data, isLoading]);
}

export { hasPaceCard };

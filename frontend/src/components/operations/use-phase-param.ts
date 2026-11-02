import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import type { Phase } from '@/types';

/**
 * The phase a Matrix or Web view is showing, from `?phase=<id>`. Null is
 * every phase, which is what an absent param and an id the operation does
 * not have both read as: a link made before a phase was removed opens on All
 * phases rather than on an empty grid. Writing null drops the param, and
 * every other param - the view, the expanded organizations - is left alone.
 *
 * `firstByDefault` is for a view that is always about one phase: an absent or
 * unknown param then reads as the first phase, and the value is null only
 * when the operation has no phases at all.
 */
export function usePhaseParam(phases: Phase[], firstByDefault = false): [string | null, (next: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('phase');
  const fallback = firstByDefault ? (phases[0]?.id ?? null) : null;
  const value = raw !== null && phases.some((p) => p.id === raw) ? raw : fallback;
  const setValue = useCallback((next: string | null) => {
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      if (next === null) n.delete('phase');
      else n.set('phase', next);
      return n;
    }, { replace: true });
  }, [setSearchParams]);
  return [value, setValue];
}

/**
 * The organizations the Matrix view has opened into one column per asset, from
 * `?expand=brown,gold`: column keys, comma separated. A key no column has is
 * ignored rather than kept, so the set is always a subset of `keys`.
 */
export function useExpandParam(keys: string[]): [ReadonlySet<string>, (key: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('expand') ?? '';
  const expanded = useMemo(() => {
    const known = new Set(keys);
    return new Set(raw.split(',').filter((k) => known.has(k)));
  }, [raw, keys]);
  const toggle = useCallback((key: string) => {
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      const next = new Set((n.get('expand') ?? '').split(',').filter(Boolean));
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) n.delete('expand');
      else n.set('expand', [...next].join(','));
      return n;
    }, { replace: true });
  }, [setSearchParams]);
  return [expanded, toggle];
}

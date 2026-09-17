import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@/test/utils';
import { hasPaceCard, paceSections } from './pace-constants';
import { usePaceSections } from './use-pace-sections';

const { sectionsResult } = vi.hoisted(() => ({
  sectionsResult: { current: {} },
}));

vi.mock('@/services', () => ({ useSections: () => sectionsResult.current }));

function Probe({ probe }: { probe: string }) {
  const { hasCard, isLoading, sections } = usePaceSections();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="has">{String(hasCard(probe))}</span>
      <span data-testid="keys">{sections.map((s) => s.key).join(',')}</span>
    </div>
  );
}

const at = (id: string) => screen.getByTestId(id).textContent;

describe('hasPaceCard', () => {
  // Which squadrons run a card was a hardcoded list of five until HQ made
  // the list change. It is a column now, so these are the only two rules left.
  it('reads the flag off the section', () => {
    expect(hasPaceCard({ pace_enabled: true })).toBe(true);
    expect(hasPaceCard({ pace_enabled: false })).toBe(false);
  });

  it('treats absence as no card', () => {
    // A response cached from before migration 036 has no such field. A squadron
    // silently gaining a card because a key was missing would be worse than one
    // silently not having it.
    expect(hasPaceCard({})).toBe(false);
    expect(hasPaceCard(undefined)).toBe(false);
  });

  it('filters a list without dropping order', () => {
    const list = [
      { key: 'asqd', label: 'A SQD', color: '#1', pace_enabled: true },
      { key: 'esqd', label: 'E SQD', color: '#2' },
      { key: 'hq', label: 'HQ', color: '#3', pace_enabled: true },
    ];
    expect(paceSections(list).map((s) => s.key)).toEqual(['asqd', 'hq']);
    expect(paceSections(undefined)).toEqual([]);
  });
});

describe('usePaceSections', () => {
  it('answers for a squadron the database says has a card', () => {
    sectionsResult.current = {
      data: [
        { key: 'asqd', label: 'A SQD', color: '#1', pace_enabled: true },
        { key: 'hq', label: 'HQ', color: '#2', pace_enabled: true },
        { key: 'zsqd', label: 'Z SQD', color: '#3' },
      ],
      isLoading: false,
    };
    render(<Probe probe="hq" />);

    // HQ is a squadron like the rest: nothing in the code names it.
    expect(at('has')).toBe('true');
    expect(at('keys')).toBe('asqd,hq');
  });

  it('says no for a squadron whose card is switched off', () => {
    sectionsResult.current = {
      data: [{ key: 'zsqd', label: 'Z SQD', color: '#3', pace_enabled: false }],
      isLoading: false,
    };
    render(<Probe probe="zsqd" />);
    expect(at('has')).toBe('false');
  });

  // The gates have to wait for this. Before the flag was a column the answer was
  // synchronous, so a page could return NotFoundPage on the first render; now
  // the first render has no sections and doing that would flash "not found" for
  // a squadron that exists, on every load.
  it('reports loading, and claims no cards while it does', () => {
    sectionsResult.current = { data: undefined, isLoading: true };
    render(<Probe probe="asqd" />);

    expect(at('loading')).toBe('true');
    expect(at('has')).toBe('false');
  });
});

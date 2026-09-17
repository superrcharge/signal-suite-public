import { describe, expect, it } from 'vitest';

import { TIER_SOURCE_OPTIONS, tierGap, tierGapMessage } from './tier-source';

const draft = (over: Partial<Parameters<typeof tierGap>[0]> = {}) => ({
  tier: 'C',
  source: 'none',
  equipmentId: '',
  transportId: '',
  customLabel: '',
  ...over,
});

describe('tierGap', () => {
  it('reports nothing for a tier that is not set', () => {
    // 'none' is the one source that legitimately carries no reference, and it
    // is the escape hatch the messages point at, so it must never be a gap.
    expect(tierGap(draft({ source: 'none' }))).toBeNull();
  });

  it.each([
    ['equipment', 'Catalog equipment', 'Equipment'],
    ['transport', 'Transport', 'Transport'],
    ['custom', 'Custom', 'Label'],
  ])('reports %s with no reference, naming the source and the field', (source, sourceLabel, field) => {
    expect(tierGap(draft({ source }))).toEqual({ sourceLabel, field });
  });

  it.each([
    ['equipment', { equipmentId: 'tsc-154v3' }],
    ['transport', { transportId: 't1' }],
    ['custom', { customLabel: 'HF ALE VOICE' }],
  ])('reports nothing for %s once its reference is carried', (source, over) => {
    expect(tierGap(draft({ source, ...over }))).toBeNull();
  });

  it('treats whitespace as empty, the way the server does', () => {
    // The server trims before checking, so a label of spaces is refused there.
    // Accepting it here would let Save through to a 400 -- the exact round trip
    // this rule exists to prevent.
    expect(tierGap(draft({ source: 'custom', customLabel: '   ' }))).not.toBeNull();
  });

  it('reports nothing for a source it does not know', () => {
    // The safe direction. A source added later without a reference must not be
    // reported as incomplete by a client that predates it; the server stays the
    // authority on what is valid.
    expect(tierGap(draft({ source: 'satellite' }))).toBeNull();
  });

  it('names the source with the label the editor shows, not the stored value', () => {
    // The point of the message is that it matches what is on screen. 'equipment'
    // appears nowhere in the UI; "Catalog equipment" is the option's text.
    const gap = tierGap(draft({ source: 'equipment' }));
    expect(gap).not.toBeNull();
    expect(tierGapMessage(gap!)).toBe('Required while Source is "Catalog equipment"');
    expect(TIER_SOURCE_OPTIONS.find((o) => o.value === 'equipment')?.label).toBe(gap!.sourceLabel);
  });
});

import { describe, it, expect } from 'vitest';
import {
  PALETTE,
  STATUS_COLORS,
  KIT_TYPE_COLORS,
  CONTRACT_URGENCY_COLORS,
  NEUTRAL_COLOR,
  SECTION_COLOR_PALETTE,
  withAlpha,
  badgeStyle,
} from './asset-colors';

// These assertions pin the exact strings that were inlined across the pages
// before this module existed. They are intentionally literal: if a value here
// changes, a rendered color changed with it, and that should be deliberate.
describe('asset color palette', () => {
  it('keeps the status palette values', () => {
    expect(STATUS_COLORS).toEqual({
      total:     '#1f6feb',
      available: '#3fb950',
      alert:     '#e3b341',
      onMission: '#a371f7',
      reserved:  '#f0883e',
      inop:      '#f85149',
    });
  });

  it('keeps the kit type palette values', () => {
    expect(KIT_TYPE_COLORS).toEqual({
      remote: '#39d3f0',
      ifk:    '#e879f9',
      atk:    '#2dd4bf',
    });
  });

  it('keeps the contract urgency palette values', () => {
    expect(CONTRACT_URGENCY_COLORS).toEqual({
      total:    '#1f6feb',
      expiring: '#f85149',
      caution:  '#f0883e',
      watch:    '#e3b341',
    });
  });

  it('keeps the neutral gray', () => {
    expect(NEUTRAL_COLOR).toBe('#8b949e');
  });
});

describe('withAlpha', () => {
  // The exact badge background / border strings that were previously written
  // out by hand in terminals-page and kits-page.
  it.each([
    [STATUS_COLORS.available, 0.12, 'rgba(63,185,80,0.12)'],
    [STATUS_COLORS.available, 0.25, 'rgba(63,185,80,0.25)'],
    [STATUS_COLORS.onMission, 0.12, 'rgba(163,113,247,0.12)'],
    [STATUS_COLORS.onMission, 0.25, 'rgba(163,113,247,0.25)'],
    [STATUS_COLORS.reserved,  0.12, 'rgba(240,136,62,0.12)'],
    [STATUS_COLORS.reserved,  0.25, 'rgba(240,136,62,0.25)'],
    [STATUS_COLORS.inop,      0.12, 'rgba(248,81,73,0.12)'],
    [STATUS_COLORS.inop,      0.25, 'rgba(248,81,73,0.25)'],
    [STATUS_COLORS.alert,     0.12, 'rgba(227,179,65,0.12)'],
    [STATUS_COLORS.alert,     0.25, 'rgba(227,179,65,0.25)'],
    [KIT_TYPE_COLORS.remote,  0.12, 'rgba(57,211,240,0.12)'],
    [KIT_TYPE_COLORS.remote,  0.25, 'rgba(57,211,240,0.25)'],
    [KIT_TYPE_COLORS.ifk,     0.12, 'rgba(232,121,249,0.12)'],
    [KIT_TYPE_COLORS.ifk,     0.25, 'rgba(232,121,249,0.25)'],
    [KIT_TYPE_COLORS.atk,     0.12, 'rgba(45,212,191,0.12)'],
    [KIT_TYPE_COLORS.atk,     0.25, 'rgba(45,212,191,0.25)'],
    [NEUTRAL_COLOR,           0.12, 'rgba(139,148,158,0.12)'],
    [NEUTRAL_COLOR,           0.25, 'rgba(139,148,158,0.25)'],
  ])('renders %s at %s alpha as %s', (hex, alpha, expected) => {
    expect(withAlpha(hex, alpha)).toBe(expected);
  });
});

describe('badgeStyle', () => {
  it('reproduces the original available-status badge triple', () => {
    expect(badgeStyle(STATUS_COLORS.available)).toEqual({
      bg: 'rgba(63,185,80,0.12)',
      color: '#3fb950',
      border: '1px solid rgba(63,185,80,0.25)',
    });
  });

  it('reproduces the original unknown-kit-type fallback triple', () => {
    expect(badgeStyle(NEUTRAL_COLOR)).toEqual({
      bg: 'rgba(139,148,158,0.12)',
      color: '#8b949e',
      border: '1px solid rgba(139,148,158,0.25)',
    });
  });
});

describe('SECTION_COLOR_PALETTE', () => {
  it('keeps all twenty swatches in order', () => {
    expect([...SECTION_COLOR_PALETTE]).toEqual([
      '#39d3f0', '#22d3ee', '#2dd4bf', '#00d4aa',
      '#34d399', '#56d364', '#a8ff3e', '#6ee7b7',
      '#e879f9', '#f472b6', '#ff96ca', '#f9a8d4',
      '#818cf8', '#60a5fa', '#79c0ff', '#a5f3fc',
      '#d2a8ff', '#c4b5fd', '#86efac', '#5eead4',
    ]);
  });

  // The reserved-status rule was previously only a comment in three files.
  it('never offers a hard-reserved status color', () => {
    const reserved = new Set<string>(Object.values(STATUS_COLORS));
    const collisions = SECTION_COLOR_PALETTE.filter((c) => reserved.has(c));
    expect(collisions).toEqual([]);
  });

  it('has no duplicate swatches', () => {
    expect(new Set(SECTION_COLOR_PALETTE).size).toBe(SECTION_COLOR_PALETTE.length);
  });
});

describe('PALETTE', () => {
  it('backs every semantic alias', () => {
    const hues = new Set<string>(Object.values(PALETTE));
    for (const color of [
      ...Object.values(STATUS_COLORS),
      ...Object.values(KIT_TYPE_COLORS),
      ...Object.values(CONTRACT_URGENCY_COLORS),
      NEUTRAL_COLOR,
    ]) {
      expect(hues).toContain(color);
    }
  });
});

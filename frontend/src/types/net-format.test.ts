import { describe, expect, it } from 'vitest';

import { formatNetFrequency, formatNetFrequencyLines } from './net-format';

describe('formatNetFrequency', () => {
  it('collapses a simplex net to a single figure', () => {
    expect(formatNetFrequency('31.6875', '31.6875', 'MHz')).toBe('31.6875 MHz');
  });

  it('labels TX and RX when they differ', () => {
    expect(formatNetFrequency('38.25', '48.75', 'MHz')).toBe('TX 38.25 / RX 48.75 MHz');
  });

  it('drops the unused side when only one is set', () => {
    expect(formatNetFrequency('38.25', '', 'MHz')).toBe('TX 38.25 MHz');
    expect(formatNetFrequency('', '48.75', 'GHz')).toBe('RX 48.75 GHz');
  });

  it('keeps freeform ranges intact', () => {
    expect(formatNetFrequency('225.000 - 399.975', '', 'MHz')).toBe(
      'TX 225.000 - 399.975 MHz',
    );
  });

  it('omits the unit when the value carries no figure', () => {
    // "TBD MHz" would be nonsense on a printed wheel.
    expect(formatNetFrequency('TBD', '', 'MHz')).toBe('TX TBD');
    expect(formatNetFrequency('TBD', 'TBD', 'MHz')).toBe('TBD');
  });

  it('returns an empty string when there is nothing to show', () => {
    expect(formatNetFrequency('', '', 'MHz')).toBe('');
    expect(formatNetFrequency(undefined, undefined, undefined)).toBe('');
  });

  it('tolerates a missing unit', () => {
    expect(formatNetFrequency('31.6875', '31.6875', '')).toBe('31.6875');
  });

  it('trims surrounding whitespace', () => {
    expect(formatNetFrequency('  31.6875 ', ' 31.6875  ', ' MHz ')).toBe('31.6875 MHz');
  });
});

describe('formatNetFrequencyLines', () => {
  it('breaks a split TX/RX pair over two lines', () => {
    // One line is the widest thing on the sheet (211 viewBox units at worst);
    // split it is 104, which is what lets the wheel be drawn larger.
    expect(formatNetFrequencyLines('33.5000', '43.5000', 'MHz')).toEqual([
      'TX 33.5000',
      'RX 43.5000 MHz',
    ]);
  });

  it('keeps a simplex net on one line', () => {
    expect(formatNetFrequencyLines('31.6875', '31.6875', 'MHz')).toEqual(['31.6875 MHz']);
  });

  it('keeps a single-sided net on one line', () => {
    expect(formatNetFrequencyLines('34.0000', '', 'MHz')).toEqual(['TX 34.0000 MHz']);
    expect(formatNetFrequencyLines('', '48.75', 'GHz')).toEqual(['RX 48.75 GHz']);
  });

  it('splits the worst case - a range on both sides', () => {
    expect(formatNetFrequencyLines('225.000 - 399.975', '225.000 - 399.975', 'MHz')).toEqual([
      '225.000 - 399.975 MHz',
    ]);
    expect(formatNetFrequencyLines('225.000 - 399.975', '400.000 - 450.000', 'MHz')).toEqual([
      'TX 225.000 - 399.975',
      'RX 400.000 - 450.000 MHz',
    ]);
  });

  it('carries the unit on the last line only', () => {
    const lines = formatNetFrequencyLines('1.3600', '1.4600', 'GHz');
    expect(lines[0]).not.toMatch(/GHz/);
    expect(lines[1]).toMatch(/GHz$/);
  });

  it('omits the unit entirely for a non-numeric pair', () => {
    expect(formatNetFrequencyLines('TBD', 'TBD', 'MHz')).toEqual(['TBD']);
  });

  it('returns nothing when there is nothing to show', () => {
    expect(formatNetFrequencyLines('', '', 'MHz')).toEqual([]);
  });
});

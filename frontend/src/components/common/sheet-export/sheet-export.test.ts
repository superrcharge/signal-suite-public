import { describe, expect, it } from 'vitest';

import {
  catalogStem,
  clipboardImageSupported,
  clipboardUnavailableReason,
  paceStem,
  slugify,
} from './sheet-export';
import { datedFilename } from '../csv/download-csv';

function fakeWindow(over: Record<string, unknown>): Window {
  return {
    isSecureContext: true,
    navigator: { clipboard: { write: () => undefined } },
    ClipboardItem: class {},
    ...over,
  } as unknown as Window;
}

describe('datedFilename', () => {
  it('still defaults to csv, so every existing call site is unchanged', () => {
    expect(datedFilename('signal-suite-terminals')).toMatch(/^signal-suite-terminals-\d{8}\.csv$/);
  });

  it('takes an extension for the zip, png and pptx cases', () => {
    expect(datedFilename('signal-suite-export', 'zip')).toMatch(/^signal-suite-export-\d{8}\.zip$/);
    expect(datedFilename('signal-suite-pace-card-asqd', 'pptx')).toMatch(/^signal-suite-pace-card-asqd-\d{8}\.pptx$/);
  });
});

describe('slugify', () => {
  it('lowercases and joins on single dashes', () => {
    expect(slugify('A SQD')).toBe('a-sqd');
    expect(slugify('AN/PRC-158')).toBe('an-prc-158');
  });

  it('trims leading and trailing dashes rather than leaving them in a filename', () => {
    expect(slugify('  R&D  ')).toBe('r-d');
    expect(slugify('!!!')).toBe('');
  });
});

describe('filename stems', () => {
  it('names a PACE card by its squadron', () => {
    expect(paceStem('asqd')).toBe('signal-suite-pace-card-asqd');
    expect(paceStem('R&D')).toBe('signal-suite-pace-card-r-d');
  });

  it('names a datasheet by its equipment, falling back when the name slugs to nothing', () => {
    expect(catalogStem('AN/PRC-158')).toBe('signal-suite-datasheet-an-prc-158');
    expect(catalogStem('')).toBe('signal-suite-datasheet');
  });
});

describe('clipboardImageSupported', () => {
  it('holds when every gate is present', () => {
    expect(clipboardImageSupported(fakeWindow({}))).toBe(true);
    expect(clipboardUnavailableReason(fakeWindow({}))).toBeUndefined();
  });

  it('fails, and says why, outside a secure context', () => {
    const w = fakeWindow({ isSecureContext: false });
    expect(clipboardImageSupported(w)).toBe(false);
    expect(clipboardUnavailableReason(w)).toBe('Needs a secure connection (https)');
  });

  it('fails when the browser has no ClipboardItem', () => {
    const w = fakeWindow({ ClipboardItem: undefined });
    expect(clipboardImageSupported(w)).toBe(false);
    expect(clipboardUnavailableReason(w)).toBe('Not supported in this browser');
  });

  it('fails when clipboard.write is missing', () => {
    const w = fakeWindow({ navigator: { clipboard: {} } });
    expect(clipboardImageSupported(w)).toBe(false);
  });

  it('fails when there is no clipboard at all', () => {
    const w = fakeWindow({ navigator: {} });
    expect(clipboardImageSupported(w)).toBe(false);
  });
});

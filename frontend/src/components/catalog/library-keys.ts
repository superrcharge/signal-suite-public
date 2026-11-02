/**
 * The four Comms Library panes, keyed as the URL names them, in chip order.
 * Organizations are deliberately not here: they are visible only inside
 * Operations, added from the Join Operation wizard, and a fifth chip for
 * them was removed on 2026-10-09 the day it arrived.
 *
 * Its own module because both the library page and its print route read it,
 * and a page module that exports constants beside its component breaks fast
 * refresh (react-refresh/only-export-components).
 */
export const LIBRARIES = [
  { key: 'waveforms', label: 'Waveforms' },
  { key: 'services', label: 'Services' },
  { key: 'transports', label: 'Transports' },
  { key: 'platforms', label: 'Platforms' },
] as const;

export type LibraryKey = (typeof LIBRARIES)[number]['key'];

export function isLibraryKey(value: string | null): value is LibraryKey {
  return value !== null && LIBRARIES.some(l => l.key === value);
}

const LIBRARY_LABEL = Object.fromEntries(LIBRARIES.map(l => [l.key, l.label])) as Record<LibraryKey, string>;

export function libraryLabel(lib: LibraryKey): string {
  return LIBRARY_LABEL[lib];
}

/** Waveforms is the default and stays out of the URL, on the page and the print route alike. */
export function libraryQuery(lib: LibraryKey): string {
  return lib === 'waveforms' ? '' : `?lib=${lib}`;
}

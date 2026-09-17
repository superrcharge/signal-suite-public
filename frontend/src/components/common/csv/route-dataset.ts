import type { CsvResource } from './csv-domains';

/**
 * Which dataset the current route is about, if any.
 *
 * Pure, and separate from the header so it can be tested against every path in
 * routes/router.tsx without rendering an AppBar. This only produces a default
 * tick in the dialog - the controls themselves are identical on every page, and
 * a route with no dataset simply opens with nothing preselected.
 */
export function datasetForPath(pathname: string, search = ''): CsvResource | undefined {
  if (pathname.startsWith('/terminals')) return 'terminals';
  if (pathname.startsWith('/kits')) return 'kits';
  if (pathname.startsWith('/contracts')) return 'contracts';
  if (pathname.startsWith('/nets')) return 'nets';
  if (pathname.startsWith('/pace')) return 'pace-channels';

  // The Comms Library is keyed off ?lib=, not ?type=, and has to be read before
  // the /catalog branch below or it falls through to "equipment" - which is the
  // wrong dataset on every one of its three tabs. It is also the only route
  // that can pre-tick transports at all: that dataset has an export, a template
  // and an import, and until this route existed there was no page about it.
  if (pathname.startsWith('/catalog/comms-library')) {
    const lib = new URLSearchParams(search).get('lib');
    if (lib === 'services') return 'services';
    if (lib === 'transports') return 'transports';
    if (lib === 'platforms') return 'platforms';
    // Waveforms is the default and is omitted from the URL, so a bare path and
    // an unrecognised value both land here, matching the page's own fallback.
    return 'waveforms';
  }

  // The matrix is a cross-tab and has no CSV of its own; the data behind its
  // columns is the platform library, so that is what the share menu offers.
  // Before the /catalog branch for the same reason as the Comms Library.
  if (pathname.startsWith('/catalog/compatibility')) return 'platforms';

  // Every /catalog tab is now an equipment filter. The waveforms and services
  // tabs used to be their own datasets and were read off ?type= here; both
  // moved to the Comms Library, which the branch above answers for.
  if (pathname.startsWith('/catalog')) return 'equipment';

  return undefined;
}

/**
 * The squadron the current route is looking at.
 *
 * Deliberately NOT the header's end-anchored `paceSectionMatch` regex. That one
 * is anchored so Add Net cannot navigate away from the PACE editor's unsaved
 * draft; downloading a file navigates nowhere, so /pace/asqd/edit and
 * /pace/asqd/print should both prefill asqd. Do not "fix" this to match the
 * other regex.
 *
 * Unvalidated on purpose, and this function stays pure because of it. Whether a
 * squadron is one the dataset accepts is a question about the sections table,
 * which moved into the database with migration 036 - so it is answered in the
 * dialog, against the same list the squadron dropdown is built from. That is
 * also the stronger place for it: it catches any squadron the dataset rejects,
 * not only one that arrived from a route.
 */
export function sectionForPath(pathname: string): string | undefined {
  return /^\/(?:nets|pace)\/([^/]+)/.exec(pathname)?.[1];
}

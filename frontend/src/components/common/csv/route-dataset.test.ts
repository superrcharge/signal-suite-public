import { describe, expect, it } from 'vitest';

import { datasetForPath, sectionForPath } from './route-dataset';

// Every path in routes/router.tsx, with its params filled in. A route added
// there without a thought about which dataset it is about shows up here as a
// missing row rather than as a dialog that opens with nothing ticked.
const ROUTES: [path: string, search: string, dataset: string | undefined][] = [
  ['/', '', undefined],
  ['/dashboard', '', undefined],
  ['/terminals', '', 'terminals'],
  ['/kits', '', 'kits'],
  ['/contracts', '', 'contracts'],
  ['/catalog', '', 'equipment'],
  ['/catalog', '?type=all', 'equipment'],
  ['/catalog', '?type=satcom', 'equipment'],
  ['/catalog', '?type=radio', 'equipment'],
  // ?type=waveforms and ?type=services used to answer their own datasets. Both
  // tabs are retired and the page redirects them, so every /catalog tab is now
  // equipment; the three rows above answer for the Comms Library instead.
  ['/catalog', '?type=waveforms', 'equipment'],
  ['/catalog', '?type=services', 'equipment'],
  ['/catalog/editor', '', 'equipment'],
  // The Comms Library keys off ?lib=, not ?type=. Without its own branch these
  // three fall through to the /catalog prefix and answer 'equipment', which is
  // wrong on every one of them - and 'transports' is reachable from nowhere
  // else, since no other route is about that dataset.
  ['/catalog/comms-library', '', 'waveforms'],
  ['/catalog/comms-library', '?lib=services', 'services'],
  ['/catalog/comms-library', '?lib=transports', 'transports'],
  // Waveforms is the default, so the page drops the param rather than writing
  // ?lib=waveforms; an unrecognised value falls back the same way the page does.
  ['/catalog/comms-library', '?lib=waveforms', 'waveforms'],
  ['/catalog/comms-library', '?lib=nonesuch', 'waveforms'],
  ['/catalog/42/edit', '', 'equipment'],
  ['/catalog/42/print', '', 'equipment'],
  ['/catalog/42', '', 'equipment'],
  ['/nets', '', 'nets'],
  ['/nets/asqd', '', 'nets'],
  ['/pace', '', 'pace-channels'],
  ['/pace/asqd', '', 'pace-channels'],
  ['/pace/asqd/edit', '', 'pace-channels'],
  ['/pace/asqd/print', '', 'pace-channels'],
  ['/users', '', undefined],
  ['/audit', '', undefined],
  ['/settings', '', undefined],
  ['/nowhere', '', undefined],
];

describe('datasetForPath', () => {
  it.each(ROUTES)('%s%s -> %s', (path, search, dataset) => {
    expect(datasetForPath(path, search)).toBe(dataset);
  });

  it('defaults the search string, so a caller may omit it', () => {
    expect(datasetForPath('/catalog')).toBe('equipment');
  });
});

describe('sectionForPath', () => {
  it('reads the squadron off a nets or pace route', () => {
    expect(sectionForPath('/nets/asqd')).toBe('asqd');
    expect(sectionForPath('/pace/asqd')).toBe('asqd');
  });

  // Not the header's end-anchored regex. That anchor exists so Add Net cannot
  // navigate away from the PACE editor's unsaved draft; downloading a file
  // navigates nowhere, so these must still prefill.
  it('still reads it on the editor and print routes', () => {
    expect(sectionForPath('/pace/asqd/edit')).toBe('asqd');
    expect(sectionForPath('/pace/asqd/print')).toBe('asqd');
  });

  it('gives nothing for the bare pickers', () => {
    expect(sectionForPath('/nets')).toBeUndefined();
    expect(sectionForPath('/pace')).toBeUndefined();
    expect(sectionForPath('/terminals')).toBeUndefined();
  });

  it('is purely syntactic, and validates nothing', () => {
    // Whether a squadron runs a PACE card is a column on `sections` now
    // (migration 036), so the answer needs a query and this function would stop
    // being pure to ask it. The dialog checks instead, against the same list its
    // squadron dropdown is built from - which also catches a squadron that was
    // switched off after the page loaded, not only one that came from a route.
    expect(sectionForPath('/pace/esqd')).toBe('esqd');
    expect(sectionForPath('/pace/not-a-section')).toBe('not-a-section');
  });
});

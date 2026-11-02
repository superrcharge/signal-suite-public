import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadNativeDeck } from '@/components/common/sheet-export/sheet-export';
import { OPERATION_DECK_FONTS } from '@/components/common/sheet-export/sheet-fonts';
import type { FetchedFontFamily } from '@/components/common/sheet-export/sheet-fonts';
import { WIDE_SLIDE } from '@/components/common/sheet-export/slide-geometry';
import { DECK_INPUT, DECK_OPERATION, DECK_PARTICIPANTS, DECK_PHASES, DECK_SITES, testColor } from './phase-deck-fixtures';
import { planPhaseDeck } from './phase-deck-plan';
import { phaseNativeDeckSpec } from './phase-deck-native';
import type { Show } from './phase-show';

const saved = vi.hoisted(() => [] as { blob: Blob; name: string }[]);

vi.mock('../common/csv/download-csv', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../common/csv/download-csv')>()),
  saveBlob: (blob: Blob, name: string) => { saved.push({ blob, name }); },
}));

beforeEach(() => { saved.length = 0; });

const FACE = (() => {
  const bytes = new Uint8Array(12);
  new DataView(bytes.buffer).setUint32(0, 0x00010000);
  return bytes;
})();
const fonts = (): Promise<readonly FetchedFontFamily[]> => Promise.resolve(OPERATION_DECK_FONTS.map((f) => ({ typeface: f.typeface, regular: FACE, bold: FACE })));

const spec = (show: Show, focusParam: string | null = null) => phaseNativeDeckSpec(
  planPhaseDeck({ operation: DECK_OPERATION, phases: DECK_PHASES, participants: DECK_PARTICIPANTS, input: DECK_INPUT, sites: DECK_SITES, show, focusParam, currentPhaseId: 'ph1' }),
  DECK_SITES, 'Night Owl', testColor,
);

/** The part names a stored zip carries in the clear. */
const names = async () => [...new Set(new TextDecoder().decode(new Uint8Array(await saved[0]!.blob.arrayBuffer())).match(/(?:ppt|docProps)\/[A-Za-z0-9_/]+\.(?:xml|rels|png|fntdata)/g) ?? [])];

describe('the native phase deck', () => {
  it('is 16:9, one slide per phase, named for the operation', () => {
    const s = spec('all');
    expect(s.slide).toBe(WIDE_SLIDE);
    expect(s.count).toBe(3);
    expect(s.stem).toBe('night-owl-comms-by-phase');
  });

  it('downloads one .pptx with a slide per phase, the deck\'s fonts embedded once, and reports each slide as it starts', async () => {
    const progress: string[] = [];
    const result = await downloadNativeDeck({ ...spec('all'), fonts }, (n, of) => { progress.push(`${String(n)}/${String(of)}`); });
    expect(result).toEqual({ ok: true, fontWarning: undefined });
    expect(progress).toEqual(['1/3', '2/3', '3/3']);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.name).toMatch(/^night-owl-comms-by-phase-\d{8}\.pptx$/);
    const parts = await names();
    expect(parts.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toEqual(['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slides/slide3.xml']);
    // Native: no picture in it at all.
    expect(parts.some((n) => n.startsWith('ppt/media/'))).toBe(false);
    // One part per family here, because the test hands each family one face for both slots; the real faces make three.
    expect(parts.filter((n) => n.startsWith('ppt/fonts/'))).toEqual(['ppt/fonts/font1.fntdata', 'ppt/fonts/font2.fntdata']);
  }, 20000);

  it('draws every Show mode, and a slide for the phase a focused unit is not in', async () => {
    for (const [show, focus] of [['gaps', null], ['focus', 'pb']] as const) {
      saved.length = 0;
      expect(await downloadNativeDeck({ ...spec(show, focus), fonts })).toEqual({ ok: true, fontWarning: undefined });
      expect((await names()).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(3);
    }
  }, 20000);

  it('still downloads when a face could not be fetched, and says its text may be set in another face', async () => {
    const result = await downloadNativeDeck({ ...spec('all'), fonts: () => Promise.resolve([]) });
    expect(result.ok).toBe(true);
    expect(result.fontWarning).toMatch(/fonts could not be embedded/);
    expect(saved).toHaveLength(1);
  }, 20000);

  it('reports a failed slide and downloads nothing, rather than a deck that is missing a phase', async () => {
    const s = spec('all');
    const result = await downloadNativeDeck({
      ...s, fonts,
      buildSlide: (i) => (i === 1 ? Promise.reject(new Error('Could not lay out Infil.')) : s.buildSlide(i)),
    });
    expect(result).toEqual({ ok: false, error: 'Could not lay out Infil.' });
    expect(saved).toEqual([]);
  }, 20000);

  it('reads colours off the page by default, and a token no stylesheet defines does not stop the deck', async () => {
    // jsdom computes no custom property, so every token reads as the browser's fallback: a deck of one colour, still a deck.
    const plan = planPhaseDeck({ operation: DECK_OPERATION, phases: DECK_PHASES, participants: DECK_PARTICIPANTS, input: DECK_INPUT, sites: DECK_SITES, show: 'all', focusParam: null, currentPhaseId: 'ph1' });
    const slide = await phaseNativeDeckSpec(plan, DECK_SITES, 'Night Owl').buildSlide(0);
    expect(slide.background).toMatch(/^[0-9A-F]{6}$/);
    expect(document.body.children).toHaveLength(0);
  });
});

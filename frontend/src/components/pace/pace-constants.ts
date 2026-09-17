import type { Section } from '@/types';

/**
 * Whether a section runs a JEM/MPU5 comms card.
 *
 * This was `PACE_SECTION_KEYS`, a hardcoded list of five, and the comment on it
 * said to promote it to a `pace_enabled` column once the list started changing.
 * HQ is it changing, so it now reads the flag off the section record
 * (migration 036).
 *
 * Absence is false. A response cached from before the migration has no such
 * field, and a squadron silently gaining a card because a key was missing would
 * be worse than one silently not having it.
 *
 * Takes the section, not the key, so it stays a pure function. Where only a key
 * is in hand - a route param - use `usePaceSections`, which looks it up.
 */
export function hasPaceCard(section: Pick<Section, 'pace_enabled'> | undefined): boolean {
  return section?.pace_enabled === true;
}

/** The card-bearing sections, in the order the sections query returned them. */
export function paceSections(sections: Section[] | undefined): Section[] {
  return (sections ?? []).filter(hasPaceCard);
}

/**
 * The four PACE tiers, in the order they print.
 *
 * Here rather than in `SheetPreview.tsx` because three places need it: the sheet,
 * the editor's Section 06 rows, and the editor's live tile preview. It lived in
 * the sheet and was restated as a TIER_LETTERS/TIER_LABELS pair in the editor,
 * which is two lists of the same four things able to disagree about a spelling.
 */
/**
 * The colour a value marked as changed prints in, on screen, on paper and in
 * the PNG/PPTX export alike.
 *
 * One hex value rather than a token, because the slide export reads the
 * computed colour straight into the PPTX run and a test asserts it there.
 * About 5:1 against `--shf-paper`, so it clears 4.5:1 for the sheet's small
 * condensed type. Note that on a greyscale printer it prints as a dark grey
 * close to black; the marks are for a colour print or the screen.
 */
export const SHEET_CHANGED = '#C62828';

/** Whether `key` is one of a row's changed-marks. */
export function isMarked(highlights: readonly string[] | undefined, key: string): boolean {
  return highlights?.includes(key) ?? false;
}

/** A row's marks with `key` set or cleared. Never repeats a key. */
export function toggleMark(
  highlights: readonly string[] | undefined,
  key: string,
  on: boolean,
): string[] {
  const rest = (highlights ?? []).filter((k) => k !== key);
  return on ? [...rest, key] : rest;
}

export const PACE_TIERS: { key: string; label: string }[] = [
  { key: 'P', label: 'Primary' },
  { key: 'A', label: 'Alternate' },
  { key: 'C', label: 'Contingency' },
  { key: 'E', label: 'Emergency' },
];

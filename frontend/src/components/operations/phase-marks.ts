/**
 * How the phases an asset is in are written out, for the Loadout gear lists and
 * the Join wizard's review. Pure, like `interop-model.ts`, whose `isPresent` is
 * the presence rule the callers pass in.
 */

import type { Phase } from '@/types';

/**
 * "Phase II-III" for a run of two or more: the shared leading word is not
 * repeated, so "Phase II" through "Phase III" reads as one range. Names with
 * nothing in common keep both ("Alpha-Bravo").
 */
function runLabel(first: string, last: string): string {
  const space = first.indexOf(' ');
  if (space > 0 && last.startsWith(first.slice(0, space + 1))) return `${first}-${last.slice(space + 1)}`;
  return `${first}-${last}`;
}

/**
 * What to print under an asset that is not in every phase: "" when it is in
 * all of them, or when the operation has fewer than two phases and there is
 * nothing to distinguish, "No phase" when it is in none, otherwise the names.
 * `list` spells each phase out ("Phase II, Phase III"); `runs` collapses
 * neighbours in the operation's order ("Phase II-III", "Phase I, Phase III").
 */
export function phaseCaption(
  phases: Phase[],
  isIn: (phaseId: string) => boolean,
  style: 'list' | 'runs',
): string {
  if (phases.length < 2) return '';
  const present = phases.map((ph) => isIn(ph.id));
  const count = present.filter(Boolean).length;
  if (count === phases.length) return '';
  if (count === 0) return 'No phase';
  if (style === 'list') return phases.filter((_, i) => present[i]).map((ph) => ph.name).join(', ');

  const parts: string[] = [];
  let i = 0;
  while (i < phases.length) {
    if (!present[i]) { i += 1; continue; }
    let j = i;
    while (j + 1 < phases.length && present[j + 1]) j += 1;
    const first = (phases[i] as Phase).name;
    parts.push(j > i ? runLabel(first, (phases[j] as Phase).name) : first);
    i = j + 1;
  }
  return parts.join(', ');
}

const ROMAN: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** 5 to "V": a phase added by hand is numbered the way the defaults are, Phase I to IV. */
export function toRoman(n: number): string {
  let out = '';
  let rest = n;
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) { out += glyph; rest -= value; }
  }
  return out;
}

/** The next "Phase N" no row is already using, so Add never starts on a duplicate. */
export function nextPhaseName(draft: { name: string }[]): string {
  const used = new Set(draft.map((ph) => ph.name.trim().toLowerCase()));
  let n = draft.length + 1;
  while (used.has(`phase ${toRoman(n).toLowerCase()}`)) n += 1;
  return `Phase ${toRoman(n)}`;
}

/**
 * The PACE tier source vocabulary, and the one rule that decides whether a tier
 * can be saved.
 *
 * Separate from `pace-editor-page.tsx` for the same reason `wheel-geometry.ts`
 * is separate from `ChannelWheel`: the rule is asserted directly rather than
 * through rendered markup. It is also what react-refresh requires, since a
 * module holding a component may export nothing else.
 */
import type { PaceTierSource } from '@/types/pace';

export const TIER_SOURCE_OPTIONS: { value: PaceTierSource; label: string }[] = [
  { value: 'none', label: 'Not set' },
  // "equipment", not "terminal": the list carries radios as well as SATCOM
  // terminals, and calling it a terminal picker contradicted what it showed.
  { value: 'equipment', label: 'Catalog equipment' },
  { value: 'transport', label: 'Transport' },
  { value: 'custom', label: 'Custom' },
];

const TIER_SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  TIER_SOURCE_OPTIONS.map((o) => [o.value, o.label]),
);

/** The field label Section 06 shows for each source's reference. */
const TIER_SOURCE_FIELD: Record<string, string> = {
  equipment: 'Equipment',
  transport: 'Transport',
  custom: 'Label',
};

/**
 * The shape this rule needs, rather than the editor's whole `TierDraft`, so the
 * page imports the rule and the rule imports nothing from the page.
 */
export interface TierRefs {
  tier: string;
  source: string;
  equipmentId: string;
  transportId: string;
  customLabel: string;
}

/**
 * What stops a tier saving, or null.
 *
 * The server refuses a tier whose source names a reference it does not carry.
 * Until this existed the only sign was a 400 after the round trip, reading "a
 * tier names a source but carries no matching reference" - four tiers and three
 * sources to check by hand, with nothing marked.
 *
 * It is worst for `custom`, which is how it was reported: Detail sits directly
 * under Label and is optional, so a tier with a Detail typed and a Label left
 * empty looks configured and prints as blank.
 *
 * Pure, and the single source for both the inline mark and the Save message, so
 * those two cannot disagree about which tier is at fault.
 */
export function tierGap(tier: TierRefs): { sourceLabel: string; field: string } | null {
  const ref: Record<string, string> = {
    equipment: tier.equipmentId,
    transport: tier.transportId,
    custom: tier.customLabel,
  };
  const carried = ref[tier.source];
  // 'none' carries no reference by design, so it is absent from the map rather
  // than special-cased - and so is any source added later without one. A source
  // this map does not know cannot be reported as incomplete, which is the safe
  // direction: the server is still the authority.
  if (carried === undefined || carried.trim() !== '') return null;
  return {
    sourceLabel: TIER_SOURCE_LABELS[tier.source] ?? tier.source,
    field: TIER_SOURCE_FIELD[tier.source] ?? 'reference',
  };
}

/** The inline mark on the offending field. */
export const tierGapMessage = (gap: { sourceLabel: string; field: string }) =>
  `Required while Source is "${gap.sourceLabel}"`;

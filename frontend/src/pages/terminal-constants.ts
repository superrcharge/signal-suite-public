/**
 * Shared terminal constants used by the terminals page, drawer, and dashboard.
 */

/** PoP (point of presence) pin options - Starshield (mini/hp) only. */
export const POP_PIN_OPTIONS = [
  { value: 'us-east',   label: 'US-EAST' },
  { value: 'us-west',   label: 'US-WEST' },
  { value: 'germany',   label: 'Germany' },
  { value: 'uk',        label: 'United Kingdom' },
  { value: 'australia', label: 'Australia' },
] as const;

export const POP_PIN_LABELS: Record<string, string> = Object.fromEntries(
  POP_PIN_OPTIONS.map((o) => [o.value, o.label]),
);

/** Only Starshield terminals (mini/hp) can carry a PoP pin. */
export const isStarshieldModel = (model: string | null | undefined): boolean =>
  model === 'mini' || model === 'hp';

/**
 * Shared kit constants used by the kits page, drawer, and dashboard.
 */

export const KIT_TYPE_OPTIONS = [
  { value: 'remote', label: 'Remote' },
  { value: 'ifk',    label: 'IFK' },
  { value: 'atk',    label: 'ATK' },
] as const;

export const KIT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  KIT_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

/** The three independent network-classification booleans, in column order. */
export const KIT_NETWORKS = [
  { key: 'black', label: 'BLACK' },
  { key: 'secret', label: 'SECRET' },
  { key: 'topsecret',  label: 'TS' },
] as const;

export type KitNetworkKey = (typeof KIT_NETWORKS)[number]['key'];

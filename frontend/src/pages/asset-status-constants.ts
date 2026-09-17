/**
 * Asset status constants, shared by the terminals and kits pages, both of their
 * drawers, and the dashboard.
 *
 * Terminals and kits carry the same seven statuses. That used to be a
 * coincidence maintained by hand - every one of those five files declared its
 * own copy of the options, the badge styles and the labels, ten arrays and
 * records in total, and nothing compared them. An earlier issue settled that kits and
 * terminals share the vocabulary permanently, which removed the only reason the
 * copies existed.
 *
 * The backend half of the same decision is `backend/internal/shared/assetstatus`.
 * Values here must match `assetstatus.Valid`; the two are not mechanically
 * linked, because the generated CSV column metadata carries the set as prose
 * rather than as an enum.
 *
 * Note what does NOT belong here. `STATUS_COLORS` in `@/theme/asset-colors` is
 * keyed by color bucket, not by status - it has five keys, because the three
 * ALERT variants share one hue - and `CSV_STATUS_OPTIONS` in
 * `@/components/common/csv/csv-domains` is already the single declaration for
 * the CSV dialogs. Neither is duplicated by this file.
 */
import { STATUS_COLORS, badgeStyle } from '@/theme/asset-colors';
import type { InlineSelectOption } from './inline-edit-cell';

/** The seven statuses in display order, as select options. */
export const STATUS_OPTIONS: InlineSelectOption[] = [
  { value: 'available',   label: 'Available' },
  { value: 'on-mission',  label: 'On Mission' },
  { value: 'reserved',    label: 'Reserved' },
  { value: 'alert',       label: 'ALERT' },
  { value: 'alert-blue',  label: 'ALERT BLUE' },
  { value: 'alert-green', label: 'ALERT GREEN' },
  { value: 'inop',        label: 'INOP' },
];

/** Derived from {@link STATUS_OPTIONS} so a label is written once. */
export const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * Badge styling per status. Not derivable from {@link STATUS_OPTIONS}: the
 * three ALERT variants deliberately share one hue (the distinction is carried
 * by the label), and `dot` is a per-status choice rather than a function of the
 * color.
 */
export const STATUS_STYLES: Record<string, { bg: string; color: string; border: string; dot: boolean }> = {
  available:     { ...badgeStyle(STATUS_COLORS.available), dot: true },
  'on-mission':  { ...badgeStyle(STATUS_COLORS.onMission), dot: true },
  reserved:      { ...badgeStyle(STATUS_COLORS.reserved),  dot: true },
  inop:          { ...badgeStyle(STATUS_COLORS.inop),      dot: false },
  alert:         { ...badgeStyle(STATUS_COLORS.alert),     dot: false },
  'alert-blue':  { ...badgeStyle(STATUS_COLORS.alert),     dot: false },
  'alert-green': { ...badgeStyle(STATUS_COLORS.alert),     dot: false },
};

/**
 * The three variants the ALERT stat tile rolls up. Shared so the tile counts
 * the same set on the kits page, the terminals page and the dashboard.
 */
export const ALERT_STATUSES = ['alert', 'alert-blue', 'alert-green'];

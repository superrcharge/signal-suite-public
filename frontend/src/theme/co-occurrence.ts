import {
  STATUS_COLORS,
  KIT_TYPE_COLORS,
  CONTRACT_URGENCY_COLORS,
  TERMINAL_FAMILY_COLORS,
  CATALOG_COLORS,
  ROLE_COLORS,
  SECTION_COLOR_PALETTE,
} from './asset-colors';
import type { Vision } from './color-metrics';

/**
 * Which color groups can appear on screen at the same time.
 *
 * Two colors only need to be distinguishable if they can co-render. That is
 * what makes the palette tractable: the app needs 34 colors in total, which is
 * far past the number a person can tell apart as categorical labels, but no
 * single view ever shows more than about ten.
 *
 * `mutual` groups must be distinct from every other color in the same context.
 * `against` groups render one member at a time (a row shows exactly one section
 * color), so each member only has to clear the mutual set, not its own siblings.
 */
export interface CoRenderContext {
  name: string;
  mutual: Record<string, Record<string, string>>;
  against?: Record<string, readonly string[]>;
}

export const CO_RENDER: readonly CoRenderContext[] = [
  {
    name: 'terminals + kits table row',
    mutual: { status: STATUS_COLORS, kitType: KIT_TYPE_COLORS },
    against: { sectionSwatch: SECTION_COLOR_PALETTE },
  },
  {
    name: 'stat strip',
    mutual: { status: STATUS_COLORS },
  },
  {
    // The Total tile renders in this row too, in the status blue.
    name: 'dashboard family tiles',
    mutual: { family: TERMINAL_FAMILY_COLORS, status: { total: STATUS_COLORS.total } },
  },
  {
    // A separate panel from the family tiles, so it may reuse those hues.
    name: 'dashboard catalog tiles',
    mutual: { catalog: CATALOG_COLORS },
  },
  {
    // Deliberately separate from `stat strip`: urgency shares hues with status
    // and that is fine, because the two never appear in the same viewport.
    name: 'contracts stat strip',
    mutual: { urgency: CONTRACT_URGENCY_COLORS },
  },
  {
    // The Users page renders every role at once, twice over: as stat strip
    // cells and as the badges in the privileges legend below them. All five
    // therefore have to be mutually distinguishable.
    name: 'users stat strip',
    mutual: { role: ROLE_COLORS },
  },
];

/**
 * Minimum OKLab distance a co-rendering pair must keep.
 *
 * Normal vision is held to a real separation floor. The dichromacy floors are
 * lower because the simulation models full dichromacy, which is more severe
 * than the anomalous trichromacy most affected people have, and because status
 * is never carried by color alone - every badge also has a text label.
 */
export const FLOORS: Record<Vision, number> = {
  normal: 0.10,
  deuteranopia: 0.05,
  protanopia: 0.05,
  tritanopia: 0.05,
};

export const VISIONS: readonly Vision[] = ['normal', 'deuteranopia', 'protanopia', 'tritanopia'];

export interface Collision {
  a: string;
  b: string;
  vision: Vision;
  delta: number;
}

/**
 * Pairs that violate the floors today, recorded so the suite can fail on new
 * collisions without demanding the whole palette be redesigned first.
 *
 * The test asserts this list matches reality exactly, so fixing a pair fails
 * until it is removed from here. Three entries are exact duplicates at distance
 * 0.000 - the section picker offers the literal kit type colors - and those are
 * the ones worth fixing first.
 *
 * Recorded 2026-08-01 against v0.9.6.
 */
export const KNOWN_COLLISIONS: readonly Collision[] = [
  // Cyan vs teal, the tightest normal-vision pair in the palette. It recurs in
  // three places: here, the family tiles, and Remote vs ATK in the kits table.
  { a: 'catalog.satcom', b: 'catalog.waveforms', vision: 'normal', delta: 0.073 },
  { a: 'family.oneweb', b: 'family.starshield', vision: 'normal', delta: 0.073 },
  { a: 'kitType.atk', b: 'kitType.remote', vision: 'normal', delta: 0.073 },
  { a: 'kitType.atk', b: 'sectionSwatch:#00d4aa', vision: 'normal', delta: 0.033 },
  { a: 'kitType.atk', b: 'sectionSwatch:#00d4aa', vision: 'tritanopia', delta: 0.039 },
  { a: 'kitType.atk', b: 'sectionSwatch:#22d3ee', vision: 'normal', delta: 0.069 },
  { a: 'kitType.atk', b: 'sectionSwatch:#2dd4bf', vision: 'deuteranopia', delta: 0.000 },
  { a: 'kitType.atk', b: 'sectionSwatch:#2dd4bf', vision: 'normal', delta: 0.000 },
  { a: 'kitType.atk', b: 'sectionSwatch:#2dd4bf', vision: 'protanopia', delta: 0.000 },
  { a: 'kitType.atk', b: 'sectionSwatch:#2dd4bf', vision: 'tritanopia', delta: 0.000 },
  { a: 'kitType.atk', b: 'sectionSwatch:#34d399', vision: 'deuteranopia', delta: 0.047 },
  { a: 'kitType.atk', b: 'sectionSwatch:#34d399', vision: 'normal', delta: 0.052 },
  { a: 'kitType.atk', b: 'sectionSwatch:#34d399', vision: 'protanopia', delta: 0.048 },
  { a: 'kitType.atk', b: 'sectionSwatch:#39d3f0', vision: 'normal', delta: 0.073 },
  { a: 'kitType.atk', b: 'sectionSwatch:#5eead4', vision: 'normal', delta: 0.071 },
  { a: 'kitType.atk', b: 'sectionSwatch:#60a5fa', vision: 'tritanopia', delta: 0.049 },
  { a: 'kitType.atk', b: 'sectionSwatch:#6ee7b7', vision: 'normal', delta: 0.072 },
  { a: 'kitType.atk', b: 'sectionSwatch:#6ee7b7', vision: 'tritanopia', delta: 0.046 },
  { a: 'kitType.ifk', b: 'sectionSwatch:#86efac', vision: 'protanopia', delta: 0.043 },
  { a: 'kitType.ifk', b: 'sectionSwatch:#c4b5fd', vision: 'deuteranopia', delta: 0.039 },
  { a: 'kitType.ifk', b: 'sectionSwatch:#c4b5fd', vision: 'protanopia', delta: 0.029 },
  { a: 'kitType.ifk', b: 'sectionSwatch:#d2a8ff', vision: 'deuteranopia', delta: 0.029 },
  { a: 'kitType.ifk', b: 'sectionSwatch:#d2a8ff', vision: 'protanopia', delta: 0.030 },
  { a: 'kitType.ifk', b: 'sectionSwatch:#e879f9', vision: 'deuteranopia', delta: 0.000 },
  { a: 'kitType.ifk', b: 'sectionSwatch:#e879f9', vision: 'normal', delta: 0.000 },
  { a: 'kitType.ifk', b: 'sectionSwatch:#e879f9', vision: 'protanopia', delta: 0.000 },
  { a: 'kitType.ifk', b: 'sectionSwatch:#e879f9', vision: 'tritanopia', delta: 0.000 },
  { a: 'kitType.ifk', b: 'sectionSwatch:#f472b6', vision: 'normal', delta: 0.099 },
  { a: 'kitType.ifk', b: 'sectionSwatch:#f9a8d4', vision: 'tritanopia', delta: 0.029 },
  { a: 'kitType.ifk', b: 'sectionSwatch:#ff96ca', vision: 'tritanopia', delta: 0.047 },
  { a: 'kitType.remote', b: 'sectionSwatch:#22d3ee', vision: 'deuteranopia', delta: 0.045 },
  { a: 'kitType.remote', b: 'sectionSwatch:#22d3ee', vision: 'normal', delta: 0.008 },
  { a: 'kitType.remote', b: 'sectionSwatch:#22d3ee', vision: 'protanopia', delta: 0.039 },
  { a: 'kitType.remote', b: 'sectionSwatch:#22d3ee', vision: 'tritanopia', delta: 0.009 },
  { a: 'kitType.remote', b: 'sectionSwatch:#2dd4bf', vision: 'normal', delta: 0.073 },
  { a: 'kitType.remote', b: 'sectionSwatch:#39d3f0', vision: 'deuteranopia', delta: 0.000 },
  { a: 'kitType.remote', b: 'sectionSwatch:#39d3f0', vision: 'normal', delta: 0.000 },
  { a: 'kitType.remote', b: 'sectionSwatch:#39d3f0', vision: 'protanopia', delta: 0.000 },
  { a: 'kitType.remote', b: 'sectionSwatch:#39d3f0', vision: 'tritanopia', delta: 0.000 },
  { a: 'kitType.remote', b: 'sectionSwatch:#5eead4', vision: 'normal', delta: 0.089 },
  { a: 'kitType.remote', b: 'sectionSwatch:#5eead4', vision: 'tritanopia', delta: 0.021 },
  { a: 'kitType.remote', b: 'sectionSwatch:#60a5fa', vision: 'deuteranopia', delta: 0.039 },
  { a: 'kitType.remote', b: 'sectionSwatch:#60a5fa', vision: 'protanopia', delta: 0.008 },
  { a: 'kitType.remote', b: 'sectionSwatch:#60a5fa', vision: 'tritanopia', delta: 0.039 },
  { a: 'kitType.remote', b: 'sectionSwatch:#79c0ff', vision: 'normal', delta: 0.072 },
  { a: 'kitType.remote', b: 'sectionSwatch:#79c0ff', vision: 'tritanopia', delta: 0.038 },
  { a: 'kitType.remote', b: 'sectionSwatch:#818cf8', vision: 'protanopia', delta: 0.035 },
  { a: 'sectionSwatch:#00d4aa', b: 'status.total', vision: 'deuteranopia', delta: 0.044 },
  { a: 'sectionSwatch:#00d4aa', b: 'status.total', vision: 'tritanopia', delta: 0.024 },
  { a: 'sectionSwatch:#34d399', b: 'status.available', vision: 'normal', delta: 0.097 },
  { a: 'sectionSwatch:#34d399', b: 'status.total', vision: 'tritanopia', delta: 0.017 },
  { a: 'sectionSwatch:#56d364', b: 'status.available', vision: 'normal', delta: 0.077 },
  { a: 'sectionSwatch:#5eead4', b: 'status.onMission', vision: 'deuteranopia', delta: 0.040 },
  { a: 'sectionSwatch:#5eead4', b: 'status.onMission', vision: 'protanopia', delta: 0.046 },
  { a: 'sectionSwatch:#6ee7b7', b: 'status.onMission', vision: 'deuteranopia', delta: 0.020 },
  { a: 'sectionSwatch:#79c0ff', b: 'status.onMission', vision: 'protanopia', delta: 0.046 },
  { a: 'sectionSwatch:#818cf8', b: 'status.onMission', vision: 'normal', delta: 0.076 },
  { a: 'sectionSwatch:#818cf8', b: 'status.onMission', vision: 'protanopia', delta: 0.026 },
  { a: 'sectionSwatch:#818cf8', b: 'status.onMission', vision: 'tritanopia', delta: 0.043 },
  { a: 'sectionSwatch:#86efac', b: 'status.onMission', vision: 'tritanopia', delta: 0.040 },
  { a: 'sectionSwatch:#a8ff3e', b: 'status.alert', vision: 'protanopia', delta: 0.015 },
  { a: 'sectionSwatch:#a8ff3e', b: 'status.reserved', vision: 'protanopia', delta: 0.041 },
  { a: 'status.alert', b: 'status.reserved', vision: 'deuteranopia', delta: 0.020 },
  { a: 'status.alert', b: 'status.reserved', vision: 'protanopia', delta: 0.036 },
  { a: 'status.alert', b: 'status.reserved', vision: 'tritanopia', delta: 0.042 },
  { a: 'status.inop', b: 'status.reserved', vision: 'deuteranopia', delta: 0.038 },
  { a: 'status.inop', b: 'status.reserved', vision: 'tritanopia', delta: 0.031 },
  { a: 'urgency.caution', b: 'urgency.expiring', vision: 'deuteranopia', delta: 0.038 },
  { a: 'urgency.caution', b: 'urgency.expiring', vision: 'tritanopia', delta: 0.031 },
  { a: 'urgency.caution', b: 'urgency.watch', vision: 'deuteranopia', delta: 0.020 },
  { a: 'urgency.caution', b: 'urgency.watch', vision: 'protanopia', delta: 0.036 },
  { a: 'urgency.caution', b: 'urgency.watch', vision: 'tritanopia', delta: 0.042 },
];

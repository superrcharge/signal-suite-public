/**
 * What a phase's picture is made of, worked out from the model and the layout
 * alone: which cards and lines are drawn in each Show mode, how a line is worded
 * and how a requirement reads under the picture.
 *
 * Here rather than in `phase-picture.tsx` so the screen's SVG and the deck's
 * native PowerPoint slides read ONE derivation: a gap that is a gap on screen
 * cannot be a direct line in the file. Pure: no React and no DOM.
 */

import type { Phase, Site } from '@/types';
import type { InteropColumn, InteropModel } from './interop-model';
import { assetChars, cardHeight, cardWidth, wrapAssets } from './phase-layout';
import type { LayoutLocation, LayoutRequirement, LayoutUnit, PhaseLayout, PlacedEdge } from './phase-layout';
import { PAIR_COLOR, PAIR_GLYPH } from './phase-plan-model';
import type { PairStatus, RequirementEntry } from './phase-plan-model';
import type { Show } from './phase-show';

export const CARD_HEAD = 36;
export const LINE_H = 14;
/** Lines of assets a card carries before it counts the rest. */
export const ASSET_LINES = 2;
/**
 * The phase's supported unit is called the tier select (maintainer,
 * 2026-10-12): the unit everyone else in the phase is there to support. One
 * spelling for the screen, the slides and the print, and the tag sized to it.
 */
export const TIER_SELECT = 'Tier select';
export const TAG_W = 100;

export const PILL_MAX_CHARS = 22;

// Advance per character at the sizes drawn: display 14px and mono 12px.
export const LABEL_CHAR = 9.2;
export const TITLE_CHAR = 8;

/** How faint a card is drawn in Gaps when its unit has no gap of its own: still there to read, out of the way. */
export const NO_GAP = 0.35;

export const NO_LOCATION = 'No location';
/** The key of the box holding units with no placement; a location's key is its id. */
export const LOOSE = 'none';

export type Kind = 'direct' | 'relay' | 'cannot';

/** A glyph for each status at the head of its pill and its key entry, so a status reads without decoding a colour or a dash. */
// One glyph per status, shared with the wizard's Phases step so the two never disagree.
export const GLYPH: Record<Kind, string> = PAIR_GLYPH;

/** Clip a label to `n` characters; the full text stays in a <title>. */
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);

/** What a card shows of its unit: its assets as the lines of text under the header. */
export interface CardInfo {
  column: InteropColumn;
  assets: string[];
  supported: boolean;
}

export interface Card extends CardInfo {
  /** The box it sits in, by key. */
  boxKey: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Short on purpose (maintainer, 2026-10-12): the longer wording wrapped the
// key onto a second row, and the lines' own labels say the rest.
export const KEY: { kind: Kind; text: string }[] = [
  { kind: 'direct', text: 'Direct' },
  { kind: 'relay', text: 'Relay - through the named unit' },
  { kind: 'cannot', text: 'No link' },
];

/** What goes on a line's pill: short, the full answer being in its <title> and in the list under the picture. */
function lineText(s: Exclude<PairStatus, { status: 'absent' }>, labelOf: (id: string) => string): string {
  switch (s.status) {
    case 'direct': return `${s.means[0] ?? ''}${s.means.length > 1 ? ` +${String(s.means.length - 1)}` : ''}`;
    case 'relay': return `via ${labelOf(s.via[0] ?? '')}${s.via.length > 1 ? ` +${String(s.via.length - 1)}` : ''}`;
    case 'cannot': return 'no link';
  }
}

function lineTitle(e: RequirementEntry, s: Exclude<PairStatus, { status: 'absent' }>, labelOf: (id: string) => string): string {
  switch (s.status) {
    case 'direct': return `${e.aLabel} and ${e.bLabel} share ${s.means.join(', ')}`;
    case 'relay': return `${e.aLabel} reaches ${e.bLabel} via ${s.via.map(labelOf).join(', ')}`;
    case 'cannot': return `${e.aLabel} and ${e.bLabel} have no link`;
  }
}

/**
 * What the layout is asked to place, from the model alone. Locations with a
 * unit placed there in this phase get a box, in position order; a last box
 * holds the present units with no placement, or whose placement names a
 * location that is gone, and exists only when there are any. A requirement
 * whose unit is not in the phase has no card to draw to and gets no line; the
 * list under the picture says so.
 */
export function layoutInput(model: InteropModel, phase: Phase, sites: Site[], entries: RequirementEntry[], labelOf: (id: string) => string) {
  const known = new Set(sites.map((s) => s.id));
  const at = new Map<string, string[]>();
  const loose: string[] = [];
  for (const c of model.columns) {
    const sid = phase.placements[c.participantId];
    if (sid !== undefined && known.has(sid)) at.set(sid, [...(at.get(sid) ?? []), c.participantId]);
    else loose.push(c.participantId);
  }
  const locations: LayoutLocation[] = [
    ...sites.filter((s) => at.has(s.id)).map((s) => ({ id: s.id, name: s.name, unitIds: at.get(s.id) ?? [] })),
    ...(loose.length > 0 ? [{ id: LOOSE, name: NO_LOCATION, unitIds: loose }] : []),
  ];
  const cards = new Map<string, CardInfo>();
  const units: LayoutUnit[] = model.columns.map((column) => {
    const assets = wrapAssets(column.sources.map((s) => s.label), assetChars(cardWidth(column.label, column.branch)), ASSET_LINES);
    const supported = phase.supported_participant_id === column.participantId;
    cards.set(column.participantId, { column, assets, supported });
    return { id: column.participantId, label: column.label, branch: column.branch, assetLines: assets.length, supported };
  });
  const requirements: LayoutRequirement[] = [];
  const shown = new Map<string, { entry: RequirementEntry; kind: 'direct' | 'relay' | 'cannot'; title: string }>();
  for (const entry of entries) {
    const s = entry.status;
    if (s.status === 'absent' || !cards.has(entry.a) || !cards.has(entry.b)) continue;
    requirements.push({ id: entry.id, a: entry.a, b: entry.b, status: s.status, text: `${GLYPH[s.status]} ${clip(lineText(s, labelOf), PILL_MAX_CHARS)}` });
    shown.set(entry.id, { entry, kind: s.status, title: lineTitle(entry, s, labelOf) });
  }
  const unused = sites.filter((s) => !at.has(s.id)).map((s) => s.name);
  // Where each unit is, by name, for the tag a card carries where no box says it.
  const places = new Map(locations.flatMap((l) => l.unitIds.map((id): [string, string] => [id, l.name])));
  return { locations, units, requirements, cards, shown, unused, places };
}

export type PictureInput = ReturnType<typeof layoutInput>;

/** A requirement's line as placed, with what the status and title of it are. */
export type Line = PlacedEdge & { entry: RequirementEntry; kind: Kind; title: string };

/** What a requirement says under the picture, and in which colour. */
export function requirementText(e: RequirementEntry, labelOf: (id: string) => string): { text: string; color: string } {
  const s = e.status;
  switch (s.status) {
    case 'direct': return { text: `direct: ${s.means.join(', ')}`, color: PAIR_COLOR.direct };
    case 'relay': return { text: `via ${s.via.map(labelOf).join(', ')}`, color: PAIR_COLOR.relay };
    case 'cannot': return { text: 'no link', color: PAIR_COLOR.cannot };
    case 'absent': return {
      text: `not in this phase: ${s.missing.map((id) => (id === e.a ? e.aLabel : e.bLabel)).join(', ')}`,
      color: 'var(--fg-3)',
    };
  }
}

/** The wording of the Gaps count above the picture. */
function gapsWording(gaps: number, relays: number): string {
  const nones = gaps - relays;
  return gaps === 0
    ? 'No gaps - every requirement in this phase is direct'
    : `${String(gaps)} ${gaps === 1 ? 'gap' : 'gaps'} in this phase: ${[relays > 0 ? `${String(relays)} relay` : '', nones > 0 ? `${String(nones)} no link` : ''].filter(Boolean).join(', ')}`;
}

/**
 * What is drawn of a laid-out phase in `show`: the cards, the lines with their
 * pills numbered over the lines actually drawn, which units have a gap, and
 * what is listed under the picture.
 *
 * Gaps keeps every position and draws only the lines that are not direct;
 * badges are numbered again over those, so Gaps never shows a lone "3". A
 * drawing that outlives its inputs for a moment names things that are gone,
 * and those are left out.
 */
export function pictureOf({ input, placed, show, focusId, entries }: {
  input: PictureInput;
  placed: PhaseLayout | null;
  show: Show;
  focusId: string | null;
  entries: RequirementEntry[];
}) {
  const cards: Card[] = (placed?.cards ?? []).flatMap((c) => {
    const info = input.cards.get(c.id);
    return info ? [{ ...info, boxKey: c.boxId, x: c.x, y: c.y, w: c.w, h: Math.max(c.h, cardHeight(0)) }] : [];
  });
  const placedLines: Line[] = (placed?.edges ?? []).flatMap((e) => {
    const shown = input.shown.get(e.id);
    return shown ? [{ ...e, ...shown }] : [];
  });
  const gaps = [...input.shown.values()].filter((s) => s.kind !== 'direct');
  const gapUnits = new Set(gaps.flatMap((s) => [s.entry.a, s.entry.b]));
  let badgeNo = 0;
  const lines: Line[] = (show === 'gaps' ? placedLines.filter((l) => l.kind !== 'direct') : placedLines)
    .map((l) => (l.badge === null ? l : { ...l, badge: (badgeNo += 1) }));

  // What is listed under the picture is what the picture shows.
  const listed = show === 'gaps' ? entries.filter((e) => e.status.status === 'relay' || e.status.status === 'cannot')
    : show === 'focus' ? entries.filter((e) => e.a === focusId || e.b === focusId)
      : entries;
  const relays = gaps.filter((s) => s.kind === 'relay').length;
  return { cards, lines, gaps, gapUnits, listed, gapsText: gapsWording(gaps.length, relays) };
}

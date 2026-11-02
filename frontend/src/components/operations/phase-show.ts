import type { InteropModel } from './interop-model';
import type { RequirementEntry } from './phase-plan-model';

/**
 * What is drawn of the phase: every requirement, only the gaps (relay and none)
 * in the places All puts them, or one unit and the units it must talk to, round
 * it. The Web view opens on All every time (since 2026-10-14; it used to
 * reopen on the viewer's last choice) and writes each choice here so the
 * print and deck exports draw what the screen shows; which unit Focus is on
 * is in the URL as `?focus=<participant id>`.
 *
 * Here rather than in `phase-picture.tsx` so the deck export reads the same
 * choice and the same unit the screen does, from a file that exports no
 * component.
 */
export type Show = 'all' | 'gaps' | 'focus';
const SHOW_KEY = 'signal-suite-operation-show';

export function readShow(): Show {
  try {
    const v = localStorage.getItem(SHOW_KEY);
    return v === 'gaps' || v === 'focus' ? v : 'all';
  } catch {
    return 'all';
  }
}

export function writeShow(mode: Show) {
  try {
    localStorage.setItem(SHOW_KEY, mode);
  } catch {
    // Storage is a convenience: without it the choice lasts until the page is left.
  }
}

/** What `focusUnit` needs of a phase's drawing input: who is there, who is supported, and which pairs are drawn. */
export interface FocusInput {
  units: { id: string; supported: boolean }[];
  requirements: { a: string; b: string }[];
  cards: { has: (id: string) => boolean };
}

/**
 * The unit Focus is on: the one asked for when the phase has it, else the
 * supported one, else the one with most requirements. Null only when the phase
 * has no units.
 */
export function focusUnit(input: FocusInput, asked: string | null): string | null {
  if (input.units.length === 0) return null;
  if (asked !== null && input.cards.has(asked)) return asked;
  const busy = new Map<string, number>();
  for (const r of input.requirements) for (const id of [r.a, r.b]) busy.set(id, (busy.get(id) ?? 0) + 1);
  const count = (id: string) => busy.get(id) ?? 0;
  const most = input.units.reduce((best, u) => (count(u.id) > count(best.id) ? u : best));
  return input.units.find((u) => u.supported)?.id ?? most.id;
}

/**
 * The unit Focus is on in one phase, from what the page holds rather than
 * from a drawing. A requirement is drawn, so counts, when both its units are
 * in the phase, which is what `absent` says they are not.
 */
export function focusOf(
  model: InteropModel,
  supportedId: string | null,
  entries: RequirementEntry[],
  asked: string | null,
): string | null {
  const present = new Set(model.columns.map((c) => c.participantId));
  return focusUnit({
    units: model.columns.map((c) => ({ id: c.participantId, supported: c.participantId === supportedId })),
    requirements: entries.filter((e) => e.status.status !== 'absent'),
    cards: present,
  }, asked);
}

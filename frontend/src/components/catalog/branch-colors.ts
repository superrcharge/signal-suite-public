import type { CSSProperties } from 'react';
import { BRANCH_NAMES, type Branch } from '@/types';
import { chipToggleSty } from './chip-styles';

/**
 * One colour per branch, so a reader can tell a Navy platform from a Marine
 * one without reading the chip: three distinct blues for the Navy, the Air
 * Force and the Coast Guard, darkest to brightest; red for the Marine Corps;
 * gold for the Army, because green would read as a status; slate for the
 * Space Force; black for OGA.
 *
 * The chip is filled with white text rather than outlined, so one style reads
 * on both surfaces it sits on - the matrix's paper and the Platform Library's
 * dark rows - where an outline in navy or black vanished on the dark one.
 */
const FILL: Record<Branch, string> = {
  USA: '#B8860B',
  USMC: '#B71C1C',
  USN: '#0B1F4B',
  USAF: '#1F5FBF',
  USSF: '#4A5563',
  USCG: '#2E8BD8',
  OGA: '#111111',
};

// Gold is the one fill white text does not read on, so the Army chip carries
// black text instead.
const INK: Partial<Record<Branch, string>> = { USA: '#111111' };

function isBranch(v: string): v is Branch {
  return v in FILL;
}

/** A branch's colour: the chip fill, so a check always matches its column's chip. */
export function branchColor(v: string): string {
  return isBranch(v) ? FILL[v] : 'var(--fg-3)';
}

/** The branch spelled out, for a tooltip; the value itself for anything else. */
export function branchName(v: string): string {
  return isBranch(v) ? BRANCH_NAMES[v] : v;
}

/**
 * The off-state outline and lettering where the fill itself is too dark to
 * read on the dark wizard paper (navy, black, slate); everyone else uses the
 * fill. Lightened, never re-hued, so USN off still reads as USN's blue.
 */
const OFF_INK: Partial<Record<Branch, string>> = { USN: '#8FAEE8', USAF: '#6FA3EE', OGA: '#F2F2F2', USSF: '#AAB3BF' };

/**
 * A branch filter toggle on the dark Join wizard (maintainer, 10-24): off, it
 * is hollow, outlined and lettered in the branch colour; on, it fills like the
 * badge on the platform cards it filters, so the eye joins filter and badge.
 * The caller draws a check on the right whose space is always reserved, so
 * pressing fills the tile without changing its size.
 */
export function branchFilterSty(v: string, pressed: boolean): CSSProperties {
  const fill = isBranch(v) ? FILL[v] : 'var(--shf-graphite-600)';
  const offInk = (isBranch(v) && OFF_INK[v]) || fill;
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    borderRadius: 2, cursor: 'pointer',
    background: pressed ? fill : 'transparent',
    color: pressed ? (isBranch(v) && INK[v]) || '#FFFFFF' : offInk,
    border: `1px solid ${pressed ? fill : offInk}`,
    boxShadow: pressed ? 'inset 0 0 0 1px rgba(255,255,255,0.18)' : undefined,
  };
}

/**
 * The chip a branch is drawn as, on the matrix and in the Platform Library.
 * `size` is the text size: 9 on the matrix, where a column head is 76px wide,
 * and larger in the library, whose rows have the room and where 9 read small.
 */
export function branchChip(v: string, size = 9): CSSProperties {
  const fill = isBranch(v) ? FILL[v] : 'var(--shf-graphite-600)';
  return {
    display: 'inline-block', padding: '1px 5px',
    fontFamily: 'var(--font-mono)', fontSize: size, fontWeight: 700, letterSpacing: '0.08em',
    lineHeight: 1.4, textTransform: 'uppercase', whiteSpace: 'nowrap',
    background: fill, color: (isBranch(v) && INK[v]) || '#FFFFFF',
    // Keeps a black or navy chip's edge visible on the dark rows.
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
    borderRadius: 2,
  };
}

/**
 * A branch toggle in the Platform Library form. Pressing changes colour and
 * nothing else: the geometry is chipToggleSty's in both states, because a
 * pressed chip that took the display chip's tighter padding, missing border
 * and bold weight came out about 10px narrower and shifted every toggle after
 * it.
 *
 * OGA's black fill reads as unpressed on the dark form, where the toggles are
 * dark until pressed, so a pressed OGA inverts to a light fill with black text.
 */
export function branchToggleSty(v: string, pressed: boolean): CSSProperties {
  const base = chipToggleSty(pressed, true);
  if (!pressed) return base;
  const fill = v === 'OGA' ? '#F2F2F2' : isBranch(v) ? FILL[v] : 'var(--shf-graphite-600)';
  const ink = v === 'OGA' ? '#111111' : (isBranch(v) && INK[v]) || '#FFFFFF';
  return { ...base, background: fill, color: ink, border: `1px solid ${fill}` };
}

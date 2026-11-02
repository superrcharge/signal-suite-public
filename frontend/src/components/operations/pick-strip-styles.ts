import type { CSSProperties } from 'react';

import { labelSty } from '@/components/shf-form/styles';

import { chipToggleSty } from '@/components/catalog/chip-styles';
import { transportKindLabel } from '@/types';
import type { Equipment, Transport } from '@/types';

/**
 * Wizard text on the dark paper is white, not grey (maintainer, 10-24: the
 * captions were "super faint, super hard to read"). Labels and captions are
 * white and bold; explanatory sentences are near-white. The shared form
 * `labelSty` elsewhere in the app is left as it is.
 */
export const WIZARD_INK = 'var(--shf-paper)';
export const WIZARD_SOFT_INK = 'rgba(244, 242, 236, 0.82)';
export const brightLabelSty: CSSProperties = { ...labelSty, color: WIZARD_INK, fontWeight: 700 };
export const noteSty: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 11.5, fontStyle: 'italic', color: WIZARD_SOFT_INK };
export const stripSty: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 };
/** The "Bringing (n)" label: step 3's tray and step 4's reminder of the same picks, one style so they read as the same thing. */
export const trayLabelSty: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: WIZARD_INK, fontWeight: 700, whiteSpace: 'nowrap',
};
export const missingChipSty: CSSProperties = { ...chipToggleSty(true), textDecoration: 'line-through' };

export function equipmentLabel(e: Equipment): string {
  return e.nomenclature || e.nickname || e.id;
}

export const norm = (s: string) => s.trim().toLowerCase();

/** A transport's chip text: the name, then the kind in parentheses when it has one. */
export function transportLabel(t: Transport): string {
  const kind = transportKindLabel(t.kind);
  return kind ? `${t.name} (${kind})` : t.name;
}

/**
 * The wizard's filter chips (step 2's Branch and Type, step 3's Equipment
 * type and Filters): one shape everywhere (maintainer, 10-24). Text sized to
 * the row label beside it, padding trimmed so the tile stays 24px tall, one
 * minimum width so rows line up column for column, the label left and a check
 * right (`FilterCheck`) whose space is always reserved, so a press never moves
 * anything. A branch chip takes `branchFilterSty` for its colours instead.
 */
export const FILTER_CHIP_TEXT: CSSProperties = {
  fontSize: 13, lineHeight: '16px', padding: '3px 8px 3px 10px',
  minWidth: 112, justifyContent: 'space-between', boxSizing: 'border-box',
};

/** A filter chip with no colour of its own: hollow when off, amber when on. */
export const filterChipSty = (on: boolean): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  borderRadius: 2, cursor: 'pointer',
  background: on ? 'var(--shf-amber)' : 'transparent',
  color: on ? 'var(--shf-black)' : 'var(--shf-paper)',
  border: `1px solid ${on ? 'var(--shf-amber)' : 'var(--shf-graphite-400)'}`,
});

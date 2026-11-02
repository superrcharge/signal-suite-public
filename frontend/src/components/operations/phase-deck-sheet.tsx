import type { CSSProperties } from 'react';

import { sheetRootProps } from '@/components/common/sheet-export/sheet-root';
import type { Site } from '@/types';
import { DECK_SHEET_H, DECK_SHEET_W } from './phase-deck-plan';
import type { DeckPlan, DeckSlidePlan } from './phase-deck-plan';
import { PhasePicture } from './phase-picture';
import { titleSty } from './sheet-parts';

/** The paper left and right of the sheet's content, so a caller that fits the sheet to a picture knows what to add. */
export const SHEET_PAD_X = 32;

/** The slide for a phase the focused unit is not in: said, rather than left out of the deck. */
const absentSty: CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
  fontSize: 22, color: 'var(--fg-3)', padding: '48px 0',
};

/**
 * What the exporter captures for one slide, and what the print route puts on
 * one printed page: the title over the picture and its list. `width` and
 * `minHeight` default to the deck's 16:9 sheet; the print route gives the
 * paper's own size, so the picture lays out at the width it is printed at.
 */
export function PhaseSheet({ slide, sites, plan, width = DECK_SHEET_W, minHeight = DECK_SHEET_H }: {
  slide: DeckSlidePlan;
  sites: Site[];
  plan: DeckPlan;
  width?: number;
  minHeight?: number;
}) {
  return (
    <div
      {...sheetRootProps()}
      style={{ width, minHeight, boxSizing: 'border-box', padding: `28px ${String(SHEET_PAD_X)}px`, background: 'var(--shf-paper)' }}
    >
      <div style={titleSty}>{slide.title}</div>
      {slide.missing !== null ? (
        <div data-testid="deck-unit-absent" style={absentSty}>{`${slide.missing} is not in this phase`}</div>
      ) : (
        <PhasePicture
          model={slide.model} phase={slide.phase} sites={sites} entries={slide.entries}
          fixed={{ show: plan.show, focusId: plan.focusId }}
        />
      )}
    </div>
  );
}

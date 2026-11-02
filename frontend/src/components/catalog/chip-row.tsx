import { useId } from 'react';

/**
 * A labelled gutter and a wrapped row of chips.
 *
 * Shared by both panels rather than written twice, because they are open at
 * the same time and stacked: the equipment panel used a heading above its
 * chips while the parameter panel put its band in a gutter beside them, so
 * with both open the two sets of chips started at different x down one
 * column. Pass an empty gutter to keep the indent without a label.
 *
 * `gutterWidth` defaults to the width the Compare panels share. A surface
 * whose longest gutter word is longer passes its own, the same for every row
 * it draws, so its rows still indent identically to each other.
 */
export function ChipRow({
  gutter,
  gutterWidth = GUTTER_W,
  gutterColor,
  colon = false,
  children,
}: {
  gutter: string;
  gutterWidth?: number;
  /** The label's colour where the default grey is too faint for its surface, as in the Join wizard. */
  gutterColor?: string;
  /** Draw a colon after the label; it is hidden from the group's accessible name. */
  colon?: boolean;
  children: React.ReactNode;
}) {
  // The gutter word is the row's name, so a screen reader announces "SATCOM,
  // group" before the chips rather than a run of unlabelled buttons. An
  // empty gutter (a continuation row) names nothing, so it claims no group.
  const labelId = useId();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
      <span id={labelId} style={{ ...gutterSty, width: gutterWidth, ...(gutterColor ? { color: gutterColor } : {}) }}>{gutter}{colon && gutter ? <span aria-hidden="true">:</span> : null}</span>
      <div
        role={gutter ? 'group' : undefined}
        aria-labelledby={gutter ? labelId : undefined}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
      >
        {children}
      </div>
    </div>
  );
}

/** Outer height of one chip: 10.5px text on a 1.35 line box, 3px of padding
 *  each side, 1px of border each side. The gutter matches it. */
const CHIP_H = Math.round(10.5 * 1.35) + 3 * 2 + 2;

// Wide enough for the longest gutter word in either Compare panel ("SATCOM"),
// so both panels indent identically when open together.
const GUTTER_W = 76;

const gutterSty: React.CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  height: CHIP_H,
  fontFamily: 'var(--font-mono)',
  // Sized off the chip's height rather than its text, so the label reads as
  // the same weight of object as the row it labels instead of as a caption
  // floating beside it.
  fontSize: CHIP_H - 8,
  lineHeight: 1,
  fontWeight: 700,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  // Not amber. Amber is what a selected chip is, everywhere on this surface,
  // so an amber label beside unselected chips reads as a selection state.
  color: 'var(--shf-graphite-300)',
};

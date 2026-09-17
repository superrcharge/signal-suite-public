import type { CSSProperties } from 'react';
// Oswald's @font-face lives in the token sheet. page-banner.tsx already pulls
// it into the entry CSS through the common barrel, so this import adds no
// bytes; it is here so the mark's one font dependency is stated where the
// font is used rather than trusted to a neighbour.
import '@/styles/catalog-tokens.css';

/**
 * The Signal Suite lockup: the wordmark, and nothing after it.
 *
 * Wordmark only, by decision. A round badge, a bordered placard, an amber
 * tile, a satellite-lock reticle, a "TACTICAL COMMS CATALOG" subline, an
 * amber stencil bar at the start of the word, and four ascending signal bars
 * after it were each drawn and rejected; do not resurrect them. The bars were
 * the last to go: they shipped in an earlier release and were dropped after being seen in
 * the header, where they read as a device status glyph rather than a brand.
 *
 * Geometry is in a 304 x 72 box with the text baseline at y = 58. `SIGNAL` is
 * Oswald 500 in the surface's text colour, ` SUITE` Oswald 700 in amber. The
 * header draws it at 114 x 27, which is the same 72-unit-to-27px scale the
 * bars-era 393 x 72 box drew at 147 x 27, so the letters did not change size
 * when the bars left; only the box got shorter.
 *
 * The box is the ink. Measured in the browser with Oswald loaded, the word's
 * ink ends at x = 303.2, so the box ends at 304. Trimming the box is what
 * keeps the word hard right in the header: the header aligns the box, not the
 * ink, and a box that still ran to 393 would have parked 33px of blank canvas
 * where the bars used to be.
 *
 * `color` recolours the `SIGNAL` half only, so the mark can sit on a light
 * print surface (#0A0A0A) without the amber half changing.
 */

export const SIGNAL_SUITE_VIEWBOX = '0 0 304 72';

/**
 * The amber of the `SUITE` half. The token, not a hex: it is published from
 * `theme.palette.primary.main`, so a palette change moves the wordmark with
 * every other amber. Inline SVG resolves `var()` in `fill`.
 */
export const SIGNAL_SUITE_AMBER = 'var(--shf-amber)';

const BASELINE = 58;

interface SignalSuiteMarkProps {
  width?: number;
  height?: number;
  /** Fill of the `SIGNAL` half. Default suits dark chrome. */
  color?: string;
  style?: CSSProperties;
}

export function SignalSuiteMark({ width = 114, height = 27, color = '#E6EDF3', style }: SignalSuiteMarkProps) {
  return (
    <svg
      role="img"
      aria-label="Signal Suite"
      width={width}
      height={height}
      viewBox={SIGNAL_SUITE_VIEWBOX}
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      <text
        x={0}
        y={BASELINE}
        fill={color}
        fontFamily="Oswald, sans-serif"
        fontSize={52}
        fontWeight={500}
        letterSpacing={2}
      >
        SIGNAL
        <tspan fill={SIGNAL_SUITE_AMBER} fontWeight={700}>{' SUITE'}</tspan>
      </text>
    </svg>
  );
}

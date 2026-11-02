import type { CSSProperties } from 'react';

import type { InteropSection } from './interop-model';

/**
 * What the operation's sheets share and a component file cannot export, since a
 * file that exports a component may export nothing else but constants of one
 * value: the section captions of the Matrix grid, on screen and on a slide, and
 * the title style over a phase sheet and a matrix sheet.
 */
export const SECTION_CAPTION: Record<InteropSection, string> = {
  waveform: 'Waveforms',
  service: 'SATCOM services',
  transport: 'Transports',
};

export const titleSty: CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
  fontSize: 28, color: 'var(--fg-1)', margin: '0 0 16px',
};

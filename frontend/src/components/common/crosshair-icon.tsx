import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';

/**
 * A rifle-sight reticle: a ring, a cross through it and a centre dot.
 * Drawn here rather than taken from `@mui/icons-material`, whose GpsFixed
 * and star glyphs were both rejected for the Operations entry.
 */
export function CrosshairIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </SvgIcon>
  );
}

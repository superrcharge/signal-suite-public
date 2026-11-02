import { alpha, type Theme } from '@mui/material/styles';

/**
 * The folder tab strip, in one place. Three strips draw it - the Nets page's
 * JEM/MPU5 tabs, the Settings page's tabs and the operation Loadout's unit
 * tabs - and each used to carry its own copy of this sx, which is how they
 * would have drifted.
 *
 * Every tab is outlined (top, left and right; no bottom) so it reads as a
 * control rather than as stray text, and the strip sits on a 1px line in the
 * same grey. Hover warms the outline and the fill toward amber; the open tab
 * has a solid amber outline, amber text and the panel's background, so it
 * reads as the front of the folder whose body is the panel below. Inactive
 * text is a step brighter than `text.secondary`, which read as disabled.
 *
 * The line breaks under the open tab, which is what joins it to its panel.
 * So the line is an inset shadow rather than a border: a shadow paints under
 * the strip's children, the open tab's opaque fill covers it, and the gaps and
 * the transparent inactive tabs let it show. The strip overlaps what follows
 * by 1px and stacks above it, so where the panel has a top border of its own
 * (Settings) the open tab covers that too and there is one line, not two;
 * where it has none (Nets, the Loadout) the shadow is the line. An amber bar
 * under the open tab was the alternative and was rejected: it closes the tab
 * into a box, which reads as a button rather than the front of a folder.
 *
 * Every colour is read from the palette rather than written out:
 * - outline and line: `text.secondary` (#8b949e) at 45%
 * - inactive text: `text.primary` at 85%, about rgb(201,209,217) on the page
 * - hover: `primary.main` (the amber) at 60% for the outline, 6% for the fill
 * - open tab: `primary.main` solid, which is what `var(--shf-amber)` publishes
 *
 * `panelBg` is the open tab's fill, so it matches the panel it sits on: the
 * paper background on Nets and Settings, graphite-800 on the Loadout.
 * `tabPx` keeps each strip's horizontal padding as it was.
 */
export function folderTabsSx({ panelBg, tabPx = 3 }: { panelBg: string; tabPx?: number }) {
  const line = (t: Theme) => alpha(t.palette.text.secondary, 0.45);
  return {
    minHeight: 44,
    boxShadow: (t: Theme) => `inset 0 -1px 0 ${line(t)}`,
    mb: '-1px',
    position: 'relative',
    zIndex: 1,
    '& .MuiTabs-indicator': { display: 'none' },
    '& .MuiTabs-flexContainer': { alignItems: 'flex-end', gap: '6px' },
    '& .MuiTab-root': {
      minHeight: 40,
      px: tabPx,
      fontSize: '0.9rem',
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: (t: Theme) => alpha(t.palette.text.primary, 0.85),
      position: 'relative',
      overflow: 'visible',
      borderRadius: '12px 12px 0 0',
      border: 1,
      borderBottom: 0,
      borderColor: line,
      transition: 'border-color .12s, background-color .12s',
    },
    '& .MuiTab-root:not(.Mui-selected):hover': {
      borderColor: (t: Theme) => alpha(t.palette.primary.main, 0.6),
      bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.06),
    },
    '& .MuiTab-root.Mui-selected': {
      color: 'primary.main',
      borderColor: 'primary.main',
      bgcolor: panelBg,
      minHeight: 44,
    },
    // Only the Loadout strip scrolls; this is its arrows' colour, unchanged.
    '& .MuiTabs-scrollButtons': { color: 'var(--shf-graphite-300)', '&.Mui-disabled': { opacity: 0.3 } },
  } as const;
}

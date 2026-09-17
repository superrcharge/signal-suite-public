import { ElementType, ReactNode } from 'react';
import { Box, SxProps, Theme, Typography } from '@mui/material';
import { visuallyHidden } from '@mui/utils';

import { CONTENT_GUTTER } from '@/components/layouts/main-layout';
import { RAIL_BANNER_PX, RAIL_BANNER_PY } from './banner-controls';
// The rail variant is built from --shf-amber and --shf-graphite-900, so the
// component imports the sheet that defines them rather than trusting the page
// to have done it. Without this a page that never imported the tokens rendered
// a banner with no underline and no background: correctly positioned, and
// invisible. Every other consumer of these variables imports it the same way.
import '@/styles/catalog-tokens.css';

/**
 * The bar across the top of a page, meeting the sidebar and the header.
 *
 * MainLayout wraps every page in a `CONTENT_GUTTER` padding box, which is right
 * for page content and wrong for a full-width bar: without help, a banner
 * floats inset from the sidebar on the left and from the header above. The fix
 * is a negative margin that cancels the gutter, and the reason this is a
 * component rather than an sx snippet is that the snippet had already been
 * copy-pasted verbatim into three pages while four others went without, which
 * is how they drifted apart in the first place.
 *
 * The bleed is derived from CONTENT_GUTTER rather than restating it, so
 * changing the layout's padding cannot silently break seven pages.
 */
interface PageBannerProps {
  children: ReactNode;
  /**
   * `rail` is the amber-underlined bar used by the sheet, card and editor
   * pages. `plain` is the page-coloured strip the list toolbars sit in.
   */
  variant?: 'rail' | 'plain';
  /** Pin under the header while the page scrolls. */
  sticky?: boolean;
  /** Per-page extras: the margin below, `flexShrink`, and so on. */
  sx?: SxProps<Theme>;
}

export function PageBanner({
  children,
  variant = 'rail',
  sticky = false,
  sx,
}: PageBannerProps) {
  return (
    <Box
      // Cast because TypeScript infers the array's element type from its first
      // entry and then rejects the `false` a disabled conditional produces,
      // even though MUI's sx array form accepts exactly that.
      sx={[
        {
          // The whole point. Reaches past the content box to the sidebar and
          // both edges, and up to the header.
          mx: -CONTENT_GUTTER,
          mt: -CONTENT_GUTTER,
        },
        variant === 'rail' && {
          // Flex belongs to this variant only. The plain strip stacks a stat
          // row above a toolbar and must stay a block container, or its two
          // children end up side by side.
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          // The bar's own padding is what insets its content, so unlike the
          // plain variant it does not pad back in by the full gutter.
          px: RAIL_BANNER_PX,
          py: RAIL_BANNER_PY,
          borderBottom: '2px solid var(--shf-amber)',
          background: 'var(--shf-graphite-900)',
        },
        variant === 'plain' && {
          // Pads back in by the gutter so its content stays on the same line as
          // the page content below it, while the background spans the full width.
          px: CONTENT_GUTTER,
          pt: CONTENT_GUTTER,
          pb: 1.5,
          bgcolor: 'background.default',
        },
        sticky && {
          position: 'sticky',
          top: 0,
          zIndex: 10,
        },
        // Last so a caller's sx wins over the variant defaults.
        sx,
      ] as SxProps<Theme>}
    >
      {children}
    </Box>
  );
}

/**
 * The title in a page banner.
 *
 * One definition, for the same reason the banner is one component: ten pages
 * each restated the title style inline and had drifted to three sizes and two
 * colours - 14px and 15px in amber with wide tracking, and Compare's 18px in
 * paper white.
 *
 * Compare's size and tracking, in amber. The size is the one that read as a
 * page title rather than a label; amber is what every other banner already
 * used. An `h1`, as Compare's already was, so every page has a heading a
 * screen reader can jump to.
 *
 * `noWrap` is for titles built from data - a squadron, a record name - that can
 * outrun the bar. It is MUI's own truncation, so callers need no overflow rules.
 *
 * `visuallyHidden` keeps the heading and draws nothing. The list pages - Terminals,
 * Kits, Contracts - use it: the header's page picker is already showing the route's
 * name two inches above, so a second copy is the same word twice and costs a line
 * on the pages with the most to fit. The heading itself still has to exist, because
 * it is the only `h1` a screen reader can jump to, and because "every page has a
 * title" stays a rule `check-ui-tokens.mjs` can enforce rather than one carrying
 * three carve-outs whose stated reason would justify deleting every title in the app.
 */
export function PageTitle({ children, noWrap = false, visuallyHidden: hidden = false, sx, component = 'h1' }: {
  children: ReactNode;
  noWrap?: boolean;
  /** Keep the heading in the accessibility tree and render nothing. */
  visuallyHidden?: boolean;
  /** Per-page extras such as `minWidth: 0`. */
  sx?: SxProps<Theme>;
  /**
   * `h1` unless the page already has one. The sheet page's heading is the
   * record it shows, so its rail title renders as a `div`.
   */
  component?: ElementType;
}) {
  return (
    <Typography
      component={component}
      noWrap={noWrap}
      sx={[
        {
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--shf-amber)',
        },
        // MUI's own helper rather than a hand-rolled clip rule: `display: none`
        // and `visibility: hidden` both take the heading out of the
        // accessibility tree too, which would defeat the point.
        hidden && visuallyHidden,
        // Last so a caller's sx wins, the same order PageBanner uses.
        sx,
      ] as SxProps<Theme>}
    >
      {children}
    </Typography>
  );
}

/**
 * The sentence that follows a page title on the same line.
 *
 * Every page that has one wrote the same span inline: 15px, weight 400,
 * `--shf-graphite-300`, `0.08em`, and - the part that is easy to forget -
 * `textTransform: 'none'`, because without it the description inherits the
 * title's uppercase and shouts. Four pages carried the same three-line comment
 * explaining that, which is the sign it should have been a component.
 *
 * 15px rather than the title's 18 is deliberate: at 18 these sentences wrapped
 * to a second line at 1280px, the smallest screen this app is used on.
 *
 * Renders inside a `PageTitle`, so it is a `span` on the heading's baseline
 * rather than a block beneath it.
 */
export function PageSubtitle({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        color: 'var(--shf-graphite-300)',
        fontSize: 15,
        fontWeight: 400,
        letterSpacing: '0.08em',
        textTransform: 'none',
      }}
    >
      {' - '}{children}
    </Box>
  );
}

/**
 * The title block over a page's left rail, with the rule on the rail's edge.
 *
 * The three catalog surfaces - browse, sheet, editor - each have a rail down
 * the left (facets, the equipment list, the equipment list) and a bar across
 * the top. This puts the page's name over the rail and draws the bar's
 * vertical rule exactly where the rail's own right border runs beneath it, so
 * the two read as one line. The editor had this by accident, with the rule
 * falling wherever its title happened to end; the browse page opened with the
 * Filters chip and the sheet page with a back button and no title at all.
 *
 * `width` is the rail's width. The block cancels the bar's own padding
 * (`RAIL_BANNER_PX` / `RAIL_BANNER_PY`, the same constants `PageBanner` pads
 * with) so its left edge is the content edge and its rule spans the bar's
 * full height, then pads the title back in by `pl`. `divider` is for a rail
 * that can be closed - the browse page unmounts its facet rail when Filters
 * is off, and a rule at the rail width would then line up with nothing. `pl`
 * is where the title starts, so it can line up with the rail's own first
 * column: 28px (the content line) over the browse and editor rails, 13px
 * over the sheet's list, whose badges start there. `component` is `div` on a
 * page whose `h1` is elsewhere - the sheet's is the record name in HeroBlock.
 */
export function RailTitle({ width, pl = RAIL_BANNER_PX, divider = true, component = 'h1', children }: {
  width: number;
  pl?: number;
  divider?: boolean;
  component?: ElementType;
  children: ReactNode;
}) {
  return (
    <Box
      data-rail-title
      sx={{
        width,
        flexShrink: 0,
        boxSizing: 'border-box',
        ml: -RAIL_BANNER_PX,
        pl,
        pr: 1,
        my: -RAIL_BANNER_PY,
        alignSelf: 'stretch',
        display: 'flex',
        alignItems: 'center',
        borderRight: divider ? '1px solid var(--shf-graphite-700)' : 'none',
      }}
    >
      <PageTitle noWrap component={component}>{children}</PageTitle>
    </Box>
  );
}

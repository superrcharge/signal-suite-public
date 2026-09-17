import type { SxProps, Theme } from '@mui/material';

/**
 * The height of every outlined control in the app header, in px, per breakpoint.
 *
 * The bar mixes two kinds of control: borderless ones (the sidebar toggle, the
 * page picker, the API icon, the avatar) whose 36-42px box is invisible, and
 * outlined ones whose box is drawn. Only the drawn ones are compared by eye, so
 * they are the ones that have to agree - and they did not: the share trigger
 * and the `+` were 28px while the help control was 30.8px.
 *
 * The three no longer sit in a row. Share and the `?` are together in the left
 * cluster and the `+` is on the right, so they are compared across the bar
 * rather than side by side - which makes one definition matter more, not less.
 *
 * 24 rather than the 28 they defaulted to, because an outlined box reads as
 * larger than a borderless neighbour of the same height. Against the picker's
 * 16px of visible glyph and the toggle's 18px, a 28px rectangle looked like the
 * tallest thing in the bar while measuring as the shortest. 24 puts the drawn
 * edge close to the ink beside it.
 *
 * **From md up it is 28**, and that is not a return to the old default. The
 * whole bar steps up about 1.17x there - the borderless neighbours in
 * header.tsx too - because on a desktop the 65px bar has room and the share
 * glyph at 15px read as too small. Scaling every control together is what keeps
 * the paragraph above true: the drawn edge still sits close to the ink beside
 * it, it is all just larger. Below md nothing moves, because the bar already
 * overflows a 375px phone and larger controls would push it further.
 *
 * Height is pinned rather than left to the content because a text-less MUI
 * Button sizes itself to its icon, so any optical tweak to a glyph silently
 * resizes its button and breaks the set. See SHARE_ICON_FONT_SIZE.
 */
export const HEADER_CONTROL_H = { xs: 24, md: 28 };

/**
 * The md breakpoint as a media query key, for the two sx objects below.
 *
 * They cannot pass `{ xs, md }` the way header.tsx does. MUI emits even the xs
 * value inside `@media (min-width:0px)`, so the control has no plain `height`
 * declaration at all - harmless in a browser, but jsdom applies no media rule,
 * reads `auto`, and the height test in header.test.tsx could no longer see the
 * value it exists to pin. So the base is declared plainly and only the md step
 * sits in a query.
 *
 * 900px is MUI's default md, which theme.ts does not override, so this and the
 * `{ xs, md }` values in header.tsx resolve to the same width. header.test.tsx
 * asserts that against the app theme, so customising the breakpoints there
 * fails a test rather than splitting the bar at two widths.
 */
export const MD_UP = '@media (min-width:900px)';

/**
 * The shared look of the outlined header controls: the share trigger (Import
 * and export), the `?` (help) beside it, and the `+` (Add) on the right.
 *
 * One definition imported by three call sites, rather than three copies. They
 * are a matched set by design - `header.test.tsx` asserts the two triggers
 * carry the same variant class as each other - and a set defined in three
 * places is a set that drifts, which is exactly how the help pill ended up
 * 2.8px taller than its neighbours.
 *
 * `header.tsx` already imports `csv-header-controls`, so this cannot live in
 * the header without a circular import; hence a module of its own, the same
 * shape as `CONTENT_GUTTER` in `main-layout.tsx`.
 *
 * White, not primary blue. The help pill was already white here via
 * `color="inherit"` on the AppBar; the two triggers were `contained` primary,
 * which made them read as two calls to action in a bar whose every other
 * control is a plain affordance. Matching them to the pill settles it in the
 * direction that was already there rather than inventing a third treatment -
 * see the buttonSx comment in help-button.tsx on that temptation, which amber
 * lost to twice.
 */
/**
 * The colour half of the white outlined control, without the header height,
 * for an outlined button that sits in page content: Contracts' "Add Contract"
 * went amber with the palette change and read as the page's call to action,
 * which a row-adding button is not. `HEADER_CONTROL_SX` composes this, so the
 * two cannot drift.
 */
export const OUTLINED_WHITE_SX = {
  color: 'common.white',
  borderColor: 'rgba(255, 255, 255, 0.35)',
  '&:hover': {
    borderColor: 'rgba(255, 255, 255, 0.6)',
    bgcolor: 'rgba(255, 255, 255, 0.08)',
  },
} as const;

export const HEADER_CONTROL_SX: SxProps<Theme> = {
  height: HEADER_CONTROL_H.xs,
  [MD_UP]: { height: HEADER_CONTROL_H.md },
  ...OUTLINED_WHITE_SX,
};

/**
 * The icon-only pair: the same control, squared off around a single glyph.
 *
 * Width is pinned for the same reason height is. Left to the content it
 * follows the icon's `fontSize`, which put the share trigger at 33px beside the
 * `+` at 38 - the two halves of a deliberately matched pair, differing because
 * one glyph needed an optical correction the other did not.
 *
 * With `px: 0.5`, 32 leaves a 22px content box, which is the smallest that
 * still clears the 20px `Add` icon; from md up, 36 leaves 28 for the 24px one.
 * Widening the padding back to `px: 1` would crush the box and squeeze the glyph.
 *
 * The md block restates the height rather than adding only the width. It has
 * the same key as the one spread in from HEADER_CONTROL_SX, so a block holding
 * only `width` would replace that one and silently drop the md height.
 */
export const HEADER_TRIGGER_SX: SxProps<Theme> = {
  ...HEADER_CONTROL_SX,
  minWidth: 0,
  width: 32,
  [MD_UP]: { height: HEADER_CONTROL_H.md, width: 36 },
  px: 0.5,
};

/**
 * The `+` glyph, which the share and `?` glyphs are sized against.
 *
 * Was `fontSize="small"` inline in header.tsx. It lives here now because the
 * other two are derived from it, and a base value in a different file from the
 * two numbers computed from it is how they would drift apart.
 */
export const ADD_ICON_FONT_SIZE = { xs: 20, md: 24 };

/**
 * Optical size for the share glyph, which `Add` does not need.
 *
 * Material icons are not drawn to a common inset. Inside the same 24x24
 * viewBox, `Add`'s ink is 14x14 with 5 units clear on all four sides, while
 * `IosShare`'s is 16x22 with **one**. Rendered at the same 20px that means an
 * 18.3px glyph beside a 12.7px one, so the share icon crowds its outline while
 * the plus sits comfortably inside the identical box.
 *
 * So it is `Add`'s size times sqrt(196/352), which equalises the two by ink
 * area: 20 gives 14.9, hence 15; 24 gives 17.9, hence 18. Matching by height
 * alone would want 0.63x and leave the glyph looking starved, because it is
 * much taller than it is wide.
 *
 * Measure before changing it - `svg.getBBox()` against the rendered icon, not
 * the icon's `fontSize`, which says nothing about how much of the box the ink
 * fills - and re-measure if the icon is ever swapped, since the ratio
 * describes `IosShare` specifically and means nothing for a different glyph.
 */
export const SHARE_ICON_FONT_SIZE = { xs: 15, md: 18 };

/**
 * The `?`, which is a text glyph rather than an icon. 15px against the 24px box
 * put its cap height level with the share and Add marks beside it; 18 against
 * 28 keeps it there.
 */
export const HELP_GLYPH_FONT_SIZE = { xs: 15, md: 18 };

/**
 * The visible gap between neighbours in the header's right cluster, in px.
 *
 * "Visible" is the point. The cluster's flex gap is this number, but a MUI
 * IconButton wraps its glyph in 8px of padding (5px at `size="small"`), so
 * a glyph sat 18px from the rule beside it while the `+` box sat 10. The
 * two presets below cancel that padding with a matching negative margin, so
 * a glyph meets the gap by its ink and every gap along the row measures the
 * same. Measured across the seven items of the row: 10, 10, 10, 10, 10, 10.
 *
 * A new control in the cluster follows the same rule: a bordered control
 * (Button, Avatar, the lockup) needs nothing; an icon-only IconButton takes
 * the preset for its size; a rule takes no margin of its own.
 */
export const HEADER_CLUSTER_GAP = 10;

/** A default-size icon-only IconButton in the header cluster: cancels its 8px padding. */
export const HEADER_ICON_BUTTON_SX = { mx: -1 } as const;

/** A `size="small"` icon-only IconButton in the header cluster: cancels its 5px padding. */
export const HEADER_SMALL_ICON_BUTTON_SX = { mx: '-5px' } as const;

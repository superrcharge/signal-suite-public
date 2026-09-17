import { useState } from 'react';
import { Button } from '@mui/material';

import { HEADER_TRIGGER_SX, HELP_GLYPH_FONT_SIZE } from '@/components/common/header-trigger-sx';
import { HelpDialog } from './help-dialog';

/**
 * The header's entry point into the in-app FAQ: a `?` box beside the share
 * trigger.
 *
 * It used to read "I need help!" and sit centred between the two clusters. Both
 * of those are gone, and the centring is the part worth explaining. It was
 * centred in the space the clusters left over rather than on the viewport, so
 * the page picker - which sizes to its own label - moved it: measured across
 * the nine page labels it drifted 26.7px, from x=653.5 on Kits to x=680.2 on
 * Dashboard. Anchoring the picker to its widest label would have pinned it, but
 * that fixes the symptom. The middle of the bar was the wrong place to begin
 * with: a centred control invites whatever a page centres beneath it to read
 * as a pair that nobody designed, which is why the page banners keep their own
 * actions at the edges. Packed into the left cluster it cannot drift, with no
 * width to reserve and nothing to hold still.
 *
 * A bare `?` rather than `HelpOutlineOutlined`, which draws a question mark
 * inside a circle: the trigger already draws a box, and circle-inside-square is
 * one enclosure too many. The share and `+` triggers each put a plain mark in
 * that box, and this now matches them.
 *
 * Two properties are load-bearing and easy to break, mirrored from
 * `csv-header-controls.tsx`, which documents the same failure mode in more
 * detail:
 *
 * - **No `@/services` hook is called here.** ~24 test files mock that module
 *   with a closed object, and this button renders inside MainLayout in every
 *   one of them, so a service hook added here fails all of them at once, as a
 *   spray of unrelated-looking failures. `useAuth` (from `@/contexts`) and
 *   `useNavigate` (from `react-router`) are not from `@/services`; the role
 *   gating and navigation that need them live in `HelpDialog`, which mounts
 *   only after a click.
 * - **`HelpDialog` is mounted conditionally, not held open with an `open`
 *   prop.** That is what keeps its state reset on every open rather than
 *   surviving a close, and keeps it off the tree entirely until it is wanted.
 */
export function HelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outlined"
        color="inherit"
        size="small"
        // The only accessible name the control has now that the text is gone,
        // and it stays "I need help!" because that is what the FAQ is called
        // everywhere else - the context docs, and the tests that resolve this
        // button by name.
        aria-label="I need help!"
        onClick={() => setOpen(true)}
        sx={{
          ...HEADER_TRIGGER_SX,
          ml: 1,
          // The glyph, not an icon component, sized with the share and Add
          // marks beside it - see HELP_GLYPH_FONT_SIZE.
          fontSize: HELP_GLYPH_FONT_SIZE,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        ?
      </Button>

      {open && <HelpDialog onClose={() => setOpen(false)} />}
    </>
  );
}

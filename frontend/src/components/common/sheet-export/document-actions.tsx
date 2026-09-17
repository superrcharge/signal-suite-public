import type { ComponentProps, ReactNode } from 'react';
import { Box, Button } from '@mui/material';
import { BANNER_BTN_PRIMARY_SX, CONTENT_LINE, RAIL_BANNER_PX } from '@/components/common/banner-controls';
import { SheetExportMenu } from './sheet-export-menu';

/**
 * The document actions of a printable page, in the one place they live.
 *
 * Convention: the last two controls of a banner or preview toolbar are the
 * share trigger and then Print / Save PDF, right-justified, so Print's right
 * edge is the line the bar ends on, and anything
 * that changes what the printed output looks like - Paper / Dark, Fit to one
 * page, Edit, Full Screen, the scale slider's neighbours - sits immediately
 * to their left, passed as `children`. Before this, the sheet page had them in
 * the centre after a slider, the compare page beside its title, the compare
 * preview alone in the middle of its bar, and the compatibility preview as a
 * plain button; a reader learned a new place on every page.
 *
 * Right edge: `CONTENT_LINE`, 28px in from the content edge, the line the
 * catalog cards end on and the header lockup sits on. `inset` is the bar's
 * own horizontal padding in spacing units (the rail banner's by default), so
 * a caller whose bar already pads 28 passes 3.5 and gets no extra margin, and
 * one that pads 24 passes 3.
 *
 * `flexShrink: 0`: a cluster allowed to shrink collapsed to zero width on the
 * sheet page and its buttons overflowed back over the gap.
 */
export function DocumentActions({
  onPrint,
  printDisabled = false,
  spec,
  inset = RAIL_BANNER_PX,
  children,
}: {
  onPrint: () => void;
  printDisabled?: boolean;
  /** Omit on a page with nothing to export as an image or slide. */
  spec?: ComponentProps<typeof SheetExportMenu>['spec'];
  inset?: number;
  children?: ReactNode;
}) {
  return (
    <Box sx={{ ml: 'auto', mr: `${String(Math.max(0, CONTENT_LINE - inset * 8))}px`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
      {children}
      {spec && <SheetExportMenu spec={spec} />}
      <Button variant="contained" disableElevation onClick={onPrint} disabled={printDisabled} sx={BANNER_BTN_PRIMARY_SX}>
        Print / Save PDF
      </Button>
    </Box>
  );
}

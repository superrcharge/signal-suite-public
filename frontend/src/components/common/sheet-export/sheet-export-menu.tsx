import { useState, type MouseEvent, type ReactNode } from 'react';
import { Alert, Box, Button, Menu, MenuItem, Snackbar, Tooltip, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ImageIcon from '@mui/icons-material/Image';
import IosShareIcon from '@mui/icons-material/IosShare';
import SlideshowIcon from '@mui/icons-material/Slideshow';

import { BANNER_BTN_AMBER_SX, BANNER_ICON_BTN_SX } from '@/components/common/banner-controls';
import {
  clipboardImageSupported,
  clipboardUnavailableReason,
  copySheetToClipboard,
  downloadSheetPng,
  downloadSheetPptx,
  type SheetExportResult,
  type SheetExportSpec,
} from './sheet-export';

/**
 * Share the sheet on screen: a PowerPoint slide, the clipboard, or a .png.
 *
 * **Per page, unlike the CSV controls, and that is not an inconsistency.** CSV
 * export is dataset scoped: nine domains across five pages, three of which have
 * no page at all, which is how six domains once shipped exports nobody could
 * reach. Its dialog exists to answer "which dataset?", and it lives in the
 * header because no route can answer that. This control is document scoped. It
 * exports the DOM on screen at the scale currently set, so there is no "which
 * sheet?" question to ask; putting it in the header would manufacture one, and
 * would sit permanently disabled on every route that has no sheet.
 *
 * Three properties are load bearing:
 *
 * - **No `@/services` hook is called here.** `pace-section-page.test.tsx` mocks
 *   that module with a closed object and renders MainLayout, so a service hook
 *   added here fails it as an unrelated-looking "not a function". Nothing here
 *   needs one: the sheet is already rendered and the exporter reads the DOM.
 * - **A Tooltip is correct on this trigger, where it is wrong on the Print
 *   chip beside it.** MUI promotes a Tooltip title to the child's `aria-label`,
 *   which would leave the chip's visible label and accessible name disagreeing.
 *   This is an icon at every width, so nothing else names it; the explicit
 *   `aria-label` below is the name, and the Tooltip's promotion is a no-op.
 * - **The Snackbar is local.** There is no app-level snackbar, and introducing
 *   app-wide plumbing for one control would be the larger change.
 */
export function SheetExportMenu({ spec }: { spec: () => SheetExportSpec | null }) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ severity: 'success' | 'warning' | 'error'; text: string } | null>(null);

  const menuOpen = Boolean(menuAnchor);
  const clipboardOk = clipboardImageSupported();
  const clipboardWhy = clipboardUnavailableReason();

  const closeMenu = () => setMenuAnchor(null);

  const run = (action: (s: SheetExportSpec) => Promise<SheetExportResult>, success: string) => {
    closeMenu();
    const current = spec();
    if (!current) {
      setNote({ severity: 'error', text: 'The sheet is not ready yet. Try again in a moment.' });
      return;
    }
    setBusy(true);
    void action(current)
      .then((result) => {
        if (!result.ok) setNote({ severity: 'error', text: result.error ?? 'The export failed.' });
        else if (result.fontWarning) setNote({ severity: 'warning', text: result.fontWarning });
        else setNote({ severity: 'success', text: success });
      })
      .finally(() => setBusy(false));
  };

  return (
    <>
      <Tooltip title="Share this sheet">
        <span>
          <Button
            variant="outlined"
            size="small"
            disableElevation
            disabled={busy}
            aria-label="share this sheet"
            aria-haspopup="true"
            aria-controls={menuOpen ? 'sheet-export-menu' : undefined}
            aria-expanded={menuOpen ? 'true' : undefined}
            onClick={(e: MouseEvent<HTMLElement>) => setMenuAnchor(e.currentTarget)}
            // The banner's amber icon square, not the header's white-on-dark
            // treatment: HEADER_TRIGGER_SX is sized to the AppBar and belongs
            // there. One preset with the buttons it sits beside, so it is the
            // same 30px as Print / Save PDF and Edit rather than 26.
            sx={{ ...BANNER_BTN_AMBER_SX, ...BANNER_ICON_BTN_SX }}
          >
            <IosShareIcon sx={{ fontSize: 16 }} />
          </Button>
        </span>
      </Tooltip>

      <Menu
        id="sheet-export-menu"
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            elevation: 3,
            sx: { minWidth: 260, mt: 0.5, borderRadius: '8px', border: '1px solid', borderColor: 'divider' },
          },
        }}
      >
        <SheetMenuItem
          icon={<SlideshowIcon fontSize="small" />}
          label="Download .pptx"
          hint="One slide, sized to this sheet"
          onClick={() => run(downloadSheetPptx, 'PowerPoint file downloaded.')}
        />
        <SheetMenuItem
          icon={<ContentCopyIcon fontSize="small" />}
          label="Copy image"
          hint={clipboardOk ? 'Paste straight onto a slide' : clipboardWhy}
          disabled={!clipboardOk}
          onClick={() => run(copySheetToClipboard, 'Copied. Paste onto a slide.')}
        />
        <SheetMenuItem
          icon={<ImageIcon fontSize="small" />}
          label="Download .png"
          hint="For documents and other apps"
          onClick={() => run(downloadSheetPng, 'Image downloaded.')}
        />
      </Menu>

      <Snackbar
        open={note !== null}
        autoHideDuration={note?.severity === 'success' ? 3000 : 8000}
        onClose={() => setNote(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={note?.severity ?? 'success'} variant="filled" onClose={() => setNote(null)}>
          {note?.text}
        </Alert>
      </Snackbar>
    </>
  );
}

// A caption line rather than a per-item Tooltip, matching CsvHeaderControls: a
// Tooltip on a MenuItem fights the menu's own hover and covers the item below.
function SheetMenuItem({
  icon,
  label,
  hint,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <MenuItem
      onClick={onClick}
      disabled={disabled}
      sx={{ gap: 1.5, borderRadius: '4px', mx: 0.5, my: 0.25, py: 1 }}
    >
      <Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>
      <Box>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {hint}
        </Typography>
      </Box>
    </MenuItem>
  );
}

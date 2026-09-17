import { useState, MouseEvent } from 'react';
import { Box, Button, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import IosShareIcon from '@mui/icons-material/IosShare';
import { useLocation } from 'react-router';

import { useAuth } from '@/contexts/auth-context';
import { HEADER_TRIGGER_SX, SHARE_ICON_FONT_SIZE } from '../header-trigger-sx';
import { CsvDialog, type CsvDialogMode } from './csv-dialog';
import { CsvImportDialog } from './csv-import-dialog';
import { datasetForPath, sectionForPath } from './route-dataset';

type OpenDialog = CsvDialogMode | 'import';

/**
 * Export, Template and Import, in the app header on every route.
 *
 * The same three actions everywhere, doing the same thing everywhere. The route
 * contributes a pre-tick and nothing else, which is what makes Waveforms,
 * Services and Transports reachable at all - none of them has a page of its own,
 * so a per-page toolbar could never have offered them.
 *
 * They were three buttons until they became one menu. The bar carried six
 * controls across two clusters, enough width pressure that these three dropped
 * their text labels below `md` to stop the AppBar overflowing around 1280px.
 * One icon does not overflow, so that breakpoint is gone with them.
 *
 * Three properties are load-bearing and easy to break:
 *
 * - **No `@/services` hook is called here.** Two dozen test files mock that
 *   module with a closed object, and this component renders inside MainLayout in
 *   every one of them, so a service hook added here fails all of them at once.
 *   `useAuth` and `useLocation` are not from `@/services`; the dialogs, which
 *   are, mount only after a click.
 * - **The dialogs are mounted conditionally, not held open with a prop.** That
 *   is what keeps their queries off every route. The menu adds a click before
 *   `setOpen`; it does not change the mount condition.
 * - **The trigger is named by `aria-label`, not by its contents.** It is an icon
 *   at every width, so nothing else names it for a screen reader or for a test.
 */
export function CsvHeaderControls() {
  const location = useLocation();
  const { canWrite, canWriteRadio, canWritePace } = useAuth();

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(menuAnchor);
  const [open, setOpen] = useState<OpenDialog | null>(null);

  const preselect = datasetForPath(location.pathname, location.search);
  const section = sectionForPath(location.pathname);

  // Import targets a write endpoint. A viewer would otherwise get an entry whose
  // every destination 403s. This is a role condition, not a route condition, so
  // the menu is still identical on every page.
  //
  // Template is not gated, and used to be. It downloads a header row and writes
  // nothing, and the backend already serves it to anyone -
  // TestImportTemplatesAreReachableWithoutAuth asserts those routes never 401.
  // Hiding it contradicted the server, and left a viewer no way to see which
  // columns an import file needs.
  //
  // Import takes any write gate at all, because a planner who can import nets
  // has to be able to reach it. That is safe only because the dialog gates its
  // own dataset list against the same registry - the same argument the ungated
  // /catalog/comms-library route rests on, where each pane hides its own write
  // controls. It used to say "the dialog is dataset-agnostic", which was true
  // when the gate was one boolean and stopped being true when canWriteRadio and
  // then canWritePace split out: the union opened a dialog that then offered a
  // planner five datasets the server refuses. See use-csv-write-gate.ts.
  const mayWrite = canWrite || canWriteRadio || canWritePace;

  const closeMenu = () => setMenuAnchor(null);
  const choose = (which: OpenDialog) => {
    closeMenu();
    setOpen(which);
  };

  return (
    <>
      <Tooltip title="Import and export">
        <Button
          variant="outlined"
          size="small"
          disableElevation
          aria-label="import and export"
          aria-haspopup="true"
          aria-controls={menuOpen ? 'csv-menu' : undefined}
          aria-expanded={menuOpen ? 'true' : undefined}
          onClick={(e: MouseEvent<HTMLElement>) => setMenuAnchor(e.currentTarget)}
          sx={{ ...HEADER_TRIGGER_SX, ml: 1 }}
        >
          <IosShareIcon sx={{ fontSize: SHARE_ICON_FONT_SIZE }} />
        </Button>
      </Tooltip>

      <Menu
        id="csv-menu"
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            elevation: 3,
            sx: { minWidth: 240, mt: 0.5, borderRadius: '8px', border: '1px solid', borderColor: 'divider' },
          },
        }}
      >
        <CsvMenuItem
          icon={<FileDownloadIcon fontSize="small" />}
          label="Export"
          hint="Download data as CSV"
          onClick={() => choose('export')}
        />
        <CsvMenuItem
          icon={<DescriptionIcon fontSize="small" />}
          label="Template"
          hint="Get the header row an import needs"
          onClick={() => choose('template')}
        />
        {mayWrite && (
          <CsvMenuItem
            icon={<FileUploadIcon fontSize="small" />}
            label="Import"
            hint="Upload a filled-in CSV"
            onClick={() => choose('import')}
          />
        )}
      </Menu>

      {(open === 'export' || open === 'template') && (
        <CsvDialog
          mode={open}
          preselect={preselect}
          section={section}
          onClose={() => setOpen(null)}
        />
      )}

      {open === 'import' && (
        <CsvImportDialog
          preselect={preselect}
          section={section}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

// The per-button tooltips did not survive the move - a Tooltip on a MenuItem
// fights the menu's own hover and would cover the item below it. They are a
// caption line instead, the shape users-page.tsx uses for its role menu.
function CsvMenuItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <MenuItem onClick={onClick} sx={{ gap: 1.5, borderRadius: '4px', mx: 0.5, my: 0.25, py: 1 }}>
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

import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';

import { useToast } from '@/contexts';
import { useCsvImport } from '@/services/csv-service';
import { CSV_DOMAINS, CSV_DOMAIN_ORDER, withSection, type CsvResource } from './csv-domains';
import { CsvImportResultDialog, type CsvImportResult } from './csv-import-result-dialog';
import { squadronsFor } from './csv-selection';
import { useCsvFacetOptions } from './use-csv-facet-options';
import { useCsvWriteGate } from './use-csv-write-gate';

interface CsvImportDialogProps {
  /** Pre-selected dataset, from the current route. */
  preselect?: CsvResource;
  /** The squadron, for the section-scoped domains. */
  section?: string;
  onClose: () => void;
}

/**
 * Import one CSV into one dataset.
 *
 * Single-select, unlike Export and Template, and not as an oversight. A CSV has
 * one header row and loads into one table, so "import several datasets" is
 * either several file pickers - a form, not a button - or a zip routed by
 * filename, which needs a wire format, per-file partial results, and an answer
 * for what happens when half the archive fails. Neither is what a person
 * uploading one filled-in template is asking for.
 *
 * There is no column picker either: the file's header row decides which columns
 * are present, so offering checkboxes would imply a choice the importer does not
 * have.
 */
export function CsvImportDialog({ preselect, section, onClose }: CsvImportDialogProps) {
  const { showToast } = useToast();
  const options = useCsvFacetOptions();
  const mayWrite = useCsvWriteGate();

  // Both conditions, in catalogue order: a route that exists, and a gate this
  // user holds. `importPath` alone was the bug - the header control opens this
  // dialog on any write gate at all, so filtering only on the route offered a
  // planner five datasets the server refuses. See `use-csv-write-gate.ts`.
  const importable = useMemo(
    () => CSV_DOMAIN_ORDER.filter((r) => CSV_DOMAINS[r].importPath && mayWrite(r)),
    [mayWrite],
  );

  const [resource, setResource] = useState<CsvResource | ''>(
    // The preselect comes from the route, which is not a statement about the
    // reader's role, so it takes the same gate as the list. Without this one
    // dataset would still slip past on the page it belongs to.
    preselect && CSV_DOMAINS[preselect].importPath && mayWrite(preselect) ? preselect : '',
  );
  const config = resource ? CSV_DOMAINS[resource] : undefined;
  const squadrons = resource ? squadronsFor(resource, options) : [];
  const [squadron, setSquadron] = useState(section ?? '');

  const [result, setResult] = useState<CsvImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The hook is called unconditionally with an empty path when nothing is
  // chosen, so hook order never depends on the selection.
  const importPath = config?.importPath ? withSection(config.importPath, squadron) : '';
  const importMutation = useCsvImport(resource || 'none', importPath);

  const needsSquadron = Boolean(config?.sectionScoped) && !squadron;
  const ready = Boolean(importPath) && !needsSquadron && !importMutation.isPending;

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared immediately so re-picking the same file fires change again.
    event.target.value = '';
    if (!file) return;

    // accept=".csv" is advisory; a user can still pick anything.
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showToast('That is not a .csv file.', { severity: 'error' });
      return;
    }

    try {
      // file.text() rather than a FileReader callback, so the read, the mutation
      // and the error path are one function instead of three.
      const csv = await file.text();
      const imported = await importMutation.mutateAsync(csv);

      if (imported.errors.length === 0) {
        showToast(imported.message, { severity: 'success' });
        onClose();
        return;
      }
      // Anything skipped opens the result dialog. A toast cannot show eight bad rows.
      setResult(imported);
    } catch {
      showToast('Import failed. Please try again.', { severity: 'error' });
    }
  };

  if (result) {
    return (
      <CsvImportResultDialog
        noun={{ one: 'row', many: 'rows' }}
        result={result}
        onClose={() => {
          setResult(null);
          onClose();
        }}
      />
    );
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Import CSV</DialogTitle>

      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          One file loads into one dataset - a CSV has a single header row. To load
          several, import them one at a time.
        </Alert>

        {/* Unreachable today - every write gate admits at least one importable
            dataset - but an empty select is the silent version of this dialog's
            original bug, so it says so rather than offering nothing. */}
        {importable.length === 0 ? (
          <Alert severity="warning">
            Your role cannot import into any dataset.
          </Alert>
        ) : (
          <TextField
            select
            fullWidth
            size="small"
            label="Dataset"
            value={resource}
            onChange={(e) => setResource(e.target.value as CsvResource)}
            sx={{ mb: 2 }}
          >
            {importable.map((r) => (
              <MenuItem key={r} value={r}>
                {CSV_DOMAINS[r].label}
              </MenuItem>
            ))}
          </TextField>
        )}

        {squadrons.length > 0 && (
          <TextField
            select
            fullWidth
            size="small"
            label="Squadron"
            value={squadron}
            error={needsSquadron}
            helperText={needsSquadron ? 'Rows import into the squadron you pick here.' : undefined}
            onChange={(e) => setSquadron(e.target.value)}
            sx={{ mb: 2 }}
          >
            {squadrons.map((s) => (
              <MenuItem key={s.value} value={s.value}>
                {s.label}
              </MenuItem>
            ))}
          </TextField>
        )}

        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          The header row decides which columns are read. Download a template first
          if you are not sure what it should say.
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={importMutation.isPending}>
          Cancel
        </Button>
        <Box>
          <input
            ref={fileInput}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={(e) => void handleFile(e)}
          />
          <Button
            variant="contained"
            startIcon={
              importMutation.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <FileUploadIcon />
              )
            }
            disabled={!ready}
            onClick={() => fileInput.current?.click()}
          >
            {importMutation.isPending ? 'Importing…' : 'Choose file'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

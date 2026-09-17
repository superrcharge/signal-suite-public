import { useRef, useState } from 'react';
import { Box, Button, CircularProgress, Tooltip } from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import DescriptionIcon from '@mui/icons-material/Description';

import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts';
import { useCsvImport } from '@/services/csv-service';
import { CsvDialog, type CsvDialogMode } from './csv-dialog';
import { CSV_DOMAINS, withSection, type CsvResource } from './csv-domains';
import { CsvImportResultDialog, type CsvImportResult } from './csv-import-result-dialog';

interface CsvToolbarProps {
  resource: CsvResource;
  /** Required for the section-scoped domains (nets, pace-channels). */
  section?: string;
  /** Icon-only buttons, for a cramped pane header. */
  compact?: boolean;
}

/**
 * The Export / Template / Import cluster locked to one domain.
 *
 * The app-wide controls are CsvHeaderControls, which lives in the header on
 * every route and lets the user pick which datasets they mean. This is the other
 * shape: a strip that is already labelled with its domain and should not ask
 * again. The Settings catalogue is its one caller - each row there names a
 * domain, so offering the other eight inside that row would be asking the same
 * question twice.
 *
 * Everything is mounted conditionally rather than kept open with an `open` prop,
 * so the dialogs' queries only run while they are on screen.
 */
export function CsvToolbar({ resource, section, compact = false }: CsvToolbarProps) {
  const config = CSV_DOMAINS[resource];
  const { canWrite, canWriteRadio, canWritePace } = useAuth();
  const { showToast } = useToast();

  const [dialog, setDialog] = useState<CsvDialogMode | null>(null);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const importPath = config.importPath ? withSection(config.importPath, section) : '';
  const importMutation = useCsvImport(resource, importPath);

  const gates = { canWrite, canWriteRadio, canWritePace };
  const mayWrite = gates[config.writeGate];
  // Template carries no role gate, deliberately, and Import keeps one. A
  // template is a header row the backend serves to anyone, so gating it here
  // while the header controls do not would mean a viewer could get a template
  // from the header and not from Settings. The asymmetry below is the rule,
  // not an oversight to tidy up.
  const showTemplate = Boolean(config.templatePath);
  const showImport = Boolean(config.importPath) && mayWrite;

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
      const result = await importMutation.mutateAsync(csv);

      if (result.errors.length === 0) {
        showToast(result.message, { severity: 'success' });
        return;
      }
      // Anything skipped opens the dialog. A toast cannot show eight bad rows.
      setImportResult(result);
    } catch {
      showToast('Import failed. Please try again.', { severity: 'error' });
    }
  };

  const label = (text: string) => (compact ? undefined : text);

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tooltip title={`Export ${config.label} as CSV`}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={() => setDialog('export')}
          >
            {label('Export')}
          </Button>
        </Tooltip>

        {showTemplate && (
          <Tooltip title="Download a CSV import template">
            <Button
              size="small"
              variant="outlined"
              startIcon={<DescriptionIcon />}
              onClick={() => setDialog('template')}
            >
              {label('Template')}
            </Button>
          </Tooltip>
        )}

        {showImport && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => void handleFile(e)}
            />
            <Tooltip title="Import a filled-in CSV">
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={
                    importMutation.isPending ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <FileUploadIcon />
                    )
                  }
                  disabled={importMutation.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  {label('Import')}
                </Button>
              </span>
            </Tooltip>
          </>
        )}
      </Box>

      {dialog && (
        <CsvDialog
          resource={resource}
          mode={dialog}
          section={section}
          onClose={() => setDialog(null)}
        />
      )}

      {importResult && (
        <CsvImportResultDialog
          noun={{ one: 'row', many: 'rows' }}
          result={importResult}
          onClose={() => setImportResult(null)}
        />
      )}
    </>
  );
}

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

export interface CsvImportRowError {
  row: number;
  name: string;
  errors: string[];
}

export interface CsvImportResult {
  imported: number;
  errors: CsvImportRowError[];
  message: string;
}

interface CsvImportResultDialogProps {
  noun: { one: string; many: string };
  result: CsvImportResult;
  onClose: () => void;
}

/**
 * Shows every skipped row after an import.
 *
 * The predecessor was a 12-second toast that named the *first* failure and then
 * "(3 more)". That was survivable for two importable domains and is not for
 * seven: a user with eight bad rows had to fix one, re-upload, and read the
 * toast again. Every row is listed here, with a copy button so the list can go
 * next to the spreadsheet being corrected.
 */
export function CsvImportResultDialog({ noun, result, onClose }: CsvImportResultDialogProps) {
  const failed = result.errors.length;
  const total = result.imported + failed;
  const allFailed = result.imported === 0;

  // The single most common import failure is not deleting the template's EXAMPLE
  // rows. When that is plainly what happened, say so first rather than making
  // someone infer it from a list of validation errors.
  const allExampleRows =
    failed > 0 && result.errors.every((e) => e.name.toUpperCase().startsWith('EXAMPLE '));

  const copyReport = () => {
    const tsv = result.errors
      .map((e) => `${e.row}\t${e.name}\t${e.errors.join('; ')}`)
      .join('\n');
    void navigator.clipboard?.writeText(`Row\tName\tReason\n${tsv}`);
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        Imported {result.imported} of {total} {total === 1 ? noun.one : noun.many}
      </DialogTitle>

      <DialogContent dividers>
        <Alert severity={allFailed ? 'error' : 'warning'} sx={{ mb: 2 }}>
          {failed} {failed === 1 ? 'row was' : 'rows were'} skipped. Nothing else in your file was
          affected.
        </Alert>

        {allExampleRows && (
          <Alert severity="info" sx={{ mb: 2 }}>
            These are the template’s EXAMPLE rows. Delete them from your file and import again.
          </Alert>
        )}

        <TableContainer sx={{ maxHeight: 360 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 72 }}>Row</TableCell>
                <TableCell sx={{ width: '30%' }}>Name</TableCell>
                <TableCell>Reason</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.errors.map((rowError) => (
                <TableRow key={`${rowError.row}-${rowError.name}`}>
                  <TableCell>{rowError.row}</TableCell>
                  <TableCell>{rowError.name}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{rowError.errors.join('; ')}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>

      <DialogActions>
        <Button onClick={copyReport}>Copy report</Button>
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

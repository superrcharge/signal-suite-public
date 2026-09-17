import { useEffect, useRef, useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Divider,
  Alert,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { useCreateContract, useUpdateContract, useDeleteContract } from '@/services';
import { ApiClientError } from '@/services/api-client';
import { useToast } from '@/contexts';
import type { Contract } from '@/types';

const QUARTER_OPTIONS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;

const NOTES_MAX = 250;

export type ContractDrawerMode = 'add' | 'edit';
export type ContractDrawerFocus = 'notes';

interface ContractDrawerProps {
  open: boolean;
  mode: ContractDrawerMode;
  contract?: Contract;
  focusField?: ContractDrawerFocus;
  onClose: () => void;
}

const EMPTY = {
  title: '', company: '',
  logform_number: '', logform_url: '',
  poc_name: '', poc_email: '', poc_phone: '',
  pop_start: '', pop_end: '',
  execution_quarter: '',
  fiscal_year: '',
  notes: '',
};

function contractToForm(c: Contract): typeof EMPTY {
  return {
    title:             c.title,
    company:           c.company,
    logform_number:    c.logform_number ?? '',
    logform_url:       c.logform_url ?? '',
    poc_name:          c.poc_name ?? '',
    poc_email:         c.poc_email ?? '',
    poc_phone:         c.poc_phone ?? '',
    pop_start:         c.pop_start ?? '',
    pop_end:           c.pop_end ?? '',
    execution_quarter: c.execution_quarter ?? '',
    fiscal_year:       c.fiscal_year,
    notes:             c.notes,
  };
}

export function ContractDrawer({ open, mode, contract, focusField, onClose }: ContractDrawerProps) {
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();
  const deleteContract = useDeleteContract();
  const { showToast } = useToast();

  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open && mode === 'edit' && contract) {
      setForm(contractToForm(contract));
    } else if (open && mode === 'add') {
      setForm(EMPTY);
    }
    setError(null);
  }, [open, mode, contract]);

  useEffect(() => {
    if (open && focusField === 'notes') {
      const id = setTimeout(() => {
        const el = notesRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }, 120);
      return () => clearTimeout(id);
    }
  }, [open, focusField]);

  const set = (field: keyof typeof EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleClose = () => {
    setForm(EMPTY);
    setError(null);
    setConfirmDeleteOpen(false);
    onClose();
  };

  const nullable = (s: string): string | null => (s.trim() === '' ? null : s.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.company.trim() || !form.fiscal_year.trim()) return;
    setError(null);

    if (mode === 'edit' && contract) {
      updateContract.mutate(
        {
          id: contract.id,
          data: {
            title:            form.title.trim(),
            company:          form.company.trim(),
            logform_number:   nullable(form.logform_number),
            logform_url:      nullable(form.logform_url),
            poc_name:         nullable(form.poc_name),
            poc_email:        nullable(form.poc_email),
            poc_phone:        nullable(form.poc_phone),
            pop_start:        nullable(form.pop_start),
            pop_end:          nullable(form.pop_end),
            execution_quarter: nullable(form.execution_quarter),
            fiscal_year:      form.fiscal_year.trim(),
            notes:            form.notes.trim(),
          },
        },
        {
          onSuccess: () => { showToast('Contract updated'); handleClose(); },
          onError: (err) => setError(err instanceof ApiClientError ? err.message : 'Failed to update contract.'),
        }
      );
      return;
    }

    createContract.mutate(
      {
        title:            form.title.trim(),
        company:          form.company.trim(),
        logform_number:   nullable(form.logform_number),
        logform_url:      nullable(form.logform_url),
        poc_name:         nullable(form.poc_name),
        poc_email:        nullable(form.poc_email),
        poc_phone:        nullable(form.poc_phone),
        pop_start:        nullable(form.pop_start),
        pop_end:          nullable(form.pop_end),
        execution_quarter: nullable(form.execution_quarter),
        fiscal_year:      form.fiscal_year.trim(),
        notes:            form.notes.trim() || undefined,
      },
      {
        onSuccess: () => { showToast('Contract created'); handleClose(); },
        onError: (err) => setError(err instanceof ApiClientError ? err.message : 'Failed to create contract.'),
      }
    );
  };

  const handleConfirmDelete = () => {
    if (!contract) return;
    deleteContract.mutate(contract.id, {
      onSuccess: () => { showToast('Contract deleted', { severity: 'info' }); handleClose(); },
      onError: (err) => {
        setConfirmDeleteOpen(false);
        setError(err instanceof ApiClientError ? err.message : 'Failed to delete contract.');
      },
    });
  };

  const isEdit = mode === 'edit' && !!contract;
  const title = isEdit ? 'Edit Contract' : 'Add Contract';
  const primaryLabel = isEdit ? 'Save Changes' : 'Add Contract';
  const pending = createContract.isPending || updateContract.isPending;
  const notesOverLimit = form.notes.length > NOTES_MAX;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      slotProps={{
        paper: { sx: { width: 440, bgcolor: 'background.paper' } }
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2 }}>
        <Typography variant="h6" sx={{
          fontWeight: 700
        }}>{title}</Typography>
        <IconButton onClick={handleClose} size="small" aria-label="close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Divider />
      <Box component="form" onSubmit={handleSubmit} sx={{ px: 3, py: 2.5, overflow: 'auto', flex: 1 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
        )}

        <Stack spacing={2.5}>
          <TextField
            label="Contract Title"
            value={form.title}
            onChange={set('title')}
            required
            fullWidth size="small"
            helperText="Required - e.g. SATCOM Maintenance SLA"
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Logform Number"
              value={form.logform_number}
              onChange={set('logform_number')}
              fullWidth size="small"
              placeholder="e.g. 123456"
              slotProps={{ htmlInput: { maxLength: 20 } }}
            />
            <TextField
              label="Logform URL"
              value={form.logform_url}
              onChange={set('logform_url')}
              fullWidth size="small"
              type="url"
              placeholder="https://…"
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />
          </Box>

          <TextField
            label="Company / Vendor"
            value={form.company}
            onChange={set('company')}
            required
            fullWidth size="small"
          />

          <TextField
            label="Fiscal Year"
            value={form.fiscal_year}
            onChange={set('fiscal_year')}
            required
            fullWidth size="small"
            placeholder="e.g. FY26"
            helperText="Required - e.g. FY25, FY26, FY27"
            slotProps={{ htmlInput: { maxLength: 4 } }}
          />

          <Divider />

          <TextField
            label="POC Name"
            value={form.poc_name}
            onChange={set('poc_name')}
            fullWidth size="small"
            placeholder="e.g. Jane Doe"
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="POC Email" value={form.poc_email} onChange={set('poc_email')} fullWidth size="small" type="email" />
            <TextField label="POC Phone" value={form.poc_phone} onChange={set('poc_phone')} fullWidth size="small" />
          </Box>

          <Divider />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Start Date"
              value={form.pop_start}
              onChange={set('pop_start')}
              fullWidth size="small"
              type="date"
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="End Date"
              value={form.pop_end}
              onChange={set('pop_end')}
              fullWidth size="small"
              type="date"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>

          <FormControl fullWidth size="small">
            <InputLabel>Quarter</InputLabel>
            <Select
              value={form.execution_quarter}
              label="Quarter"
              onChange={(e) => setForm((prev) => ({ ...prev, execution_quarter: e.target.value }))}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {QUARTER_OPTIONS.map((q) => (
                <MenuItem key={q} value={q}>{q}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider />

          <TextField
            label="Notes"
            value={form.notes}
            onChange={set('notes')}
            fullWidth size="small"
            multiline rows={3}
            placeholder="Any relevant notes…"
            inputRef={notesRef}
            slotProps={{ htmlInput: { maxLength: NOTES_MAX } }}
            error={notesOverLimit}
            helperText={`${form.notes.length} / ${NOTES_MAX}`}
          />
        </Stack>
      </Box>
      <Divider />
      <Box sx={{ px: 3, py: 2, display: 'flex', gap: 1.5, justifyContent: 'space-between', alignItems: 'center' }}>
        {isEdit ? (
          <Button
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={pending || deleteContract.isPending}
          >
            Delete
          </Button>
        ) : (
          <Box />
        )}
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" onClick={handleClose} disabled={pending}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!form.title.trim() || !form.company.trim() || !form.fiscal_year.trim() || notesOverLimit}
            loading={pending}
            disableElevation
            onClick={handleSubmit}
          >
            {primaryLabel}
          </Button>
        </Box>
      </Box>
      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <DialogTitle>Delete contract?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete <strong>{contract?.title}</strong>. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDeleteOpen(false)} disabled={deleteContract.isPending}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disableElevation
            onClick={handleConfirmDelete}
            loading={deleteContract.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}

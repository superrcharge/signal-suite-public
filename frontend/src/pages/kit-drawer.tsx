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
  Collapse,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Checkbox,
  FormControlLabel,
  FormGroup,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import {
  useCreateKit,
  useUpdateKit,
  useDeleteKit,
  useSections,
  useCreateSection,
} from '@/services';
import { ApiClientError } from '@/services/api-client';
import { useToast } from '@/contexts';
import type { Kit } from '@/types';
// Status colors are hard-reserved for the stat strip and never appear in the
// section swatches; `asset-colors.test.ts` asserts that disjointness.
import { SECTION_COLOR_PALETTE as COLOR_PALETTE } from '@/theme/asset-colors';
import { KIT_TYPE_OPTIONS, KIT_NETWORKS } from './kit-constants';
import { STATUS_OPTIONS } from './asset-status-constants';

const NOTES_MAX = 250;
const LOCATION_MAX = 200;

// Slugify: lowercase + strip whitespace + drop non-alphanumerics.
function labelToKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
}

function autoColor(existingColors: string[]): string {
  const used = new Set(existingColors);
  return COLOR_PALETTE.find((c) => !used.has(c)) ?? COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]!;
}

export type KitDrawerMode = 'add' | 'edit';
export type KitDrawerFocus = 'name' | 'notes';

interface KitDrawerProps {
  open: boolean;
  mode: KitDrawerMode;
  kit?: Kit;
  focusField?: KitDrawerFocus;
  onClose: () => void;
}

const EMPTY = {
  name: '', type: 'remote', status: 'available',
  black: false, secret: false, topsecret: false,
  section: '', owner: '', owner_email: '', owner_phone: '', location: '', notes: '',
};

function kitToForm(k: Kit): typeof EMPTY {
  return {
    name:        k.name,
    type:        k.type,
    status:      k.status,
    black:       k.black,
    secret:       k.secret,
    topsecret:        k.topsecret,
    section:     k.section ?? '',
    owner:       k.owner ?? '',
    owner_email: k.owner_email ?? '',
    owner_phone: k.owner_phone ?? '',
    location:    k.location ?? '',
    notes:       k.notes ?? '',
  };
}

type TextFieldKey = 'name' | 'owner' | 'owner_email' | 'owner_phone' | 'location' | 'notes';

export function KitDrawer({ open, mode, kit, focusField, onClose }: KitDrawerProps) {
  const { data: sectionsData } = useSections();
  const sections = sectionsData ?? [];
  const createKit = useCreateKit();
  const updateKit = useUpdateKit();
  const deleteKit = useDeleteKit();
  const createSection = useCreateSection();
  const { showToast } = useToast();

  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const [showNewSection, setShowNewSection] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState('');
  const [newSectionColor, setNewSectionColor] = useState('');
  const [sectionError, setSectionError] = useState<string | null>(null);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && mode === 'edit' && kit) {
      setForm(kitToForm(kit));
    } else if (open && mode === 'add') {
      setForm(EMPTY);
    }
  }, [open, mode, kit]);

  useEffect(() => {
    if (!open) return;
    const target = focusField ?? (mode === 'add' ? 'name' : null);
    if (!target) return;
    const raf = requestAnimationFrame(() => {
      if (target === 'notes') notesRef.current?.focus();
      else if (target === 'name') nameRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open, mode, focusField]);

  const set = (field: TextFieldKey) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleClose = () => {
    setForm(EMPTY);
    setError(null);
    setShowNewSection(false);
    setNewSectionLabel('');
    setNewSectionColor('');
    setSectionError(null);
    setConfirmDeleteOpen(false);
    onClose();
  };

  const handleOpenNewSection = () => {
    setNewSectionLabel('');
    setNewSectionColor(autoColor(sections.map((s) => s.color)));
    setSectionError(null);
    setShowNewSection(true);
  };

  const handleSaveSection = () => {
    const label = newSectionLabel.trim();
    if (!label) return;
    const key = labelToKey(label);
    if (!key) { setSectionError('Invalid name. Use letters and numbers only.'); return; }

    setSectionError(null);
    createSection.mutate(
      { key, label, color: newSectionColor },
      {
        onSuccess: () => {
          setForm((prev) => ({ ...prev, section: key }));
          setShowNewSection(false);
          setNewSectionLabel('');
        },
        onError: (err) => {
          setSectionError(err instanceof ApiClientError ? err.message : 'Failed to create section.');
        },
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError(null);

    // An edit with no kit must never fall through to the create below. isEdit
    // reads a missing kit as Add mode, so before this guard an edit URL the
    // caller could not resolve created a duplicate. The caller now waits for
    // the record, and this keeps that true for any future caller.
    if (mode === 'edit' && !kit) {
      setError('That kit could not be loaded. Close and reopen it from the list.');
      return;
    }

    if (mode === 'edit' && kit) {
      updateKit.mutate(
        {
          id: kit.id,
          data: {
            name:        form.name.trim(),
            type:        form.type,
            status:      form.status,
            black:       form.black,
            secret:       form.secret,
            topsecret:        form.topsecret,
            section:     form.section,
            owner:       form.owner.trim(),
            owner_email: form.owner_email.trim(),
            owner_phone: form.owner_phone.trim(),
            location:    form.location.trim(),
            notes:       form.notes.trim(),
          },
        },
        {
          onSuccess: () => { showToast('Kit updated'); handleClose(); },
          onError: (err) => {
            setError(err instanceof ApiClientError ? err.message : 'Failed to update kit.');
          },
        }
      );
      return;
    }

    createKit.mutate(
      {
        name:        form.name.trim(),
        type:        form.type,
        status:      form.status             || undefined,
        black:       form.black,
        secret:       form.secret,
        topsecret:        form.topsecret,
        section:     form.section            || undefined,
        owner:       form.owner.trim()       || undefined,
        owner_email: form.owner_email.trim() || undefined,
        owner_phone: form.owner_phone.trim() || undefined,
        location:    form.location.trim()    || undefined,
        notes:       form.notes.trim()       || undefined,
      },
      {
        onSuccess: () => { showToast('Kit created'); handleClose(); },
        onError: (err) => {
          setError(err instanceof ApiClientError ? err.message : 'Failed to create kit.');
        },
      }
    );
  };

  const handleConfirmDelete = () => {
    if (!kit) return;
    deleteKit.mutate(kit.id, {
      onSuccess: () => { showToast('Kit deleted', { severity: 'info' }); handleClose(); },
      onError: (err) => {
        setConfirmDeleteOpen(false);
        setError(err instanceof ApiClientError ? err.message : 'Failed to delete kit.');
      },
    });
  };

  const isEdit = mode === 'edit' && !!kit;
  const title = isEdit ? 'Edit Kit' : 'Add Kit';
  const primaryLabel = isEdit ? 'Save Changes' : 'Add Kit';
  const pending = createKit.isPending || updateKit.isPending;

  const notesCount = form.notes.length;
  const notesOverLimit = notesCount > NOTES_MAX;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      slotProps={{
        paper: { sx: { width: 420, bgcolor: 'background.paper' } }
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
        <IconButton onClick={handleClose} size="small" aria-label="close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Divider />
      <Box component="form" onSubmit={handleSubmit} sx={{ px: 3, py: 2.5, overflow: 'auto', flex: 1 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Stack spacing={2.5}>
          <TextField
            label="Kit Name"
            value={form.name}
            onChange={set('name')}
            required
            fullWidth
            size="small"
            inputRef={nameRef}
            helperText="Required - e.g. ASQD REMOTE 1"
          />

          <FormControl fullWidth size="small" required>
            <InputLabel>Type</InputLabel>
            <Select
              value={form.type}
              label="Type"
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
            >
              {KIT_TYPE_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider />

          <FormControl fullWidth size="small">
            <InputLabel>Section</InputLabel>
            <Select
              value={form.section}
              label="Section"
              onChange={(e) => {
                if (e.target.value === '__create__') return;
                setForm((prev) => ({ ...prev, section: e.target.value }));
              }}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {sections.map((s) => (
                <MenuItem key={s.key} value={s.key}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
                    {s.label}
                  </Box>
                </MenuItem>
              ))}
              <Divider />
              <MenuItem
                value="__create__"
                onClick={handleOpenNewSection}
                sx={{ color: 'primary.main', fontWeight: 600, gap: 1 }}
              >
                <AddIcon fontSize="small" /> Create section…
              </MenuItem>
            </Select>
          </FormControl>

          <Collapse in={showNewSection}>
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: '8px', p: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', display: 'block', mb: 1.5 }}>
                New Section
              </Typography>

              {sectionError && (
                <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setSectionError(null)}>
                  {sectionError}
                </Alert>
              )}

              <Stack spacing={1.5}>
                <TextField
                  label="Section Name"
                  value={newSectionLabel}
                  onChange={(e) => setNewSectionLabel(e.target.value)}
                  size="small"
                  fullWidth
                  autoFocus
                  helperText={newSectionLabel.trim() ? `Key: ${labelToKey(newSectionLabel)}` : 'e.g. H SQD'}
                />

                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75 }}>
                    Color
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {COLOR_PALETTE.map((color) => (
                      <Tooltip key={color} title={color}>
                        <Box
                          onClick={() => setNewSectionColor(color)}
                          sx={{
                            width: 22, height: 22, borderRadius: '50%', bgcolor: color,
                            cursor: 'pointer', flexShrink: 0,
                            outline: newSectionColor === color ? '2px solid white' : '2px solid transparent',
                            outlineOffset: '2px',
                            transition: 'outline .1s',
                          }}
                        />
                      </Tooltip>
                    ))}
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={() => setShowNewSection(false)}>Cancel</Button>
                  <Button
                    size="small"
                    variant="contained"
                    disableElevation
                    disabled={!newSectionLabel.trim()}
                    loading={createSection.isPending}
                    onClick={handleSaveSection}
                  >
                    Save Section
                  </Button>
                </Box>
              </Stack>
            </Box>
          </Collapse>

          <FormControl fullWidth size="small">
            <InputLabel>Status</InputLabel>
            <Select
              value={form.status}
              label="Status"
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            >
              {STATUS_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', display: 'block', mb: 0.5 }}>
              Networks
            </Typography>
            <FormGroup row>
              {KIT_NETWORKS.map((n) => (
                <FormControlLabel
                  key={n.key}
                  control={
                    <Checkbox
                      size="small"
                      checked={form[n.key]}
                      onChange={(e) => setForm((prev) => ({ ...prev, [n.key]: e.target.checked }))}
                    />
                  }
                  label={n.label}
                  slotProps={{ typography: { variant: 'body2' } }}
                />
              ))}
            </FormGroup>
          </Box>

          <Divider />

          <TextField
            label="Assigned To"
            value={form.owner}
            onChange={set('owner')}
            fullWidth size="small"
            placeholder="e.g. SGT Smith"
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Owner Email" value={form.owner_email} onChange={set('owner_email')} fullWidth size="small" type="email" />
            <TextField label="Owner Phone" value={form.owner_phone} onChange={set('owner_phone')} fullWidth size="small" />
          </Box>

          <TextField
            label="Location"
            value={form.location}
            onChange={set('location')}
            fullWidth size="small"
            placeholder="e.g. Bldg 100, Motor Pool"
            slotProps={{ htmlInput: { maxLength: LOCATION_MAX } }}
          />

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
            helperText={`${notesCount} / ${NOTES_MAX}`}
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
            disabled={pending || deleteKit.isPending}
          >
            Delete
          </Button>
        ) : (
          <Box />
        )}
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" onClick={handleClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!form.name.trim() || notesOverLimit}
            loading={pending}
            disableElevation
            onClick={handleSubmit}
          >
            {primaryLabel}
          </Button>
        </Box>
      </Box>
      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <DialogTitle>Delete kit?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete <strong>{kit?.name}</strong>. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDeleteOpen(false)} disabled={deleteKit.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disableElevation
            onClick={handleConfirmDelete}
            loading={deleteKit.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}

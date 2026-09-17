import { useEffect, useRef, useState } from 'react';
import {
  Autocomplete,
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
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import {
  useCreateTerminal,
  useUpdateTerminal,
  useDeleteTerminal,
  useSections,
  useCreateSection,
  useTags,
} from '@/services';
import { ApiClientError } from '@/services/api-client';
import { useToast } from '@/contexts';
import type { Terminal } from '@/types';
// Status colors are hard-reserved for the stat strip and never appear in the
// section swatches; `asset-colors.test.ts` asserts that disjointness.
import { SECTION_COLOR_PALETTE as COLOR_PALETTE } from '@/theme/asset-colors';
import { POP_PIN_OPTIONS, isStarshieldModel } from './terminal-constants';
import { STATUS_OPTIONS } from './asset-status-constants';

const MODEL_OPTIONS = [
  { value: 'mini',   label: 'Mini'  },
  { value: 'hp',     label: 'HP'    },
  { value: 'hornet', label: 'Hornet'},
  { value: 'ragno',  label: 'Ragno' },
  { value: 'ow7',    label: 'OW-7'  },
  { value: 'ow10',   label: 'OW-10' },
  { value: 'ow11',   label: 'OW-11' },
];

const NOTES_MAX = 250;

// Slugify: lowercase + strip whitespace + drop non-alphanumerics.
// Hyphenless, so "H SQD" → "hsqd" (matches existing seed keys like
// "asqd"). Backend section.CreateSection runs the same normalization.
function labelToKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
}

function autoColor(existingColors: string[]): string {
  const used = new Set(existingColors);
  return COLOR_PALETTE.find((c) => !used.has(c)) ?? COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]!;
}

export type TerminalDrawerMode = 'add' | 'edit';
export type TerminalDrawerFocus = 'name' | 'notes';

interface TerminalDrawerProps {
  open: boolean;
  mode: TerminalDrawerMode;
  terminal?: Terminal;
  focusField?: TerminalDrawerFocus;
  onClose: () => void;
}

const EMPTY = {
  name: '', model: '', kit: '', pim: '', serial: '', section: '', status: 'available',
  owner: '', owner_email: '', owner_phone: '', pop_pin: '', notes: '', tag: '',
};

function terminalToForm(t: Terminal): typeof EMPTY {
  return {
    name:        t.name,
    model:       t.model ?? '',
    kit:         t.kit ?? '',
    pim:         t.pim ?? '',
    serial:      t.serial ?? '',
    section:     t.section ?? '',
    status:      t.status,
    owner:       t.owner ?? '',
    owner_email: t.owner_email ?? '',
    owner_phone: t.owner_phone ?? '',
    pop_pin:     t.pop_pin ?? '',
    notes:       t.notes ?? '',
    tag:         t.tag ?? '',
  };
}

export function TerminalDrawer({ open, mode, terminal, focusField, onClose }: TerminalDrawerProps) {
  const { data: sectionsData } = useSections();
  const sections = sectionsData ?? [];
  const createTerminal = useCreateTerminal();
  const updateTerminal = useUpdateTerminal();
  const deleteTerminal = useDeleteTerminal();
  const createSection = useCreateSection();
  // The tag catalog is the full set of tags in the system, since every terminal
  // save registers its tag there. Offering it here is what stops the same
  // operation being typed four slightly different ways.
  const { data: tagCatalog } = useTags();
  const tagOptions = (tagCatalog ?? []).map((t) => t.name);
  const { showToast } = useToast();

  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [popPinned, setPopPinned] = useState(false);

  const [showNewSection, setShowNewSection] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState('');
  const [newSectionColor, setNewSectionColor] = useState('');
  const [sectionError, setSectionError] = useState<string | null>(null);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && mode === 'edit' && terminal) {
      setForm(terminalToForm(terminal));
      setPopPinned(!!terminal.pop_pin);
    } else if (open && mode === 'add') {
      setForm(EMPTY);
      setPopPinned(false);
    }
  }, [open, mode, terminal]);

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

  const set = (field: keyof typeof EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleClose = () => {
    setForm(EMPTY);
    setError(null);
    setPopPinned(false);
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

    // An edit with no terminal must never fall through to the create below.
    // isEdit reads a missing terminal as Add mode, so before this guard an edit
    // URL the caller could not resolve created a duplicate. The caller now
    // waits for the record, and this keeps that true for any future caller.
    if (mode === 'edit' && !terminal) {
      setError('That terminal could not be loaded. Close and reopen it from the list.');
      return;
    }

    if (mode === 'edit' && terminal) {
      updateTerminal.mutate(
        {
          id: terminal.id,
          data: {
            name:        form.name.trim(),
            model:       form.model || null,
            kit:         form.kit.trim(),
            pim:         form.pim.trim(),
            serial:      form.serial.trim(),
            section:     form.section,
            status:      form.status,
            owner:       form.owner.trim(),
            owner_email: form.owner_email.trim(),
            owner_phone: form.owner_phone.trim(),
            // Send "" (not null) so the backend's nil-check fires and clears the field.
            // Backend also force-clears the pin whenever the model isn't mini/hp.
            pop_pin:     (isStarshieldModel(form.model) && popPinned && form.pop_pin) ? form.pop_pin : '',
            notes:       form.notes.trim(),
            // Send "" (not null) so the backend's nil-check fires and normalizeTag clears the field.
            tag:         form.tag.trim() || '',
          },
        },
        {
          onSuccess: () => { showToast('Terminal updated'); handleClose(); },
          onError: (err) => {
            setError(err instanceof ApiClientError ? err.message : 'Failed to update terminal.');
          },
        }
      );
      return;
    }

    createTerminal.mutate(
      {
        name:        form.name.trim(),
        model:       form.model             || undefined,
        kit:         form.kit.trim()         || undefined,
        pim:         form.pim.trim()         || undefined,
        serial:      form.serial.trim()      || undefined,
        section:     form.section            || undefined,
        status:      form.status             || undefined,
        owner:       form.owner.trim()       || undefined,
        owner_email: form.owner_email.trim() || undefined,
        owner_phone: form.owner_phone.trim() || undefined,
        pop_pin:     (isStarshieldModel(form.model) && popPinned && form.pop_pin) || undefined,
        notes:       form.notes.trim()       || undefined,
        tag:         form.tag.trim()         || undefined,
      },
      {
        onSuccess: () => { showToast('Terminal created'); handleClose(); },
        onError: (err) => {
          setError(err instanceof ApiClientError ? err.message : 'Failed to create terminal.');
        },
      }
    );
  };

  const handleConfirmDelete = () => {
    if (!terminal) return;
    deleteTerminal.mutate(terminal.id, {
      onSuccess: () => { showToast('Terminal deleted', { severity: 'info' }); handleClose(); },
      onError: (err) => {
        setConfirmDeleteOpen(false);
        setError(err instanceof ApiClientError ? err.message : 'Failed to delete terminal.');
      },
    });
  };

  const isEdit = mode === 'edit' && !!terminal;
  const title = isEdit ? 'Edit Terminal' : 'Add Terminal';
  const primaryLabel = isEdit ? 'Save Changes' : 'Add Terminal';
  const pending = createTerminal.isPending || updateTerminal.isPending;

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
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Stack spacing={2.5}>
          <TextField
            label="Terminal Name"
            value={form.name}
            onChange={set('name')}
            required
            fullWidth
            size="small"
            inputRef={nameRef}
            helperText="Required - e.g. ASQD MINI 3"
          />

          <FormControl fullWidth size="small">
            <InputLabel>Model</InputLabel>
            <Select
              value={form.model}
              label="Model"
              onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {MODEL_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 2 }}>
            {(form.model === 'hornet' || form.model === 'ragno') ? (
              <TextField label="PIM #" value={form.pim} onChange={set('pim')} fullWidth size="small" />
            ) : (
              <TextField label="Kit #" value={form.kit} onChange={set('kit')} fullWidth size="small" />
            )}
            <TextField label="Serial #" value={form.serial} onChange={set('serial')} fullWidth size="small" />
          </Box>

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
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      display: 'block',
                      mb: 0.75
                    }}>
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

          {/* PoP pin - Starshield (mini/hp) only */}
          {isStarshieldModel(form.model) && (
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={popPinned}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setPopPinned(checked);
                      if (!checked) setForm((prev) => ({ ...prev, pop_pin: '' }));
                    }}
                    size="small"
                  />
                }
                label="Is this terminal's PoP pinned?"
                slotProps={{ typography: { variant: 'body2' } }}
              />
              <Collapse in={popPinned}>
                <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                  <InputLabel>PoP Location</InputLabel>
                  <Select
                    value={form.pop_pin}
                    label="PoP Location"
                    onChange={(e) => setForm((prev) => ({ ...prev, pop_pin: e.target.value }))}
                  >
                    {POP_PIN_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {!form.pop_pin && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      display: 'block',
                      mt: 0.5,
                      ml: 1.75
                    }}>
                    Select a location. Leaving this empty saves as not pinned.
                  </Typography>
                )}
              </Collapse>
            </Box>
          )}

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

          {/* freeSolo: the catalog is a set of suggestions, not a closed list.
              Typing a brand-new tag has to keep working, and the backend
              registers it on save.

              value and inputValue are both bound to form.tag on purpose. This
              drawer is reused for every terminal rather than remounted, so
              binding only one leaves the other holding a stale value across
              opens. onChange fires for a picked option or the clear button
              (null, which becomes the "" the save path already sends to clear);
              onInputChange fires for typing. */}
          <Autocomplete
            freeSolo
            options={tagOptions}
            value={form.tag}
            inputValue={form.tag}
            onChange={(_, v) => setForm((prev) => ({ ...prev, tag: v ?? '' }))}
            onInputChange={(_, v) => setForm((prev) => ({ ...prev, tag: v }))}
            fullWidth
            size="small"
            renderInput={(params) => (
              <TextField
                {...params}
                label="Tag"
                placeholder="e.g. Operation Avalanche"
                helperText="Optional grouping label spanning sections. Pick an existing tag or type a new one. Leave blank to clear."
                // MUI v9 renderInput params carry slotProps, not InputProps or
                // inputProps - every older example on the internet writes
                // inputProps, which type-checks here, renders fine, and caps
                // nothing. params.slotProps must be spread back in: its `input`
                // entry holds the ref, the class name and the clear/popup
                // adornments, so replacing the object wholesale breaks the
                // control outright.
                slotProps={{
                  ...params.slotProps,
                  htmlInput: { ...params.slotProps.htmlInput, maxLength: 100 },
                }}
              />
            )}
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
            disabled={pending || deleteTerminal.isPending}
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
          {/*
            No `type="submit"` on purpose. This footer sits OUTSIDE the
            `component="form"` Box above, which closes before it, so a submit
            type here never had a form to submit and did nothing. Left in place
            it was a loaded gun: `onClick` already calls handleSubmit, so the
            moment anyone moved this footer inside the form, one click would run
            it twice and create two terminals. The only thing standing between
            that and a real double-create was `e.preventDefault()` happening to
            be the first statement of the handler.

            Keyboard submit is unaffected - Enter in a text field still triggers
            the form's own onSubmit.
          */}
          <Button
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
        <DialogTitle>Delete terminal?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete <strong>{terminal?.name}</strong>. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDeleteOpen(false)} disabled={deleteTerminal.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disableElevation
            onClick={handleConfirmDelete}
            loading={deleteTerminal.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}

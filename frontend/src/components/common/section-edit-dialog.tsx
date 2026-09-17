import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  CircularProgress,
  FormControlLabel,
  Switch,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import {
  useSections,
  useUpdateSection,
  useDeleteSection,
  REASSIGN_TO_NONE,
} from '@/services';
import { ApiClientError } from '@/services/api-client';
import type { Section } from '@/types';
// Shared with the terminal and kit drawers' inline section creators so edit
// and create feel like the same flow. Status colors are hard-reserved and
// never appear here; `asset-colors.test.ts` asserts that.
import { SECTION_COLOR_PALETTE as COLOR_PALETTE } from '@/theme/asset-colors';

interface SectionEditDialogProps {
  open: boolean;
  section: Section | null;
  onClose: () => void;
}

export function SectionEditDialog({ open, section, onClose }: SectionEditDialogProps) {
  const { data: sectionsData } = useSections();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();

  const [label, setLabel] = useState('');
  const [color, setColor] = useState('');
  const [paceEnabled, setPaceEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reassign dialog state - shown only after a 409 from delete.
  const [inUseCount, setInUseCount] = useState<number | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>('');

  useEffect(() => {
    if (open && section) {
      setLabel(section.label);
      setColor(section.color);
      setPaceEnabled(section.pace_enabled === true);
      setError(null);
      setInUseCount(null);
      setReassignTarget('');
    }
  }, [open, section]);

  if (!section) return null;

  const otherSections = (sectionsData ?? []).filter((s) => s.key !== section.key);

  const pending = updateSection.isPending || deleteSection.isPending;
  const hasLabelChanged = label.trim().toUpperCase() !== section.label;
  const hasColorChanged = color !== section.color;
  const hasPaceChanged = paceEnabled !== (section.pace_enabled === true);
  const hasChanges = hasLabelChanged || hasColorChanged || hasPaceChanged;

  const handleSave = () => {
    if (!section) return;
    setError(null);
    updateSection.mutate(
      {
        key: section.key,
        data: {
          ...(hasLabelChanged ? { label: label.trim() } : {}),
          ...(hasColorChanged ? { color } : {}),
          ...(hasPaceChanged ? { pace_enabled: paceEnabled } : {}),
        },
      },
      {
        onSuccess: onClose,
        onError: (err) => {
          setError(err instanceof ApiClientError ? err.message : 'Failed to save section.');
        },
      }
    );
  };

  const attemptDelete = (reassignTo?: string) => {
    if (!section) return;
    setError(null);
    deleteSection.mutate(
      { key: section.key, reassignTo },
      {
        onSuccess: (resp) => {
          if (resp.reassigned > 0) {
            // Could toast this in the future; for now close silently.
          }
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiClientError && err.code === 'SECTION_IN_USE') {
            // Backend refused because terminals still use it. Surface
            // the reassign prompt. We don't know the exact count from
            // the error alone, so show a generic prompt; if the user
            // proceeds with a reassignment the count is returned.
            setInUseCount(1); // non-zero sentinel; UI just needs "there's some"
            setError(null);
            return;
          }
          setError(err instanceof ApiClientError ? err.message : 'Failed to delete section.');
        },
      }
    );
  };

  const handleConfirmReassignAndDelete = () => {
    const target = reassignTarget || REASSIGN_TO_NONE;
    attemptDelete(target);
  };

  const isReassignPrompt = inUseCount !== null;

  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>
        {isReassignPrompt ? 'Section has terminals' : 'Edit Section'}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
        )}

        {!isReassignPrompt ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Section name"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              size="small"
              fullWidth
              autoFocus
              helperText={`Key: ${section.key} (immutable)`}
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
                {COLOR_PALETTE.map((c) => (
                  <Tooltip key={c} title={c}>
                    <Box
                      onClick={() => setColor(c)}
                      sx={{
                        width: 22, height: 22, borderRadius: '50%', bgcolor: c,
                        cursor: 'pointer', flexShrink: 0,
                        outline: color === c ? '2px solid white' : '2px solid transparent',
                        outlineOffset: '2px',
                        transition: 'outline .1s',
                      }}
                    />
                  </Tooltip>
                ))}
              </Box>
            </Box>

            {/* This used to be a hardcoded list of five in the frontend. It is a
                column now, so who runs a comms card is an operational decision
                rather than a deploy. Both surfaces hang off the one flag, which
                is why the copy names both. */}
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={paceEnabled}
                  onChange={(e) => setPaceEnabled(e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography variant="body2">PACE squadron</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Gives this section a JEM/MPU5 comms card and its own Nets library.
                  </Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', m: 0 }}
            />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Typography variant="body2">
              <strong>{section.label}</strong> still has terminals assigned to it.
              Pick where they should go, then confirm delete.
            </Typography>

            <FormControl fullWidth size="small">
              <InputLabel>Move terminals to</InputLabel>
              <Select
                value={reassignTarget}
                label="Move terminals to"
                onChange={(e) => setReassignTarget(e.target.value)}
              >
                <MenuItem value=""><em>None (leave terminals sectionless)</em></MenuItem>
                {otherSections.map((s) => (
                  <MenuItem key={s.key} value={s.key}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
                      {s.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        {!isReassignPrompt ? (
          <>
            <Button
              color="error"
              startIcon={<DeleteOutlineIcon />}
              onClick={() => attemptDelete(undefined)}
              disabled={pending}
              sx={{ mr: 'auto' }}
            >
              Delete
            </Button>
            <Button onClick={onClose} disabled={pending}>Cancel</Button>
            <Button
              variant="contained"
              disableElevation
              onClick={handleSave}
              disabled={!hasChanges || pending || !label.trim()}
              loading={updateSection.isPending}
            >
              Save
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setInUseCount(null)} disabled={pending}>
              Back
            </Button>
            <Button
              color="error"
              variant="contained"
              disableElevation
              onClick={handleConfirmReassignAndDelete}
              loading={deleteSection.isPending}
              startIcon={deleteSection.isPending ? <CircularProgress size={14} /> : <DeleteOutlineIcon />}
            >
              {reassignTarget
                ? 'Move terminals & delete'
                : 'Clear terminals & delete'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

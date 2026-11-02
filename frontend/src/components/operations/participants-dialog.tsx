import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

import { useAuth } from '@/contexts/auth-context';
import { useCreateOrganization, useDeleteParticipantById, useEquipment, usePlatforms } from '@/services';
import { errorMessage } from '@/services/api-client';
import { useToast } from '@/contexts';
import { branchChip } from '@/components/catalog/branch-colors';
import { createOrganizationRequestOf } from '@/components/catalog/organization-draft';
import type { Equipment, Operation, Participant, Platform } from '@/types';
import { keyFromName } from './organization-key';
import { participantLabel, participantSubName } from './participant-label';
import { effectiveWaveforms } from './participant-waveforms';

const LIBRARY_CHIP_TEXT = 10.5;

function joinedLine(count: number, operationName: string): string {
  if (count === 0) return 'No one has joined yet';
  return `${String(count)} ${count === 1 ? 'has' : 'have'} joined ${operationName}`;
}

/**
 * `1 platform · 2 items · 5 waveforms`. The platform term is omitted when
 * there is none, since most rows are dismounted. The waveform count is the
 * effective set - what the platforms and picked radios carry plus the
 * direct picks - so a row that picked a PRC-152 and nothing else does not
 * read "0 waveforms". The POC is not a count, so it is its own line beneath
 * rather than the fourth term, where it read as one more thing brought.
 */
function countsLine(
  p: Participant,
  equipmentById: ReadonlyMap<string, Equipment>,
  platformById: ReadonlyMap<string, Platform>,
): string {
  const nPlatforms = p.platform_ids.length;
  const platforms = nPlatforms === 0 ? '' : `${String(nPlatforms)} ${nPlatforms === 1 ? 'platform' : 'platforms'}`;
  const items = `${String(p.equipment_ids.length)} ${p.equipment_ids.length === 1 ? 'item' : 'items'}`;
  const count = effectiveWaveforms(p, equipmentById, platformById).length;
  const waveforms = `${String(count)} ${count === 1 ? 'waveform' : 'waveforms'}`;
  return [platforms, items, waveforms].filter(Boolean).join(' · ');
}

const captionLineSx = {
  fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.04em', color: 'text.secondary', mt: 0.25,
} as const;

/**
 * Who has joined an operation, as a popup from the banner. One row per
 * participant in the order given, each with its organization's colour pip,
 * label, branch and a line of what it brought. A PACE writer gets an Edit
 * (the wizard in edit mode, opened by the page) and a Remove (an X left of
 * Edit, confirmed by name, which deletes the participant row and with it its
 * phase marks, placements and requirements) per row, and Join Operation at
 * the foot; a reader gets the list and Close.
 * Remove on an Other unit also offers "Add to library and remove", which creates
 * the organization from the row's details before removing the row.
 * Clicking a row is `onOpen`: the page closes the popup and flips the Loadout
 * view to that participant's tab.
 */
export function ParticipantsDialog({ open, operation, participants, onClose, onJoin, onEdit, onOpen }: {
  open: boolean;
  operation: Operation;
  participants: Participant[];
  onClose: () => void;
  onJoin: () => void;
  onEdit: (participant: Participant) => void;
  onOpen: (participant: Participant) => void;
}) {
  const { canWritePace } = useAuth();
  const { data: eqData } = useEquipment();
  const { data: plData } = usePlatforms();
  const equipmentById = useMemo(() => new Map((eqData?.equipment ?? []).map((e) => [e.id, e])), [eqData]);
  const platformById = useMemo(() => new Map((plData?.platforms ?? []).map((pl) => [pl.id, pl])), [plData]);
  const removeParticipant = useDeleteParticipantById();
  const createOrganization = useCreateOrganization();
  const { showToast } = useToast();
  const [removing, setRemoving] = useState<Participant | null>(null);
  const [removeError, setRemoveError] = useState('');

  const askRemove = (p: Participant) => { setRemoveError(''); setRemoving(p); };
  const cancelRemove = () => { if (!removeParticipant.isPending && !createOrganization.isPending) setRemoving(null); };
  const confirmRemove = (message?: string) => {
    if (!removing) return;
    const label = participantLabel(removing);
    removeParticipant.mutate({ operationId: operation.id, participantId: removing.id }, {
      onSuccess: () => {
        setRemoving(null);
        showToast(message ?? `Removed ${label} from ${operation.name}`);
      },
      onError: (err) => { setRemoveError(errorMessage(err, `Could not remove ${label}`)); },
    });
  };
  // Create the organization from the row's own details, then remove the row.
  // A create that fails (a key that exists is a 409) removes nothing.
  const addToLibraryAndRemove = async () => {
    if (!removing) return;
    const label = participantLabel(removing);
    const o = removing.organization;
    setRemoveError('');
    try {
      await createOrganization.mutateAsync(createOrganizationRequestOf({
        key: keyFromName(o.name), name: o.name, short_label: o.short_label, branch: o.branch,
        color: o.color, section_key: '', notes: '',
      }));
    } catch (err) {
      setRemoveError(errorMessage(err, `Could not add ${label} to the library`));
      return;
    }
    confirmRemove(`Added ${label} to the library and removed it from ${operation.name}`);
  };
  const busy = removeParticipant.isPending || createOrganization.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        component="div"
        sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, pb: 1 }}
      >
        <Box>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            Participants
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {joinedLine(participants.length, operation.name)}
          </Typography>
        </Box>
        <IconButton aria-label="close" onClick={onClose} size="small" sx={{ flexShrink: 0 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ py: 1 }}>
        {participants.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 2, textAlign: 'center' }}>
            No one has joined yet.
          </Typography>
        ) : (
          <List
            disablePadding
            sx={(t) => ({
              // Two columns from the medium width up, filled down the first column
              // then the second, so a roster of thirteen units is seen whole at the
              // 810px laptop height instead of scrolled; one column below that.
              display: 'grid',
              gridTemplateColumns: '1fr',
              gridAutoFlow: 'row',
              [t.breakpoints.up('md')]: {
                gridTemplateColumns: '1fr 1fr',
                gridTemplateRows: `repeat(${String(Math.ceil(participants.length / 2))}, auto)`,
                gridAutoFlow: 'column',
                // No rule down the gap: one was tried at two shades and read as
                // clutter beside the row dividers (maintainer, 10-19). The gap is the divider.
                columnGap: 4,
              },
            })}
          >
            {participants.map((p) => {
              const o = p.organization;
              const label = participantLabel(p);
              return (
                <ListItem
                  key={p.id}
                  disablePadding
                  divider
                  secondaryAction={canWritePace ? (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" aria-label={`Remove ${label}`} onClick={() => { askRemove(p); }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" aria-label={`Edit ${label}`} onClick={() => { onEdit(p); }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : undefined}
                >
                  {/* The row itself opens the unit's tab: a button, so it is
                      reachable and activated from the keyboard, with Edit
                      beside it rather than inside it. */}
                  <ListItemButton
                    aria-label={`Open ${label}`}
                    onClick={() => { onOpen(p); }}
                    sx={{ alignItems: 'center', gap: 1.5, py: 1, px: 0 }}
                  >
                    <Box
                      data-testid="participant-pip"
                      sx={{
                        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                        bgcolor: o.color || 'primary.main',
                      }}
                    />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography
                          component="span"
                          sx={{
                            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                          }}
                        >
                          {label}
                        </Typography>
                        {participantSubName(p) && (
                          <Typography component="span" sx={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'text.secondary' }}>
                            {participantSubName(p)}
                          </Typography>
                        )}
                        {o.branch && <span style={branchChip(o.branch, LIBRARY_CHIP_TEXT)}>{o.branch}</span>}
                      </Box>
                      <Typography component="div" sx={captionLineSx}>
                        {countsLine(p, equipmentById, platformById)}
                      </Typography>
                      {p.poc_name && (
                        <Typography component="div" sx={captionLineSx}>
                          {`POC: ${p.poc_name}`}
                        </Typography>
                      )}
                    </Box>
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        {canWritePace && (
          <Button variant="contained" disableElevation startIcon={<PersonAddIcon />} onClick={onJoin}>
            Join Operation
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      <Dialog open={removing !== null} onClose={cancelRemove} maxWidth="xs" fullWidth aria-labelledby="remove-participant-title">
        {/* Short on purpose: Remove is read in the second before it is pressed.
            The name goes in the title, one line says what leaves with it, and an
            Other unit gets one question, by name, and a button that answers it. */}
        <DialogTitle id="remove-participant-title">{removing ? `Remove ${participantLabel(removing)}?` : 'Remove'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Its gear, locations and must-talk pairs go with it.
          </Typography>
          {removing?.organization.adhoc && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              {`${removing.organization.name || participantLabel(removing)} isn't currently in the library, add for future use?`}
            </Typography>
          )}
          {removeError && (
            <Typography role="alert" variant="body2" sx={{ color: 'error.main', mt: 1 }}>{removeError}</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={cancelRemove} disabled={busy}>Cancel</Button>
          {removing?.organization.adhoc && (
            <Button variant="outlined" onClick={() => { void addToLibraryAndRemove(); }} disabled={busy}>
              Add to library and remove
            </Button>
          )}
          <Button variant="contained" color="error" disableElevation onClick={() => { confirmRemove(); }} disabled={busy}>
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

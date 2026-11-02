import { useEffect, useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  TextField,
  Button,
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
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import {
  useCreateOperation,
  useUpdateOperation,
  useDeleteOperation,
  useSaveOperationPhases,
  useSaveOperationSites,
} from '@/services';
import { ApiClientError, errorMessage } from '@/services/api-client';
import { useToast } from '@/contexts';
import { isPresent } from '@/components/operations/interop-model';
import { nextPhaseName } from '@/components/operations/phase-marks';
import type { Operation, Participant, Phase, Site } from '@/types';

const NAME_MAX = 120;
// Mirrors the `max=` tag on the operation DTOs; the server upper-cases it.
const ACRONYM_MAX = 20;
const NOTES_MAX = 4000;
// Mirrors the phase name limit in operation/phases.go.
const PHASE_NAME_MAX = 60;
// Mirrors MaxSiteNameLength in operation/model.go.
const SITE_NAME_MAX = 60;

const NO_PHASES: Phase[] = [];
const NO_SITES: Site[] = [];
const NO_PARTICIPANTS: Participant[] = [];

/** One row of the phase list as edited: `id` is the stored phase, absent for one added here. */
interface PhaseDraft {
  /** Stable across renames and reorders, so a row keeps its input. */
  key: string;
  id?: string;
  name: string;
}

let newPhaseKey = 0;

const phaseDraftOf = (phases: Phase[]): PhaseDraft[] => phases.map(({ id, name }) => ({ key: id, id, name }));


/** Whether the list differs from what is stored, in rows, order or names. */
function phasesChanged(draft: PhaseDraft[], phases: Phase[]): boolean {
  return draft.length !== phases.length
    || draft.some((ph, i) => ph.id !== phases[i]?.id || ph.name.trim() !== phases[i]?.name);
}

/** What the server would refuse, said before it is asked. */
function phaseProblem(draft: PhaseDraft[]): string | null {
  if (draft.some((ph) => ph.name.trim() === '')) return 'Every phase needs a name';
  const names = draft.map((ph) => ph.name.trim().toLowerCase());
  return new Set(names).size === names.length ? null : 'Two phases have the same name';
}

/** One row of the location list as edited, the same shape as a phase row. */
interface SiteDraft {
  key: string;
  id?: string;
  name: string;
}

let newSiteKey = 0;

const siteDraftOf = (sites: Site[]): SiteDraft[] => sites.map(({ id, name }) => ({ key: id, id, name }));

/** Whether the list differs from what is stored, in rows, order or names. */
function sitesChanged(draft: SiteDraft[], sites: Site[]): boolean {
  return draft.length !== sites.length
    || draft.some((s, i) => s.id !== sites[i]?.id || s.name.trim() !== sites[i]?.name);
}

/** What the server would refuse, said before it is asked. Zero locations is allowed. */
function siteProblem(draft: SiteDraft[]): string | null {
  if (draft.some((s) => s.name.trim() === '')) return 'Every location needs a name';
  const names = draft.map((s) => s.name.trim().toLowerCase());
  return new Set(names).size === names.length ? null : 'Two locations have the same name';
}

/** The next "Location N" no row is already using, so Add never starts on a duplicate. */
function nextSiteName(draft: { name: string }[]): string {
  const used = new Set(draft.map((s) => s.name.trim().toLowerCase()));
  let n = draft.length + 1;
  while (used.has(`location ${String(n)}`)) n += 1;
  return `Location ${String(n)}`;
}

/** How many unit placements, across all phases, are at a location. */
function placementsAt(phases: Phase[], siteId: string): number {
  return phases.reduce((n, ph) => n + Object.values(ph.placements).filter((id) => id === siteId).length, 0);
}

/** How many asset marks, across how many organizations, a phase carries. */
function marksIn(participants: Participant[], phaseId: string): { marks: number; organizations: number } {
  let marks = 0;
  let organizations = 0;
  for (const p of participants) {
    const n = [...p.platform_ids, ...p.equipment_ids, ...p.transport_ids].filter((id) => isPresent(p, id, phaseId)).length;
    marks += n;
    if (n > 0) organizations += 1;
  }
  return { marks, organizations };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface OperationDrawerProps {
  open: boolean;
  /** The operation being edited; absent means add. */
  operation?: Operation;
  /**
   * The operation's phases, in order. Edit mode lists them for editing; add
   * mode has none, because the server seeds the first set on create.
   */
  phases?: Phase[];
  /**
   * The operation's locations, in order, edited beside the phases. Their
   * placements live on the phases, so removing a location can say how many go.
   */
  sites?: Site[];
  /** The rows on the operation, so removing a phase can say how many asset marks go with it. */
  participants?: Participant[];
  onClose: () => void;
  /** Called after a successful create, update or delete, before `onClose`. */
  onSaved?: () => void;
  /**
   * Called after a successful delete only, before `onSaved`. The operation
   * page hosts this drawer and has nothing left to show once its operation is
   * gone, so it needs to tell a delete from an update to leave for the picker.
   */
  onDeleted?: () => void;
}

/**
 * No status and no dates: the server keeps a status and defaults it, and the
 * app shows neither it nor a date range anywhere. The acronym labels the
 * picker tile when set; see `operationTitle`. Everywhere else is the name.
 */
interface FormState {
  name: string;
  acronym: string;
  notes: string;
}

const EMPTY: FormState = { name: '', acronym: '', notes: '' };

function operationToForm(op: Operation): FormState {
  return {
    name: op.name,
    acronym: op.acronym,
    notes: op.notes,
  };
}

export function OperationDrawer({ open, operation, phases = NO_PHASES, sites = NO_SITES, participants = NO_PARTICIPANTS, onClose, onSaved, onDeleted }: OperationDrawerProps) {
  const createOperation = useCreateOperation();
  const updateOperation = useUpdateOperation();
  const deleteOperation = useDeleteOperation();
  const savePhases = useSaveOperationPhases();
  const saveSites = useSaveOperationSites();
  const { showToast } = useToast();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [phaseDraft, setPhaseDraft] = useState<PhaseDraft[]>([]);
  const [siteDraft, setSiteDraft] = useState<SiteDraft[]>([]);
  // The row a remove click is waiting on, while the confirm names what goes with it.
  const [removeAt, setRemoveAt] = useState<number | null>(null);
  const [removeSiteAt, setRemoveSiteAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (open) setForm(operation ? operationToForm(operation) : EMPTY);
    setError(null);
  }, [open, operation]);

  // Its own effect, keyed on the phases and not the operation: saving the
  // operation refetches it, and a phase list that failed to save must survive
  // that refetch so the user can correct it rather than retype it.
  useEffect(() => {
    if (open) setPhaseDraft(phaseDraftOf(phases));
    setRemoveAt(null);
  }, [open, phases]);

  // And the same for the locations, for the same reason.
  useEffect(() => {
    if (open) setSiteDraft(siteDraftOf(sites));
    setRemoveSiteAt(null);
  }, [open, sites]);

  const set =(field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleClose = () => {
    setForm(EMPTY);
    setPhaseDraft([]);
    setSiteDraft([]);
    setRemoveAt(null);
    setRemoveSiteAt(null);
    setError(null);
    setConfirmDeleteOpen(false);
    onClose();
  };

  const done = () => {
    onSaved?.();
    handleClose();
  };

  const isEdit = !!operation;
  const pending = createOperation.isPending || updateOperation.isPending || savePhases.isPending || saveSites.isPending;
  const notesOverLimit = form.notes.length > NOTES_MAX;
  const canSubmit = form.name.trim() !== '' && !notesOverLimit;
  const phasesDirty = isEdit && phasesChanged(phaseDraft, phases);
  const sitesDirty = isEdit && sitesChanged(siteDraft, sites);

  const movePhase = (index: number, step: -1 | 1) => {
    setPhaseDraft((list) => {
      const to = index + step;
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[index], next[to]] = [next[to] as PhaseDraft, next[index] as PhaseDraft];
      return next;
    });
  };
  const renamePhase = (index: number, name: string) =>
    setPhaseDraft((list) => list.map((ph, i) => (i === index ? { ...ph, name } : ph)));
  const addPhase = () => {
    newPhaseKey += 1;
    setPhaseDraft((list) => [...list, { key: `new-${newPhaseKey}`, name: nextPhaseName(list) }]);
  };
  const dropPhase = (index: number) => {
    setPhaseDraft((list) => list.filter((_, i) => i !== index));
    setRemoveAt(null);
  };
  // A phase added in this session has no marks anywhere, so it goes at once;
  // a stored one that any asset is marked in asks first.
  const requestRemove = (index: number) => {
    const ph = phaseDraft[index];
    if (ph?.id && marksIn(participants, ph.id).marks > 0) setRemoveAt(index);
    else dropPhase(index);
  };
  const removing = removeAt === null ? undefined : phaseDraft[removeAt];
  const removingMarks = removing?.id ? marksIn(participants, removing.id) : { marks: 0, organizations: 0 };

  const moveSite = (index: number, step: -1 | 1) => {
    setSiteDraft((list) => {
      const to = index + step;
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[index], next[to]] = [next[to] as SiteDraft, next[index] as SiteDraft];
      return next;
    });
  };
  const renameSite = (index: number, name: string) =>
    setSiteDraft((list) => list.map((s, i) => (i === index ? { ...s, name } : s)));
  const addSite = () => {
    newSiteKey += 1;
    setSiteDraft((list) => [...list, { key: `new-${String(newSiteKey)}`, name: nextSiteName(list) }]);
  };
  const dropSite = (index: number) => {
    setSiteDraft((list) => list.filter((_, i) => i !== index));
    setRemoveSiteAt(null);
  };
  // A location added in this session has no placements, so it goes at once;
  // a stored one that any unit is placed at asks first.
  const requestRemoveSite = (index: number) => {
    const s = siteDraft[index];
    if (s?.id && placementsAt(phases, s.id) > 0) setRemoveSiteAt(index);
    else dropSite(index);
  };
  const removingSite = removeSiteAt === null ? undefined : siteDraft[removeSiteAt];
  const removingPlacements = removingSite?.id ? placementsAt(phases, removingSite.id) : 0;

  const phasesErrorMessage = (err: unknown) =>
    err instanceof ApiClientError && err.code === 'OPERATION_PHASE_NAME_EXISTS'
      ? 'Two phases have the same name'
      : errorMessage(err, 'Failed to save phases.');

  const sitesErrorMessage = (err: unknown) =>
    err instanceof ApiClientError && err.code === 'OPERATION_SITE_NAME_EXISTS'
      ? 'Two locations have the same name'
      : errorMessage(err, 'Failed to save locations.');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    const problem = (phasesDirty ? phaseProblem(phaseDraft) : null) ?? (sitesDirty ? siteProblem(siteDraft) : null);
    if (problem) {
      setError(problem);
      return;
    }

    // Upper-cased here as well as on the server, so what the request carries
    // is what the field showed.
    const data = {
      name: form.name.trim(),
      acronym: form.acronym.trim().toUpperCase(),
      notes: form.notes.trim(),
    };

    if (operation) {
      // The phases go second and the locations third, each only when it
      // changed, so an edit that never touched them sends the one PATCH it
      // always did. If a PUT fails the earlier saves have landed and the
      // drawer stays open on the list that failed.
      const finish = () => { showToast('Operation updated'); done(); };
      const saveSitesStep = () => {
        if (!sitesDirty) {
          finish();
          return;
        }
        saveSites.mutate(
          {
            operationId: operation.id,
            data: { sites: siteDraft.map((s) => (s.id ? { id: s.id, name: s.name.trim() } : { name: s.name.trim() })) },
          },
          { onSuccess: finish, onError: (err) => setError(sitesErrorMessage(err)) },
        );
      };
      updateOperation.mutate(
        { id: operation.id, data },
        {
          onSuccess: () => {
            if (!phasesDirty) {
              saveSitesStep();
              return;
            }
            savePhases.mutate(
              {
                operationId: operation.id,
                data: { phases: phaseDraft.map((ph) => (ph.id ? { id: ph.id, name: ph.name.trim() } : { name: ph.name.trim() })) },
              },
              { onSuccess: saveSitesStep, onError: (err) => setError(phasesErrorMessage(err)) },
            );
          },
          onError: (err) => setError(errorMessage(err, 'Failed to update operation.')),
        },
      );
      return;
    }

    createOperation.mutate(data, {
      onSuccess: () => { showToast('Operation created'); done(); },
      onError: (err) => setError(errorMessage(err, 'Failed to create operation.')),
    });
  };

  const handleConfirmDelete = () => {
    if (!operation) return;
    deleteOperation.mutate(operation.id, {
      onSuccess: () => { showToast('Operation deleted', { severity: 'info' }); onDeleted?.(); done(); },
      onError: (err) => {
        setConfirmDeleteOpen(false);
        setError(errorMessage(err, 'Failed to delete operation.'));
      },
    });
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      slotProps={{ paper: { sx: { width: 440, bgcolor: 'background.paper' } } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {isEdit ? 'Edit Operation' : 'Add Operation'}
        </Typography>
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
            label="Name"
            value={form.name}
            onChange={set('name')}
            required
            fullWidth size="small"
            slotProps={{ htmlInput: { maxLength: NAME_MAX } }}
          />

          <TextField
            label="Acronym"
            value={form.acronym}
            onChange={set('acronym')}
            fullWidth size="small"
            helperText="Shown in place of the name, e.g. OMS"
            slotProps={{
              htmlInput: { maxLength: ACRONYM_MAX, style: { textTransform: 'uppercase' } },
            }}
          />

          <TextField
            label="Notes"
            value={form.notes}
            onChange={set('notes')}
            fullWidth size="small"
            multiline rows={4}
            slotProps={{ htmlInput: { maxLength: NOTES_MAX } }}
            error={notesOverLimit}
            helperText={`${form.notes.length} / ${NOTES_MAX}`}
          />

          {/* Phases: the operation's stages, in order, edited as one list and
              saved with the rest of the drawer. Add mode has none, because
              the server seeds the first set when it creates the operation. */}
          {isEdit && (
            <Box role="group" aria-label="Phases">
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Phases</Typography>
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
                A new phase starts with the same assets as the one before it.
              </Typography>
              <Stack spacing={1}>
                {phaseDraft.map((ph, i) => (
                  <Box key={ph.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TextField
                      value={ph.name}
                      onChange={(e) => renamePhase(i, e.target.value)}
                      fullWidth size="small"
                      slotProps={{ htmlInput: { maxLength: PHASE_NAME_MAX, 'aria-label': `Phase ${i + 1} name` } }}
                    />
                    <IconButton size="small" aria-label={`Move phase ${i + 1} up`} disabled={i === 0} onClick={() => movePhase(i, -1)}>
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" aria-label={`Move phase ${i + 1} down`} disabled={i === phaseDraft.length - 1} onClick={() => movePhase(i, 1)}>
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label={`Remove phase ${i + 1}`}
                      title={phaseDraft.length <= 1 ? 'An operation needs at least one phase' : undefined}
                      disabled={phaseDraft.length <= 1}
                      onClick={() => requestRemove(i)}
                    >
                      <CloseOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addPhase} sx={{ mt: 1 }}>
                Add phase
              </Button>
            </Box>
          )}

          {/* Locations: the physical places units sit (ISB, FSB, MSS, the X),
              edited as one list like the phases. Which unit is where, phase
              by phase, is planned on the Web view, not here; none is fine. */}
          {isEdit && (
            <Box role="group" aria-label="Locations">
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Locations</Typography>
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
                Where units sit, such as ISB, FSB or the X. Each phase places its units at them.
              </Typography>
              <Stack spacing={1}>
                {siteDraft.map((s, i) => (
                  <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TextField
                      value={s.name}
                      onChange={(e) => renameSite(i, e.target.value)}
                      fullWidth size="small"
                      slotProps={{ htmlInput: { maxLength: SITE_NAME_MAX, 'aria-label': `Location ${i + 1} name` } }}
                    />
                    <IconButton size="small" aria-label={`Move location ${i + 1} up`} disabled={i === 0} onClick={() => moveSite(i, -1)}>
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" aria-label={`Move location ${i + 1} down`} disabled={i === siteDraft.length - 1} onClick={() => moveSite(i, 1)}>
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" aria-label={`Remove location ${i + 1}`} onClick={() => requestRemoveSite(i)}>
                      <CloseOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addSite} sx={{ mt: 1 }}>
                Add location
              </Button>
            </Box>
          )}
        </Stack>
      </Box>
      <Divider />
      <Box sx={{ px: 3, py: 2, display: 'flex', gap: 1.5, justifyContent: 'space-between', alignItems: 'center' }}>
        {isEdit ? (
          <Button
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={pending || deleteOperation.isPending}
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
            disabled={!canSubmit}
            loading={pending}
            disableElevation
            onClick={handleSubmit}
          >
            Save
          </Button>
        </Box>
      </Box>
      <Dialog open={removing !== undefined} onClose={() => setRemoveAt(null)}>
        <DialogTitle>Remove phase?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{removing?.name.trim() || 'This phase'}</strong> has {plural(removingMarks.marks, 'asset mark', 'asset marks')} across{' '}
            {plural(removingMarks.organizations, 'organization', 'organizations')}. They go with it when you save.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRemoveAt(null)}>Cancel</Button>
          <Button color="error" variant="contained" disableElevation onClick={() => { if (removeAt !== null) dropPhase(removeAt); }}>
            Remove
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={removingSite !== undefined} onClose={() => setRemoveSiteAt(null)}>
        <DialogTitle>Remove location?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{removingSite?.name.trim() || 'This location'}</strong> has {plural(removingPlacements, 'placement', 'placements')}.
            They go with it when you save, and those units show under No location.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRemoveSiteAt(null)}>Cancel</Button>
          <Button color="error" variant="contained" disableElevation onClick={() => { if (removeSiteAt !== null) dropSite(removeSiteAt); }}>
            Remove
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <DialogTitle>Delete operation?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete <strong>{operation ? operation.name : ''}</strong> and its participants. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDeleteOpen(false)} disabled={deleteOperation.isPending}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disableElevation
            onClick={handleConfirmDelete}
            loading={deleteOperation.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}

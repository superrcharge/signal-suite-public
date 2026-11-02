import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CloseIcon from '@mui/icons-material/Close';

import {
  useOrganizations, useSections, useCreateOrganization,
  useEquipment, usePlatforms, useTransports,
  useCreateParticipant, useUpdateParticipantById, useSavePhasePlan, useSaveOperationSites,
} from '@/services';
import { errorMessage } from '@/services/api-client';
import { inputSty, onBlur, onFocus, textareaSty } from '@/components/shf-form/styles';
import { chipSty, chipToggleSty } from '@/components/catalog/chip-styles';
import { ChipRow } from '@/components/catalog/chip-row';
import { branchChip, branchFilterSty, branchToggleSty } from '@/components/catalog/branch-colors';
import { OrganizationFields } from '@/components/operations/organization-fields';
import {
  EMPTY_ORGANIZATION_DRAFT, createOrganizationRequestOf, organizationDraftComplete,
} from '@/components/catalog/organization-draft';
import type { OrganizationDraft } from '@/components/catalog/organization-draft';
import { SECTION_COLOR_PALETTE } from '@/theme/asset-colors';
import { BRANCHES, BRANCH_NAMES, PLATFORM_TYPES, platformTypeLabel } from '@/types';
import type {
  AdhocOrganization, CreateParticipantRequest, Equipment, Operation, Organization, Participant, Phase, Platform, Site, Transport,
  UpdateParticipantRequest,
} from '@/types';
import { CatalogPicker } from './catalog-picker';
import { effectiveWaveforms, equipmentWaveforms } from './participant-waveforms';
import { phaseCaption } from './phase-marks';
import { TransportStrip } from './pick-strips';
import { FilterCheck } from './filter-check';
import { brightLabelSty, equipmentLabel, FILTER_CHIP_TEXT, filterChipSty, norm, noteSty, transportLabel, trayLabelSty, WIZARD_INK, WIZARD_SOFT_INK } from './pick-strip-styles';
import { DRAFT_UNIT_ID, usePhaseRows } from './use-phase-rows';
import type { PhaseRow } from './use-phase-rows';
import { PhasesReview, PhasesStep } from './wizard-phases-step';
import { changedPlans, presentInPhase } from './wizard-phase-plan';
import type { PhaseChoice } from './wizard-phase-plan';

// Mirrors the `max=` tags on the participant and adhoc DTOs in
// operation/dto/request.go. Capped as typed rather than caught at save, for
// the reason the platform pane gives: the server 400s on a longer value, and
// a limit the user only meets on Join reads as the form having eaten their text.
const POC_NAME_MAX = 120;
const POC_PHONE_MAX = 40;
const POC_EMAIL_MAX = 255;
const NOTES_MAX = 4000;
const OTHER_NAME_MAX = 120;
const OTHER_SHORT_LABEL_MAX = 20;

const LIBRARY_CHIP_TEXT = 10.5;

const JOIN_STEPS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type JoinStep = (typeof JOIN_STEPS)[number];

const STEP_LABELS: Record<JoinStep, string> = {
  1: '1 Organization',
  2: '2 Platform',
  3: '3 Equipment',
  4: '4 Gear & phases',
  5: '5 Transports',
  6: '6 Comms links',
  7: '7 Contact',
  8: '8 Review',
};

const EMPTY_OTHER: AdhocOrganization = { name: '', short_label: '', branch: '', color: '' };

/**
 * The whole wizard's working copy, so one reset on open clears every step.
 * No direct waveform or service picks: since 2026-10-09 an organization's
 * waveforms and services are what its platforms and equipment carry, and
 * the only thing picked by hand past the assets is a transport. The API
 * fields stay, so `picksOf` sends them empty, and `effectiveWaveforms`
 * still unions whatever an older row stored.
 */
interface JoinDraft {
  /** A library organization's key, or "" when Other names the organization or nothing does yet. */
  organization_key: string;
  other: AdhocOrganization;
  /** Empty means dismounted. */
  platform_ids: string[];
  equipment_ids: string[];
  transport_ids: string[];
  /**
   * Asset id to the phase ids it is in, for the assets picked. A picked asset
   * with no key is in every phase, which is also where a fresh pick starts, so
   * unpicking drops the key and a later re-pick starts over.
   */
  asset_phases: Record<string, string[]>;
  poc_name: string;
  poc_phone: string;
  poc_email: string;
  notes: string;
  /** The row's `updated_at` as read when the wizard opened, sent as the lock; empty outside edit mode. */
  expected_updated_at: string;
}

const EMPTY_DRAFT: JoinDraft = {
  organization_key: '',
  other: EMPTY_OTHER,
  platform_ids: [], equipment_ids: [], transport_ids: [],
  asset_phases: {},
  poc_name: '', poc_phone: '', poc_email: '', notes: '',
  expected_updated_at: '',
};

const NO_PHASES: Phase[] = [];

function withoutKeys(marks: Record<string, string[]>, ids: string[]): Record<string, string[]> {
  return Object.fromEntries(Object.entries(marks).filter(([id]) => !ids.includes(id)));
}

function draftOf(p: Participant): JoinDraft {
  const picked = new Set([...p.platform_ids, ...p.equipment_ids, ...p.transport_ids]);
  return {
    organization_key: p.organization_key,
    other: p.organization.adhoc
      ? { name: p.organization.name, short_label: p.organization.short_label, branch: p.organization.branch, color: p.organization.color }
      : EMPTY_OTHER,
    platform_ids: [...p.platform_ids],
    equipment_ids: [...p.equipment_ids],
    transport_ids: [...p.transport_ids],
    asset_phases: Object.fromEntries(Object.entries(p.asset_phases ?? {}).filter(([id]) => picked.has(id))),
    poc_name: p.poc_name,
    poc_phone: p.poc_phone,
    poc_email: p.poc_email,
    notes: p.notes,
    expected_updated_at: p.updated_at,
  };
}

/**
 * The lists and contact fields, trimmed; what both the POST and the PATCH
 * carry. The abbrev lists go empty on purpose: the id-keyed PATCH replaces
 * every list with what is sent, and a saved row's old direct picks are
 * cleared by its next edit rather than carried forward unseen.
 *
 * The phase map is sent, for every picked asset and with phase ids in
 * position order, only when the operation has phases: an operation without
 * any has nothing to say, and an absent map leaves a stored one unchanged.
 */
function picksOf(d: JoinDraft, phaseIds: string[]): UpdateParticipantRequest {
  const assetPhases = phaseIds.length === 0 ? {} : {
    asset_phases: Object.fromEntries(
      [...d.platform_ids, ...d.equipment_ids, ...d.transport_ids].map((id) => {
        const marked = d.asset_phases[id];
        return [id, marked === undefined ? [...phaseIds] : phaseIds.filter((x) => marked.includes(x))];
      }),
    ),
  };
  return {
    platform_ids: [...d.platform_ids],
    equipment_ids: [...d.equipment_ids],
    waveform_abbrevs: [],
    service_abbrevs: [],
    transport_ids: [...d.transport_ids],
    ...assetPhases,
    poc_name: d.poc_name.trim(),
    poc_phone: d.poc_phone.trim(),
    poc_email: d.poc_email.trim(),
    notes: d.notes.trim(),
  };
}

/**
 * The draft as a participant, for the Phases step: which phases the unit is in
 * and how it stands against the others are read off its picked ids and phase
 * marks, exactly as the board will read the saved row. An unsaved join has no
 * row yet, so it is a blank one carrying the chosen organization.
 */
function draftUnitOf(d: JoinDraft, base: Participant | undefined, operationId: string, chosenOrg: Organization | undefined): Participant {
  const picks = { platform_ids: d.platform_ids, equipment_ids: d.equipment_ids, transport_ids: d.transport_ids, asset_phases: d.asset_phases };
  if (base) return { ...base, ...picks };
  const organization = chosenOrg
    ? { key: chosenOrg.key, name: chosenOrg.name, short_label: chosenOrg.short_label, branch: chosenOrg.branch, color: chosenOrg.color, adhoc: false }
    : { key: '', ...d.other, adhoc: true };
  return {
    id: DRAFT_UNIT_ID, operation_id: operationId, organization_key: d.organization_key, organization,
    ...picks, waveform_abbrevs: [], service_abbrevs: [],
    poc_name: '', poc_phone: '', poc_email: '', notes: '',
    created_by: '', updated_by: '', created_at: '', updated_at: '',
  };
}

/** Step 1 is satisfied by a library organization or a named Other, never both. */
function identityChosen(d: JoinDraft): boolean {
  return d.organization_key !== '' || d.other.name.trim() !== '';
}

/**
 * The wizard's box is anchored to the top and a fixed width, so the title and
 * the step strip sit in the same place on every step and on every screen:
 * only the bottom edge follows the content. Past the viewport the paper stops
 * 32px short of the bottom and the content area scrolls inside it, with the
 * title, the strip and the action row staying put. 1200px is the width the
 * dialog already had at a 1280px viewport; `maxWidth` only bites below 1264px.
 */
const DIALOG_MARGIN = 32;
const DIALOG_ANCHOR_SX = {
  '& .MuiDialog-container': { alignItems: 'flex-start' },
  '& .MuiDialog-paper': {
    width: 1200,
    maxWidth: `calc(100vw - ${DIALOG_MARGIN * 2}px)`,
    margin: `${DIALOG_MARGIN}px`,
    maxHeight: `calc(100vh - ${DIALOG_MARGIN * 2}px)`,
    // The paper scrolls vertically only. MUI leaves it `overflow: auto` on
    // both axes, so anything laid over a field from outside the app (a
    // browser extension's badge, drawn wider than the paper once a couple of
    // words are typed) grew a horizontal scrollbar along the bottom edge that
    // stayed after the text was deleted. Nothing in the wizard is meant to be
    // wider than the paper, so clipping that axis costs nothing.
    overflowX: 'hidden',
  },
} as const;


const captionSty: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 11.5, color: WIZARD_SOFT_INK };

/**
 * One tile of the step strip. The tiles are coloured in as the wizard
 * progresses: every step up to and including the current one is the
 * amber-filled toggle, and a step ahead is the same tile outlined in amber,
 * since the resting toggle's graphite border all but vanishes on the
 * dialog surface. The current
 * step is told apart from the ones behind it by a bold weight and a thin
 * paper ring drawn outside the tile, so it is the tile's outermost edge rather
 * than a line inside the amber.
 */
function stepTileSty(s: JoinStep, current: JoinStep): CSSProperties {
  if (s > current) return { ...chipToggleSty(false, true), border: '1px solid var(--shf-amber)', color: 'var(--shf-amber)' };
  const filled = chipToggleSty(true, true);
  return s === current
    ? { ...filled, fontWeight: 700, boxShadow: '0 0 0 2px var(--shf-paper)' }
    : filled;
}

/** The glyph between two consecutive step tiles. Decorative: the order is in the numbers. */
const chevronSty: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 14, lineHeight: 1, color: 'var(--shf-graphite-400)', userSelect: 'none',
};
const monoCaptionSty: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: WIZARD_INK, fontWeight: 700, whiteSpace: 'nowrap' };

/**
 * One selectable row in the step 1 list. A plain button, pressed when it is
 * the choice, with the organization pane's colour pip and branch chip.
 */
function rowSty(pressed: boolean, disabled: boolean): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', boxSizing: 'border-box', padding: '8px 12px', textAlign: 'left',
    background: pressed ? 'var(--shf-graphite-700)' : 'transparent',
    color: 'var(--shf-paper)',
    border: `1px solid ${pressed ? 'var(--shf-amber)' : 'var(--shf-graphite-700)'}`,
    borderRadius: 2,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    font: 'inherit',
  };
}

const pipSty = (color: string): CSSProperties => ({
  display: 'block', width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
  background: color || 'transparent',
  border: color ? 0 : '1px solid var(--shf-graphite-600)',
});

const shortLabelSty: CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--shf-paper)', minWidth: 72,
};

const panelSty: CSSProperties = {
  padding: '10px 12px 12px', marginTop: -1,
  border: '1px solid var(--shf-graphite-700)', borderTop: 0, borderRadius: '0 0 2px 2px',
  background: 'var(--shf-graphite-800)',
};

/**
 * The Join Operation wizard. Eight steps: who, what platform it arrives on,
 * what equipment, the gear's phases, transports, where it sits and who it must
 * talk to in each phase, who to call, and a review. Step 1 is
 * the gate - nothing past it opens until an organization is named - and Join
 * is offered on step 1 as well, so a unit that only knows it is coming can
 * check in now and fill the rest in later from the same dialog in edit mode.
 * Platform comes before equipment because a platform carries its own
 * waveforms and radios: declaring an airframe first means step 4 can show
 * what the organization already has before it adds anything by hand.
 *
 * Create mode POSTs a new participant, keyed either by a library organization
 * or by an "Other" named only inside this operation. Edit mode PATCHes the row
 * by its id with the `updated_at` it last read, which the server refuses as
 * PARTICIPANT_STALE when someone else saved first; the dialog stays open on
 * that so the picks are not lost.
 *
 * Step 6 edits this unit's part of each phase's plan, which is saved after the
 * participant, one PUT per phase that changed, each carrying the rest of the
 * stored plan as it is. The participant save has already happened by then, so a
 * failed PUT keeps the dialog open and a retry saves the row again by its id
 * rather than creating it twice.
 *
 * Cancel, the X, the backdrop and Escape all ask "Discard changes?" before
 * throwing away unsaved edits; a wizard with no edits closes at once.
 */
export function JoinOperationDialog({ open, operation, phases = NO_PHASES, participants, participant, initialStep, onClose, onJoined }: {
  open: boolean;
  operation: Operation;
  /** The operation's phases in order. With more than one, step 4 marks each picked asset per phase. */
  phases?: Phase[];
  /** The rows already on the operation, so a library organization among them is offered as already joined. */
  participants: Participant[];
  /** Present for edit mode: step 1 is read-only and the save is a PATCH by id. */
  participant?: Participant;
  /** Where to open. Defaults to 1, or to 2 (Platform) in edit mode, where step 1 holds nothing to change. */
  initialStep?: JoinStep;
  onClose: () => void;
  onJoined?: (participant: Participant) => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));
  const editing = participant !== undefined;

  const { data: orgData } = useOrganizations();
  const { data: sectionData } = useSections();
  const { data: eqData } = useEquipment();
  const { data: plData } = usePlatforms();
  const { data: trData } = useTransports();
  const createOrganization = useCreateOrganization();
  const createParticipant = useCreateParticipant();
  const updateParticipant = useUpdateParticipantById();
  const savePlan = useSavePhasePlan();
  const saveSites = useSaveOperationSites();

  const [draft, setDraft] = useState<JoinDraft>(EMPTY_DRAFT);
  // The unit's part of each phase the user has changed, by phase id; a phase
  // with no entry shows what is stored.
  const [planEdits, setPlanEdits] = useState<Record<string, PhaseChoice>>({});
  // The row once the participant save has gone through, so a retry after a
  // failed plan PUT saves it again by its id and the fresh `updated_at`.
  const [saved, setSaved] = useState<Participant | null>(null);
  const [step, setStep] = useState<JoinStep>(1);
  const [otherOpen, setOtherOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<OrganizationDraft>(EMPTY_ORGANIZATION_DRAFT);
  const [addError, setAddError] = useState<string | null>(null);
  // Organizations added from this dialog, kept beside the library list until
  // the invalidated query returns them, so the new row is there to be shown
  // as the selection the moment Add and select resolves.
  const [added, setAdded] = useState<Organization[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The draft as seeded at open, so unsaved edits are a comparison, not a flag
  // every setter has to remember to raise.
  const openedDraftRef = useRef<JoinDraft>(EMPTY_DRAFT);

  // The effect below re-seeds on the row's id, not its identity: a refetch hands
  // the page a new object for the same row, and that must not reset the draft.
  const participantRef = useRef(participant);
  participantRef.current = participant;
  const participantId = participant?.id;

  useEffect(() => {
    if (open) {
      const current = participantRef.current;
      const seeded = current ? draftOf(current) : EMPTY_DRAFT;
      openedDraftRef.current = seeded;
      setDraft(seeded);
      setConfirmOpen(false);
      setPlanEdits({});
      setSaved(null);
      setStep(initialStep ?? (current ? 2 : 1));
      setOtherOpen(false);
      setAddOpen(false);
      setAddDraft(EMPTY_ORGANIZATION_DRAFT);
      setAddError(null);
      setAdded([]);
      setError(null);
    }
  }, [open, participantId, initialStep]);

  const organizations = useMemo(() => {
    const library = orgData?.organizations ?? [];
    const keys = new Set(library.map(o => o.key));
    return [...library, ...added.filter(o => !keys.has(o.key))];
  }, [orgData, added]);
  const joinedKeys = useMemo(
    () => new Set(participants.filter(p => p.organization_key !== '').map(p => p.organization_key)),
    [participants],
  );
  const sections = useMemo(() => sectionData ?? [], [sectionData]);
  const equipment = useMemo(() => eqData?.equipment ?? [], [eqData]);
  const equipmentById = useMemo(() => new Map(equipment.map(e => [e.id, e])), [equipment]);
  const platforms = useMemo(() => plData?.platforms ?? [], [plData]);
  const platformById = useMemo(() => new Map(platforms.map(pl => [pl.id, pl])), [platforms]);
  const transports = useMemo(() => trData?.transports ?? [], [trData]);
  const transportById = useMemo(() => new Map(transports.map(t => [t.id, t])), [transports]);

  const chosenOrg = draft.organization_key ? organizations.find(o => o.key === draft.organization_key) : undefined;
  const satisfied = identityChosen(draft);
  const saving = createParticipant.isPending || updateParticipant.isPending || savePlan.isPending;

  const set = <K extends keyof JoinDraft>(key: K, value: JoinDraft[K]) => setDraft(d => ({ ...d, [key]: value }));
  // Either way the key goes: a pick starts in every phase, and an unpick has
  // nothing left to mark.
  const toggleId = (key: 'platform_ids' | 'equipment_ids' | 'transport_ids') => (id: string) =>
    setDraft(d => ({
      ...d,
      [key]: d[key].includes(id) ? d[key].filter(x => x !== id) : [...d[key], id],
      asset_phases: withoutKeys(d.asset_phases, [id]),
    }));
  const clearPlatforms = () => { setDraft(d => ({ ...d, platform_ids: [], asset_phases: withoutKeys(d.asset_phases, d.platform_ids) })); };

  const phaseIds = useMemo(() => phases.map(ph => ph.id), [phases]);
  const marksOf = (assetId: string): string[] => draft.asset_phases[assetId] ?? phaseIds;
  const togglePhase = (assetId: string, phaseId: string) => {
    setDraft(d => {
      const current = d.asset_phases[assetId] ?? phaseIds;
      const next = current.includes(phaseId) ? current.filter(x => x !== phaseId) : [...current, phaseId];
      return { ...d, asset_phases: { ...d.asset_phases, [assetId]: phaseIds.filter(x => next.includes(x)) } };
    });
  };
  // Hidden with one phase, where there is nothing to choose between.
  const phaseChips = (assetId: string, label: string): ReactNode =>
    phases.length > 1
      ? <PhaseChips label={label} phases={phases} marked={marksOf(assetId)} onToggle={(phaseId) => { togglePhase(assetId, phaseId); }} />
      : undefined;
  const phaseCaptionOf = (assetId: string) => phaseCaption(phases, (phaseId) => marksOf(assetId).includes(phaseId), 'list');

  // Choosing a library row clears Other; an edit to Other clears the row.
  const chooseLibrary = (key: string) => { setDraft(d => ({ ...d, organization_key: key, other: EMPTY_OTHER })); };
  const setOther = <K extends keyof AdhocOrganization>(key: K, value: AdhocOrganization[K]) => {
    setDraft(d => ({ ...d, organization_key: '', other: { ...d.other, [key]: value } }));
  };

  // The picked records and platforms: what the catalog says the
  // organization carries, which is the whole of its waveforms and services.
  const picked = useMemo(
    () => draft.equipment_ids.map(id => ({ id, eq: equipmentById.get(id) })),
    [draft.equipment_ids, equipmentById],
  );
  const pickedPlatforms = useMemo(
    () => draft.platform_ids.map(id => ({ id, pl: platformById.get(id) })),
    [draft.platform_ids, platformById],
  );

  // Step 6 and the review read the operation the page already loaded, with
  // this unit's row replaced by the draft, so a status follows the picks.
  const draftUnit = useMemo(
    () => draftUnitOf(draft, saved ?? participant, operation.id, chosenOrg),
    [draft, saved, participant, operation.id, chosenOrg],
  );
  const planRows = usePhaseRows({ operationId: operation.id, unit: draftUnit, edits: planEdits });
  const noGear = draft.platform_ids.length + draft.equipment_ids.length + draft.transport_ids.length === 0;
  const setSite = (row: PhaseRow, site: string) => {
    setPlanEdits(e => ({ ...e, [row.phase.id]: { ...(e[row.phase.id] ?? row.choice), site } }));
  };
  // A location typed in step 6 goes onto the operation's list straight away
  // (the same ordered replace-all the drawer's Locations list saves, with the
  // new one last), so the unit's choice can name it before the wizard saves.
  const addSite = async (name: string): Promise<string> => {
    const next = await saveSites.mutateAsync({
      operationId: operation.id,
      data: { sites: [...planRows.sites.map((s) => ({ id: s.id, name: s.name })), { name }] },
    });
    const made = next.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (!made) throw new Error(`${name} was not added.`);
    return made.id;
  };
  const togglePartner = (row: PhaseRow, partnerId: string) => {
    setPlanEdits(e => {
      const current = e[row.phase.id] ?? row.choice;
      const partners = current.partners.includes(partnerId) ? current.partners.filter(x => x !== partnerId) : [...current.partners, partnerId];
      return { ...e, [row.phase.id]: { ...current, partners } };
    });
  };

  // The key rule and the request body are shared with the Settings page's
  // Organizations tab, in organization-draft.ts.
  const addComplete = organizationDraftComplete(addDraft, 'add');
  const handleAdd = async () => {
    setAddError(null);
    try {
      const created = await createOrganization.mutateAsync(createOrganizationRequestOf(addDraft));
      setAdded(list => [...list, created]);
      chooseLibrary(created.key);
      setAddDraft(EMPTY_ORGANIZATION_DRAFT);
      setAddOpen(false);
    } catch (err) {
      setAddError(errorMessage(err, 'Could not add the organization'));
    }
  };

  const handleSubmit = async () => {
    setError(null);
    // Once the row exists, whether from an edit or from an earlier try of this
    // same Join, every save is a PATCH of it.
    const existing = saved ?? participant;
    let row: Participant;
    try {
      if (existing) {
        row = await updateParticipant.mutateAsync({
          operationId: operation.id,
          participantId: existing.id,
          data: { ...picksOf(draft, phaseIds), expected_updated_at: saved ? saved.updated_at : draft.expected_updated_at },
        });
      } else {
        const identity: Pick<CreateParticipantRequest, 'organization_key' | 'adhoc'> = draft.organization_key
          ? { organization_key: draft.organization_key }
          : {
              adhoc: {
                name: draft.other.name.trim(),
                short_label: draft.other.short_label.trim(),
                branch: draft.other.branch,
                color: draft.other.color,
              },
            };
        row = await createParticipant.mutateAsync({
          operationId: operation.id,
          data: { ...identity, ...picksOf(draft, phaseIds) },
        });
      }
    } catch (err) {
      setError(errorMessage(err, existing ? 'Could not save the participant' : 'Could not join the operation'));
      return;
    }
    setSaved(row);

    // The plans go one at a time, and only for the phases this unit's part
    // changed. The row is saved already, so a failure names the phase and
    // leaves the dialog open on the same picks.
    const plans = changedPlans(planRows.rows.map(r => r.phase), row.id, planEdits, id => presentInPhase(draftUnit, id));
    for (const { phase, data } of plans) {
      try {
        await savePlan.mutateAsync({ operationId: operation.id, phaseId: phase.id, data });
      } catch (err) {
        setError(`Saved the unit, but ${phase.name}'s plan did not save: ${errorMessage(err, 'Could not save the plan')}`);
        return;
      }
    }
    onJoined?.(row);
    onClose();
  };

  const dirty = useMemo(
    () => saved === null && (JSON.stringify(draft) !== JSON.stringify(openedDraftRef.current) || Object.keys(planEdits).length > 0),
    [draft, planEdits, saved],
  );
  // Every close route (X, backdrop, Escape, Cancel) comes through here; a save
  // in flight ignores them, as the buttons do.
  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmOpen(true);
    else onClose();
  };

  const goTo = (next: JoinStep) => { setStep(next); };
  const primaryLabel = editing ? 'Save' : step === 1 ? 'Join now, add equipment later' : 'Join';
  // One centred line, the full operation name and never the acronym: in
  // create mode who is joining is not known yet, in edit mode it is the row.
  const title = editing && participant
    ? `Editing ${participant.organization.short_label || participant.organization.name} - ${operation.name}`
    : `Joining ${operation.name}`;

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      fullScreen={fullScreen}
      maxWidth={false}
      sx={fullScreen ? undefined : DIALOG_ANCHOR_SX}
    >
      {/* The close button is taken out of flow so the text is centred on the
          dialog, not on the space left beside the button; `px` keeps a long
          name from running under it. */}
      {/* One 16px beat from the title to the step strip and from the strip to the
          content (the DialogContent's own top padding): the strip carries no
          bottom padding of its own, or the second gap read as twice the first. */}
      <DialogTitle component="div" sx={{ position: 'relative', textAlign: 'center', px: 7, pb: 2 }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {title}
        </Typography>
        <IconButton aria-label="close" onClick={requestClose} size="small" sx={{ position: 'absolute', right: 12, top: 14 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {/* The step strip: a progression of numbered tiles with a chevron
          between each pair, coloured in as the wizard advances: every step up
          to the current one is the amber chip, the ones ahead are the resting
          chip. It sits on the dialog surface with no band behind it, and it
          lives outside the scrolling content, like the title and the action
          row, so it never moves; the content's own top divider is the line
          under it. Steps past the first are disabled until step 1 is
          satisfied, since every later step is about an organization that
          does not exist yet. */}
      <Box role="group" aria-label="Steps" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, px: 3, pb: 0, flexShrink: 0 }}>
        {JOIN_STEPS.map((s, i) => {
          const active = s === step;
          const disabled = s !== 1 && !satisfied;
          return (
            <Fragment key={s}>
              {i > 0 && <span aria-hidden="true" style={chevronSty}>›</span>}
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                aria-pressed={active}
                data-state={s < step ? 'done' : active ? 'current' : 'todo'}
                disabled={disabled}
                onClick={() => { if (!active) goTo(s); }}
                style={{ ...stepTileSty(s, step), ...(disabled ? { opacity: 0.45, cursor: 'default' } : {}) }}
              >
                {STEP_LABELS[s]}
              </button>
            </Fragment>
          );
        })}
      </Box>

      <DialogContent dividers sx={{ pt: 2, overflowX: 'hidden' }}>
        {step === 1 && (
          <StepOrganization
            editing={editing}
            participant={participant}
            draft={draft}
            organizations={organizations}
            joinedKeys={joinedKeys}
            chooseLibrary={chooseLibrary}
            setOther={setOther}
            otherOpen={otherOpen}
            setOtherOpen={setOtherOpen}
            addOpen={addOpen}
            setAddOpen={setAddOpen}
            addDraft={addDraft}
            setAddDraft={setAddDraft}
            sections={sections}
            addComplete={addComplete}
            adding={createOrganization.isPending}
            addError={addError}
            onAdd={() => { void handleAdd(); }}
          />
        )}

        {step === 2 && (
          <StepPlatform
            platforms={platforms}
            picked={draft.platform_ids}
            onToggle={toggleId('platform_ids')}
            onClear={clearPlatforms}
          />
        )}

        {step === 3 && (
          <CatalogPicker selectedIds={new Set(draft.equipment_ids)} onToggle={toggleId('equipment_ids')} height="55vh" />
        )}

        {step === 4 && (
          <>
            {/* What the picks carry, one panel per platform and per record,
                with their read-only waveforms. Transports, the one real pick,
                have their own step 5. The list keeps its accessible name; the
                step strip is the visible one. */}
            {/* The one caption a step has (maintainer, 10-24): step 3's own "Bringing (n)"
                label, so the panels below read as the picks just made, carried forward. */}
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <span style={trayLabelSty}>{`Bringing (${String(pickedPlatforms.length + picked.length)})`}</span>
              <span style={noteSty}>
                {pickedPlatforms.length === 0 && picked.length === 0
                  ? 'No platform or equipment picked yet.'
                  : 'Picked in steps 2 and 3. Select the relevant phases for each piece of equipment.'}
              </span>
            </div>
            <div role="list" aria-label="Carried by your platform and equipment" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {pickedPlatforms.map(({ id, pl }) => (
                <PlatformCarriedRow key={'pl-' + id} id={id} pl={pl} equipmentById={equipmentById} phaseChips={phaseChips(id, pl ? pl.designation : id)} />
              ))}
              {picked.map(({ id, eq }) => <CarriedRow key={id} id={id} eq={eq} phaseChips={phaseChips(id, eq ? equipmentLabel(eq) : id)} />)}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <TransportStrip transports={transports} picked={draft.transport_ids} onToggle={toggleId('transport_ids')} collapsible={false} />
            {phases.length > 1 && draft.transport_ids.length > 0 && (
              <div role="list" aria-label="Transport phases" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {draft.transport_ids.map(id => {
                  const t = transportById.get(id);
                  return (
                    <div key={id} role="listitem" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <span style={captionSty}>{t ? transportLabel(t) : id}</span>
                      {phaseChips(id, t ? transportLabel(t) : id)}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {step === 6 && (
          <PhasesStep
            loaded={planRows.loaded}
            rows={planRows.rows}
            sites={planRows.sites}
            others={planRows.others}
            noGear={noGear}
            onSite={setSite}
            onPartner={togglePartner}
            onAddSite={addSite}
          />
        )}

        {step === 7 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: fullScreen ? '1fr' : '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={brightLabelSty}>POC name</div>
                <input value={draft.poc_name} onChange={e => set('poc_name', e.target.value)} style={{ ...inputSty, fontSize: 12 }} onFocus={onFocus} onBlur={onBlur} placeholder="Capt Lee" aria-label="POC name" maxLength={POC_NAME_MAX} />
              </div>
              <div>
                <div style={brightLabelSty}>POC phone</div>
                <input value={draft.poc_phone} onChange={e => set('poc_phone', e.target.value)} style={{ ...inputSty, fontSize: 12 }} onFocus={onFocus} onBlur={onBlur} placeholder="DSN 555-0100" aria-label="POC phone" maxLength={POC_PHONE_MAX} />
              </div>
              <div>
                <div style={brightLabelSty}>POC email</div>
                <input value={draft.poc_email} onChange={e => set('poc_email', e.target.value)} style={{ ...inputSty, fontSize: 12 }} onFocus={onFocus} onBlur={onBlur} placeholder="lee@example.mil" aria-label="POC email" maxLength={POC_EMAIL_MAX} type="email" />
              </div>
            </div>
            <div style={brightLabelSty}>Notes</div>
            <textarea value={draft.notes} onChange={e => set('notes', e.target.value)} style={{ ...textareaSty, fontSize: 12, minHeight: 72 }} onFocus={onFocus} onBlur={onBlur} placeholder="What this organization is bringing, and when" aria-label="Notes" maxLength={NOTES_MAX} />
          </>
        )}

        {step === 8 && (
          <ReviewStep
            draft={draft}
            editing={editing}
            participant={participant}
            chosenOrg={chosenOrg}
            pickedPlatforms={pickedPlatforms}
            picked={picked}
            waveforms={effectiveWaveforms({ platform_ids: draft.platform_ids, equipment_ids: draft.equipment_ids, waveform_abbrevs: [] }, equipmentById, platformById)}
            transportById={transportById}
            phaseCaptionOf={phaseCaptionOf}
            planRows={planRows}
            goTo={goTo}
          />
        )}
      </DialogContent>

      {error && (
        <Alert severity="error" sx={{ mx: 3, mt: 2 }} onClose={() => { setError(null); }}>
          {error}
        </Alert>
      )}

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        {/* Back and Continue say where they go, with an arrow each way; on step 1
            there is nothing behind, so Back is disabled and reads plainly. */}
        <Button startIcon={<ArrowBackIcon />} onClick={() => { goTo((step - 1) as JoinStep); }} disabled={step === 1 || saving} sx={{ mr: 'auto' }}>
          {step === 1 ? 'Back' : `Back to step ${String(step - 1)}`}
        </Button>
        <Button onClick={requestClose} disabled={saving}>
          Cancel
        </Button>
        {step < 8 && (
          <Button variant="outlined" endIcon={<ArrowForwardIcon />} onClick={() => { goTo((step + 1) as JoinStep); }} disabled={!satisfied || saving}>
            {`Continue to step ${String(step + 1)}`}
          </Button>
        )}
        <Button
          variant="contained"
          disableElevation
          onClick={() => { void handleSubmit(); }}
          disabled={!satisfied || saving}
          loading={saving}
        >
          {primaryLabel}
        </Button>
      </DialogActions>

      <Dialog open={confirmOpen} onClose={() => { setConfirmOpen(false); }} maxWidth="xs" fullWidth aria-labelledby="discard-join-title">
        <DialogTitle id="discard-join-title">Discard changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>Nothing you entered here has been saved.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => { setConfirmOpen(false); }}>Keep editing</Button>
          <Button variant="contained" color="error" disableElevation onClick={() => { setConfirmOpen(false); onClose(); }}>
            Discard
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

/**
 * Step 4 (Gear)'s panel for one picked platform or record: what the step is picking
 * for, so it stands apart from the strips beneath. A graphite card with a
 * bar down its left edge, amber for a platform and graphite for equipment,
 * the designation or nomenclature as its heading with the popular name or
 * nickname in a mono caption after it, and its chips on the line beneath.
 */
function carriedPanelSty(kind: 'platform' | 'equipment'): CSSProperties {
  return {
    background: 'var(--shf-graphite-800)',
    borderLeft: `3px solid ${kind === 'platform' ? 'var(--shf-amber)' : 'var(--shf-graphite-400)'}`,
    padding: '8px 12px',
  };
}

const carriedHeadingSty: CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, letterSpacing: '0.04em',
  textTransform: 'uppercase', color: 'var(--shf-paper)', lineHeight: 1.2,
};

/**
 * One toggle per phase for one asset, pressed where the asset is in that
 * phase. The group and each chip name the asset, so a screen reader hears
 * "AN/PRC-152 in Phase II" and not an unlabelled "Phase II".
 */
function PhaseChips({ label, phases, marked, onToggle }: {
  label: string;
  phases: Phase[];
  marked: string[];
  onToggle: (phaseId: string) => void;
}) {
  return (
    <div role="group" aria-label={`${label} phases`} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
      {phases.map(ph => {
        const on = marked.includes(ph.id);
        return (
          <button key={ph.id} type="button" aria-pressed={on} aria-label={`${label} in ${ph.name}`} onClick={() => { onToggle(ph.id); }} style={chipToggleSty(on, true)}>
            {ph.name}
          </button>
        );
      })}
    </div>
  );
}

function CarriedPanel({ kind, heading, caption, note, phaseChips, children }: {
  kind: 'platform' | 'equipment';
  heading: string;
  caption?: string;
  /** Shown beside the heading when the record is gone from its library. */
  note?: string;
  /** The asset's phase toggles, on a line of their own under the chips. Absent with one phase or none. */
  phaseChips?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div role="listitem" style={carriedPanelSty(kind)}>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <span style={carriedHeadingSty}>{heading}</span>
        {caption && <span style={monoCaptionSty}>{caption}</span>}
        {note && <span style={noteSty}>{note}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {children}
      </div>
      {phaseChips && (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          <span style={monoCaptionSty}>In phase</span>
          {phaseChips}
        </div>
      )}
    </div>
  );
}

/**
 * One declared platform: its own waveforms as amber chips, then each catalog
 * radio it lists by nomenclature with that radio's waveforms. The same facts
 * the board draws under a platform heading.
 */
function PlatformCarriedRow({ id, pl, equipmentById, phaseChips }: { id: string; pl: Platform | undefined; equipmentById: ReadonlyMap<string, Equipment>; phaseChips?: ReactNode }) {
  const radios = (pl?.equipment_ids ?? []).flatMap(eid => { const eq = equipmentById.get(eid); return eq ? [eq] : []; });
  const own = pl ? pl.waveform_abbrevs.filter(a => norm(a) !== '') : [];
  return (
    <CarriedPanel
      kind="platform"
      heading={pl ? pl.designation : id}
      caption={pl?.popular_name || undefined}
      note={pl ? undefined : 'this platform no longer exists'}
      phaseChips={phaseChips}
    >
      {own.map(a => <span key={'w-' + a} style={chipSty('amber')} title="Waveform">{a}</span>)}
      {radios.map(eq => (
        <span key={eq.id} style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginLeft: own.length > 0 ? 6 : 0 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: WIZARD_INK }}>{equipmentLabel(eq)}</span>
          {equipmentWaveforms(eq).map(a => <span key={'r-' + eq.id + '-' + a} style={chipSty('amber')} title="Waveform">{a}</span>)}
        </span>
      ))}
      {pl && own.length === 0 && radios.length === 0 && <span style={noteSty}>nothing listed</span>}
    </CarriedPanel>
  );
}

/**
 * Step 2: the Platform Library grouped by type, each platform a row that
 * toggles into the pick, with Dismounted at the top pressed whenever nothing
 * is picked. The grouping follows `PLATFORM_TYPES` in its order, UAVs
 * included, and a type with no platforms in the library is omitted rather
 * than shown as an empty group. A platform whose type is outside the closed
 * list cannot exist, since the server enforces it, so an unknown type is not
 * grouped rather than given a group of its own.
 *
 * The rows fill a grid of 360px columns, two or more at the dialog's width,
 * since a platform row is short and a single column left most of the dialog
 * empty. Dismounted and each type caption span the full width. The row
 * carries no waveform count: with the designation, a popular name such as
 * "Globemaster III" and a branch chip, it did not fit a 360px row.
 *
 * Between Dismounted and the grid, two filter rows in the shape of the
 * compatibility page's Filters panel: Branch and Type, any of each and all
 * together, over the values the library actually has, so a branch or type
 * with no platform draws no chip. Local state only - the filters are a way
 * of finding a row, not a fact about the pick, so they are not in the URL
 * and a group with nothing left after filtering is simply not drawn.
 */
function StepPlatform({ platforms, picked, onToggle, onClear }: {
  platforms: Platform[];
  picked: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const none = picked.length === 0;
  const [branches, setBranches] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const availableBranches = BRANCHES.filter(b => platforms.some(pl => pl.category.includes(b)));
  const availableTypes = PLATFORM_TYPES.filter(t => platforms.some(pl => pl.type === t));
  const shown = platforms.filter(pl =>
    (branches.length === 0 || pl.category.some(b => branches.includes(b)))
    && (types.length === 0 || types.includes(pl.type)));
  const groups = PLATFORM_TYPES
    .map(type => ({ type, rows: shown.filter(pl => pl.type === type) }))
    .filter(g => g.rows.length > 0);
  const fullRow: CSSProperties = { gridColumn: '1 / -1' };
  return (
    <div role="group" aria-label="Platforms" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 6 }}>
      <button
        type="button"
        aria-pressed={none}
        onClick={onClear}
        style={{ ...rowSty(none, false), ...fullRow }}
      >
        <span style={{ ...shortLabelSty, minWidth: 0 }}>Dismounted / no platform</span>
      </button>
      {platforms.length === 0 && <span style={{ ...noteSty, ...fullRow, padding: '6px 0' }}>The Platform Library is empty. Continue as dismounted.</span>}
      {platforms.length > 0 && (
        <div style={{ ...fullRow, padding: '6px 0 0' }}>
          <ChipRow gutter="Branch" gutterColor={WIZARD_INK} colon>
            {availableBranches.map(b => {
              const on = branches.includes(b);
              return (
                <button key={b} type="button" aria-pressed={on} title={BRANCH_NAMES[b]} onClick={() => { setBranches(l => toggleIn(l, b)); }} style={{ ...branchFilterSty(b, on), ...FILTER_CHIP_TEXT }}>
                  {b}
                  <FilterCheck on={on} />
                </button>
              );
            })}
          </ChipRow>
          <ChipRow gutter="Type" gutterColor={WIZARD_INK} colon>
            {availableTypes.map(t => {
              const on = types.includes(t);
              return (
                <button key={t} type="button" aria-pressed={on} onClick={() => { setTypes(l => toggleIn(l, t)); }} style={{ ...filterChipSty(on), ...FILTER_CHIP_TEXT }}>
                  {platformTypeLabel(t)}
                  <FilterCheck on={on} />
                </button>
              );
            })}
          </ChipRow>
        </div>
      )}
      {platforms.length > 0 && shown.length === 0 && <span style={{ ...noteSty, ...fullRow, padding: '6px 0' }}>No platform matches the filters.</span>}
      {groups.map(g => (
        // A fragment rather than a wrapper, so the rows are grid children.
        <Fragment key={g.type}>
          <div style={{ ...monoCaptionSty, ...fullRow, padding: '8px 0 0' }}>{platformTypeLabel(g.type)}</div>
          {g.rows.map(pl => {
            const pressed = picked.includes(pl.id);
            return (
              <button
                key={pl.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => { onToggle(pl.id); }}
                style={rowSty(pressed, false)}
              >
                <span style={{ ...shortLabelSty, minWidth: 120 }}>{pl.designation}</span>
                <span style={{ ...monoCaptionSty, fontWeight: 400, flex: 1, minWidth: 0, whiteSpace: 'normal' }}>{pl.popular_name}</span>
                {pl.category.map(b => <span key={b} style={branchChip(b, LIBRARY_CHIP_TEXT)}>{b}</span>)}
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function CarriedRow({ id, eq, phaseChips }: { id: string; eq: Equipment | undefined; phaseChips?: ReactNode }) {
  const waveforms = (eq?.data?.waveforms ?? []).map(w => w.abbrev).filter(Boolean);
  const services = (eq?.data?.services ?? []).map(s => s.abbrev).filter(Boolean);
  // The nickname is the caption only when the nomenclature is the heading;
  // a record with no nomenclature is headed by its nickname already.
  const caption = eq?.nomenclature && eq.nickname ? eq.nickname : undefined;
  return (
    <CarriedPanel
      kind="equipment"
      heading={eq ? equipmentLabel(eq) : id}
      caption={caption}
      note={eq ? undefined : 'this catalog record no longer exists'}
      phaseChips={phaseChips}
    >
      {waveforms.map(a => <span key={'w-' + a} style={chipSty('amber')} title="Waveform">{a}</span>)}
      {services.map(a => <span key={'s-' + a} style={chipSty('paper')} title="Service">{a}</span>)}
      {eq && waveforms.length === 0 && services.length === 0 && <span style={noteSty}>nothing listed</span>}
    </CarriedPanel>
  );
}

/** Step 1: the library list, the Other form and the Add to library form. */
function StepOrganization({
  editing, participant, draft, organizations, joinedKeys, chooseLibrary, setOther,
  otherOpen, setOtherOpen, addOpen, setAddOpen, addDraft, setAddDraft, sections,
  addComplete, adding, addError, onAdd,
}: {
  editing: boolean;
  participant: Participant | undefined;
  draft: JoinDraft;
  organizations: Organization[];
  joinedKeys: ReadonlySet<string>;
  chooseLibrary: (key: string) => void;
  setOther: <K extends keyof AdhocOrganization>(key: K, value: AdhocOrganization[K]) => void;
  otherOpen: boolean;
  setOtherOpen: (next: boolean) => void;
  addOpen: boolean;
  setAddOpen: (next: boolean) => void;
  addDraft: OrganizationDraft;
  setAddDraft: (next: OrganizationDraft) => void;
  sections: { key: string; label: string }[];
  addComplete: boolean;
  adding: boolean;
  addError: string | null;
  onAdd: () => void;
}) {
  if (editing && participant) {
    const o = participant.organization;
    return (
      <>
        {/* A value, not a disabled list: the server keys the row by who
            joined, and moving a check-in to another organization is a leave
            and a new join. The step strip names the step, so no label. */}
        <div aria-label="Organization" style={{ ...inputSty, fontSize: 12, color: 'var(--shf-graphite-300)', background: 'transparent', borderStyle: 'dashed', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 480 }}>
          <span style={pipSty(o.color)} />
          <span style={{ fontWeight: 600, color: 'var(--shf-paper)' }}>{o.short_label || o.name}</span>
          {o.short_label && <span>{o.name}</span>}
          {o.branch && <span style={branchChip(o.branch, LIBRARY_CHIP_TEXT)}>{o.branch}</span>}
          {o.adhoc === true && <span style={monoCaptionSty}>Other</span>}
        </div>
      </>
    );
  }

  const otherOn = draft.organization_key === '' && draft.other.name.trim() !== '';
  const swatches = draft.other.color && !SECTION_COLOR_PALETTE.some(c => c === draft.other.color)
    ? [draft.other.color, ...SECTION_COLOR_PALETTE]
    : [...SECTION_COLOR_PALETTE];

  return (
    <>
      <div role="group" aria-label="Organizations" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {organizations.length === 0 && <span style={noteSty}>The Organization Library is empty. Name yours under Other, or add it below.</span>}
        {organizations.map(o => {
          const joined = joinedKeys.has(o.key);
          const pressed = draft.organization_key === o.key;
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={pressed}
              disabled={joined}
              onClick={() => { chooseLibrary(o.key); }}
              style={rowSty(pressed, joined)}
            >
              <span style={pipSty(o.color)} />
              <span style={shortLabelSty}>{o.short_label || '-'}</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, flex: 1, minWidth: 0 }}>{o.name}</span>
              {o.branch && <span style={branchChip(o.branch, LIBRARY_CHIP_TEXT)}>{o.branch}</span>}
              {joined && <span style={monoCaptionSty}>already joined</span>}
            </button>
          );
        })}
      </div>

      {/* Other: an organization that lives only on this operation. */}
      <button
        type="button"
        aria-label="Other"
        aria-expanded={otherOpen}
        aria-pressed={otherOn}
        onClick={() => { setOtherOpen(!otherOpen); }}
        style={rowSty(otherOn, false)}
      >
        <span aria-hidden="true" style={{ fontFamily: 'var(--font-mono)', color: 'var(--shf-amber)', width: 9 }}>{otherOpen ? '−' : '+'}</span>
        <span style={shortLabelSty}>Other</span>
        <span style={{ ...captionSty, flex: 1 }}>Name an organization that is not in the library</span>
      </button>
      {otherOpen && (
        <div style={{ ...panelSty, marginBottom: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={brightLabelSty}>Name *</div>
              <input value={draft.other.name} onChange={e => setOther('name', e.target.value)} style={{ ...inputSty, fontSize: 12 }} onFocus={onFocus} onBlur={onBlur} placeholder="Coalition partner" aria-label="Other name" maxLength={OTHER_NAME_MAX} />
            </div>
            <div>
              <div style={brightLabelSty}>Short label</div>
              <input value={draft.other.short_label} onChange={e => setOther('short_label', e.target.value)} style={{ ...inputSty, fontSize: 12, textTransform: 'uppercase' }} onFocus={onFocus} onBlur={onBlur} placeholder="CP" aria-label="Other short label" maxLength={OTHER_SHORT_LABEL_MAX} />
            </div>
          </div>
          <div style={brightLabelSty}>Branch</div>
          <div role="group" aria-label="Other branch" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            <button type="button" aria-pressed={draft.other.branch === ''} title="No branch" onClick={() => setOther('branch', '')} style={chipToggleSty(draft.other.branch === '', true)}>
              None
            </button>
            {BRANCHES.map(b => {
              const on = draft.other.branch === b;
              return (
                <button key={b} type="button" aria-pressed={on} title={BRANCH_NAMES[b]} onClick={() => setOther('branch', b)} style={branchToggleSty(b, on)}>
                  {b}
                </button>
              );
            })}
          </div>
          <div style={brightLabelSty}>Color</div>
          <div role="group" aria-label="Other color" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 0', marginBottom: 8 }}>
            {swatches.map(c => {
              const on = draft.other.color === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={on}
                  title={c}
                  onClick={() => setOther('color', on ? '' : c)}
                  style={{
                    width: 22, height: 22, borderRadius: '50%', background: c, border: 0, padding: 0,
                    cursor: 'pointer', flexShrink: 0,
                    outline: on ? '2px solid var(--shf-paper)' : '2px solid transparent',
                    outlineOffset: 2,
                  }}
                />
              );
            })}
          </div>
          <div style={captionSty}>Lives only in this operation. It is not added to the Organization Library.</div>
        </div>
      )}

      {/* Add to library: the organization pane's add form, and the new row is
          selected on success. */}
      <button
        type="button"
        aria-label="Add to library"
        aria-expanded={addOpen}
        onClick={() => { setAddOpen(!addOpen); }}
        style={rowSty(false, false)}
      >
        <span aria-hidden="true" style={{ fontFamily: 'var(--font-mono)', color: 'var(--shf-amber)', width: 9 }}>{addOpen ? '−' : '+'}</span>
        <span style={shortLabelSty}>Add to library</span>
        <span style={{ ...captionSty, flex: 1 }}>Add the organization to the library, then select it</span>
      </button>
      {addOpen && (
        <div style={panelSty}>
          <OrganizationFields draft={addDraft} setDraft={setAddDraft} sections={sections} mode="add" onEnter={addComplete && !adding ? onAdd : undefined} />
          {addError && <Alert severity="error" sx={{ mt: 1 }}>{addError}</Alert>}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
            <Button variant="contained" disableElevation onClick={onAdd} disabled={!addComplete || adding} loading={adding}>
              Add and select
            </Button>
          </Box>
        </div>
      )}
    </>
  );
}

/**
 * Step 8: a definition list of everything the save will send, with an Edit
 * per section. Waveforms is the derived summary - what the platforms and
 * equipment carry - so its Edit opens step 4, where that list is drawn;
 * there is no Services line, since services are read off the equipment
 * panels there and are never picked on their own.
 */
function ReviewStep({ draft, editing, participant, chosenOrg, pickedPlatforms, picked, waveforms, transportById, phaseCaptionOf, planRows, goTo }: {
  draft: JoinDraft;
  editing: boolean;
  participant: Participant | undefined;
  chosenOrg: Organization | undefined;
  pickedPlatforms: { id: string; pl: Platform | undefined }[];
  picked: { id: string; eq: Equipment | undefined }[];
  waveforms: string[];
  transportById: ReadonlyMap<string, Transport>;
  /** The phases an asset is in, written out; "" when it is in all of them. */
  phaseCaptionOf: (assetId: string) => string;
  /** Step 6's rows; the Phases line is drawn only when the operation has phases to plan. */
  planRows: { rows: PhaseRow[]; sites: Site[]; others: Participant[] };
  goTo: (step: JoinStep) => void;
}) {
  const org = editing && participant ? participant.organization : chosenOrg;
  const isOther = !editing ? draft.organization_key === '' : participant?.organization.adhoc === true;
  const other = editing && participant ? participant.organization : draft.other;

  const section = (title: string, step: JoinStep, body: ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 12, alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--shf-graphite-700)' }}>
      <dt style={brightLabelSty}>{title}</dt>
      <dd style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--shf-paper)', minWidth: 0 }}>{body}</dd>
      <dd style={{ margin: 0 }}>
        {(step !== 1 || !editing) && (
          <Button size="small" aria-label={`Edit ${title.toLowerCase()}`} onClick={() => { goTo(step); }}>Edit</Button>
        )}
      </dd>
    </div>
  );

  const chips = (items: string[], empty: string) =>
    items.length === 0
      ? <span style={noteSty}>{empty}</span>
      : <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>{items.map(a => <span key={a} style={chipSty('amber')}>{a}</span>)}</span>;

  // Under an asset that is not in every phase, a line saying which. An asset
  // in all of them has none, so a plain review stays as it was.
  const phaseLines = (assets: { id: string; label: string }[]) => assets.flatMap(a => {
    const c = phaseCaptionOf(a.id);
    return c ? [<div key={a.id} style={{ ...monoCaptionSty, whiteSpace: 'normal', marginTop: 2 }}>{`${a.label}: ${c}`}</div>] : [];
  });

  const contact = [draft.poc_name.trim(), draft.poc_phone.trim(), draft.poc_email.trim()].filter(Boolean);

  return (
    <>
      <dl style={{ margin: 0 }}>
        {section('Organization', 1, (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {isOther ? (
              <>
                <span style={{ fontWeight: 600 }}>{other.short_label.trim() || other.name.trim()}</span>
                {other.short_label.trim() && <span style={captionSty}>{other.name.trim()}</span>}
                {other.branch && <span style={branchChip(other.branch, LIBRARY_CHIP_TEXT)}>{other.branch}</span>}
                <span style={monoCaptionSty}>Other</span>
              </>
            ) : org ? (
              <>
                <span style={{ fontWeight: 600 }}>{org.short_label || org.name}</span>
                {org.short_label && <span style={captionSty}>{org.name}</span>}
                {org.branch && <span style={branchChip(org.branch, LIBRARY_CHIP_TEXT)}>{org.branch}</span>}
              </>
            ) : (
              <span>{draft.organization_key}</span>
            )}
          </span>
        ))}
        {section('Platform', 2, pickedPlatforms.length === 0
          ? <span>Dismounted</span>
          : (
            <>
              <span>{pickedPlatforms.map(({ id, pl }) => (pl ? pl.designation : id)).join(', ')}</span>
              {phaseLines(pickedPlatforms.map(({ id, pl }) => ({ id, label: pl ? pl.designation : id })))}
            </>
          ))}
        {section('Equipment', 3, picked.length === 0
          ? <span style={noteSty}>None picked.</span>
          : (
            <>
              <span>{picked.length} {picked.length === 1 ? 'item' : 'items'}: {picked.map(({ id, eq }) => (eq ? equipmentLabel(eq) : id)).join(', ')}</span>
              {phaseLines(picked.map(({ id, eq }) => ({ id, label: eq ? equipmentLabel(eq) : id })))}
            </>
          ))}
        {section('Waveforms', 4, chips(waveforms, 'None carried.'))}
        {section('Transports', 5, draft.transport_ids.length === 0
          ? <span style={noteSty}>None.</span>
          : (
            <>
              <span>{draft.transport_ids.map(id => { const t = transportById.get(id); return t ? transportLabel(t) : id; }).join(', ')}</span>
              {phaseLines(draft.transport_ids.map(id => { const t = transportById.get(id); return { id, label: t ? transportLabel(t) : id }; }))}
            </>
          ))}
        {planRows.rows.length > 0 && section('Phases', 6, <PhasesReview rows={planRows.rows} sites={planRows.sites} others={planRows.others} />)}
        {section('Contact', 7, (
          <>
            {contact.length === 0 && !draft.notes.trim() && <span style={noteSty}>None given.</span>}
            {contact.length > 0 && <div>{contact.join(' · ')}</div>}
            {draft.notes.trim() && <div style={{ ...captionSty, whiteSpace: 'pre-wrap', marginTop: 2 }}>{draft.notes.trim()}</div>}
          </>
        ))}
      </dl>
    </>
  );
}

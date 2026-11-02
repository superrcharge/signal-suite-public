import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Box } from '@mui/material';

import { chipToggleSty } from '@/components/catalog/chip-styles';
import { RAIL_BANNER_H } from '@/components/common/banner-controls';
import { sheetRootProps } from '@/components/common/sheet-export/sheet-root';
import type { Operation, Participant, Phase, Site } from '@/types';
import { buildInterop } from './interop-model';
import { PhasePicture } from './phase-picture';
import { draftPhase, usePhasePlanDraft } from './phase-plan-draft';
import { PhasePlanPanel } from './phase-plan-panel';
import { phaseRequirements } from './phase-plan-model';
import { PhaseSwitch } from './phase-switch';
import { useInteropInput } from './use-interop-input';
import { usePhaseParam } from './use-phase-param';

const PANEL_W = 300;

/** Whether this viewer last left the planning panel shown; the picture takes the width when it is hidden. */
const PANEL_KEY = 'signal-suite-operation-plan-panel';

function readPanelShown(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

function writePanelShown(shown: boolean) {
  try {
    localStorage.setItem(PANEL_KEY, shown ? 'shown' : 'hidden');
  } catch {
    // Storage is a convenience: without it the panel simply starts shown next time.
  }
}

const note: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' };

/**
 * The operation page's Web view: one phase at a time, as a picture of what
 * that phase asks of its units. Location boxes hold the units that sit there,
 * and a line joins each pair that must be able to talk, coloured by whether
 * they can; see `PhasePicture`. People talk to who they need to talk to, so
 * the picture draws the requirements the phase names, not everyone to
 * everyone. Its Show switch narrows that to the gaps, or to one unit and the
 * units it must talk to; the unit is `?focus=`, which a change of phase leaves
 * alone.
 *
 * A specific phase is always chosen: `?phase=` absent or unknown reads as the
 * first, and there is no All phases. Writers get the planning panel beside
 * the picture, which they can hide to give the picture the whole width (the
 * choice is remembered in this browser), and the picture shows their edit before
 * it is saved; switching
 * phase with an unsaved plan asks first. A reader sees the picture alone,
 * across the whole width. It reads the same model as the Matrix view and the
 * same `?phase=`, so the two agree on who is in a phase and what they have.
 */
export function OperationWebView({ operation, participants, phases, sites, canWrite }: {
  operation: Operation;
  participants: Participant[];
  phases: Phase[];
  sites: Site[];
  canWrite: boolean;
}) {
  const { isLoading, isError, input } = useInteropInput(participants);
  const [phaseId, setPhase] = usePhaseParam(phases, true);
  const phase = phases.find((p) => p.id === phaseId);
  const plan = usePhasePlanDraft(phase);
  const [panelShown, setPanelShown] = useState(readPanelShown);
  const togglePanel = () => {
    setPanelShown((shown) => {
      writePanelShown(!shown);
      return !shown;
    });
  };

  const model = useMemo(() => buildInterop({ ...input, phaseId }), [input, phaseId]);
  // An unsaved edit is what the picture draws; a clean draft is the phase itself.
  const shown = useMemo(() => (phase && plan.dirty ? draftPhase(phase, plan.draft) : phase), [phase, plan.dirty, plan.draft]);
  const entries = useMemo(() => (shown ? phaseRequirements(shown, model, participants) : []), [shown, model, participants]);

  const selectPhase = (next: string | null) => {
    if (next === phaseId) return;
    if (plan.dirty && phase) {
      const target = phases.find((p) => p.id === next)?.name ?? 'another phase';
      if (!window.confirm(`Discard unsaved changes to the plan for ${phase.name} and open ${target}?`)) return;
    }
    setPhase(next);
  };

  const ready = !isLoading && !isError && participants.length > 0 && phase !== undefined && shown !== undefined;

  return (
    <>
      {/* The plan toggle rides the phase row's far right, so neither state
          costs the picture a column of its own. The row sticks under the banner
          on the canvas's own graphite, so a phase can be switched from anywhere
          down a tall picture, and it sits one 12px beat below the banner and one
          above the paper: the banner's margin is cancelled here and the row
          carries both gaps itself (maintainer, 10-19). */}
      <Box sx={{
        position: 'sticky', top: RAIL_BANNER_H, zIndex: 5, background: 'var(--shf-graphite-900)',
        mt: -2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
      }}>
        <PhaseSwitch phases={phases} value={phaseId} onChange={selectPhase} allPhases={false} flush />
        {canWrite && ready && (
          // The label says what a click does, so the state is aria-expanded
          // (the panel it shows), not aria-pressed, which would read twice.
          <button
            type="button" aria-expanded={panelShown} onClick={togglePanel}
            style={{ ...chipToggleSty(panelShown, true), flexShrink: 0, marginLeft: 'auto' }}
          >
            {panelShown ? 'Hide plan' : 'View plan'}
          </button>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        {/* The sheet root: the .png and the clipboard of the share menu capture this paper, the phase as it is on screen. */}
        <Box {...sheetRootProps()} sx={{ background: 'var(--shf-paper)', p: 2.5, borderRadius: '2px', flex: 1, minWidth: 0 }}>
          {isLoading ? (
            <Box sx={note}>Loading…</Box>
          ) : isError ? (
            <Box sx={note}>
              Could not load the catalog, the waveform library or the platform library.
            </Box>
          ) : participants.length === 0 ? (
            <Box sx={{ fontFamily: 'var(--font-body)', fontSize: 13, fontStyle: 'italic', color: 'var(--fg-3)' }}>
              No one has joined yet.
            </Box>
          ) : !phase || !shown ? (
            <Box sx={{ fontFamily: 'var(--font-body)', fontSize: 13, fontStyle: 'italic', color: 'var(--fg-3)' }}>
              This operation has no phases.
            </Box>
          ) : (
            // No visible heading: the banner names the operation and the pressed
            // phase chip names the phase, so a title here only restated both.
            // The region keeps the name for a screen reader.
            <Box role="region" aria-label={`${phase.name}: who must talk to whom`}>
              <PhasePicture model={model} phase={shown} sites={sites} entries={entries} />
            </Box>
          )}
        </Box>
        {canWrite && ready && panelShown && (
          <Box sx={{ width: PANEL_W, flexShrink: 0 }}>
            <PhasePlanPanel
              key={phase.id}
              operationId={operation.id}
              phase={phase}
              columns={model.columns}
              participants={participants}
              sites={sites}
              draft={plan.draft}
              dirty={plan.dirty}
              setDraft={plan.setDraft}
              onReset={plan.reset}
            />
          </Box>
        )}
      </Box>
    </>
  );
}

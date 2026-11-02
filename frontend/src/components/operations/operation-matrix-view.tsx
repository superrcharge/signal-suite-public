import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Box } from '@mui/material';

import { sheetRootProps } from '@/components/common/sheet-export/sheet-root';
import type { Participant, Phase } from '@/types';
import { InteropMatrix } from './interop-matrix';
import { buildInterop } from './interop-model';
import { PhaseSwitch } from './phase-switch';
import { useInteropInput } from './use-interop-input';
import { useExpandParam, usePhaseParam } from './use-phase-param';

/**
 * The paper box both views draw on, with the phase switch above it on the
 * graphite canvas, where its chips are drawn for. The same paper box the
 * catalog compatibility page wraps its matrix in, so the two draw one grid
 * the same way.
 */
export function InteropFrame({ phases, phase, onPhase, children }: {
  phases: Phase[];
  phase: string | null;
  onPhase: (next: string | null) => void;
  children: ReactNode;
}) {
  return (
    <>
      <PhaseSwitch phases={phases} value={phase} onChange={onPhase} />
      {/* The paper scrolls sideways when an open organization makes the grid wider than the page, and the sheet root is the paper itself, as wide as the grid at its narrowest: html-to-image copies every computed width onto the clone, so a root narrower than its grid would crop the .png at the screen's width, whatever the clone is told. */}
      <Box sx={{ maxWidth: '100%', overflowX: 'auto', borderRadius: '2px' }}>
        <Box {...sheetRootProps()} sx={{ background: 'var(--shf-paper)', p: 2.5, minWidth: 'min-content' }}>
          {children}
        </Box>
      </Box>
    </>
  );
}

/**
 * The operation page's Matrix view: the capability-by-unit grid, the place to
 * find what everyone has in common. One column per organization that joined
 * and one row per waveform, SATCOM service and transport any of them brings,
 * each cell naming the assets that give the organization the row - the
 * platform, the radio, the terminal, the transport - rather than a bare
 * check. An organization opens into one column per asset, in the URL as
 * `?expand=`, and a phase chip row above the grid (`?phase=`) narrows it to
 * what is there in that phase: what is not there is not drawn.
 *
 * Loads every catalog record, not only radios: a SATCOM terminal supplies
 * services, and a platform carries terminals as well as radios.
 *
 * No column picker and no filters beyond the phase: the columns are the
 * participants, and the catalog's joint matrix is where a wider comparison
 * lives. No legend and no heading either: the banner names the operation, and
 * each chip's title says what it is and, for a platform that carries a
 * waveform through a radio, which radio. What each unit must reach is the Web
 * view's, not drawn here.
 */
export function OperationMatrixView({ participants, phases }: {
  participants: Participant[];
  phases: Phase[];
}) {
  const { isLoading, isError, input } = useInteropInput(participants);
  const [phase, setPhase] = usePhaseParam(phases);

  const model = useMemo(() => buildInterop({ ...input, phaseId: phase }), [input, phase]);
  const keys = useMemo(() => model.columns.map((c) => c.key), [model]);
  const [expanded, toggleExpand] = useExpandParam(keys);

  return (
    <InteropFrame phases={phases} phase={phase} onPhase={setPhase}>
      {isLoading ? (
        <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>Loading…</Box>
      ) : isError ? (
        <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
          Could not load the catalog, the waveform library or the platform library.
        </Box>
      ) : participants.length === 0 ? (
        <Box sx={{ fontFamily: 'var(--font-body)', fontSize: 13, fontStyle: 'italic', color: 'var(--fg-3)' }}>
          No one has joined yet.
        </Box>
      ) : (
        <InteropMatrix model={model} expanded={expanded} onToggleExpand={toggleExpand} />
      )}
    </InteropFrame>
  );
}

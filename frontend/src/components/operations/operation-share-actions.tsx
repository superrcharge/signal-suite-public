import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';

import { DocumentActions } from '@/components/common/sheet-export/document-actions';
import { downloadNativeDeck } from '@/components/common/sheet-export/sheet-export';
import type { SheetDeckAction } from '@/components/common/sheet-export/sheet-export';
import { operationExportSpec, operationMatrixExportSpec } from '@/components/common/sheet-export/sheet-specs';
import type { Operation, Participant, Phase, Site } from '@/types';
import { matrixNativeDeckSpec, slidePaging } from './matrix-native';
import { planMatrixDeck } from './matrix-pages';
import { matrixPrintHref, printHref } from './operation-print-params';
import { phaseNativeDeckSpec } from './phase-deck-native';
import { planPhaseDeck } from './phase-deck-plan';
import { readShow } from './phase-show';
import { useInteropInput } from './use-interop-input';
import { usePhaseParam } from './use-phase-param';

/**
 * The share menu of the operation page's Web view, in the banner's right
 * cluster where every printable page puts its document actions.
 *
 * Its .pptx item is the whole deck, one slide per phase in phase order, each
 * drawn in whatever Show mode is on screen when it is chosen, and drawn as
 * native PowerPoint objects: units are shapes a person can drag, and the lines
 * between them are connectors that follow. The .png and the clipboard are the
 * phase on screen, as the menu does everywhere. Mode and focused unit are read
 * when the item is chosen, never when this renders, so the deck is the screen
 * as it is then.
 *
 * A saved plan is what the deck draws. The planning panel's unsaved edit
 * belongs to the phase on screen and is not part of the operation until it is
 * saved, so it is not part of a file that leaves the app either.
 *
 * Print / Save PDF opens the print route in a new tab, as the other pages do,
 * with the screen's Show mode, focused unit and phase in its query string: the
 * route is a page of its own and has no way to read this viewer's choices.
 *
 * The Matrix view has the same control, the same items in the same order, and
 * `view="matrix"` is the only thing that changes what they do: the .png and the
 * clipboard are the grid on screen, the .pptx is the whole Matrix as a deck (All
 * phases, then one slide per phase, the grid a native table; see
 * `matrix-native.ts`) and Print / Save PDF opens `/operations/:id/matrix/print`.
 * Matrix has no Show mode or focused unit, so only the phase rides along, and
 * that only to say where Back returns to.
 */
export function OperationShareActions({ operation, participants, phases, sites, view = 'web', children }: {
  operation: Operation;
  participants: Participant[];
  phases: Phase[];
  sites: Site[];
  view?: 'web' | 'matrix';
  /** The page's own write controls, which sit to the left of the share trigger as on the PACE page. */
  children?: ReactNode;
}) {
  const { isLoading, isError, input } = useInteropInput(participants);
  const [phaseId] = usePhaseParam(phases, view === 'web');
  const [searchParams] = useSearchParams();
  const focusParam = searchParams.get('focus');

  const matrixDeck: SheetDeckAction = {
    hint: 'The phase on screen, a table you can edit',
    run: async (onProgress) => {
      if (isLoading) return { ok: false, error: 'The catalog is still loading. Try again in a moment.' };
      if (isError) return { ok: false, error: 'The catalog could not be loaded, so there is nothing to draw.' };
      if (participants.length === 0) return { ok: false, error: 'No one has joined yet, so there is nothing to export.' };
      // Only the phase on screen (All phases when none is chosen), split onto
      // continuation slides when it does not fit one.
      const plan = planMatrixDeck({ operation, phases, input, paging: slidePaging(), only: phaseId });
      return downloadNativeDeck(matrixNativeDeckSpec(plan, operation.name), onProgress);
    },
  };

  const deck: SheetDeckAction = {
    hint: 'One slide per phase, editable in PowerPoint',
    run: async (onProgress) => {
      if (isLoading) return { ok: false, error: 'The catalog is still loading. Try again in a moment.' };
      if (isError) return { ok: false, error: 'The catalog could not be loaded, so there is nothing to draw.' };
      if (phases.length === 0) return { ok: false, error: 'This operation has no phases to export.' };
      const plan = planPhaseDeck({ operation, phases, participants, input, sites, show: readShow(), focusParam, currentPhaseId: phaseId });
      return downloadNativeDeck(phaseNativeDeckSpec(plan, sites, operation.name), onProgress);
    },
  };

  if (view === 'matrix') {
    return (
      <DocumentActions
        spec={operationMatrixExportSpec(operation.name)}
        deck={matrixDeck}
        onPrint={() => { window.open(matrixPrintHref(operation.id, { phase: phaseId }), '_blank'); }}
        printDisabled={participants.length === 0}
      >
        {children}
      </DocumentActions>
    );
  }

  return (
    <DocumentActions
      spec={operationExportSpec(operation.name)}
      deck={deck}
      onPrint={() => { window.open(printHref(operation.id, { show: readShow(), focus: focusParam, phase: phaseId }), '_blank'); }}
      printDisabled={phases.length === 0}
    >
      {children}
    </DocumentActions>
  );
}

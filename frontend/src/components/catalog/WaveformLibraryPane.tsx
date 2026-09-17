import { useMemo } from 'react';
import { useMediaQuery, useTheme } from '@mui/material';

import { useAuth } from '@/contexts';
import { useWaveforms, useWaveformUsage, useCreateWaveform, useUpdateWaveform, useDeleteWaveform } from '@/services';
import type { Waveform } from '@/types';
import { LibInput, NameAndDesc, ReferenceLibraryPane, UsageCount, UsageNames } from './ReferenceLibraryPane';
import { abbrevCell } from './reference-library-cells';

interface Draft { abbrev: string; name: string; description: string }

// Mirrors the `max=` tags on the request DTOs. Capped as typed rather than
// caught at save: the server 400s on a longer value, and a limit the user only
// discovers on Save reads as the form having eaten their text.
// Only `abbrev` is capped, because only `abbrev` has a tag - name and
// description are uncapped server-side, so inventing a limit here would be
// this file making up a rule.
const WAVEFORM_ABBREV_MAX = 50;

const EMPTY: Draft = { abbrev: '', name: '', description: '' };

/**
 * Moved out of `catalog-editor-page.tsx` so the Comms Library route can mount
 * it too, then reduced to a configuration of `ReferenceLibraryPane` - see that
 * file for why the screen itself is shared.
 */
/** `readOnly` is for the print route: no add form, no row pencils, whatever the role. */
export function WaveformLibraryPane({ readOnly = false }: { readOnly?: boolean }) {
  /**
   * canWriteRadio, not canWrite: waveforms are radio reference data, which is
   * the one thing an `rto` may write - the same flag the sidebar's Editor link
   * gates on, and the reason `waveform/routes.go` admits `rto` where the
   * service and transport routes do not.
   *
   * This pane had NO gate of its own, because it only ever rendered inside the
   * editor page, which gates the whole screen. Mounting it on a route of its
   * own without this would have handed waveform create, edit and delete to
   * every viewer.
   */
  const { canWriteRadio } = useAuth();
  const { data, isLoading } = useWaveforms();
  // Keyed by normalised abbrev, and an unused waveform is ABSENT from the map
  // rather than mapped to an empty list - so `?? []` is the whole of reading it.
  // Restores the per-entry count and the named carrier list that an earlier commit
  // deleted with the Waveforms browse tab.
  const { data: usage } = useWaveformUsage();
  const carriers = (w: Waveform) => usage?.usage[w.abbrev.trim().toLowerCase()] ?? [];
  // Where there is room, the carriers are a column on the row's own line, so
  // every entry is one even line. Below md they go beneath the row instead: a
  // 30% column on a phone would stack the chips one per line.
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const createMutation = useCreateWaveform();
  const updateMutation = useUpdateWaveform();
  const deleteMutation = useDeleteWaveform();

  // useMemo, not a bare `?? []`: the fallback is a fresh array literal every
  // render, which would change the filter memo's dependency on every render and
  // defeat it entirely.
  const waveforms = useMemo(() => data?.waveforms ?? [], [data]);

  return (
    <ReferenceLibraryPane<Waveform, Draft>
      title="Waveform Library"
      subtitle="global reference - shared across all equipment"
      noun="waveforms"
      singular="Waveform"
      items={waveforms}
      isLoading={isLoading}
      searchText={w => [w.abbrev, w.name, w.description].join(' ')}
      itemLabel={w => w.abbrev}
      canWrite={!readOnly && canWriteRadio}
      emptyDraft={EMPTY}
      draftOf={w => ({ abbrev: w.abbrev, name: w.name, description: w.description })}
      isComplete={d => d.abbrev.trim().length > 0}
      fieldGrid={{ template: '80px 1fr 2fr', headers: ['Abbrev', 'Name', 'Description'] }}
      renderFields={(d, set, onEnter) => (
        <>
          <LibInput value={d.abbrev} onChange={v => { set({ ...d, abbrev: v }); }} onEnter={onEnter} placeholder="SINCGARS" maxLength={WAVEFORM_ABBREV_MAX} />
          <LibInput value={d.name} onChange={v => { set({ ...d, name: v }); }} onEnter={onEnter} placeholder="Full name" />
          <LibInput value={d.description} onChange={v => { set({ ...d, description: v }); }} onEnter={onEnter} placeholder="Brief description" />
        </>
      )}
      renderRow={w => (
        <>
          <div style={abbrevCell}>{w.abbrev}</div>
          <NameAndDesc name={w.name} description={w.description} showEmpty />
          <UsageCount names={carriers(w)} noun="asset" />
          {wide && <UsageNames names={carriers(w)} layout="column" />}
        </>
      )}
      renderRowExtra={wide ? undefined : w => <UsageNames names={carriers(w)} layout="strip" />}
      onCreate={d => createMutation.mutateAsync({ abbrev: d.abbrev.trim(), name: d.name.trim(), description: d.description.trim() })}
      onSave={(id, d) => updateMutation.mutateAsync({ id, data: d })}
      onDelete={w => deleteMutation.mutateAsync(w.id)}
      isCreating={createMutation.isPending}
      isSaving={updateMutation.isPending}
      createError={createMutation.isError ? createMutation.error : null}
      createErrorFallback="Error creating waveform"
      // No "existing equipment records are unaffected" clause: since an earlier change the
      // server refuses exactly that case, so promising it would be a lie.
      confirmDelete={w => `Delete waveform "${w.abbrev}"? It must not be carried by any equipment record or platform.`}
      deletedMessage={w => `Waveform "${w.abbrev}" deleted`}
      saveErrorFallback="Could not save the waveform"
      deleteErrorFallback="Could not delete the waveform"
    />
  );
}

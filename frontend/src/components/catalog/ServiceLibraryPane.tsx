import { useMemo } from 'react';
import { useMediaQuery, useTheme } from '@mui/material';

import { useAuth } from '@/contexts/auth-context';
import { useServices, useServiceUsage, useCreateService, useUpdateService, useDeleteService } from '@/services';
import type { Service } from '@/types';
import { LibInput, NameAndDesc, ReferenceLibraryPane, UsageCount, UsageNames } from './ReferenceLibraryPane';
import { abbrevCell } from './reference-library-cells';

// Mirrors the `max=` tags on the request DTOs. Capped as typed rather than
// caught at save: the server 400s on a longer value, and a limit the user only
// discovers on Save reads as the form having eaten their text.
const SERVICE_ABBREV_MAX = 50;
const SERVICE_NAME_MAX = 100;
const SERVICE_DESC_MAX = 250;

interface Draft { abbrev: string; name: string; description: string }

const EMPTY: Draft = { abbrev: '', name: '', description: '' };

/**
 * Moved out of `catalog-editor-page.tsx` so the Comms Library route can mount
 * it too, then reduced to a configuration of `ReferenceLibraryPane`.
 */
/** `readOnly` is for the print route: no add form, no row pencils, whatever the role. */
export function ServiceLibraryPane({ readOnly = false }: { readOnly?: boolean }) {
  // canWrite, not canEditDraft: services are the SATCOM half of the catalog
  // split and the writer gate is admin/editor only, so an rto writer reaching
  // this pane reads it. Every write control below would 403 for that role.
  const { canWrite } = useAuth();
  const { data, isLoading } = useServices();
  // Equipment is the only carrier of services - platforms carry none - so
  // unlike the waveform readout there is one source behind this, not two.
  const { data: usage } = useServiceUsage();
  const offeredBy = (svc: Service) => usage?.usage[svc.abbrev.trim().toLowerCase()] ?? [];
  // See WaveformLibraryPane: a column on the row line where there is room,
  // beneath the row where there is not.
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const createMutation = useCreateService();
  const updateMutation = useUpdateService();
  const deleteMutation = useDeleteService();

  const services = useMemo(() => data?.services ?? [], [data]);

  return (
    <ReferenceLibraryPane<Service, Draft>
      title="Service Library"
      subtitle="global reference - shared across all equipment"
      noun="services"
      singular="Service"
      items={services}
      isLoading={isLoading}
      searchText={s => [s.abbrev, s.name, s.description].join(' ')}
      itemLabel={s => s.abbrev}
      canWrite={!readOnly && canWrite}
      emptyDraft={EMPTY}
      draftOf={s => ({ abbrev: s.abbrev, name: s.name, description: s.description })}
      isComplete={d => d.abbrev.trim().length > 0}
      fieldGrid={{ template: '80px 1fr 2fr', headers: ['Abbrev', 'Name', 'Description'] }}
      renderFields={(d, set, onEnter) => (
        <>
          <LibInput value={d.abbrev} onChange={v => { set({ ...d, abbrev: v }); }} onEnter={onEnter} placeholder="GX" maxLength={SERVICE_ABBREV_MAX} />
          <LibInput value={d.name} onChange={v => { set({ ...d, name: v }); }} onEnter={onEnter} placeholder="Inmarsat Global Express" maxLength={SERVICE_NAME_MAX} />
          <LibInput value={d.description} onChange={v => { set({ ...d, description: v }); }} onEnter={onEnter} placeholder="Brief description" maxLength={SERVICE_DESC_MAX} />
        </>
      )}
      renderRow={s => (
        <>
          <div style={abbrevCell}>{s.abbrev}</div>
          <NameAndDesc name={s.name} description={s.description} showEmpty />
          <UsageCount names={offeredBy(s)} noun="terminal" />
          {wide && <UsageNames names={offeredBy(s)} layout="column" />}
        </>
      )}
      renderRowExtra={wide ? undefined : s => <UsageNames names={offeredBy(s)} layout="strip" />}
      onCreate={d => createMutation.mutateAsync({ abbrev: d.abbrev.trim(), name: d.name.trim(), description: d.description.trim() })}
      onSave={(id, d) => updateMutation.mutateAsync({ id, data: d })}
      onDelete={s => deleteMutation.mutateAsync(s.id)}
      isCreating={createMutation.isPending}
      isSaving={updateMutation.isPending}
      createError={createMutation.isError ? createMutation.error : null}
      createErrorFallback="Error creating service"
      confirmDelete={s => `Delete service "${s.abbrev}"? This only removes it from the library - existing equipment records are unaffected.`}
      saveErrorFallback="Could not save the service"
      deleteErrorFallback="Could not delete the service"
    />
  );
}

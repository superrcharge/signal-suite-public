import { useMemo } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { useTransports, useCreateTransport, useUpdateTransport, useDeleteTransport } from '@/services';
import { VocabField } from '@/components/shf-form/VocabField';
import { transportKindLabel, transportKindOptions } from '@/types';
import type { Transport, TransportKind } from '@/types';
import { Empty, LibInput, NameAndDesc, ReferenceLibraryPane } from './ReferenceLibraryPane';
import { trailingCell } from './reference-library-cells';

interface Draft { name: string; kind: TransportKind; provider: string; description: string }

// Mirrors the `max=` tags on the request DTOs. Capped as typed rather than
// caught at save: the server 400s on a longer value, and a limit the user only
// discovers on Save reads as the form having eaten their text.
// `kind` is uncapped server-side and comes from the picker anyway.
const TRANSPORT_NAME_MAX = 120;
const TRANSPORT_PROVIDER_MAX = 120;
const TRANSPORT_DESC_MAX = 500;

const EMPTY_DRAFT: Draft = { name: '', kind: '', provider: '', description: '' };

/**
 * The Transport Library, as a configuration of `ReferenceLibraryPane`.
 *
 * The odd one of the three: four fields rather than three, a vocabulary picker
 * in the middle, and a row whose cells are not in the same order as its form.
 */
/** `readOnly` is for the print route: no add form, no row pencils, whatever the role. */
export function TransportLibraryPane({ readOnly = false }: { readOnly?: boolean }) {
  // canWritePace, matching the transport routes: a transport is a path a PACE
  // tier names, so whoever builds the card may add the path. This read
  // `canWrite` on the belief that transports were equipment-side reference data
  // like services - nothing in the equipment domain has ever referenced them,
  // and a planner could build a card naming a transport they could not create.
  // Its own gate, not one inherited from the page, since the route this pane
  // sits on refuses nobody.
  const { canWritePace } = useAuth();
  const { data, isLoading } = useTransports();
  const createMutation = useCreateTransport();
  const updateMutation = useUpdateTransport();
  const deleteMutation = useDeleteTransport();

  // useMemo, not a bare `?? []` - the fallback is a fresh array literal every
  // render, which would defeat the pane's filter memo entirely.
  const transports = useMemo(() => data?.transports ?? [], [data]);

  // The built-in four plus every kind already in the library, so a kind one
  // squadron adds becomes a suggestion for the next one.
  //
  // Built from the WHOLE library, never from what the pane is currently
  // showing: the kind dropdown offers the vocabulary the library actually
  // holds, and searching the rows is not a statement about which kinds exist.
  // Pinned by a test in comms-library-page.test.tsx using a custom kind,
  // because the four built-ins are offered whether any row uses them or not and
  // so cannot show the difference.
  const kindOptions = transportKindOptions(transports.map(t => t.kind));

  return (
    <ReferenceLibraryPane<Transport, Draft>
      title="Transport Library"
      subtitle="global reference - non-SATCOM paths a PACE tier can name"
      noun="transports"
      singular="Transport"
      items={transports}
      isLoading={isLoading}
      // `kind` is matched as stored, while the row renders
      // transportKindLabel(kind). Every label is a case variant of its stored
      // value and both sides are lowercased, so the two agree today; a label
      // that is not a case variant - an abbreviation, a translation - would be
      // unsearchable by the text on screen.
      searchText={t => [t.name, t.kind, t.provider, t.description].join(' ')}
      itemLabel={t => t.name}
      canWrite={!readOnly && canWritePace}
      emptyDraft={EMPTY_DRAFT}
      draftOf={t => ({ name: t.name, kind: t.kind, provider: t.provider, description: t.description })}
      isComplete={d => d.name.trim().length > 0}
      fieldGrid={{ template: '1.4fr 100px 1fr 2fr', headers: ['Name', 'Kind', 'Provider', 'Description'] }}
      renderFields={(d, set, onEnter) => (
        <>
          <LibInput value={d.name} onChange={v => { set({ ...d, name: v }); }} onEnter={onEnter} placeholder="Verizon LTE" maxLength={TRANSPORT_NAME_MAX} />
          <VocabField
            value={d.kind}
            options={kindOptions}
            onChange={v => { set({ ...d, kind: v }); }}
            placeholder="New kind"
            labelOf={transportKindLabel}
            addLabel="+ Add new kind…"
            emptyLabel="Not set"
          />
          <LibInput value={d.provider} onChange={v => { set({ ...d, provider: v }); }} onEnter={onEnter} placeholder="Provider" maxLength={TRANSPORT_PROVIDER_MAX} />
          <LibInput value={d.description} onChange={v => { set({ ...d, description: v }); }} onEnter={onEnter} placeholder="Brief description" maxLength={TRANSPORT_DESC_MAX} />
        </>
      )}
      // Not the same order as the form, and not a grid: name and description
      // lead, with kind and provider to the right. The header strip above has
      // never lined up with these cells, and that predates the shared pane.
      renderRow={t => (
        <>
          <NameAndDesc name={t.name} description={t.description} />
          <div style={trailingCell(90)}>{transportKindLabel(t.kind)}</div>
          <div style={trailingCell(110)}>{t.provider || <Empty />}</div>
        </>
      )}
      // `kind` is not trimmed: it comes from the picker rather than a text box,
      // so there is nothing to trim and trimming would imply otherwise.
      onCreate={d => createMutation.mutateAsync({ name: d.name.trim(), kind: d.kind, provider: d.provider.trim(), description: d.description.trim() })}
      onSave={(id, d) => updateMutation.mutateAsync({ id, data: d })}
      onDelete={t => deleteMutation.mutateAsync(t.id)}
      isCreating={createMutation.isPending}
      isSaving={updateMutation.isPending}
      createError={createMutation.isError ? createMutation.error : null}
      createErrorFallback="Error creating transport"
      confirmDelete={t => `Delete transport "${t.name}"? This only removes it from the library - existing PACE cards are unaffected.`}
      saveErrorFallback="Could not save the transport"
      deleteErrorFallback="Could not delete the transport"
    />
  );
}

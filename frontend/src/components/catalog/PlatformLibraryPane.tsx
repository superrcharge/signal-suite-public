import { useMemo } from 'react';
import type { CSSProperties } from 'react';

import { useAuth } from '@/contexts/auth-context';
import {
  usePlatforms, useCreatePlatform, useUpdatePlatform, useDeletePlatform,
  useWaveforms, useEquipment,
} from '@/services';
import { EMPTY_VALUE } from '@/utils';
import { inputSty, labelSty, onBlur, onFocus } from '@/components/shf-form/styles';
import { chipSty, chipToggleSty } from '@/components/catalog/chip-styles';
import { BRANCHES, BRANCH_NAMES, PLATFORM_TYPES, platformTypeLabel } from '@/types';
import type { Branch, Equipment, Platform, PlatformType } from '@/types';
import { ReferenceLibraryPane, type LibraryFacet } from './ReferenceLibraryPane';
import { branchChip, branchToggleSty } from './branch-colors';

// Mirrors the `max=` tags on platform's request DTOs. Capped as typed rather
// than caught at save: the server 400s on a longer value, and a limit the user
// only discovers on Save reads as the form having eaten their text.
//
// `category` and `type` are absent: both are closed lists, picked rather
// than typed, so there is nothing to cap.
const PLATFORM_DESIGNATION_MAX = 60;
const PLATFORM_POPULAR_NAME_MAX = 120;
const PLATFORM_NOTES_MAX = 1000;

// The row chips' text sizes. Up from the shared 9 and 10, which read small on
// the library's dark rows; the matrix keeps 9, since its column heads are
// 76px wide.
const LIBRARY_CHIP_TEXT = 10.5;
const LIBRARY_TILE_TEXT = 11;

interface Draft {
  designation: string;
  popular_name: string;
  category: Branch[];
  type: PlatformType;
  waveform_abbrevs: string[];
  equipment_ids: string[];
  notes: string;
}

const EMPTY_DRAFT: Draft = {
  designation: '', popular_name: '', category: [], type: 'aircraft',
  waveform_abbrevs: [], equipment_ids: [], notes: '',
};

function draftOf(p: Platform): Draft {
  return {
    designation: p.designation,
    popular_name: p.popular_name,
    category: branchesOf(p),
    // A response cached from before migration 045 has no `type`; the column
    // default keeps the select controlled until the refetch lands.
    type: p.type ?? 'aircraft',
    waveform_abbrevs: [...p.waveform_abbrevs],
    equipment_ids: [...p.equipment_ids],
    notes: p.notes,
  };
}

/**
 * A platform's branches in precedence order, and only real branches. The
 * server already stores them that way; reading through BRANCHES as well means
 * a response cached from before migration 044, whose category is the string
 * "joint", draws as no branch rather than as five letters.
 */
function branchesOf(p: Platform): Branch[] {
  const have: readonly string[] = Array.isArray(p.category) ? p.category : [];
  return BRANCHES.filter(b => have.includes(b));
}

function radioLabel(e: Equipment): string {
  return e.nomenclature || e.nickname || e.id;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * The editable body shared by Add and Edit, so the two cannot drift in which
 * fields they offer.
 */
function PlatformFields({ draft, setDraft, libraryAbbrevs, radios, onEnter }: {
  draft: Draft;
  setDraft: (next: Draft) => void;
  libraryAbbrevs: string[];
  radios: Equipment[];
  onEnter?: () => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && onEnter) onEnter(); };
  const row: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 };

  // A waveform on the record that the library no longer holds is still shown,
  // as a chip that can be switched off - the same tolerance the equipment
  // editor's orphan chips have. Silently dropping it would lose it on save.
  const known = new Set(libraryAbbrevs.map(norm));
  const orphans = draft.waveform_abbrevs.filter(a => !known.has(norm(a)));
  const hasAbbrev = (a: string) => draft.waveform_abbrevs.some(x => norm(x) === norm(a));
  const toggleAbbrev = (a: string) => set('waveform_abbrevs', hasAbbrev(a)
    ? draft.waveform_abbrevs.filter(x => norm(x) !== norm(a))
    : [...draft.waveform_abbrevs, a]);

  const radioIds = new Set(radios.map(r => r.id));
  const missingIds = draft.equipment_ids.filter(id => !radioIds.has(id));
  const toggleRadio = (id: string) => set('equipment_ids', draft.equipment_ids.includes(id)
    ? draft.equipment_ids.filter(x => x !== id)
    : [...draft.equipment_ids, id]);

  return (
    <>
      <div style={row}>
        <div>
          <div style={labelSty}>Designation *</div>
          <input value={draft.designation} onChange={e => set('designation', e.target.value)} onKeyDown={enter} style={{ ...inputSty, fontSize: 12 }} onFocus={onFocus} onBlur={onBlur} placeholder="F-35A" aria-label="Designation" maxLength={PLATFORM_DESIGNATION_MAX} />
        </div>
        <div>
          <div style={labelSty}>Popular Name</div>
          <input value={draft.popular_name} onChange={e => set('popular_name', e.target.value)} onKeyDown={enter} style={{ ...inputSty, fontSize: 12 }} onFocus={onFocus} onBlur={onBlur} placeholder="Lightning II" aria-label="Popular name" maxLength={PLATFORM_POPULAR_NAME_MAX} />
        </div>
      </div>
      <div style={{ ...row, gridTemplateColumns: '2fr 1fr' }}>
        <div>
          {/* Toggles, not a select: a platform is often flown by more than
              one branch, and the list is closed, so there is nothing to type.
              Kept in BRANCHES order whatever order they are clicked in, the
              same order the server stores. */}
          <div style={labelSty}>Category - branch</div>
          <div role="group" aria-label="Category - branch" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {BRANCHES.map(b => {
              const on = draft.category.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  aria-pressed={on}
                  title={BRANCH_NAMES[b]}
                  onClick={() => set('category', on ? draft.category.filter(x => x !== b) : BRANCHES.filter(x => x === b || draft.category.includes(x)))}
                  style={branchToggleSty(b, on)}
                >
                  {b}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          {/* A fixed list since migration 045, so a plain select: there is no
              "add new" entry to offer. */}
          <div style={labelSty}>Type</div>
          <select
            aria-label="Type"
            value={draft.type}
            onChange={e => { set('type', e.target.value as PlatformType); }}
            style={{ ...inputSty, fontSize: 12 }}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            {PLATFORM_TYPES.map(t => <option key={t} value={t}>{platformTypeLabel(t)}</option>)}
          </select>
        </div>
      </div>

      <div style={labelSty}>Waveforms carried</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {libraryAbbrevs.length === 0 && orphans.length === 0 && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, fontStyle: 'italic', color: 'var(--shf-graphite-400)' }}>The waveform library is empty.</span>
        )}
        {libraryAbbrevs.map(a => (
          <button key={a} type="button" aria-pressed={hasAbbrev(a)} onClick={() => toggleAbbrev(a)} style={chipToggleSty(hasAbbrev(a))}>{a}</button>
        ))}
        {orphans.map(a => (
          <button key={'o-' + a} type="button" aria-pressed title="Not in the waveform library" onClick={() => toggleAbbrev(a)} style={{ ...chipToggleSty(true), textDecoration: 'line-through' }}>{a}</button>
        ))}
      </div>

      <div style={labelSty}>Catalog radios carried</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {radios.length === 0 && missingIds.length === 0 && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, fontStyle: 'italic', color: 'var(--shf-graphite-400)' }}>No radios in the catalog.</span>
        )}
        {radios.map(r => {
          const on = draft.equipment_ids.includes(r.id);
          return <button key={r.id} type="button" aria-pressed={on} onClick={() => toggleRadio(r.id)} style={chipToggleSty(on)}>{radioLabel(r)}</button>;
        })}
        {missingIds.map(id => (
          <button key={'m-' + id} type="button" aria-pressed title="This catalog record no longer exists" onClick={() => toggleRadio(id)} style={{ ...chipToggleSty(true), textDecoration: 'line-through' }}>missing record</button>
        ))}
      </div>

      <div style={labelSty}>Notes</div>
      <input value={draft.notes} onChange={e => set('notes', e.target.value)} onKeyDown={enter} style={{ ...inputSty, fontSize: 12 }} onFocus={onFocus} onBlur={onBlur} placeholder="Brief note" aria-label="Notes" maxLength={PLATFORM_NOTES_MAX} />
    </>
  );
}

/**
 * External comms platforms - airframes, ships, ground stations - entered once
 * and read as columns of the joint compatibility matrix.
 *
 * A configuration of `ReferenceLibraryPane`, and the one that exercises its
 * escape hatches: no field grid, so no column header strip, a form body that is
 * two grids and two chip strips rather than a row of cells, and a two-level row.
 */
/** `readOnly` is for the print route: no add form, no row pencils, whatever the role. */
export function PlatformLibraryPane({ readOnly = false }: { readOnly?: boolean }) {
  // canWritePace, matching platform/routes.go: a platform is a column of the
  // compatibility matrix a PACE planner reads, so PACE's writers maintain it.
  // Its own gate, not one inherited from the page, since the route this pane
  // sits on refuses nobody.
  const { canWritePace } = useAuth();
  const { data, isLoading } = usePlatforms();
  const { data: wfData } = useWaveforms();
  const { data: eqData } = useEquipment({ type: 'radio' });
  const createMutation = useCreatePlatform();
  const updateMutation = useUpdatePlatform();
  const deleteMutation = useDeletePlatform();

  const platforms = useMemo(() => data?.platforms ?? [], [data]);
  const libraryAbbrevs = useMemo(() => (wfData?.waveforms ?? []).map(w => w.abbrev), [wfData]);
  // Filtered again client-side. The query param narrows the request and this
  // narrows the response: the API filter and the record field are two
  // different contracts, and only the second one is checkable here.
  const radios = useMemo(
    () => (eqData?.equipment ?? []).filter(e => e.terminal_type === 'radio'),
    [eqData],
  );
  const radioById = useMemo(() => new Map(radios.map(r => [r.id, r])), [radios]);

  // The filter bar: what a platform is, not what it carries - that is on its
  // row and answered by the compatibility matrix.
  // Memoised: a fresh array every render would recount both facets over the
  // whole library on every keystroke in the search box.
  const facets = useMemo<LibraryFacet<Platform>[]>(() => [
    { label: 'Category', valuesOf: branchesOf, order: BRANCHES, titleOf: v => BRANCH_NAMES[v as Branch] ?? v },
    // Guarded like branchesOf: a response cached from before migration 045
    // carries `kind`, not `type`, and must draw rather than throw.
    { label: 'Type', valuesOf: p => (p.type ? [p.type] : []), order: PLATFORM_TYPES, labelOf: platformTypeLabel },
  ], []);

  return (
    <ReferenceLibraryPane<Platform, Draft>
      title="Platform Library"
      subtitle="global reference - airframes, ships and ground stations for the compatibility matrix"
      noun="platforms"
      singular="Platform"
      items={platforms}
      isLoading={isLoading}
      // `notes` and `equipment_ids` are deliberately not searched: the first is
      // free prose nobody looks a platform up by, and the second is a list of
      // opaque ids.
      searchText={p => [p.designation, p.popular_name, ...branchesOf(p), p.type, ...p.waveform_abbrevs].join(' ')}
      itemLabel={p => p.designation}
      canWrite={!readOnly && canWritePace}
      emptyDraft={EMPTY_DRAFT}
      draftOf={draftOf}
      isComplete={d => d.designation.trim().length > 0}
      // No fieldGrid: this form is two grids and two chip strips, not a row of
      // cells, so there is no column template and no header strip to draw.
      renderFields={(draft, setDraft, onEnter) => (
        <PlatformFields
          draft={draft}
          setDraft={setDraft}
          libraryAbbrevs={libraryAbbrevs}
          radios={radios}
          onEnter={onEnter}
        />
      )}
      renderRow={p => (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--shf-paper)' }}>{p.designation}</span>
            {p.popular_name && <span style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--shf-graphite-300)', marginLeft: 8 }}>{p.popular_name}</span>}
          </div>
          {/* One chip per branch, in precedence order. Sized for four - the
              most any platform in the library carries - and wrapping past
              that rather than running under the edit button. */}
          <div title={branchesOf(p).map(b => BRANCH_NAMES[b]).join(', ') || undefined} style={{ width: 170, flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {branchesOf(p).length > 0
              ? branchesOf(p).map(b => <span key={b} style={branchChip(b, LIBRARY_CHIP_TEXT)}>{b}</span>)
              : <span style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--shf-graphite-500)', fontStyle: 'italic' }}>{EMPTY_VALUE}</span>}
          </div>
          <div style={{ width: 110, flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--shf-graphite-300)', textTransform: 'capitalize' }}>{p.type}</div>
        </>
      )}
      // The second level of the row, and the only pane that has one: what the
      // platform carries, as plain labels. They filtered the list until the
      // filter bar moved to category and type; a label that looks clickable
      // and is not reads as broken, so these are spans, not buttons. Null
      // rather than an empty strip, so a platform carrying nothing does not
      // grow a blank line.
      facets={facets}
      renderRowExtra={p => (
        (p.waveform_abbrevs.length > 0 || p.equipment_ids.length > 0) ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {p.waveform_abbrevs.map(a => <span key={a} style={{ ...chipSty('amber'), fontSize: LIBRARY_TILE_TEXT }} title="Carried waveform">{a}</span>)}
            {p.equipment_ids.map(id => {
              const r = radioById.get(id);
              return <span key={id} style={{ ...chipSty('paper'), fontSize: LIBRARY_TILE_TEXT }} title="Carried catalog radio">{r ? radioLabel(r) : 'missing record'}</span>;
            })}
          </div>
        ) : null
      )}
      // Only `designation` is trimmed, as before. The other three panes trim
      // every text field on create; making platform match would be an
      // improvement AND a behaviour change inside a conversion, so it is left
      // for its own commit.
      onCreate={d => createMutation.mutateAsync({ ...d, designation: d.designation.trim() })}
      onSave={(id, d) => updateMutation.mutateAsync({ id, data: d })}
      onDelete={p => deleteMutation.mutateAsync(p.id)}
      isCreating={createMutation.isPending}
      isSaving={updateMutation.isPending}
      createError={createMutation.isError ? createMutation.error : null}
      createErrorFallback="Error creating platform"
      confirmDelete={p => `Delete platform "${p.designation}"? It will drop out of the compatibility matrix.`}
      saveErrorFallback="Could not save the platform"
      deleteErrorFallback="Could not delete the platform"
    />
  );
}

import { useMemo, useState } from 'react';
import { CONTENT_LINE } from '@/components/common/banner-controls';
import { sheetOmitProps, sheetRootProps } from '@/components/common/sheet-export/sheet-root';
import type { CSSProperties, ReactNode } from 'react';

import { useToast } from '@/contexts';
import { errorMessage } from '@/services/api-client';
import { EMPTY_VALUE } from '@/utils';
import { addDashedBtn, iconToolbarBtn, inputSty, labelSty, onBlur, onFocus } from '@/components/shf-form/styles';
import { chipSty } from './chip-styles';
import { usageCell } from './reference-library-cells';
import '@/styles/catalog-tokens.css';

// ─── Shared cell chrome, used by the wrappers' renderRow ─────────────────────

const ellipsis: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

/**
 * The pane's one horizontal inset, used by the toolbar and the body alike.
 *
 * 20 because it matches `PageBanner`'s rail padding (`px: 2.5`), so the page
 * title above, this pane's title and subtitle, the add form and the list all
 * start on one line. The toolbar was once 14 while the body was 20, which put
 * the library title 6px left of everything around it; one constant for both is
 * what stops that recurring.
 */
// 28, not 20: the line the banner's Print / Save PDF ends on and the catalog
// cards end on, so the rows' right edge meets the button above them.
const PANE_INSET = CONTENT_LINE;

export function Empty() {
  return <span style={{ color: 'var(--shf-graphite-500)', fontStyle: 'italic' }}>{EMPTY_VALUE}</span>;
}

/**
 * The flexible name-over-description block every row has.
 *
 * `showEmpty` because the fallback is deliberately not uniform: waveform and
 * service fall back to the em-dash when a name is blank, transport does not
 * because its name is required. Normalising that would be a behaviour change
 * dressed as tidying.
 *
 * The description gets ONE line at a fixed height. It was two: the Comms
 * Library is the only place a description is shown, so the case for showing
 * more of it was real. But nearly every description is a single short
 * sentence, and the reserved second line was empty on almost every row - the
 * list read as wasted vertical space, which is what the maintainer called it.
 * Text past one line clamps with an ellipsis and stays readable in full as
 * the tooltip.
 *
 * The height is fixed on this element, and the element is drawn even when the
 * description is empty; together those keep every row the same height whatever
 * the text. Reserving the height on the container instead was tried and
 * measured short, from this element's 1px margin and line-height rounding.
 */
export function NameAndDesc({ name, description, showEmpty = false }: {
  name: string;
  description?: string;
  showEmpty?: boolean;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--shf-paper)', ...ellipsis }}>
        {name || (showEmpty ? <Empty /> : null)}
      </div>
      <div
        title={description || undefined}
        style={{
          fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--shf-graphite-300)', marginTop: 1,
          lineHeight: 1.35, height: '1.35em',
          display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', whiteSpace: 'normal',
        }}
      >
        {description}
      </div>
    </div>
  );
}

/**
 * Which assets use a library entry: a count in the row line, and the names in
 * `UsageNames` - a column beside it on a wide screen, a strip beneath on a
 * narrow one.
 *
 * Rendered by the wrapper panes through `renderRow` and `renderRowExtra`, so
 * this component never learns the word "usage" - it exists because four
 * near-copies drifted, and a domain-specific prop is the regression its
 * docstring was written to prevent.
 *
 * `names` being empty means nothing uses the entry, which is a real and useful
 * answer rather than a missing one: the backend omits an unused abbrev from the
 * map entirely, so a caller reads `usage[key] ?? []` and gets zero, never
 * "not loaded yet".
 */
export function UsageCount({ names, noun }: { names: string[]; noun: string }) {
  return (
    <div style={usageCell}>
      {names.length === 0
        ? <span style={{ color: 'var(--shf-graphite-500)' }}>unused</span>
        : `${String(names.length)} ${names.length === 1 ? noun : `${noun}s`}`}
    </div>
  );
}

/**
 * The names themselves, as a column in the row line or a strip beneath it.
 *
 * `column` is the wide layout: a fixed-basis cell rendered even when empty,
 * because a cell that disappears on unused rows would shift nothing but would
 * leave the chips of neighbouring rows starting at different x - the uneven
 * edge the column exists to remove. The count beside it already says "unused".
 *
 * `strip` is the narrow layout, beneath the row: null when empty, following the
 * platform pane's chip strip - an unused entry must not grow a blank line.
 */
export function UsageNames({ names, layout }: { names: string[]; layout: 'column' | 'strip' }) {
  const chips = names.map(n => <span key={n} style={chipSty('paper')}>{n}</span>);
  if (layout === 'column') {
    return <div style={{ flex: '0 0 30%', minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 4 }}>{chips}</div>;
  }
  if (names.length === 0) return null;
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>{chips}</div>;
}

/** A field in the add or edit form. `onEnter` is bound only in the add form. */
export function LibInput({ value, onChange, placeholder, onEnter, maxLength }: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  onEnter?: () => void;
  maxLength?: number;
}) {
  return (
    <input
      value={value}
      onChange={e => { onChange(e.target.value); }}
      onKeyDown={onEnter && (e => { if (e.key === 'Enter') onEnter(); })}
      style={{ ...inputSty, fontSize: 12 }}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      maxLength={maxLength}
    />
  );
}

// ─── The pane ────────────────────────────────────────────────────────────────

export interface ReferenceLibraryPaneProps<T extends { id: string }, D> {
  title: string;
  subtitle: string;
  /** Lowercase plural. Drives the search box and all three empty states. */
  noun: string;
  /** Title-case singular. Drives the "Add Waveform" form heading; the commit button says "+ Add to {title}". */
  singular: string;

  /** UNFILTERED. The pane owns `search` - see the note on searchText. */
  items: T[];
  isLoading: boolean;
  /**
   * The haystack one row is searched on. The pane filters rather than the
   * caller, because the add-form separator, the column headers and all three
   * empty states key off the FILTERED length, and clearing the search is part
   * of a successful create.
   */
  searchText: (item: T) => string;
  /** The identifier a row's aria-labels name. */
  itemLabel: (item: T) => string;

  /**
   * Required, never optional and never defaulted.
   *
   * `/catalog/comms-library` is an ungated route; these panes ARE the gate.
   * A default of true fails open into a public write surface; a default of
   * false fails silently closed and gets "fixed" by someone passing true.
   */
  canWrite: boolean;

  emptyDraft: D;
  draftOf: (item: T) => D;
  /** False disables both Create and Save. */
  isComplete: (draft: D) => boolean;
  /**
   * The add/edit grid and its column headers. Omitted for a pane whose form is
   * not a row of cells - the header strip is then not drawn either.
   */
  fieldGrid?: { template: string; headers: string[] };
  renderFields: (draft: D, set: (next: D) => void, onEnter?: () => void) => ReactNode;

  /** The cells inside a row's flex line, left of the edit/delete buttons. */
  renderRow: (item: T) => ReactNode;
  /** An optional block beneath that line, for a pane with a two-level row. */
  renderRowExtra?: (item: T) => ReactNode;

  /**
   * Promises, not react-query mutation objects.
   *
   * `mutate(vars, { onSuccess })` gives this component no rejection branch, and
   * it owns `editingId`, so it owns whether the editor closes on a failure.
   */
  onCreate: (draft: D) => Promise<unknown>;
  onSave: (id: string, draft: D) => Promise<unknown>;
  onDelete: (item: T) => Promise<unknown>;
  isCreating: boolean;
  isSaving: boolean;

  /** Rendered inline under the add form, deliberately not toasted. */
  createError: unknown;
  createErrorFallback: string;
  confirmDelete: (item: T) => string;
  saveErrorFallback: string;
  deleteErrorFallback: string;
  /** Toast on a successful delete. Omit for none. */
  deletedMessage?: (item: T) => string;
}

/**
 * One screen for the reference libraries: a searchable list of rows, an add
 * form above it, and an inline editor per row.
 *
 * Previously four near-copies under `components/catalog/`. The duplication was
 * inherited from `catalog-editor-page.tsx` rather than introduced, but the move
 * that gave each pane its own file is what made drift between them silent - and
 * they had drifted four ways for one interaction. Only one capped input length;
 * only one surfaced a failed save; only one labelled its row buttons.
 *
 * **This component owns save and delete error reporting for every caller.** It
 * is not a choice: it owns `editingId`, so it decides whether the editor closes,
 * which means it must await and branch on rejection. Having done so, its only
 * options are to swallow the failure or to surface it. Create keeps its inline
 * red note, so create is unchanged and nothing double-reports.
 */
export function ReferenceLibraryPane<T extends { id: string }, D>({
  title, subtitle, noun, singular,
  items, isLoading, searchText, itemLabel,
  canWrite,
  emptyDraft, draftOf, isComplete, fieldGrid, renderFields,
  renderRow, renderRowExtra,
  onCreate, onSave, onDelete, isCreating, isSaving,
  createError, createErrorFallback, confirmDelete,
  saveErrorFallback, deleteErrorFallback, deletedMessage,
}: ReferenceLibraryPaneProps<T, D>) {
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  // Filtering the binding rather than the render keeps the separator, the
  // column headers and the empty state below honest about what is on screen.
  const shown = useMemo(
    () => (query ? items.filter(item => searchText(item).toLowerCase().includes(query)) : items),
    [items, query, searchText],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<D>(emptyDraft);
  const [newDraft, setNewDraft] = useState<D>(emptyDraft);

  const startEdit = (item: T) => {
    setEditingId(item.id);
    setEditDraft(draftOf(item));
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = async (id: string) => {
    try {
      await onSave(id, editDraft);
      setEditingId(null);
    } catch (err) {
      showToast(errorMessage(err, saveErrorFallback), { severity: 'error' });
    }
  };

  const handleCreate = async () => {
    if (!isComplete(newDraft)) return;
    try {
      await onCreate(newDraft);
      // The search clears with the form. Leaving it set filters the row that
      // was just created straight back out, so a successful create is
      // indistinguishable from one that silently failed.
      setNewDraft(emptyDraft);
      setSearch('');
    } catch {
      // Reported inline by `createError`, so the draft survives for a retry.
    }
  };

  const handleDelete = async (item: T) => {
    if (!window.confirm(confirmDelete(item))) return;
    try {
      await onDelete(item);
      if (deletedMessage) showToast(deletedMessage(item));
    } catch (err) {
      showToast(errorMessage(err, deleteErrorFallback), { severity: 'error' });
    }
  };

  const fieldRow: CSSProperties = fieldGrid
    ? { display: 'grid', gridTemplateColumns: fieldGrid.template, gap: '0 8px', marginBottom: 6, alignItems: 'center' }
    : { marginBottom: 6 };
  const colHdr: CSSProperties = { ...labelSty, marginBottom: 0 };
  const emptyNote: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 12, fontStyle: 'italic', color: 'var(--shf-graphite-400)' };

  return (
    // No overflow/flex sizing and no right border: both were for the editor's
    // fixed-height 3-pane grid, where this was a scrolling column beside two
    // others. On a page of its own it has no definite height, so they were
    // inert, and the border drew a rule down the middle of nothing.
    // The sheet root for share (image, clipboard, slide): the whole pane,
    // title bar included. The search box, the add form and the row pencils
    // are marked to stay out of the picture, so share matches what the print
    // route prints for a reader with no write access - a writer's slide used
    // to carry a search field and a blank form.
    <div {...sheetRootProps()} style={{ display: 'flex', flexDirection: 'column', background: 'var(--shf-graphite-900)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `8px ${String(PANE_INSET)}px`, flexShrink: 0, background: 'var(--shf-graphite-800)', borderBottom: '1px solid var(--shf-graphite-700)' }}>
        {/* One line, title then description after a hyphen, so the toolbar
            stays a single row; stacked, the subtitle made the bar a line
            taller than the search box beside it for eleven words of caption. */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--shf-amber)', whiteSpace: 'nowrap' }}>{title}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--shf-graphite-400)', letterSpacing: '0.08em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span aria-hidden="true">- </span>{subtitle}
          </span>
        </div>
        <input
          {...sheetOmitProps()}
          value={search}
          onChange={e => { setSearch(e.target.value); }}
          placeholder={`Search ${noun}`}
          aria-label={`Search ${noun}`}
          style={{ ...inputSty, width: 260, flexShrink: 0, fontSize: 11, background: 'var(--shf-graphite-900)' }}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </div>

      <div style={{ padding: `16px ${String(PANE_INSET)}px` }}>
        {/* Add sits above the list, not below it: the list is the long,
            scrolling part, and a form under it is a form you have to scroll
            past everything to reach. Writers only. */}
        {canWrite && (
          <div {...sheetOmitProps('block')} style={{ marginBottom: shown.length > 0 ? 16 : 0, paddingBottom: shown.length > 0 ? 16 : 0, borderBottom: shown.length > 0 ? '1px solid var(--shf-graphite-700)' : 'none' }}>
            <div style={{ ...labelSty, marginBottom: 8 }}>Add a {singular.toLowerCase()} below:</div>
            {/* Column headers label the inputs, which share their grid template
                and so line up with them. They used to sit above the list, where
                they lined up with nothing: rows are a flex line of their own
                cells, not this grid. */}
            {fieldGrid && (
              <div style={{ ...fieldRow, marginBottom: 4 }}>
                {fieldGrid.headers.map(h => <div key={h} style={colHdr}>{h}</div>)}
              </div>
            )}
            <div style={fieldRow}>
              {renderFields(newDraft, setNewDraft, () => { void handleCreate(); })}
            </div>
            <button
              onClick={() => { void handleCreate(); }}
              disabled={!isComplete(newDraft) || isCreating}
              style={{ ...addDashedBtn, opacity: !isComplete(newDraft) ? 0.5 : 1 }}
            >
              + Add to {title}
            </button>
            {createError != null && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#D43A2F', marginTop: 6 }}>
                {createError instanceof Error ? createError.message : createErrorFallback}
              </div>
            )}
          </div>
        )}

        {isLoading && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--shf-graphite-400)' }}>Loading…</div>}

        {/* Three reasons this list can be empty and they are not the same
            thing: nothing has been added and you can fix that, nothing has
            been added and you cannot, or your search excluded everything.
            Saying none of them leaves a blank pane that reads as broken. */}
        {!isLoading && shown.length === 0 && (
          <div style={emptyNote}>
            {items.length === 0
              ? (canWrite ? `No ${noun} yet. Add one above.` : `No ${noun} yet.`)
              : `No ${noun} match "${search.trim()}".`}
          </div>
        )}

        {shown.map(item => (
          <div key={item.id} style={{ marginBottom: 4 }}>
            {editingId === item.id ? (
              <div style={{ border: '1px solid var(--shf-amber)', borderRadius: 2, padding: 10, background: 'var(--shf-graphite-800)' }}>
                <div style={fieldRow}>{renderFields(editDraft, setEditDraft)}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    onClick={() => { void saveEdit(item.id); }}
                    disabled={isSaving || !isComplete(editDraft)}
                    style={{ padding: '5px 12px', background: 'var(--shf-amber)', color: 'var(--shf-black)', border: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: 2, cursor: 'pointer' }}
                  >
                    Save
                  </button>
                  <button onClick={cancelEdit} style={{ padding: '5px 12px', background: 'transparent', color: 'var(--shf-paper)', border: '1px solid var(--shf-graphite-600)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: 2, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '5px 10px', background: 'var(--shf-graphite-800)', border: '1px solid var(--shf-graphite-600)', borderRadius: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {renderRow(item)}
                  {canWrite && (
                    <div {...sheetOmitProps()} style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button aria-label={`Edit ${itemLabel(item)}`} onClick={() => { startEdit(item); }} style={{ ...iconToolbarBtn, width: 26, height: 26 }}>✎</button>
                      <button aria-label={`Delete ${itemLabel(item)}`} onClick={() => { void handleDelete(item); }} style={{ ...iconToolbarBtn, width: 26, height: 26, color: '#D43A2F', borderColor: 'rgba(212,58,47,0.4)' }}>✕</button>
                    </div>
                  )}
                </div>
                {renderRowExtra?.(item)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

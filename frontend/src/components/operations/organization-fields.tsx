import type { CSSProperties } from 'react';

import { inputSty, labelSty, onBlur, onFocus } from '@/components/shf-form/styles';
import { chipToggleSty } from '@/components/catalog/chip-styles';
import { branchToggleSty } from '@/components/catalog/branch-colors';
import { SECTION_COLOR_PALETTE } from '@/theme/asset-colors';
import { BRANCHES, BRANCH_NAMES } from '@/types';
import type { OrganizationDraft } from '@/components/catalog/organization-draft';

// The organization form, as the Join Operation wizard's "Add to library"
// and the Settings page's Organizations tab draw it. It was the body of a
// Comms Library pane until 2026-10-09, when the pane went; the form moved
// here whole, so the wizard did not lose it. What a complete draft is and
// what is sent live beside the draft, in organization-draft.ts.

// Mirrors the `max=` tags on organization's request DTOs. Capped as typed
// rather than caught at save, for the reason the platform pane gives: the
// server 400s on a longer value, and a limit the user only meets on Save
// reads as the form having eaten their text.
const ORGANIZATION_KEY_MAX = 50;
const ORGANIZATION_NAME_MAX = 120;
const ORGANIZATION_SHORT_LABEL_MAX = 20;
const ORGANIZATION_NOTES_MAX = 1000;

type Draft = OrganizationDraft;

/**
 * The editable body of the organization form. `mode` keeps Add and Edit from
 * drifting in which fields they offer should an editor return.
 *
 * `mode` is the one place they differ: the key is typed on Add and read-only
 * on Edit, because the server has no rename and a key box that accepted edits
 * it then refused would read as a save that lost the change.
 */
export function OrganizationFields({ draft, setDraft, sections, mode, onEnter }: {
  draft: Draft;
  setDraft: (next: Draft) => void;
  sections: { key: string; label: string }[];
  mode: 'add' | 'edit';
  onEnter?: () => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && onEnter) onEnter(); };
  const row: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 };
  const hint: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--shf-graphite-400)', marginTop: 3 };

  // The section dialog's palette, plus the stored colour when it is not in
  // it: the seeded organizations carry their own hues, and a swatch row that
  // showed nothing pressed for them would read as "no colour set".
  const swatches = draft.color && !SECTION_COLOR_PALETTE.some(c => c === draft.color)
    ? [draft.color, ...SECTION_COLOR_PALETTE]
    : [...SECTION_COLOR_PALETTE];

  return (
    <>
      <div style={row}>
        <div>
          <div style={labelSty}>Key *</div>
          {mode === 'add' ? (
            <>
              <input value={draft.key} onChange={e => set('key', e.target.value)} onKeyDown={enter} style={{ ...inputSty, fontSize: 12, fontFamily: 'var(--font-mono)' }} onFocus={onFocus} onBlur={onBlur} placeholder="3rd_sqdn" aria-label="Key" maxLength={ORGANIZATION_KEY_MAX} />
              <div style={hint}>lowercase letters, digits and underscores; cannot be changed later</div>
            </>
          ) : (
            // A value, not a disabled input: a greyed box invites a click
            // that does nothing, and the hint above says why there is no box.
            <div aria-label="Key" style={{ ...inputSty, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--shf-graphite-300)', background: 'transparent', borderStyle: 'dashed' }}>{draft.key}</div>
          )}
        </div>
        <div>
          <div style={labelSty}>Name *</div>
          <input value={draft.name} onChange={e => set('name', e.target.value)} onKeyDown={enter} style={{ ...inputSty, fontSize: 12 }} onFocus={onFocus} onBlur={onBlur} placeholder="3rd Squadron" aria-label="Name" maxLength={ORGANIZATION_NAME_MAX} />
        </div>
      </div>
      <div style={{ ...row, gridTemplateColumns: '1fr 2fr' }}>
        <div>
          <div style={labelSty}>Short label</div>
          {/* Drawn uppercase and stored as typed: the label is a badge on an
              operation's participant rows, and the badge is what is
              uppercase, not the record. */}
          <input value={draft.short_label} onChange={e => set('short_label', e.target.value)} onKeyDown={enter} style={{ ...inputSty, fontSize: 12, textTransform: 'uppercase' }} onFocus={onFocus} onBlur={onBlur} placeholder="3SQDN" aria-label="Short label" maxLength={ORGANIZATION_SHORT_LABEL_MAX} />
        </div>
        <div>
          {/* Toggles like the platform pane's, but one at a time: an
              organization belongs to one branch or to none, so the leading
              None is the way to clear a pressed branch. Exactly one is
              pressed at any moment. */}
          <div style={labelSty}>Branch</div>
          {/* Named apart from the filter bar's Branch row, which is a group too. */}
          <div role="group" aria-label="Branch picker" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button
              type="button"
              aria-pressed={draft.branch === ''}
              title="No branch"
              onClick={() => set('branch', '')}
              style={chipToggleSty(draft.branch === '', true)}
            >
              None
            </button>
            {BRANCHES.map(b => {
              const on = draft.branch === b;
              return (
                <button
                  key={b}
                  type="button"
                  aria-pressed={on}
                  title={BRANCH_NAMES[b]}
                  onClick={() => set('branch', b)}
                  style={branchToggleSty(b, on)}
                >
                  {b}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ ...row, gridTemplateColumns: '2fr 1fr' }}>
        <div>
          {/* The section edit dialog's swatch row, as plain buttons on this
              inline-styled form. Pressing the pressed swatch clears the
              colour, since the field is optional and there is no other way
              to say "none". */}
          <div style={labelSty}>Color</div>
          <div role="group" aria-label="Color" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 0' }}>
            {swatches.map(c => {
              const on = draft.color === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={on}
                  title={c}
                  onClick={() => set('color', on ? '' : c)}
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
        </div>
        <div>
          {/* A plain select over the sections: the list is whatever Settings
              holds, and "Not linked" is a real answer for an outside agency. */}
          <div style={labelSty}>Section link</div>
          <select
            aria-label="Section link"
            value={draft.section_key}
            onChange={e => { set('section_key', e.target.value); }}
            style={{ ...inputSty, fontSize: 12 }}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            <option value="">Not linked</option>
            {sections.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div style={labelSty}>Notes</div>
      <input value={draft.notes} onChange={e => set('notes', e.target.value)} onKeyDown={enter} style={{ ...inputSty, fontSize: 12 }} onFocus={onFocus} onBlur={onBlur} placeholder="Brief note" aria-label="Notes" maxLength={ORGANIZATION_NOTES_MAX} />
    </>
  );
}

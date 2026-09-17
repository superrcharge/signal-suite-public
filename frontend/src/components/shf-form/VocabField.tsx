import { useState } from 'react';

import { inputSty, onBlur, onFocus, selectSty } from './styles';

/**
 * Sentinel option value. Mirrors the '__create__' entry in the Section select on
 * terminal-drawer.tsx: pick from the list, or pick the last entry to type one
 * that is not in it yet. A datalist was tried first and read badly, because
 * typing filters the suggestions away just as you want to see them.
 *
 * Exported so a test can select it without retyping the literal. `allowConstantExport`
 * is on in eslint.config.js, so this sits beside the component rather than in a
 * module of its own.
 */
export const ADD_VOCAB_VALUE = '__add__';

interface VocabFieldProps {
  value: string;
  /** The vocabulary, in the order it should be offered. */
  options: string[];
  onChange: (next: string) => void;
  /** Placeholder for the free-text input the add entry switches to. */
  placeholder: string;
  /**
   * How a stored value is displayed. Identity by default; the transport pane
   * passes `transportKindLabel` so `troposcatter` reads as `Troposcatter`.
   */
  labelOf?: (value: string) => string;
  /**
   * Text of the last entry.
   *
   * A prop rather than a constant because `help-content.test.ts` keys a written
   * exception on the transport pane's exact wording - the step `+ Add new kind…`
   * names an <option>, not a button, and that exception is matched on the
   * literal. Generalising the wording here would break a test complaining about
   * something else entirely.
   */
  addLabel?: string;
  /**
   * A leading empty-value option, and its wording. Transport offers "Not set"
   * because a transport may legitimately have no kind; platform's category and
   * kind always carry one, so it passes nothing.
   *
   * A string rather than a boolean so the wording stays at the call site.
   */
  emptyLabel?: string;
  /** CSS-capitalises the closed select, for a lowercase vocabulary. */
  capitalize?: boolean;
}

/**
 * A select over an open vocabulary, whose last entry types a new value.
 *
 * One control, previously two: `KindField` in `TransportLibraryPane` and a copy
 * in `PlatformLibraryPane` whose own comment said it was "a copy of the
 * transport pane's KindField, generalised over the placeholder". The two bodies
 * differed in seven places, all of which are props here, and the `'__add__'`
 * sentinel was byte-identical in both - only the const name differed.
 *
 * Neither copy had any test coverage. See VocabField.test.tsx.
 */
export function VocabField({
  value,
  options,
  onChange,
  placeholder,
  labelOf = v => v,
  addLabel = '+ Add new…',
  emptyLabel,
  capitalize = false,
}: VocabFieldProps) {
  const [adding, setAdding] = useState(false);

  if (adding) {
    return (
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { onChange(''); setAdding(false); } }}
        onFocus={onFocus}
        onBlur={e => { onBlur(e); if (!value.trim()) setAdding(false); }}
        style={{ ...inputSty, fontSize: 12 }}
        placeholder={placeholder}
      />
    );
  }

  // A custom value already on the record is not in options until it has been
  // saved, so it is appended here or the select would silently blank it.
  const list = value && !options.includes(value) ? [...options, value] : options;

  return (
    <select
      value={value}
      onChange={e => {
        if (e.target.value === ADD_VOCAB_VALUE) { onChange(''); setAdding(true); return; }
        onChange(e.target.value);
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      style={{
        ...inputSty, ...selectSty, fontSize: 12,
        ...(capitalize ? { textTransform: 'capitalize' as const } : {}),
      }}
    >
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {list.map(v => <option key={v} value={v}>{labelOf(v)}</option>)}
      <option value={ADD_VOCAB_VALUE}>{addLabel}</option>
    </select>
  );
}

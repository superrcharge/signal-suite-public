import { useId } from 'react';
/**
 * The SHF editor form primitives.
 *
 * Lifted verbatim out of catalog-editor-page.tsx so the PACE editor can look
 * like the Equipment Catalog editor rather than approximate it. Nothing here
 * depends on the equipment domain -- the two controls that do, SHFFreqRange and
 * SHFWeight, stayed behind.
 *
 * Every colour and font comes from catalog-tokens.css, so a page using these
 * must import that stylesheet.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';

import { EMPTY_VALUE } from '@/utils';
import {
  errorTextSty, inputSty, labelSty, markRowSty, markToggleSty, markedTextColor,
  onBlur, onBlurFor, onFocus, restingBorder, rowSty, selectSty,
} from './styles';

/**
 * The optional "changed" tick. Only the PACE editor passes `onMark`; every
 * other form renders exactly as before, with no tick and no extra padding.
 */
interface MarkProps {
  /** The field's value prints red on the sheet. */
  marked?: boolean;
  onMark?: (on: boolean) => void;
  /** Names the field in the tick's accessible name. Defaults to the label. */
  markName?: string;
}

interface MTProps { marked: boolean; onMark: (on: boolean) => void; name: string; style?: CSSProperties; }
/**
 * A native checkbox rather than an icon button: "tick the box beside anything
 * that changed" is the whole instruction, and a checkbox says it without one.
 * Exported for the one field that is not an SHF primitive, the raw date input.
 */
export function SHFMarkToggle({ marked, onMark, name, style }: MTProps) {
  return (
    <input
      type="checkbox"
      checked={marked}
      onChange={e => onMark(e.target.checked)}
      aria-label={`Mark ${name} as changed`}
      title="Changed since the last version - prints red"
      style={{ ...markToggleSty, ...style }}
    />
  );
}

interface TFProps extends MarkProps { label?: string; value?: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; rows?: number; error?: string; }
export function SHFTextField({ label, value, onChange, placeholder, multiline, rows = 3, error, marked = false, onMark, markName }: TFProps) {
  const id = useId();
  // Described rather than labelled: the field keeps its own label, and a screen
  // reader reads the reason after it instead of in place of it.
  const errId = `${id}-error`;
  const described = { 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? errId : undefined };
  const bordered: CSSProperties = {
    ...inputSty,
    borderColor: restingBorder(Boolean(error)),
    // A flex child beside the tick; without it the input keeps its intrinsic
    // width and pushes the tick off a narrow table cell.
    ...(onMark ? { minWidth: 0 } : null),
    ...(marked ? { color: markedTextColor } : null),
  };
  const control = multiline ? (
    <textarea
      id={id}
      rows={rows}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onFocus={onFocus} onBlur={onBlurFor(Boolean(error))}
      style={{ ...bordered, resize: 'vertical', minHeight: rows * 20 }}
      {...described}
    />
  ) : (
    <input
      id={id}
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onFocus={onFocus} onBlur={onBlurFor(Boolean(error))}
      style={bordered}
      {...described}
    />
  );
  return (
    <div style={rowSty}>
      {label && <label style={labelSty} htmlFor={id}>{label}</label>}
      {onMark ? (
        // A textarea grows, so its tick stays level with the first line.
        <div style={multiline ? { ...markRowSty, alignItems: 'flex-start' } : markRowSty}>
          {control}
          <SHFMarkToggle
            marked={marked}
            onMark={onMark}
            name={markName ?? label ?? placeholder ?? 'field'}
            style={multiline ? { marginTop: 9 } : undefined}
          />
        </div>
      ) : control}
      {error && <span id={errId} style={errorTextSty}>{error}</span>}
    </div>
  );
}

interface NFProps { label?: string; value?: number | null; onChange: (v: number | null) => void; placeholder?: string; unit?: string; disabled?: boolean; }
export function SHFNumberField({ label, value, onChange, placeholder, unit, disabled }: NFProps) {
  return (
    <div style={{ ...rowSty, opacity: disabled ? 0.4 : 1 }}>
      {label && <label style={labelSty}>{label}{unit && <span style={{ color: 'var(--shf-graphite-400)', marginLeft: 6 }}>({unit})</span>}</label>}
      <input
        type="number"
        step="any"
        value={value ?? ''}
        placeholder={placeholder ?? EMPTY_VALUE}
        disabled={disabled}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        onFocus={onFocus} onBlur={onBlur}
        style={{ ...inputSty, fontVariantNumeric: 'tabular-nums', cursor: disabled ? 'not-allowed' : undefined }}
      />
    </div>
  );
}

/** An option may name a `group`, which renders it inside an <optgroup> of that
 *  name. Groups appear in the order they are first seen and each option stays in
 *  its declared position within its group, so a caller controls ordering by
 *  ordering its own list. Options without a `group` render exactly as they
 *  always have -- ungrouped callers are unaffected. */
type SFOption = string | { value: string; label: string; group?: string };
interface SFProps extends MarkProps { label?: string; value?: string | null; onChange: (v: string) => void; options: SFOption[]; disabled?: boolean; ariaLabel?: string; error?: string; }

function optionEl(o: SFOption) {
  const v = typeof o === 'string' ? o : o.value;
  const l = typeof o === 'string' ? o : o.label;
  return <option key={v} value={v}>{l}</option>;
}

/** Splits the list into the leading ungrouped options and the named groups, in
 *  first-seen order. Returns no groups at all when nothing carries one, which is
 *  what keeps the common case rendering a flat list. */
function groupOptions(options: SFOption[]) {
  const loose: SFOption[] = [];
  const groups = new Map<string, SFOption[]>();
  for (const o of options) {
    const g = typeof o === 'string' ? undefined : o.group;
    if (!g) { loose.push(o); continue; }
    const bucket = groups.get(g);
    if (bucket) bucket.push(o);
    else groups.set(g, [o]);
  }
  return { loose, groups };
}
export function SHFSelectField({ label, value, onChange, options, disabled, ariaLabel, error, marked = false, onMark, markName }: SFProps) {
  // Without htmlFor/id the label is only visually adjacent: a screen reader
  // announces the control unnamed, and getByLabelText cannot find it either.
  const id = useId();
  const errId = `${id}-error`;
  const { loose, groups } = groupOptions(options);
  const select = (
      <select
        id={id}
        aria-label={ariaLabel}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus} onBlur={onBlurFor(Boolean(error))}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        style={{
          ...inputSty, ...selectSty,
          borderColor: restingBorder(Boolean(error)),
          // Dimmed as well as inert, so a select waiting on another field reads
          // as not-yet rather than as broken.
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : undefined,
          ...(marked ? { color: markedTextColor } : null),
          // A flex child beside the tick; without this a select refuses to
          // shrink below its longest option and pushes the tick off the row.
          ...(onMark ? { minWidth: 0 } : null),
        }}
      >
        <option value="">- select -</option>
        {loose.map(optionEl)}
        {[...groups].map(([name, opts]) => (
          <optgroup key={name} label={name}>
            {opts.map(optionEl)}
          </optgroup>
        ))}
      </select>
  );
  return (
    <div style={rowSty}>
      {label && <label style={labelSty} htmlFor={id}>{label}</label>}
      {onMark ? (
        <div style={markRowSty}>
          {select}
          <SHFMarkToggle marked={marked} onMark={onMark} name={markName ?? label ?? ariaLabel ?? 'field'} />
        </div>
      ) : select}
      {error && <span id={errId} style={errorTextSty}>{error}</span>}
    </div>
  );
}

interface MCProps { label?: string; value: string[]; onChange: (v: string[]) => void; options: string[]; }
export function SHFMultiCheck({ label, value, onChange, options }: MCProps) {
  const set = new Set(value);
  return (
    <div style={rowSty}>
      {label && <label style={labelSty}>{label}</label>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(o => {
          const on = set.has(o);
          return (
            <button key={o} type="button" onClick={() => {
              const next = new Set(set);
              if (on) next.delete(o); else next.add(o);
              onChange([...next]);
            }} style={{
              padding: '5px 10px',
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              border: `1px solid ${on ? 'var(--shf-amber)' : 'var(--shf-graphite-600)'}`,
              background: on ? 'var(--shf-amber)' : 'transparent',
              color: on ? 'var(--shf-black)' : 'var(--shf-paper)',
              borderRadius: 2, cursor: 'pointer',
            }}>{o}</button>
          );
        })}
      </div>
    </div>
  );
}

interface CBProps { label: string; value: boolean | null; onChange: (v: boolean) => void; }
export function SHFCheckbox({ label, value, onChange }: CBProps) {
  return (
    <label style={{ ...rowSty, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={value === true}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: 'var(--shf-amber)' }}
      />
      <span style={{ ...labelSty, marginBottom: 0 }}>{label}</span>
    </label>
  );
}

interface RowListProps<T> {
  items: T[];
  onChange: (v: T[]) => void;
  /** Omit both to drop the footer button, leaving the list add-only elsewhere. */
  newItem?: () => T;
  addLabel?: string;
  emptyMsg?: string;
  render: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
}
export function SHFRowList<T extends object>({ items, onChange, newItem, addLabel, emptyMsg, render }: RowListProps<T>) {
  const update = (idx: number, patch: Partial<T>) => onChange(items.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const move = (idx: number, dir: number) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j] as T, next[idx] as T];
    onChange(next);
  };
  return (
    <div>
      {items.length === 0 && emptyMsg && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--shf-graphite-400)', fontStyle: 'italic', marginBottom: 8 }}>{emptyMsg}</div>
      )}
      {items.map((it, idx) => (
        <div key={idx} style={{
          border: '1px solid var(--shf-graphite-600)', background: 'var(--shf-graphite-800)',
          padding: 10, marginBottom: 8, borderRadius: 2, position: 'relative',
        }}>
          <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2 }}>
            {(['▲', '▼'] as const).map((arrow, d) => (
              <button key={arrow} type="button"
                onClick={() => move(idx, d === 0 ? -1 : 1)}
                disabled={(d === 0 && idx === 0) || (d === 1 && idx === items.length - 1)}
                style={{ width: 22, height: 22, padding: 0, background: 'transparent', border: '1px solid var(--shf-graphite-500)', color: 'var(--shf-paper)', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer', borderRadius: 2 }}
              >{arrow}</button>
            ))}
            <button type="button" onClick={() => remove(idx)}
              style={{ width: 22, height: 22, padding: 0, background: 'transparent', border: '1px solid rgba(212,58,47,0.5)', color: '#D43A2F', fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer', borderRadius: 2 }}>✕</button>
          </div>
          <div style={{ paddingRight: 76 }}>
            {render(it, (patch) => update(idx, patch))}
          </div>
        </div>
      ))}
      {newItem && addLabel && (
        <button type="button" onClick={() => onChange([...items, newItem()])} style={{
          width: '100%', padding: '8px 12px', background: 'transparent',
          border: '1px dashed var(--shf-amber)', color: 'var(--shf-amber)',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11,
          letterSpacing: '0.16em', textTransform: 'uppercase', borderRadius: 2, cursor: 'pointer',
        }}>+ {addLabel}</button>
      )}
    </div>
  );
}

interface FormSectionProps { eyebrow?: string; title: string; defaultOpen?: boolean; divider?: boolean; children: ReactNode; }
export function EditorFormSection({ eyebrow, title, defaultOpen = true, divider = true, children }: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    // `divider` rather than a `:first-of-type` rule on the pane: the border is
    // an inline style, which no class selector can override without
    // `!important`. The first section in a pane passes `divider={false}`,
    // because the chrome above it is already the separator and a second rule
    // immediately under it reads as a stray line. Same prop name and same
    // reasoning as `RailTitle`'s.
    <section style={{ marginBottom: 18, borderTop: divider ? '2px solid var(--shf-graphite-600)' : 'none' }}>
      {/* The chevron sits in the right margin, not before the title, so the
          section heading starts on the same line as the field labels and inputs
          beneath it. Leading it with a 20px glyph and a 10px gap stepped every
          heading 30px right of its own fields, which reads as a mistake once the
          pane is padded to the content line. Same treatment as the sidebar's
          group headers, which place their chevron absolutely at the right for
          the same reason. */}
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', textAlign: 'left', padding: '12px 0',
        background: 'transparent', border: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', position: 'relative',
      }}>
        {/* Down while open, up while closed - the app's norm, set by the
            sidebar's group headers. It collapsed to a right-pointing caret,
            which reads as "expands sideways" and disagreed with every other
            collapsible in the app. */}
        <span style={{
          position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--shf-amber)', fontFamily: 'var(--font-mono)', fontSize: 32, lineHeight: 1,
        }}>{open ? '▾' : '▴'}</span>
        <div style={{ flex: 1, paddingRight: 34 }}>
          {eyebrow && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--shf-graphite-400)', marginBottom: 2 }}>{eyebrow}</div>}
          <div style={{ fontFamily: 'var(--font-condensed)', fontWeight: 600, fontSize: 16, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--shf-paper)' }}>{title}</div>
        </div>
      </button>
      {open && <div style={{ paddingBottom: 8 }}>{children}</div>}
    </section>
  );
}


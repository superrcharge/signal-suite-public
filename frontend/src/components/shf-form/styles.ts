/**
 * Shared styling for the SHF editor form primitives.
 *
 * Separate from the components because react-refresh requires a module to
 * export only components; mixing constants in costs Fast Refresh and fails the
 * repo's `--max-warnings 0` lint.
 *
 * Every value comes from catalog-tokens.css, so a page using these must import
 * that stylesheet.
 */
import type { CSSProperties, FocusEvent } from 'react';

export const labelSty: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 500,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'var(--shf-graphite-300)', marginBottom: 4, display: 'block',
};

export const inputSty: CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '7px 10px',
  fontFamily: 'var(--font-body)', fontSize: 13,
  color: 'var(--shf-paper)',
  background: 'var(--shf-graphite-800)',
  border: '1px solid var(--shf-graphite-600)',
  borderRadius: 2, outline: 'none',
  transition: 'border-color 120ms',
};

/**
 * The select look: the platform arrow suppressed, an amber chevron drawn in its
 * place with two gradient triangles. Spread after `inputSty`. Shared so the
 * library panes' dropdowns match the editor's instead of falling back to the
 * browser's grey system arrow, which is what they did while each drew its own.
 */
export const selectSty: CSSProperties = {
  appearance: 'none',
  backgroundImage: 'linear-gradient(45deg,transparent 50%,var(--shf-amber) 50%),linear-gradient(135deg,var(--shf-amber) 50%,transparent 50%)',
  backgroundPosition: 'calc(100% - 14px) 50%,calc(100% - 9px) 50%',
  backgroundSize: '5px 5px,5px 5px', backgroundRepeat: 'no-repeat',
};

export const rowSty: CSSProperties = { marginBottom: 12 };

export const errorTextSty: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
  color: 'var(--shf-error)', marginTop: 4, display: 'block',
};

/**
 * The PACE editor's "changed" tick and the colour a ticked field's own text
 * takes. The editor sits on graphite, where the sheet's darker print red would
 * be hard to read, so the editor uses the error token's brighter red; both say
 * the same thing, "this prints red".
 */
export const markedTextColor = 'var(--shf-error)';

export const markToggleSty: CSSProperties = {
  accentColor: 'var(--shf-error)', width: 13, height: 13,
  margin: 0, flexShrink: 0, cursor: 'pointer',
  // The editor is always dark. Without this the unticked box is the browser's
  // light-scheme white square, the brightest thing in every field.
  colorScheme: 'dark',
};

/**
 * The row a markable field sits in: the control, then its tick beside it.
 * Always beside, never inset - one placement for every field kind, since a
 * select's right edge is its chevron and an inset tick there is impossible.
 */
export const markRowSty: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };

/** Resting border colour. A field in error keeps its mark when focus leaves. */
export function restingBorder(hasError: boolean) {
  return hasError ? 'var(--shf-error)' : 'var(--shf-graphite-600)';
}

export function onFocus(e: FocusEvent<HTMLElement>) { (e.target).style.borderColor = 'var(--shf-amber)'; }
export function onBlur(e: FocusEvent<HTMLElement>) { (e.target).style.borderColor = restingBorder(false); }

/**
 * Blur handler for a control that may be in error.
 *
 * The plain onBlur above hardcodes the resting colour, so a field marked in
 * error lost its border the first time it was focused and left -- the mark
 * vanished at exactly the moment the user had finished looking at it.
 */
export function onBlurFor(hasError: boolean) {
  return (e: FocusEvent<HTMLElement>) => { (e.target).style.borderColor = restingBorder(hasError); };
}

/**
 * A 30px square icon button, used by the catalog's library panes and the
 * editor toolbar. Lives here beside the field styles because it is shared by
 * the editor page and the three library panes that moved out of it.
 */
export const iconToolbarBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 30, padding: 0,
  background: 'transparent', border: '1px solid var(--shf-graphite-600)',
  color: 'var(--shf-paper)', cursor: 'pointer', borderRadius: 2,
};

/**
 * The full-width dashed "+ Add X" button under each library pane's add form.
 *
 * A ~170-character literal that was repeated verbatim in all four panes. Only
 * two things ever varied: the label, which is the button's child, and the
 * disabled opacity, which is spread over the top at each call site. Platform
 * also carried `marginTop: 10` against the other three's 8; it adopts 8 here so
 * the constant has no exceptions, which is a 2px shift on one button.
 *
 * Lives beside `iconToolbarBtn` for the same reason that does: shared by the
 * library panes that moved out of the editor page.
 */
export const addDashedBtn: CSSProperties = {
  marginTop: 8, width: '100%', padding: '8px 12px',
  background: 'transparent', border: '1px dashed var(--shf-amber)',
  color: 'var(--shf-amber)',
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11,
  letterSpacing: '0.16em', textTransform: 'uppercase',
  borderRadius: 2, cursor: 'pointer',
};

/**
 * Quick-ID chip styling shared by the catalog browse views.
 *
 * `amber` reads as a primary identifier (bands, waveform abbrevs); `paper`
 * is the quieter secondary (services, radio names).
 */
export function chipSty(kind: 'amber' | 'paper'): React.CSSProperties {
  return kind === 'amber'
    ? {
        padding: '2px 7px',
        background: 'transparent',
        color: 'var(--shf-amber)',
        border: '1px solid var(--shf-amber)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        borderRadius: 2,
      }
    : {
        padding: '2px 7px',
        background: 'var(--shf-graphite-700)',
        color: 'var(--shf-paper)',
        border: '1px solid var(--shf-graphite-600)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        borderRadius: 2,
      };
}

/**
 * A panel or drawer switch: outlined, amber-bordered when open.
 *
 * Lives here rather than in the one file that first needed it because three
 * surfaces now draw this control - the compare pickers, the browse Filters
 * toggle, and the facet sidebar's own expanders - and a style copy-pasted into
 * three files is how the seven page banners drifted apart.
 */
export function panelToggleSty(open: boolean): React.CSSProperties {
  return {
    // Right pad less the letter-spacing, so the label centres: see chipToggleSty.
    padding: '4px calc(12px - 0.08em) 4px 12px',
    fontFamily: 'var(--font-mono)',
    fontSize: 10.5,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    borderRadius: 2,
    cursor: 'pointer',
    background: open ? 'var(--shf-graphite-700)' : 'transparent',
    color: 'var(--shf-paper)',
    border: `1px solid ${open ? 'var(--shf-amber)' : 'var(--shf-graphite-600)'}`,
    // A switch label never wraps: a two-line "Hide empty rows" doubled its
    // chip's height and knocked every switch beside it off the banner line.
    whiteSpace: 'nowrap',
  };
}

/**
 * A pick-one-of-many chip. Amber fill means selected, the same language the
 * editor's Section 03 library chips use, so a filled chip already means
 * something to anyone who has entered a record.
 *
 * `uppercase` carries the slightly wider padding and tracking that setting
 * needs to stay balanced. It is one flag rather than two styles because the
 * two only ever vary together - the browse toolbar's switches are uppercase,
 * the value chips are not.
 */
export function chipToggleSty(active: boolean, uppercase = false): React.CSSProperties {
  return {
    // The uppercase form is the banner and toolbar switch, and it matches
    // panelToggleSty's padding so every switch in a page's top strip is one
    // size - Compare's Equipment / Parameters were 22px tall beside 20px tabs
    // on every other page. The value chips keep the tighter padding.
    // The right pad is the left pad less the letter-spacing, because
    // letter-spacing is added after the last glyph too and would otherwise
    // leave that much empty track inside the right padding, with the label
    // sitting left of centre. Same rule as BANNER_BTN_BASE.
    padding: uppercase ? '4px calc(12px - 0.08em) 4px 12px' : '3px calc(9px - 0.06em) 3px 9px',
    fontFamily: 'var(--font-mono)',
    fontSize: 10.5,
    letterSpacing: uppercase ? '0.08em' : '0.06em',
    ...(uppercase ? { textTransform: 'uppercase' as const } : {}),
    borderRadius: 2,
    cursor: 'pointer',
    background: active ? 'var(--shf-amber)' : 'transparent',
    color: active ? 'var(--shf-black)' : 'var(--shf-paper)',
    border: `1px solid ${active ? 'var(--shf-amber)' : 'var(--shf-graphite-600)'}`,
  };
}

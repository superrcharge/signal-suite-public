import { EMPTY_VALUE } from '@/utils';
import { sheetRootProps } from '@/components/common/sheet-export';
import type { MatrixModel } from './compat-matrix-model';
import {
  matrixCell, matrixCheck, matrixHeaderCell, matrixMiss, matrixRowLabel, matrixWaveformLabel,
} from './compat-matrix-styles';

/**
 * The joint cross-tab: waveforms down, every asset across. Draws a
 * `MatrixModel` and computes nothing - the arithmetic lives in
 * `compat-matrix-model.ts`, where it is tested. Shared by the page and its
 * print route.
 *
 * Styled with the data sheet's paper tokens, so it sits on a light surface in
 * both places.
 */

function categoryTag(category: string): React.CSSProperties {
  const organic = category === 'organic';
  return {
    display: 'inline-block', marginTop: 3, padding: '0 4px',
    fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: organic ? 'var(--shf-amber-deep)' : 'var(--fg-3)',
    border: `1px solid ${organic ? 'var(--shf-amber-deep)' : 'var(--border-soft)'}`,
    borderRadius: 2,
  };
}

/**
 * `print` drops the horizontal scroll container. On screen it keeps a wide
 * matrix from scrolling the page sideways; on paper an `overflowX: auto`
 * wrapper clips rather than paginates, which is one of the three things that
 * broke the compare print route. Each cell also refuses to split across a page.
 */
export function JointCompatibilityMatrix({ model, print = false }: { model: MatrixModel; print?: boolean }) {
  const { columns, rows } = model;

  if (columns.length === 0 || rows.length === 0) {
    return (
      <div style={{
        border: '1px dashed var(--border-soft)', background: 'rgba(0,0,0,0.02)',
        padding: '16px 18px', fontFamily: 'var(--font-body)', fontSize: 13,
        color: 'var(--fg-3)', fontStyle: 'italic', lineHeight: 1.5,
      }}>
        {columns.length === 0
          ? 'No assets to compare. Add platforms in the Comms Library, or radios to the Equipment Catalog.'
          : 'No waveforms to compare. Add waveforms to the Comms Library.'}
      </div>
    );
  }

  return (
    // Scrolls inside itself: a joint force can be twenty columns wide, and the
    // page must never scroll sideways.
    <div style={print ? undefined : { overflowX: 'auto' }}>
      {/* What the share menu captures, and never the scroll wrapper above:
          that is only viewport wide, so capturing it would crop every column
          scrolled off to the right - the reason CompareMatrix marks its grid.
          This box is max-content wide and carries the legend, so the picture
          keeps its key. */}
      <div
        {...sheetRootProps()}
        style={print ? undefined : { width: 'max-content', minWidth: '100%', background: 'var(--shf-paper)' }}
      >
      <div
        role="table"
        aria-label="Joint compatibility matrix"
        style={{
          display: 'grid',
          gridTemplateColumns: print
            ? `minmax(120px, 1.2fr) repeat(${columns.length}, minmax(0, 1fr))`
            : `minmax(170px, 1.4fr) repeat(${columns.length}, minmax(76px, 1fr))`,
          borderTop: '2px solid var(--fg-1)',
          ...(print ? {} : { minWidth: 'min-content' }),
        }}
      >
        <div role="columnheader" style={{ ...matrixHeaderCell(true), alignSelf: 'stretch' }}>Waveform</div>
        {columns.map(col => (
          <div key={col.id} role="columnheader" style={matrixHeaderCell(false)} title={col.operator ? `${col.label} (${col.operator})` : col.label}>
            <div style={{ color: 'var(--fg-1)' }}>{col.label}</div>
            {col.sublabel && (
              <div style={{ fontSize: 9, letterSpacing: '0.04em', textTransform: 'none', color: 'var(--fg-3)', fontWeight: 400 }}>{col.sublabel}</div>
            )}
            <span style={categoryTag(col.category)}>{col.category}</span>
          </div>
        ))}

        {rows.map((row, r) => {
          const isLast = r === rows.length - 1;
          return [
            <div key={'r' + row.abbrev} role="rowheader" style={matrixRowLabel(isLast)}>
              <div style={matrixWaveformLabel}>{row.label}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg-3)' }}>
                {row.name}
              </div>
            </div>,
            ...row.cells.map((cell, i) => {
              const col = columns[i]!;
              return (
                <div
                  key={row.abbrev + '-' + col.id}
                  role="cell"
                  style={matrixCell(isLast)}
                  title={cell.supported ? 'Supported' : 'Not supported'}
                >
                  {cell.supported ? (
                    <span style={matrixCheck}>✓</span>
                  ) : (
                    <span style={matrixMiss}>{EMPTY_VALUE}</span>
                  )}
                </div>
              );
            }),
          ];
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 10, fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--fg-3)' }}>
        <span><span style={{ ...matrixCheck, fontSize: 13 }}>✓</span> Supported</span>
        <span>{EMPTY_VALUE} Not supported</span>
      </div>
      </div>
    </div>
  );
}

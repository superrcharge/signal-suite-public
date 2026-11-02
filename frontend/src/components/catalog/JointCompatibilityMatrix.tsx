import { EMPTY_VALUE } from '@/utils';
import { sheetRootProps } from '@/components/common/sheet-export';
import type { MatrixModel } from './compat-matrix-model';
import {
  MATRIX_LABEL_COL, branchCheck, matrixCell, matrixCheck, matrixHeaderCell, matrixMiss, matrixRowLabel, matrixWaveformLabel,
} from './compat-matrix-styles';
import { branchChip, branchColor, branchName } from './branch-colors';
import { BRANCH_ORDER } from './compat-matrix-model';

/**
 * The joint cross-tab: waveforms down, every asset across. Draws a
 * `MatrixModel` and computes nothing - the arithmetic lives in
 * `compat-matrix-model.ts`, where it is tested. Shared by the page and its
 * print route.
 *
 * Styled with the data sheet's paper tokens, so it sits on a light surface in
 * both places.
 */

/**
 * `print` drops the horizontal scroll container. On screen it keeps a wide
 * matrix from scrolling the page sideways; on paper an `overflowX: auto`
 * wrapper clips rather than paginates, which is one of the three things that
 * broke the compare print route. Each cell also refuses to split across a page.
 *
 * In print the label column is a fixed `MATRIX_LABEL_COL` and the asset
 * columns share the rest equally, which is what the print pagination's
 * arithmetic assumes. The header cell and each row label carry
 * `data-print-part="head"` and `data-print-key`, which are what
 * `useMatrixPrintPagination` measures.
 *
 * `legend` is off for a printed page, which draws `MatrixLegend` itself,
 * once, above its first page's grid.
 */
export function JointCompatibilityMatrix({ model, print = false, legend = true }: {
  model: MatrixModel;
  print?: boolean;
  legend?: boolean;
}) {
  const { columns, rows } = model;

  if (columns.length === 0 || rows.length === 0) {
    return (
      <div style={{
        border: '1px dashed var(--border-soft)', background: 'rgba(0,0,0,0.02)',
        padding: '16px 18px', fontFamily: 'var(--font-body)', fontSize: 13,
        color: 'var(--fg-3)', fontStyle: 'italic', lineHeight: 1.5,
      }}>
        {/* Nothing picked is the cold load, not a fault, so it says what to
            do rather than that the library is empty. */}
        {columns.length === 0
          ? model.candidateTotal > 0
            ? 'No columns picked. Open Columns to pick assets, or Select all for everything the filters allow.'
            : 'No assets to compare. Add platforms in the Comms Library, or radios to the Equipment Catalog.'
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
          keeps its key. On screen only: a print grid is also drawn by the
          hidden pagination twin, which sits before the real grid in the page,
          and the export takes the first marked root it finds. */}
      <div
        {...(print ? {} : sheetRootProps())}
        style={print ? undefined : { width: 'max-content', minWidth: '100%', background: 'var(--shf-paper)' }}
      >
      <div
        role="table"
        aria-label="Joint compatibility matrix"
        style={{
          display: 'grid',
          gridTemplateColumns: print
            ? `${String(MATRIX_LABEL_COL)}px repeat(${columns.length}, minmax(0, 1fr))`
            : `minmax(170px, 1.4fr) repeat(${columns.length}, minmax(76px, 1fr))`,
          borderTop: '2px solid var(--fg-1)',
          ...(print ? {} : { minWidth: 'min-content' }),
        }}
      >
        <div role="columnheader" data-print-part="head" style={{ ...matrixHeaderCell(true), alignSelf: 'stretch' }}>Waveform</div>
        {columns.map(col => (
          <div key={col.id} role="columnheader" style={matrixHeaderCell(false)} title={col.branches.length > 0 ? `${col.label} (${col.branches.map(branchName).join(', ')})` : col.label}>
            <div style={{ color: 'var(--fg-1)' }}>{col.label}</div>
            {col.sublabel && (
              <div style={{ fontSize: 9, letterSpacing: '0.04em', textTransform: 'none', color: 'var(--fg-3)', fontWeight: 400 }}>{col.sublabel}</div>
            )}
            {/* One chip per branch, and nothing else: the branch says both
                who flies it and, since the old organic / joint category is
                gone, everything that tag used to. A catalog radio has no
                branch and draws no chip. Wraps rather than widening the
                column. */}
            {col.branches.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 3, marginTop: 3 }}>
                {col.branches.map(b => <span key={b} style={branchChip(b)}>{b}</span>)}
              </div>
            )}
          </div>
        ))}

        {rows.map((row, r) => {
          const isLast = r === rows.length - 1;
          return [
            <div key={'r' + row.abbrev} role="rowheader" data-print-key={row.abbrev} style={matrixRowLabel(isLast)}>
              <div style={matrixWaveformLabel}>{row.label}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg-3)' }}>
                {row.name}
              </div>
            </div>,
            ...row.cells.map((cell, i) => {
              const col = columns[i]!;
              const checks = col.checkBranches;
              return (
                <div
                  key={row.abbrev + '-' + col.id}
                  role="cell"
                  style={matrixCell(isLast)}
                  title={!cell.supported
                    ? 'Not supported'
                    : checks.length > 0 ? `Supported - ${checks.map(branchName).join(', ')}` : 'Supported'}
                >
                  {/* One check per branch the column shows, in its colour, so
                      a UH-60L flown by USA and OGA reads as two fleets on the
                      waveform rather than one. A catalog radio has no branch
                      and draws the neutral check. */}
                  {cell.supported && checks.length > 0 ? (
                    <span style={{ display: 'inline-flex', gap: 2, whiteSpace: 'nowrap' }}>
                      {checks.map(b => (
                        <span key={b} data-branch={b} style={branchCheck(branchColor(b), checks.length)}>✓</span>
                      ))}
                    </span>
                  ) : cell.supported ? (
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

      {legend && <MatrixLegend model={model} />}
      </div>
    </div>
  );
}

/**
 * The key, naming only the colours actually drawn: each branch with a check
 * somewhere in `model`, in precedence order, then the radios' neutral check
 * if a radio column has one. A column with no supported cell drew no check,
 * so it keys nothing. A printed job passes the whole model, so the key on its
 * first page covers every page.
 */
export function MatrixLegend({ model }: { model: MatrixModel }) {
  const { columns, rows } = model;
  const checked = columns.filter((_, i) => rows.some(r => r.cells[i]?.supported));
  return (
    <div aria-label="Legend" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10, fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--fg-3)' }}>
      {BRANCH_ORDER.filter(b => checked.some(c => c.checkBranches.includes(b))).map(b => (
        <span key={b} title={branchName(b)}><span style={{ ...matrixCheck, fontSize: 13, color: branchColor(b) }}>✓</span> {b}</span>
      ))}
      {checked.some(c => c.kind === 'equipment') && (
        <span><span style={{ ...matrixCheck, fontSize: 13 }}>✓</span> Catalog radio</span>
      )}
      <span>{EMPTY_VALUE} Not supported</span>
    </div>
  );
}

/**
 * What a printed page's heading may say instead of the defaults: `title`
 * replaces "Joint Compatibility Matrix", and `subtitle`, when given, is drawn
 * beneath it. Carried to the pagination twin as well, so the height measured
 * is the height printed.
 */
export interface MatrixHeading {
  title?: string;
  subtitle?: string;
}

/**
 * What heads a printed page: the title, the date, and the branch filter when
 * one is on. Shared by the print route and the pagination twin, so the height
 * the twin measures is the height that prints.
 */
export function MatrixPrintHeading({ date, branches, title = 'Joint Compatibility Matrix', subtitle }: {
  date: string;
  branches: string[];
} & MatrixHeading) {
  const titleStyle = { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-1)' } as const;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
      {subtitle ? (
        <div>
          <div style={titleStyle}>{title}</div>
          <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--shf-graphite-300)' }}>{subtitle}</span>
        </div>
      ) : (
        <div style={titleStyle}>
          {title}
        </div>
      )}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em' }}>
        {date}{branches.length > 0 ? ` · ${branches.join(', ').toUpperCase()}` : ''}
      </div>
    </div>
  );
}

/**
 * One printed page: on a column chunk's first page the heading and the key,
 * then the grid for this page's columns and rows. The print route draws every
 * page with this and the pagination twin measures with it, so the height the
 * page split is computed from is the height that prints.
 */
export function MatrixPrintPage({ model, page, first, date, branches, heading }: {
  /** The whole print model, which the key describes. */
  model: MatrixModel;
  /** This page's share of it, from `sliceModel`. */
  page: MatrixModel;
  first: boolean;
  date: string;
  branches: string[];
  /** Overrides the heading's title, and adds a subtitle. */
  heading?: MatrixHeading;
}) {
  return (
    <>
      {first && (
        <div data-print-part="first" style={{ paddingBottom: 10 }}>
          <MatrixPrintHeading date={date} branches={branches} {...heading} />
          <MatrixLegend model={model} />
        </div>
      )}
      <JointCompatibilityMatrix model={page} print legend={false} />
    </>
  );
}

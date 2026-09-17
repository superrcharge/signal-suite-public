import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Equipment } from '@/types';
import { EMPTY_VALUE } from '@/utils';
import { sheetRootProps } from '@/components/common/sheet-export';
import { DARK, cmp, paletteVars } from './compare-palette';
import {
  LABEL_COL,
  compareDensity,
  fitTextScale,
  paginateColumns,
  type CompareDensity,
} from './compare-page-guides';
import { EquipmentPhoto } from './EquipmentPhoto';
import { GROUP_LABELS, cellFor, type CompareCell, type CompareParam } from './compare-params';
import { groupRows } from './compare-selection';

interface CompareMatrixProps {
  columns: Equipment[];
  params: CompareParam[];
  /** Omitted on a surface with nothing to remove from, e.g. a printed sheet -
   *  CompareSheet.tsx is what print uses now, but a caller with no delete
   *  affordance (a future read-only embed) should not have to pass a no-op. */
  onRemove?: (id: string) => void;
  /** `g:<group>` / `r:<param.id>` of the row that starts each printed page
   *  after the first - `usePrintPagination`'s own row pagination, read back
   *  rather than guessed at from screen measurements. Page one needs no
   *  guide (there is nothing above it to warn about), which is why the
   *  caller already dropped its own first entry before this prop ever sees
   *  it. Absent draws no horizontal guides at all. */
  printBreakKeys?: string[];
  /** Column index that starts each printed page after the first, from
   *  `usePrintPagination`'s `columnPages`. With Fit on, a zoomed sheet holds
   *  more columns per page, so the seams move or vanish; computing them here
   *  from the unzoomed page width drew a guide at column six on a comparison
   *  Fit had just put on one page, which is why there is no fallback: the
   *  hook is the only source. Empty draws no vertical guides. */
  columnSeams: number[];
}


/** The datasheet's own overflow marker, so one red dashed rule means one
 *  thing across the whole catalog. */
const BREAK_COLOR = '#D43A2F';

/** One line box for a row label and its values, so the two start level
 *  without giving up the full-height cell backgrounds the zebra needs. */
const ROW_LINE = 17;

/** Marks the first cell of each row and each group heading. Paired with
 *  `data-row-key` on the same element (`g:<group>` / `r:<param.id>`), this is
 *  what the measuring effect below queries to build the key-to-screen-y map
 *  `PageGuides` reads `printBreakKeys` against. */
const ROW_TOP_ATTR = 'data-row-top';

/**
 * Never split one of these across a page.
 *
 * A comparison read across a fold is not a comparison, so a row and its group
 * heading are atomic. `breakInside` covers current engines and the legacy
 * `pageBreakInside` covers older print paths, which still disagree about grid
 * fragmentation.
 */
const ATOMIC: React.CSSProperties = {
  breakInside: 'avoid',
  pageBreakInside: 'avoid',
};

/**
 * Chosen parameters down the side, chosen equipment across the top.
 *
 * It once had two siblings, the waveform and service coverage matrices, which
 * answered a fixed question with a checkmark and took their rows from a library
 * table. Those are gone with the browse tabs that hosted them. This one takes
 * its rows from `compare-params` and its cells carry values, which is why it
 * was never a generalization of them in the first place.
 *
 * The component holds no knowledge of the equipment shape. Everything it
 * renders arrives as a CompareCell, so adding a parameter never touches this
 * file.
 *
 * Screen only. The print route draws CompareSheet instead, a native `<table>`
 * built for pagination rather than for scrolling; this component keeps the
 * `overflowX: auto` wrapper and sticky label column that make print clip
 * content. Every colour here is read through `cmp()` against the DARK
 * palette set on the outermost div, which is what keeps this file able to
 * hand the same `CellValue` renderer to CompareSheet without either file
 * hardcoding a scheme.
 */
export function CompareMatrix({ columns, params, onRemove, printBreakKeys, columnSeams }: CompareMatrixProps) {
  const navigate = useNavigate();
  const groups = groupRows(params);
  const d = compareDensity(columns.length);
  // The page decides the column width once a second page is needed, so every
  // vertical seam lands on a column edge instead of through a terminal.
  const page = paginateColumns(columns.length);

  // Screen y for every `g:<group>` / `r:<param.id>` key on screen, keyed the
  // same way `paginateRows` keys its printed pages - this is what lets the
  // horizontal guide land on the exact on-screen row a printed page starts,
  // rather than snapping to the nearest screen row boundary under an
  // arbitrary page height the way the old `snapToRows` guessed.
  const gridRef = useRef<HTMLDivElement>(null);
  const [rowTops, setRowTops] = useState<Record<string, number>>({});
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      const tops: Record<string, number> = {};
      el.querySelectorAll<HTMLElement>(`[${ROW_TOP_ATTR}]`).forEach(node => {
        const key = node.getAttribute('data-row-key');
        if (key) tops[key] = node.getBoundingClientRect().top - top;
      });
      setRowTops(tops);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => { ro.disconnect(); };
  }, [columns, params]);

  // The photo well renders for every column unconditionally. The retired
  // library matrices skipped it when nothing had a photo, because they listed
  // the whole catalog and a row of empty boxes was dead weight there. Here the
  // columns are a comparison, so a ragged header would make two records look
  // like different kinds of thing purely because one has a picture. A record
  // without one gets a placeholder of the same size.

  const headerCell: React.CSSProperties = {
    padding: d.pad,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: cmp('headText'),
    background: cmp('head'),
    borderBottom: `1px solid ${cmp('ruleStrong')}`,
  };

  // The label column stays put while the value columns scroll under it.
  const stickyLabel: React.CSSProperties = {
    position: 'sticky',
    left: 0,
    zIndex: 1,
    borderRight: `1px solid ${cmp('ruleStrong')}`,
  };

  const totalCols = columns.length;

  return (
    // No outer padding. The matrix is the page's content, so it meets the
    // banner above it and the sidebar beside it, the same way the browse
    // panel does. A 28px box around it read as dead space, which it was.
    // The palette vars live here, at the outermost node, so every `cmp()`
    // reference below resolves against DARK - the screen scheme - without
    // this file ever branching on which scheme it draws.
    <div style={paletteVars(DARK)}>
      {/* Scroll is scoped here so the page body never moves sideways. */}
      <div style={{ overflowX: 'auto', borderBottom: `1px solid ${cmp('ruleStrong')}` }}>
        <div style={{ position: 'relative', width: 'max-content', minWidth: '100%' }}>
        <div
          ref={gridRef}
          // The export marks the grid, never the scrolling wrapper above it:
          // the wrapper is only viewport-wide, so capturing it would crop
          // every column scrolled off to the right.
          {...sheetRootProps()}
          role="table"
          aria-label="Equipment comparison"
          style={{
            display: 'grid',
            // Within one page the columns stretch to fill the screen, since
            // there is no seam to line up with. Past it they are pinned to the
            // exact width that divides a page, which is what puts the break
            // between two terminals rather than through one.
            gridTemplateColumns: page.paged
              ? `${LABEL_COL}px repeat(${totalCols}, ${page.colW}px)`
              : `${LABEL_COL}px repeat(${totalCols}, minmax(${d.col}px, 1fr))`,
            width: page.paged
              ? `${LABEL_COL + totalCols * page.colW}px`
              : `max(100%, ${LABEL_COL + totalCols * d.col}px)`,
            borderTop: `2px solid ${cmp('accent')}`,
          }}
        >
          <div role="row" style={{ display: 'contents' }}>
            <div
              role="columnheader"
              style={{
                ...headerCell,
                ...stickyLabel,
                zIndex: 2,
                display: 'flex',
                // Top of the cell, not the bottom. The header row is as tall as
                // a photo well, so bottom-aligning this one word left a large
                // empty box in the corner of the table. It belongs in the
                // corner it labels.
                alignItems: 'flex-start',
              }}
            >
              Parameter
            </div>

            {columns.map(eq => (
              <div
                key={`h-${eq.id}`}
                role="columnheader"
                style={{
                  ...headerCell,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 6,
                  position: 'relative',
                }}
              >
                {/* Sibling of the navigating button below, never nested inside
                    it: a button within a button is invalid markup. */}
                {onRemove && <button
                  type="button"
                  onClick={() => { onRemove(eq.id); }}
                  aria-label={`Remove ${eq.nomenclature}`}
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    zIndex: 1,
                    padding: '0 4px',
                    lineHeight: 1.2,
                    background: 'transparent',
                    color: cmp('faint'),
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                  }}
                >
                  ✕
                </button>}

                <button
                  type="button"
                  onClick={() => { void navigate(`/catalog/${eq.id}`); }}
                  title={eq.nickname ? `${eq.nomenclature} "${eq.nickname}"` : eq.nomenclature}
                  style={{
                    ...headerCell,
                    width: '100%',
                    padding: 0,
                    background: 'transparent',
                    borderBottom: 'none',
                    cursor: 'pointer',
                    border: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 6,
                  }}
                >
                  <span
                    data-testid="compare-photo-well"
                    style={{
                      position: 'relative',
                      display: 'block',
                      width: '100%',
                      height: d.photo,
                      background: cmp('photoBg'),
                      border: `1px solid ${cmp('photoBorder')}`,
                      overflow: 'hidden',
                    }}
                  >
                    {eq.photo_url ? (
                      <EquipmentPhoto
                        equipmentId={eq.id}
                        photoUrl={eq.photo_url}
                        alt={eq.nomenclature}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          // cover, not contain: every thumbnail fills the same
                          // rectangle so the header reads as one uniform strip.
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <span
                        aria-label="no photo"
                        role="img"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          letterSpacing: '0.1em',
                          color: cmp('photoText'),
                        }}
                      >
                        NO PHOTO
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {eq.nickname || eq.nomenclature}
                  </span>
                </button>
              </div>
            ))}
          </div>

          {(() => { let stripe = 0; return groups.map(({ group, params: rows }) => [
            <div key={`gr-${group}`} role="row" style={{ display: 'contents' }}>
              <div
                // The heading spans the whole grid, so it reads as a divider
                // rather than as a first column with empty cells beside it.
                {...{ [ROW_TOP_ATTR]: '', 'data-row-key': `g:${group}` }}
                role="rowheader"
                aria-colspan={totalCols + 1}
                style={{
                  gridColumn: '1 / -1',
                  padding: `5px ${String(d.pad)}px`,
                  background: cmp('group'),
                  borderBottom: `1px solid ${cmp('ruleStrong')}`,
                  ...ATOMIC,
                  // A heading alone at the foot of a page is a heading for
                  // nothing, so it travels with its first row.
                  breakAfter: 'avoid',
                  pageBreakAfter: 'avoid',
                }}
              >
                {/* The text is sticky, not the bar. The bar spans the whole grid,
                    so pinning the bar leaves its label to scroll away with the
                    columns and the reader gets an empty grey strip where the
                    section name should be. */}
                <span
                  style={{
                    position: 'sticky',
                    left: 8,
                    display: 'inline-block',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: cmp('groupText'),
                  }}
                >
                  {GROUP_LABELS[group]}
                </span>
              </div>
            </div>,

            ...rows.map((param) => {
              // Zebra striping keeps the eye on one row across a wide matrix.
              // The counter runs across the whole matrix rather than resetting
              // per group: reset, and the last row of one group and the first
              // of the next come out the same shade with only the group bar
              // between them, which reads as one tall row.
              const rowBg = stripe++ % 2 === 0 ? cmp('bg') : cmp('bgAlt');
              const cell: React.CSSProperties = {
                padding: d.pad,
                borderBottom: `1px solid ${cmp('rule')}`,
                background: rowBg,
                ...ATOMIC,
              };

              return (
                <div key={`row-${param.id}`} role="row" style={{ display: 'contents' }}>
                  <div
                    {...{ [ROW_TOP_ATTR]: '', 'data-row-key': `r:${param.id}` }}
                    role="rowheader"
                    style={{ ...cell, ...stickyLabel }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: d.label,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: cmp('label'),
                        // Shared with the value cells. Grid baseline
                        // alignment would do this more precisely, but it also
                        // stops cells stretching, and a cell that is only as
                        // tall as its text leaves the zebra striping in
                        // ragged bands. One line box in both places keeps the
                        // backgrounds solid and the first lines level.
                        lineHeight: `${String(ROW_LINE)}px`,
                      }}
                    >
                      {param.label}
                    </div>
                  </div>
                  {columns.map(eq => (
                    <div key={`c-${param.id}-${eq.id}`} role="cell" style={cell}>
                      <CellValue cell={cellFor(param, eq)} density={d} />
                    </div>
                  ))}
                </div>
              );
            }),
          ]); })()}
        </div>

        <PageGuides
          columns={totalCols}
          rowTops={rowTops}
          printBreakKeys={printBreakKeys}
          columnSeams={columnSeams}
        />
        </div>
      </div>
    </div>
  );
}

/**
 * Where an 8.5 x 11 page would end, drawn over the matrix.
 *
 * A guide, never a clip. The datasheet's marker sits on a sheet that print
 * genuinely truncates, so there the line is a warning about content being
 * dropped. Nothing is dropped here: a wide comparison still exports whole and
 * simply spans more than one page. The reader wants to know where the seams
 * fall so they can drop a column, not to be told they cannot have it.
 *
 * Rendered as a SIBLING of the marked sheet root, which is the load-bearing
 * detail. The exporter clones the marked element, so a guide drawn inside it
 * would be baked into every .png, clipboard image and slide, and the menu
 * offers no hook to hide it for the duration of a capture.
 */
function PageGuides({
  columns,
  rowTops,
  printBreakKeys,
  columnSeams,
}: {
  columns: number;
  rowTops: Record<string, number>;
  printBreakKeys?: string[];
  columnSeams: number[];
}) {
  const page = paginateColumns(columns);
  // On a column edge by construction, never at a raw multiple of the page
  // width. See paginateColumns for why that distinction is the whole point.
  // The seams are the print route's own chunking, handed down by
  // usePrintPagination, so the guide can never mark a seam the printed pages
  // do not actually put there - and a seam computed here from the unzoomed
  // page width would disagree with Fit, which is exactly how a guide and a
  // printed seam drift apart.
  const cols = columnSeams.map(i => LABEL_COL + i * page.colW);
  // Every horizontal guide is the measured top of a row `paginateRows`
  // already decided starts a new printed page - never a guess at a boundary
  // under some assumed page height. A key with nothing measured yet (the
  // first render, before the ResizeObserver's first pass) is dropped rather
  // than drawn at 0, which would put a false guide across the header.
  const rows = (printBreakKeys ?? [])
    .map(key => rowTops[key])
    .filter((y): y is number => y !== undefined);

  if (cols.length === 0 && rows.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}
    >
      {cols.map((x, i) => (
        <div
          key={`v${String(i)}`}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: x,
            borderLeft: `2px dashed ${BREAK_COLOR}`,
          }}
        >
          <span style={{ ...guideTagSty, top: 4, left: 4 }}>Page edge</span>
        </div>
      ))}
      {rows.map((y, i) => (
        <div
          key={`h${String(i)}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: y,
            borderTop: `2px dashed ${BREAK_COLOR}`,
          }}
        >
          {/* Clear of the sticky label column and centred on the rule, so
              it lands in the gap between two rows instead of printing over
              the row label underneath it. */}
          <span style={{ ...guideTagSty, top: -6, left: LABEL_COL + 8 }}>Page edge</span>
        </div>
      ))}
    </div>
  );
}

const guideTagSty: React.CSSProperties = {
  position: 'absolute',
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: BREAK_COLOR,
  background: cmp('guideTagBg'),
  padding: '0 4px',
  whiteSpace: 'nowrap',
};

/**
 * Not-applicable and blank are drawn differently on purpose, and neither uses
 * the datasheet's glyph.
 *
 * A blank cell says the parameter exists for this record and nobody filled it
 * in, which is a gap someone can close. `n/a` says the parameter does not
 * exist for this kind of equipment, so the empty cell is final. Rendering both
 * the same would hide every one of those gaps behind a legitimate answer, and
 * telling them apart is the whole reason mixing SATCOM and radio in one matrix
 * is allowed.
 *
 * The blank glyph is EMPTY_VALUE rather than a literal, and the inapplicable
 * one is lowercase, because the datasheet already spends "N/A" on the *blank*
 * meaning (StandardSpecsTable, SwapBlock, FrequencyTable). Reusing that token
 * here for the other meaning would give one string two readings across two
 * pages of the same catalog.
 *
 * Exported so CompareSheet.tsx - the print renderer - draws the exact same
 * cell body rather than a second copy of this logic. Every colour is read
 * through `cmp()`, so the same function follows whichever palette its
 * ancestor set: DARK here, DARK or INK there.
 */
export function CellValue({
  cell,
  density,
  align = 'start',
  fit = false,
}: {
  cell: CompareCell;
  density: CompareDensity;
  /** `center` for the printed table, whose values sit under centred names.
   *  Text follows its cell's text-align on its own; only the chip row, a
   *  flex container, needs telling. The screen grid keeps `start`. */
  align?: 'start' | 'center';
  /** Print only. Shrinks a scalar value's text to stay on one line before it
   *  ever wraps - see FitLine's own doc comment. Defaults to false so every
   *  call site that does not pass it, which is every screen call site,
   *  renders byte-for-byte what it always has. */
  fit?: boolean;
}) {
  if (cell.kind === 'na') {
    return (
      <span
        role="img"
        aria-label="not applicable"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          lineHeight: `${String(density.line)}px`,
          letterSpacing: '0.08em',
          // The two cell kinds are told apart by glyph, not by contrast: `na`
          // reads at the same strength as a row label.
          color: cmp('na'),
        }}
      >
        n/a
      </span>
    );
  }

  if (cell.kind === 'blank') {
    return (
      <span
        role="img"
        aria-label="no value"
        // Quieter than a real value, still legible - see compare-palette.ts's
        // `faint` doc comment for the contrast floor each scheme holds it to.
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: density.chip + 1,
          lineHeight: `${String(density.line)}px`,
          color: cmp('faint'),
        }}
      >
        {EMPTY_VALUE}
      </span>
    );
  }

  if (cell.kind === 'list') {
    return (
      <span
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: align === 'center' ? 'center' : 'flex-start',
          gap: 4,
          lineHeight: `${String(density.line)}px`,
        }}
      >
        {cell.values.map((value, i) => (
          <span
            key={`${value}-${String(i)}`}
            style={{
              padding: '1px 5px',
              background: cmp('chipBg'),
              color: cmp('chipFg'),
              border: `1px solid ${cmp('chipBorder')}`,
              borderRadius: 2,
              fontFamily: 'var(--font-mono)',
              fontSize: density.chip,
              letterSpacing: '0.04em',
            }}
          >
            {value}
          </span>
        ))}
      </span>
    );
  }

  const body =
    cell.kind === 'bool'
      ? cell.value
        ? 'Yes'
        : 'No'
      : cell.kind === 'num'
        ? String(cell.value)
        : cell.value;
  const unit = cell.kind === 'num' ? cell.unit : undefined;

  if (fit) {
    return <FitLine body={body} unit={unit} density={density} />;
  }

  return (
    <span
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: density.value,
        lineHeight: `${String(density.line)}px`,
        color: cmp('fg'),
        fontVariantNumeric: 'tabular-nums',
        wordBreak: 'break-word',
      }}
    >
      {body}
      {unit && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: density.chip + 0.5,
            color: cmp('faint'),
            marginLeft: 3,
          }}
        >
          {unit}
        </span>
      )}
    </span>
  );
}

/**
 * A scalar value that shrinks its own text to stay on one line, then gives up
 * and wraps rather than ever truncating.
 *
 * Print only, behind CellValue's `fit` prop - the screen matrix never renders
 * this. A value like Power's "110-240 VAC, 50/60 Hz" is exactly the string
 * that wrapped onto a second row in the fixed-size printed table, which is
 * what pushed a comparison onto extra pages it did not need. Paper has no
 * hover title the way the screen's `title` attribute does, so silently
 * clipping the string is never an option - shrink it until FIT_TEXT_FLOOR,
 * then let it wrap, exactly what fitTextScale reports.
 *
 * Measures against its own parent, the table cell: `available` is the cell's
 * content box (clientWidth minus its own left/right padding), and `natural`
 * is the span's unscaled width, recovered by dividing the current
 * `scrollWidth` back out of the scale already applied - otherwise a shrink
 * from an earlier measurement would compound into the next one instead of
 * measuring the text's true width every time.
 */
function FitLine({
  body,
  unit,
  density,
}: {
  body: string;
  unit?: string;
  density: CompareDensity;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<{ scale: number; wrap: boolean }>({ scale: 1, wrap: false });
  // Mirrors `state.scale` outside React's render cycle so the ResizeObserver
  // callback - which closes over this effect's first render otherwise -
  // always divides out the scale actually on screen, not the one from
  // whichever render happened to set up the observer.
  const scaleRef = useRef(state.scale);
  scaleRef.current = state.scale;

  useLayoutEffect(() => {
    const span = spanRef.current;
    const cell = span?.parentElement;
    if (!span || !cell) return;
    // jsdom has no ResizeObserver, and with no layout engine behind it there
    // is nothing to measure anyway - fitTextScale's own zero-input answer
    // (full size, no wrap) is the correct one there too.
    if (typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      const cs = getComputedStyle(cell);
      const available =
        cell.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
      if (available <= 0) return;
      const scale = scaleRef.current || 1;
      const natural = span.scrollWidth / scale;
      const next = fitTextScale(natural, available);
      setState(prev => {
        // Guards against oscillation: a change this small would not move a
        // pixel on screen, and re-measuring after every re-render it causes
        // is how a ResizeObserver feeds back into itself forever.
        if (Math.abs(next.scale - prev.scale) <= 0.005 && next.wrap === prev.wrap) return prev;
        return next;
      });
    };

    const ro = new ResizeObserver(measure);
    ro.observe(cell);
    measure();
    return () => { ro.disconnect(); };
  }, [body, unit]);

  return (
    <span
      ref={spanRef}
      style={{
        display: 'inline-block',
        fontFamily: 'var(--font-body)',
        fontSize: density.value * state.scale,
        lineHeight: `${String(density.line)}px`,
        color: cmp('fg'),
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: state.wrap ? 'normal' : 'nowrap',
        overflowWrap: state.wrap ? 'anywhere' : undefined,
      }}
    >
      {body}
      {unit && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            // In em, not px: the unit has to scale with the value it
            // annotates, or a shrunk value beside a full-size unit suffix
            // reads as two mismatched type sizes rather than one shrunk
            // line.
            fontSize: `${String((density.chip + 0.5) / density.value)}em`,
            color: cmp('faint'),
            marginLeft: 3,
          }}
        >
          {unit}
        </span>
      )}
    </span>
  );
}

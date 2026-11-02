import type { CSSProperties, ReactElement } from 'react';
import CheckIcon from '@mui/icons-material/Check';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Tooltip } from '@mui/material';

import { branchChip } from '@/components/catalog/branch-colors';
import {
  matrixCell, matrixHeaderCell, matrixMiss, matrixRowLabel, matrixWaveformLabel,
} from '@/components/catalog/compat-matrix-styles';
import { EMPTY_VALUE } from '@/utils';
import { checkInk } from './check-ink';
import type { InteropColumn, InteropModel, InteropRow, InteropSection, Source } from './interop-model';
import { SECTION_CAPTION } from './sheet-parts';

const monoSty: CSSProperties = { fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' };

const pipSty = (color: string): CSSProperties => ({
  display: 'block', width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
  background: color || 'transparent',
  border: color ? 0 : '1px solid var(--shf-graphite-600)',
});

const toggleSty: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: 0, border: 0, background: 'transparent',
  color: 'var(--fg-3)', cursor: 'pointer',
};

/** A source as a chip: the asset's own name, outlined in its organization's colour. */
function chipSty(color: string): CSSProperties {
  return {
    ...monoSty, display: 'inline-block', padding: '1px 6px', fontSize: 10, fontWeight: 600, lineHeight: 1.4,
    color: 'var(--fg-2)', background: 'transparent', borderRadius: 2,
    border: `1px solid ${color || 'var(--shf-amber)'}`,
    whiteSpace: 'nowrap', textAlign: 'center',
    // Clip, never wrap: a wrapped chip makes its row taller than its neighbours.
    // The full name is in the chip's title.
    maxWidth: CHIP_MAX_WIDTH, overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle',
  };
}

const captionSty: CSSProperties = {
  fontSize: 9, letterSpacing: '0.04em', textTransform: 'none', color: 'var(--fg-3)', fontWeight: 400,
};

const sourceKey = (s: Source) => `${s.kind}:${s.id}`;

/** The chip's hover text: the asset, and for a waveform a platform only carries through a radio, which radio. */
function sourceTitle(s: Source, row: InteropRow): string {
  const via = s.kind === 'platform' ? s.via[row.key] : undefined;
  return via && via.length > 0 ? `${s.label} via ${via.join(', ')}` : s.label;
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div style={{
      border: '1px dashed var(--border-soft)', background: 'rgba(0,0,0,0.02)',
      padding: '16px 18px', fontFamily: 'var(--font-body)', fontSize: 13,
      color: 'var(--fg-3)', fontStyle: 'italic', lineHeight: 1.5,
    }}>
      {text}
    </div>
  );
}

/** An organization's head: pip, label, branch, and the switch that opens it into one column per asset. */
function OrgHead({ column, expanded, onToggle, readOnly = false }: {
  column: InteropColumn;
  expanded: boolean;
  onToggle: () => void;
  /** No switch: the head of a printed page, which has nothing to open. */
  readOnly?: boolean;
}) {
  const Chevron = expanded ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <span data-testid="interop-pip" style={pipSty(column.color)} />
        <span style={{ color: 'var(--fg-1)' }}>{column.label}</span>
        {!readOnly && (
          <button
            type="button"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${column.label}`}
            aria-expanded={expanded}
            onClick={onToggle}
            style={toggleSty}
          >
            <Chevron style={{ fontSize: 16 }} />
          </button>
        )}
      </div>
      {column.branch && (
        <div style={{ marginTop: 3 }}>
          <span style={branchChip(column.branch)}>{column.branch}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The operation's Matrix grid: one column per organization, one row per
 * waveform, SATCOM service and transport that at least one of them brings.
 * A cell lists the assets that give its organization the row, so an operator
 * sees WHICH of the things an organization brought makes the link, not only
 * that there is one. An organization opens into one column per asset, where
 * each cell is a check.
 *
 * Draws an `InteropModel` and computes nothing: the arithmetic, and the
 * phase rule that decides which assets are there, live in `interop-model.ts`.
 * Its own grid rather than the catalog's `JointCompatibilityMatrix`, since the
 * columns here change width and head height with what is open, but it draws
 * with that matrix's cell styles so the two read as one grid on the one paper.
 *
 * Under a chosen phase only what is there is drawn: an organization with
 * nothing in the phase is not a column, a row nobody provides in it is not a
 * row, and an open organization opens into the assets that are in it. Nothing
 * is dimmed or struck through for being absent.
 *
 * No requirements here: what each unit must reach is the Web view's to say,
 * and this stays the reference for what everyone could talk on.
 */
/**
 * The least a row is tall: the label line, the one-line name beneath it and the
 * cell padding, measured on the dev stack at 51px. Rows with no name line (the
 * transports) are padded to it, so the grid is one rhythm from top to bottom.
 */
const ROW_MIN_HEIGHT = 51;

/** The width budget: a chip clips past this, a unit column never grows past this, the label column runs between these. */
const CHIP_MAX_WIDTH = 120;
const UNIT_MAX_WIDTH = 160;
const LABEL_MIN_WIDTH = 170;
const LABEL_MAX_WIDTH = 220;

export function InteropMatrix({ model, expanded, onToggleExpand, readOnly = false }: {
  model: InteropModel;
  expanded: ReadonlySet<string>;
  onToggleExpand: (key: string) => void;
  /** A printed page: the heads carry no switch to open them with. */
  readOnly?: boolean;
}) {
  const { columns, rows } = model;

  if (columns.length === 0 || rows.length === 0) {
    return (
      <EmptyLine
        text={model.phaseId === null ? 'No waveforms to compare. Add waveforms to the Comms Library.' : 'Nothing is in this phase.'}
      />
    );
  }

  const isOpen = (c: InteropColumn) => expanded.has(c.key);
  const anyOpen = columns.some(isOpen);
  // How many grid columns each organization takes: one, or one per asset when
  // open. An open organization with nothing to open into keeps one.
  const widths = columns.map((c) => (isOpen(c) ? Math.max(1, c.sources.length) : 1));
  const starts: number[] = [];
  let next = 2;
  for (const w of widths) {
    starts.push(next);
    next += w;
  }
  const headRows = anyOpen ? 2 : 1;
  const span2 = anyOpen ? 'span 2' : undefined;

  const template = [
    // Every track is bounded so a long name clips rather than widening the grid
    // (maintainer, 10-19): the label column runs 170 to 220px with the key on
    // one line, and a collapsed unit column fits a chip beside its count up to
    // 160px. A track floored at a fixed width once let a long transport key wrap
    // to two lines and broke "AN/PRC-152" across two; a track with no ceiling
    // let the widest name set the width of the whole grid.
    // `max-content` as the floor, because a grid wider than its paper hands out
    // no free space and a fixed floor would pin the column there; the header's
    // own minWidth keeps it from going under LABEL_MIN_WIDTH.
    `minmax(max-content, ${String(LABEL_MAX_WIDTH)}px)`,
    ...columns.map((c, i) => (isOpen(c) ? `repeat(${String(widths[i])}, minmax(84px, 1fr))` : `minmax(max-content, ${String(UNIT_MAX_WIDTH)}px)`)),
  ].join(' ');

  const body: ReactElement[] = [];
  let line = headRows + 1;
  let lastSection: InteropSection | null = null;
  rows.forEach((row, r) => {
    const isLast = r === rows.length - 1;
    if (row.section !== lastSection) {
      lastSection = row.section;
      body.push(
        <div key={`s-${row.section}`} role="row" style={{ display: 'contents' }}>
          <div
            role="cell"
            style={{
              ...matrixHeaderCell(true), gridRow: line, gridColumn: '1 / -1',
              fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.12em',
            }}
          >
            {SECTION_CAPTION[row.section]}
          </div>
        </div>,
      );
      line += 1;
    }
    body.push(
      <div key={`${row.section}:${row.key}`} role="row" style={{ display: 'contents' }}>
        {/* Every row the same height: the name is one line with its full text in
            the title, and the header carries the row's minimum, so a long waveform
            name no longer makes its row three times taller than its neighbours. */}
        <div role="rowheader" style={{ ...matrixRowLabel(isLast), gridRow: line, gridColumn: 1, minHeight: ROW_MIN_HEIGHT, minWidth: LABEL_MIN_WIDTH, maxWidth: LABEL_MAX_WIDTH, boxSizing: 'border-box' }}>
          <div title={row.label} style={{ ...matrixWaveformLabel, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.label}</div>
          {row.name && (
            // `width: 0` with `minWidth: 100%` keeps this line out of the column's
            // intrinsic width, so the key sets the column and the name clips to it.
            <div title={row.name} style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: 0, minWidth: '100%' }}>
              {row.name}
            </div>
          )}
        </div>
        {columns.map((c, i) => {
          const cell = row.cells[i]?.sources ?? [];
          if (!isOpen(c)) {
            // On screen a collapsed cell shows the first asset and a "+N" for the rest, the
            // idiom the Loadout table uses ("SINCGARS +1"), so every row stays one line high.
            // The rest are in the tooltip and in the per-asset columns a click opens. A
            // document (readOnly: the print sheet) keeps every chip.
            const capped = !readOnly && cell.length > 1;
            const rest = cell.slice(1);
            return (
              <div
                key={c.participantId}
                role="cell"
                style={{
                  ...matrixCell(isLast), gridRow: line, gridColumn: starts[i],
                  display: 'flex', flexWrap: capped ? 'nowrap' : 'wrap', gap: 3, justifyContent: 'center', alignContent: 'center', alignItems: 'center',
                }}
              >
                {cell.length === 0
                  ? <span style={matrixMiss}>{EMPTY_VALUE}</span>
                  : (capped ? cell.slice(0, 1) : cell).map((s) => (
                    // Native titles sit below and right of the pointer and cannot be placed, so these use
                    // the app tooltip above the chip, as the wizard's chips do. The title is a node: a string would also be written back as a native `title`.
                    <Tooltip key={sourceKey(s)} title={<>{sourceTitle(s, row)}</>} describeChild enterDelay={200} placement="top">
                      <span style={chipSty(c.color)}>{s.label}</span>
                    </Tooltip>
                  ))}
                {capped && (
                  <Tooltip
                    title={<span style={{ whiteSpace: 'pre-line' }}>{rest.map((s) => sourceTitle(s, row)).join('\n')}</span>}
                    describeChild
                    enterDelay={200}
                    placement="top"
                  >
                    <button
                      type="button"
                      aria-label={`Expand ${c.label}: ${rest.map((s) => s.label).join(', ')}`}
                      onClick={() => { onToggleExpand(c.key); }}
                      style={{ ...chipSty(c.color), cursor: 'pointer' }}
                    >
                      {`+${String(rest.length)}`}
                    </button>
                  </Tooltip>
                )}
              </div>
            );
          }
          const subs = c.sources.length > 0 ? c.sources : [null];
          return subs.map((s, k) => {
            const has = s !== null && cell.some((x) => sourceKey(x) === sourceKey(s));
            return (
              <div
                key={`${c.participantId}-${s ? sourceKey(s) : 'none'}`}
                role="cell"
                style={{ ...matrixCell(isLast), gridRow: line, gridColumn: starts[i]! + k, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {/* An icon, not the text glyph `matrixCheck` draws: the display font has
                    no check mark, so the glyph fell back to a thin "v" that vanished in a
                    light unit colour such as TF WHITE's; `checkInk` swaps a colour the paper
                    would swallow for dark ink. 22px with auto margins: a block ignores the cell's
                    text-align, and at the dash's size the mark did not stand out from a dash. Colour is inline so a test can read it. */}
                {has && s
                  ? (
                    <Tooltip title={<>{sourceTitle(s, row)}</>} describeChild enterDelay={200} placement="top">
                      <CheckIcon data-testid="matrix-check" sx={{ fontSize: 22, display: 'block', mx: 'auto' }} style={{ color: checkInk(c.color || 'var(--shf-amber-deep)') }} />
                    </Tooltip>
                  )
                  : <span style={matrixMiss}>{EMPTY_VALUE}</span>}
              </div>
            );
          });
        })}
      </div>,
    );
    line += 1;
  });

  return (
    // Scrolls inside itself: an open organization is one column per asset, and
    // the page must never scroll sideways.
    <div style={{ overflowX: 'auto' }}>
      <div
        role="table"
        aria-label="Operation interoperability matrix"
        style={{ display: 'grid', gridTemplateColumns: template, borderTop: '2px solid var(--fg-1)', minWidth: 'min-content' }}
      >
        <div role="row" style={{ display: 'contents' }}>
          <div role="columnheader" style={{ ...matrixHeaderCell(true), gridRow: span2 ? '1 / span 2' : 1, gridColumn: 1, alignSelf: 'stretch' }}>
            Capability
          </div>
          {columns.map((c, i) => (
            <div
              key={c.participantId}
              role="columnheader"
              title={c.name}
              style={{
                ...matrixHeaderCell(false), gridRow: span2 && !isOpen(c) ? '1 / span 2' : 1,
                gridColumn: isOpen(c) ? `${String(starts[i])} / span ${String(widths[i])}` : starts[i],
              }}
            >
              <OrgHead
                column={c}
                expanded={isOpen(c)}
                onToggle={() => { onToggleExpand(c.key); }}
                readOnly={readOnly}
              />
            </div>
          ))}
        </div>
        {anyOpen && (
          <div role="row" style={{ display: 'contents' }}>
            {columns.map((c, i) => isOpen(c) && (c.sources.length > 0 ? c.sources : [null]).map((s, k) => {
              return (
                <div
                  key={`${c.participantId}-${s ? sourceKey(s) : 'none'}`}
                  role="columnheader"
                  title={s ? s.label : undefined}
                  style={{
                    ...matrixHeaderCell(false), gridRow: 2, gridColumn: starts[i]! + k,
                    borderTop: `2px solid ${c.color || 'var(--shf-amber)'}`,
                  }}
                >
                  {s ? (
                    <div>
                      <div style={{ color: 'var(--fg-1)', overflowWrap: 'anywhere' }}>{s.label}</div>
                      <div style={captionSty}>{s.caption}</div>
                    </div>
                  ) : (
                    <span style={matrixMiss}>{EMPTY_VALUE}</span>
                  )}
                </div>
              );
            }))}
          </div>
        )}
        {body}
      </div>
    </div>
  );
}

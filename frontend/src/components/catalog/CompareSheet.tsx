import type { Equipment } from '@/types';
import { cmp } from './compare-palette';
import { LABEL_COL, type CompareDensity } from './compare-page-guides';
import { EquipmentPhoto } from './EquipmentPhoto';
import { CellValue } from './CompareMatrix';
import { GROUP_LABELS, cellFor, type CompareParam } from './compare-params';
import { groupRows } from './compare-selection';

interface CompareSheetProps {
  /** One page's worth of columns, already balanced by the caller. */
  columns: Equipment[];
  params: CompareParam[];
  density: CompareDensity;
  /** Shrinks a value's text to stay on one line before it wraps - see
   *  CellValue's own `fit` prop. Off by default, matching CellValue, so a
   *  caller that does not pass it (there is none left, but the default keeps
   *  this prop optional rather than required everywhere) gets today's
   *  behaviour. */
  fit?: boolean;
  /** Render only these group headings and param rows (`g:<group>` /
   *  `r:<param.id>`), in order - one printed row page's worth, as decided by
   *  `paginateRows`. Absent renders every row, which is what the hidden
   *  measuring twin in `use-print-pagination.tsx` wants: the one full-height
   *  reference every page's pagination is measured against. */
  rowKeys?: string[];
  /** Whether the photo strip may render at all, default true. `usePrintPagination`
   *  puts it on the first row page of each column chunk only
   *  (`showPhotos={r === 0}`) - a photo is not information a reader needs to
   *  see repeated on every continuation page, and the strip still costs real
   *  vertical space CompareSheet's own caller already had to plan the row
   *  break around. The strip renders only when this is true AND at least one
   *  column on the page has a photo - see the strip's own doc comment for
   *  why an all-blank page skips it entirely regardless of this prop. */
  showPhotos?: boolean;
}

/**
 * One printed page of the comparison, as a native `<table>`.
 *
 * Print only. CompareMatrix.tsx is a CSS grid inside an `overflowX: auto`
 * wrapper with a sticky label column, both of which are screen ideas: print
 * clips an overflow container rather than paginating it, and there is no
 * such thing as "sticky" once content spans real sheets of paper. A `<table>`
 * solves both for free, and for a reason specific to print rather than to
 * habit:
 *
 * - `<thead>` repeats at the top of every page a browser's print engine
 *   breaks the table across, which is exactly the "row labels on the
 *   previous sheet" failure a from-scratch layout would have to reinvent
 *   with `position: fixed` tricks that do not exist in the print box model.
 * - `tr { break-inside: avoid }` is honoured consistently by Chrome, Safari
 *   and Firefox for table rows. The equivalent for CSS grid fragmentation is
 *   not: grid rows are not "rows" to the print engine the way table rows
 *   are, which is the entire reason the screen matrix cannot lean on the
 *   browser to decide its own row breaks and instead reads the same
 *   `paginateRows` decision this component's caller already measured.
 *
 * This component knows nothing about the equipment shape beyond `id`,
 * `nomenclature`, `nickname` and `photo_url` - the same restriction
 * CompareMatrix.tsx holds itself to - and reads every value through
 * `cellFor`, so a parameter added to the registry never touches this file.
 *
 * It does not set its own palette vars. Its ancestor (catalog-compare-print-
 * page.tsx) does, with either DARK or INK depending on the reader's choice,
 * so this file - like CompareMatrix - never branches on which scheme it is
 * drawing.
 */
export function CompareSheet({
  columns,
  params,
  density: d,
  fit = false,
  rowKeys,
  showPhotos = true,
}: CompareSheetProps) {
  const groups = groupRows(params);
  // null means "no filter" rather than an empty Set, which would hide every
  // row - the same absent/empty distinction `compare-selection.ts` already
  // holds `resolveParams` to.
  const rowKeySet = rowKeys ? new Set(rowKeys) : null;
  const included = (key: string) => rowKeySet === null || rowKeySet.has(key);

  const headCell: React.CSSProperties = {
    padding: d.pad,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: cmp('headText'),
    background: cmp('head'),
    borderBottom: `1.5px solid ${cmp('ruleStrong')}`,
    // Names wrap rather than truncate. Paper has no hover title to recover a
    // clipped nomenclature with, so an ellipsis here would be a silent loss
    // of information the screen version can afford and print cannot.
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    verticalAlign: 'bottom',
    textAlign: 'center' as const,
  };

  let stripe = 0;

  return (
    <table
      style={{
        tableLayout: 'fixed',
        width: '100%',
        borderCollapse: 'collapse',
        borderTop: `2px solid ${cmp('accent')}`,
        background: cmp('bg'),
        // Backgrounds are dropped by a browser's print defaults unless the
        // page opts in. Without this the zebra stripe and the group band
        // print as plain white, which is the whole "light text on a white
        // sheet" failure this feature exists to fix. The INK scheme stays
        // legible even if some engine still overrides it, because its text
        // is dark ink regardless of what the ground does.
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
      }}
    >
      <colgroup>
        <col style={{ width: LABEL_COL }} />
        {columns.map(eq => <col key={eq.id} />)}
      </colgroup>

      {/* Repeats on every printed page - see the file doc comment for why
          that is the reason this is a table at all. `data-print-part="head"`
          is how `use-print-pagination.tsx`'s hidden twin finds it to measure
          the height every page's row pagination has to repeat. */}
      <thead data-print-part="head">
        <tr>
          <th scope="col" style={{ ...headCell, textAlign: 'left' }}>Parameter</th>
          {columns.map(eq => (
            <th key={eq.id} scope="col" style={headCell}>
              <div>{eq.nickname || eq.nomenclature}</div>
              {eq.nickname && (
                <div
                  style={{
                    fontSize: 8.5,
                    fontWeight: 400,
                    letterSpacing: '0.06em',
                    marginTop: 2,
                    color: cmp('headText'),
                  }}
                >
                  {eq.nomenclature}
                </div>
              )}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {/* Photo wells print once, in the first body row rather than in
            thead. A thead repeats on every page, and a photo is exactly the
            content a reader does not need to see six times over a twenty-row
            comparison - it would cost real vertical space on every page for
            no new information after the first.

            Skipped entirely when no column on this page has a photo, or when
            the caller says this row page is not the first for its column
            chunk (`showPhotos={false}`) - see this component's own prop doc
            for why that is `usePrintPagination`'s call to make, not this
            component's. `data-print-part="photos"` is how the hidden twin
            finds it to measure `firstExtra`, the height page one alone must
            subtract. The screen keeps an empty well for uniformity, because
            a ragged header makes two records look like different kinds of
            thing; a strip of identical NO PHOTO boxes carries no such signal
            and costs the page about an inch. */}
        {showPhotos && columns.some(eq => Boolean(eq.photo_url)) && (
        <tr data-print-part="photos" style={{ background: cmp('bg') }}>
          <th scope="row" style={{ ...cellSty(d, cmp('rule')), textAlign: 'left' }} />
          {columns.map(eq => (
            <td key={eq.id} style={cellSty(d, cmp('rule'))}>
              {/* The frame is drawn ONLY for a record with no photo, where it
                  is the thing that makes an empty slot read as a slot rather
                  than as a gap someone forgot to fill.

                  A record that HAS a photo gets no frame, because the well is
                  full cell width while `objectFit: contain` fits the image
                  into `d.photo` of height - so on anything but a perfectly
                  proportioned landscape shot the border boxes two margins of
                  white paper with a small picture stranded in the middle. It
                  read as a mistake on the printed sheet, and it was: the
                  border was unconditional, inherited from the screen well
                  where a dark ground makes it a subtle slot rather than a
                  hard rule on white. An image already states its own bounds. */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: d.photo,
                  background: cmp('photoBg'),
                  border: eq.photo_url ? 'none' : `1px solid ${cmp('photoBorder')}`,
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
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <span
                    role="img"
                    aria-label="no photo"
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
              </div>
            </td>
          ))}
        </tr>
        )}

        {groups.map(({ group, params: rows }) => {
          const groupKey = `g:${group}`;
          return (
            <FragmentGroup
              key={group}
              printKey={groupKey}
              label={GROUP_LABELS[group]}
              span={columns.length + 1}
              show={included(groupKey)}
            >
              {rows.map(param => {
                const rowKey = `r:${param.id}`;
                // Incremented for every row in the FULL param list, whether or
                // not this page renders it - a continuation page's zebra has to
                // pick up where the previous page's left off, or two adjacent
                // rows split across a page break come back the same shade with
                // nothing but the header between them.
                const rowBg = stripe++ % 2 === 0 ? cmp('bg') : cmp('bgAlt');
                if (!included(rowKey)) return null;
                return (
                  <tr
                    key={param.id}
                    data-print-key={rowKey}
                    style={{ background: rowBg, breakInside: 'avoid', pageBreakInside: 'avoid' }}
                  >
                    <th
                      scope="row"
                      style={{
                        ...cellSty(d, cmp('rule')),
                        textAlign: 'left',
                        fontFamily: 'var(--font-mono)',
                        fontSize: d.label,
                        lineHeight: `${String(d.line)}px`,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: cmp('label'),
                      }}
                    >
                      {param.label}
                    </th>
                    {columns.map(eq => (
                      // Centred under the centred equipment name, so each column
                      // reads as one unit rather than a name floating over a
                      // ragged left edge.
                      <td key={eq.id} style={{ ...cellSty(d, cmp('rule')), textAlign: 'center' }}>
                        <CellValue cell={cellFor(param, eq)} density={d} align="center" fit={fit} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </FragmentGroup>
          );
        })}
      </tbody>
    </table>
  );
}

function cellSty(d: CompareDensity, ruleColor: string): React.CSSProperties {
  return {
    // Half the screen's vertical padding. Paper is the scarce axis here: at
    // the screen's padding a single-line row printed half an inch tall and a
    // twenty-row comparison ran onto a second page it did not need.
    padding: `${String(Math.max(3, Math.round(d.pad / 2)))}px ${String(d.pad)}px`,
    // Middle, so a label and its values share one midline. Top printed every
    // small mono label visibly above the larger body-type value beside it,
    // and baseline did not level them either (checked in a real PDF). A table
    // cell always fills its row, so centring costs nothing, unlike the screen
    // grid, where changing alignment stops cells stretching and breaks the
    // zebra.
    verticalAlign: 'middle',
    borderBottom: `1px solid ${ruleColor}`,
    overflowWrap: 'anywhere',
    // The cell's own line box, not the page's. Without these the cell
    // inherited the body's font size and line height, and that inherited
    // strut, not the compact 13px line, set every row's height: compact
    // type printed in rows as tall as the comfortable ones.
    fontSize: d.value,
    lineHeight: `${String(d.line)}px`,
  };
}

/**
 * One group heading row plus its parameter rows, as a plain `<>` rather than
 * a `<tbody>` per group: a table may have several `<tbody>` elements, but
 * splitting the body that way buys nothing here and would make the zebra
 * counter's "runs across the whole table" invariant (see CompareMatrix.tsx's
 * matching comment) harder to see is still one counter.
 *
 * `show` decides only whether the heading `<tr>` itself renders - `children`
 * is always rendered, because each row inside already decides for itself
 * whether it is included (see the `included` closure above), and that is
 * what keeps the zebra stripe counter running even for rows a given row page
 * does not draw. `paginateRows` guarantees a heading is never orphaned by
 * the page that comes right after it, but a page that starts mid-group
 * legitimately has no heading of its own, and that is fine: the reader is
 * already mid-table by then, reading the repeated `<thead>` for context.
 */
function FragmentGroup({
  label,
  span,
  printKey,
  show,
  children,
}: {
  label: string;
  span: number;
  printKey: string;
  show: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {show && (
        <tr
          data-print-key={printKey}
          style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid', breakInside: 'avoid' }}
        >
          <th
            scope="colgroup"
            colSpan={span}
            style={{
              padding: '3px 8px',
              textAlign: 'left',
              background: cmp('group'),
              color: cmp('groupText'),
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            {label}
          </th>
        </tr>
      )}
      {children}
    </>
  );
}

import { InteropMatrix } from './interop-matrix';
import type { MatrixPage } from './matrix-pages';
import { SHEET_PAD_X } from './phase-deck-sheet';
import { titleSty } from './sheet-parts';

const NONE: ReadonlySet<string> = new Set();
const noop = () => undefined;

/**
 * What one printed page of the operation's Matrix is: the title over the grid,
 * on paper, the same two things as the deck's slide. The grid is the screen's
 * `InteropMatrix`, collapsed and with no switch on its heads, over the page's
 * own columns and rows (`matrix-pages.ts`), so the header repeats on every page
 * and a page that begins part way down a section says which section it is.
 * `width` and `minHeight` are the paper's own size, as for `PhaseSheet`.
 */
export function MatrixSheet({ page, width, minHeight }: { page: MatrixPage; width: number; minHeight: number }) {
  return (
    <div style={{ width, minHeight, boxSizing: 'border-box', padding: `28px ${String(SHEET_PAD_X)}px`, background: 'var(--shf-paper)' }}>
      <div style={titleSty}>{page.title}</div>
      <InteropMatrix model={page.model} expanded={NONE} onToggleExpand={noop} readOnly />
    </div>
  );
}

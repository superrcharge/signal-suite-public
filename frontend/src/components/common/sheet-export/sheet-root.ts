/**
 * The stable handle an exporter uses to find the sheet on screen.
 *
 * Neither printable sheet had one. The print CSS reaches the PACE page through
 * `.pace-print-wrapper > *`, because the MUI `Paper` carrying the page size has
 * no name of its own, and both catalog pages reach theirs with a bare
 * `document.querySelector('article')`.
 *
 * A data attribute rather than an `id`: `catalog-editor-page` mounts a second
 * `DataSheetView` in its live preview pane, so an id could not stay unique, and
 * that is the same ambiguity the bare `article` selector already has. Not a
 * forwarded ref either, because the catalog's page box is built in the pages
 * rather than in a component, so there would be nothing to forward it to.
 *
 * Mark the element whose untransformed layout box IS the printed page:
 *
 * - PACE, the `Paper` in `SheetPreview.tsx`, which is exactly PAGE_W x PAGE_H.
 * - Catalog, the 816 x 1056 page box in the two catalog pages, NOT the
 *   `article` inside it. The article is 1024 wide with a height that flows
 *   with the data; the box is the page it gets scaled into.
 */
export const SHEET_ROOT_ATTR = 'data-sheet-root';

/** Spread onto the element that is the printed page. */
export function sheetRootProps(): Record<string, string> {
  return { [SHEET_ROOT_ATTR]: '' };
}

/**
 * Marks a descendant of the sheet root that is a screen affordance, not part
 * of the document: a search box, an add form, a row's edit and delete buttons.
 * The rasterizer drops it from the clone, so the picture is what the print
 * route prints. `'block'` says the element takes vertical space of its own
 * (the add form), so the measured sheet height gives that space back and the
 * picture does not end in a blank band where the form was; an inline control
 * inside a row changes no height and takes the default.
 */
export const SHEET_OMIT_ATTR = 'data-sheet-omit';

export function sheetOmitProps(kind: 'inline' | 'block' = 'inline'): Record<string, string> {
  return { [SHEET_OMIT_ATTR]: kind };
}

/** Whether the rasterizer keeps this node. html-to-image asks per node. */
export function keepInSheet(node: Node): boolean {
  return !(node instanceof Element && node.hasAttribute(SHEET_OMIT_ATTR));
}

/**
 * The vertical space the root's omitted blocks take on screen, margins
 * included, so a measured export can subtract it.
 */
export function omittedBlockHeight(root: HTMLElement): number {
  let total = 0;
  for (const el of root.querySelectorAll<HTMLElement>(`[${SHEET_OMIT_ATTR}="block"]`)) {
    const cs = getComputedStyle(el);
    total += el.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
  }
  return total;
}

/** The marked sheet, or null when the current route has none. */
export function findSheetRoot(scope: ParentNode = document): HTMLElement | null {
  return scope.querySelector<HTMLElement>(`[${SHEET_ROOT_ATTR}]`);
}

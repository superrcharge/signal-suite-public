/**
 * Builds the export spec for each of the two sheets.
 *
 * A function returning a spec, rather than a spec, because the marked element
 * does not exist until the sheet has rendered. Resolving it at click time also
 * means the catalog picks up whatever the scale slider is set to right then.
 *
 * Kept out of the pages so the page change is one line each, and out of
 * `sheet-export.ts` so that file does not need to know a sheet's dimensions.
 */
import { catalogStem, compareStem, compatStem, libraryStem, netsStem, paceStem, type SheetExportSpec } from './sheet-export';
import { findSheetRoot, omittedBlockHeight } from './sheet-root';
import { CATALOG_SLIDE, PACE_SLIDE } from './slide-geometry';

/** US Letter at 96dpi, matching SheetPreview's PAGE_W/PAGE_H. */
const PACE_W = 1056;
const PACE_H = 816;

/** The catalog page box, the same the other way up. */
const CATALOG_W = 816;
const CATALOG_H = 1056;

export function paceExportSpec(section: string, label: string): () => SheetExportSpec | null {
  return () => {
    const root = findSheetRoot();
    if (!root) return null;
    return {
      root,
      width: PACE_W,
      height: PACE_H,
      slide: PACE_SLIDE,
      stem: paceStem(section),
      title: `${label} comms card`,
      // The PACE card alone gets editable text on the slide. See the flag's
      // doc comment for why the catalog datasheet cannot.
      nativeText: true,
    };
  };
}

export function catalogExportSpec(name: string): () => SheetExportSpec | null {
  return () => {
    const root = findSheetRoot();
    if (!root) return null;
    return {
      root,
      width: CATALOG_W,
      height: CATALOG_H,
      slide: CATALOG_SLIDE,
      stem: catalogStem(name),
      title: `${name} datasheet`,
      // Cancels the cosmetic viewZoom the page box carries. It is derived from
      // a ResizeObserver fitting the sheet to the window, and html-to-image
      // copies the computed transform onto the clone - so without this the same
      // click produces a differently scaled picture at different window widths.
      // The article's own print scale is INSIDE this box and is left alone,
      // which is what makes the export honour the scale slider.
      style: {
        transform: 'none',
        // The on-screen box deliberately does NOT clip: a datasheet taller than
        // one page spills, and the dashed page-break line marks where. Print
        // clips it, via `.catalog-print-wrapper { overflow: hidden }`. The
        // export follows print, or a slide would carry content the printed
        // sheet drops.
        overflow: 'hidden',
      },
    };
  };
}

/**
 * The comparison matrix, which is the first sheet here with no fixed size.
 *
 * Both other sheets are a page box of known dimensions, so their spec is a
 * constant. This one is as wide as the reader's column count and as tall as
 * their row count, so it is measured at click time from the marked element.
 *
 * The marked element must be the grid itself rather than its scrolling
 * wrapper. The wrapper is only as wide as the viewport, so exporting it would
 * silently crop every column scrolled off to the right, which is exactly the
 * comparison the reader built.
 *
 * Landscape Letter, because a matrix is wider than it is tall in every case
 * worth exporting. It will rarely match that aspect, and it does not need to:
 * `slideImagePlacement` letterboxes a mismatch rather than stretching it.
 *
 * `backgroundColor` is a parameter rather than a literal baked in here,
 * because the matrix now prints in a choice of palettes (DARK or INK - see
 * `compare-palette.ts`) while the digital export always stays dark: a picture
 * of the ink-on-paper scheme dropped onto a slide would look like a missing
 * asset, not a comparison. The live page is what decides, passing `DARK.bg`
 * every time via `@/components/catalog`, so this file does not need to import
 * from `components/catalog` itself - which would couple the shared exporter
 * to one sheet and risks the chunk cycle `node scripts/check-bundle.mjs`
 * exists to catch.
 */
export function compareExportSpec(backgroundColor: string): () => SheetExportSpec | null {
  // The matrix is drawn on the page background, and a picture of it with a
  // transparent ground reads as white-on-white pasted into a slide.
  return measuredSpec(compareStem, 'Equipment comparison', backgroundColor);
}

/**
 * A sheet with no fixed page: whatever the marked root measures at click time
 * goes on the slide. Shared by every sheet whose size is the reader's column
 * or row count, so the measurement rule and its guard live once.
 *
 * scrollWidth/Height, not the layout box: the grid is inside an overflow-x
 * container and its own box can be clipped by it. A zero in either means the
 * root has not laid out yet, and there is nothing to export. Blocks the root
 * marks with `sheetOmitProps('block')` are dropped from the picture, so their
 * height comes off too; otherwise the slide ends in a band of background
 * where the add form was. The stem is a thunk because it can carry the date,
 * which is read when the click happens.
 * Background: passed in when the caller chooses a palette, else read back
 * from the root, for sheets that have one palette of their own.
 */
function measuredSpec(stem: () => string, title: string, backgroundColor?: string): () => SheetExportSpec | null {
  return () => {
    const root = findSheetRoot();
    if (!root) return null;
    const width = Math.max(root.scrollWidth, root.offsetWidth);
    const height = Math.max(root.scrollHeight, root.offsetHeight) - omittedBlockHeight(root);
    if (width === 0 || height <= 0) return null;
    return {
      root,
      width,
      height,
      slide: PACE_SLIDE,
      stem: stem(),
      title,
      backgroundColor: backgroundColor ?? getComputedStyle(root).backgroundColor,
    };
  };
}

/**
 * The joint compatibility matrix. Sized at click time like the comparison, and
 * for the same reason: its width is the reader's column count.
 *
 * The marked element is the max-content box inside the scroll wrapper, holding
 * the grid and its legend, so a column scrolled off screen is still in the
 * picture and the ✓R has its key beside it. Its own paper background is read
 * back rather than passed in: the matrix has one palette, so there is no choice
 * for a caller to make, and nothing here needs to import from the catalog.
 */
export function compatExportSpec(): () => SheetExportSpec | null {
  return measuredSpec(compatStem, 'Joint compatibility matrix');
}

/**
 * One Comms Library pane - waveforms, services, transports or platforms -
 * sized at click time like the two matrices, because its height is the row
 * count. Landscape, since the rows are wide and few. Background read back
 * from the pane, which has one dark palette of its own.
 */
export function libraryExportSpec(label: string): () => SheetExportSpec | null {
  return measuredSpec(() => libraryStem(label), `${label} library`);
}

/** One squadron's nets table for one radio, sized at click time like the libraries. */
export function netsExportSpec(label: string): () => SheetExportSpec | null {
  return measuredSpec(() => netsStem(label), `${label} nets`);
}

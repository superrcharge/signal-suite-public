/**
 * The three things a sheet can be exported as: a .pptx slide, the clipboard,
 * and a .png file.
 *
 * All three rasterize once per click and differ only in what they do with the
 * canvas. Nothing here imports `@/services`: the sheet is already rendered, and
 * the exporter reads the DOM. See the note in `sheet-export-menu.tsx` for why
 * that matters to the test suite.
 */
import { datedFilename, saveBlob } from '../csv/download-csv';
import { hideRuns, planPaceText } from './pace-text-runs';
import { buildPptx, buildPptxSlide } from './pptx';
import { rasterizeSheet } from './rasterize';
import { sheetFontFiles } from './sheet-fonts';
import {
  DEFAULT_PIXEL_RATIO,
  slideImagePlacement,
  type SheetSize,
  type SlideSize,
} from './slide-geometry';

export interface SheetExportSpec extends SheetSize {
  /** The marked element. Its untransformed layout box is the printed page. */
  readonly root: HTMLElement;
  /** Slide size, in inches. PACE is landscape, the catalog is portrait. */
  readonly slide: SlideSize;
  /** Filename stem, with no date and no extension. */
  readonly stem: string;
  /** Human name for the sheet, used as the picture's alt text on the slide. */
  readonly title: string;
  readonly pixelRatio?: number;
  /**
   * Style overrides applied to the clone. The catalog MUST pass
   * `transform: 'none'`: its page box carries a cosmetic `viewZoom` derived
   * from a ResizeObserver, and without cancelling it the exported picture is
   * scaled by whatever the browser window happened to be.
   */
  readonly style?: Record<string, string>;
  readonly backgroundColor?: string;
  /**
   * Emit the sheet's HTML text as native, editable PowerPoint text rather than
   * leaving it in the picture. Affects the .pptx only - the .png and the
   * clipboard are pictures by definition.
   *
   * Opt in per sheet, and only the PACE card opts in. The catalog datasheet
   * must not: it draws ~80 hairlines as borders on text divs, its scale varies
   * with the record's content height, and its rows align on a shared baseline,
   * which a PowerPoint text box cannot express.
   */
  readonly nativeText?: boolean;
}

export interface SheetExportResult {
  readonly ok: boolean;
  /** Set when a face could not be embedded. The picture exists but may clip. */
  readonly fontWarning?: string;
  readonly error?: string;
}

const FONT_WARNING =
  'Some fonts could not be embedded, so the exported picture may not match the sheet exactly.';

function warningFor(missing: readonly string[]): string | undefined {
  return missing.length > 0 ? FONT_WARNING : undefined;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The browser produced no image data.'))),
      'image/png',
    );
  });
}

async function render(spec: SheetExportSpec) {
  return await rasterizeSheet({
    root: spec.root,
    width: spec.width,
    height: spec.height,
    pixelRatio: spec.pixelRatio ?? DEFAULT_PIXEL_RATIO,
    style: spec.style,
    backgroundColor: spec.backgroundColor,
  });
}

/** The shared first half of every action. Exported for the clipboard's sake. */
export async function sheetToPngBlob(spec: SheetExportSpec): Promise<Blob> {
  const { canvas } = await render(spec);
  return await canvasToBlob(canvas);
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'The export failed.';
}

export async function downloadSheetPng(spec: SheetExportSpec): Promise<SheetExportResult> {
  try {
    const { canvas, missingFonts } = await render(spec);
    saveBlob(await canvasToBlob(canvas), datedFilename(spec.stem, 'png'));
    return { ok: true, fontWarning: warningFor(missingFonts) };
  } catch (error) {
    return { ok: false, error: messageFrom(error) };
  }
}

export async function downloadSheetPptx(spec: SheetExportSpec): Promise<SheetExportResult> {
  try {
    const pptx = spec.nativeText ? await nativeTextPptx(spec) : await picturePptx(spec);
    saveBlob(
      new Blob([pptx.bytes as unknown as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
      datedFilename(spec.stem, 'pptx'),
    );
    return { ok: true, fontWarning: warningFor(pptx.missingFonts) };
  } catch (error) {
    return { ok: false, error: messageFrom(error) };
  }
}

interface BuiltPptx {
  readonly bytes: Uint8Array;
  readonly missingFonts: readonly string[];
}

/** One flat picture. What the catalog datasheet uses. */
async function picturePptx(spec: SheetExportSpec): Promise<BuiltPptx> {
  const { canvas, missingFonts } = await render(spec);
  const png = new Uint8Array(await (await canvasToBlob(canvas)).arrayBuffer());
  return {
    bytes: buildPptx({
      slide: spec.slide,
      png,
      sheet: { width: spec.width, height: spec.height },
      altText: spec.title,
    }),
    missingFonts,
  };
}

/**
 * A full-bleed picture of the sheet with its text hidden, plus one native text
 * box per hidden run.
 *
 * The order matters and is not interchangeable: measure first, because a run's
 * rect has to be read while the walk can still see its computed style; then
 * hide; then rasterize, so the picture carries the rules, tile frames, photos
 * and both wheels but no visible text; then restore in a `finally`, because
 * leaving the operator's sheet unreadable after a failed export is far worse
 * than the failure itself.
 */
async function nativeTextPptx(spec: SheetExportSpec): Promise<BuiltPptx> {
  const plan = planPaceText(spec.root, spec.width);
  const restore = hideRuns(plan.elements);

  let canvas: HTMLCanvasElement;
  let missingFonts: readonly string[];
  try {
    ({ canvas, missingFonts } = await render(spec));
  } finally {
    restore();
  }

  const png = new Uint8Array(await (await canvasToBlob(canvas)).arrayBuffer());
  // Embedded so the text renders in the sheet's own faces on a machine that has
  // none of them installed, which is every machine but a developer's. Fetched
  // rather than reused from the CSS embed above, because that one is base64 for
  // an SVG and this one needs the raw sfnt bytes.
  const fonts = await sheetFontFiles();

  return {
    bytes: buildPptxSlide({
      slide: spec.slide,
      pictures: [
        {
          png,
          place: slideImagePlacement(spec.slide, { width: spec.width, height: spec.height }),
          altText: spec.title,
        },
      ],
      texts: plan.boxes,
      fonts,
    }),
    missingFonts,
  };
}

/**
 * Three gates, all of which have to hold before the clipboard is offered.
 *
 * Reported rather than assumed, so the menu can disable the item and say why
 * instead of hiding it. A capability that silently vanishes looks like a broken
 * build.
 */
export function clipboardImageSupported(w: Window = window): boolean {
  return Boolean(
    w.isSecureContext &&
      typeof w.navigator?.clipboard?.write === 'function' &&
      typeof (w as { ClipboardItem?: unknown }).ClipboardItem !== 'undefined',
  );
}

export function clipboardUnavailableReason(w: Window = window): string | undefined {
  if (clipboardImageSupported(w)) return undefined;
  if (!w.isSecureContext) return 'Needs a secure connection (https)';
  return 'Not supported in this browser';
}

export async function copySheetToClipboard(spec: SheetExportSpec): Promise<SheetExportResult> {
  if (!clipboardImageSupported()) {
    return { ok: false, error: 'The clipboard is not available here. Use Download .png instead.' };
  }

  try {
    // Safari requires the write to happen in the task that handled the gesture,
    // and awaiting the rasterize would leave it. Handing ClipboardItem the
    // promise itself is the spec's answer to exactly that, so this deliberately
    // does not await before constructing the item.
    const blobPromise = sheetToPngBlob(spec);

    let item: ClipboardItem;
    try {
      item = new ClipboardItem({ 'image/png': blobPromise });
    } catch {
      // Some engines have refused a promise value in the constructor. This path
      // loses the gesture, so it may be denied in Safari; that lands below.
      item = new ClipboardItem({ 'image/png': await blobPromise });
    }

    await navigator.clipboard.write([item]);
    return { ok: true };
  } catch (error) {
    // Name the recovery the menu already offers rather than only the failure.
    const detail = error instanceof Error && error.name === 'NotAllowedError'
      ? 'The browser refused clipboard access.'
      : messageFrom(error);
    return { ok: false, error: `${detail} Use Download .png instead.` };
  }
}

/** `A SQD` -> `a-sqd`, so a section label is safe in a filename. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function paceStem(section: string): string {
  return `signal-suite-pace-card-${slugify(section)}`;
}

export function compareStem(): string {
  // No name to slugify: the sheet is defined by whatever the reader selected,
  // and putting ten nomenclatures in a filename helps nobody. The date the
  // caller appends is what distinguishes two of them.
  return 'signal-suite-equipment-comparison';
}

export function compatStem(): string {
  // Same reasoning as compareStem: the sheet is whatever columns the reader
  // picked, and the appended date is what tells two of them apart.
  return 'signal-suite-compatibility-matrix';
}

export function netsStem(label: string): string {
  const slug = slugify(label);
  return slug ? `signal-suite-nets-${slug}` : 'signal-suite-nets';
}

export function libraryStem(label: string): string {
  const slug = slugify(label);
  return slug ? `signal-suite-${slug}-library` : 'signal-suite-library';
}

export function catalogStem(name: string): string {
  const slug = slugify(name);
  return slug ? `signal-suite-datasheet-${slug}` : 'signal-suite-datasheet';
}

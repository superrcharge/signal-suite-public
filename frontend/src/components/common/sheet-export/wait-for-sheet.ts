/**
 * Waits for one sheet to be ready to capture.
 *
 * An element-scoped sibling of `waitForImages` in `@/utils`, NOT a replacement
 * for it. That helper's contract is deliberately the opposite of what is wanted
 * here, and every difference is intentional:
 *
 * | | waitForImages | waitForSheetReady |
 * |---|---|---|
 * | scope | the whole document | one element |
 * | no images present | waits out the full timeout | returns at once |
 * | late insertions | MutationObserver catches them | not watched |
 * | trigger | page load, before print | a user click |
 *
 * It watches for late insertions because `EquipmentPhoto` inserts its `img`
 * only after an `apiFetch` resolves, and a print route has to wait for that.
 * A click does not: whatever is on the sheet at the moment the operator chose
 * to export is what they looked at and what they meant to export. Reusing that
 * helper here would pay a flat 5s on every export of a sheet with no photos,
 * which is every export in local dev.
 *
 * The `allSettled` matters because a rejection here would be a hang, not an
 * error: waiting on `load` alone never settles for an image that 404s, so one
 * unreachable resource would block the export indefinitely. It was written
 * against a certain instance - `DataSheet.tsx`'s `<img src="/signal-suite-logo.png">`,
 * a watermark file that was never committed, since removed - and still covers
 * the live one, an `EquipmentPhoto` whose `photo_url` outlived its blob.
 */

const DEFAULT_TIMEOUT_MS = 5000;

function settle(image: HTMLImageElement, timeoutMs: number): Promise<void> {
  if (image.complete) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      image.removeEventListener('load', done);
      image.removeEventListener('error', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    image.addEventListener('load', done);
    image.addEventListener('error', done);
  });
}

export async function waitForSheetReady(
  root: Element,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  // document.fonts is absent in jsdom, so this is guarded rather than awaited
  // unconditionally. The guard tests the FontFaceSet, not its `ready` promise,
  // because a promise in a boolean condition is always truthy and reads as a
  // check that is doing something when it is not.
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (fonts) await fonts.ready.catch(() => undefined);

  const images = Array.from(root.querySelectorAll('img'));
  if (images.length === 0) return;

  // SVG <image> is deliberately not waited on. It fires no load event, and both
  // hubs already hold either a resolved emblem or the inline placeholder data
  // URI by the time the sheet is on screen to be clicked.
  await Promise.allSettled(images.map((image) => settle(image, timeoutMs)));
}

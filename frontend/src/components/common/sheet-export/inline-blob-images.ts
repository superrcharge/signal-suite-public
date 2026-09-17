/**
 * Swaps every `blob:` image reference under a node for a `data:` URI, and puts
 * them back afterwards.
 *
 * Rasterizing works by cloning the subtree into a standalone SVG served as a
 * data URI, then drawing that through an `<img>`. That document does not share
 * an origin with the page, so a `blob:` object URL minted here is not reliably
 * loadable from inside it. Every real picture on both sheets is exactly that:
 * `EquipmentPhoto` and `usePaceEmblem` fetch through `apiFetch` and hand back
 * `URL.createObjectURL(blob)`.
 *
 * `html-to-image` does attempt this itself, and its failure path is
 * `imagePlaceholder || ''` after a `console.warn`. So the symptom of relying on
 * it and being wrong is a silently blank emblem hub on a printed comms card,
 * which is the worst shape a bug can have here. Doing the swap ourselves makes
 * it explicit and testable.
 *
 * Two element kinds carry these, and the second is not an `<img>`:
 *
 * - `HTMLImageElement.src`, up to four PACE tile photos and one catalog hero.
 * - `SVGImageElement`, the two wheel hubs in `ChannelWheel`.
 *
 * The href is read and written as an ATTRIBUTE rather than through
 * `href.baseVal`. jsdom does not give `SVGImageElement` a real
 * `SVGAnimatedString`, so a `baseVal` implementation could not be tested at
 * all, and the attribute is what the serializer reads anyway.
 *
 * Restoring is safe: both hooks revoke their object URLs on unmount, not after
 * a render, so the original is still live when the capture finishes.
 *
 * It also neutralises BROKEN images, and the failure mode is why that is worth
 * doing rather than defensive habit. A single unloadable `<img>` fails the
 * ENTIRE export: `html-to-image` substitutes `options.imagePlaceholder || ''`
 * for a resource it cannot fetch, and an `<img src="">` inside the serialized
 * SVG makes Chrome error the whole outer image. So one missing file yields no
 * picture at all rather than a picture with a gap - there is no partial
 * degradation to fall back on, which is what makes it worth a swap.
 *
 * This was written against a guaranteed instance that no longer exists:
 * `DataSheet.tsx` used to render `<img src="/signal-suite-logo.png">` for a watermark
 * file that was never committed, so every catalog datasheet in every
 * environment carried a broken image. Measured then: the PACE sheet exported
 * fine and the catalog sheet failed outright with an `Event` from the image's
 * own `onerror`. That `<img>` was removed once the watermark was abandoned.
 *
 * The handling stays, because the remaining case is a real one rather than a
 * hypothetical. `EquipmentPhoto` renders whatever `photo_url` names, and the
 * equipment delete path drops the blob BEFORE the row deliberately, so a
 * partially-failed delete leaves a surviving record pointing at an image that
 * is gone (see `.claude/context/domains/equipment.md`). That sheet must still
 * export.
 */

/** Undo handle. Calling `restore` more than once is a no-op after the first. */
export interface InlinedImages {
  restore(): void;
  /** How many references were swapped, blob: and broken alike. */
  readonly swapped: number;
  /** References that could not be fetched. The export still proceeds. */
  readonly failed: number;
}

interface Original {
  readonly el: Element;
  readonly attr: 'src' | 'href' | 'xlink:href';
  readonly value: string;
}

const BLOB_PREFIX = 'blob:';

/** A 1x1 fully transparent PNG. Occupies the layout box, paints nothing. */
const TRANSPARENT_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * A loaded image with no intrinsic size is a broken one. `complete` alone is
 * not enough: it is true for a 404 as well as for a decoded picture.
 */
function isBroken(el: Element): boolean {
  return el instanceof HTMLImageElement && el.complete && el.naturalWidth === 0;
}

function currentRef(el: Element): { attr: Original['attr']; value: string } | null {
  if (el instanceof HTMLImageElement || el.tagName.toLowerCase() === 'img') {
    const value = el.getAttribute('src');
    return value ? { attr: 'src', value } : null;
  }
  const href = el.getAttribute('href');
  if (href) return { attr: 'href', value: href };
  const xlink = el.getAttribute('xlink:href');
  if (xlink) return { attr: 'xlink:href', value: xlink };
  return null;
}

async function toDataUri(url: string): Promise<string> {
  // No cache-busting query string, ever. Appending one to a blob: URL makes it
  // unresolvable, which would blank the very images this function exists to keep.
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch ${response.status}`);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

export async function inlineBlobImages(root: Element): Promise<InlinedImages> {
  const candidates: Element[] = [
    ...Array.from(root.querySelectorAll('img')),
    ...Array.from(root.querySelectorAll('image')),
  ];
  const tag = root.tagName.toLowerCase();
  if (tag === 'img' || tag === 'image') candidates.unshift(root);

  const originals: Original[] = [];

  const swaps = candidates.map(async (el) => {
    const ref = currentRef(el);
    if (!ref) return;

    // A broken image would take the whole export down with it, so it is
    // replaced by a transparent pixel and the sheet exports without it.
    if (isBroken(el)) {
      originals.push({ el, attr: ref.attr, value: ref.value });
      el.setAttribute(ref.attr, TRANSPARENT_PX);
      return;
    }

    // data: and http(s): references are already resolvable from the clone.
    if (!ref.value.startsWith(BLOB_PREFIX)) return;

    const dataUri = await toDataUri(ref.value);
    originals.push({ el, attr: ref.attr, value: ref.value });
    el.setAttribute(ref.attr, dataUri);
    if (el instanceof HTMLImageElement) {
      // decode() resolves once the swapped pixels are ready, so the capture does
      // not race a half-decoded image. Absent in jsdom, hence the guard.
      if (typeof el.decode === 'function') await el.decode().catch(() => undefined);
    }
  });

  // allSettled, not all: one photo that will never load must neither abort the
  // export nor strand the other elements in their swapped state.
  const results = await Promise.allSettled(swaps);
  const failed = results.filter((r) => r.status === 'rejected').length;

  let restored = false;
  return {
    swapped: originals.length,
    failed,
    restore() {
      if (restored) return;
      restored = true;
      for (const o of originals) o.el.setAttribute(o.attr, o.value);
    },
  };
}

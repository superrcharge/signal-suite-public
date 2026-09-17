import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { inlineBlobImages } from './inline-blob-images';

const SVG_NS = 'http://www.w3.org/2000/svg';

function img(src: string): HTMLImageElement {
  const el = document.createElement('img');
  el.setAttribute('src', src);
  return el;
}

function svgImage(href: string, attr: 'href' | 'xlink:href' = 'href'): Element {
  const el = document.createElementNS(SVG_NS, 'image');
  el.setAttribute(attr, href);
  return el;
}

function root(...children: Element[]): HTMLElement {
  const div = document.createElement('div');
  for (const c of children) div.appendChild(c);
  document.body.appendChild(div);
  return div;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('boom')) return Promise.reject(new Error('network'));
      return Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
      } as Response);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('inlineBlobImages', () => {
  it('swaps an <img> blob: src for a data URI and restores it exactly', async () => {
    const el = img('blob:http://localhost:3001/abc-123');
    const handle = await inlineBlobImages(root(el));

    expect(handle.swapped).toBe(1);
    expect(el.getAttribute('src')).toMatch(/^data:/);

    handle.restore();
    expect(el.getAttribute('src')).toBe('blob:http://localhost:3001/abc-123');
  });

  // The wheel hubs are SVG <image>, not <img>. This is the case the library
  // handles least visibly and the one that would blank a printed comms card.
  it('swaps an SVG <image> href, which is not an HTMLImageElement', async () => {
    const el = svgImage('blob:http://localhost:3001/emblem');
    const handle = await inlineBlobImages(root(el));

    expect(handle.swapped).toBe(1);
    expect(el.getAttribute('href')).toMatch(/^data:/);

    handle.restore();
    expect(el.getAttribute('href')).toBe('blob:http://localhost:3001/emblem');
  });

  it('falls back to xlink:href when href is absent', async () => {
    const el = svgImage('blob:http://localhost:3001/legacy', 'xlink:href');
    const handle = await inlineBlobImages(root(el));

    expect(el.getAttribute('xlink:href')).toMatch(/^data:/);
    handle.restore();
    expect(el.getAttribute('xlink:href')).toBe('blob:http://localhost:3001/legacy');
  });

  it('leaves data: and https: references alone', async () => {
    const placeholder = svgImage('data:image/svg+xml,%3Csvg%2F%3E');
    const remote = img('https://example.test/photo.png');
    const relative = img('/asset.png');
    const handle = await inlineBlobImages(root(placeholder, remote, relative));

    expect(handle.swapped).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(placeholder.getAttribute('href')).toBe('data:image/svg+xml,%3Csvg%2F%3E');
    expect(remote.getAttribute('src')).toBe('https://example.test/photo.png');
    expect(relative.getAttribute('src')).toBe('/asset.png');
  });

  // One tile photo that will never load must not abort the whole export, and
  // must not strand the other images in their swapped state.
  it('reports a failed fetch without aborting, and still restores the rest', async () => {
    const good = img('blob:http://localhost:3001/good');
    const bad = img('blob:http://localhost:3001/boom');
    const handle = await inlineBlobImages(root(good, bad));

    expect(handle.failed).toBe(1);
    expect(handle.swapped).toBe(1);
    expect(good.getAttribute('src')).toMatch(/^data:/);
    expect(bad.getAttribute('src')).toBe('blob:http://localhost:3001/boom');

    handle.restore();
    expect(good.getAttribute('src')).toBe('blob:http://localhost:3001/good');
  });

  it('handles a sheet with no images at all, which is the local dev case', async () => {
    const handle = await inlineBlobImages(root(document.createElement('p')));
    expect(handle.swapped).toBe(0);
    expect(handle.failed).toBe(0);
    expect(() => handle.restore()).not.toThrow();
  });

  it('is idempotent on restore', async () => {
    const el = img('blob:http://localhost:3001/abc');
    const handle = await inlineBlobImages(root(el));
    handle.restore();
    el.setAttribute('src', 'changed-by-something-else');
    handle.restore();
    expect(el.getAttribute('src')).toBe('changed-by-something-else');
  });

  it('does not append a cache-busting query, which would break a blob URL', async () => {
    const el = img('blob:http://localhost:3001/abc');
    await inlineBlobImages(root(el));
    expect(fetch).toHaveBeenCalledWith('blob:http://localhost:3001/abc');
  });
});

describe('broken images', () => {
  // A single unloadable <img> fails the entire export, because html-to-image
  // substitutes an empty src and Chrome errors the whole serialized SVG. The
  // live case is an EquipmentPhoto whose photo_url outlived its blob.
  it('swaps a broken image for a transparent pixel and restores it', async () => {
    const el = img('/missing-image.png');
    // jsdom loads nothing, so complete/naturalWidth are forced to the shape a
    // real browser reports for a 404: loaded, but with no intrinsic size.
    Object.defineProperty(el, 'complete', { value: true });
    Object.defineProperty(el, 'naturalWidth', { value: 0 });

    const handle = await inlineBlobImages(root(el));

    expect(handle.swapped).toBe(1);
    expect(el.getAttribute('src')).toMatch(/^data:image\/png;base64,/);

    handle.restore();
    expect(el.getAttribute('src')).toBe('/missing-image.png');
  });

  it('leaves a healthy same-origin image alone', async () => {
    const el = img('/real-logo.png');
    Object.defineProperty(el, 'complete', { value: true });
    Object.defineProperty(el, 'naturalWidth', { value: 128 });

    const handle = await inlineBlobImages(root(el));

    expect(handle.swapped).toBe(0);
    expect(el.getAttribute('src')).toBe('/real-logo.png');
  });
});

import { useEffect, useState } from 'react';

import { apiFetch } from '@/auth/api-client';
import { placeholderEmblem } from './emblem';

/**
 * Resolves what a wheel hub should actually draw.
 *
 * The stored `emblem_url` is a raw Azure blob URL, and the container is created
 * with `allowBlobPublicAccess: false` / `publicAccess: 'None'`. A browser
 * fetching it directly is refused, so putting it straight into an `<image href>`
 * rendered the broken-image glyph scaled to the hub: an emblem that uploaded
 * fine still looked like a missing file, whatever format it was.
 *
 * So the bytes come back through the API with the caller's token, exactly as
 * `EquipmentPhoto` reads catalog photos, and the hub draws an object URL.
 *
 * The placeholder is returned until the real emblem is in hand, and stays if the
 * fetch fails. A hub is never empty and never broken.
 */
export function usePaceEmblem(
  section: string | undefined,
  emblemUrl: string | undefined,
  label: string,
  /**
   * Fetch even when the caller does not know whether an emblem exists. The
   * squadron picker lists sections without loading their cards, so it has no
   * emblem_url to check; a 404 simply means this squadron has none.
   */
  opts?: { fetchWhenUnknown?: boolean },
) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!section || (!emblemUrl && !opts?.fetchWhenUnknown)) {
      setObjectUrl(null);
      return;
    }

    let cancelled = false;
    let created: string | null = null;

    void apiFetch(`/api/v1/pace/${section}/emblem`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => {
        // Swallowed on purpose. A squadron whose emblem will not load gets the
        // placeholder, which is the same thing a squadron without one gets.
      });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
      setObjectUrl(null);
    };
  }, [section, emblemUrl, opts?.fetchWhenUnknown]);

  return {
    /** Always safe to render: the real emblem, or the generated placeholder. */
    emblemHref: objectUrl ?? placeholderEmblem(label),
    /**
     * The real emblem only, null when the squadron has none. For callers that
     * want to show nothing rather than a placeholder.
     */
    objectUrl,
    /**
     * Whether the hub is showing what it will finally show. The print route
     * waits on this, because printing while the placeholder is still up would
     * put a SAMPLE EMBLEM on a squadron's card.
     */
    ready: !emblemUrl || objectUrl !== null,
  };
}

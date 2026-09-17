import { apiFetch } from '@/auth/api-client';

/** Thrown when the server refused the download, carrying its message. */
export class CsvDownloadError extends Error {}

/**
 * Fetches a CSV endpoint and hands the result to the browser as a save.
 *
 * Routed through apiFetch rather than a bare anchor so MSAL acquires and
 * silently refreshes the Bearer token first. An `anchor.click()` is a browser
 * navigation and never carries Authorization headers, which is why doing it that
 * way returned AUTH_MISSING_TOKEN.
 *
 * Templates go through here too, even though their routes are unauthenticated.
 * apiFetch against an anonymous route works fine - it sends a header the route
 * ignores - and once a template URL carries user-chosen columns it can 400 for
 * the first time. A bare href has no error path at all.
 *
 * `init` exists for the multi-dataset bundle, which is a POST because a
 * nine-dataset column selection runs well past what fits in a request line. The
 * response is a zip rather than a CSV, and nothing below cares: the blob and the
 * Content-Disposition filename work the same either way.
 */
export async function downloadCsv(
  url: string,
  fallbackFilename: string,
  init?: RequestInit,
): Promise<void> {
  const response = await apiFetch(url, init);

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    // The server's own message wins whenever there is one. The status is only
    // reached for a response that is not a normal API error at all - a 404
    // carrying Fiber's plain text, or an HTML page from something in front of
    // the app - and that is exactly the case where "Download failed. Please
    // try again." told a user, and whoever they reported it to, nothing.
    throw new CsvDownloadError(
      body?.error?.message ??
        `Download failed (HTTP ${response.status} ${response.statusText}). Please try again.`,
    );
  }

  const blob = await response.blob();
  // Honour the server-supplied filename; fall back only when the header is absent.
  saveBlob(blob, filenameFrom(response.headers.get('Content-Disposition')) ?? fallbackFilename);
}

/**
 * Hands a blob to the browser as a save.
 *
 * Split out of downloadCsv so the sheet exporter can reuse it. It has no
 * opinion about content type: the CSV bundle already comes back as a zip, and
 * the sheet exporter sends a PNG and a PPTX through the same six lines.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

/** Pulls the filename out of a Content-Disposition header, quoted or not. */
export function filenameFrom(disposition: string | null): string | undefined {
  return disposition?.match(/filename="?([^";]+)"?/)?.[1];
}

/**
 * `signal-suite-terminals` -> `signal-suite-terminals-20260824.csv`, the server's own convention.
 *
 * The extension is a parameter because the same convention names the bundle zip
 * and the sheet exporter's png and pptx. It defaults to csv, so every existing
 * call site is unchanged.
 */
export function datedFilename(stem: string, ext = 'csv'): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${stem}-${stamp}.${ext}`;
}

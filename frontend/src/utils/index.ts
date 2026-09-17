/**
 * The glyph rendered in place of a value that is absent, across tables,
 * datasheets and inline-edit cells.
 *
 * This is a display token, not punctuation. It was previously typed as a bare
 * literal in 30 places across 11 files, which made it indistinguishable from
 * prose: the project style rule forbids that character, so any sweep would
 * have rewritten these too. Worse, `FrequencyTable` compares against it
 * (`v === EMPTY_VALUE`) while other components emit it, so a partial rewrite
 * would have desynced emitter and comparator with nothing failing to catch it.
 *
 * Written as an escape so the character never appears literally in source, and
 * imported everywhere rather than restated.
 */
export const EMPTY_VALUE = '\u2014'; // allow-em-dash

/**
 * Format a date string for display
 */
export function formatDate(
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, options);
}

/**
 * Format a date string with time
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Get initials from a name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Delay execution (for testing/demo purposes)
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a random ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Resolves once all img elements in the document have finished loading.
 * Uses a MutationObserver to catch images added after the call -
 * EquipmentPhoto inserts its img element only after an apiFetch resolves,
 * so a simple querySelectorAll at call-time would miss it.
 * Does NOT resolve early on an empty document: with no img present it waits out
 * the full timeoutMs, because that window is what lets the observer catch an
 * image inserted later. Callers that may have no image at all should guard the
 * call rather than paying the timeout - catalog-print-page.tsx and
 * pace-print-page.tsx both check for a photo first.
 *
 * Falls back after timeoutMs so the caller always proceeds.
 */
export function waitForImages(timeoutMs = 5000): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    let obs: MutationObserver | null = null;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      obs?.disconnect();
      resolve();
    };

    const settle = () => {
      if (done) return;
      const imgs = Array.from(document.querySelectorAll('img'));
      if (imgs.length === 0) return;
      const pending = imgs.filter((img) => !img.complete);
      if (pending.length > 0) {
        pending.forEach((img) => {
          img.addEventListener('load', finish, { once: true });
          img.addEventListener('error', finish, { once: true });
        });
        return;
      }
      finish();
    };

    const timer = setTimeout(finish, timeoutMs);
    obs = new MutationObserver(settle);
    obs.observe(document.body, { childList: true, subtree: true });
    settle();
  });
}

/**
 * The description for a list page's empty state.
 *
 * Exists because "no rows" has three different causes and only one of them is
 * an empty dataset. Both list pages used to test the search term and the status
 * filter and then fall through to "nothing has been added yet", so filtering to
 * a variant, type, tag or section with no matches told the user the table was
 * empty while it held plenty of rows - a dead end, since the message gives no
 * hint that a filter is the thing to clear.
 *
 * Pure, and shared rather than restated per page: the pages are near-copies of
 * each other, which is how the original defect reached the second one.
 *
 * @param noun       plural entity name, e.g. "terminals"
 * @param search     the active search term, if any
 * @param filters    names of the active non-search filters, e.g. ["status"]
 */
export function emptyListDescription(
  noun: string,
  search: string | undefined,
  filters: string[],
): string {
  if (search) return `No results for "${search}". Try a different search.`;

  const active = filters.filter(Boolean);
  if (active.length === 0) return `No ${noun} have been added yet.`;

  const list =
    active.length === 1
      ? active[0]
      : `${active.slice(0, -1).join(', ')} and ${active[active.length - 1]}`;
  const plural = active.length === 1 ? 'filter' : 'filters';
  return `No ${noun} match the current ${list} ${plural}. Try clearing ${active.length === 1 ? 'it' : 'one'}.`;
}

// Orders digit runs numerically, so a name that reaches double digits stops
// interleaving: "Net 1, Net 2, Net 9, Net 10" rather than "Net 1, Net 10, Net 2,
// Net 9". Built once at module scope because constructing a Collator is the
// expensive part and comparing is the hot path.
//
// This is the client-side half of a pair. The `natural_sort` Postgres collation
// (migration 038) orders the server-side lists the same way, and both are ICU with
// the same `numeric` setting - a name sorted by the API and the same name sorted
// here must not disagree. Change one and you have to change the other.
//
// `{ numeric: true }` and nothing else, deliberately: adding `sensitivity: 'base'`
// would also make every call site case- and accent-insensitive, which is a second
// behaviour change none of them asked for. Each site keeps the case behaviour its
// plain `localeCompare` had.
const naturalCollator = new Intl.Collator(undefined, { numeric: true });

/** Compare two display names, ordering embedded numbers numerically. */
export function compareNatural(a: string, b: string): number {
  return naturalCollator.compare(a, b);
}

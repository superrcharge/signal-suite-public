/**
 * Builds a CSV endpoint URL from a path and a set of list parameters.
 *
 * An empty or absent list is dropped, which is how a fully-selected facet
 * disappears: for a *filter*, "everything" and "no filter" genuinely mean the
 * same thing.
 *
 * Columns are not a filter and must never be dropped. Omitting them means
 * "whatever the backend's list happens to be", which is only the same as
 * "everything the dialog showed me" for as long as the two agree. Contracts
 * proved they do not - it shipped two columns short and handed users a file with
 * headers they had never been offered. Callers always pass an explicit column
 * list, and the download button is disabled at zero.
 */
export function buildCsvUrl(path: string, params: Record<string, string[] | undefined>): string {
  const qp = new URLSearchParams();
  for (const [key, values] of Object.entries(params)) {
    if (values && values.length > 0) qp.set(key, values.join(','));
  }
  const qs = qp.toString();
  return `${path}${qs ? `?${qs}` : ''}`;
}

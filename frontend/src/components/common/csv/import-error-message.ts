import { ApiClientError, errorMessage } from '@/services/api-client';

/**
 * What an import that never produced a row report tells the user.
 *
 * A file whose every row was rejected is not one of these: it comes back as a
 * result and opens the row list. This covers the request itself failing, where
 * the server's message is the useful part - a bad header row, a column that
 * belongs to an export - and "Please try again" is only for a failure that
 * carried no message at all.
 *
 * The one rewrite is the role refusal. The write gate hides Import from roles
 * that cannot use it, so reaching this means the role changed under an open
 * page, and "insufficient permissions" does not say what to do about it.
 */
export function importErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError && err.code === 'AUTH_FORBIDDEN') {
    return 'Your role cannot import this dataset. Ask an admin if it should.';
  }
  return errorMessage(err, 'Import failed. Please try again.');
}

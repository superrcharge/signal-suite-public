/**
 * An organization key derived from a name, for the one place a key is not
 * typed by a person: Remove's "Add to library and remove". It follows the
 * server's rule (lowercase letters, digits and underscores, starting with a
 * letter or digit, at most 50), so what it returns is accepted or, for a key
 * that already exists, refused with a 409 rather than a 400.
 */
export function keyFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50)
    .replace(/_+$/, '');
}

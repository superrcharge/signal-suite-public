export interface TextSegment {
  text: string;
  /** True when this segment is an occurrence of the search term. */
  hit: boolean;
}

/**
 * Split `text` around every case-insensitive occurrence of `term`.
 *
 * The term is matched as ONE phrase, never word by word. Every search in this
 * app matches the whole typed string with `includes`, so a highlighter that
 * split "import and export" into three words would mark text the search never
 * looked at and pass a test the search would fail.
 *
 * Case folding is done on a copy and the offsets are read back against the
 * original, which only works while folding preserves length. It does for every
 * character the help content uses; if it ever does not (a Turkish dotted I
 * folds to two code points), the text is returned unmarked rather than sliced
 * at the wrong offset.
 *
 * Its own module rather than a second export of `highlight-text.tsx`, because
 * a component file that also exports a function loses fast refresh.
 */
/**
 * Split `text` around every word that starts with one of `terms`,
 * case-insensitively, marking only the typed prefix of each.
 *
 * The help search matches by words (see `help/help-search.ts`): the query is
 * reduced to its distinctive words and each one matches a word it is a prefix
 * of. This is the highlighter for that rule, so a mark lands on exactly what
 * the search saw and nowhere else. Adjacent hits stay separate marks: "audit
 * log" is two words to the search, so it is two marks on the page.
 *
 * Same length-preserving case folding caveat as `splitOnTerm`.
 */
export function splitOnTerms(text: string, terms: string[]): TextSegment[] {
  const plain: TextSegment[] = [{ text, hit: false }];
  const needles = terms.map((t) => t.toLowerCase()).filter((t) => t !== '');
  if (needles.length === 0 || text === '') return plain;

  const haystack = text.toLowerCase();
  if (haystack.length !== text.length) return plain;

  const isWordChar = (ch: string) => /[a-z0-9]/.test(ch);
  const segments: TextSegment[] = [];
  let cursor = 0;
  let i = 0;
  while (i < haystack.length) {
    const atWordStart = isWordChar(haystack.charAt(i)) && (i === 0 || !isWordChar(haystack.charAt(i - 1)));
    const needle = atWordStart ? needles.find((n) => haystack.startsWith(n, i)) : undefined;
    if (needle === undefined) {
      i += 1;
      continue;
    }
    if (i > cursor) segments.push({ text: text.slice(cursor, i), hit: false });
    segments.push({ text: text.slice(i, i + needle.length), hit: true });
    cursor = i + needle.length;
    i = cursor;
  }
  if (segments.length === 0) return plain;
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
  return segments;
}

export function splitOnTerm(text: string, term: string): TextSegment[] {
  const plain: TextSegment[] = [{ text, hit: false }];
  if (term === '' || text === '') return plain;

  const haystack = text.toLowerCase();
  const needle = term.toLowerCase();
  if (haystack.length !== text.length) return plain;

  const segments: TextSegment[] = [];
  let cursor = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    if (at > cursor) segments.push({ text: text.slice(cursor, at), hit: false });
    segments.push({ text: text.slice(at, at + needle.length), hit: true });
    cursor = at + needle.length;
    at = haystack.indexOf(needle, cursor);
  }
  if (segments.length === 0) return plain;
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
  return segments;
}

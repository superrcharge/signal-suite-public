// Shared em dash detection, used by both the PostToolUse hook
// (scripts/check-em-dash.mjs) and the CI gate (scripts/check-em-dash-ci.mjs).
//
// One implementation on purpose: a local hook and a CI check that disagree
// about what counts as a violation is worse than having only one of them.

export const EM_DASH = '\u2014' // allow-em-dash

// The HTML entity renders the same character, so it is the same violation.
// Matching only the codepoint left the entity as a silent bypass: it passed
// both the hook and the CI gate and still reached the screen.
export const EM_DASH_ENTITY = '&mdash;' // allow-em-dash

// The same reasoning one step further. A source file can spell the character
// without containing it: a JS/TS unicode escape, or a numeric HTML entity.
// All of them render an em dash to a reader, and none of them were matched.
// That was not hypothetical - the audit page shipped "changed recently, reload
// the page" with an escaped em dash in the middle, visible to any user whose
// role had just changed, and both gates read the file and said it was clean.
//
// Written as a character class rather than string literals so this file does
// not contain the escapes it forbids, which would need a marker of their own.
export const EM_DASH_ESCAPES = new RegExp(
  [
    '\\\\u\\{?2014\\}?', // JS/TS escape, bare and braced ES6 form
    '\\\\x\\{2014\\}', // the regex and PCRE spelling
    '&#8212;', // decimal HTML entity, allow-em-dash
    '&#x2014;', // hex HTML entity, allow-em-dash
  ].join('|'),
  'i',
)

// An inline marker for the cases where the character is a value rather than
// prose. The catalog's empty-cell token is the motivating example: components
// render it and FrequencyTable compares against it, so a blanket rewrite would
// desync emitter and comparator with no test failure to catch it.
export const ALLOW_MARKER = 'allow-em-dash'

// Paths where a match is not authored prose, or where rewriting is wrong.
// CHANGELOG.md is a record of shipped releases and is left verbatim.
export const SKIP = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)go\.sum$/,
  /\.min\.(js|css)$/,
  /(^|\/)CHANGELOG\.md$/,
  // Vendored third-party assets. backend/docs/static/scalar.js is a 3.4 MB
  // minified Scalar build that is not named *.min.js, so the rule above did not
  // reach it: its "leave it alone" status was convention, enforced by nothing.
  // Re-vendoring it would have flagged every added line of a minified blob.
  /(^|\/)backend\/docs\/static\//,
  // Generated from the backend's csvtable declarations by internal/csvregistry.
  // Committed, so it is in scope for the gate, but editing it by hand is wrong -
  // a column description carrying an em dash has to be fixed at the source.
  /(^|\/)frontend\/src\/generated\//,
]

export function shouldSkip(relPath) {
  const p = relPath.split('\\').join('/')
  return SKIP.some((re) => re.test(p))
}

// Parse `git diff -U0` output into added lines with their line numbers in the
// new file. Handles multi-file diffs so CI and the single-file hook share it.
export function parseAddedLines(diffText) {
  const files = new Map()
  let current = null
  let lineNo = 0

  for (const line of diffText.split('\n')) {
    const header = line.match(/^\+\+\+ b\/(.+)$/)
    if (header) {
      current = header[1]
      if (!files.has(current)) files.set(current, [])
      continue
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      lineNo = Number(hunk[1])
      continue
    }
    if (!current) continue
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) {
      files.get(current).push({ n: lineNo, text: line.slice(1) })
      lineNo++
    }
  }
  return files
}

// A line is a violation when it contains the character, its HTML entity, or any
// escaped spelling of it, and does not carry the opt-out marker. The marker
// covers every form: a line that opts out of one is opting out of the em dash,
// not of one spelling of it.
export function violations(lines) {
  return lines.filter(
    (l) =>
      (l.text.includes(EM_DASH) ||
        l.text.includes(EM_DASH_ENTITY) ||
        EM_DASH_ESCAPES.test(l.text)) &&
      !l.text.includes(ALLOW_MARKER),
  )
}

export function formatHits(relPath, hits, max = 10) {
  const shown = hits
    .slice(0, max)
    .map((h) => `  ${relPath}:${h.n}  ${h.text.trim().slice(0, 100)}`)
    .join('\n')
  const more = hits.length > max ? `\n  ...and ${hits.length - max} more in this file` : ''
  return shown + more
}

export const GUIDANCE =
  `Replace with a plain dash, or reword. Only the lines you added are in scope, ` +
  `so do not mass-substitute pre-existing ones elsewhere in the file. If the ` +
  `character is a literal value rather than prose (a token a caller compares ` +
  `against), append the ${ALLOW_MARKER} marker in a comment on that line instead ` +
  `of changing it.`

// Unit tests for the shared em dash detection.
//
// The fixtures build their text from the exported constants rather than
// spelling either form out. A literal in this file would be a violation of the
// rule the file exists to enforce, and would need the opt-out marker on the
// same line, which is exactly what the ALLOW_MARKER case here asserts is
// ignored.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  ALLOW_MARKER,
  EM_DASH,
  EM_DASH_ENTITY,
  EM_DASH_ESCAPES,
  shouldSkip,
  violations,
} from './em-dash.mjs'

// The escaped spellings, rebuilt from character codes so this file contains no
// literal escape either. Each renders an em dash to a reader while leaving the
// codepoint absent from the source, which is what let one reach the audit page.
const BACKSLASH = String.fromCharCode(92)
const ESCAPES = [
  `${BACKSLASH}u2014`,
  `${BACKSLASH}u{2014}`,
  `${BACKSLASH}x{2014}`,
  '&#8212;', // allow-em-dash
  '&#x2014;', // allow-em-dash
]

test('flags a line containing the HTML entity', () => {
  const lines = [{ n: 3, text: `A net name is commonly shared ${EM_DASH_ENTITY} FIRES, CMD` }]
  const hits = violations(lines)
  assert.equal(hits.length, 1)
  assert.equal(hits[0].n, 3)
})

test('flags a line containing the literal character', () => {
  const lines = [{ n: 7, text: `One Save ${EM_DASH} writes the whole card` }]
  assert.equal(violations(lines).length, 1)
})

test('does not flag a line carrying the opt-out marker', () => {
  const lines = [
    { n: 1, text: `export const DASH = '${EM_DASH}' // ${ALLOW_MARKER}` },
    { n: 2, text: `const ENTITY = '${EM_DASH_ENTITY}' // ${ALLOW_MARKER}` },
  ]
  assert.deepEqual(violations(lines), [])
})

test('does not flag a line with neither form', () => {
  assert.deepEqual(violations([{ n: 1, text: 'A plain - dash is fine' }]), [])
})

// The regression these were written for: every spelling below reached the
// screen as an em dash while the gate read the file and called it clean.
for (const esc of ESCAPES) {
  test(`flags a line containing the escaped form ${esc}`, () => {
    const lines = [{ n: 4, text: `your role may have changed recently ${esc} reload` }]
    const hits = violations(lines)
    assert.equal(hits.length, 1)
    assert.equal(hits[0].n, 4)
  })

  test(`honours the opt-out marker for ${esc}`, () => {
    const lines = [{ n: 5, text: `const DASH = '${esc}' // ${ALLOW_MARKER}` }]
    assert.deepEqual(violations(lines), [])
  })
}

// The regex is module-level and shared. Without the guard below, adding a /g
// flag later would make it stateful via lastIndex, so the same line would
// alternate between flagged and clean on consecutive calls.
test('escape detection is not stateful across calls', () => {
  const line = [{ n: 1, text: `a ${ESCAPES[0]} b` }]
  assert.equal(violations(line).length, 1)
  assert.equal(violations(line).length, 1)
  assert.equal(EM_DASH_ESCAPES.global, false)
})

// shouldSkip had no coverage at all, which is the same shape of problem as the
// golangci-lint rule that sat under a v1 key and matched nothing for a release:
// an exemption list that stops matching looks identical to one that is working.
// Each case below names why the path is exempt, so deleting an entry breaks a
// test that says what it was for.
test('shouldSkip exempts generated and vendored paths', () => {
  const exempt = [
    'package-lock.json',
    'frontend/package-lock.json',
    'go.sum',
    'backend/go.sum',
    'some/bundle.min.js',
    'some/theme.min.css',
    'CHANGELOG.md',
    'backend/docs/static/scalar.js',
    'frontend/src/generated/csv-columns.ts',
  ]
  for (const p of exempt) {
    assert.equal(shouldSkip(p), true, `expected ${p} to be skipped`)
  }
})

test('shouldSkip does not exempt authored source', () => {
  const inScope = [
    'README.md',
    'AGENTS.md',
    'Makefile',
    'frontend/src/pages/kits-page.tsx',
    'frontend/src/utils/index.ts',
    'backend/migrations/014_create_contracts.sql',
    'compose.selfhost.yaml',
    // Near-misses for the SKIP patterns, which is where an over-broad regex
    // would quietly start exempting real code.
    'backend/docs/openapi.json',
    'frontend/src/components/generated-report.tsx',
    'scripts/lib/em-dash.mjs',
  ]
  for (const p of inScope) {
    assert.equal(shouldSkip(p), false, `expected ${p} to be in scope`)
  }
})

// Windows paths arrive with backslashes; the SKIP patterns are written with
// forward slashes, so normalisation is load-bearing rather than cosmetic.
test('shouldSkip normalises Windows separators', () => {
  // Built from BACKSLASH rather than written literally: in a JS string
  // '\docs' is just 'docs', so a hand-typed Windows path silently tests
  // something other than what it looks like.
  const win = (parts) => parts.join(BACKSLASH)
  assert.equal(shouldSkip(win(['backend', 'docs', 'static', 'scalar.js'])), true)
  assert.equal(shouldSkip(win(['frontend', 'src', 'pages', 'kits-page.tsx'])), false)
})

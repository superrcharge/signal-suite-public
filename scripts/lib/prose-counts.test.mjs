// Unit tests for the gate-count reader behind check-docs.mjs's
// `gate counts in prose` step.
//
// Both directions, for the reason every guard here has them: a claim the
// reader misses passes silently, and a phrase it wrongly reads as a claim
// fails a push over a sentence that was never wrong. Several of the "must not
// match" cases below are real prose from this repo.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  countAlwaysRun,
  countReleaseChecks,
  countShipSummaryRows,
  countStepsArray,
  findCountClaims,
  parseCount,
} from './prose-counts.mjs'

const claims = (text) => findCountClaims(text).map((c) => [c.key, c.n])

// ---------------------------------------------------------------------------
// Number parsing
// ---------------------------------------------------------------------------

test('parses digits, number words and hyphenated tens', () => {
  assert.equal(parseCount('26'), 26)
  assert.equal(parseCount('fourteen'), 14)
  assert.equal(parseCount('Twelve'), 12)
  assert.equal(parseCount('twenty-three'), 23)
  assert.equal(parseCount('thirty'), 30)
})

test('does not read ordinary words, or zero, as a count', () => {
  assert.equal(parseCount('several'), undefined)
  assert.equal(parseCount('the'), undefined)
  assert.equal(parseCount('zero'), undefined)
  assert.equal(parseCount('twenty-foo'), undefined)
  assert.equal(parseCount(''), undefined)
})

// ---------------------------------------------------------------------------
// Claims that must be found - each one is a phrasing that has drifted here
// ---------------------------------------------------------------------------

for (const [text, want] of [
  ['the most expensive part of a 23-check audit that runs on `model: haiku`.', [['ship checks', 23]]],
  ['/ship runs 23 checks unconditionally', [['ship checks', 23]]],
  ['node scripts/preflight-versions.mjs            # the 12 compatibility checks', [['preflight checks', 12]]],
  ['# preflight-versions.mjs - the 12 version-compatibility checks', [['preflight checks', 12]]],
  ['node scripts/preflight-versions.mjs --release  # plus the 3 tag/CHANGELOG checks', [['release checks', 3]]],
  ['`verify.mjs` passed all 15 steps, and more', [['verify steps', 15]]],
  ['`node scripts/verify.mjs` - 11 steps.', [['verify steps', 11]]],
  ['That runs the two steps a receipt cannot vouch for and exits 0.', [['always-run steps', 2]]],
  ['Every PR runs six jobs in `.github/workflows/ci.yml`:', [['ci jobs', 6]]],
  ['all six CI jobs passed', [['ci jobs', 6]]],
]) {
  test(`finds: ${text}`, () => {
    assert.deepEqual(claims(text), want)
  })
}

test('finds a claim wrapped across a line break, on the line it starts', () => {
  // docs/development.md, verbatim at the time it drifted.
  const text =
    'stdlib govulncheck scans. `scripts/preflight-versions.mjs` holds that and nine other version\n' +
    "relationships listed in `AGENTS.md` - run it before pushing."
  const found = findCountClaims(`intro\n\n${text}`)
  assert.equal(found.length, 1)
  assert.equal(found[0].key, 'preflight checks')
  assert.equal(found[0].line, 3)
  assert.equal(found[0].phrase, 'nine other version relationships')
})

test('"N other version relationships" claims N + 1, the one beside them included', () => {
  assert.deepEqual(claims('holds that and eleven other version relationships'), [['preflight checks', 12]])
  assert.deepEqual(claims('holds 12 version relationships'), [['preflight checks', 12]])
})

test('a ci.yml line naming "N CI jobs" is one claim, not two', () => {
  assert.deepEqual(claims('ci.yml has all six CI jobs'), [['ci jobs', 6]])
})

// ---------------------------------------------------------------------------
// Phrases that must NOT be read as a claim - real prose from this repo
// ---------------------------------------------------------------------------

for (const text of [
  // CLAUDE.md, about /execute-plan rather than verify.mjs.
  '`/execute-plan` writes `started`, then a `step` line as it clears each of its eight steps',
  // ship.md, about verify-deploy.mjs: "N checks" without /ship beside it.
  'screen: the other five checks all passed against it, because the server was fine',
  // authz.md.
  'Contracts goes one step further and is hidden from every role but',
  // AGENTS.md's incident table: a run that never started, not a job count.
  '| a comment edit to `ci.yml` | nothing | everything | startup failure: zero jobs, no logs |',
  // "steps" with no verify.mjs anywhere in the paragraph.
  'The migration runs in 15 steps.',
  // No number at all.
  'That runs the steps a receipt cannot vouch for, the ones named in `ALWAYS_RUN`.',
  'the most expensive part of an audit that runs on `model: haiku`.',
  '5. **Skip TodoWrite for 1-2 step tasks.**',
]) {
  test(`ignores: ${text}`, () => {
    assert.deepEqual(claims(text), [])
  })
}

test('a paragraph break ends the scope of a script name', () => {
  // verify.mjs is named in one paragraph and "steps" appears in the next.
  assert.deepEqual(claims('Run `verify.mjs`.\n\nThe migration takes 15 steps.'), [])
})

test('a table row does not borrow a script name from the row above', () => {
  const text = '| verify.mjs | the gate |\n| plan | eight steps |'
  assert.deepEqual(claims(text), [])
})

// ---------------------------------------------------------------------------
// Readers of the real counts
// ---------------------------------------------------------------------------

test('counts STEPS entries and skips comments inside the array', () => {
  const src = [
    'const other = [',
    "  ['not this', x],",
    ']',
    'const STEPS = [',
    "  ['version preflight', checkVersionPreflight],",
    '  // a comment mentioning [\'fake\', step]',
    "  ['frontend tests', frontendStep('npm run test -- --run', /^\\s*Test Files\\s/m)],",
    "  ['bundle graph', checkBundleGraph],",
    ']',
  ].join('\n')
  assert.equal(countStepsArray(src), 3)
})

test('reads STEPS from a CRLF checkout the same as LF', () => {
  const src = "const STEPS = [\r\n  ['a', a],\r\n  ['b', b],\r\n]\r\n"
  assert.equal(countStepsArray(src), 2)
})

test('an unrecognised STEPS shape reads as zero, which check-docs refuses', () => {
  assert.equal(countStepsArray("export const STEPS = [['a', a]]"), 0)
})

test('counts ALWAYS_RUN names', () => {
  assert.equal(countAlwaysRun("const ALWAYS_RUN = ['version preflight', 'doc agreement']"), 2)
  assert.equal(countAlwaysRun('const NOT_IT = []'), 0)
})

test('counts release checks on the normal path only', () => {
  const src = [
    'function releaseChecks() {',
    '  const out = []',
    '  if (!top) {',
    "    out.push([",
    "      'changelog has a released section',",
    '      { ok: false },',
    '    ])',
    '    return out',
    '  }',
    '  const version = top[1]',
    "  out.push([",
    "    'changelog top section',",
    '    { ok: true },',
    '  ])',
    "  out.push(['version not already tagged', r])",
    '  if (latest) {',
    "    out.push([",
    "      'version increments the latest tag',",
    '      r,',
    '    ])',
    '  }',
    '  return out',
    '}',
  ].join('\n')
  assert.equal(countReleaseChecks(src), 3)
})

test('counts the rows of the /ship summary table, not of other tables', () => {
  const md = [
    '| Secret | Used by |',
    '|---|---|',
    '| `PROJECT_PAT` | x |',
    '',
    '| # | Check | Status | Notes |',
    '|---|---|---|---|',
    '| 0 | Version preflight | ... | ... |',
    '| 0b | Scope | ... | ... |',
    '| 1 | TypeScript | ... | ... |',
    '',
    '**FAIL = must fix before pushing.**',
    '| stray | row |',
  ].join('\n')
  assert.equal(countShipSummaryRows(md), 3)
  assert.equal(countShipSummaryRows('no table here'), 0)
})

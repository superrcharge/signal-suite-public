// Finds counts of the repo's own gates quoted in prose, and counts the gates.
//
// Every one of these counts has drifted at least once. verify.mjs gained steps
// while AGENTS.md still said the reuse path skipped "the other fourteen"; /ship
// gained checks while AGENTS.md still called it a "23-check audit"; the version
// preflight gained checks while prose kept an older total. None of it is
// compiled, and a number that is one release out of date reads exactly like
// one that is current.
//
// The real counts are read out of the sources that define them - the STEPS
// arrays, ALWAYS_RUN, releaseChecks() and the /ship summary table - rather
// than restated here, because a restated count is the same disease as the
// prose it would be checking.
//
// Pure functions only: check-docs.mjs does the file reading, so both directions
// can be pinned by unit tests without a repo on disk.

// A Windows checkout with core.autocrlf reads CRLF; every anchor below is \n.
const lf = (s) => s.replace(/\r\n/g, '\n')

// Number words as they are written in prose here. Digits are parsed directly.
// No "zero": "startup failure: zero jobs" describes a run that never started,
// not a count of what ci.yml declares.
const WORDS = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
]
const TENS = { twenty: 20, thirty: 30, forty: 40 }

/**
 * "fourteen" -> 14, "twenty-three" -> 23, "26" -> 26, "several" -> undefined.
 * @param {string} raw
 * @returns {number | undefined}
 */
export function parseCount(raw) {
  const w = raw.toLowerCase()
  if (/^\d+$/.test(w)) return Number(w)
  const small = w ? WORDS.indexOf(w) : -1
  if (small > 0) return small
  if (w in TENS) return TENS[w]
  const m = w.match(/^([a-z]+)-([a-z]+)$/)
  if (m && m[1] in TENS) {
    const unit = WORDS.indexOf(m[2])
    if (unit >= 1 && unit <= 9) return TENS[m[1]] + unit
  }
  return undefined
}

// One count token: digits, a number word, or a hyphenated tens word. Anything
// else ("several", "the") is captured and then discarded by parseCount.
const N = String.raw`(\d+|[a-z]+(?:-[a-z]+)?)`
const re = (body, other = false) => ({ re: new RegExp(body, 'gi'), other })

// What is counted, and the phrasing that counts it.
//
// The patterns are deliberately narrow. "one step further", "the other five
// checks" and "each of its eight steps" are all real prose in this repo and
// none of them is a claim about these gates, so a subject word alone is never
// enough: either the phrase names the gate itself ("12 compatibility checks",
// "23-check audit"), or the paragraph has to name the thing it is counting.
export const SUBJECTS = [
  {
    key: 'verify steps',
    source: 'STEPS in scripts/verify.mjs',
    // "verify.mjs passed all 15 steps", "`node scripts/verify.mjs` - 11 steps".
    line: /verify\.mjs/,
    patterns: [
      re(String.raw`\b${N}\s+(?:verify\s+|verification\s+)?steps\b`),
      re(String.raw`\b${N}-step\b`),
    ],
  },
  {
    key: 'always-run steps',
    source: 'ALWAYS_RUN in scripts/verify.mjs',
    // "That runs the two steps a receipt cannot vouch for". The phrase is the
    // definition of ALWAYS_RUN, so it needs no script name beside it.
    line: null,
    patterns: [re(String.raw`\b${N}\s+steps\s+(?:that\s+)?a\s+receipt\s+cannot\s+vouch\s+for\b`)],
  },
  {
    key: 'preflight checks',
    source: 'STEPS in scripts/preflight-versions.mjs',
    // "the 12 compatibility checks", "12 version-compatibility checks",
    // "nine other version relationships", where "other" is one more than the
    // number written: "holds that and N other" names the one beside them.
    line: null,
    patterns: [
      re(String.raw`\b${N}\s+(?:version[- ]compatibility|compatibility|preflight)\s+checks\b`),
      re(String.raw`\b${N}\s+(?:other\s+)?version\s+relationships\b`, true),
    ],
  },
  {
    key: 'release checks',
    source: 'releaseChecks() in scripts/preflight-versions.mjs',
    // "plus the 3 tag/CHANGELOG checks".
    line: null,
    patterns: [re(String.raw`\b${N}\s+tag/CHANGELOG\s+checks\b`)],
  },
  {
    key: 'ship checks',
    source: 'the summary table in .claude/commands/ship.md',
    // "a 23-check audit" names the gate by its shape, so it counts anywhere.
    line: null,
    patterns: [re(String.raw`\b${N}-check\s+(?:audit|list|pre-push)\b`)],
  },
  {
    key: 'ship checks',
    source: 'the summary table in .claude/commands/ship.md',
    // "/ship runs 23 checks" counts only beside /ship itself. Bare "N checks"
    // is too common to mean anything: ship.md alone says "the other five
    // checks" about verify-deploy.mjs.
    line: /(?:^|[\s`(])\/ship\b|ship\.md/,
    patterns: [re(String.raw`\b(?:runs|all|its|of)\s+${N}\s+checks\b`)],
  },
  {
    key: 'ci jobs',
    source: 'jobs in .github/workflows/ci.yml',
    // "all six CI jobs passed".
    line: null,
    patterns: [re(String.raw`\b${N}\s+CI\s+jobs\b`)],
  },
  {
    key: 'ci jobs',
    source: 'jobs in .github/workflows/ci.yml',
    // "ci.yml's six jobs", "Every PR runs six jobs in ci.yml".
    line: /ci\.yml/,
    patterns: [re(String.raw`\b${N}\s+jobs\b`)],
  },
]

// Splits a document into the units a sentence can span: a run of consecutive
// non-blank lines is one block, and a table row is always a block of its own
// because a row never continues onto the next. Markdown hard-wraps prose, and
// docs/development.md once wrapped "nine other version" / "relationships"
// across a line break, which a line-at-a-time search cannot see at all.
function blocks(text) {
  const lines = lf(text).split('\n')
  const out = []
  let cur = null
  lines.forEach((line, i) => {
    const isRow = /^\s*\|/.test(line)
    if (line.trim() === '' || isRow) {
      if (cur) out.push(cur)
      cur = null
      if (isRow) out.push({ start: i + 1, lines: [line] })
      return
    }
    if (!cur) cur = { start: i + 1, lines: [] }
    cur.lines.push(line)
  })
  if (cur) out.push(cur)
  return out
}

/**
 * Every count claim in a document, one entry per match.
 * @param {string} text
 * @returns {{ key: string, source: string, line: number, text: string, phrase: string, n: number }[]}
 */
export function findCountClaims(text) {
  const out = []
  for (const block of blocks(text)) {
    // Joined with a space so a phrase wrapped across lines matches as one,
    // and so an index maps back to the physical line it starts on.
    const joined = block.lines.join(' ')
    const lineAt = (index) => {
      let offset = 0
      for (let k = 0; k < block.lines.length; k++) {
        offset += block.lines[k].length + 1
        if (index < offset) return { line: block.start + k, text: block.lines[k] }
      }
      return { line: block.start, text: block.lines[0] }
    }
    const seen = new Set()
    for (const s of SUBJECTS) {
      if (s.line && !s.line.test(joined)) continue
      for (const { re: pattern, other } of s.patterns) {
        for (const m of joined.matchAll(pattern)) {
          let n = parseCount(m[1])
          if (n === undefined) continue // "several steps", "the checks" - not a count
          // "holds that and nine other version relationships" claims ten.
          if (other && /\bother\b/i.test(m[0])) n += 1
          // "six CI jobs" on a ci.yml line matches both ci-jobs subjects.
          const id = s.key + '@' + String(m.index)
          if (seen.has(id)) continue
          seen.add(id)
          const at = lineAt(m.index)
          out.push({ key: s.key, source: s.source, line: at.line, text: at.text, phrase: m[0].replace(/\s+/g, ' '), n })
        }
      }
    }
  }
  return out
}

/**
 * Names in a single-line `const ALWAYS_RUN = ['a', 'b']` literal.
 * @param {string} source
 * @returns {number}
 */
export function countAlwaysRun(source) {
  const list = lf(source).match(/^const ALWAYS_RUN = \[([^\]]*)\]/m)
  if (!list) return 0
  return [...list[1].matchAll(/'[^']+'/g)].length
}

/**
 * Entries in a `const STEPS = [ ... ]` literal: lines opening `['name',`.
 * Comments inside the array are skipped by construction.
 * @param {string} source
 * @returns {number}
 */
export function countStepsArray(source) {
  const block = lf(source).match(/^const STEPS = \[\n([\s\S]*?)^\]/m)
  if (!block) return 0
  return block[1].split('\n').filter((l) => /^\s*\[\s*'[^']+'\s*,/.test(l)).length
}

/**
 * Checks releaseChecks() pushes on its normal path, i.e. after it has found a
 * dated CHANGELOG section. The early return that reports a missing section is
 * the alternative to the first of them, not a fourth check.
 * @param {string} source
 * @returns {number}
 */
export function countReleaseChecks(source) {
  const body = lf(source).match(/^function releaseChecks\(\) \{\n([\s\S]*?)^\}/m)
  if (!body) return 0
  const normal = body[1].split(/^\s*const version = /m)[1] ?? ''
  return [...normal.matchAll(/out\.push\(\[\s*'[^']+'/g)].length
}

/**
 * Rows of /ship's summary table: the one headed `| # | Check | Status | Notes |`.
 * @param {string} md
 * @returns {number}
 */
export function countShipSummaryRows(md) {
  const lines = lf(md).split('\n')
  const head = lines.findIndex((l) => /^\|\s*#\s*\|\s*Check\s*\|\s*Status\s*\|/.test(l))
  if (head === -1) return 0
  let rows = 0
  for (const l of lines.slice(head + 2)) {
    if (!/^\s*\|/.test(l)) break
    rows++
  }
  return rows
}

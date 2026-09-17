#!/usr/bin/env node
// Plan lint: refuse to hand off a plan that cannot be executed literally.
//
// The control that decides whether a handoff succeeds is applied to the plan,
// not to the executor. A capable model can read past a line-number anchor that
// has drifted, an instruction that says "drop this if it feels like scope
// creep", or an acceptance criterion that can only be checked by eye. A weaker
// one cannot, and the failure is silent: it picks an interpretation and
// reports success.
//
// Every rule here comes from a real defect in a plan that was written for a
// reader who could exercise judgment.
//
// Usage: node scripts/lint-plan.mjs <path-to-plan.md>

import { existsSync, readFileSync } from 'node:fs'
import { EM_DASH } from './lib/em-dash.mjs'

const REQUIRED = [
  'Context',
  'Preconditions',
  'Acceptance criteria',
  'Changes',
  'Do not',
  'Stop and ask',
  'Verify',
]

// Applied to the sections the executor acts on. Context is prose written for a
// human and is allowed to hedge about why the work exists; Verify is a single
// command block with no room to.
const INSTRUCTION_SECTIONS = ['Preconditions', 'Acceptance criteria', 'Changes', 'Do not', 'Stop and ask']

const HEDGES = [
  /\bconsider\b/i,
  /\bmaybe\b/i,
  /\bprobably\b/i,
  /\broughly\b/i,
  /\bif appropriate\b/i,
  /\bas needed\b/i,
  /\bor similar\b/i,
  /\betc\./i,
  /\bfeel free\b/i,
  /\bif this reads as\b/i,
  /\bshould be fine\b/i,
  /\bas you see fit\b/i,
  /\buse your judg(e)?ment\b/i,
  /\bif you think\b/i,
  /\bsome sort of\b/i,
]

const path = process.argv[2]
if (!path) {
  console.error('usage: lint-plan.mjs <path-to-plan.md>')
  process.exit(2)
}
if (!existsSync(path)) {
  console.error(`No such plan file: ${path}`)
  process.exit(2)
}

const text = readFileSync(path, 'utf8')
const lines = text.split('\n')

// ---------------------------------------------------------------------------
// Split into level-2 sections
// ---------------------------------------------------------------------------

const sections = new Map()
const order = []
let current = null

lines.forEach((line, i) => {
  const m = line.match(/^##\s+(.+?)\s*$/)
  if (m) {
    current = m[1].trim()
    order.push(current)
    sections.set(current, { start: i + 1, lines: [] })
    return
  }
  if (current) sections.get(current).lines.push({ n: i + 1, text: line })
})

function find(name) {
  for (const [heading, body] of sections) {
    if (heading.toLowerCase() === name.toLowerCase()) return body
  }
  return null
}

const problems = []
const fail = (msg) => problems.push(msg)

// ---------------------------------------------------------------------------
// 1. Every required section is present, in order
// ---------------------------------------------------------------------------

const missing = REQUIRED.filter((r) => !find(r))
if (missing.length) {
  fail(`Missing required section${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`)
}

const present = order.filter((h) => REQUIRED.some((r) => r.toLowerCase() === h.toLowerCase()))
const expected = REQUIRED.filter((r) => present.some((h) => h.toLowerCase() === r.toLowerCase()))
if (present.join('|').toLowerCase() !== expected.join('|').toLowerCase()) {
  fail(
    `Sections are out of order.\n    found:    ${present.join(' -> ')}\n` +
      `    expected: ${expected.join(' -> ')}`,
  )
}

// ---------------------------------------------------------------------------
// 2. Preconditions names the branch to create
// ---------------------------------------------------------------------------

const pre = find('Preconditions')
if (pre && !pre.lines.some((l) => /git checkout -b\s+\S+/.test(l.text))) {
  fail(
    'Preconditions does not name the branch to create. Include the literal ' +
      'command, e.g. `git checkout -b fix/thing`, so the executor never invents a name.',
  )
}

// ---------------------------------------------------------------------------
// 3. Acceptance criteria are numbered and independently checkable
// ---------------------------------------------------------------------------

const ac = find('Acceptance criteria')
if (ac) {
  const numbered = ac.lines.filter((l) => /^\s*\d+\.\s+\S/.test(l.text))
  if (numbered.length === 0) {
    fail('Acceptance criteria has no numbered items. Each criterion must be its own numbered line.')
  }
  // A criterion is checkable when it names the thing to observe: an inline
  // code span (a command, a test name, a symbol) or a quoted literal string.
  for (const l of numbered) {
    const hasCode = /`[^`]+`/.test(l.text)
    const hasQuoted = /"[^"]+"/.test(l.text)
    if (!hasCode && !hasQuoted) {
      fail(
        `${path}:${l.n}  Acceptance criterion has nothing checkable in it.\n` +
          `    ${l.text.trim().slice(0, 100)}\n` +
          '    Name the test, the command, or the literal string that proves it. ' +
          'If it can only be checked by eye, it is not a criterion: make it a test.',
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Changes anchor on symbols, not bare line numbers
// ---------------------------------------------------------------------------

const changes = find('Changes')
if (changes) {
  for (const l of changes.lines) {
    if (!/\blines?\s+\d+/i.test(l.text)) continue
    if (/`[^`]+`/.test(l.text)) continue // a symbol anchor rides along, fine
    fail(
      `${path}:${l.n}  Change is anchored to a line number with no symbol beside it.\n` +
        `    ${l.text.trim().slice(0, 100)}\n` +
        '    Line numbers drift as soon as the first edit lands. Name the function, ' +
        'component, or constant in backticks instead.',
    )
  }
}

// ---------------------------------------------------------------------------
// 5. No hedging in the sections the executor acts on
// ---------------------------------------------------------------------------

for (const name of INSTRUCTION_SECTIONS) {
  const body = find(name)
  if (!body) continue
  for (const l of body.lines) {
    for (const re of HEDGES) {
      if (!re.test(l.text)) continue
      fail(
        `${path}:${l.n}  Hedge in "${name}": ${re.source.replace(/\\b|\(\?i\)/g, '')}\n` +
          `    ${l.text.trim().slice(0, 100)}\n` +
          '    Decide it here. Anything genuinely undecided belongs in "Stop and ask" ' +
          'as a condition, not as soft wording the executor has to interpret.',
      )
      break
    }
  }
}

// ---------------------------------------------------------------------------
// 6. "Do not" is not empty
// ---------------------------------------------------------------------------

const donot = find('Do not')
if (donot && !donot.lines.some((l) => /^\s*[-*]\s+\S/.test(l.text))) {
  fail(
    '"Do not" has no bullets. This is the section authors skip and the one a weaker ' +
      'model needs most. State the boundaries: what not to touch, not to add, not to rename.',
  )
}

// ---------------------------------------------------------------------------
// 7. Verify is exactly one fenced command block
// ---------------------------------------------------------------------------

const verify = find('Verify')
if (verify) {
  const fences = verify.lines.filter((l) => /^\s*```/.test(l.text)).length
  if (fences !== 2) {
    fail(
      `"Verify" has ${fences} fence line${fences === 1 ? '' : 's'}. It must hold exactly ` +
        'one fenced block, containing the single command that proves the work: ' +
        '`node scripts/verify.mjs`.',
    )
  }
}

// ---------------------------------------------------------------------------
// 8. No em dashes
// ---------------------------------------------------------------------------

lines.forEach((text, i) => {
  if (text.includes(EM_DASH)) {
    fail(`${path}:${i + 1}  Em dash. The project style rule forbids it; use a plain dash.`)
  }
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (problems.length === 0) {
  console.log(`lint-plan: ${path} is executable. ${REQUIRED.length} sections, no findings.`)
  process.exit(0)
}

console.error(
  `lint-plan: ${problems.length} finding${problems.length === 1 ? '' : 's'} in ${path}\n`,
)
for (const p of problems) console.error(`  - ${p}\n`)
console.error(
  'A plan that fails this lint will be executed wrongly by a model that cannot\n' +
    'ask you what you meant. Fix the findings before handing it off.',
)
process.exit(1)

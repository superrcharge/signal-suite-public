#!/usr/bin/env node
// Documentation preflight. Holds the prose to the code it describes.
//
// A version pin and a sentence of prose fail identically: both make a claim
// about the system, and neither is compiled. Every check here exists because
// its absence let a wrong claim sit in a doc until somebody followed it.
//
//   a workflow README told the operator to run
//     gh workflow run some-workflow.yml -f version=v0.1.0
//   against a workflow declaring `workflow_dispatch: {}`. That command cannot
//   succeed. The same page gave the wrong artifact paths and the wrong bundle
//   filename, and pointed at a docs page that has never existed.
//
//   README.md said CI runs five jobs. It runs six. The preflight job had been
//   added months earlier.
//
//   docs/development.md said "requires Go 1.25" while backend/go.mod said
//   1.26.7 - which is not just a language version but the exact toolchain CI
//   installs, and therefore the stdlib govulncheck scans.
//
// All were one parse away from being impossible to write.
//
// This is deliberately a sibling of preflight-versions.mjs rather than a part
// of it: that one asks whether the build is constructible, this one asks
// whether the documentation is true. Both run before anything compiles.
//
// Usage: node scripts/check-docs.mjs

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { repoRoot } from './lib/tree-digest.mjs'

const root = repoRoot()

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------
//
// A knowingly-wrong file needs a written reason, for the same reason
// csv-manifest.json demands one for a "no" and openapi_test.go demands one for
// an undocumented route: a year later, "we meant to" and "nobody noticed" are
// indistinguishable in a diff.
//
// Keyed by repo-relative posix path, valued by the reason. Delete the entry to
// see what it was hiding - the failures it prints are the to-do list.

// Files whose version mentions are a RECORD rather than a claim, and so are
// exempt from the version check only. Scoped to the one check rather than
// skipping the file wholesale, so their links and migration references are
// still held to account.
const HISTORICAL_VERSIONS = {
  'CHANGELOG.md':
    'A changelog entry describes what a release did at the time. Rewriting an ' +
    'old entry to name the current Go version would make it false.',
  'AGENTS.md':
    'Its version-preflight section quotes the verbatim tool output from three ' +
    'real incidents ("requires go >= 1.26.0 (running go 1.25.13)" and the ' +
    'like). That text IS the evidence, and correcting it would destroy the ' +
    'record. The pins themselves are held by preflight-versions.mjs, which ' +
    'reads the files rather than the prose.',
}

// Files whose table and migration counts are a RECORD rather than a claim, and
// so are exempt from the prose-count half of the diagram check only. Same
// scoping as HISTORICAL_VERSIONS, for the same reason: their links, versions
// policy and migration references are still held to account.
const HISTORICAL_COUNTS = {
  'CHANGELOG.md':
    'A changelog entry counts what existed when it was written. The v1.0.0 ' +
    'entry\'s "six of eighteen tables" describes the prototype at the time; ' +
    'rewriting it to the current count would make an old release note false, ' +
    'and every new table would otherwise demand editing history to pass.',
}

// Empty. Keep the map: a knowingly-wrong file gets a written reason here,
// never a silent skip.
const EXCEPTIONS = {}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  return r.stdout
}

const read = (p) => readFileSync(join(root, p), 'utf8')

// Tracked markdown only. An untracked file is somebody's scratch copy and is
// nobody else's problem.
const docs = git(['ls-files', '*.md'])
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((p) => !EXCEPTIONS[p])

const skipped = Object.keys(EXCEPTIONS)

// Fenced blocks are deliberately NOT stripped. The first version of this check
// skipped them and would therefore have missed the very defect it was written
// for: docs/development.md's "requires Go 1.25" sat in a comment inside a
// ```bash fence, which is exactly where a version statement tends to live.
//
// Table rows are skipped. That is the shape AGENTS.md and the CHANGELOG use to
// record what a version WAS during an incident. A file that quotes historical
// tool output at length gets a HISTORICAL_VERSIONS entry instead, with a reason.
function prose(text) {
  return text.split('\n').filter((line) => !/^\s*\|/.test(line))
}

// ---------------------------------------------------------------------------
// Workflow parsing
// ---------------------------------------------------------------------------
//
// Hand-rolled rather than a YAML dependency, because the two structures needed
// here are both flat key lists at a known indent, and because there is no yaml
// library on either machine. Both readers print what they found, so a regex
// that stops matching after a reformat shows up as an empty list rather than
// as a vacuous pass.

const workflowDir = '.github/workflows'
const workflowFiles = readdirSync(join(root, workflowDir)).filter((f) => /\.ya?ml$/.test(f))

// Keys under `on: workflow_dispatch: inputs:`. Returns [] for a workflow that
// declares none - including the `workflow_dispatch: {}` form, which is the one
// that made this check necessary.
function dispatchInputs(file) {
  const lines = read(`${workflowDir}/${file}`).split('\n')
  const names = []
  let inDispatch = false
  let inInputs = false
  let inputsIndent = null
  for (const line of lines) {
    if (/^\s*#/.test(line) || line.trim() === '') continue
    const indent = line.match(/^\s*/)[0].length

    if (/^\s*workflow_dispatch:/.test(line)) {
      inDispatch = true
      continue
    }
    if (!inDispatch) continue

    // Any key at or left of `workflow_dispatch:`'s own indent ends the block.
    if (inInputs && indent <= inputsIndent) {
      inInputs = false
      if (indent <= 2) break
    }
    if (/^\s*inputs:/.test(line)) {
      inInputs = true
      inputsIndent = indent
      continue
    }
    if (inInputs && indent === inputsIndent + 2) {
      const m = line.match(/^\s*([A-Za-z0-9_-]+):/)
      if (m) names.push(m[1])
    }
    // A top-level key (indent 0) other than `on:` means we have left `on:`.
    if (indent === 0 && !/^on:/.test(line)) break
  }
  return names
}

// Top-level keys under `jobs:` in ci.yml.
function jobIds(file) {
  const lines = read(`${workflowDir}/${file}`).split('\n')
  const ids = []
  let inJobs = false
  for (const line of lines) {
    if (/^\s*#/.test(line) || line.trim() === '') continue
    if (/^jobs:/.test(line)) {
      inJobs = true
      continue
    }
    if (!inJobs) continue
    if (/^\S/.test(line)) break
    const m = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/)
    if (m) ids.push(m[1])
  }
  return ids
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

// 1. Every `gh workflow run <file> -f name=` in prose names a declared input.
function checkWorkflowInputs() {
  const declared = new Map(workflowFiles.map((f) => [f, dispatchInputs(f)]))
  const problems = []
  let checked = 0

  for (const doc of docs) {
    const text = read(doc)
    const re = /gh\s+workflow\s+run\s+([A-Za-z0-9._-]+\.ya?ml)((?:\s+-f\s+[A-Za-z0-9_-]+=\S*)*)/g
    for (const m of text.matchAll(re)) {
      const [, file, flags] = m
      checked++
      if (!declared.has(file)) {
        problems.push(`${doc}: names ${file}, which is not in ${workflowDir}/`)
        continue
      }
      const used = [...flags.matchAll(/-f\s+([A-Za-z0-9_-]+)=/g)].map((x) => x[1])
      for (const name of used) {
        if (!declared.get(file).includes(name)) {
          const have = declared.get(file)
          problems.push(
            `${doc}: "gh workflow run ${file} -f ${name}=" but ${file} declares ` +
              (have.length ? `only: ${have.join(', ')}` : 'NO workflow_dispatch inputs'),
          )
        }
      }
    }
  }

  const summary = workflowFiles
    .filter((f) => declared.get(f).length)
    .map((f) => `${f}(${declared.get(f).join(',')})`)
    .join(' ')
  if (problems.length) return { ok: false, detail: problems.join('\n') }
  return {
    ok: true,
    detail: `${checked} documented invocations against declared inputs: ${summary || 'none declared'}`,
  }
}

// 2. A doc that enumerates ci.yml's jobs enumerates all of them, and any
//    "<n> jobs" count beside it agrees.
const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10,
}

function checkCiJobLists() {
  const ids = jobIds('ci.yml')
  const problems = []
  let enumerating = 0

  for (const doc of docs) {
    const text = read(doc)
    if (!text.includes('ci.yml')) continue

    // The enumeration shape: a list item that opens with the job id, as code
    // or bold. Matching bare words would hit every mention of "scripts".
    const named = ids.filter((id) =>
      new RegExp(`^\\s*[-*]\\s+(\`${id}\`|\\*\\*${id}\\*\\*)`, 'm').test(text),
    )
    if (named.length < 2) continue
    enumerating++

    const missing = ids.filter((id) => !named.includes(id))
    if (missing.length) {
      problems.push(
        `${doc}: enumerates ci.yml jobs but omits ${missing.join(', ')} ` +
          `(ci.yml has ${ids.length}: ${ids.join(', ')})`,
      )
    }

    const countMatch = text.match(/\b(\w+)\s+jobs\b/i)
    if (countMatch) {
      const word = countMatch[1].toLowerCase()
      const stated = NUMBER_WORDS[word] ?? (/^\d+$/.test(word) ? Number(word) : null)
      if (stated !== null && stated !== ids.length) {
        problems.push(`${doc}: says "${countMatch[0]}" but ci.yml has ${ids.length}`)
      }
    }
  }

  if (problems.length) return { ok: false, detail: problems.join('\n') }
  return {
    ok: true,
    detail: `ci.yml has ${ids.length} jobs (${ids.join(', ')}); ${enumerating} doc(s) enumerate them, all complete`,
  }
}

// 3. Go, Node and Postgres versions quoted in prose match their real source.
function checkVersionsInProse() {
  const goDirective = read('backend/go.mod').match(/^go\s+(\d+)\.(\d+)(?:\.(\d+))?/m)
  const goMinor = `${goDirective[1]}.${goDirective[2]}`
  const goFull = goDirective[0].replace(/^go\s+/, '')

  const ci = read('.github/workflows/ci.yml')
  const nodeVersions = [...ci.matchAll(/node-version:\s*'?(\d+)/g)].map((m) => m[1])
  const ciNode = [...new Set(nodeVersions)]
  const enginesNode = JSON.parse(read('frontend/package.json')).engines?.node ?? ''
  const enginesFloor = enginesNode.match(/(\d+)/)?.[1]

  const composePg = read('compose.yaml').match(/image:\s*postgres:(\d+)/)?.[1]
  const ciPg = ci.match(/image:\s*postgres:(\d+)/)?.[1]

  const problems = []
  for (const doc of docs) {
    if (HISTORICAL_VERSIONS[doc]) continue
    const lines = prose(read(doc))
    lines.forEach((line, i) => {
      const where = `${doc}:${i + 1}`

      for (const m of line.matchAll(/\bGo\s+(\d+\.\d+)(?:\.\d+)?\b/g)) {
        if (m[1] !== goMinor) {
          problems.push(`${where}: says "${m[0]}" but backend/go.mod says go ${goFull}`)
        }
      }
      for (const m of line.matchAll(/\bNode\s+(\d+)\+?\b/g)) {
        if (m[1] !== enginesFloor && !ciNode.includes(m[1])) {
          problems.push(
            `${where}: says "${m[0]}" but engines.node is "${enginesNode}" and ci.yml runs ${ciNode.join('/')}`,
          )
        }
      }
      for (const m of line.matchAll(/\bPostgre(?:s|SQL)\s+(\d+)\b/gi)) {
        if (m[1] !== composePg) {
          problems.push(`${where}: says "${m[0]}" but compose.yaml runs postgres:${composePg}`)
        }
      }
    })
  }

  if (composePg !== ciPg) {
    problems.push(`compose.yaml runs postgres:${composePg} but ci.yml runs postgres:${ciPg}`)
  }

  if (problems.length) return { ok: false, detail: problems.join('\n') }
  return {
    ok: true,
    detail:
      `go ${goFull}, node ${enginesNode} floor / ci ${ciNode.join('/')}, postgres ${composePg} - agreed across ` +
      `${docs.length - Object.keys(HISTORICAL_VERSIONS).length} docs ` +
      `(${Object.keys(HISTORICAL_VERSIONS).join(', ')} exempt as historical record)`,
  }
}

// 4. Every relative markdown link points at something that exists.
function checkRelativeLinks() {
  const problems = []
  let checked = 0

  for (const doc of docs) {
    // Strip inline code spans first. `route.Handlers[0](c)` is not a link.
    const text = read(doc).replace(/`[^`\n]*`/g, '')
    const dir = dirname(join(root, doc))
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const href = m[1]
      if (/^(https?:|mailto:|#|<)/.test(href)) continue
      const target = href.split('#')[0]
      if (!target) continue
      checked++
      const abs = resolve(dir, decodeURIComponent(target))
      if (!existsSync(abs)) {
        problems.push(`${doc}: link to "${href}" does not resolve (${posix.normalize(target)})`)
      }
    }
  }

  if (problems.length) return { ok: false, detail: problems.join('\n') }
  return { ok: true, detail: `${checked} relative links across ${docs.length} docs all resolve` }
}

// 5. Every migration named in prose exists in backend/migrations/.
function checkMigrationsNamed() {
  const files = readdirSync(join(root, 'backend/migrations')).filter((f) => f.endsWith('.sql'))
  const byNumber = new Map(files.map((f) => [f.slice(0, 3), f]))
  const problems = []
  let checked = 0

  for (const doc of docs) {
    const text = read(doc)
    for (const m of text.matchAll(/\b(\d{3})_[a-z0-9_]+\.sql\b/g)) {
      checked++
      if (!files.includes(m[0])) {
        const near = byNumber.get(m[1])
        problems.push(
          `${doc}: names migration ${m[0]}, which does not exist` +
            (near ? ` (${m[1]} is ${near})` : ''),
        )
      }
    }
    for (const m of text.matchAll(/\bmigrations?\s+`?(\d{3})`?\b/gi)) {
      checked++
      if (!byNumber.has(m[1])) {
        problems.push(`${doc}: names migration ${m[1]}, which does not exist`)
      }
    }
  }

  if (problems.length) return { ok: false, detail: problems.join('\n') }
  return {
    ok: true,
    detail: `${checked} migration references, all present among ${files.length} files (latest ${files[files.length - 1]})`,
  }
}

// 6. The diagrams still describe the system they were drawn from.
//
// The four Typst diagrams under diagrams/ are documentation with the same
// failure mode as a sentence: nothing compiles them against the code, and a
// diagram that is merely a release out of date reads exactly like one that is
// current. Every other check in this file grew out of that, and the diagrams
// were the one part of the doc surface still exempt.
//
// It holds three relationships, all content-to-content. Deliberately nothing
// about file timestamps: git does not preserve mtimes, so on a fresh clone
// every file is checkout time and an "SVG older than its source" test would
// be either vacuous or flaky depending on checkout order.
//
//   a. Every table a migration CREATEs is drawn in data-model.typ. Only the
//      `-- +goose Up` half is read: every migration's Down drops what its Up
//      created, so parsing the whole file asks the diagram to contain the
//      tables it also deletes.
//   b. Every .typ has both rendered themes committed beside it. A diagram
//      added but never rendered embeds as a broken image, which is invisible
//      in a diff and obvious to a reader.
//   c. A doc that counts the tables ("eighteen tables in four groups") counts
//      them correctly. That phrasing is in README's alt text, where it is the
//      only description a screen reader gets.
function checkDiagrams() {
  const dir = join(root, 'diagrams')
  if (!existsSync(dir)) return { ok: true, detail: 'no diagrams/ directory' }

  const problems = []

  // (a) tables created by migrations, from the Up half only
  const migDir = join(root, 'backend/migrations')
  const migrations = readdirSync(migDir).filter((n) => n.endsWith('.sql'))
  const tables = new Set()
  for (const f of migrations) {
    const up = readFileSync(join(migDir, f), 'utf8').split(/^--\s*\+goose Down\b/m)[0]
    for (const m of up.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) {
      tables.add(m[1].toLowerCase())
    }
  }

  const dataModel = join(dir, 'data-model.typ')
  if (existsSync(dataModel)) {
    const src = readFileSync(dataModel, 'utf8')
    // Only the quoted string literals, which are the box labels a reader
    // actually sees. Searching the whole source instead was the first version
    // of this and it did not work: Typst's `<transports>` cross-reference
    // labels appear three more times for the enclosing group and the foreign
    // key arrows, so deleting the table's own card left the bare word still
    // present and the check still green. It was caught by the negative test
    // and would not have been caught any other way. One literal may name two
    // tables ("pace_freq_rows + pace_tmn_rows" is drawn as one card), which
    // is why this is a word search within the corpus rather than an equality.
    const labels = [...src.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join(' | ')
    const missing = [...tables].filter((t) => !new RegExp(`\\b${t}\\b`).test(labels)).sort()
    if (missing.length) {
      problems.push(
        `diagrams/data-model.typ does not draw ${String(missing.length)} table(s) a migration creates: ${missing.join(', ')}\n` +
          `  Add them, then re-render:  cd diagrams && mise run render-file data-model.typ`,
      )
    }
  } else {
    problems.push('diagrams/data-model.typ is missing, but migrations create tables to draw')
  }

  // (b) every source has both themes rendered, and a responsive diagram is
  // actually responsive.
  //
  // The second half is here because the render task's strip step failed
  // silently on macOS: `sed -i -E` is GNU-only, BSD sed reads -E as the
  // backup suffix, and the expression then ran as a basic regex matching
  // nothing. Exit 0, valid SVG, no warning - and a diagram carrying a fixed
  // pt width that no longer scales in the READMEs embedding it. Only a
  // re-render on a Mac produced it, so it survived every render until one
  // happened. A rendered artifact is checkable, so check it.
  const sources = readdirSync(dir).filter((n) => n.endsWith('.typ'))
  for (const src of sources) {
    const base = src.slice(0, -4)
    const isStatic = /^\/\/\s*render:\s*static\b/m.test(readFileSync(join(dir, src), 'utf8'))
    for (const theme of ['light', 'dark']) {
      const svg = `${base}-${theme}.svg`
      if (!existsSync(join(dir, svg))) {
        problems.push(
          `diagrams/${svg} is missing for diagrams/${src}\n` +
            `  Render it:  cd diagrams && mise run render-file ${src}`,
        )
        continue
      }
      if (isStatic) continue
      const head = readFileSync(join(dir, svg), 'utf8').slice(0, 1000)
      if (/<svg[^>]*\s(?:width|height)="[\d.]+pt"/.test(head)) {
        problems.push(
          `diagrams/${svg} keeps a pt width/height, so it will not scale where it is embedded.\n` +
            `  The render task strips those; a copy that still has them was written by a\n` +
            `  strip step that silently did nothing. Re-render it:\n` +
            `    cd diagrams && mise run render-file ${src}`,
        )
      }
    }
  }

  // (c) a prose count is a claim, so check it.
  //
  // Two subjects, and a corpus wider than the tracked .md files. Both
  // widenings come from the same miss: data-model.typ closed with "18 tables
  // across 36 migrations" while there were 39, and nothing here could see it.
  // `docs` is `git ls-files '*.md'`, so the table half of this check had been
  // reading every file in the repo except the diagram it is a claim about -
  // it passed on README's alt text and never opened the .typ. The migrations
  // half is new because nothing counted them anywhere, and a migration that
  // creates no table is invisible to (a) by construction: 037, 038 and 039
  // add a column, a collation and a catalog, so the drawing stayed correct
  // while the sentence under it did not.
  const WORDS = {
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23, 'twenty-four': 24,
    'twenty-five': 25, 'twenty-six': 26, 'twenty-seven': 27, 'twenty-eight': 28,
    'twenty-nine': 29, thirty: 30, 'thirty-one': 31, 'thirty-two': 32,
    'thirty-three': 33, 'thirty-four': 34, 'thirty-five': 35, 'thirty-six': 36,
    'thirty-seven': 37, 'thirty-eight': 38, 'thirty-nine': 39, forty: 40,
  }
  const corpus = [
    ...docs.map((d) => [d, read(d)]),
    ...sources.map((s) => [`diagrams/${s}`, readFileSync(join(dir, s), 'utf8')]),
  ]
  let counted = 0
  for (const [subject, expected] of [['tables', tables.size], ['migrations', migrations.length]]) {
    const re = new RegExp(String.raw`\b([a-z-]+|\d+)\s+${subject}\b`, 'gi')
    for (const [doc, text] of corpus) {
      if (HISTORICAL_COUNTS[doc]) continue
      for (const m of text.matchAll(re)) {
        const raw = m[1].toLowerCase()
        const n = /^\d+$/.test(raw) ? Number(raw) : WORDS[raw]
        if (n === undefined) continue // "goose migrations", "several tables" - not a count
        counted++
        if (n !== expected) {
          problems.push(
            `${doc}: says "${m[0]}", but there are ${String(expected)} ${subject}`,
          )
        }
      }
    }
  }

  if (problems.length) return { ok: false, detail: problems.join('\n') }
  return {
    ok: true,
    detail:
      `${String(sources.length)} diagrams rendered in both themes, ` +
      `all ${String(tables.size)} migration tables drawn, ` +
      `${String(counted)} prose count(s) agree ` +
      `(${String(tables.size)} tables, ${String(migrations.length)} migrations; ` +
      `${Object.keys(HISTORICAL_COUNTS).join(', ')} exempt as historical record)`,
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const STEPS = [
  ['workflow inputs', checkWorkflowInputs],
  ['ci job lists', checkCiJobLists],
  ['versions in prose', checkVersionsInProse],
  ['relative links resolve', checkRelativeLinks],
  ['migrations named in prose', checkMigrationsNamed],
  ['diagrams match the code', checkDiagrams],
]

console.log(`check-docs: ${STEPS.length} checks over ${docs.length} tracked docs\n`)

const failures = []
for (const [name, fn] of STEPS) {
  process.stdout.write(`  ${name} ... `)
  let result
  try {
    result = fn()
  } catch (err) {
    result = { ok: false, detail: err?.stack ?? String(err) }
  }
  if (result.ok) {
    console.log(`pass  (${result.detail})`)
  } else {
    console.log('FAIL')
    failures.push([name, result.detail])
  }
}

if (skipped.length) {
  console.log('')
  for (const path of skipped) {
    console.log(`  skipped ${path}\n          reason: ${EXCEPTIONS[path]}`)
  }
}

if (failures.length > 0) {
  for (const [name, detail] of failures) {
    console.error(`\n${'-'.repeat(70)}\n${name}\n${'-'.repeat(70)}\n${detail}`)
  }
  console.error(`\ncheck-docs: FAILED ${failures.length} of ${STEPS.length}.`)
  process.exit(1)
}

console.log(`\ncheck-docs: PASSED all ${STEPS.length} checks.`)

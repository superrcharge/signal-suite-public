#!/usr/bin/env node
// Prints which /ship checks this branch's diff can possibly affect.
//
// Called as step 0b of /ship. The audit runs on a small model, so this exists
// to hand it computed verdicts rather than ask it to infer them: whether the
// doc checks apply, and whether the release sequence does. See
// scripts/lib/ship-scope.mjs for why each is gated.
//
// Always exits 0. This is not a gate and must never be able to fail a push; it
// only says which of the checks below it are worth running.

import { execSync } from 'node:child_process'

import { collectPaths, releaseScope, shipScope } from './lib/ship-scope.mjs'

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    return null
  }
}

const branch = git('branch --show-current')?.trim() ?? '(unknown)'

// origin/main when it is there, plain main otherwise, so this works on a clone
// that has not fetched and on the macOS checkout equally.
const base = git('rev-parse --verify --quiet origin/main')?.trim() ? 'origin/main' : 'main'

const diffOutput = git(`diff --name-only ${base}...HEAD`)
const statusOutput = git('status --porcelain')

// A null diff means the git call itself failed - no merge base, a fresh repo,
// a detached HEAD. Unknown scope is treated as full scope, because the cost of
// being wrong runs one way: a wrongly skipped check is a documentation gap that
// surfaces months later, a wrongly run one costs a few seconds.
const diffFailed = diffOutput === null

const paths = collectPaths({ diffOutput: diffOutput ?? '', statusOutput: statusOutput ?? '' })
const { docChecks, triggers } = diffFailed
  ? { docChecks: 'required', triggers: ['the diff could not be read, so scope is assumed to be full'] }
  : shipScope(paths)
const { release, triggers: releaseTriggers } = diffFailed
  ? { release: 'required', triggers: ['the diff could not be read, so scope is assumed to be full'] }
  : releaseScope(paths)

console.log(`ship scope: ${branch} vs ${base}`)
console.log(`  ${paths.length} changed file${paths.length === 1 ? '' : 's'} (committed + working tree)`)

if (paths.length && paths.length <= 20) {
  for (const p of paths.sort()) console.log(`    ${p}`)
} else if (paths.length) {
  for (const p of paths.sort().slice(0, 20)) console.log(`    ${p}`)
  console.log(`    ... and ${paths.length - 20} more`)
}

console.log('')

if (docChecks === 'required') {
  console.log('DOC_CHECKS=required')
  console.log('Run checks 7, 8, 9, 10, 10b and 11 in full. In scope because this diff touches:')
  for (const t of triggers) console.log(`  - ${t}`)
} else {
  console.log('DOC_CHECKS=skip')
  console.log('Checks 7, 8, 9, 10, 10b and 11 do not apply to this diff. Report each of them as')
  console.log('  "skipped - no domain, page, context, prose, migration, diagram or deploy changes on this branch"')
  console.log('in the summary table. Every other check still runs.')
}

console.log('')

if (release === 'required') {
  console.log('RELEASE=required')
  console.log('Run the release sequence in full, Steps 1-10. In scope because this diff touches:')
  for (const t of releaseTriggers) console.log(`  - ${t}`)
} else {
  console.log('RELEASE=skip')
  console.log('Nothing on this branch reaches the image or deploy/, so a release would tag and')
  console.log('deploy exactly what is already running. Run Steps 1-4 and stop after the merge:')
  console.log('no CHANGELOG version entry, no tag, no deploy.')
}

process.exit(0)

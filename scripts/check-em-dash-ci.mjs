#!/usr/bin/env node
// CI gate: fail when a change adds an em dash.
//
// The PostToolUse hook only sees files Claude writes. It cannot see a hand
// edit, a commit pushed from the other machine, or an edit made in the GitHub
// web UI. One incident hit exactly that gap: 8 em dashes were merged across five PRs
// before any enforcement existed. This closes it for every author.
//
// Usage: node scripts/check-em-dash-ci.mjs <base-ref>
// Compares <base-ref>...HEAD and inspects added lines only.

import { execFileSync } from 'node:child_process'
import {
  EM_DASH,
  GUIDANCE,
  formatHits,
  parseAddedLines,
  shouldSkip,
  violations,
} from './lib/em-dash.mjs'

const base = process.argv[2]
if (!base) {
  console.error('usage: check-em-dash-ci.mjs <base-ref>')
  process.exit(2)
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

let diff
try {
  // Two-dot against the merge base is deliberate: three-dot would re-flag
  // lines that arrived on the base branch since this one was cut.
  const mergeBase = git(['merge-base', base, 'HEAD']).trim()
  diff = git(['diff', '-U0', '--diff-filter=ACM', mergeBase, 'HEAD'])
} catch (err) {
  // Fail, do not pass. This used to exit 0 on the reasoning that a verdict it
  // could not compute should not fail the build - but the visible result of
  // exit 0 is a green check, which says the opposite: that the check ran and
  // found nothing. A shallow clone, a renamed base branch or a missing
  // fetch-depth would have turned the repo's only style gate into a permanent
  // pass, announced on stderr where a green tick hides it.
  //
  // The workflow sets fetch-depth: 0 and passes origin/<base>, so if the ref
  // will not resolve, that is a CI configuration fault and wants fixing rather
  // than skipping.
  console.error(`Could not diff against "${base}": ${err.message.split('\n')[0]}`)
  console.error('The em dash check could not run. Failing rather than reporting a pass it never computed.')
  console.error('Check that the job uses fetch-depth: 0 and that the base ref exists.')
  process.exit(1)
}

const byFile = parseAddedLines(diff)
const report = []
let total = 0

for (const [file, lines] of byFile) {
  if (shouldSkip(file)) continue
  const hits = violations(lines)
  if (hits.length === 0) continue
  total += hits.length
  report.push(formatHits(file, hits))
}

if (total === 0) {
  console.log('No em dashes in added lines.')
  process.exit(0)
}

console.error(
  `The project style rule forbids the em dash (${EM_DASH}). ` +
    `This change adds ${total} line${total === 1 ? '' : 's'} containing one:\n`,
)
console.error(report.join('\n'))
console.error(`\n${GUIDANCE}`)
process.exit(1)

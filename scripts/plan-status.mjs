#!/usr/bin/env node
// Terminal-state beacon for /execute-plan.
//
// An executor has three outcomes, not two: it commits, it stops blocked, or it
// dies. A watcher that only looks for a new commit or a vanished process sees
// the first and the third and misses the second, which is the most common one:
// a blocked executor sits alive and idle holding a written report, and silence
// from it is indistinguishable from silence while it works.
//
// That is not hypothetical. The first real handoff run finished its edits in
// about five minutes, stopped on a failing gate at 22:09Z, and was not noticed
// for 45 minutes, because the watch condition was "HEAD moved or the process
// exited" and neither ever became true.
//
// So every terminal state writes this file. Whoever is waiting polls one path
// and gets an answer, whichever way the run ended.
//
// Usage:
//   node scripts/plan-status.mjs started   <plan-path> "reading the plan"
//   node scripts/plan-status.mjs step      <plan-path> "4 of 8 - files read"
//   node scripts/plan-status.mjs blocked   <plan-path> "em dash gate fails on the plan itself"
//   node scripts/plan-status.mjs committed <plan-path> "abc1234 fix(pace): editor polish"

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// 'step' is not terminal. It appends to the steps list and leaves the run marked
// 'running', so a watcher can tell a run working through step 5 from one frozen
// at step 1 without opening the transcript.
const STATES = ['started', 'step', 'blocked', 'committed']

const [state, plan, ...rest] = process.argv.slice(2)
const message = rest.join(' ')

if (!STATES.includes(state)) {
  console.error(`usage: plan-status.mjs <${STATES.join('|')}> <plan-path> "<message>"`)
  process.exit(2)
}
if (!plan) {
  console.error('Missing plan path. The status is meaningless without naming the plan it is for.')
  process.exit(2)
}
if (!message) {
  console.error(
    'Missing message. A bare state tells a watcher that something happened and ' +
      'not what, which still costs someone a trip to the transcript to find out.',
  )
  process.exit(2)
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const root = git(['rev-parse', '--show-toplevel'])
if (!root) {
  console.error('Not inside a git repository.')
  process.exit(2)
}

const out = join(root, '.claude', '.execute-plan-status.json')
mkdirSync(dirname(out), { recursive: true })

// Steps accumulate across writes, so the file always carries the whole run and
// not just its latest line. 'started' begins a fresh list; every later write
// extends it.
const prior =
  existsSync(out) && state !== 'started' ? JSON.parse(readFileSync(out, 'utf8')) : null
const steps = prior?.steps ?? []
steps.push(`${new Date().toISOString().slice(11, 19)}  ${message}`)

writeFileSync(
  out,
  `${JSON.stringify(
    {
      // 'step' is progress, not an outcome. Anything else is where the run ended.
      state: state === 'step' ? 'running' : state,
      plan,
      message,
      steps,
      branch: git(['branch', '--show-current']),
      head: git(['rev-parse', '--short', 'HEAD']),
      // No pid here. This script is a short-lived child of a shell that is itself
      // a child of the claude session, so process.ppid named the shell, which had
      // exited seconds later. A liveness check against it always reported dead
      // while the run was healthy, which is worse than no field at all. Use the
      // timestamp below for staleness, and match on the command line to find the
      // real process.
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
)

console.log(`plan-status: ${state} (${message}) -> ${out}`)

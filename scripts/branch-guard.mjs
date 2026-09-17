#!/usr/bin/env node
// PreToolUse hook: refuse to change the repo while on main.
//
// AGENTS.md opens with "Never implement on main" and /ship guards it at push
// time, but between those two points the rule is prose, and prose is what a
// weaker model drifts from. This makes it mechanical: the first Edit, Write or
// repo-writing Bash command on main is denied, before a single line lands in
// the wrong place.
//
// It covers two tool shapes, because for a long time it only covered one.
//
//   1. Write / Edit / NotebookEdit, scoped by the file being written.
//   2. Bash, scoped by the session's working directory.
//
// Case 2 is the hole this used to have. AGENTS.md recorded it plainly: the
// guard "only sees Write|Edit|NotebookEdit, never Bash", so a `sed`, a heredoc
// or a `git commit` through Bash was invisible to it, and the documented
// release sequence itself routed around the rule that way. Adding Bash to the
// matcher without teaching the guard to read a command line would have blocked
// `git status` on main, so the classification lives in scripts/lib/bash-guard.mjs
// with unit tests on both directions: what must be blocked, and what must keep
// working.
//
// Scoped by the file being written, not by the session's cwd, for case 1.
// Plans under ~/.claude/plans, scratchpad files, and any other repo are none of
// this hook's business, so a path that does not resolve inside a git repo is
// allowed without comment.
//
// Reads the hook payload on stdin, writes a JSON decision on stdout. Node
// rather than bash and jq so the same hook runs on Windows and macOS.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

import { repoMutations } from './lib/bash-guard.mjs'

const allow = () => process.exit(0)

// Wording matches .claude/commands/ship.md so the model reads the same
// instruction wherever the rule catches it.
function deny(detail) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `You are on main. All work must be done on a feature branch, and this ${detail}\n\n` +
          'Run: git checkout -b <type>/<short-description>\n\n' +
          'then try again. The only commits that should ever reach main are ' +
          'merges from pull requests, so do not work around this by committing ' +
          'here and moving the branch afterwards.',
      },
    }),
  )
  process.exit(0)
}

// Returns the current branch for a directory, or null when the directory is
// not in a git repo and is therefore none of this hook's business.
function branchOf(dir) {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function repoRootOf(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {
  allow() // A malformed payload is not the author's problem. Never block on it.
}

const input = payload?.tool_input ?? {}

// ---------------------------------------------------------------------------
// Bash
// ---------------------------------------------------------------------------

if (typeof input.command === 'string') {
  const cwd = payload?.cwd || process.cwd()
  const root = repoRootOf(cwd)
  if (!root) allow()
  if (branchOf(cwd) !== 'main') allow()

  const reasons = repoMutations(input.command, { repoRoot: root, cwd })
  if (reasons.length === 0) allow()

  deny(`command was blocked before it ran:\n  ${reasons.join('\n  ')}`)
}

// ---------------------------------------------------------------------------
// Write / Edit / NotebookEdit
// ---------------------------------------------------------------------------

const filePath = input.file_path || input.notebook_path
if (!filePath || !isAbsolute(filePath)) allow()

// A new file's parent directory may not exist yet, so walk up to the nearest
// one that does before asking git where it is.
let probe = dirname(resolve(filePath))
while (!existsSync(probe)) {
  const up = dirname(probe)
  if (up === probe) allow()
  probe = up
}

const branch = branchOf(probe)
if (branch === null) allow() // Not a git repo, or git is unavailable.
if (branch !== 'main') allow()

deny('edit was blocked before it landed.')

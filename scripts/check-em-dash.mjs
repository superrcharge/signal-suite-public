#!/usr/bin/env node
// PostToolUse hook: reject em dashes in lines this session added.
//
// Catches violations at the moment they are written. It cannot see hand edits
// or commits from another machine, which is what scripts/check-em-dash-ci.mjs
// covers. Detection logic is shared between the two via lib/em-dash.mjs so the
// local and CI answers cannot drift apart.
//
// Reads the hook payload on stdin, writes a JSON decision on stdout. Node
// rather than bash and jq so the same hook runs on Windows and macOS.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { relative, isAbsolute, resolve } from 'node:path'
import {
  EM_DASH,
  GUIDANCE,
  formatHits,
  parseAddedLines,
  shouldSkip,
  violations,
} from './lib/em-dash.mjs'

const ok = () => process.exit(0)

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {
  ok() // A malformed payload is not the author's problem. Never block on it.
}

const filePath = payload?.tool_input?.file_path || payload?.tool_response?.filePath
if (!filePath || !isAbsolute(filePath) || !existsSync(filePath)) ok()

let repoRoot
try {
  repoRoot = git(['rev-parse', '--show-toplevel'], resolve(filePath, '..')).trim()
} catch {
  ok() // Outside a repo entirely: not our business.
}

// Only police this repo. Scratchpad and plan files are out of scope.
const rel = relative(repoRoot, filePath).split('\\').join('/')
if (rel.startsWith('..') || shouldSkip(rel)) ok()

// An untracked file is entirely new, so every line counts as added.
let added
try {
  git(['ls-files', '--error-unmatch', rel], repoRoot)
  added = parseAddedLines(git(['diff', '-U0', '--', rel], repoRoot)).get(rel) || []
} catch {
  added = readFileSync(filePath, 'utf8')
    .split('\n')
    .map((text, i) => ({ n: i + 1, text }))
}

const hits = violations(added)
if (hits.length === 0) ok()

// PostToolUse runs after the write, so the file already contains them. Block
// so the model is told to go fix what it just wrote.
process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason:
      `The project style rule forbids the em dash (${EM_DASH}), and ${hits.length} ` +
      `just-written line${hits.length === 1 ? '' : 's'} contain${hits.length === 1 ? 's' : ''} one:\n` +
      `${formatHits(rel, hits)}\n\n${GUIDANCE}`,
  }),
)
process.exit(0)

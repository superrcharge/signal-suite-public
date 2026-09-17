// Shared change detection, used by scripts/verify.mjs (which writes a receipt)
// and scripts/verify-gate.mjs (which checks one).
//
// One implementation on purpose, for the same reason lib/em-dash.mjs is
// shared: a writer and a checker that disagree about what "unchanged" means
// would either block a verified tree forever or wave an unverified one
// through, and both failures are silent.
//
// Two properties this has to get right, both learned the hard way:
//
//   1. The digest is over file CONTENT, never over HEAD. Committing does not
//      change what a check would find, so it must not invalidate a receipt.
//      A HEAD-based digest sent the executor back to re-run the whole suite
//      immediately after the commit it had just verified.
//   2. "Are there changes?" is asked against the merge base with main, not
//      against HEAD. Asking against HEAD means a model can edit, commit, and
//      stop with a clean tree having never run a check, which is exactly the
//      hole the gate exists to close.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// The boundary is deliberately narrower than "the repo". Only these trees can
// break a check that verify.mjs runs, so only these invalidate a receipt.
//
// Editing a doc, a plan, or a deploy parameter therefore does not demand a
// full test run before the session can end. Em dashes in prose outside this
// scope stay covered by the PostToolUse hook at write time and by /ship before
// the push, so nothing is left ungated, it is gated somewhere cheaper.
const VERIFY_SCOPE = ['frontend', 'backend', 'scripts']

const MAX_READ_BYTES = 1024 * 1024

export function inVerifyScope(relPath) {
  const p = relPath.split('\\').join('/')
  return VERIFY_SCOPE.some((dir) => p === dir || p.startsWith(`${dir}/`))
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

function lines(out) {
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function repoRoot(from = process.cwd()) {
  return git(['rev-parse', '--show-toplevel'], from).trim()
}

// The point the current branch diverged from main. Shared so verify.mjs and
// the gate scope "the change" identically.
export function mergeBaseWithMain(root) {
  for (const ref of ['origin/main', 'main']) {
    try {
      git(['rev-parse', '--verify', '--quiet', ref], root)
      return git(['merge-base', ref, 'HEAD'], root).trim()
    } catch {
      continue
    }
  }
  return null
}

function contentHash(abs) {
  let size = -1
  try {
    size = statSync(abs).size
  } catch {
    return 'missing'
  }
  // Large enough to be an artifact rather than source. Its size still counts
  // as a change; its contents are not worth reading on every stop.
  if (size > MAX_READ_BYTES) return `size:${size}`
  try {
    return createHash('sha256').update(readFileSync(abs)).digest('hex')
  } catch {
    return `unreadable:${size}`
  }
}

// Content of every in-scope file, keyed by path, hashed the same way whatever
// git currently thinks of the file.
//
// An earlier version took the blob hash from `ls-files -s` for indexed files
// and hashed the bytes itself for untracked ones. Two hash functions over
// identical content, so `git add` alone changed the digest and the gate
// blocked immediately after the commit it had just verified. Read everything.
// It is roughly 370 files here, which costs a fraction of the round trip the
// mistake caused.
export function treeDigest(root) {
  const scope = ['--', ...VERIFY_SCOPE]

  const paths = new Set([
    ...lines(git(['ls-files', ...scope], root)),
    ...lines(git(['ls-files', '-o', '--exclude-standard', ...scope], root)),
  ])

  for (const rel of lines(git(['ls-files', '-d', ...scope], root))) {
    paths.delete(rel)
  }

  const h = createHash('sha256')
  for (const rel of [...paths].sort()) {
    h.update(rel)
    h.update('\0')
    h.update(contentHash(join(root, rel)))
    h.update('\0')
  }
  return h.digest('hex')
}

// True when this branch carries in-scope changes against main, committed or
// not. A doc edit, a plan, or an untracked scratch file is not worth blocking
// a stop over.
export function hasVerifiableChanges(root) {
  const scope = ['--', ...VERIFY_SCOPE]

  if (lines(git(['ls-files', '-o', '--exclude-standard', ...scope], root)).length > 0) {
    return true
  }

  const base = mergeBaseWithMain(root)
  if (base) {
    // Working tree against the merge base: catches commits on this branch and
    // uncommitted edits in one comparison.
    return lines(git(['diff', '--name-only', base, ...scope], root)).length > 0
  }

  // No main to compare against. Fall back to the working tree alone rather
  // than reporting a verdict that was never computed.
  return lines(git(['diff', '--name-only', 'HEAD', ...scope], root)).length > 0
}

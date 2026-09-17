#!/usr/bin/env node
// Stop hook: refuse to end a turn on unverified code changes.
//
// This is the control that separates work that passes from work that merely
// says it does. A model reporting "all done, everything passes" without having
// run anything is the single hardest failure to catch by reading a transcript,
// because the claim looks identical either way.
//
// It compares a hash, it does not run the suite, so it costs milliseconds.
// scripts/verify.mjs writes .claude/.verify-receipt.json on success; this
// reads it and checks the digest still describes the current tree.
//
// Reads the hook payload on stdin, writes a JSON decision on stdout.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasVerifiableChanges, repoRoot, treeDigest } from './lib/tree-digest.mjs'

const allow = () => process.exit(0)

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
  process.exit(0)
}

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {
  allow()
}

// Set once this hook has already blocked and the model is stopping again.
// Without honouring it, a model that genuinely cannot get to green would be
// held in the session indefinitely instead of reporting what is wrong.
if (payload?.stop_hook_active) allow()

let root
try {
  root = repoRoot(payload?.cwd || process.cwd())
} catch {
  allow() // Not in a repo. Nothing to gate.
}

if (!hasVerifiableChanges(root)) allow()

const receiptPath = join(root, '.claude', '.verify-receipt.json')
const RUN = 'Run: node scripts/verify.mjs'

if (!existsSync(receiptPath)) {
  block(
    'This session changed code under frontend/, backend/, or scripts/, and ' +
      'verification has not been run.\n\n' +
      `${RUN}\n\n` +
      'It must exit 0. Do not edit the verify script, do not suppress a lint ' +
      'rule to get past it, and do not report the work as complete until it ' +
      'passes. If it fails for a reason you cannot fix, say so plainly and ' +
      'quote the failing step rather than working around it.',
  )
}

let receipt
try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
} catch {
  block(`The verification receipt is unreadable. ${RUN}`)
}

let current
try {
  current = treeDigest(root)
} catch (err) {
  // A digest that cannot be computed must not silently wave work through.
  block(`Could not read the working tree to check the receipt (${err.message}). ${RUN}`)
}

if (receipt?.digest !== current) {
  block(
    'The code changed after verification last passed, so the receipt no longer ' +
      `describes this tree (last run: ${receipt?.timestamp ?? 'unknown'}).\n\n` +
      `${RUN}\n\n` +
      'Every edit after a passing run needs a fresh one. That is the point: the ' +
      'receipt covers the tree that was actually checked, not the one that was ' +
      'checked an edit ago.',
  )
}

allow()

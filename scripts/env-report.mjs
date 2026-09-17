#!/usr/bin/env node
// Machine identity report for session start.
//
// This repo may be worked on from more than one machine. Every path here is
// derived at runtime, never hardcoded - see .claude/commands/ship.md, and
// An earlier pull request, where hardcoded absolute paths made /start and /ship report green
// while inspecting nothing.
//
// Rules this file follows, in order of importance:
//   1. A probe that fails says so out loud. An empty result is never printed
//      as a pass. That silent-pass bug is the whole reason this exists.
//   2. Exit 0 regardless. This runs on SessionStart and must never block a
//      session, no matter how broken the local toolchain is.
//   3. Stay fast. Probes run in parallel; the whole report should be well
//      under two seconds.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const run = promisify(execFile)

// On Windows many tools are .cmd/.bat shims that only resolve through a
// shell. On POSIX, shell:false is both faster and safer.
const useShell = process.platform === 'win32'

const PROBE_TIMEOUT_MS = 4000

// `select` picks the interesting line out of multi-line output. It defaults to
// the first line, which is what every --version probe wants.
const firstLine = (out) => out.split('\n')[0]

async function probe(cmd, args, select = firstLine) {
  try {
    const { stdout } = await run(cmd, args, {
      shell: useShell,
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true,
    })
    const line = (select(stdout.trim()) || '').trim()
    return line || { missing: 'returned no output' }
  } catch (err) {
    if (err.code === 'ENOENT') return { missing: 'not installed' }
    if (err.killed) return { missing: `timed out after ${PROBE_TIMEOUT_MS}ms` }
    return { missing: (err.shortMessage || err.message || 'failed').split('\n')[0] }
  }
}

const OS_NAMES = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }

const [
  repoRoot,
  node,
  go,
  golangciLint,
  podman,
  docker,
  gh,
  ghAccount,
] = await Promise.all([
  probe('git', ['rev-parse', '--show-toplevel']),
  probe('node', ['--version']),
  probe('go', ['version']),
  probe('golangci-lint', ['--version']),
  probe('podman', ['--version']),
  probe('docker', ['--version']),
  probe('gh', ['--version']),
  // The first line of `gh auth status` is just the host. The account is on the
  // "Logged in to ..." line, which is the part that actually matters here.
  probe('gh', ['auth', 'status', '--active'], (out) => {
    const hit = out.split('\n').find((l) => l.includes('Logged in to'))
    return hit ? hit.replace(/^[\s✓✗-]+/, '') : firstLine(out)
  }),
])

// Present the value, or the reason it is absent. Never a blank.
const show = (v) => (typeof v === 'string' ? v : `MISSING (${v.missing})`)

const lines = []
lines.push('=== Machine ===')
lines.push(`OS:        ${OS_NAMES[process.platform] || process.platform} ${os.release()} (${process.arch})`)
lines.push(`Host:      ${os.hostname()}`)
lines.push(`Shell:     ${process.env.SHELL || process.env.ComSpec || 'unknown'}`)
lines.push(`Repo root: ${show(repoRoot)}`)

lines.push('')
lines.push('=== Toolchain ===')
lines.push(`node:          ${show(node)}`)
lines.push(`go:            ${show(go)}`)
lines.push(`golangci-lint: ${show(golangciLint)}`)
lines.push(`gh:            ${show(gh)}`)

// A container runtime is required, but either one satisfies that. Report the
// pair together so an absent docker on a podman box does not read as a fault.
const runtimes = []
if (typeof podman === 'string') runtimes.push(podman)
if (typeof docker === 'string') runtimes.push(docker)
lines.push(
  `container:     ${runtimes.length ? runtimes.join(' / ') : 'MISSING (no podman or docker on PATH)'}`,
)

// The account matters more than the binary: AGENTS.md flags that the wrong gh
// account silently hits the wrong repo, and the gate AGENTS.md names is
// currently Windows-only. This line is the cross-platform stand-in.
lines.push('')
lines.push('=== GitHub ===')
if (typeof ghAccount === 'string') {
  lines.push(ghAccount)
} else {
  lines.push(`gh auth status: ${show(ghAccount)}`)
}

// Per-clone setup that is easy to forget and silent when skipped. The pre-push
// hook runs the CI-equivalent suite; without it, pushes go out unverified.
lines.push('')
lines.push('=== Per-clone setup ===')
if (typeof repoRoot === 'string') {
  const installed = existsSync(join(repoRoot, '.git', 'hooks', 'pre-push'))
  lines.push(
    installed
      ? 'git pre-push hook: installed'
      : 'git pre-push hook: NOT INSTALLED - run scripts/setup-hooks.sh (pushes are unverified until you do)',
  )
} else {
  lines.push('git pre-push hook: unknown (repo root could not be resolved)')
}

console.log(lines.join('\n'))
process.exit(0)

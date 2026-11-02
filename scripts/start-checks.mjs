#!/usr/bin/env node
// The automatic half of /start, run by the SessionStart hook in
// .claude/settings.json beside env-report.mjs.
//
// It checks what .claude/commands/start.md steps 1-5 check - branch, CI on
// main, open Dependabot alerts, the dev container, migration annotations and
// uncommitted changes - plus the active gh account, and prints one line of
// hook JSON. The wording and verdicts live in lib/start-checks.mjs.
//
// Rules, in the same order as env-report.mjs:
//   1. A failed probe says so. Nothing absent is printed as a pass.
//   2. Exit 0 regardless. A session gate that can block a session gets
//      switched off.
//   3. Stay fast. Probes run in parallel with short timeouts. The network
//      ones (fetch, gh) are the slow half, which is why the hook allows 60s.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { hookPayload, repoSlug, summarize } from './lib/start-checks.mjs'

const run = promisify(execFile)

// No shell, on every platform. git, gh, podman and docker are real executables
// on Windows too, and a shell would mangle the jq filters and query strings
// passed below (cmd.exe reads | & + as operators).

async function probe(cmd, args, { timeout = 8000, cwd } = {}) {
  try {
    const { stdout } = await run(cmd, args, { timeout, windowsHide: true, cwd })
    return stdout.trim()
  } catch (err) {
    if (err.code === 'ENOENT') return { missing: `${cmd} not installed` }
    if (err.killed) return { missing: `${cmd} timed out` }
    return { missing: (err.stderr || err.message || 'failed').trim().split('\n')[0] }
  }
}

async function main() {
  const root = await probe('git', ['rev-parse', '--show-toplevel'], { cwd: process.env.CLAUDE_PROJECT_DIR })
  if (typeof root !== 'string') {
    return summarize({ branch: root, account: root, ci: root, alerts: root, containers: root, migrations: root, dirty: root })
  }
  const git = (...args) => probe('git', args, { cwd: root })

  const [branch, origin, dirtyOut, account, podman, docker] = await Promise.all([
    git('branch', '--show-current'),
    git('remote', 'get-url', 'origin'),
    git('status', '--porcelain'),
    probe('gh', ['api', 'user', '--jq', '.login']),
    probe('podman', ['ps', '--format', '{{.Names}}']),
    probe('docker', ['ps', '--format', '{{.Names}}']),
    // Refresh remote refs so the branch report is current. Its result is not
    // reported; a failed fetch shows up as a failed CI probe anyway.
    git('fetch', '-q', 'origin'),
  ])

  const slug = repoSlug(typeof origin === 'string' ? origin : null)
  const noSlug = { missing: 'origin is not a GitHub remote' }
  const [ciOut, alerts] = slug
    ? await Promise.all([
        probe('gh', ['run', 'list', '--repo', slug, '--branch', 'main', '--workflow', 'ci.yml', '--limit', '1', '--json', 'conclusion,status', '--jq', '.[0] | (.conclusion // "") + "|" + .status']),
        probe('gh', ['api', `repos/${slug}/dependabot/alerts?state=open&per_page=100`, '--jq', 'length']),
      ])
    : [noSlug, noSlug]

  let ci = ciOut
  if (typeof ciOut === 'string') {
    const [conclusion, status] = ciOut.split('|')
    ci = conclusion || status || { missing: 'no CI runs on main' }
  }

  // Either runtime satisfies "the container is up"; only both failing is unknown.
  let containers
  if (typeof podman === 'string' || typeof docker === 'string') {
    containers = [podman, docker].filter((v) => typeof v === 'string').join('\n').split('\n').filter(Boolean)
  } else {
    containers = { missing: 'no container engine answering - is the podman machine up?' }
  }

  let migrations
  let unannotated = []
  try {
    const dir = join(root, 'backend', 'migrations')
    migrations = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    unannotated = migrations.filter((f) => !/^-- \+goose Up/.test(readFileSync(join(dir, f), 'utf8')))
  } catch (err) {
    migrations = { missing: err.code || err.message }
  }

  const dirty = typeof dirtyOut === 'string' ? String(dirtyOut.split('\n').filter(Boolean).length) : dirtyOut

  return summarize({ branch, account, ci, alerts, containers, migrations, unannotated, dirty })
}

try {
  const { summary } = await main()
  console.log(JSON.stringify(hookPayload(summary)))
} catch (err) {
  console.log(JSON.stringify(hookPayload(`start checks crashed: ${err.message}`)))
}
process.exit(0)

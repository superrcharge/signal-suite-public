// Unit tests for the automatic /start gate's verdicts.
//
// The failure direction is the one that matters: every probe that did not
// answer must read as unknown or MISSING, never as a pass, because a session
// gate that reports green on a probe it never ran is the bug env-report.mjs
// was written to stop.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  accountVerdict,
  branchVerdict,
  containerVerdict,
  hookPayload,
  migrationVerdict,
  repoSlug,
  summarize,
} from './start-checks.mjs'

const miss = (m) => ({ missing: m })

test('repoSlug reads https and ssh remotes', () => {
  assert.equal(repoSlug('https://github.com/superrcharge/signal-suite-public.git'), 'superrcharge/signal-suite-public')
  assert.equal(repoSlug('https://github.com/superrcharge/signal-suite-public'), 'superrcharge/signal-suite-public')
  assert.equal(repoSlug('git@github.com:superrcharge/signal-suite-public.git'), 'superrcharge/signal-suite-public')
  assert.equal(repoSlug('https://gitlab.example/x/y.git'), null)
  assert.equal(repoSlug(undefined), null)
})

test('branch on main is flagged, a branch is ok', () => {
  assert.deepEqual(branchVerdict('main').onMain, true)
  assert.match(branchVerdict('main').text, /ON MAIN/)
  assert.equal(branchVerdict('docs/x').text, 'docs/x (not main, ok)')
  assert.equal(branchVerdict('').text, 'detached HEAD')
  assert.match(branchVerdict(miss('git not installed')).text, /^unknown \(git not installed\)/)
})

test('account is reported as is', () => {
  assert.equal(accountVerdict('someone'), 'someone (ok)')
  assert.equal(accountVerdict('personal-account'), 'personal-account (ok)')
  assert.match(accountVerdict(''), /^not logged in/)
  assert.match(accountVerdict(miss('gh not installed')), /^unknown/)
})

test('migrations: annotated, unannotated, and none found', () => {
  assert.equal(migrationVerdict(['001_a.sql', '002_b.sql'], []), 'all 2 annotated')
  assert.equal(migrationVerdict(['001_a.sql', '002_b.sql'], ['002_b.sql']), 'MISSING -- +goose Up: 002_b.sql')
  // An empty directory is not "all annotated": it is a wrong working directory.
  assert.match(migrationVerdict([], []), /^MISSING \(no migration files/)
  assert.match(migrationVerdict(miss('ENOENT'), []), /^unknown \(ENOENT\)/)
})

test('container: app running, not running, no runtime', () => {
  assert.equal(containerVerdict(['postgresql', 'app', 'frontend-dev']), 'running')
  assert.match(containerVerdict(['postgresql']), /^NOT running/)
  assert.match(containerVerdict([]), /^NOT running/)
  assert.match(containerVerdict(miss('no podman or docker answering')), /^unknown/)
})

test('summarize never renders a failed probe as a pass', () => {
  const down = miss('offline')
  const { summary, onMain } = summarize({
    branch: 'feat/x',
    account: down,
    ci: down,
    alerts: down,
    containers: down,
    migrations: down,
    dirty: down,
  })
  assert.equal(onMain, false)
  for (const field of ['gh', 'CI\\(main\\)', 'alerts', 'container', 'migrations', 'uncommitted']) {
    assert.match(summary, new RegExp(`${field}: unknown \\(offline\\)`))
  }
  assert.doesNotMatch(summary, /\(ok\)|annotated|running/)
})

test('summarize, healthy case', () => {
  const { summary } = summarize({
    branch: 'feat/x',
    account: 'someone',
    ci: 'success',
    alerts: '0',
    containers: ['app'],
    migrations: ['001_a.sql'],
    unannotated: [],
    dirty: '0',
  })
  assert.equal(
    summary,
    'branch: feat/x (not main, ok) | gh: someone (ok) | CI(main): success | alerts: 0 | container: running | migrations: all 1 annotated | uncommitted: 0',
  )
})

test('hookPayload has the SessionStart shape', () => {
  const p = hookPayload('s')
  assert.equal(p.systemMessage, '/start: s')
  assert.equal(p.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(p.hookSpecificOutput.additionalContext, /^Automatic \/start gate ran\. s\. Rules:/)
})

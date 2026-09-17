// Unit tests for the Bash half of the branch guard.
//
// Two halves matter equally here. The blocked cases are the point of the
// guard; the allowed cases are what keeps it switched on. A guard that trips
// on `git status` or `npm ci` gets removed within a day, so every read-only
// command this repo runs routinely has a test asserting it stays allowed.

import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { repoMutations } from './bash-guard.mjs'

const REPO = process.platform === 'win32' ? 'C:\\repo' : '/repo'
const ctx = { repoRoot: REPO, cwd: REPO }

const blocked = (cmd) => repoMutations(cmd, ctx).length > 0

// ---------------------------------------------------------------------------
// Allowed: read-only work has to keep working on main
// ---------------------------------------------------------------------------

for (const cmd of [
  'git status --porcelain',
  'git log --oneline -5',
  'git fetch --quiet origin',
  'git pull',
  'git branch --show-current',
  'git diff --stat',
  'git checkout -b fix/thing',
  'git checkout main',
  'git tag',
  'npm ci',
  'npm install',
  'npm run lint',
  'npm outdated',
  'node scripts/verify.mjs',
  'go build ./...',
  'go mod verify',
  'sed -n "1,5p" file.md',
  'grep -rn "thing" src/',
  'cat package.json',
  'ls backend/migrations/',
]) {
  test(`allows: ${cmd}`, () => {
    assert.equal(blocked(cmd), false, `should not have been blocked: ${cmd}`)
  })
}

// `git merge-base --is-ancestor` is the case that makes the negative lookahead
// in the git pattern necessary. AGENTS.md documents running it, and a naive
// `merge\b` matches it because the hyphen is a word boundary.
test('allows git merge-base, which is a read', () => {
  assert.equal(blocked('git merge-base --is-ancestor abc123 HEAD'), false)
})

test('allows redirecting to /dev/null', () => {
  assert.equal(blocked('golangci-lint run ./... > /dev/null'), false)
})

test('allows a file descriptor redirect', () => {
  assert.equal(blocked('go test ./... 2>&1 | tail -5'), false)
})

test('allows writing outside the repo', () => {
  const outside = process.platform === 'win32' ? 'C:\\temp\\notes.txt' : '/tmp/notes.txt'
  assert.equal(blocked(`echo hi > ${outside}`), false)
})

test('allows writing into node_modules', () => {
  assert.equal(blocked('echo hi > node_modules/.cache/x'), false)
})

test('does not match a command name inside a quoted string', () => {
  assert.equal(blocked('echo "remember to git commit later"'), false)
})

// ---------------------------------------------------------------------------
// Blocked: the mutations that used to pass straight through
// ---------------------------------------------------------------------------

for (const cmd of [
  'git commit -m "fix"',
  'git commit --amend',
  'git push origin main',
  'git merge feature',
  'git rebase main',
  'git cherry-pick abc123',
  'git revert HEAD',
  'git reset --hard origin/main',
  'git restore src/app.ts',
  'git clean -fd',
  'git rm old.ts',
  'git apply patch.diff',
  'go get github.com/pkg/thing',
  'npm install react',
  'npm install --save-dev vitest',
  'npm uninstall lodash',
  'npm update',
]) {
  test(`blocks: ${cmd}`, () => {
    assert.equal(blocked(cmd), true, `should have been blocked: ${cmd}`)
  })
}

test('blocks a git write hidden behind a cd', () => {
  assert.equal(blocked('cd backend && git commit -m "x"'), true)
})

test('blocks a git write after a semicolon', () => {
  assert.equal(blocked('git add -A; git commit -m "x"'), true)
})

test('blocks sed -i', () => {
  assert.equal(blocked('sed -i "s/a/b/" src/app.ts'), true)
})

test('blocks sed -i with a backup suffix', () => {
  assert.equal(blocked('sed -i.bak "s/a/b/" src/app.ts'), true)
})

test('blocks a heredoc into a source file', () => {
  assert.equal(blocked('cat > src/new-file.ts <<EOF\nconst x = 1\nEOF'), true)
})

test('blocks an append into a tracked file', () => {
  assert.equal(blocked('echo "- entry" >> CHANGELOG.md'), true)
})

test('blocks tee into a tracked file', () => {
  assert.equal(blocked('echo hi | tee AGENTS.md'), true)
})

test('blocks git checkout -- which discards changes', () => {
  assert.equal(blocked('git checkout -- src/app.ts'), true)
})

test('names the file it blocked so the reason is actionable', () => {
  const reasons = repoMutations('echo x > CHANGELOG.md', ctx)
  assert.ok(
    reasons.some((r) => r.includes('CHANGELOG.md')),
    `expected a reason naming the file, got: ${JSON.stringify(reasons)}`,
  )
})

// ---------------------------------------------------------------------------
// git push: a tag is not a branch
//
// Branch protection covers `refs/heads/main` and permits a tag push, so
// blocking both made this guard stricter than the server and denied the
// documented release sequence. These two blocks are the whole distinction.
//
// Note what `ctx` means here: REPO does not exist, so any push naming a bare
// ref cannot be resolved and falls to the fail-closed path. That is deliberate
// - it is the behaviour on a machine where git is missing or the cwd has gone,
// and it is what most of these cases assert. The two that need a real ref get
// a real repo further down.
// ---------------------------------------------------------------------------

for (const cmd of [
  'git push origin refs/tags/v1.7.2',
  'git push origin refs/tags/v1.7.2:refs/tags/v1.7.2',
  'git push --tags',
  'git push origin --tags',
  'git push -o ci.skip origin refs/tags/v1.7.2',
  'git tag v1.7.2 && git push origin refs/tags/v1.7.2',
]) {
  test(`allows: ${cmd}`, () => {
    assert.equal(blocked(cmd), false, `should not have been blocked: ${cmd}`)
  })
}

for (const cmd of [
  'git push',
  'git push origin',
  'git push origin HEAD',
  'git push origin feature/x',
  'git push origin refs/heads/main',
  'git push --force origin refs/tags/v1.7.2',
  'git push --force-with-lease origin refs/tags/v1.7.2',
  'git push origin --delete refs/tags/v1.7.2',
  'git push --follow-tags origin refs/tags/v1.7.2',
  'git push --mirror origin',
  'git push origin +refs/tags/v1.7.2',
  'git push origin :refs/tags/v1.7.2',
  'git tag v1.7.2 && git push origin main',
]) {
  test(`blocks: ${cmd}`, () => {
    assert.equal(blocked(cmd), true, `should have been blocked: ${cmd}`)
  })
}

// A redirection ends the arguments without ending the command, so it has to be
// cut off the tail before the tokens are read as refspecs. The first version of
// this shipped without it: every unit test passed, and the real hook then
// blocked `git push origin refs/tags/v1.7.2 2>&1` because `2>` was read as a
// second refspec. These cases are why the fix is trusted now.
for (const cmd of [
  'git push origin refs/tags/v1.7.2 2>&1',
  'git push origin refs/tags/v1.7.2 2>&1 | tail -3',
  'git push origin refs/tags/v1.7.2 > /dev/null',
  'git push --tags 2>&1',
]) {
  test(`allows past a redirection: ${cmd}`, () => {
    assert.equal(blocked(cmd), false, `should not have been blocked: ${cmd}`)
  })
}

// Cutting the redirection off the *push* arguments does not exempt the
// redirection itself: `targetsInsideRepo` still sees it, and a tag push that
// also lands a file in the repo is blocked for the file. The two reason
// sources are independent, and this asserts which one speaks.
test('a tag push redirected into the repo is blocked for the file, not the push', () => {
  const reasons = repoMutations('git push origin refs/tags/v1.7.2 >> push.log', ctx)
  assert.ok(
    reasons.some((r) => r.includes('push.log')),
    `expected a reason naming the file, got: ${JSON.stringify(reasons)}`,
  )
  assert.ok(
    !reasons.some((r) => r.includes('branch ref')),
    `the push itself is a tag push and must not be blamed: ${JSON.stringify(reasons)}`,
  )
})

// The cut must not become a way around the guard.
for (const cmd of [
  'git push origin main 2>&1',
  'git push origin main > /dev/null',
  'git push 2>&1',
  'git push --force origin refs/tags/v1.7.2 2>&1',
  'git push origin main 2>&1 | tail -3',
]) {
  test(`still blocks past a redirection: ${cmd}`, () => {
    assert.equal(blocked(cmd), true, `should have been blocked: ${cmd}`)
  })
}

test('names what the push moves, so the reason is actionable', () => {
  const reasons = repoMutations('git push origin main', ctx)
  assert.ok(
    reasons.some((r) => r.includes('branch ref')),
    `expected a reason naming a branch ref, got: ${JSON.stringify(reasons)}`,
  )
})

// ---------------------------------------------------------------------------
// The pair that needs a real repository
//
// A bare ref is only decidable by resolving it. This is the case a
// `v\d+\.\d+\.\d+` regex gets wrong: `v9.9.9` below is a *branch*, and it has
// to stay blocked while the identically-shaped tag is allowed through.
// ---------------------------------------------------------------------------

function withRepo(run) {
  const dir = mkdtempSync(join(tmpdir(), 'bash-guard-'))
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'] })

  try {
    git('init', '-q')
    git(
      '-c', 'user.email=test@example.com',
      '-c', 'user.name=test',
      'commit', '-q', '--allow-empty', '-m', 'init',
    )
    git('tag', 'v1.7.2')
    git('branch', 'v9.9.9')
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  }
}

test('allows a bare ref that really is a tag', () => {
  withRepo((dir) => {
    const reasons = repoMutations('git push origin v1.7.2', { repoRoot: dir, cwd: dir })
    assert.deepEqual(reasons, [], 'a real tag should push from main')
  })
})

test('blocks a bare ref that is a branch shaped like a version', () => {
  withRepo((dir) => {
    const reasons = repoMutations('git push origin v9.9.9', { repoRoot: dir, cwd: dir })
    assert.ok(reasons.length > 0, 'a branch named like a tag must still be blocked')
  })
})

// ---------------------------------------------------------------------------
// Redirections: only claim a write the guard can actually see
//
// The scan used to be a regex over the raw string, which could not tell a
// redirection from a greater-than inside a quoted argument, and could not tell
// a resolvable path from a variable. Both misfired on ordinary read-only work
// on main: a jq filter comparing dates, and an append to a file outside the
// repo entirely. Neither writes anything.
//
// A guard that denies `gh issue list` is the same failure this file's header
// warns about for `git status`, so these are correctness, not loosening. The
// controls below are the half that must not move.
// ---------------------------------------------------------------------------

for (const cmd of [
  // A `>` inside quotes is never a redirect operator.
  `gh issue list --jq '.[] | select(.closedAt > "2026-09-05")'`,
  `grep -n "a > b" README.md`,
  `echo "GHCR > ACR"`,
  `jq '.items[] | select(.count > 3)' data.json`,
  `git log --format="%h > %s"`,
  // An escaped operator outside quotes is not one either.
  `echo a \\> b`,
  // The shapes actually typed, not idealised ones. An earlier change shipped a defect
  // because its tests used bare commands while every real command carries a
  // redirection or a pipe, so the tests and the code were blind in the same
  // place. These are the literal strings that were denied on 2026-09-05.
  `gh issue list --jq '.[] | select(.closedAt > "2026-09-05")' 2>&1 | tail -5`,
  `grep -n "a > b" README.md 2>&1 | head -3`,
  // The target is a variable or a substitution, so its path is unknowable.
  `cat >> "$MEMORY_FILE"`,
  // Single-quoted: the brace form must stay a shell variable, not a JS one.
  'echo hi > ${OUTFILE}',
  `echo hi > $(mktemp)`,
]) {
  test(`allows: ${cmd}`, () => {
    assert.equal(blocked(cmd), false, `should not have been blocked: ${cmd}`)
  })
}

for (const cmd of [
  // The cases the scan exists for, which must not move.
  `echo "- entry" >> CHANGELOG.md`,
  `echo x > backend/config/config.go`,
  `cat > scripts/verify.mjs <<EOF\nx\nEOF`,
  // A quoted target after a real, unquoted operator. Stripping quoted spans
  // instead of tracking quote state would have dropped this one silently.
  `echo x > "CHANGELOG.md"`,
  `echo x >> 'AGENTS.md'`,
  // A real redirect sitting after an unrelated quoted greater-than.
  `echo "a > b" > CHANGELOG.md`,
]) {
  test(`blocks: ${cmd}`, () => {
    assert.equal(blocked(cmd), true, `should have been blocked: ${cmd}`)
  })
}

test('still names the file when the target was quoted', () => {
  const reasons = repoMutations(`echo x > "CHANGELOG.md"`, ctx)
  assert.ok(
    reasons.some((r) => r.includes('CHANGELOG.md')),
    `expected a reason naming the file, got: ${JSON.stringify(reasons)}`,
  )
})

// ---------------------------------------------------------------------------
// Degenerate input never throws, because a crash in a PreToolUse hook is worse
// than a missed detection.
// ---------------------------------------------------------------------------

for (const value of [undefined, null, '', '   ', 42, {}]) {
  test(`returns empty for degenerate input: ${JSON.stringify(value)}`, () => {
    assert.deepEqual(repoMutations(value, ctx), [])
  })
}

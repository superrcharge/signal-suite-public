// Unit tests for the /ship scope gate.
//
// Both directions matter, for the same reason they do in bash-guard: the skip
// is the point of the gate, and the required cases are what keep it honest.
// A gate that skips the doc checks on a diff that touched a domain is worse
// than no gate, because the audit then reports a clean bill of health it never
// established.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { collectPaths, shipScope } from './ship-scope.mjs'

const skips = (paths) => shipScope(paths).docChecks === 'skip'

// ---------------------------------------------------------------------------
// Skipped: diffs that cannot move any documented fact
// ---------------------------------------------------------------------------

for (const paths of [
  ['backend/go.mod', 'backend/go.sum'],
  ['frontend/package.json', 'frontend/package-lock.json'],
  ['.github/workflows/ci.yml'],
  ['scripts/verify.mjs', 'scripts/lib/ship-scope.mjs'],
  ['frontend/src/components/common/page-banner.tsx'],
  ['backend/internal/middleware/authz.go'],
  [],
]) {
  test(`skips doc checks: ${paths.join(', ') || '(empty diff)'}`, () => {
    assert.equal(skips(paths), true)
  })
}

// ---------------------------------------------------------------------------
// Required: anything that can move a documented fact
// ---------------------------------------------------------------------------

for (const paths of [
  ['backend/internal/domain/terminal/service.go'],
  ['backend/internal/domain/pace/csv.go'],
  ['frontend/src/pages/terminals-page.tsx'],
  ['.claude/context/domains/kit.md'],
  ['.claude/context/structure.md'],
  ['README.md'],
  ['AGENTS.md'],
  ['docs/self-hosting.md'],
  // Mixed: one triggering path among many that do not.
  ['backend/go.mod', 'frontend/package.json', 'backend/internal/domain/net/net.go'],
]) {
  test(`requires doc checks: ${paths.join(', ')}`, () => {
    assert.equal(skips(paths), false)
  })
}

test('names which check each trigger stands in for', () => {
  const { triggers } = shipScope(['backend/internal/domain/kit/kit.go'])
  assert.equal(triggers.length, 1)
  assert.match(triggers[0], /checks 7, 8, 9, 10/)
  assert.match(triggers[0], /backend\/internal\/domain\/kit\/kit\.go/)
})

// ---------------------------------------------------------------------------
// collectPaths
// ---------------------------------------------------------------------------

test('reads committed and uncommitted changes together', () => {
  const paths = collectPaths({
    diffOutput: 'backend/go.mod\nbackend/go.sum\n',
    statusOutput: ' M frontend/package.json\n?? scripts/new-thing.mjs\n',
  })
  assert.deepEqual(paths.sort(), [
    'backend/go.mod',
    'backend/go.sum',
    'frontend/package.json',
    'scripts/new-thing.mjs',
  ])
})

// The case this whole function exists for: /ship audits before it commits, so
// an uncommitted domain edit must still put the doc checks in scope.
test('an uncommitted domain edit is still in scope', () => {
  const paths = collectPaths({
    diffOutput: '',
    statusOutput: ' M backend/internal/domain/service/service.go\n',
  })
  assert.equal(skips(paths), false)
})

test('takes both sides of a rename', () => {
  const paths = collectPaths({
    statusOutput: 'R  backend/internal/domain/old/x.go -> backend/internal/other/x.go\n',
  })
  assert.equal(paths.includes('backend/internal/domain/old/x.go'), true)
  assert.equal(paths.includes('backend/internal/other/x.go'), true)
  assert.equal(skips(paths), false)
})

test('unquotes a path git quoted for spaces', () => {
  const paths = collectPaths({ statusOutput: ' M "frontend/src/pages/my page.tsx"\n' })
  assert.deepEqual(paths, ['frontend/src/pages/my page.tsx'])
})

test('ignores blank lines rather than emitting empty paths', () => {
  const paths = collectPaths({ diffOutput: '\n\nbackend/go.mod\n\n', statusOutput: '\n' })
  assert.deepEqual(paths, ['backend/go.mod'])
})

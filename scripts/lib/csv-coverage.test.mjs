// Unit tests for the CSV import-gate cross-check.
//
// Both directions, and the parse itself. The check compares a frontend
// `writeGate` against the roles its Go import route admits, and it is the check
// whose absence let those two drift apart at once: `equipment` sat behind
// `canWrite` while its route admitted rto, hiding an import an rto could
// perform, while the header dialog read no gate at all and offered a planner
// five datasets the server refuses.
//
// The three negatives below are the failures that were reproduced by hand
// against the real tree before this check was trusted. They are pinned here so
// they stay reproduced.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { auditCsvCoverage, gateRoles, importRouteRoles } from './csv-coverage.mjs'

const AUTH_CONTEXT = `
  const has = (role: Role) => hasRole(user, role);
  const admin = has('admin');
  const editor = has('editor');
  const rto = has('rto');
  return {
    canWrite: admin || editor,
    canWriteRadio: admin || editor || rto,
    canWritePace: admin || editor || rto || has('planner'),
  };
`

// The export and template routes are along for the ride: the surrounding
// coverage audit demands that every path the registry names is registered
// somewhere, so a fixture missing them fails for a reason these tests are not
// about.
const routesGo = (group, roles, handler, path = '/import') => `
package x

func Register(app *fiber.App, handler *Handler) {
	g := app.Group("${group}")
	writer := auth.RequireRole(${roles.map((r) => `"${r}"`).join(', ')})
	g.Post("${path}", writer, handler.${handler})
	g.Get("/import/template", handler.GetImportTemplate)
	app.Get("/api/v1/export/waveforms", handler.Export${handler.slice(6)})
}
`

const registry = (entries) => `
export const CSV_DOMAINS: Record<CsvResource, CsvDomain> = {
${entries
  .map(
    (e) => `  ${e.resource}: {
    resource: '${e.resource}',
    exportPath: '/api/v1/export/${e.resource}',
    templatePath: '/api/v1/waveforms/import/template',
    importPath: '${e.importPath}',
    writeGate: '${e.writeGate}',
  },`,
  )
  .join('\n')}
};
`

/**
 * A minimal repo: one domain with an import, and a registry naming it.
 * `patch` lets each test bend exactly one fact and leave the rest correct, so a
 * red result can only be the fact it bent.
 */
function fixture(patch = {}) {
  const root = mkdtempSync(join(tmpdir(), 'csv-coverage-'))
  const {
    roles = ['admin', 'editor', 'rto'],
    writeGate = 'canWriteRadio',
    routes = routesGo('/api/v1/waveforms', roles, 'ImportWaveforms'),
    importPath = '/api/v1/waveforms/import',
  } = patch

  const domain = join(root, 'backend/internal/domain/waveform')
  mkdirSync(domain, { recursive: true })
  writeFileSync(join(domain, 'routes.go'), routes)
  writeFileSync(
    join(root, 'backend/internal/domain/csv-manifest.json'),
    JSON.stringify({
      domains: { waveform: { export: 'yes', import: 'yes', template: 'yes' } },
    }),
  )

  const csvDir = join(root, 'frontend/src/components/common/csv')
  mkdirSync(csvDir, { recursive: true })
  writeFileSync(
    join(csvDir, 'csv-domains.ts'),
    registry([{ resource: 'waveforms', importPath, writeGate }]),
  )

  const ctxDir = join(root, 'frontend/src/contexts')
  mkdirSync(ctxDir, { recursive: true })
  writeFileSync(join(ctxDir, 'auth-context.tsx'), AUTH_CONTEXT)

  return root
}

const withFixture = (patch, fn) => {
  const root = fixture(patch)
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// The parse. A check that reads the wrong value passes vacuously.
// ---------------------------------------------------------------------------

test('reads the role sets out of auth-context rather than restating them', () => {
  withFixture({}, (root) => {
    assert.deepEqual(gateRoles(root).flags, {
      canWrite: ['admin', 'editor'],
      canWriteRadio: ['admin', 'editor', 'rto'],
      canWritePace: ['admin', 'editor', 'planner', 'rto'],
    })
  })
})

test('resolves a group-relative import route to its full path and roles', () => {
  withFixture({}, (root) => {
    const { byPath, problems } = importRouteRoles(root)
    assert.deepEqual(problems, [])
    assert.deepEqual(byPath.get('/api/v1/waveforms/import'), {
      domain: 'waveform',
      roles: ['admin', 'editor', 'rto'],
    })
  })
})

test('compares a :param path by shape, so a section-scoped import still matches', () => {
  withFixture(
    {
      routes: routesGo(
        '/api/v1/waveforms',
        ['admin', 'editor', 'rto'],
        'ImportWaveforms',
        '/:section/import',
      ),
      importPath: '/api/v1/waveforms/:section/import',
    },
    (root) => {
      assert.equal(auditCsvCoverage(root).ok, true)
    },
  )
})

// ---------------------------------------------------------------------------
// Agreement
// ---------------------------------------------------------------------------

test('passes when the gate admits exactly the roles the route admits', () => {
  withFixture({}, (root) => {
    assert.equal(auditCsvCoverage(root).ok, true)
  })
})

// ---------------------------------------------------------------------------
// The three failures this check exists for
// ---------------------------------------------------------------------------

test('fails when the gate is tighter than the route', () => {
  // The direction that hid an import an rto was allowed to perform.
  withFixture({ writeGate: 'canWrite' }, (root) => {
    const { ok, detail } = auditCsvCoverage(root)
    assert.equal(ok, false)
    assert.match(detail, /waveforms: writeGate "canWrite" admits \[admin, editor\]/)
    assert.match(detail, /gates \/api\/v1\/waveforms\/import to \[admin, editor, rto\]/)
  })
})

test('fails when the gate is looser than the route', () => {
  // The direction that shows a control whose destination 403s.
  withFixture({ writeGate: 'canWritePace' }, (root) => {
    const { ok, detail } = auditCsvCoverage(root)
    assert.equal(ok, false)
    assert.match(detail, /writeGate "canWritePace"/)
  })
})

test('fails when the route changes roles and the gate does not', () => {
  // The drift the old hardcoded-partition test could not see, because it never
  // read anything written in Go.
  withFixture({ roles: ['admin', 'editor', 'rto', 'planner'] }, (root) => {
    assert.equal(auditCsvCoverage(root).ok, false)
  })
})

test('fails on an import route with no role middleware at all', () => {
  withFixture(
    {
      routes: `
package x
func Register(app *fiber.App, handler *Handler) {
	g := app.Group("/api/v1/waveforms")
	g.Post("/import", handler.ImportWaveforms)
	g.Get("/import/template", handler.GetImportTemplate)
	g.Get("/export", handler.ExportWaveforms)
}
`,
    },
    (root) => {
      const { ok, detail } = auditCsvCoverage(root)
      assert.equal(ok, false)
      assert.match(detail, /no role middleware/)
    },
  )
})

test('fails when the registry names an import path nothing registers', () => {
  withFixture({ importPath: '/api/v1/waveforms/upload' }, (root) => {
    const { ok, detail } = auditCsvCoverage(root)
    assert.equal(ok, false)
    assert.match(detail, /no domain\n\s+registers an Import handler on that path/)
  })
})

test('fails when a gate name is not a flag auth-context defines', () => {
  withFixture({ writeGate: 'canWriteEverything' }, (root) => {
    const { ok, detail } = auditCsvCoverage(root)
    assert.equal(ok, false)
    assert.match(detail, /not\n\s+a flag/)
  })
})

test('refuses to guess when a flag is written in terms it cannot read', () => {
  withFixture({}, (root) => {
    writeFileSync(
      join(root, 'frontend/src/contexts/auth-context.tsx'),
      AUTH_CONTEXT.replace('canWriteRadio: admin || editor || rto,', 'canWriteRadio: someHelper(user),'),
    )
    const { ok, detail } = auditCsvCoverage(root)
    assert.equal(ok, false)
    assert.match(detail, /defines no canWriteRadio flag|cannot read/)
  })
})

// Declared-vs-actual CSV coverage across the backend domains.
//
// Shared by scripts/verify.mjs (the gating step) and scripts/check-csv-coverage.mjs
// (the standalone command /ship runs), for the same reason lib/em-dash.mjs is
// shared: two implementations of one rule drift, and both directions of that
// drift are silent.
//
// Nothing here runs Go, npm, or the container. It reads files. The check has to
// be cheap enough that nobody is tempted to skip it, because it gates every Stop.
//
// What it deliberately does NOT check: whether the frontend column list matches
// the backend's. That cannot drift any more - the backend generates
// frontend/src/generated/csv-columns.ts and the frontend imports it, with a Go
// test failing when the committed copy is stale. Checking a thing that is
// already impossible would just be a second place to keep in agreement.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const MANIFEST_REL = 'backend/internal/domain/csv-manifest.json'
const DOMAIN_REL = 'backend/internal/domain'
const STATES = new Set(['yes', 'no', 'deferred'])
const CAPS = ['export', 'import', 'template']

const read = (root, rel) =>
  existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null

// The directory listing is the source of truth for "what domains exist".
// Hardcoding a list here would recreate the omission this check closes.
export function domainDirs(root) {
  return readdirSync(join(root, DOMAIN_REL), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

// Detected, not declared. Handler names are the convention every CSV domain
// already follows: ExportTerminals, ImportKits, GetImportTemplate.
export function detect(root, domain) {
  const src = read(root, `${DOMAIN_REL}/${domain}/routes.go`) ?? ''
  return {
    export: /handler\.Export[A-Z]/.test(src),
    import: /handler\.Import[A-Z]/.test(src),
    template: /handler\.GetImportTemplate\b/.test(src),
  }
}

function newDomainBlock(names) {
  return (
    `  These domains have no entry in ${MANIFEST_REL}:\n\n` +
    names.map((n) => `    ${n}`).join('\n') +
    '\n\n' +
    '    Add one. Use "no" where the answer is a decision, "deferred" where it is\n' +
    '    "not yet" and an issue tracks it:\n\n' +
    `      "${names[0]}": {\n` +
    '        "export": "no",\n' +
    '        "import": "no",\n' +
    '        "template": "no",\n' +
    '        "why": {\n' +
    `          "export": "why nobody downloads a ${names[0]}",\n` +
    '          "import": "...",\n' +
    '          "template": "No import, so nothing to template."\n' +
    '        }\n' +
    '      }'
  )
}

const HEADER =
  'Every domain under backend/internal/domain/ records whether it has a CSV\n' +
  'export, import and import template. There is no default, because the default\n' +
  'is what six domains silently took for eight releases.'

const FOOTER = 'Fix every item above, then run node scripts/verify.mjs again.'

const REGISTRY_REL = 'frontend/src/components/common/csv/csv-domains.ts'

// Every endpoint the frontend registry names, as a literal path.
function registryPaths(root) {
  const src = read(root, REGISTRY_REL)
  if (src === null) return null
  const out = []
  const re = /(exportPath|templatePath|importPath):\s*'([^']+)'/g
  let m
  while ((m = re.exec(src)) !== null) out.push({ field: m[1], path: m[2] })
  return out
}

// Every path any domain registers, as a literal. Fiber paths are built from
// string literals throughout, so reading them is exact rather than approximate.
// Route files outside internal/domain/ that still register API paths the
// frontend names. csvbulk is not a domain - it deliberately lives outside
// internal/domain/ so csv-manifest.json does not demand an entry for it - but
// its routes still have to be visible here, or the bundle endpoints would be the
// one part of the CSV surface this check cannot see.
const EXTRA_ROUTE_FILES = ['backend/internal/csvbulk/routes.go']

function registeredPaths(root) {
  const found = new Set()
  const sources = [
    ...domainDirs(root).map((d) => `${DOMAIN_REL}/${d}/routes.go`),
    ...EXTRA_ROUTE_FILES,
  ]
  for (const rel of sources) {
    const src = read(root, rel)
    if (!src) continue
    const re = /"(\/api\/v1\/[^"]*)"/g
    let m
    while ((m = re.exec(src)) !== null) found.add(m[1])
    // Group-relative registrations: app.Group("/api/v1/x") then g.Get("/y").
    const groups = [...src.matchAll(/Group\("(\/api\/v1\/[^"]*)"\)/g)].map((g) => g[1])
    for (const g of groups) {
      for (const sub of src.matchAll(/\.(?:Get|Post|Patch|Delete)\("([^"]*)"/g)) {
        const tail = sub[1]
        if (tail.startsWith('/api/')) continue
        found.add(tail === '/' ? g : g + tail)
      }
    }
  }
  return found
}

// A registry path with no matching route is a button that 401s or 404s in the
// user's face. That is not hypothetical: an earlier release shipped the Terminals template
// pointing at /api/v1/terminals/import/template while terminal/routes.go only
// registered the legacy /api/v1/import/template. Every test passed, because the
// frontend tests assert which path is *sent* and the backend tests assert what
// is *served* - and nothing compared the two.
function checkRegistryPaths(root) {
  const declared = registryPaths(root)
  if (declared === null) return []

  const registered = registeredPaths(root)
  const problems = []

  for (const { field, path } of declared) {
    // :section is substituted at call time; compare the literal shape.
    const concrete = path.replace(/:[a-zA-Z_]+/g, ':param')
    const match = [...registered].some(
      (r) => r.replace(/:[a-zA-Z_]+/g, ':param') === concrete,
    )
    if (!match) {
      problems.push(
        [
          `  ${REGISTRY_REL} names ${field} ${path}`,
          '    but no domain registers that route. The control it backs will fail',
          '    for the user. Register it, or point the registry at the path that exists.',
        ].join('\n'),
      )
    }
  }
  return problems
}

const AUTH_CONTEXT_REL = 'frontend/src/contexts/auth-context.tsx'

// Paths are compared by shape: :section is substituted at call time.
const shapeOf = (p) => p.replace(/:[a-zA-Z_]+/g, ':param')

/**
 * The roles each CSV write flag admits, read out of auth-context.tsx.
 *
 * Read rather than restated. A table of role lists written here would be a
 * third place the same fact lives, and this check exists precisely because two
 * places holding one fact drift in silence.
 */
export function gateRoles(root) {
  const src = read(root, AUTH_CONTEXT_REL)
  if (src === null) return { error: `${AUTH_CONTEXT_REL} is missing.` }

  // const admin = has('admin')
  const alias = new Map(
    [...src.matchAll(/const (\w+) = has\('(\w+)'\)/g)].map((m) => [m[1], m[2]]),
  )

  const flags = {}
  for (const m of src.matchAll(/\b(canWrite|canWriteRadio|canWritePace):\s*([^,\n]+),/g)) {
    // Skips the interface declaration, where the value is a type.
    if (!/\|\||has\(/.test(m[2])) continue
    const roles = []
    for (const token of m[2].split('||').map((s) => s.trim())) {
      const direct = token.match(/^has\('(\w+)'\)$/)
      if (direct) roles.push(direct[1])
      else if (alias.has(token)) roles.push(alias.get(token))
      else
        return {
          error:
            `${AUTH_CONTEXT_REL}: cannot read "${token}" in the ${m[1]} flag.\n` +
            '    This check reads the flag definitions rather than restating them, so\n' +
            '    it has to understand every term. Teach it the new shape.',
        }
    }
    flags[m[1]] = [...new Set(roles)].sort()
  }

  const missing = ['canWrite', 'canWriteRadio', 'canWritePace'].filter((f) => !flags[f])
  if (missing.length)
    return { error: `${AUTH_CONTEXT_REL} defines no ${missing.join(', ')} flag.` }

  return { flags }
}

/**
 * Every import route the backend registers, by path shape, with the roles its
 * middleware admits.
 *
 * Keyed off the handler name (`handler.ImportKits`) rather than the path, so it
 * does not care that terminals register theirs on a dedicated group and nets
 * register theirs under a `:section`.
 */
export function importRouteRoles(root) {
  const byPath = new Map()
  const problems = []

  for (const domain of domainDirs(root)) {
    const rel = `${DOMAIN_REL}/${domain}/routes.go`
    const src = read(root, rel)
    if (!src) continue

    const roleVars = new Map(
      [...src.matchAll(/(\w+)\s*:=\s*auth\.RequireRole\(([^)]*)\)/g)].map((m) => [
        m[1],
        [...m[2].matchAll(/"(\w+)"/g)].map((r) => r[1]).sort(),
      ]),
    )
    const groups = new Map(
      [...src.matchAll(/(\w+)\s*:=\s*app\.Group\("([^"]*)"\)/g)].map((m) => [m[1], m[2]]),
    )

    const resolve = (recv, tail) => {
      if (recv === 'app') return tail
      const prefix = groups.get(recv)
      if (prefix === undefined) return null
      return tail === '/' ? prefix : prefix + tail
    }

    // With a middleware argument between the path and the handler.
    for (const m of src.matchAll(
      /(\w+)\.Post\("([^"]*)",\s*(\w+),\s*handler\.Import[A-Z]\w*/g,
    )) {
      const [, recv, tail, mw] = m
      const path = resolve(recv, tail)
      const roles = roleVars.get(mw)
      if (path === null || !roles) {
        problems.push(
          `  ${rel} registers an import on ${recv}.Post("${tail}", ${mw}, ...) that this\n` +
            '    check cannot resolve. It reads `x := app.Group("...")` for the prefix and\n' +
            '    `x := auth.RequireRole("...")` for the roles; inline either one and the\n' +
            '    route becomes invisible here.',
        )
        continue
      }
      byPath.set(shapeOf(path), { domain, roles })
    }

    // With none. An ungated import is a finding on its own, not a parse failure.
    for (const m of src.matchAll(/(\w+)\.Post\("([^"]*)",\s*handler\.Import[A-Z]\w*/g)) {
      const path = resolve(m[1], m[2])
      problems.push(
        `  ${rel} registers ${path ?? m[2]} with no role middleware between the path\n` +
          '    and the handler. Any authenticated user can import into that table.',
      )
    }
  }

  return { byPath, problems }
}

/** The registry's import datasets: resource, path and declared gate. */
function registryImportEntries(root) {
  const src = read(root, REGISTRY_REL)
  if (src === null) return null

  const entries = []
  let current = null
  for (const line of src.split('\n')) {
    const open = line.match(/^ {2}([a-z0-9-]+): \{$/)
    if (open) {
      current = { resource: open[1] }
      entries.push(current)
      continue
    }
    if (!current) continue
    const path = line.match(/importPath:\s*'([^']+)'/)
    if (path) current.importPath = path[1]
    const gate = line.match(/writeGate:\s*'([^']+)'/)
    if (gate) current.writeGate = gate[1]
  }
  return entries.filter((e) => e.importPath)
}

/**
 * Does each dataset's `writeGate` admit exactly the roles its import route does?
 *
 * This is the check whose absence let the two CSV surfaces drift apart in both
 * directions at once. `equipment` sat behind `canWrite` while its route admitted
 * rto, so the Settings catalogue hid an import an rto was allowed to perform;
 * meanwhile the header dialog read no gate at all and offered a planner five
 * datasets the server refuses. The frontend half had a test, and that test
 * asserted a hardcoded partition - which cannot notice a role list changing in
 * Go. Nothing compared the two sides, so both were free to be wrong.
 */
function checkImportGates(root) {
  const gates = gateRoles(root)
  if (gates.error) return [`  ${gates.error}`]

  const entries = registryImportEntries(root)
  if (entries === null) return []

  const { byPath, problems } = importRouteRoles(root)
  const out = [...problems]

  for (const { resource, importPath, writeGate } of entries) {
    const admits = gates.flags[writeGate]
    if (!admits) {
      out.push(
        `  ${REGISTRY_REL}: ${resource} declares writeGate "${writeGate}", which is not\n` +
          `    a flag ${AUTH_CONTEXT_REL} defines.`,
      )
      continue
    }

    const route = byPath.get(shapeOf(importPath))
    if (!route) {
      out.push(
        `  ${REGISTRY_REL}: ${resource} imports to ${importPath}, but no domain\n` +
          '    registers an Import handler on that path. Either the path is wrong or the\n' +
          '    route is gone; the control it backs fails in the user\'s face either way.',
      )
      continue
    }

    const same =
      admits.length === route.roles.length && admits.every((r, i) => r === route.roles[i])
    if (!same) {
      out.push(
        `  ${resource}: writeGate "${writeGate}" admits [${admits.join(', ')}], but\n` +
          `    ${route.domain}/routes.go gates ${importPath} to [${route.roles.join(', ')}].\n` +
          '    One of them is wrong. A gate looser than the route shows a control whose\n' +
          '    destination 403s; a gate tighter than the route hides one the user may use.',
      )
    }
  }

  return out
}

/** Returns { ok, detail } in the shape every verify.mjs step returns. */
export function auditCsvCoverage(root) {
  const raw = read(root, MANIFEST_REL)
  if (raw === null) {
    return {
      ok: false,
      detail:
        `${MANIFEST_REL} is missing.\n\n` +
        'It records, per domain, whether that domain has a CSV export, import and\n' +
        'import template. Without it there is no way to tell which omissions were\n' +
        'decisions and which were oversights. Restore it from git history.',
    }
  }

  let manifest
  try {
    manifest = JSON.parse(raw)
  } catch (err) {
    return { ok: false, detail: `${MANIFEST_REL} is not valid JSON:\n  ${err.message}` }
  }

  const declared = manifest.domains ?? {}
  const dirs = domainDirs(root)
  const problems = []

  const undeclared = dirs.filter((d) => !declared[d])
  if (undeclared.length) problems.push(newDomainBlock(undeclared))

  for (const d of Object.keys(declared)) {
    if (!dirs.includes(d)) {
      problems.push(
        `  ${d} has a manifest entry but no directory under ${DOMAIN_REL}/.\n` +
          '    Remove the entry if the domain is gone.',
      )
    }
  }

  for (const d of dirs) {
    const entry = declared[d]
    if (!entry) continue
    const actual = detect(root, d)

    for (const cap of CAPS) {
      const state = entry[cap]

      if (!STATES.has(state)) {
        problems.push(
          `  ${d}.${cap}: ${JSON.stringify(state)} is not "yes", "no" or "deferred".`,
        )
        continue
      }

      if (state === 'yes' && !actual[cap]) {
        problems.push(
          `  ${d}.${cap} is declared "yes" but ${d}/routes.go registers no ${cap} route.`,
        )
      }

      if (state !== 'yes' && actual[cap]) {
        problems.push(
          `  ${d}/routes.go registers a ${cap} route but the manifest says "${state}".\n` +
            `    Change ${d}.${cap} to "yes".`,
        )
      }

      if (state === 'no' && !entry.why?.[cap]) {
        problems.push(
          `  ${d}.${cap} is "no" and needs a why.${cap} saying why this domain skips it.\n` +
            '    A silent omission and a deliberate one look identical without it.',
        )
      }

      if (state === 'deferred' && !/^#\d+/.test(entry.why?.[cap] ?? '')) {
        problems.push(
          `  ${d}.${cap} is "deferred" and needs a why.${cap} starting with the issue\n` +
            '    number tracking it, for example "#214 - ...". Deferred is a parking\n' +
            '    space, not a destination.',
        )
      }
    }

    // A template with no import behind it is a file that leads nowhere: the user
    // fills it in and has nothing to upload it to.
    if (entry.template === 'yes' && entry.import !== 'yes') {
      problems.push(
        `  ${d} has a template but no import. A template exists to be filled in and\n` +
          '    uploaded; without an import it is a dead end.',
      )
    }

    // The reverse is worse: an import with no template leaves the user guessing
    // at the header row.
    if (entry.import === 'yes' && entry.template !== 'yes') {
      problems.push(
        `  ${d} has an import but no template. Nothing tells the user what header\n` +
          '    row the importer expects.',
      )
    }
  }

  problems.push(...checkRegistryPaths(root))
  problems.push(...checkImportGates(root))

  if (problems.length === 0) return { ok: true }
  return { ok: false, detail: `${HEADER}\n\n${problems.join('\n\n')}\n\n${FOOTER}` }
}

#!/usr/bin/env node
// Version-compatibility preflight. Answers, without spending a CI run, the one
// question CI keeps answering the expensive way: do the versions pinned across
// this repo actually agree with each other?
//
// Every check here exists because its absence cost a red CI run. The failures
// were not code failures - the code was fine each time. They were a pin in one
// file disagreeing with a pin in another, discovered six minutes into a job.
//
//   2026-08-27  golangci-lint raised to v2.13.1 while backend/go.mod said
//               1.25.13. v2.13.1 declares go 1.26.0, so `go install` refused:
//               "requires go >= 1.26.0 (running go 1.25.13)". Backend job red.
//   2026-08-27  backend/go.mod raised to a bare 1.26.0 to fix the above. That
//               fixed Backend and broke Security in the same commit: setup-go
//               installs the exact patch from the directive, so govulncheck got
//               the base 1.26 release and reported 21 stdlib CVEs.
//   2026-08-27  a comment edit to ci.yml left a line at column 0. The whole run
//               was a startup failure - zero jobs, no logs, nothing to read.
//
// All three were statically checkable in seconds. None were checked.
//
// This script is deliberately separate from verify.mjs. verify.mjs asks "is the
// code correct"; this asks "is the build even constructible". Running it first
// means a version mismatch surfaces before anything spends time compiling.
//
// Usage: node scripts/preflight-versions.mjs

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repoRoot } from './lib/tree-digest.mjs'

const root = repoRoot()

// Pinned for the same reason every other tool here is pinned: an unpinned
// install is a check that changes with no commit behind it.
const ACTIONLINT = 'github.com/rhysd/actionlint/cmd/actionlint@v1.7.7'

// actionlint shells out to shellcheck and pyflakes for `run:` blocks *when it
// finds them on PATH*, and silently skips them when it does not. That makes its
// result depend on the machine: this check passed on a machine which has
// neither, and failed on the GitHub runner, which has shellcheck - reporting
// SC2086 quoting notes in a deploy workflow nobody had touched.
//
// A preflight whose answer depends on what happens to be installed is the exact
// disease it exists to cure, so both integrations are disabled explicitly rather
// than left to chance. This check is about whether a workflow PARSES and whether
// its Actions schema is valid. Shell style inside a `run:` block is a different
// question, and one that must not be able to fail a build in one place and pass
// in another.
const ACTIONLINT_FLAGS = '-shellcheck= -pyflakes='

function run(cmd, cwd = root) {
  const r = spawnSync(cmd, {
    cwd,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  })
  if (r.error) return { code: 1, out: r.error.message }
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}`.trim() }
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

// "1.26.7" -> [1, 26, 7]. A missing patch reads as 0, which is what makes
// `1.26` and `1.26.0` compare equal - they are the same release.
function parts(v) {
  return String(v)
    .replace(/^v/, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
}

function cmp(a, b) {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

function minorOf(v) {
  const [maj, min] = parts(v)
  return `${maj}.${min}`
}

// ---------------------------------------------------------------------------
// Facts, read once from the files that own them
// ---------------------------------------------------------------------------

const ciYml = read('.github/workflows/ci.yml')
const securityYml = read('.github/workflows/security.yml')
const dockerfileDev = read('backend/Dockerfile.dev')
const goMod = read('backend/go.mod')
const pkgJson = JSON.parse(read('frontend/package.json'))

const goDirective = goMod.match(/^go\s+(\d+\.\d+(?:\.\d+)?)/m)?.[1]

const lintPinCi = ciYml.match(/golangci-lint\/v2\/cmd\/golangci-lint@(v[\d.]+)/)?.[1]
const lintPinDocker = dockerfileDev.match(
  /golangci-lint\/v2\/cmd\/golangci-lint@(v[\d.]+)/,
)?.[1]

const baseImageGo = dockerfileDev.match(/^FROM\s+golang:(\d+\.\d+(?:\.\d+)?)/m)?.[1]

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkWorkflowsParse() {
  const r = run(`go run ${ACTIONLINT} ${ACTIONLINT_FLAGS}`)
  if (r.code === 0) return { ok: true, detail: 'all workflows parse and validate' }
  return {
    ok: false,
    detail:
      'actionlint rejected a workflow. A YAML error here is not a failing job,\n' +
      'it is a startup failure: zero jobs, no logs, and a PR that waits forever.\n\n' +
      r.out,
  }
}

function checkLintPinsAgree() {
  if (!lintPinCi || !lintPinDocker) {
    return {
      ok: false,
      detail:
        'could not read the golangci-lint pin from both files\n' +
        `  .github/workflows/ci.yml   ${lintPinCi ?? 'NOT FOUND'}\n` +
        `  backend/Dockerfile.dev     ${lintPinDocker ?? 'NOT FOUND'}`,
    }
  }
  if (lintPinCi !== lintPinDocker) {
    return {
      ok: false,
      detail:
        'CI and the dev container run different golangci-lint versions, so a\n' +
        'finding can appear in one and not the other.\n' +
        `  .github/workflows/ci.yml   ${lintPinCi}\n` +
        `  backend/Dockerfile.dev     ${lintPinDocker}`,
    }
  }
  return { ok: true, detail: `both pin ${lintPinCi}` }
}

function checkLintPinInstallable() {
  if (!lintPinCi || !goDirective) {
    return { ok: false, detail: 'missing golangci-lint pin or go directive' }
  }
  const r = run(
    `go list -m -f "{{.GoVersion}}" github.com/golangci/golangci-lint/v2@${lintPinCi}`,
    join(root, 'backend'),
  )
  if (r.code !== 0) {
    return {
      ok: false,
      detail: `could not resolve ${lintPinCi} from the module proxy:\n${r.out}`,
    }
  }
  const declared = r.out.split('\n').pop().trim()
  if (cmp(declared, goDirective) > 0) {
    return {
      ok: false,
      detail:
        `golangci-lint ${lintPinCi} declares go ${declared}, but backend/go.mod\n` +
        `says ${goDirective}. CI installs the linter with the Go it resolves from\n` +
        'go.mod, so this fails the Backend job at the install step with\n' +
        `  "requires go >= ${declared} (running go ${goDirective}; GOTOOLCHAIN=local)"\n\n` +
        'Raise backend/go.mod first, then the pin. Never the reverse.',
    }
  }
  return { ok: true, detail: `${lintPinCi} declares go ${declared} <= ${goDirective}` }
}

function checkGoDirectiveIsCurrentPatch() {
  if (!goDirective) return { ok: false, detail: 'no go directive in backend/go.mod' }

  const minor = minorOf(goDirective)
  const r = run('go list -m -versions golang.org/toolchain', join(root, 'backend'))
  if (r.code !== 0) {
    return { ok: false, detail: `could not list toolchain versions:\n${r.out}` }
  }

  const escaped = minor.replace('.', '\\.')
  const found = [...r.out.matchAll(new RegExp(`go${escaped}\\.(\\d+)`, 'g'))].map((m) =>
    Number.parseInt(m[1], 10),
  )
  if (found.length === 0) {
    return { ok: false, detail: `no go${minor}.x toolchain releases found upstream` }
  }

  const newest = `${minor}.${Math.max(...found)}`
  if (cmp(goDirective, newest) < 0) {
    return {
      ok: false,
      detail:
        `backend/go.mod says go ${goDirective}; the newest ${minor} patch is ${newest}.\n\n` +
        'This is a security check, not a currency preference. Both the Backend and\n' +
        'Security jobs resolve their toolchain with `go-version-file: backend/go.mod`,\n' +
        'and setup-go installs the EXACT patch named there. An out-of-date patch\n' +
        'therefore hands govulncheck a stdlib carrying every CVE fixed since, and the\n' +
        'Security job fails on findings in code this repo never wrote.\n\n' +
        `Fix: set the directive to ${newest}.`,
    }
  }
  return { ok: true, detail: `go ${goDirective} is the newest ${minor} patch` }
}

function checkContainerGoCoversModule() {
  if (!baseImageGo || !goDirective) {
    return { ok: false, detail: 'could not read base image Go or go directive' }
  }
  if (cmp(baseImageGo, goDirective) < 0) {
    return {
      ok: false,
      detail:
        `backend/Dockerfile.dev is on golang:${baseImageGo}, below the go.mod\n` +
        `directive of ${goDirective}. golangci-lint is built from source inside that\n` +
        'image, and it refuses to run when the Go that built it is lower than the\n' +
        'directive it analyzes - so the container lint step is lost entirely while CI\n' +
        'stays green.',
    }
  }
  return { ok: true, detail: `golang:${baseImageGo} >= go ${goDirective}` }
}

function checkNodeVersions() {
  const engines = pkgJson.engines?.node
  if (!engines) return { ok: true, detail: 'no engines.node declared, nothing to match' }

  const floor = parts(engines.replace(/[^\d.]/g, ''))[0]
  const pinned = [...ciYml.matchAll(/node-version:\s*['"]?(\d+)/g)].map((m) => m[1])
  if (pinned.length === 0) return { ok: true, detail: 'no node-version pins in ci.yml' }

  const bad = pinned.filter((v) => Number.parseInt(v, 10) < floor)
  if (bad.length > 0) {
    return {
      ok: false,
      detail:
        `frontend/package.json requires node ${engines}, but ci.yml pins ${bad.join(', ')}`,
    }
  }
  const unique = [...new Set(pinned)]
  return { ok: true, detail: `ci.yml node ${unique.join(', ')} satisfies ${engines}` }
}

function checkPostgresVersions() {
  // The Postgres major is pinned in three places that must agree: the CI
  // service container, the dev compose stack, and the self-hosted compose
  // stack. A migration that passes CI can otherwise fail on the server people
  // actually run.
  const ciPg = ciYml.match(/image:\s*postgres:(\d+)/)?.[1]
  const pins = [['ci.yml', ciPg]]
  for (const file of ['compose.yaml', 'compose.selfhost.yaml']) {
    try {
      pins.push([file, read(file).match(/image:\s*postgres:(\d+)/)?.[1]])
    } catch {
      // A compose file may legitimately be absent; only present ones are compared.
    }
  }
  const named = pins.filter(([, v]) => v)
  if (named.length < 2) {
    return { ok: true, detail: 'fewer than two postgres pins to compare' }
  }
  const versions = new Set(named.map(([, v]) => v))
  if (versions.size > 1) {
    return {
      ok: false,
      detail:
        named.map(([f, v]) => `${f} runs postgres:${v}`).join(', ') +
        '.\nA migration that passes CI can then fail on the server people run.',
    }
  }
  return { ok: true, detail: `${named.map(([f]) => f).join(', ')} all on postgres ${ciPg}` }
}

function checkNoFloatingPins() {
  const hits = []
  for (const [name, src] of [
    ['ci.yml', ciYml],
    ['security.yml', securityYml],
    ['Dockerfile.dev', dockerfileDev],
  ]) {
    for (const line of src.split('\n')) {
      if (line.includes('@latest') && !line.trim().startsWith('#')) {
        hits.push(`  ${name}: ${line.trim()}`)
      }
    }
  }
  if (hits.length > 0) {
    return {
      ok: false,
      detail:
        'an unpinned @latest install is a build that changes with no commit behind\n' +
        'it. This is what broke the Backend job during the v1.0.0 ship.\n\n' +
        hits.join('\n'),
    }
  }
  return { ok: true, detail: 'every tool install is pinned' }
}

// Not a build breaker, which is exactly why it drifts. `actions/checkout` sat at
// v6 in one job and v7 in six others for weeks: harmless until the day the two
// majors differ on something that matters, and then it is a job-specific bug
// with no obvious cause. Cheap to hold flat, so hold it flat.
function checkActionVersionsAgree() {
  const seen = new Map()
  for (const file of readdirSync(join(root, '.github', 'workflows'))) {
    if (!/\.ya?ml$/.test(file)) continue
    const src = read(`.github/workflows/${file}`)
    for (const m of src.matchAll(/uses:\s*(actions\/[a-z-]+)@(v\d+)/g)) {
      if (!seen.has(m[1])) seen.set(m[1], new Set())
      seen.get(m[1]).add(m[2])
    }
  }
  const split = [...seen.entries()].filter(([, vs]) => vs.size > 1)
  if (split.length > 0) {
    return {
      ok: false,
      detail:
        'the same action is pinned to different majors across workflows:\n' +
        split.map(([a, vs]) => `  ${a}: ${[...vs].sort().join(', ')}`).join('\n'),
    }
  }
  return { ok: true, detail: `${seen.size} actions, each on one major` }
}

// ---------------------------------------------------------------------------
// Release-only checks (--release)
// ---------------------------------------------------------------------------

// The release sequence puts the CHANGELOG entry in the PR and the tag on the
// merge commit afterwards, which leaves two ways to get the version wrong that
// nothing else notices: tag a version the CHANGELOG never described, or tag one
// that already exists. Both are quiet, and both are only visible later, as a
// release that deployed something other than what its notes claim.
function releaseChecks() {
  const changelog = read('CHANGELOG.md')
  const top = changelog.match(/^## (v\d+\.\d+\.\d+)\s+-\s+(\d{4}-\d{2}-\d{2})/m)
  const tags = run('git tag --list "v*"').out.split('\n').map((t) => t.trim()).filter(Boolean)

  const out = []

  if (!top) {
    out.push([
      'changelog has a released section',
      { ok: false, detail: 'no `## vX.Y.Z - YYYY-MM-DD` heading found in CHANGELOG.md' },
    ])
    return out
  }
  const version = top[1]

  out.push([
    'changelog top section',
    { ok: true, detail: `${version} dated ${top[2]}` },
  ])

  out.push([
    'version not already tagged',
    tags.includes(version)
      ? {
          ok: false,
          detail:
            `${version} is already a tag, but it is still the top CHANGELOG section.\n` +
            'Either the entry needs a new version number, or this release already shipped.',
        }
      : { ok: true, detail: `${version} is unclaimed` },
  ])

  const sorted = tags.sort(cmp)
  const latest = sorted[sorted.length - 1]
  if (latest) {
    out.push([
      'version increments the latest tag',
      cmp(version, latest) > 0
        ? { ok: true, detail: `${latest} -> ${version}` }
        : {
            ok: false,
            detail: `latest tag is ${latest}, but the CHANGELOG top section is ${version}.`,
          },
    ])
  }

  return out
}

function checkTypescriptPeerRange() {
  const ts = pkgJson.devDependencies?.typescript ?? pkgJson.dependencies?.typescript
  if (!ts) return { ok: true, detail: 'typescript not a direct dependency' }

  const r = run(
    'npm view @typescript-eslint/eslint-plugin peerDependencies.typescript',
    join(root, 'frontend'),
  )
  if (r.code !== 0) {
    return { ok: false, detail: `could not read the peer range from npm:\n${r.out}` }
  }
  const range = r.out.trim()
  const ceiling = range.match(/<\s*(\d+\.\d+\.\d+)/)?.[1]
  const installed = ts.replace(/^[\^~]/, '')

  if (!ceiling) {
    return { ok: true, detail: `peer range "${range}" has no upper bound to enforce` }
  }
  if (cmp(installed, ceiling) >= 0) {
    return {
      ok: false,
      detail:
        `typescript ${installed} is at or above @typescript-eslint's ceiling of\n` +
        `${ceiling} (peer range "${range}"). Type-aware linting cannot resolve.`,
    }
  }
  return { ok: true, detail: `typescript ${installed} satisfies "${range}"` }
}

// The local shim at frontend/src/test/jest-dom-matchers.d.ts exists because
// @testing-library/jest-dom augments vitest's Assertion at the wrong arity:
// jest-dom declares `Assertion<T>` while vitest 5 declares
// `Assertion<R, T>`, and TypeScript will not merge two declarations of one
// interface that disagree on type-parameter count. The effect is silent -
// every matcher drops off the type of expect(...) - so the shim redeclares the
// merge at vitest's arity.
//
// A shim is a bet that upstream will fix it, and a bet nobody checks is how a
// workaround becomes permanent. This check settles the bet on every run: the
// moment jest-dom ships a two-parameter augmentation the shim is redundant, and
// leaving two competing declarations in the tree is its own breakage. It fails
// asking for the file to be deleted rather than quietly letting it rot.
function checkJestDomShimStillNeeded() {
  const shim = join(root, 'frontend/src/test/jest-dom-matchers.d.ts')
  const augmentation = join(
    root,
    'frontend/node_modules/@testing-library/jest-dom/types/vitest.d.ts',
  )

  const shimPresent = existsSync(shim)
  if (!existsSync(augmentation)) {
    return {
      ok: true,
      detail: 'jest-dom types not installed, nothing to compare',
    }
  }

  // Read the type-parameter list of the Assertion interface jest-dom declares.
  const src = readFileSync(augmentation, 'utf8')
  const decl = src.match(/interface\s+Assertion\s*<([^>]*)>/)
  if (!decl) {
    return {
      ok: true,
      detail: 'jest-dom no longer augments Assertion, nothing to compare',
    }
  }
  const params = decl[1].split(',').filter((x) => x.trim()).length
  const jestDomVersion = JSON.parse(
    readFileSync(
      join(root, 'frontend/node_modules/@testing-library/jest-dom/package.json'),
      'utf8',
    ),
  ).version

  if (params >= 2 && shimPresent) {
    return {
      ok: false,
      detail:
        `@testing-library/jest-dom ${jestDomVersion} now augments Assertion with\n` +
        `${params} type parameters, so it matches vitest and the shim is redundant.\n` +
        `Delete frontend/src/test/jest-dom-matchers.d.ts - leaving it in place\n` +
        `means two competing declarations of the same interface.`,
    }
  }
  if (params < 2 && !shimPresent) {
    return {
      ok: false,
      detail:
        `@testing-library/jest-dom ${jestDomVersion} augments Assertion with only\n` +
        `${params} type parameter, which does not merge with vitest's two. Without\n` +
        `frontend/src/test/jest-dom-matchers.d.ts every jest-dom matcher drops off\n` +
        `the type of expect(...) and the typecheck fails in ~1000 places.`,
    }
  }
  return {
    ok: true,
    detail: shimPresent
      ? `jest-dom ${jestDomVersion} still augments Assertion<T> at ${params} param, shim required`
      : `jest-dom ${jestDomVersion} augments Assertion at ${params} params, no shim needed`,
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

// mise.toml pins the toolchain for anyone who uses mise, and until now nothing
// in the repo read it. On 2026-09-10 the root file said go 1.25.13 while
// backend/go.mod said 1.26.8 - a full minor behind, sitting in a file whose own
// comment claims "preflight-versions.mjs owns that number". It did not. Anyone
// running `mise install` got a toolchain that cannot build the module, and the
// only reason it was ever caught was a human happening to read the file during
// unrelated diagram work. That is not a control.
//
// The go pin is checked for equality, not compatibility. The directive is also
// CI's toolchain pin - setup-go installs the exact patch it names - so "close
// enough" means a mise user compiles against a different stdlib than the one
// Security scans, which is the 21-CVE failure recorded at the top of this file.
//
// The typst half applies the `no floating tool pins` rule to the renderer. An
// unpinned typst rewrites every SVG in diagrams/ with no content change behind
// it, which is a 155KB diff nobody can review.
function checkMisePins() {
  const notes = []
  const problems = []

  const rootMise = join(root, 'mise.toml')
  if (existsSync(rootMise)) {
    const src = readFileSync(rootMise, 'utf8')
    const go = src.match(/^\s*go\s*=\s*["']([^"']+)["']/m)?.[1]
    const node = src.match(/^\s*node\s*=\s*["']([^"']+)["']/m)?.[1]

    if (go && goDirective) {
      if (go === goDirective) notes.push(`mise.toml go ${go} matches go.mod`)
      else {
        problems.push(
          `mise.toml pins go ${go}, but backend/go.mod says ${goDirective}.\n` +
            `  Equal, not merely compatible: the directive is CI's toolchain pin, so a\n` +
            `  mise user would build against a different stdlib than Security scans.`,
        )
      }
    }

    if (node) {
      const ciNode = [...new Set([...ciYml.matchAll(/node-version:\s*['"]?(\d+)/g)].map((m) => m[1]))]
      if (ciNode.length === 0 || ciNode.includes(node.split('.')[0])) {
        notes.push(`node ${node} matches ci.yml`)
      } else {
        problems.push(`mise.toml pins node ${node}, but ci.yml pins ${ciNode.join(', ')}`)
      }
    }
  } else {
    notes.push('no root mise.toml')
  }

  const diagMise = join(root, 'diagrams/mise.toml')
  if (existsSync(diagMise)) {
    const typst = readFileSync(diagMise, 'utf8').match(/^\s*typst\s*=\s*["']([^"']+)["']/m)?.[1]
    if (!typst) problems.push('diagrams/mise.toml declares no typst version to pin')
    else if (!/^\d+\.\d+\.\d+$/.test(typst)) {
      problems.push(
        `diagrams/mise.toml pins typst "${typst}", which is not an exact version.\n` +
          `  An unpinned renderer rewrites every SVG with no content change behind it.`,
      )
    } else notes.push(`typst ${typst} pinned exactly`)
  }

  if (problems.length > 0) return { ok: false, detail: problems.join('\n') }
  return { ok: true, detail: notes.join(', ') }
}

const STEPS = [
  ['workflows parse', checkWorkflowsParse],
  ['golangci-lint pins agree', checkLintPinsAgree],
  ['golangci-lint pin installable', checkLintPinInstallable],
  ['go directive is a current patch', checkGoDirectiveIsCurrentPatch],
  ['container Go covers the module', checkContainerGoCoversModule],
  ['node version agrees', checkNodeVersions],
  ['postgres version agrees', checkPostgresVersions],
  ['no floating tool pins', checkNoFloatingPins],
  ['mise pins agree', checkMisePins],
  ['action versions agree', checkActionVersionsAgree],
  ['typescript peer range', checkTypescriptPeerRange],
  ['jest-dom shim still needed', checkJestDomShimStillNeeded],
]

// releaseChecks resolves its results eagerly, so wrap each one to match the
// thunk shape the runner below expects.
if (process.argv.includes('--release')) {
  STEPS.push(...releaseChecks().map(([name, result]) => [name, () => result]))
}

console.log(`preflight: ${STEPS.length} version checks\n`)

const failures = []
for (const [name, fn] of STEPS) {
  process.stdout.write(`  ${name} ... `)
  let result
  try {
    result = fn()
  } catch (err) {
    result = { ok: false, detail: err?.stack ?? String(err) }
  }
  if (result.ok) {
    console.log(`pass  (${result.detail})`)
  } else {
    console.log('FAIL')
    failures.push([name, result.detail])
  }
}

if (failures.length > 0) {
  for (const [name, detail] of failures) {
    console.error(`\n${'-'.repeat(70)}\n${name}\n${'-'.repeat(70)}\n${detail}`)
  }
  console.error(`\npreflight: FAILED ${failures.length} of ${STEPS.length}.`)
  process.exit(1)
}

console.log(`\npreflight: PASSED all ${STEPS.length} checks.`)

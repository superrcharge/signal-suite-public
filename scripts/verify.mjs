#!/usr/bin/env node
// The single verification command. One invocation, one exit code.
//
// Everything in the AGENTS.md "Verification before pushing" section runs here,
// plus the four traps listed beneath it. It exists so an executor cannot
// paraphrase a list of five commands into four, and cannot substitute a
// cheaper check for a real one - the failure mode AGENTS.md calls out by name
// ("never substitute go build as a lint proxy").
//
// Two things it deliberately does differently from .git/hooks/pre-push, which
// it replaces as the source of truth:
//
//   1. A missing golangci-lint is a FAILURE, never a skip. The old hook
//      printed "skipping" and let the push through, which is the same
//      linted-nothing-and-reported-nothing bug its own comment warns about.
//   2. Backend checks prefer the dev container, matching /ship and CI. The old
//      hook ran them host-side, so two paths existed for one check.
//
// The first step shells out to scripts/preflight-versions.mjs, which compares
// the version pins across go.mod, the workflows, the dev container Dockerfile
// and package.json, and validates the workflow YAML. It runs first because it
// is the only step that compiles nothing: a build that is not constructible
// should say so in seconds rather than after a full frontend typecheck.
//
// Change-scoped checks (debug leftovers, em dashes) inspect only lines added
// against the merge base with main. They gate the change, not the repo, so an
// executor is never blocked by debt it did not create.
//
// On success it writes .claude/.verify-receipt.json, which the Stop hook
// (scripts/verify-gate.mjs) reads to tell verified work from a model
// that simply said it was done.
//
// Usage: node scripts/verify.mjs
//        node scripts/verify.mjs --reuse-receipt
//
// --reuse-receipt is for the pre-push hook and nothing else. It runs the two
// steps that compile nothing and then, if the receipt on disk still describes
// this exact tree, exits 0 without repeating the other thirteen.
//
// It exists because the hook called this script unconditionally while the Stop
// gate had already forced a full passing run moments earlier, on a tree that
// had not changed in between. The digest is over file content rather than HEAD,
// so committing does not invalidate it, which means the ordinary
// verify -> commit -> push sequence paid the full 2m13s twice, every time. A
// gate that expensive is one people start passing --no-verify to, and the hook
// helpfully prints that flag in its own failure message.
//
// The two steps that always run are not an optimisation detail, they are the
// correctness of the whole idea: preflight-versions.mjs queries the network
// (`go list -m -versions golang.org/toolchain`), so "go directive is a current
// patch" can flip from pass to fail with NO tree change at all, the moment Go
// ships a patch release. A receipt is a statement about a tree and must never
// be allowed to vouch for that. Everything else it does vouch for, because
// every other step is a pure function of the files it read.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  EM_DASH,
  GUIDANCE,
  formatHits,
  parseAddedLines,
  shouldSkip,
  violations,
} from './lib/em-dash.mjs'
import { auditCsvCoverage } from './lib/csv-coverage.mjs'
import { receiptDecision } from './lib/receipt.mjs'
import { mergeBaseWithMain, repoRoot, treeDigest } from './lib/tree-digest.mjs'

const root = repoRoot()
const frontend = join(root, 'frontend')
const RECEIPT = join(root, '.claude', '.verify-receipt.json')

const REUSE_RECEIPT = process.argv.includes('--reuse-receipt')

// The steps a receipt cannot speak for, because their answer depends on the
// network rather than only on the tree. Named rather than indexed so that
// reordering STEPS cannot silently change which ones always run.
const ALWAYS_RUN = ['version preflight', 'doc agreement']

// shell:true throughout: npm and npx are .cmd shims on Windows and only
// resolve through a shell. Every command string here is a literal in this
// file, so nothing user-supplied reaches the shell.
function run(cmd, cwd) {
  const r = spawnSync(cmd, {
    cwd,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  })
  if (r.error) return { code: 1, out: r.error.message }

  const out = `${r.stdout || ''}${r.stderr || ''}`
  const code = r.status ?? 1

  // A step that dies before it can report looks exactly like a step that ran
  // and found problems: both arrive here as a non-zero code carrying whatever
  // partial output existed. That ambiguity cost a real debugging session. The
  // frontend test step failed having printed only vitest's banner, and there
  // was nothing in the report to say whether that was a test failure or a
  // process that never got far enough to have an opinion.
  //
  // POSIX answers this with r.signal. Windows does not: spawnSync reports
  // signal null for every abnormal end, so a killed child is status 1 and an
  // aborted one is 134, indistinguishable from a tool's own exit code. What
  // does survive on both is the raw code, and the codes above 0x40000000 are
  // Windows NTSTATUS crashes rather than anything a CLI chose to return.
  if (code === 0) return { code, out }

  const notes = []
  if (r.signal) notes.push(`Killed by ${r.signal} before it finished.`)
  else if (code > 0x4000_0000) {
    notes.push(`Exit code ${code} (0x${code.toString(16)}) is a Windows crash status, not a tool's verdict.`)
  }
  if (notes.length === 0) return { code, out: `${out}\n\n(exit code ${code})` }

  return {
    code,
    out:
      `${out}\n\n${notes.join('\n')}\n` +
      'Nothing above got far enough to be a verdict, so this is not evidence of a\n' +
      'real failure. Re-run the step on its own before treating it as one.',
  }
}

// A step's `detail` is conventionally a string. Accept an array of lines too,
// because that is the shape everyone reaches for first and the cost of getting
// it wrong was a stack trace instead of the failure message.
function formatDetail(detail) {
  if (Array.isArray(detail)) return detail.join('\n').trim()
  if (typeof detail === 'string') return detail.trim()
  if (detail == null) return ''
  return String(detail).trim()
}

function git(args) {
  const r = run(`git ${args}`, root)
  if (r.code !== 0) throw new Error(`git ${args} failed:\n${r.out}`)
  return r.out
}

// ---------------------------------------------------------------------------
// Base ref for the change-scoped checks
// ---------------------------------------------------------------------------

// Shared with the Stop gate so both scope "the change" identically.
const mergeBase = () => mergeBaseWithMain(root)

// Added lines across the whole change: committed on this branch AND still
// sitting in the working tree. `git diff <base>` covers both, which is what an
// executor needs mid-branch, since it has not committed yet when it runs this.
function addedLines(base) {
  return parseAddedLines(git(`diff -U0 --diff-filter=ACM ${base}`))
}

// ---------------------------------------------------------------------------
// Backend runner selection
// ---------------------------------------------------------------------------

function pickBackendRunner() {
  // VERIFY_BACKEND=host skips the container probe. The dev container mounts
  // ONE checkout, so verifying any other tree (a worktree, a second clone)
  // through it would lint the wrong code and report green.
  const forceHost = process.env.VERIFY_BACKEND === 'host'
  const probe = forceHost
    ? { code: 1, out: '' }
    : run('podman exec app sh -c "cd /app && echo VERIFY_CONTAINER_OK"', root)
  if (probe.code === 0 && probe.out.includes('VERIFY_CONTAINER_OK')) {
    return {
      kind: 'container (podman exec app)',
      exec: (cmd) => run(`podman exec app sh -c "cd /app && ${cmd}"`, root),
    }
  }
  const hasLint = run('golangci-lint --version', root).code === 0
  const hasGo = run('go version', root).code === 0
  if (hasLint && hasGo) {
    return { kind: 'host toolchain', exec: (cmd) => run(cmd, join(root, 'backend')) }
  }
  return {
    kind: null,
    why:
      'No way to run the backend checks.\n' +
      "  container: 'podman exec app' did not respond\n" +
      `  host:      go ${hasGo ? 'found' : 'NOT on PATH'}, ` +
      `golangci-lint ${hasLint ? 'found' : 'NOT on PATH'}\n\n` +
      'This is a failure, not a skip. Start the dev container (see .claude/commands/dev.md)\n' +
      "or install the toolchain. Do not substitute 'go build' as a lint proxy.",
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const backend = pickBackendRunner()

function backendStep(cmd) {
  return () => {
    if (!backend.kind) return { ok: false, detail: backend.why }
    const r = backend.exec(cmd)
    return { ok: r.code === 0, detail: r.out }
  }
}

// `verdict` is a marker the tool prints only once it has actually finished and
// reached a conclusion. Exit codes alone cannot tell a real failure from a run
// that died early, because Windows reports both as a bare non-zero (see run()).
// A non-zero with the marker absent means the tool never got to a verdict, and
// saying so is the difference between "your tests are broken" and "re-run it".
function frontendStep(cmd, verdict) {
  return () => {
    const r = run(cmd, frontend)
    if (r.code === 0) return { ok: true, detail: r.out }
    if (verdict && !verdict.test(r.out)) {
      return {
        ok: false,
        detail:
          `${r.out}\n\n` +
          `The command failed without ever printing its result line (${String(verdict)}).\n` +
          'It did not finish, so this is not a verdict on the code. Re-run this step\n' +
          'on its own. If it passes, the first run died early rather than finding a\n' +
          'real problem - frontend/vitest.config.ts has a note on the worker-teardown\n' +
          'flake this repo has already hit once.',
      }
    }
    return { ok: false, detail: r.out }
  }
}

// Patterns lifted from .claude/commands/ship.md step 5 so the two agree.
// console.error inside error-boundary.tsx is intentional and is not a hit.
const FRONTEND_DEBUG = /console\.log|console\.error|\bTODO\b|\bFIXME\b|\bdebugger\b/
const BACKEND_DEBUG = /fmt\.Println|log\.Println|\bTODO\b|\bFIXME\b/

function inScopeFrontend(p) {
  return p.startsWith('frontend/src/') && /\.tsx?$/.test(p) && !p.includes('.test.')
}

function inScopeBackend(p) {
  return p.startsWith('backend/internal/') && p.endsWith('.go') && !p.endsWith('_test.go')
}

function checkDebugLeftovers() {
  const base = mergeBase()
  if (!base) {
    return { ok: false, detail: 'Could not resolve a merge base against origin/main or main.' }
  }
  const hits = []
  for (const [file, lines] of addedLines(base)) {
    const isFe = inScopeFrontend(file)
    const isBe = inScopeBackend(file)
    if (!isFe && !isBe) continue
    const re = isFe ? FRONTEND_DEBUG : BACKEND_DEBUG
    for (const l of lines) {
      if (!re.test(l.text)) continue
      if (file.endsWith('error-boundary.tsx') && /console\.error/.test(l.text)) continue
      hits.push(`  ${file}:${l.n}  ${l.text.trim().slice(0, 100)}`)
    }
  }
  if (hits.length === 0) return { ok: true }
  return {
    ok: false,
    detail:
      `Debug leftovers in lines this change adds:\n${hits.join('\n')}\n\n` +
      'Remove them. Only added lines are in scope, so pre-existing hits elsewhere\n' +
      'in the same file are not yours to sweep up.',
  }
}

function checkEmDash() {
  const base = mergeBase()
  if (!base) {
    return { ok: false, detail: 'Could not resolve a merge base against origin/main or main.' }
  }
  const report = []
  let total = 0
  for (const [file, lines] of addedLines(base)) {
    if (shouldSkip(file)) continue
    const hits = violations(lines)
    if (hits.length === 0) continue
    total += hits.length
    report.push(formatHits(file, hits))
  }
  if (total === 0) return { ok: true }
  return {
    ok: false,
    detail:
      `The project style rule forbids the em dash (${EM_DASH}). ` +
      `${total} added line${total === 1 ? '' : 's'} contain one:\n` +
      `${report.join('\n')}\n\n${GUIDANCE}`,
  }
}

function checkMigrations() {
  const dir = join(root, 'backend', 'migrations')
  if (!existsSync(dir)) return { ok: true }

  const tracked = run('git ls-files backend/migrations', root).out
  // Untracked new migrations count too: they are the ones about to be added.
  const untracked = run('git ls-files --others --exclude-standard backend/migrations', root).out

  const sqlFiles = [...tracked.split('\n'), ...untracked.split('\n')]
    .map((f) => f.trim())
    .filter((f) => f.endsWith('.sql'))

  const missing = []
  for (const rel of [...new Set(sqlFiles)]) {
    const abs = join(root, rel)
    if (!existsSync(abs)) continue
    const first = readFileSync(abs, 'utf8').split('\n')[0].trim()
    if (!first.startsWith('-- +goose Up')) missing.push(rel)
  }
  if (missing.length === 0) return { ok: true }
  return {
    ok: false,
    detail:
      'Goose refuses to parse a migration without its annotation, and the CI\n' +
      "migration step fails on it. Add '-- +goose Up' as the first line of:\n" +
      missing.map((m) => `  ${m}`).join('\n'),
  }
}

// The CI trap AGENTS.md names: MainLayout renders the sidebar and header, so
// any hook they pull from @/services must appear in every closed @/services
// mock of a test that renders MainLayout. The hook list is read from the
// layout sources at runtime, never hardcoded - that is what makes this catch a
// hook added tomorrow.
function layoutServiceHooks() {
  const names = new Set()
  for (const rel of [
    'frontend/src/components/layouts/sidebar.tsx',
    'frontend/src/components/layouts/header.tsx',
  ]) {
    const abs = join(root, rel)
    if (!existsSync(abs)) continue
    const src = readFileSync(abs, 'utf8')
    const m = src.match(/import\s*\{([^}]*)\}\s*from\s*'@\/services'/)
    if (!m) continue
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim()
      if (name) names.add(name)
    }
  }
  return [...names]
}

/**
 * Whether a test file renders something that mounts MainLayout.
 *
 * This used to be `src.includes('MainLayout')` on the test file itself, which
 * matched prose: every one of the five files it caught mentioned MainLayout only
 * in a comment. Three page tests that genuinely render the layout - PACE editor,
 * PACE index, PACE section - were skipped because nobody had written that
 * sentence in them, and a test file that merely names MainLayout while rendering
 * a bare component was failed for hooks it never calls.
 *
 * Every test here imports its subject by a relative path, so one hop of
 * resolution answers the real question: does the component under test render the
 * layout.
 */
function rendersLayout(testAbs, src) {
  const dir = dirname(testAbs)
  for (const m of src.matchAll(/from\s+'(\.[^']*)'/g)) {
    for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
      const candidate = join(dir, m[1] + ext)
      if (!existsSync(candidate)) continue
      if (readFileSync(candidate, 'utf8').includes('<MainLayout')) return true
      break
    }
  }
  return false
}

function checkServiceMocks() {
  const required = layoutServiceHooks()
  if (required.length === 0) {
    return { ok: false, detail: 'Could not read any @/services import from the layout sources.' }
  }
  const testFiles = run('git ls-files frontend/src', root)
    .out.split('\n')
    .map((f) => f.trim())
    .filter((f) => /\.test\.tsx?$/.test(f))

  const problems = []
  for (const rel of testFiles) {
    const abs = join(root, rel)
    if (!existsSync(abs)) continue
    const src = readFileSync(abs, 'utf8')
    if (!src.includes("vi.mock('@/services'")) continue
    if (src.includes('importOriginal')) continue // open mock, nothing to miss
    if (!rendersLayout(abs, src)) continue
    const missing = required.filter((h) => !src.includes(h))
    if (missing.length) problems.push(`  ${rel}\n    missing: ${missing.join(', ')}`)
  }
  if (problems.length === 0) return { ok: true }
  return {
    ok: false,
    detail:
      'MainLayout renders the sidebar and header, so these hooks must be stubbed in\n' +
      `every closed @/services mock of a test that renders it. Required: ${required.join(', ')}\n\n` +
      `${problems.join('\n')}\n\n` +
      'CI fails on this without a useful message. Add the stubs.',
  }
}

// Go module currency.
//
// The frontend has had a currency gate for a long time: /ship runs `npm
// outdated` by hand every push. The backend had nothing, and Dependabot version
// updates were never configured, so the only signal was the repo's Dependabot
// ALERTS - which report vulnerabilities, not staleness, and correctly read zero
// the whole time. Eight modules drifted behind with every gate reporting green.
//
// Indirect modules are excluded: they move when a direct dependency decides they
// move, so listing them here would be noise nobody can action.
//
// HOLD is for a module deliberately pinned behind latest. An entry needs a
// reason, because "we meant to" and "nobody noticed" look identical in a diff
// eighteen months later, which is the whole failure this step exists to stop.
// Empty on purpose. Fiber lived here while it sat on v3.3.0, and was taken to
// v3.5.0 on its own PR once backend/internal/middleware/authz_test.go
// had grown the route-gating coverage the hold was waiting for - the eight
// tests from TestRequireRole through TestExportRoutesAreAuthOnly, which pin
// every route's auth requirement rather than trusting the framework's group
// prefix matching.
//
// It is removed rather than left in place now that it is current, because a
// hold does not mean "review this carefully" - it means "do not report this as
// behind". Leaving a caught-up module here would make the next fiber release
// invisible to this check, which is the opposite of what the entry was for.
//
// The careful-review intent still holds and lives where it belongs: the
// fiber is bumped on its own, never in a grouped patch bump, so it always
// arrives as its own reviewable change.
const GO_MODULE_HOLDS = {}

// Runs first, and deliberately so. Every other step here compiles or executes
// something; this one only reads pins and compares them, so it is the cheapest
// possible way to learn that the build is not constructible. Three red CI runs
// on 2026-08-27 were all version disagreements that cost six minutes each to
// discover and would have cost two seconds here.
//
// It is a separate script rather than more steps in this file because it
// answers a different question - "do the pins agree", not "is the code correct"
// - and because /ship and CI both need to run it on its own.
function checkVersionPreflight() {
  const r = run(`node "${join(root, 'scripts', 'preflight-versions.mjs')}"`, root)
  return { ok: r.code === 0, detail: r.out }
}

// The prose half of the same idea. A sentence claiming CI runs five jobs, or
// that a workflow takes a -f flag it does not declare, is as wrong as a bad
// pin and as cheap to check - and unlike a pin, nothing else in this file
// looks at it. Sits beside the version preflight because it also compiles
// nothing.
function checkDocs() {
  const r = run(`node "${join(root, 'scripts', 'check-docs.mjs')}"`, root)
  return { ok: r.code === 0, detail: r.out }
}

// The third member of that family, for the frontend's page framework. A page
// that restates a token, or ships with no heading at all, makes a claim about
// the design system exactly the way a stale pin makes one about the build -
// and until this existed, nothing looked. Reads source only, so a receipt can
// speak for it: it must NOT go in ALWAYS_RUN.
function checkUiTokens() {
  const r = run(`node "${join(root, 'scripts', 'check-ui-tokens.mjs')}"`, root)
  return { ok: r.code === 0, detail: r.out }
}

// Module currency REPORTS, it does not block. That distinction is the whole
// point of this step's current shape, and it was not always this way.
//
// It used to return ok:false on any direct module behind latest, with
// GO_MODULE_HOLDS empty. Read that literally: the moment any upstream author
// anywhere cut a release, this gate went red - on whatever branch happened to
// be checked out, regardless of what it changed. Combined with the Stop hook,
// which refuses to end a turn without a passing receipt, that made "bump a
// dependency" a mandatory precondition for shipping a CSS fix. Dependency
// maintenance sat on the critical path of every single change, and the only
// route off it was a full /ship plus PR plus merge cycle.
//
// Demoting it costs nothing in safety, because the security half is already
// gated somewhere with more authority. `Security Scan` is a REQUIRED status
// check on main (alongside Backend, Frontend, Script tests and Style), and it
// runs Trivy at CRITICAL,HIGH with --exit-code 1 plus govulncheck over ./... on
// every pull request. A Go module with a known vulnerability therefore cannot
// merge, whatever this file says. What this step uniquely saw was the other
// case - a module merely behind latest with nothing wrong with it - which is a
// maintenance signal, not a correctness fact, and bumping it is a routine
// change rather than a blocker.
//
// So: drift is printed, loudly, every run. It just does not stop the work.
// A genuinely unsafe version is somebody else's job, and that somebody has a
// required check.
function checkGoModules() {
  if (run('go version', root).code !== 0) {
    return { ok: false, detail: ['go is not on PATH, so module currency cannot be checked.'] }
  }

  const tmpl = '{{if and .Update (not .Indirect)}}{{.Path}} {{.Version}} {{.Update.Version}}{{end}}'
  const r = run(`go list -u -m -f "${tmpl}" all`, join(root, 'backend'))
  if (r.code !== 0) return { ok: false, detail: r.out.trim() }

  const behind = r.out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [path, cur, next] = l.split(/\s+/)
      return { path, cur, next }
    })
    .filter((m) => !GO_MODULE_HOLDS[m.path])

  if (behind.length === 0) return { ok: true }

  return {
    ok: true,
    warn: [
      `${behind.length} Go module${behind.length === 1 ? '' : 's'} behind latest:`,
      ...behind.map((m) => `  ${m.path}  ${m.cur} -> ${m.next}`),
      '',
      'Bump them when convenient; nothing here is a correctness failure.',
      'bumps once CI is green, so this needs no action from you. To take them',
      'now anyway:',
      `  cd backend && GOTOOLCHAIN=auto go get ${behind.map((m) => `${m.path}@${m.next}`).join(' ')}`,
      '  cd backend && GOTOOLCHAIN=auto go mod tidy',
      '',
      'If one is deliberately held back, add it to GO_MODULE_HOLDS in this file',
      'with the reason. A hold without a reason is indistinguishable from drift.',
    ].join('\n'),
  }
}

// Unit tests for the scripts under scripts/lib/.
//
// These existed and had never once executed: no runner referenced them, in CI,
// here, or in any package.json, and there is no root package.json to hold a
// test script. Four tests that looked like coverage and were not. The gate they
// cover is the em dash detector, which is itself the thing that stops a
// violation reaching a user, so an unrun test there is worse than none.
//
// The glob is quoted deliberately. A bare directory makes node treat the path
// as a module to import and fail with MODULE_NOT_FOUND, and an unquoted glob is
// expanded by the shell - which does not happen under cmd on Windows, where
// run() sends this. Quoted, node does its own expansion and both agree.
function checkScriptTests() {
  const r = run('node --test "scripts/lib/**/*.test.mjs"', root)
  if (r.code === 0) return { ok: true }
  return { ok: false, detail: r.out.trim() }
}

// CSV coverage, plus the generated-manifest staleness check.
//
// The staleness check has to run on the HOST specifically. The dev container
// bind-mounts ./backend and nothing else, so the frontend tree is not there and
// the Go test correctly skips itself - which means the backend test step cannot
// be relied on to catch it whenever the container is up, and the container is
// the runner this script prefers. Running it here, against the real tree, is
// what keeps the check from quietly not happening.
function checkCsvCoverage() {
  const declared = auditCsvCoverage(root)
  if (!declared.ok) return declared

  const hasGo = run('go version', root).code === 0
  if (!hasGo) {
    return {
      ok: false,
      detail: [
        'go is not on PATH, so the generated frontend column manifest cannot be',
        'checked for staleness. That check is the only thing standing between a',
        'backend column change and a picker that silently disagrees with it.',
        '',
        'Install Go, or run the check wherever Go is available:',
        '',
        '  cd backend && go test ./internal/csvregistry',
      ].join('\n'),
    }
  }

  // -v because a skipped test is indistinguishable from a passing one otherwise:
  // plain `go test` prints "ok" for both, which is precisely the ambiguity this
  // step exists to remove.
  const r = run(
    'go test -count=1 -v -run TestGeneratedColumnsAreCurrent ./internal/csvregistry',
    join(root, 'backend'),
  )
  if (r.code === 0 && !/--- SKIP/.test(r.out)) return { ok: true }
  if (r.code === 0) {
    return {
      ok: false,
      detail: [
        'The generated-manifest check skipped on the host, where it should always',
        'have a frontend tree to compare against:',
        '',
        r.out,
      ].join('\n'),
    }
  }
  return { ok: false, detail: r.out }
}

/**
 * The built bundle's chunk graph must be acyclic.
 *
 * A cyclic chunk graph builds cleanly, type-checks, lints, passes every test and
 * serves a 200 with valid HTML, and then renders a blank white screen. That
 * shipped in an earlier release. This is the only step here that inspects build OUTPUT
 * rather than source, which is exactly why nothing else could see it.
 */
function checkBundleGraph() {
  const r = run('node scripts/check-bundle.mjs', root)
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  if (r.code === 0) {
    return { ok: true, detail: output.split('\n').filter(Boolean).pop() ?? 'no cycles' }
  }
  return { ok: false, detail: output }
}

const STEPS = [
  ['version preflight', checkVersionPreflight],
  ['doc agreement', checkDocs],
  ['ui tokens', checkUiTokens],
  ['frontend typecheck', frontendStep('npm run typecheck')],
  ['frontend lint', frontendStep('npm run lint')],
  // vitest prints this summary line on every completed run, passing or failing.
  // Its absence means the run did not complete, whatever the exit code says.
  ['frontend tests', frontendStep('npm run test -- --run', /^\s*Test Files\s/m)],
  ['backend lint', backendStep('golangci-lint run ./...')],
  ['backend build', backendStep('go build ./...')],
  // -count=1 disables the test cache. A gate that accepts a cached pass is not
  // verifying anything, and Go's cache does not track every input: the generated
  // frontend column manifest is read by a test but lives outside the module, so
  // editing it left the staleness check reporting "(cached) ok" against a file
  // it had never looked at.
  ['backend tests', backendStep('go test -count=1 ./...')],
  ['debug leftovers', checkDebugLeftovers],
  ['script unit tests', checkScriptTests],
  ['go module currency', checkGoModules],
  ['em dash gate', checkEmDash],
  ['migration annotations', checkMigrations],
  ['service mock coverage', checkServiceMocks],
  ['csv coverage', checkCsvCoverage],
  // Last, because it is the only step that needs a production build.
  ['bundle graph', checkBundleGraph],
]

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

// A name in ALWAYS_RUN that no longer matches a step would silently reduce the
// reuse path to running NOTHING, and it would still exit 0. Rename a step
// without this and the hook goes quietly hollow, which is precisely the
// "linted nothing and reported nothing" failure the header of this file exists
// to complain about.
const unknownAlways = ALWAYS_RUN.filter((name) => !STEPS.some(([s]) => s === name))
if (unknownAlways.length) {
  console.error(`verify: ALWAYS_RUN names no such step: ${unknownAlways.join(', ')}`)
  console.error('Fix the list in this file. It must name real steps or the reuse path checks nothing.')
  process.exit(1)
}

// Read before anything removes it.
let priorReceipt = null
if (REUSE_RECEIPT) {
  try {
    priorReceipt = JSON.parse(readFileSync(RECEIPT, 'utf8'))
  } catch {
    priorReceipt = null // absent or malformed; receiptDecision refuses either way
  }
}

let currentDigest = null
try {
  currentDigest = treeDigest(root)
} catch {
  currentDigest = null // refused rather than assumed; a tree we cannot read is not a tree we verified
}

const decision = REUSE_RECEIPT
  ? receiptDecision(priorReceipt, currentDigest)
  : { reuse: false, reason: 'full run' }

const stepsToRun = decision.reuse ? STEPS.filter(([name]) => ALWAYS_RUN.includes(name)) : STEPS

// Removed up front so a failed run can never leave a passing receipt behind,
// even for a tree whose digest has not changed since the last good run.
// Skipped when reusing, because the receipt being honoured is the one on disk
// and rewriting it would replace the timestamp of the run that actually did the
// work with the timestamp of the run that trusted it.
if (!decision.reuse) rmSync(RECEIPT, { force: true })

if (decision.reuse) {
  console.log(`verify: reusing a receipt (${decision.reason})`)
  console.log(`        running ${stepsToRun.length} of ${STEPS.length} steps: the ones a receipt cannot vouch for\n`)
} else {
  if (REUSE_RECEIPT) console.log(`verify: full run (${decision.reason})`)
  console.log(`verify: ${STEPS.length} steps, backend via ${backend.kind ?? 'NOTHING AVAILABLE'}\n`)
}

const passed = []

// A step may pass and still have something to say, by returning `warn` beside
// ok:true. Collected rather than printed inline so the run keeps its one-line-
// per-step shape, then replayed in full at the end where it cannot scroll away
// above two minutes of later output.
//
// The reason a warning channel exists at all: without one, every check in this
// file had exactly two options, block the push or say nothing. Steps that
// report a maintenance signal rather than a defect were therefore forced to
// pick "block", which is how module currency came to stop unrelated work. A
// third outcome is what lets a check be honest about severity.
const warnings = []

for (const [name, fn] of stepsToRun) {
  process.stdout.write(`  ${name} ... `)
  let result
  try {
    result = fn()
  } catch (err) {
    result = { ok: false, detail: err.message }
  }
  if (!result.ok) {
    console.log('FAIL\n')
    console.error(`FAILED STEP: ${name}\n`)
    // Normalised rather than assumed to be a string. A step returning an array
    // of lines, which reads as the obvious shape, used to crash this line with
    // "detail.trim is not a function" - so the step correctly detected a real
    // failure and the reporter died before printing what it was, leaving a
    // stack trace where the diagnosis should be. Two steps shipped that way.
    console.error(formatDetail(result.detail))
    console.error(`\nverify: FAILED at "${name}". ${passed.length} step(s) passed before it.`)
    // Also removed on the reuse path, where it was deliberately left in place.
    // A receipt that survives a failure is a receipt the Stop gate will accept,
    // so a failing preflight would otherwise still let a turn end clean.
    rmSync(RECEIPT, { force: true })
    console.error('No receipt written. Fix the cause, then run this command again.')
    process.exit(1)
  }
  if (result.warn) {
    console.log('pass (with notes)')
    warnings.push([name, formatDetail(result.warn)])
  } else {
    console.log('pass')
  }
  passed.push(name)
}

if (decision.reuse) {
  console.log(`\nverify: PASSED. ${passed.length} step(s) run now, the other ${STEPS.length - passed.length} covered by the receipt on disk.`)
  console.log(`        ${decision.reason}`)
  process.exit(0)
}

writeFileSync(
  RECEIPT,
  `${JSON.stringify(
    {
      digest: treeDigest(root),
      timestamp: new Date().toISOString(),
      backend: backend.kind,
      steps: passed,
      // Recorded so a receipt says what the run actually saw, not merely that
      // it ended well. A warning that exists only in scrollback is a warning
      // nothing can be asked about later.
      warnings: warnings.map(([name]) => name),
    },
    null,
    2,
  )}\n`,
)

for (const [name, detail] of warnings) {
  console.log(`\n--- note from "${name}" ---`)
  console.log(detail)
}

const noteCount = warnings.length
  ? ` ${warnings.length} step${warnings.length === 1 ? '' : 's'} left notes above.`
  : ''
console.log(`\nverify: PASSED all ${passed.length} steps. Receipt written.${noteCount}`)
process.exit(0)

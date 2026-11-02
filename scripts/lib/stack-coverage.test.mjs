// Unit tests for the docs/stack.md coverage reader.
//
// Both directions, for the reason every guard here has them: a parser that
// misses a name lets a component vanish from the inventory silently, and one
// that reads a nested key or an indirect module as a component fails a push
// over a page that was never wrong. The snippets mirror the real shapes of
// backend/go.mod, frontend/package.json and the compose files.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  checkStackCoverage,
  codeSpans,
  composeServiceNames,
  goDirectRequires,
  missingFromStack,
  npmPackageNames,
  workflowFileNames,
} from './stack-coverage.mjs'

// ---------------------------------------------------------------------------
// go.mod
// ---------------------------------------------------------------------------

const GO_MOD = `module backend

go 1.99.1

require (
\tgithub.com/gofiber/fiber/v3 v3.0.0
\tgithub.com/jackc/pgx/v5 v5.0.0 // a trailing comment that is not indirect
\t// github.com/commented/out v1.0.0
)

require (
\tgithub.com/valyala/fasthttp v1.0.0 // indirect
\tgolang.org/x/crypto v0.0.0 // indirect
)

require github.com/google/uuid v1.0.0

require golang.org/x/sync v0.0.0 // indirect

replace (
\tgithub.com/replaced/mod v1.0.0 => ../local
)

replace github.com/other/mod => ../other
`

test('go.mod: reads block and single-line direct requires', () => {
  assert.deepEqual(goDirectRequires(GO_MOD), [
    'github.com/gofiber/fiber/v3',
    'github.com/google/uuid',
    'github.com/jackc/pgx/v5',
  ])
})

test('go.mod: skips indirect, commented-out and replace entries', () => {
  const got = goDirectRequires(GO_MOD)
  for (const name of [
    'github.com/valyala/fasthttp',
    'golang.org/x/crypto',
    'golang.org/x/sync',
    'github.com/commented/out',
    'github.com/replaced/mod',
    'github.com/other/mod',
  ]) {
    assert.ok(!got.includes(name), `${name} must not be read as a direct require`)
  }
})

test('go.mod: CRLF line endings read the same', () => {
  assert.deepEqual(goDirectRequires(GO_MOD.replace(/\n/g, '\r\n')), goDirectRequires(GO_MOD))
})

test('go.mod: a module with no requires yields nothing', () => {
  assert.deepEqual(goDirectRequires('module backend\n\ngo 1.99\n'), [])
})

// ---------------------------------------------------------------------------
// package.json
// ---------------------------------------------------------------------------

const PACKAGE_JSON = JSON.stringify({
  name: 'tau-frontend',
  scripts: { dev: 'vite' },
  dependencies: { react: '^1.0.0', '@mui/material': '^1.0.0' },
  devDependencies: { vitest: '^1.0.0', '@types/react': '^1.0.0' },
  overrides: { esbuild: '>=0.0.0' },
  engines: { node: '>=1' },
})

test('package.json: reads dependencies and devDependencies', () => {
  assert.deepEqual(npmPackageNames(PACKAGE_JSON), ['@mui/material', '@types/react', 'react', 'vitest'])
})

test('package.json: ignores overrides, scripts and engines', () => {
  const got = npmPackageNames(PACKAGE_JSON)
  for (const name of ['esbuild', 'dev', 'node']) assert.ok(!got.includes(name))
})

test('package.json: either section may be absent', () => {
  assert.deepEqual(npmPackageNames('{"dependencies":{"a":"1"}}'), ['a'])
  assert.deepEqual(npmPackageNames('{}'), [])
})

// ---------------------------------------------------------------------------
// workflow listing
// ---------------------------------------------------------------------------

test('workflows: keeps .yml and .yaml, drops the README', () => {
  assert.deepEqual(workflowFileNames(['release.yml', 'README.md', 'ci.yml', 'x.yaml']), [
    'ci.yml',
    'release.yml',
    'x.yaml',
  ])
})

test('workflows: accepts paths as well as bare names', () => {
  assert.deepEqual(workflowFileNames(['.github/workflows/ci.yml', '.github\\workflows\\a.yml']), [
    'a.yml',
    'ci.yml',
  ])
})

// ---------------------------------------------------------------------------
// compose
// ---------------------------------------------------------------------------

// The shape of compose.yaml: nested keys several levels deep, a second
// top-level block (volumes, networks) whose keys must not be read as services.
const COMPOSE_BASE = `services:
  app:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: app
    environment:
      - SERVER_PORT=3001
      # a comment at the child indent: not a service
    depends_on:
      postgresql:
        condition: service_healthy
    networks:
      - app-network

  postgresql:
    image: postgres:99-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]

volumes:
  postgresql-data:

networks:
  app-network:
    driver: bridge
`

// The shape of compose.dev.yaml: a header comment, a comment line at the
// service indent, and a service whose container_name differs from its key.
const COMPOSE_DEV = `# Development Docker Compose Override
# Usage: docker compose -f compose.yaml -f compose.dev.yaml up --build

services:
  app:
    build:
      context: ./backend

  # Frontend dev server with hot reloading
  frontend:
    container_name: frontend-dev
    volumes:
      - ./frontend:/app

volumes:
  go-modules:
`

test('compose: reads only the keys directly under services', () => {
  assert.deepEqual(composeServiceNames(COMPOSE_BASE), ['app', 'postgresql'])
  assert.deepEqual(composeServiceNames(COMPOSE_DEV), ['app', 'frontend'])
})

test('compose: never reads nested keys, container names or other blocks', () => {
  const got = [...composeServiceNames(COMPOSE_BASE), ...composeServiceNames(COMPOSE_DEV)]
  for (const name of [
    'build',
    'depends_on',
    'condition',
    'healthcheck',
    'postgresql-data',
    'app-network',
    'go-modules',
    'frontend-dev',
  ]) {
    assert.ok(!got.includes(name), `${name} must not be read as a service`)
  }
})

test('compose: handles four-space indent, quoted keys and CRLF', () => {
  const text = 'services:\r\n    "web":\r\n        image: x\r\n    worker: {}\r\n'
  assert.deepEqual(composeServiceNames(text), ['web', 'worker'])
})

test('compose: a file with no services block yields nothing', () => {
  assert.deepEqual(composeServiceNames('volumes:\n  data:\n'), [])
})

// ---------------------------------------------------------------------------
// the backtick rule
// ---------------------------------------------------------------------------

test('backticks: a bare mention in prose does not count', () => {
  const md = 'The react app talks to the frontend service over ci.yml.\n'
  assert.deepEqual(missingFromStack(md, ['react', 'frontend', 'ci.yml']), ['react', 'frontend', 'ci.yml'])
})

test('backticks: an exact backticked name counts', () => {
  const md = '| `react` | UI | ... |\nRuns in `frontend` and `ci.yml`.\n'
  assert.deepEqual(missingFromStack(md, ['react', 'frontend', 'ci.yml']), [])
})

test('backticks: a span that merely contains the name does not count', () => {
  const md = 'See `@types/react`, `frontend-dev` and `react-dom`.\n'
  assert.deepEqual(missingFromStack(md, ['react', 'frontend']), ['react', 'frontend'])
})

test('backticks: an allowed path prefix counts, other paths do not', () => {
  const md = 'See `.github/workflows/ci.yml` and `docs/release.yml`.\n'
  assert.deepEqual(
    missingFromStack(md, ['ci.yml', 'release.yml'], { prefixes: ['.github/workflows/'] }),
    ['release.yml'],
  )
})

test('backticks: a name only inside a fenced block does not count', () => {
  const md = 'Intro.\n\n```bash\npodman compose up `app`\n```\n'
  assert.deepEqual(missingFromStack(md, ['app']), ['app'])
  assert.ok(!codeSpans(md).has('app'))
})

// ---------------------------------------------------------------------------
// the whole check
// ---------------------------------------------------------------------------

const FULL_STACK_MD = [
  '| `github.com/gofiber/fiber/v3` | `github.com/jackc/pgx/v5` | `github.com/google/uuid` |',
  '| `react` | `@mui/material` | `vitest` | `@types/react` |',
  '| `ci.yml` | `.github/workflows/release.yml` |',
  '| `app` | `postgresql` | `frontend` |',
].join('\n')

const input = (stackMd) => ({
  goMod: GO_MOD,
  packageJson: PACKAGE_JSON,
  workflowFiles: ['ci.yml', 'release.yml', 'README.md'],
  composeTexts: [COMPOSE_BASE, COMPOSE_DEV],
  stackMd,
})

test('full check: a complete page reports nothing missing, and counts each kind', () => {
  const r = checkStackCoverage(input(FULL_STACK_MD))
  assert.deepEqual(r.missing, [])
  assert.deepEqual(r.counted, { go: 3, npm: 4, workflows: 2, compose: 3 })
})

test('full check: removing one mention of each kind reports exactly those', () => {
  const md = FULL_STACK_MD.replace('`github.com/google/uuid`', 'uuid')
    .replace('`vitest`', 'vitest')
    .replace('`.github/workflows/release.yml`', 'release.yml')
    .replace('`frontend`', 'frontend')
  assert.deepEqual(checkStackCoverage(input(md)).missing, [
    { kind: 'go module', name: 'github.com/google/uuid' },
    { kind: 'npm package', name: 'vitest' },
    { kind: 'workflow', name: 'release.yml' },
    { kind: 'compose service', name: 'frontend' },
  ])
})

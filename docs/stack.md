# Stack

This page is the inventory of every component that makes up the Asset Tracker, each with a one-line description of what it is and what it does here.
It is written so a successor, human or model, can see the whole system at a glance before opening any code.

It names components and never versions.
Versions live in the files that pin them: [`backend/go.mod`](../backend/go.mod), [`frontend/package.json`](../frontend/package.json), [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), the `Dockerfile*` files, [`mise.toml`](../mise.toml) and [`diagrams/mise.toml`](../diagrams/mise.toml).
A version typed here would be one more copy to drift, which is what this page replaced.

`scripts/check-docs.mjs` fails when a direct Go module, an npm dependency, a workflow file or a compose service is missing from this page.
A name counts as present only when it appears in backticks, exactly as it is spelled in the file that declares it, so a word that happens to occur in prose does not satisfy the check.
The parsing lives in `scripts/lib/stack-coverage.mjs`.

## How it fits together

**Request path.**
A browser reaches one Go container listening on `:3001`, usually behind whatever TLS-terminating proxy the host provides.
That one process serves the REST API under `/api/v1`, the built SPA from `/app/static`, the health probes and the OpenAPI docs.
It connects to PostgreSQL with a password by default, and reads and writes equipment photos and PACE emblems in Azure Blob Storage only when that is configured.
There is no gateway, cache, search engine or second service.
See [system architecture](../diagrams/system-architecture-light.svg) and the [data model](../diagrams/data-model-light.svg).

**Development path.**
`podman compose -f compose.yaml -f compose.dev.yaml up` starts three services: `postgresql`, `app` and `frontend`.
The `app` service runs the backend under Air, rebuilding on every Go change, and proxies every non-API path to the Vite dev server in the `frontend` service, whose container is named `frontend-dev`.
The app is opened at `http://localhost:3001`, never at `:5173`, so the browser takes the same single-origin path it takes in production.
[`.claude/commands/dev.md`](../.claude/commands/dev.md) and [`docs/development.md`](./development.md) hold the commands.

**Delivery path.**
A pull request runs `ci.yml`, is squash merged into a protected `main`, and the merge commit is tagged.
The tag triggers `release.yml`, which builds `Dockerfile.prod`, scans the image and pushes it to GHCR.
The image is self-contained, so it can be run anywhere a container runs.
`compose.selfhost.yaml` is the supported way: its `app` service builds `Dockerfile.prod` and its `postgresql` service holds the data, with no sign-in by default and the port bound to the local machine; see [self-hosting](./self-hosting.md).
See the [CI/CD pipeline](../diagrams/cicd-pipeline-light.svg) diagram.

## 1. Runtime and packaging

| Component | What it is | What it does here | Where |
|---|---|---|---|
| `Dockerfile.prod` | The production image definition | Three stages: Node builds the SPA, Go builds a static binary, a distroless image runs it | `Dockerfile.prod` |
| `node` alpine builder | Node base image, build stage only | Runs `npm ci` and `npm run build` to produce `frontend/dist` | `Dockerfile.prod` |
| `golang` alpine builder | Go base image, build stage only | Compiles the backend with `CGO_ENABLED=0` into one static binary | `Dockerfile.prod` |
| `gcr.io/distroless/static-debian12:nonroot` | Distroless runtime base, no shell or package manager | The only image that ships; runs `./main` as the nonroot user | `Dockerfile.prod` |
| Single process | One Fiber server, one binary | Serves API, SPA, probes and docs from one origin on `:3001` | `backend/main.go` |
| Embedded migrations | Goose SQL files compiled in with `go:embed` | Applied at startup before the server listens, so a deploy migrates itself | `backend/migrations/migrate.go` |
| SPA serving | Static file handler with index fallback | Serves `/app/static` and templates the auth config into `index.html` at startup; proxies to Vite in dev | `backend/internal/middleware/frontend.go` |
| `/health` and `/ready` | Unauthenticated probe endpoints | Container health checks probe `/health`; `verify-deploy.mjs` checks both | `backend/internal/middleware/middleware.go` |
| OpenAPI docs | Embedded `openapi.json` plus a bundled Scalar UI | Served at `/api/docs`; a Go test fails on an undocumented route | `backend/docs/` |
| `backend/Dockerfile` | Alpine-based backend-only image | Used by `compose.yaml` alone for a local production-like run, with the SPA bind-mounted | `backend/Dockerfile` |

## 2. Backend

Direct requirements of `backend/go.mod`.
Indirect modules are pulled in by these and are not listed.
CSV reading and writing use the standard library's `encoding/csv` and `archive/zip`, by project rule, with no third-party CSV library.

| Component | What it is | What it does here | Where |
|---|---|---|---|
| `github.com/gofiber/fiber/v3` | HTTP framework on fasthttp | Routing, middleware (request ID, logger, recover, limiter, healthcheck, static) and handlers | `backend/main.go`, `backend/internal/middleware/` |
| `github.com/jackc/pgx/v5` | PostgreSQL driver and connection pool | Every repository's hand-written, parameterized SQL; also the `database/sql` driver for migrations | `backend/internal/infrastructure/database/` |
| `github.com/pressly/goose/v3` | SQL migration runner | Applies `backend/migrations/*.sql` from the embedded filesystem | `backend/migrations/migrate.go` |
| `github.com/coreos/go-oidc/v3` | OIDC discovery and JWT verifier | Verifies Entra bearer tokens in-process against the tenant's JWKS, issuer and audience pinned | `backend/internal/middleware/auth.go` |
| `github.com/go-jose/go-jose/v4` | JOSE and JWT primitives | Underlies go-oidc; required directly because tests sign their own tokens with it | `backend/internal/middleware/auth_issuer_test.go` |
| `github.com/Azure/azure-sdk-for-go/sdk/azcore` | Azure SDK core | Token request policy, used only when Postgres Entra authentication is configured | `backend/internal/infrastructure/database/postgres.go` |
| `github.com/Azure/azure-sdk-for-go/sdk/azidentity` | Azure credential chain | `DefaultAzureCredential`, used only when Entra authentication to Postgres or Blob Storage is configured | `backend/internal/infrastructure/database/`, `backend/internal/blob/` |
| `github.com/Azure/azure-sdk-for-go/sdk/storage/azblob` | Azure Blob Storage client | Uploads, reads and deletes photos and emblems; optional, and unset means photo upload answers 501 | `backend/internal/blob/` |
| `github.com/go-playground/validator/v10` | Struct tag validator | Validates every request body, wrapped by the shared validator | `backend/internal/shared/validator/` |
| `github.com/google/uuid` | UUID generation and parsing | Record identifiers across the domains | `backend/internal/domain/*/` |
| `main.go` | Composition root | Loads config, migrates, opens the pool, wires every domain and starts the server | `backend/main.go` |
| `config` | Environment settings loader | Reads all settings from env vars and refuses an unencrypted database unless explicitly allowed | `backend/config/` |
| `internal/auth` | Auth configuration and user identity types | Holds the Entra authority, audience and mode that the middleware enforces | `backend/internal/auth/` |
| `internal/middleware` | HTTP cross-cutting layer | Security headers, trusted-proxy client key, rate limit, token verification, user sync, role gates, SPA serving | `backend/internal/middleware/` |
| `internal/infrastructure/database` | Connection setup | Builds the pgx pool and migration DSN, password or managed-identity token per connection | `backend/internal/infrastructure/database/` |
| `internal/blob` | Blob client wrapper | One client shared by the equipment photo and PACE emblem stores | `backend/internal/blob/` |
| `internal/shared/csvtable` | CSV column declaration library | One `csvtable.Table` per domain drives export, import template and importer | `backend/internal/shared/csvtable/` |
| `internal/csvregistry` | Registry of every domain's CSV table | Generates `frontend/src/generated/csv-columns.ts`; a test fails when it is stale | `backend/internal/csvregistry/` |
| `internal/csvbulk` | Multi-dataset CSV endpoint | Builds the `.zip` bundle export and templates across domains | `backend/internal/csvbulk/` |
| `internal/shared` (other) | Cross-domain helpers | Response envelope, validator, asset status buckets, and `contracts` interfaces so domains call each other without imports | `backend/internal/shared/` |
| `internal/domain/*` | Business domains, handler to service to repository | One package per domain: user, section, terminal, kit, contract, audit, equipment, waveform, satcomservice, transport, platform, radionet, pace, organization, operation | `backend/internal/domain/` |
| `csv-manifest.json` | Declared CSV capabilities per domain | States export, import and template per domain, checked by `verify.mjs` and CI | `backend/internal/domain/csv-manifest.json` |
| `migrations` | Sequential Goose SQL files | The whole schema history, each file starting with `-- +goose Up` | `backend/migrations/` |

## 3. Frontend

Every package in `frontend/package.json`, runtime first, then development.

| Component | What it is | What it does here | Where |
|---|---|---|---|
| `react` | UI library | Renders the whole SPA | `frontend/src/` |
| `react-dom` | React's DOM renderer | Mounts the app into `#root` | `frontend/src/main.tsx` |
| `react-router` | Client-side router | Declares routes, lazy loads pages, guards protected routes | `frontend/src/routes/` |
| `@tanstack/react-query` | Server-state cache | Every API read and mutation goes through a query hook | `frontend/src/services/` |
| `@mui/material` | Component library | Layout, tables, dialogs, drawers and form controls | `frontend/src/components/`, `frontend/src/pages/` |
| `@mui/icons-material` | Material icon set | Icons across the header, sidebar and pages | `frontend/src/components/` |
| `@emotion/react` | CSS-in-JS engine | Styling engine under MUI and the `sx` prop | `frontend/src/theme/` |
| `@emotion/styled` | Emotion's styled API | Required peer of MUI's styled components | `frontend/src/theme/` |
| `@azure/msal-browser` | Microsoft Authentication Library for the browser | Signs users in to Entra ID and acquires API tokens | `frontend/src/auth/msal-config.ts` |
| `@azure/msal-react` | React bindings for MSAL | Provides the MSAL instance and auth state to components | `frontend/src/contexts/auth-context.tsx` |
| `react-hook-form` | Form state library | Editor and drawer forms, with field-level validation | `frontend/src/components/shf-form/`, `frontend/src/pages/` |
| `html-to-image` | DOM to image rasterizer | Turns printable sheets into PNGs for export and the slide writer | `frontend/src/components/common/sheet-export/rasterize.ts` |
| `react-easy-crop` | Image crop widget | Crops equipment photos before upload | `frontend/src/components/common/photo-crop-modal.tsx` |
| `elkjs` | Eclipse Layout Kernel in JavaScript (EPL-2.0) | Compound graph layout with orthogonal edge routing and label placement for the operation phase picture; loaded on first use, in a chunk of its own | `frontend/src/components/operations/phase-layout.ts` |
| `vite` | Dev server and bundler | Serves the SPA with hot reload in dev and builds `dist` for production | `frontend/vite.config.ts` |
| `@vitejs/plugin-react` | Vite plugin for React | JSX transform and fast refresh | `frontend/vite.config.ts` |
| `typescript` | Type checker and compiler | Strict type checking via `npm run typecheck` | `frontend/tsconfig.json` |
| `@types/react` | React type definitions | Types for React in strict mode | `frontend/package.json` |
| `@types/react-dom` | React DOM type definitions | Types for the DOM renderer | `frontend/package.json` |
| `vitest` | Unit test runner | Runs every frontend test | `frontend/vitest.config.ts` |
| `@vitest/ui` | Browser UI for Vitest | `npm run test:ui` for interactive test runs | `frontend/package.json` |
| `@vitest/coverage-v8` | V8 coverage provider | `npm run test:coverage` | `frontend/vitest.config.ts` |
| `playwright` | Browser automation library | Drives the installed Chrome for the demo walkthrough; dev only, no browser download | `scripts/demo-operation-walkthrough.mjs` |
| `jsdom` | DOM implementation for Node | The test environment Vitest renders components into | `frontend/vitest.config.ts` |
| `@testing-library/react` | React testing utilities | Renders components and queries them the way a user would | `frontend/src/test/` |
| `@testing-library/dom` | DOM testing core | Query engine under Testing Library for React | `frontend/src/test/` |
| `@testing-library/user-event` | Realistic user input simulation | Typing, clicking and keyboard flows in tests | `frontend/src/**/*.test.tsx` |
| `@testing-library/jest-dom` | Custom DOM matchers | `toBeInTheDocument` and friends, with a local type shim checked by preflight | `frontend/src/test/jest-dom-matchers.d.ts` |
| `msw` | Mock Service Worker | Intercepts API calls in tests with shared handlers | `frontend/src/test/mocks/` |
| `@tanstack/react-query-devtools` | Query cache inspector | Dev-only devtools panel, stripped from production builds | `frontend/src/App.tsx` |
| `eslint` | JavaScript and TypeScript linter | `npm run lint` with zero warnings allowed | `frontend/eslint.config.js` |
| `@eslint/js` | ESLint's recommended rules | Base rule set in the flat config | `frontend/eslint.config.js` |
| `@typescript-eslint/parser` | TypeScript parser for ESLint | Lets ESLint read TypeScript with type information | `frontend/eslint.config.js` |
| `@typescript-eslint/eslint-plugin` | TypeScript lint rules | Type-aware rules; its TypeScript peer range bounds the `typescript` pin | `frontend/eslint.config.js` |
| `eslint-plugin-react-hooks` | Rules of Hooks lint | Catches hook ordering and dependency mistakes | `frontend/eslint.config.js` |
| `eslint-plugin-react-refresh` | Fast refresh lint | Keeps modules compatible with hot reload | `frontend/eslint.config.js` |
| `globals` | Global identifier sets | Declares browser globals to ESLint | `frontend/eslint.config.js` |
| `auth/` | Auth plumbing | MSAL configuration and `apiFetch`, which attaches the bearer token | `frontend/src/auth/` |
| `routes/` | Router definition | Route table, protected-route wrapper, home path per role | `frontend/src/routes/` |
| `pages/` | One module per page | Dashboard, stats, terminals, kits, contracts, users, audit, settings, catalog, comms library, nets, PACE, operations (`operations-page`, `operation-page`, `operation-print-page`, `operation-matrix-print-page`; the `operation-drawer` is in `components/operations/`), print pages | `frontend/src/pages/` |
| `services/` | API layer | One query hook module per domain; the only code that talks to the API | `frontend/src/services/` |
| `components/common/csv` | Header CSV control | Export, template and import dialogs for every dataset | `frontend/src/components/common/csv/` |
| `components/common/sheet-export` | In-repo PNG, clipboard and `.pptx` writer | Own zip, EOT font and slide writer with no dependency, emitting pictures, text, native shapes, glued connectors, native tables and multi-slide decks; see [the slide export](../AGENTS.md#the-slide-export-where-every-trap-is-a-silent-one) | `frontend/src/components/common/sheet-export/` |
| `help/` | In-app FAQ content | Help topics per route, with a test that every route has one | `frontend/src/help/` |
| `generated/` | Backend-generated code | `csv-columns.ts`, the CSV column manifest, never hand edited | `frontend/src/generated/` |
| `styles/catalog-tokens.css` | Print and catalog design tokens | Fonts, the graphite and paper ramp and `@page` rules for printable sheets | `frontend/src/styles/catalog-tokens.css` |
| `theme/` and `components/layouts` | App shell | MUI theme, global styles, header, sidebar and `MainLayout` | `frontend/src/theme/`, `frontend/src/components/layouts/` |

## 4. Data and storage

| Component | What it is | What it does here | Where |
|---|---|---|---|
| PostgreSQL | Relational database | Holds all application data; password authentication by default, Entra authentication optional | `compose.yaml`, `compose.selfhost.yaml` |
| `postgres` image | Postgres container | `postgres:16-alpine` locally in `compose.yaml`, `postgres:16` as the CI backend job's service container | `compose.yaml`, `.github/workflows/ci.yml` |
| Goose migrations | Numbered SQL files | The only way the schema changes; destructive changes need review | `backend/migrations/` |
| Azure Blob Storage | Optional object storage | One private container for equipment photos and PACE squadron emblems; unset means upload answers 501 | `backend/internal/blob/` |
| CSV import and export | The data interchange format | Every domain's bulk in and out, declared once per domain; see [CSV is declared once](../AGENTS.md#csv-is-declared-once-per-domain) | `backend/internal/shared/csvtable/`, `frontend/src/components/common/csv/` |

## 5. Identity and access

| Component | What it is | What it does here | Where |
|---|---|---|---|
| Microsoft Entra ID | Optional identity provider | One single-tenant app registration serves as both SPA client and API audience when auth is enabled | `.claude/context/authz.md` |
| MSAL | Browser sign-in library | Authorization code flow with PKCE; acquires the access token | `frontend/src/auth/` |
| go-oidc verification | In-process token check | Verifies signature, issuer, audience and algorithm on every API call | `backend/internal/middleware/auth.go` |
| Application roles | Roles held in the app's own `users` table | admin, editor, rto, planner, viewer gate every route; Entra claims are not used; see [authz](../.claude/context/authz.md) | `backend/internal/middleware/`, `frontend/src/types/roles.ts` |

## 6. CI/CD and supply chain

| Component | What it is | What it does here | Where |
|---|---|---|---|
| `ci.yml` | Pull request and push CI | Preflight, backend, frontend, script tests, style and security scan jobs | `.github/workflows/ci.yml` |
| `security.yml` | Scheduled and push security scan | Trivy filesystem scan and govulncheck outside the PR path | `.github/workflows/security.yml` |
| `release.yml` | Tag-triggered release | Builds `Dockerfile.prod`, scans the image, pushes it to GHCR, creates a GitHub Release | `.github/workflows/release.yml` |
| Trivy | Vulnerability scanner | Fails on CRITICAL or HIGH in the repo and in the built image | `ci.yml`, `security.yml`, `release.yml` |
| govulncheck | Go vulnerability checker | Scans reachable code and the stdlib named by the `go` directive | `ci.yml`, `security.yml` |
| npm audit | npm advisory check | Fails the frontend job on a high advisory | `ci.yml` |
| golangci-lint with gosec | Go meta-linter with the security linter enabled | Backend lint, built from source everywhere | `backend/.golangci.yml`, `backend/Dockerfile.dev` |
| actionlint | Workflow linter | Validates every workflow before CI can hit a startup failure | `.github/actionlint.yaml`, `scripts/preflight-versions.mjs` |
| GHCR | GitHub Container Registry | Holds every released image | `release.yml` |
| Branch protection | Server-side rule on `main` | PR required, required checks, linear history, applies to admins | [AGENTS.md](../AGENTS.md) |

## 7. Local development

| Component | What it is | What it does here | Where |
|---|---|---|---|
| `app` | Backend compose service | Production-like image in `compose.yaml`; Air hot reload with a Vite proxy in `compose.dev.yaml` | `compose.yaml`, `compose.dev.yaml` |
| `postgresql` | Database compose service | Local Postgres with a named volume and a readiness healthcheck | `compose.yaml` |
| `frontend` | Vite compose service, container `frontend-dev` | Serves the SPA with hot reload behind the `app` proxy | `compose.dev.yaml` |
| `compose.selfhost.yaml` | Self-hosting stack | Standalone file with an `app` service built from `Dockerfile.prod` and a `postgresql` service, so the host needs neither Node nor Go | `compose.selfhost.yaml`, `docs/self-hosting.md` |
| `compose.dev.entra.yaml` | Auth overlay | Turns on Entra auth for local validation | `compose.selfhost.yaml` | Self-hosting stack | Standalone file with an `app` service built from `Dockerfile.prod` and a `postgresql` service, so the host needs neither Node nor Go | `compose.selfhost.yaml`, `docs/self-hosting.md` |
| `compose.dev.entra.yaml` |
| Podman or Docker | Container runtime | Runs the compose stack; `podman compose` is the command used here | `Makefile`, `.claude/commands/dev.md` |
| Air | Go live reloader | Rebuilds and restarts the backend on save inside the dev container | `backend/.air.toml`, `backend/Dockerfile.dev` |
| `frontend/Dockerfile.dev` | Vite dev image | Node image running the Vite dev server | `frontend/Dockerfile.dev` |
| `Makefile` | Task wrappers | `dev`, `prod`, `stop`, `logs`, frontend checks and scans | `Makefile`, `backend/Makefile`, `frontend/Makefile` |
| mise | Optional tool and task manager | Root file pins Go and Node for mise users and wraps the Makefile; the diagrams file pins Typst and renders | `mise.toml`, `diagrams/mise.toml` |
| Git hooks | Pre-push hook installer | `setup-hooks.sh` installs `hooks/pre-push`, which runs `verify.mjs --reuse-receipt` | `scripts/setup-hooks.sh`, `scripts/hooks/pre-push` |
| Dev seed scripts | Sample data loaders, not migrations | `seed-dev-assets.mjs` fills terminals and kits, `seed-dev-nets.mjs` fills the Nets Library, `seed-dev-operation.mjs` seeds the sample operation | `scripts/seed-dev-assets.mjs`, `scripts/seed-dev-nets.mjs`, `scripts/seed-dev-operation.mjs` |
| Demo walkthrough | Scripted replay of the Operations feature | `demo-operation-walkthrough.mjs` drives the app in the installed Chrome with captions and records a `.webm` | `scripts/demo-operation-walkthrough.mjs` |

## 8. Verification and repo tooling

| Component | What it is | What it does here | Where |
|---|---|---|---|
| `verify.mjs` | The single verification command | Runs every local gate and writes the receipt the pre-push and Stop hooks read | `scripts/verify.mjs` |
| `preflight-versions.mjs` | Version agreement check | Compares version pins across files before anything compiles | `scripts/preflight-versions.mjs` |
| `check-docs.mjs` | Doc agreement check | Holds prose to the code: inputs, jobs, versions, links, migrations, diagrams, counts, this page, the glossary, the catalog-lookup workflow's copies | `scripts/check-docs.mjs` |
| `check-bundle.mjs` | Built bundle check | Builds the SPA and fails on a cycle in the emitted chunk graph | `scripts/check-bundle.mjs` |
| `check-ui-tokens.mjs` | UI framework check | Holds pages to the shared banner, title and token primitives | `scripts/check-ui-tokens.mjs` |
| `check-csv-coverage.mjs` | CSV coverage check | Standalone form of the CSV manifest check, run by CI and `/ship` | `scripts/check-csv-coverage.mjs` |
| `check-em-dash.mjs` | PostToolUse hook | Rejects em dashes in lines an agent session writes | `scripts/check-em-dash.mjs` |
| `check-em-dash-ci.mjs` | CI style gate | Rejects em dashes in committed lines added since the merge base | `scripts/check-em-dash-ci.mjs` |
| `verify-deploy.mjs` | Post-deploy smoke test | Health, readiness, SPA, 401 against 404, and a headless Chrome boot check | `scripts/verify-deploy.mjs` |
| `lint-plan.mjs` | Handoff plan lint | Rejects a plan a smaller model cannot execute literally | `scripts/lint-plan.mjs` |
| `plan-status.mjs` | Executor progress beacon | Records started, step, blocked and committed states of `/execute-plan` | `scripts/plan-status.mjs` |
| `ship-scope.mjs` | `/ship` scope verdict | Prints whether the doc checks apply to this diff | `scripts/ship-scope.mjs` |
| `branch-guard.mjs` | PreToolUse hook | Denies edits and writing Bash commands while on `main` | `scripts/branch-guard.mjs` |
| `verify-gate.mjs` | Stop hook | Refuses to end a turn on code changes with no matching receipt | `scripts/verify-gate.mjs` |
| `env-report.mjs` | SessionStart report | Prints machine, toolchain and active GitHub account | `scripts/env-report.mjs` |
| `start-checks.mjs` | SessionStart gate | Runs the automatic half of `/start` | `scripts/start-checks.mjs` |
| `scripts/lib/` | Pure helper modules with `node --test` tests | Shared logic for the scripts above, discovered by glob in CI and `verify.mjs` | `scripts/lib/` |

## 9. Docs and diagrams

| Component | What it is | What it does here | Where |
|---|---|---|---|
| Typst | Typesetting language and renderer | Compiles each `.typ` diagram to light and dark SVGs | `diagrams/*.typ`, `diagrams/mise.toml` |
| Diagram design tokens | Shared Typst theme and tokens | One palette, font and spacing scale across every diagram | `diagrams/design/` |
| Rendered diagrams | Committed dual-theme SVGs | Embedded in the README and docs; `check-docs.mjs` checks them against the schema | `diagrams/` |
| Repo docs | Markdown under `docs/` and the root | Operating and development material | `docs/`, `README.md` |
| In-app help | FAQ dialog and role chip | Route-scoped help topics in the running app | `frontend/src/help/`, `frontend/src/components/help/` |

## 10. Agent tooling

Agents working in this repo follow [CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md).

| Component | What it is | What it does here | Where |
|---|---|---|---|
| `.claude/context/` | Load-on-demand context | Project overview, per-domain files, patterns, authz, help | `.claude/context/` |
| `.claude/commands/` | Slash commands | `/start`, `/ship`, `/dev`, `/plan-handoff`, `/execute-plan`, `/handoff`, `/resume` | `.claude/commands/` |
| `.claude/agents/` | Role agent guidance | Frontend, backend, UI/UX, DBA, DevOps, security and validator roles | `.claude/agents/` |
| `.claude/skills/` | Repo-scoped skills | `gh-account`, `catalog-lookup` and `diagrams` | `.claude/skills/` |
| `.claude/settings.json` | Hook and permission config | Wires the SessionStart, PreToolUse, PostToolUse and Stop hooks and read-only allows | `.claude/settings.json` |
| `/plan-handoff` and `/execute-plan` | Plan authoring and literal execution pair | Writes a plan from `.claude/plan-template.md` that a smaller model runs step by step | `.claude/commands/`, `_project/plans/` |
| `_project/plans/` | Committed handoff plans | Each plan must pass `lint-plan.mjs` | `_project/plans/` |

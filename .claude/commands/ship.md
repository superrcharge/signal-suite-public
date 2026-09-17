---
model: haiku
---

Pre-push audit. Run every check in order using real commands. Report PASS / FAIL / NEEDS REVIEW for each item with specifics. Do not skip items. Do not ask for confirmation. Fix any FAIL automatically. Flag NEEDS REVIEW for the user to decide.

## ⛔ Branch guard - run this FIRST before anything else

```
git branch --show-current
```

If the current branch is `main`: **STOP IMMEDIATELY.** Do not run any further checks. Do not commit. Do not push. Tell the user:

> "You are on main. All work must be done on a feature branch. Please run:
> `git checkout -b <type>/<short-description>`
> then re-run /ship."

Never bypass this check. Never push directly to main under any circumstances, even if the user asks. The only commits that should ever land on main are merges from pull requests.

---

## Working directory

All commands must run from the repo root. Establish it first:

```bash
git rev-parse --show-toplevel
```

Use the result as the absolute prefix for every `cd` below. All command blocks below use `/REPO` as a placeholder - substitute whatever `git rev-parse --show-toplevel` returned.

This repo may be worked on from more than one machine, so never hardcode a repo root, home directory, or username into this file. Always derive paths at runtime.

---

## 0. Version preflight - run this before any other check

```bash
node /REPO/scripts/preflight-versions.mjs
```

- PASS if all checks pass. It prints the value it verified for each one, so read those rather than just the exit code.
- FAIL otherwise. **Fix it before running anything else in this file.** Every check here is one version pin disagreeing with another, which means the build is not constructible and every check below is measuring a tree that cannot ship.

This is check 0 because it is the only check that compiles nothing.
It takes about two seconds and it exists to stop the pattern that made three consecutive deploys painful: a pin raised in one file, CI red six minutes later, a fix that breaks a different job, repeat.
See "Versions are checked before CI, not by CI" in AGENTS.md for the full table of what it holds.

## 0b. Scope - decides whether checks 7-11 apply

```bash
node /REPO/scripts/ship-scope.mjs
```

It prints a line reading either `DOC_CHECKS=required` or `DOC_CHECKS=skip`, and it always exits 0.
This is not a gate and cannot fail a push.

- **`DOC_CHECKS=required`** - run checks 7, 8, 9, 10 and 11 in full, exactly as written.
- **`DOC_CHECKS=skip`** - do not run them. Report each one in the summary table as `skipped - out of scope`.

**Read the line the script printed. Do not decide this yourself.**
Whether a diff touches a domain is a question with one right answer and the script computes it; inferring it produces a different answer on different runs, which is the failure this step exists to remove.

Every other check runs regardless. Only 7 through 11 are scoped.

Why: checks 7-11 audit prose that is keyed to domains and pages - README's Features section, structure.md's trees, the two load-on-demand tables, the domain context files, and the memory index.
A dependency bump or a workflow edit cannot move any of those facts, so walking all five of them for `chore(deps): bump x/crypto` reads a lot of documentation to reach a conclusion that was available from the file list.
That was the most expensive part of this audit and the part least often relevant.

## 1. TypeScript
```bash
cd /REPO/frontend && npx tsc --noEmit
```
- PASS if zero output.
- FAIL if any errors - list them and fix before continuing.

## 1b. Backend build + tests
```bash
podman exec app sh -c "cd /app && go build ./... 2>&1 && echo BUILD_PASS && go test ./... 2>&1"
```
- PASS if `BUILD_PASS` appears and all tests pass.
- FAIL if `go build` fails - list the errors and fix before continuing. This catches signature mismatches (e.g. a handler's NewHandler call sites not updated after a parameter change).
- FAIL if any test fails - show the failing test names and fix before continuing.
- If the `app` container is not running, say so and stop - do not substitute `go build` on the host as a lint proxy.

## 1c. Frontend lint (ESLint)
```bash
cd /REPO/frontend && npm run lint
```
- PASS if zero output (exit 0).
- FAIL if any errors - list them and fix before continuing. Do not skip or suppress.

## 1d. Backend lint (golangci-lint)
```bash
podman exec app sh -c "cd /app && golangci-lint run ./... 2>&1"
```
- PASS if zero output.
- FAIL if any linter errors - list them and fix before continuing.
- If the command returns exit 127 (golangci-lint not in container), report **NEEDS REVIEW - golangci-lint not installed in dev container**. Do not substitute `go build` as a proxy. CI will gate on this but flag it explicitly so the user can decide to proceed.

## 2. Frontend tests
```bash
cd /REPO/frontend && npx vitest run 2>&1
```
- PASS if all tests pass.
- FAIL if any fail - show the failing test names and error messages. Fix before continuing.

## 2b. Frontend npm audit
```bash
cd /REPO/frontend && npm audit --audit-level=high 2>&1
```
- PASS if zero high/critical vulnerabilities.
- FAIL if any high or critical - run `npm audit fix` inside the frontend dev container (`podman exec frontend-dev sh -c "cd /app && npm audit fix"`) then re-run the audit. The package-lock.json update must be committed.
- Do not suppress or skip. CI runs this exact command and will fail on the same findings.

## 2c. Dependency currency check

Catches CVE-linked version gaps before the weekly Security scan does. Two sub-checks:

### Open Dependabot alerts
```bash
gh api repos/superrcharge/signal-suite-public/dependabot/alerts \
  --jq '.[] | select(.state=="open") | "\(.security_advisory.severity | ascii_upcase) | \(.security_advisory.ghsa_id) | \(.dependency.package.name) \(.security_vulnerability.vulnerable_version_range) - fixed in \(.security_vulnerability.first_patched_version.identifier // "unknown") | \(.security_advisory.summary)"'
```
- **FAIL** if any CRITICAL or HIGH alert is open - bump the dependency before pushing. For Go: `go get <pkg>@<patched-version> && GOTOOLCHAIN=auto go mod tidy` in the container. For npm: `npm audit fix` in the frontend. Commit the change.
- **AUTO-FIX** if any MEDIUM or LOW alert has a patch/minor fix available - bump it without asking. Commit the change. Only flag if the fix is a **major version bump** (may have breaking changes), in which case **NEEDS REVIEW**.
- **PASS** if zero open alerts.

### npm outdated (direct deps)
```bash
cd /REPO/frontend && npm outdated --depth=0 2>&1 || true
```
- **REPORT** any package with a newer patch or minor version, naming current and latest. Do not bump it as part of this audit.
- **NEEDS REVIEW** if any package has a newer **major** version - list it, note the gap. Major version upgrades require migration planning.
- **PASS** either way. Routine drift does not block this push.

> **Why this step reports rather than fixes:** it used to auto-bump every outdated direct dep and commit the result before pushing, which made every feature push also a dependency PR - unrelated churn in the diff, and a lockfile change nobody asked for landing next to the actual work.
> Bump the patch and minor ones in their own change once CI is green, so the drift closes without sitting in front of the current change.
> The security half is unaffected and still blocks: the Dependabot alert sub-check above is a FAIL on CRITICAL or HIGH, and `Security Scan` is a required status check on main running Trivy at CRITICAL,HIGH plus govulncheck, so a vulnerable dependency cannot merge whatever this step says.
> `scripts/verify.mjs` demotes the equivalent Go module check for the same reason - see the comment above `checkGoModules`.

## 2d. The built bundle

```bash
node /REPO/scripts/check-bundle.mjs
```

- PASS if it reports no cycles. It prints the chunk and edge counts, so read those: a
  suspiciously low edge count means the check is not seeing the graph, which has happened.
- FAIL otherwise. Do not work around it by tuning `codeSplitting.groups`; read the section it
  points at first.

**Every other check in this file reads source. This one reads what actually ships.** That
distinction is not academic: an earlier release passed every check above and served a blank white screen,
because a cyclic chunk graph is legal ES modules, builds cleanly, type-checks, lints, unit-tests
clean - the tests run against source through Vite, never against the bundle - and breaks only when
a chunk reads an imported binding at module scope. Nothing in this audit built the frontend at all,
so nothing could have caught it. It costs 0.8s including the build.

See "A green build is not a running app" in AGENTS.md.

## 3. Service mock coverage (common CI trap)
Run:
```bash
grep -rn "vi.mock.*@/services" /REPO/frontend/src --include="*.test.*" -l
```
For each test file that mocks `@/services` with a closed object (not `importOriginal`), check that every export currently in `frontend/src/services/index.ts` that is used by a component rendered in that test is present in the mock. The sidebar renders inside MainLayout which most page tests use - any new service hook added to the sidebar must appear in every `@/services` mock.
- PASS if all mocks are complete.
- FAIL if any hook is missing - add the stub and re-run tests.

## 3c. CSV coverage (common CI trap)
```bash
node /REPO/scripts/check-csv-coverage.mjs
```
- PASS if it reports every domain declared and every declaration matching its routes.
- FAIL otherwise. Fix each item it names. Do **not** resolve a failure by flipping a
  `"yes"` to `"no"` - that is the silent omission the check exists to stop.
- **NEEDS REVIEW** separately if the manifest carries any `"deferred"` entry whose issue
  has closed. Deferred is a parking space, not a destination:
  ```bash
  grep -o '"#[0-9]*' /REPO/backend/internal/domain/csv-manifest.json | sort -u
  ```

## 3b. Required GitHub secrets

No workflow in this repo reads a repository or environment secret. `release.yml` pushes to GHCR
and creates the GitHub Release with the default `GITHUB_TOKEN`, and `ci.yml` and `security.yml`
need nothing. Confirm that is still true:

```bash
grep -rn "secrets\." .github/workflows/*.yml
```

- PASS if the only matches are `secrets.GITHUB_TOKEN`.
- NEEDS REVIEW if a workflow now reads any other secret: it must be documented in
  `.github/workflows/README.md` and added in the repo's Settings before the workflow can pass.

---

## 4. Git status
```bash
git status --short
git log --oneline -5
```
- Flag any untracked files that look like they belong in the repo (ignore `.claude/scheduled_tasks.lock`, `.DS_Store`, `*.lock`, `.claude/launch.json`).
- Report what commits are staged to push.
- PASS / NEEDS REVIEW.

## 5. Debug leftovers
```bash
grep -rn "console\.log\|console\.error\|TODO\|FIXME\|debugger" /REPO/frontend/src --include="*.ts" --include="*.tsx" | grep -v "\.test\." | grep -v node_modules
```
```bash
grep -rn "fmt\.Println\|log\.Println\|TODO\|FIXME" /REPO/backend/internal --include="*.go" | grep -v "_test.go"
```
- `console.error` inside `error-boundary.tsx` is intentional - do not flag it.
- NEEDS REVIEW if any other hits - list them and ask the user whether to remove.
- PASS if clean.

## 5b. Hardcoded versions and values
Any version number, URL, or config value that is duplicated across files is a drift risk. Before pushing, scan for common offenders:

```bash
grep -rn "go-version:" /REPO/.github/workflows/
grep -rn "node-version:" /REPO/.github/workflows/
grep -rn "postgres:" /REPO/.github/workflows/
```

For each hardcoded value found, ask: **does it match the authoritative source?**

| If you see… | It should match… |
|---|---|
| `go-version: "X.Y.Z"` in any workflow | `go` directive in `backend/go.mod` - prefer `go-version-file: 'backend/go.mod'` |
| `node-version: N` in any workflow | `engines.node` in `frontend/package.json` if set, or the version Vite/React currently requires |
| `postgres:16` in CI services | The Postgres image in `compose.yaml` and `compose.selfhost.yaml` |
| Any image tag, SDK version, or tool version pinned in a workflow | The corresponding version in go.mod, package.json, or Dockerfile |

Then check the inverse, which is the trap that is easier to miss:

```bash
grep -rn "@latest" /REPO/.github/workflows/
```

An unpinned `go install ...@latest` is a build that changes under you with no commit.
This broke the Backend job during the v1.0.0 ship: `golangci-lint@latest` released
v2.13.1 requiring Go >= 1.26, while `backend/go.mod` (the version the job installs)
pins 1.25.13, so the install step began failing on every PR with no Go change
involved. Pin to the version the dev container runs, so CI and local agree.

- FAIL if any hardcoded version is stale or mismatched - update to use a version file reference or correct the pin before pushing.
- NEEDS REVIEW for each remaining `@latest` tool install - confirm it still resolves
  against the Go version in `backend/go.mod` (or the Node version in CI), and pin it
  if the tool has started requiring a newer toolchain than this repo declares.
- PASS if all pinned values are current and consistent.

## 5c. Em dash gate

```bash
node /REPO/scripts/check-em-dash-ci.mjs origin/main
```

- PASS if it reports no em dashes in added lines.
- FAIL otherwise. Fix every line it names, then re-run.

**Why this is its own check.** Nothing else surfaces it before a push. The
PostToolUse hook only sees files Claude writes, so it misses a hand edit, a commit
from another machine, or a GitHub web-UI edit. The CI job runs `if:
github.event_name == 'pull_request'`, so it only fires once a branch is pushed and
a PR exists. A long branch therefore banks violations with nothing to report them:
v1.0.0 arrived at its first push carrying 42.

Only added lines are in scope. Do not mass-substitute pre-existing ones in a file
you touched. Where the character is a literal a caller compares against rather
than prose, append the `allow-em-dash` marker in a comment on that line instead of
changing it.

## 6. New migrations
```bash
ls /REPO/backend/migrations/ | sort
```
- Verify migration filenames are sequentially numbered with no gaps.
- If a new migration exists, confirm it is non-destructive (no DROP TABLE, no DROP COLUMN, no data-loss operations) or flag for user review.
- **FAIL if any `.sql` migration file is missing `-- +goose Up`** - goose refuses to parse files without this annotation and CI migration step will fail. Run:
```bash
grep -rL "^-- +goose Up" /REPO/backend/migrations/*.sql 2>/dev/null
```
Any file listed is missing the annotation - add `-- +goose Up` as the first line.
- PASS / NEEDS REVIEW / FAIL.

## 7. README
Read `README.md`. Run:
```bash
ls /REPO/backend/internal/domain/
```
- Every directory under `backend/internal/domain/` with user-visible features must have a bullet in the Features section of README.
- The top description sentence should reflect the current scope of the app.
- FAIL if any domain is missing - add the bullet before continuing. Documentation FAILs block the release sequence the same as code FAILs.

## 8. structure.md
Read `.claude/context/structure.md`. Run:
```bash
ls /REPO/backend/internal/domain/
ls /REPO/frontend/src/pages/
```
- Every backend domain should appear in the backend directory tree.
- Every page file should be mentioned (exclude helpers: `inline-edit-cell.tsx`, `not-found-page.tsx` are fine to omit if already listed).
- PASS / FAIL with specifics.

## 9. Load-on-demand tables + domain context files
This check runs in BOTH directions. Run all commands:
```bash
ls /REPO/.claude/context/domains/
ls /REPO/backend/internal/domain/
```
Read `AGENTS.md` and `.claude/context/project.md`.

**Forward check (context → tables):** For every file that exists in `.claude/context/domains/`, confirm it has a matching row in both the `AGENTS.md` table and the `project.md` table.

**Reverse check (backend → context):** For every directory in `backend/internal/domain/` that has user-visible features, confirm:
  1. A `.claude/context/domains/<domain>.md` file exists.
  2. That domain has a row in both the `AGENTS.md` load-on-demand table and the `project.md` load-on-demand table.

**FAIL if any gap exists in either direction - create the missing file or row before continuing.** This is documentation debt that compounds; do not defer it.

## 10. Domain context file completeness
For each `.claude/context/domains/<domain>.md` that exists or was just created, do a quick sanity check that it covers:
- Backend: migration filename, schema summary, domain layout, API table.
- Frontend: types file, service hooks with query keys, pages that use the domain.
- Any non-obvious gotchas (e.g. PATCH full-replace, orphan chip pattern).
- PASS / NEEDS REVIEW if a file exists but is clearly skeletal or out of date.

## 10b. Diagrams and the rest of the doc surface

**"Update the documentation" means the whole suite, not the prose files.** The four Typst
diagrams under `diagrams/` are documentation with the same failure mode as a sentence: a
diagram one release out of date reads exactly like a current one, and until this check
existed nothing compared them to the code at all.

```bash
node /REPO/scripts/check-docs.mjs
```

Its `diagrams match the code` step holds these relationships mechanically: every table a
migration creates is drawn in `data-model.typ`, every `.typ` has both `-light.svg` and
`-dark.svg` committed beside it, and a prose table or migration count is the real count -
across the tracked `.md` files **and** the `.typ` sources themselves.

**What it cannot hold is a claim inside a picture, and that is most of a diagram.** It
counts artifacts; it cannot tell you that an arrow labelled "verify signature, audience,
expiry" stopped being true when the backend also began checking the issuer. Every defect
of that kind found so far passed this check. The step below is
where those are caught, and it is not optional because the script is green.

- FAIL if it reports any of those. Fix the `.typ`, then re-render - the SVGs are committed,
  so an edited source with stale output is a half-finished change:

  ```bash
  cd /REPO/diagrams && mise run render-file data-model.typ
  ```

  `typst` comes from `diagrams/mise.toml`, pinned. The **font is a separate prerequisite**
  and is the dangerous half: a missing `typst` fails loudly, while a missing CaskaydiaMono
  NFP renders in a fallback face with no error at all, producing a whole-file diff that is
  simply in the wrong typeface. Install it with
  `brew install --cask font-caskaydia-mono-nerd-font`.

  If `mise`, `typst` or the font is unavailable on this machine, say so explicitly rather
  than committing a source whose SVGs do not match it. Sanity-check the diff before
  committing: a correct re-render of a small edit is a handful of lines. A 155KB whole-file
  rewrite means the wrong typst; a file ~160KB smaller means the font did not resolve.

Then ask the question the script cannot, once per diagram, and answer it against the diff
rather than from memory:

| Diagram | Re-render when the diff changes… |
|---|---|
| `data-model.typ` | a migration: a table, a foreign key, or a uniqueness rule |
| `system-architecture.typ` | a runtime component, an auth path, or how a credential is obtained |
| `cicd-pipeline.typ` | a workflow, a job, or which checks are required on `main` |

A change touching none of those rows needs no re-render - **say which rows you checked and
why they do not apply**, because "the diagrams are fine" and "I did not look" are the same
sentence otherwise.

Also confirm the generated artifacts that are committed rather than built are current:

```bash
cd /REPO/backend && go test ./internal/csvregistry   # frontend/src/generated/csv-columns.ts
cd /REPO/backend && go test ./docs                   # backend/docs/openapi.json vs the real routes
```

- PASS / FAIL with specifics.

## 11. Memory staleness
Locate this repo's auto memory index, which lives under a machine-specific project slug:

```bash
ls ~/.claude/projects/*/memory/MEMORY.md   # pick the slug that matches this checkout's path
```

Read whichever path it returns. Do not hardcode a path - the slug differs from machine to machine, and a stale absolute path makes this check silently pass without reading anything. If the command returns no match, report that rather than treating it as a pass.
- Flag any entry referencing "in-progress", "WIP", "local dev", "uncommitted", or "active dev" if that work has since shipped.
- Flag any entry referencing a specific file path or function name - do a quick existence check if uncertain.
- PASS / NEEDS REVIEW with specifics.

## 12. CI status
```bash
gh run list --repo superrcharge/signal-suite-public --branch main --limit 10
```
- **Only flag failures on the `CI` workflow** (the PR gate job). Ignore the `Security` workflow - it is a scheduled weekly scan (Trivy + govulncheck) that may surface CVEs in dependencies independent of your changes; failures there do not block a PR merge but should be noted separately.
- FAIL if the most recent `CI` run on main failed - identify which job and why before pushing more.
- PASS if the most recent `CI` run on main is green, or if no CI run exists on main yet (new branch - CI runs on the PR).

---

## Summary

Print this table after all checks complete:

| # | Check | Status | Notes |
|---|---|---|---|
| 0 | Version preflight | ... | ... |
| 0b | Scope | ... | `DOC_CHECKS=required` or `DOC_CHECKS=skip` |
| 1 | TypeScript | ... | ... |
| 1b | Backend build + tests | ... | ... |
| 1c | ESLint | ... | ... |
| 1d | golangci-lint | ... | ... |
| 2 | Frontend tests | ... | ... |
| 2b | npm audit | ... | ... |
| 2c | Dependency currency (Dependabot + npm outdated) | ... | ... |
| 2d | Built bundle graph | ... | the only check that reads build output |
| 3 | Service mock coverage | ... | ... |
| 3c | CSV coverage | ... | ... |
| 3b | Required secrets | ... | ... |
| 4 | Git status | ... | ... |
| 5 | Debug leftovers | ... | ... |
| 5b | CI workflow version consistency | ... | ... |
| 5c | Em dash gate | ... | ... |
| 6 | Migrations | ... | ... |
| 7 | README | ... | scoped by 0b |
| 8 | structure.md | ... | scoped by 0b |
| 9 | Load-on-demand tables | ... | scoped by 0b |
| 10 | Domain context files | ... | scoped by 0b |
| 10b | Diagrams + generated artifacts | ... | scoped by 0b; the doc suite is not just prose |
| 11 | Memory staleness | ... | scoped by 0b |
| 12 | CI status | ... | ... |

**FAIL = must fix before pushing.**
**NEEDS REVIEW = surface to user, do not auto-fix.**
**PASS = nothing to do.**

Print "Ship audit complete - X passed, Y need review, Z failed." when done.

---

## Release sequence (run after audit passes)

**Documentation must be current before the release sequence starts.** If checks 7–10 produced any FAIL, fix them, re-run those checks, and confirm PASS before continuing. Shipping code with stale docs is the same as shipping broken code - the next session will waste time rediscovering what already exists.

After the ship audit passes with zero FAILs, follow these steps in order every time. Do not skip or reorder.

### Step 1 - Branch, commit, push, PR
```powershell
git checkout -b <type>/<description>
git add <files>
git commit -m "<conventional commit message>"
git push origin <branch>
gh pr create --title "<title>" --body "<body with Closes #N for each issue>"
```

In the PR body, include `Closes #N` for every GitHub issue resolved. This auto-closes issues on merge.

### Step 2 - Wait for PR CI to go green
Go to `https://github.com/superrcharge/signal-suite-public/actions` and wait for the `CI` run triggered by the branch push to pass. The CI job runs golangci-lint, go build, go test, ESLint, tsc, Vitest, and npm audit. Do not merge until green.

### Step 3 - Merge the PR

**Before merging, check whether any open PR is stacked on this branch:**

```bash
gh pr list --repo superrcharge/signal-suite-public --base <this-branch> --state open
```

- If that returns nothing, merge with `--delete-branch`.
- **If it returns any PR, do NOT pass `--delete-branch`.** Deleting a branch that another
  open PR targets makes GitHub auto-close that PR, and **a PR closed that way cannot be
  reopened** - not by `gh pr reopen`, and not even after restoring the branch. The only
  recovery is opening a replacement PR, which loses the review thread and the board card.

  Merge without the flag, then for each stacked PR: rebase its branch onto the new `main`,
  force-push, retarget it with `gh pr edit <N> --base main`, and only then delete the old
  branch.

```powershell
gh pr merge --squash                    # a PR is stacked on this branch
gh pr merge --squash --delete-branch    # nothing is stacked on it
```

The same rule applies to deleting any branch by hand: check for open PRs pointing at it
first. This is not recoverable after the fact, so the check is cheap relative to the cost.

### Step 4 - Add the CHANGELOG entry **in the PR**, not on main

Add the `## vX.Y.Z - YYYY-MM-DD` section to `CHANGELOG.md` on the feature branch, as part of
the PR from step 1, with a `### Fixed` / `### Added` / `### Changed` block describing the
change.

**This step used to say "checkout main, edit, commit, push origin main", and that is now
impossible.** `main` is a protected branch: pull requests are required, five status checks
must pass, and the rule is enforced for administrators too. A direct push is rejected at the
remote:

```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: - Changes must be made through a pull request.
! [remote rejected] main -> main (protected branch hook declined)
```

That old instruction was also the single reason the repo accumulated a direct-to-main commit
per release. The `PreToolUse` branch guard cannot see a Bash `git commit`, so the release
sequence quietly routed around the very rule AGENTS.md opens with. Putting the entry in the
PR reaches the same end state with nothing to bypass.

If the PR is already merged before you remember the CHANGELOG, do not push to main. Open a
second small PR for it.

### Step 5 - Tag the merged commit and push the tag

Confirm the version first. This reads the tag straight out of the CHANGELOG rather than
asking you to remember it, and refuses a version that is already tagged or that does not
increment the latest one:

```bash
node /REPO/scripts/preflight-versions.mjs --release
```

Then tag what it named:

```powershell
git checkout main
git pull origin main
git tag vX.Y.Z
git push origin refs/tags/vX.Y.Z
```

Nothing is committed here - `main` already carries the CHANGELOG from the previous step, and the tag is
placed on the merge commit.

**Tags are not covered by branch protection.** It applies to `refs/heads/main`, while a tag
is `refs/tags/*`, so pushing the tag works normally. Confirm the tag landed on the commit you
expect with `git rev-parse --short vX.Y.Z` before moving on.

**Write the refspec in full, as above.** The local branch guard reads what a push moves rather
than matching the verb, and `refs/tags/vX.Y.Z` says so without having to resolve anything. The
short form works too - the guard resolves it against the repo and lets a real tag through - but
the full form is the one that cannot be ambiguous, and it is free.

### Step 6 - Wait for release CI to go green
The tag push triggers the release workflow which builds the Docker image and pushes it to GHCR. Wait for it to complete at `https://github.com/superrcharge/signal-suite-public/actions` before proceeding.

### Step 7 - Deploy the image

Deploying is not a workflow in this repo. Wherever the app runs, pull the new tag and restart.
For the compose stack in `docs/self-hosting.md`:

```bash
git pull
make selfhost-build
```

### Step 8 - Confirm it is actually serving

A restart command returns when the platform accepts the restart, not when the container
serves. Run the smoke test, and **keep `--boot`** - without it you are re-running five checks
that all passed against a release that served a blank white screen, because the server was
fine and React never initialised. "SPA is served" and "SPA boots" are different claims.

```bash
node scripts/verify-deploy.mjs --url http://127.0.0.1:3001 --auth-disabled --boot
```

Drop `--auth-disabled` if the instance runs with Entra sign-in on.

**Then open the site in a browser yourself.** The boot check answers "did anything render",
not "does it look right", and this step is the last chance to notice the difference.

See "A green deploy is not a live deploy" in AGENTS.md.

### Versioning

- **Default to a patch bump.** Increment Z: `vX.Y.(Z+1)`. This is the right choice for
  almost everything, including a new migration, a new panel on an existing page, or a new
  endpoint on an existing domain. Incremental work on something already shipped is a patch,
  however substantial the diff.
- **A minor bump is reserved, not automatic.** Take Y only for a genuinely new user-facing
  domain, or when a run of patch releases has added up to something worth naming. Bumping Y
  once per increment produces a wall of `vX.Y.0` tags across one body of work and hides
  which release actually mattered.
- **Major bump** for a breaking change or a milestone.

When a queue of related work is in flight, such as a sequence of handoff plans against the
same feature, every one of them is a patch. The minor bump, if it is warranted at all,
comes once at the end.

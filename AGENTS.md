# Asset Tracker

Full-stack terminal tracker.

> **About this copy.** These rules were written for the repository this code was cut from, and
> they describe that repository's GitHub setup: a protected `main`, required status checks, a
> release cadence, dependency bots. None of that travels with a clone. On your own copy, branch
> protection and required checks are settings you turn on, `release.yml` has never run, and the
> incidents recounted below happened elsewhere. The working rules still hold; the gates that need
> a server are yours to recreate or ignore.

## ⛔ Never implement on `main`

If you are on `main`, create a branch before reading a single file or writing a single line of code.
Never implement anything on main.
The only commits that should ever land on main are merges from pull requests.

**This is enforced on the server, not just here.** `main` is a protected branch:

| Rule | Setting |
|---|---|
| Pull request required | yes, with 0 required approvals (solo maintainer - GitHub forbids self-approval, so any higher number locks the repo) |
| Required status checks | Backend, Frontend, Script tests, Style, Security Scan |
| Applies to administrators | yes |
| Force pushes / deletions | blocked |
| Linear history | required, which matches squash merging |

A direct push is rejected by the remote with `GH006: Protected branch update failed`,
including for admins. `Add PR to project` is deliberately **not** a required check, because
it is skipped for Dependabot and a skipped required check blocks the merge.

Tags are unaffected - protection covers `refs/heads/main`, and a tag is `refs/tags/*`.

The rule is reversible by a repo admin at any time (`enforce_admins` restricts pushing, not
administering), so if it proves too rigid it can be relaxed rather than worked around.

Once you are on a branch, read `.claude/context/project.md`.
It is short, tells you the tech stack, and points at the focused file you'll actually need for the current task.

## ⛔ Rules first, then plan

Read the rules before proposing a plan, a suggestion, or a next step - not after, and not instead of running them.
That means this file, `CLAUDE.md`, `.claude/commands/`, the relevant `.claude/context/patterns/`, and the available skills.

The gates are not optional and do not wait to be asked for:

| Gate | When | Not negotiable because |
|---|---|---|
| `/start` | session open, before the first file is read | it is what catches work starting on `main`, a red CI baseline, or open Dependabot alerts |
| `/ship` | before every push, not after | it audits far more than the code gates do, and hand-rolled equivalents miss things, including stale domain context files |
| `gh` account | before the first `gh` command | `gh` keeps one active account machine-wide, so the wrong one silently hits the wrong repo. `scripts/env-report.mjs` (run by `/start` step 0) prints the active account so it can be read rather than assumed |

**Hand-rolling equivalent checks is not a substitute for running the skill.**
A plan that does not name which gates apply and when is not finished.

Two failure modes worth naming, both of which have happened here:

- **Do not declare something absent from one negative search.** Tool working directories drift between calls, so a repo-relative glob can resolve somewhere unintended and return nothing. Confirm the cwd, prefer absolute paths, cross-check, and report what was actually checked.
- **Do not cache a failure across a session.** A container that was down an hour ago may be up now. Re-run the check before repeating that something is broken.

## Load-on-demand, always

Every file read costs tokens in the active session, and they stay until compaction.
Default to reading **only** what the current task needs.

| Working on... | Read |
|---|---|
| Terminals (CRUD, page, inline edit, drawer, CSV) | `.claude/context/domains/terminal.md` |
| Kits (CRUD, type, network booleans, page, drawer, CSV) | `.claude/context/domains/kit.md` |
| Sections (management, reassign, sidebar dialog) | `.claude/context/domains/section.md` |
| Contracts (POP dates, vendor, FY, inline edit, drawer) | `.claude/context/domains/contract.md` |
| Users page | `.claude/context/domains/user.md` + `.claude/context/authz.md` |
| Audit log | `.claude/context/domains/audit.md` |
| Equipment Catalog (browse, facet filter, datasheet, compare, print, editor, photo upload, Comms Library) | `.claude/context/domains/equipment.md` |
| Global Waveform Library (waveform CRUD, toggle chips in editor) | `.claude/context/domains/waveform.md` |
| Global Services Library (SATCOM service CRUD, toggle chips, CIR/MIR rows) | `.claude/context/domains/service.md` |
| Transport Library (fibre/cellular/MANET/HF CRUD, kinds, Comms Library pane) | `.claude/context/domains/transport.md` |
| Platform Library + joint compatibility matrix (platform CRUD, open category/kind, `/catalog/compatibility`, print) | `.claude/context/domains/platform.md` |
| Nets Library (net CRUD, JEM/MPU5 tabs, TX/RX, radio type) | `.claude/context/domains/net.md` |
| PACE Planner (comms card, channel wheels, card editor, print sheet) | `.claude/context/domains/pace.md` |
| Help / FAQ content, the "I need help!" dialog, the role chip | `.claude/context/help.md` |
| RBAC / auth / middleware / role changes | `.claude/context/authz.md` |
| Settings page | `.claude/context/settings-page.md` |
| Adding a page, or any page chrome: banner, title, stat strip, table, document actions | `.claude/context/patterns/frontend-page.md` |
| Folder layout | `.claude/context/structure.md` |
| Running it yourself / compose / containers / CI-CD | `docs/self-hosting.md` (+ `.github/workflows/README.md`) |

Patterns under `.claude/context/patterns/` are referenced for specific shapes (API design, error handling, validation, testing-backend, and `frontend-page` for the page framework).
Load as referenced, don't pre-load.

## Verification before pushing

Every check must pass with zero errors. Do not skip any, and do not suppress warnings.

One command runs all of them, plus the five traps below, and is what the pre-push hook calls:

```bash
node scripts/verify.mjs
```

It writes `.claude/.verify-receipt.json` on success, which the `Stop` hook reads to tell verified work from work that merely claims to be.
Backend checks run in the dev container when it is up, matching `/ship` and CI.
A missing `golangci-lint` is a failure, never a skip.

The pre-push hook calls it with a flag, and nothing else does:

```bash
node scripts/verify.mjs --reuse-receipt
```

That runs the two steps a receipt cannot vouch for and, if the receipt on disk still describes this exact tree, exits 0 without repeating the others.
Measured: **4.5s instead of 1m33s.**

Any change to the tree, a missing receipt, an unreadable one, or a receipt without a digest all fall straight back to the full run.
The decision lives in `scripts/lib/receipt.mjs` with tests in both directions, because a reuse that should not have happened is silent.

Two things to keep true when touching it:

- **`ALWAYS_RUN` names the steps whose answer can change without the tree changing, and it must stay accurate.** `preflight-versions.mjs` queries the network (`go list -m -versions golang.org/toolchain`), so "go directive is a current patch" flips from pass to fail the moment Go ships a patch release, with no commit involved. A receipt is a statement about a tree and must never speak for that. Every other step is a pure function of the files it read, which is exactly why the receipt can speak for those.
- **A name in `ALWAYS_RUN` that no longer matches a step would reduce the reuse path to running nothing, and still exit 0.** The script checks the list against `STEPS` on startup and refuses to run rather than go quietly hollow.

**What the pre-push gate now guarantees**, stated plainly so it is not inferred: not "everything was checked just now", but "everything was checked when the tree looked exactly like this, and the network-sensitive checks are current as of now".
That is the same guarantee the `Stop` hook has always made, and it is the correct one.
The digest is over file content rather than HEAD, so committing does not invalidate a receipt - which is why the ordinary verify, commit, push sequence used to pay the full run twice on every single push.

The point is not the saved minutes.
A gate that costs a minute and a half on every push is a gate people start passing `--no-verify` to, and the hook prints that flag in its own failure message.
Cheap is what keeps it switched on.

A step may pass and still print a note, by returning `warn` beside `ok: true`.
Notes are replayed in full at the end of the run and their step names are recorded in the receipt, so a receipt says what the run saw rather than only that it ended well.
The channel exists because without it every check here had two options, block the push or say nothing, which forced steps reporting a maintenance signal to pick "block" - see the module currency note under "Dependency drift does not block a push" below.

Its first step is the version preflight, which runs first because it compiles nothing:

```bash
node scripts/preflight-versions.mjs            # the 12 compatibility checks
node scripts/preflight-versions.mjs --release  # plus the 3 tag/CHANGELOG checks
```

See "Versions are checked before CI, not by CI" below for what it covers and why each check is there.

The individual commands, for when one needs running on its own:

```bash
cd frontend && npx tsc --noEmit          # TypeScript
cd frontend && npm run lint              # Frontend lint
cd frontend && npx vitest run            # Frontend tests
cd backend  && golangci-lint run ./...   # Backend lint
cd backend  && go build ./... && go test ./...
```

Never substitute `go build` as a lint proxy.
If `golangci-lint` is not installed locally, say so explicitly and do not push until confirmed clean.

Five traps the commands above won't catch:

- **Service mock coverage.** Any new hook added to the sidebar must appear in every `vi.mock('@/services', ...)` in test files, or CI fails silently.
- **Migrations.** Sequential numbering, no destructive ops without review, and every `.sql` file must start with `-- +goose Up`.
- **Debug leftovers.** No `console.log`, `TODO`, `FIXME`, or `debugger` in committed code.
- **CSV coverage.** Every directory under `backend/internal/domain/` needs an entry in `backend/internal/domain/csv-manifest.json` declaring whether it has a CSV export, import and template. A domain absent from that file fails verification; a `"no"` needs a written reason and a `"deferred"` needs an issue number. There is no default, because the default is what six domains silently took for eight releases - Equipment, Waveforms, Services, Transports, Nets and PACE all shipped with no export and no record of whether that was a decision. The check also refuses an import with no template (nothing tells the user what header row to use) and a template with no import (a file that leads nowhere).

- **The built bundle.** Every command above reads *source*. `vite build` exiting 0 says nothing about whether the bundle it emitted runs, and a cyclic chunk graph builds cleanly and then serves a blank white screen - which shipped, in an earlier release. `bundle graph` builds the frontend and fails on a cycle. It is the only step in `verify.mjs` that inspects build output, and it costs 0.8s. See "A green build is not a running app" below.

When adding a domain, update the README Features section and `.claude/context/structure.md`, create `.claude/context/domains/<domain>.md`, add an entry to `backend/internal/domain/csv-manifest.json` declaring its CSV export, import and template state, and add a row to **both** load-on-demand tables: the one above in this file and the one in `.claude/context/project.md`.

## Dependency drift does not block a push

Version *disagreements* block, because they mean the build is not constructible.
Version *drift*, meaning a dependency that is merely behind latest with nothing wrong with it, does not.
Those two used to be the same check, and conflating them put dependency maintenance on the critical path of every change in the repo.

The measured shape of the problem, taken on 2026-09-02:

| | |
|---|---|
| PR opened to merged, last 10 PRs | 4 to 6 minutes |
| PR CI, the blocking one | about 4 minutes |
| `verify.mjs`, full local gate | 2m13s |
| Dependabot PRs opened, all time | 10 |
| Dependabot PRs that merged themselves | 0 |

So the mechanics were never slow. Three other things were.

**`checkGoModules` returned `ok: false` on any direct module behind latest, with `GO_MODULE_HOLDS` empty.**
Read that literally: the moment any upstream author anywhere cut a release, the gate went red, on whatever branch happened to be checked out, regardless of what it changed.
With the `Stop` hook refusing to end a turn without a passing receipt, bumping a dependency became a precondition for shipping a CSS fix.
It now returns a `warn` instead.
That costs nothing in safety, because the security half is gated somewhere with more authority: `Security Scan` is a **required** status check on `main` and runs Trivy at CRITICAL,HIGH with `--exit-code 1` plus govulncheck over `./...`, so a vulnerable module cannot merge whatever `verify.mjs` says.
What the old behaviour uniquely caught was the harmless case.

**`/ship` check 2c did the same thing to npm**, auto-bumping every outdated direct dep and committing it before the push.
Every feature push was therefore also a dependency PR, with unrelated lockfile churn in the diff.
It now reports.

**Nothing merged Dependabot's PRs.**
The bot was configured and working, and its output became a queue drained by hand: bumps sat for days and then merged in one sitting.
Meanwhile the drift they would have closed was red-lighting unrelated branches through the check above, so not merging them was paid for on every branch rather than only on theirs.
The fix was to let GitHub auto-merge patch and minor bumps once the same required checks a human would wait for are green, and to keep major bumps, the whole `docker` ecosystem, and `gofiber/fiber` at any update type for a person to read. This copy of the repo ships without that workflow and without a `dependabot.yml`: it is shared as-is, not maintained on a release cadence, so no bot opens PRs here. Security alerts are a repository setting and still fire.

The rule to carry away: **a check either blocks or it reports, and which one it does is a claim about severity that has to be argued.**
"Dependencies should be current" is true and is not a reason to stop a push.

## /ship is scoped to the diff

Checks 7 through 11 audit prose keyed to domains and pages: README's Features section, `structure.md`'s trees, the two load-on-demand tables, the domain context files, and the memory index.
A dependency bump or a workflow edit cannot move any of those facts.
They were still walked in full, one prose instruction at a time, on every push, and they are the most expensive part of an audit that runs on `model: haiku`.

Step 0b runs `node scripts/ship-scope.mjs`, which prints `DOC_CHECKS=required` or `DOC_CHECKS=skip` and always exits 0.
It is not a gate and cannot fail a push.

Two properties worth knowing before touching it:

- **The verdict is computed, not judged.** `/ship` runs on a small model precisely because its checks are meant to be mechanical, and "does this diff touch a domain" is exactly the kind of question that must not be left to inference, because inference gives a different answer on different runs. The logic lives in `scripts/lib/ship-scope.mjs` with unit tests in both directions, the same shape as `bash-guard`.
- **It reads the working tree as well as the committed diff.** `/ship` audits *before* it commits, since the release sequence commits at step 1, so on most runs the changes that matter are still uncommitted and `git diff main...HEAD` is empty. Reading only the committed diff would make the common case look out of scope, which is the dangerous failure: it skips the checks for the wrong reason and looks identical to a correct skip.

The bias is deliberately toward running the checks.
Anything resembling a domain, a page, a context file, or tracked prose puts them back in scope, and a diff that cannot be read does too.

## Versions are checked before CI, not by CI

Deploys used to be uneventful. The stretch that stopped being uneventful was not a run of bad code - it was a run of **version disagreements**, each one found by a CI job six minutes in, and each fix creating the next one.

Three in a single day, 2026-08-27:

| Change | Fixed | Broke | How it announced itself |
|---|---|---|---|
| golangci-lint pin to v2.13.1 | the container lint | Backend | `go install` refused: `requires go >= 1.26.0 (running go 1.25.13)` |
| `go.mod` to a bare `1.26.0` | Backend | Security | 21 stdlib CVEs in code nobody here wrote |
| a comment edit to `ci.yml` | nothing | everything | startup failure: zero jobs, no logs, nothing to read |

Every one was statically checkable in seconds. None was checked, because the pins live in six different files and nothing ever compared them to each other.

`scripts/preflight-versions.mjs` is that comparison. It runs as the first step of `verify.mjs`, so the pre-push hook and the `Stop` gate both gate on it, and it also runs as its own fast CI job for commits that arrive from the other machine or the web UI. It takes about two seconds warm and compiles nothing.

| Check | The relationship it holds |
|---|---|
| workflows parse | `actionlint` over `.github/workflows/`. A YAML error here is a **startup failure**, not a failing job - so there is no log to read and the PR waits forever |
| golangci-lint pins agree | `ci.yml` and `backend/Dockerfile.dev` name the same version, so a finding cannot appear in one place and not the other |
| golangci-lint pin installable | the pin's declared `go` is at or below the `go.mod` directive. **Raise go.mod first, then the pin** |
| go directive is a current patch | the directive is the newest patch of its minor. This is a security check: `setup-go` installs the *exact* patch named there, so a stale one hands govulncheck an unpatched stdlib |
| container Go covers the module | `Dockerfile.dev`'s base image is at or above the directive, or the container's lint step is lost entirely while CI stays green |
| node version agrees | `ci.yml`'s `node-version` satisfies `engines.node` |
| postgres version agrees | CI's service container matches `compose.yaml` and `compose.selfhost.yaml`, so a migration cannot pass CI and fail on the server people run |
| no floating tool pins | no `@latest` anywhere. An unpinned install is a build that changes with no commit behind it |
| mise pins agree | the root `mise.toml`'s go pin **equals** `backend/go.mod`, its node pin matches `ci.yml`, and `diagrams/mise.toml`'s typst pin is an exact version. Equality rather than compatibility, because the directive is CI's toolchain pin: "close enough" means a `mise` user compiles against a different stdlib than the one Security scans. Nothing read either file until this check existed, which is how the root one sat a full minor behind in a file whose own comment claims this script owns that number |
| action versions agree | one major per action across all workflows. `actions/checkout` sat at v6 in one job and v7 in six others |
| typescript peer range | TypeScript stays under `@typescript-eslint`'s ceiling, or type-aware linting stops resolving |
| jest-dom shim still needed | settles the `frontend/src/test/jest-dom-matchers.d.ts` bet in **both** directions, by reading the `Assertion` arity out of the installed vitest types. See the Vitest entry under "Dependency decisions that are settled" for what the shim is and why the second direction is the one that matters |

`--release` adds three more, for the moment the tag goes on: the CHANGELOG has a dated top section, that version is not already a tag, and it increments the latest tag. They exist because the release sequence writes the CHANGELOG in the PR and tags the merge commit afterwards, which leaves two quiet ways to ship a release whose notes describe something else.

Three things to keep true when touching it:

- **Every check prints the value it verified, not just "pass".** `go 1.26.8 is the newest 1.26 patch` is a check; `pass` is a claim. The distinction matters because several of these checks would pass vacuously against a regex that stopped matching after a file was reformatted.
- **A new check needs a negative test before it is trusted.** All twelve were verified by reintroducing the real failure and confirming the check goes red. A check that has never failed has not been shown to work.
- **A check must give the same answer on every machine, and that has to be forced rather than hoped for.** `actionlint` runs `shellcheck` and `pyflakes` over `run:` blocks *when it finds them on PATH* and skips them silently when it does not. So the first version of this passed on a machine which has neither, and failed on the GitHub runner, which has shellcheck - on quoting notes in a deploy workflow nobody had touched. Both integrations are now disabled by explicit flag. A preflight whose answer depends on what happens to be installed is the disease, not the cure.

## Docs are checked the same way, and for the same reason

A version pin and a sentence of prose fail identically: both claim something about the system, and
neither is compiled. A deploy page once told an operator to pass a `-f version=` flag to a
workflow that declared no inputs at all, so the command could only ever fail; the README said CI
runs five jobs when it runs six; a link pointed at a docs page that never existed.
Each was one parse away from being impossible to write.

(Note the phrasing above. A doc must not contain a copy-pasteable wrong command even as an example of
one, which is why the flag and the workflow are named separately here - the check cannot tell a quoted
bad example from an instruction, and it is right not to try.)

`scripts/check-docs.mjs` is that parse. It runs inside `verify.mjs` beside the version preflight and as
part of the CI preflight job, and it compiles nothing.

| Check | The relationship it holds |
|---|---|
| workflow inputs | every `-f <name>=` in prose names an input the workflow's `workflow_dispatch.inputs` declares. A documented flag that the workflow rejects is worse than no documentation |
| CI job lists | job ids named in prose match `ci.yml`'s `jobs:` keys, both directions, so a sixth job cannot land while the prose still says five |
| versions in prose | Go, Node and Postgres versions quoted in any tracked `.md` match `go.mod`, `ci.yml` and `compose.yaml`. Prose is where a version pin goes stale invisibly, because nothing installs from it |
| relative links resolve | every relative markdown link points at a file that exists. Note the limit: it sees links, not prose. The dead docs page was named in a sentence rather than linked, so nothing static was ever going to catch that one |
| migrations named in prose | every `NNN_name.sql` mentioned in prose exists in `backend/migrations/` |
| diagrams match the code | every table a migration creates is drawn in `data-model.typ`, every `.typ` has both rendered themes committed, and a prose table **or migration** count is the real count - across the tracked `.md` files **and** the `.typ` sources themselves. `docs` was `git ls-files '*.md'`, so the count check had been reading every file in the repo except the diagrams it is a claim about. It also fails a responsive diagram that kept a `pt` width, which is the only way a silently broken re-render is visible from outside the render. The diagrams were the last part of the doc surface nothing held to the code, which is the whole argument this section makes |

**The diagram check compares content, never timestamps.** Git does not preserve mtimes, so on a
fresh clone every file carries checkout time and an "SVG older than its `.typ`" test is either
vacuous or flaky depending on checkout order - a gate that answers differently on two machines
is the disease this repo already named once, under `actionlint` and `shellcheck`. What it can
check honestly is that the source names every table the schema has, and that both themes were
rendered at all.

Its first version searched the whole `.typ` for each table name and **passed the negative test**:
Typst `<label>` cross-references repeat a table name for its enclosing group and every foreign
key arrow, so deleting a table's own card left the bare word behind three times over. It now
searches only the quoted string literals, which are the box labels a reader sees. Same lesson as
`check-bundle.mjs`'s regex: the pattern is the check.

**A knowingly-wrong file gets a written exception, never a silent one.** The exceptions map at the top of
the script takes a reason per entry, the same demand `csv-manifest.json` makes of a `"no"` and
`openapi_test.go` makes of an undocumented route, and for the same reason: "we meant to" and "nobody
noticed" are indistinguishable in a diff a year later.

## A green build is not a running app

An earlier release shipped a blank white screen. Every gate in this repo was green: `vite build` exited 0,
`verify.mjs` passed every step, all six CI jobs passed, the release built and pushed, and
`verify-deploy.mjs` passed all five of its checks against the running site. The SPA served HTTP
200 with correct HTML and correct asset hashes, and every asset returned 200. The page was blank in
every browser, including a private window.

The one visible symptom was in the browser console:

```
TypeError: e is not a function    at vendor-*.js:1:61
```

**The mechanism.** `vite.config.ts` had three `build.rollupOptions.output.codeSplitting.groups`
forcing react, `@mui` and `@tanstack` into named chunks. That grouping decides where library code
goes and says nothing about where rolldown puts its own runtime helpers. Before the change those helpers
were emitted as a dedicated `rolldown-runtime-*.js` chunk that everything imported, which is
acyclic by construction. The change added files whose imports shifted the graph enough that no runtime
chunk was emitted at all; the helpers were folded into the auto-generated `auth-service` chunk, and
the result was a cycle:

```
vendor -> auth-service -> query -> vendor
```

`vendor`'s first line reads a helper out of `auth-service` and calls it at module scope. Mid-cycle,
that binding is still `undefined`. React never initialises, nothing mounts, and the document stays
empty.

**Why every gate missed it.** A cyclic chunk graph is legal ES modules. It only breaks when a
module reads across the cycle at top level, so it compiles, type-checks, lints and unit-tests
clean - the tests run against source through Vite, not against the emitted bundle. And
`verify-deploy.mjs` deliberately checks that `/` returns HTML; it cannot check that the HTML's
JavaScript runs. **Nothing in the repo looked at build output at all.**

`scripts/check-bundle.mjs` now does, and it is wired into `verify.mjs` as `bundle graph`. It builds
the frontend and fails on any cycle in the emitted chunk import graph. Three things to keep true:

- **The manual `codeSplitting.groups` are gone deliberately.** Adding a fourth group for msal did
  not restore the runtime chunk, so this is not a grouping to tune. Left alone, rolldown emits the
  dedicated runtime chunk and the graph is acyclic. Reintroducing groups means owning this failure.
- **The check's regex is the check.** Its first version required whitespace before `from`, which
  minified output does not have - it emits `}from"./x.js"`. That version found 18 edges across 46
  chunks, reported no cycles, and **passed on the very bundle that was down in production.** The
  working version finds 213 edges. Any edit here must be re-run against the negative case.
- **It was verified in both directions before being trusted**, by rebuilding with the broken config
  and confirming it goes red. A check that has never failed has not been shown to work.

The general lesson, and the reason this has its own section: every other gate here reads source.
This class of bug lives in the output, and the only honest way to catch it is to look at what was
actually built.

## A green deploy is not a live deploy

A container platform's restart command returns when the platform **accepts** the restart, not when the container is up and answering.
So a deploy step can go green against a site still serving the old image, still booting, or failing to boot at all.
The only thing closing that gap was remembering to curl it afterwards, and remembering to is not a control.

`scripts/verify-deploy.mjs` is the last step of any deploy, so a green deploy means the build is serving:

```bash
node scripts/verify-deploy.mjs --url https://<host> --boot
node scripts/verify-deploy.mjs --url http://localhost:3001 --auth-disabled --boot   # dev and self-hosted
```

| Check | What it establishes |
|---|---|
| `/health` 200, polled | the container is up at all. The one check that legitimately takes time, so it is the one that polls |
| `/ready` 200 | it reached its dependencies, Postgres included |
| `/` returns HTML | the SPA is served, not just the API |
| `/api/v1/terminals` 401 | the route **exists** and enforces auth |
| an unregistered route 404s | the control that makes the 401 mean anything |
| `--boot`: `#root` is not empty | the SPA **starts**, not merely that it was served |

**`--boot` is the half that was missing, and it took an outage to add.**
Every other check in that table passed against an earlier release, which served a blank white screen in every
browser: `/health` and `/ready` were 200, `/` returned correct HTML, every asset returned 200, and
the 401-vs-404 pair confirmed the routes were registered. The server was entirely fine and React
never initialised. "SPA is served" and "SPA boots" are different claims and only the first one was
ever being made.
It runs the page in headless Chrome with `--dump-dom`, which prints the DOM **after** scripts run,
and fails if the backend's empty `<div id="root"></div>` is still empty. Measured both ways: the
broken bundle dumps 962 bytes with the empty root intact, a working one tens of kilobytes without
it. Verified end to end against the broken bundle, where the five original checks all pass and only
this one fails.
No npm dependency: it drives a browser the machine already has, and a deploy job should resolve
`CHROME_PATH` **before** any deploy step so a missing browser costs a fast red run rather than a
deployed image nobody verified. A missing browser is a failure, never a skip - a boot check that
quietly does nothing is the hollow gate this whole section exists to replace.
What it does not do is read the console; it answers "did anything render", which is the question a
blank page poses.

The 401 and the 404 are a pair, and neither is worth much alone.
A 401 by itself could be a blanket auth filter in front of a route that was never registered; the 404 on the nonsense path is what proves the server tells them apart, so the 401 really does say "this route is deployed".
A 200 on the authed route is a finding in the other direction - an unauthenticated read, the class of bug an earlier pull request closed - and the script says so explicitly rather than just failing.

`--auth-disabled` exists because dev runs `auth.Config` in `ModeNone`, where `RequireAuth` is a pass-through and 200 is correct.
Expecting auth is the **default** so that forgetting the flag against a real deployment fails loudly instead of quietly weakening the check.

## CSV is declared once, per domain

A domain declares its CSV columns once, as a `csvtable.Table` in `<domain>/csv.go`.
Export, the import template and the importer all read that one declaration, so they cannot describe different column sets.

Two properties are worth knowing before touching it:

- **A column with no `Set` is server-owned.** That single fact is what keeps it out of the template and out of import. There is no second flag to forget, which is how "exportable but not importable" used to get half-declared.
- **The frontend does not keep its own column list.** `backend/internal/csvregistry` renders `frontend/src/generated/csv-columns.ts`, and the picker imports it. A Go test fails when the committed copy is stale. Before this, every export dialog retyped its domain's list under a comment asking the next person to keep it in sync, and the contracts dialog drifted two columns for months without anyone noticing.

Regenerate the manifest in the same commit as any column change:

```bash
cd backend && go test ./internal/csvregistry -update
```

## CSV controls live in the header, not on pages

Export, Template and Import are one icon button in the app header, right of the page
picker, opening a menu of the three. Identical on every route.
The dataset is chosen inside the dialog.

They were three buttons until the bar ran out of room. Six controls across two
clusters had these three dropping their text labels below `md` to stop the AppBar
overflowing around 1280px; collapsing both clusters (the Add cluster is now a `+`
with the same shape) is what bought the width back and retired that breakpoint.
`CsvToolbar` on the Settings page still renders the three separately - that is the
locked single-domain case described below, and is now the only place the strip
survives.

That is not cosmetic.
While the controls were per-page, a domain without a page had no CSV anywhere in the
app - which is how Waveforms, Services and Transports shipped exports nobody could
reach, and Equipment, Nets and PACE went eight releases with no export at all.
A route-conditional control cannot cover ten domains and five pages.

Three things to know before touching it:

- **`csv-header-controls.tsx` calls no `@/services` hook.** Many test files mock
  that module with a closed object, and the ones that render `MainLayout` reach the
  header through it, so a service hook added here fails all of them at once as a spray
  of unrelated-looking failures. Do not trust a number written in prose here: the
  authority is `checkServiceMocks` in `scripts/verify.mjs`, which reads the hook list
  out of the layout sources at runtime and resolves each test to its subject, so it
  catches a hook added tomorrow. `header.test.tsx` mocks only `useLogout` for exactly
  this reason - it is the guard, not an incomplete mock. The dialogs mount on click,
  so their hooks are fine.
- **One dataset never becomes a zip.** `planCsvRequest` in `csv-selection.ts` is pure
  and is where that rule lives, so it is a unit test rather than something asserted
  by rendering. Two or more datasets POST to `/api/v1/export/bundle`.
- **Import is single-select on purpose.** A CSV has one header row and loads into one
  table. Multi-import is either N file pickers or a zip routed by filename, neither of
  which is what someone uploading one filled-in template is asking for.

`CsvToolbar` still exists for the locked single-domain case, which is the Settings
catalogue and nothing else. It is not the thing to reach for on a new page.

## The slide export, where every trap is a silent one

The two printable sheets export to a `.png`, the clipboard and a `.pptx`. The writer is ours:
`sheet-export/pptx.ts`, `zip-store.ts` and `eot.ts` are the whole thing, with no dependency, because
`pptxgenjs` pulls `image-size`, which carries two HIGH advisories with `patched: NONE` at every
version, so `/ship` check 2b would fail on every push from here on.

Three rules, and what unites them is that breaking any of them leaves a file that passes every
local check and is wrong anyway.

**The control is per-page, while CSV is in the header, and the difference is scope.**
CSV export is *dataset* scoped: ten domains, five pages, three domains with no page at all, which
is how six domains shipped exports nobody could reach. The dialog exists to answer "which dataset?".
The sheet control is *document* scoped: it exports the DOM on screen at the scale currently set, so
there is no such question. In the header it would manufacture one and sit permanently disabled on
every route without a sheet. Do not "fix" the inconsistency.

**`python-pptx` is not a validity check.** It accepted every malformed build this repo produced,
reporting the correct slide size, slide count and picture placement each time, because it parses
lazily: the parts it was never asked about were the broken ones. Two builds were refused by a real
consumer while `python-pptx` called them fine. Validate a package by parsing **every** part - which
`pptx.test.ts` now does, along with asserting the relationship graph closes - and then open it.

**`ppt/fonts/*.fntdata` is EOT, not an sfnt.** A raw TTF written there is the worst kind of wrong:
the package stays valid, every part parses, the relationship graph closes, Keynote opens the file,
and the fonts are silently ignored. It shipped that way once. Nothing local can catch it either,
because Keynote ignores embedded fonts however correct they are and PowerPoint for Mac is version
dependent about them, so **a Mac showing substituted type is not evidence about the embedding.**
`eot.ts` writes the container; the property that keeps it cheap is that with `Flags = 0` there is no
subsetting, no MicroType Express compression and no XOR, so the payload is the unmodified font file.

One more, less severe but the same shape: a `wrap="none"` text box may be shrink-wrapped to its
single line by the consumer. Harmless for left-aligned text, which still starts at the measured x;
not harmless for centred text, where a narrower box re-centres the string and slides it sideways.

## Environment traps that have cost a session before

These are not style rules. Each one has silently wasted real time here.

- **`npm install` in the `frontend-dev` container does not touch the host's `node_modules`.**
  The two trees are separate, and `verify.mjs` runs the frontend steps on the **host**.
  Bumping a dependency only in the container leaves `package.json` advertising the new version while every local check still exercises the old one, and CI becomes the first thing to install the version nobody ran.
  Install in both, then confirm with `node -p "require('./frontend/node_modules/<pkg>/package.json').version"`.
- **The dev container has been bind-mounted to an orphaned worktree before**, and served stale code for a whole session.
  If the browser disagrees with the source, check the mount before you check anything else.
- **A working directory persists between Bash calls, and the next call will not mention it.**
  A `cd frontend` in one call left a later `wc -l .claude/commands/ship.md` reporting "No such file
  or directory" for a file that plainly exists, because the relative path resolved under
  `frontend/`. The tool answered truthfully about somewhere nobody meant to be, which is the same
  shape as the container-mount entry below: not a wrong answer, an answer about the wrong place.
  It is also the concrete form of the rule at the top of this file about not declaring something
  absent from one negative search.
  **Every command either uses absolute paths or does its own `cd <absolute> && …` in the same
  call.** Never rely on a `cd` from a previous one, and when a path check comes back empty, confirm
  the working directory before believing it.
- **An `@page` rule inside an emotion `sx` object is silently dropped.**
  Emotion nests it inside the component's class rule, where `@page` is invalid, so the browser
  ignores it with no error and `catalog-tokens.css`'s `@page { size: letter portrait }` wins.
  It has now broken two print routes: `pace-print-page.tsx` and the compare print page, which
  printed a landscape sheet on portrait paper. Inject page rules through a `<style>` element in
  `document.head` instead, as both of those pages now do.
- **`chrome --headless --print-to-pdf` hangs on a route that calls `window.print()`.**
  The page's own print dialog never closes in headless mode, so the process sits until killed.
  To check real print output, drive Chrome over the DevTools protocol instead: stub
  `window.print` with `Page.addScriptToEvaluateOnNewDocument`, wait for the page to call it, then
  `Page.printToPDF` with `preferCSSPageSize: true`.
- **Never `rm -rf frontend/dist` while the dev container is up.**
  `podman inspect app` shows why: `frontend/dist` is bind-mounted to **`/app/static`**, which the
  Go binary embeds. Deleting the directory destroys the mount's source, so `/app/static` vanishes
  inside the container and every Go command fails with a message that names neither the mount nor
  the frontend:

  ```
  pattern ./...: open static: no such file or directory
  ```

  It reads like a broken Go package and it survives rebuilding `dist`, because the mount still
  points at the deleted inode. `go build`, `go vet` and `golangci-lint` all fail together, which is
  the tell: a real Go problem rarely takes out all three with an `open` error. `podman restart app`
  re-resolves the mount and fixes it.

  This cost a debugging detour during the blank-screen outage, where a frontend-only branch produced a
  red `backend lint` and looked briefly like a second, unrelated regression. If a backend step
  fails on a branch that touches no Go, check the mounts before reading any Go.

- **`scripts/check-em-dash-ci.mjs` diffs `merge-base..HEAD`, committed only.**
  An uncommitted fix to a finding looks like it did nothing. Commit, then re-run.
- **A squash merge breaks `git merge-base --is-ancestor`.**
  Main takes a new SHA, so probing a pre-merge branch SHA always answers "not merged" however merged the content is.
  Compare file contents, or check the PR, before concluding a branch has unshipped work. This has produced a false alarm at least once.
- **A push can produce no workflow run at all, and the PR then waits forever.**
  An earlier pull request's first push created zero runs: `gh pr checks` printed "no checks reported",
  `actions/runs?head_sha=...` returned `total_count: 0`, and `mergeStateStatus` sat at
  `BLOCKED` with an empty check list. Actions was enabled, every workflow was `active`, and
  the branch touched no workflow file. Nothing reports this, because "required check has not
  reported yet" and "the run was never created" look identical from the PR page.
  An empty commit (`git commit --allow-empty`) re-fires `synchronize` and it ran normally;
  the commit vanishes on squash merge, so it costs nothing.
  Distinguish it from the case that looks the same but is not: an invalid workflow YAML also
  produces no run. Validate the file with a real parser before blaming the platform - there is
  no `pyyaml` or JS yaml lib on some machines, but `gopkg.in/yaml.v3` is in the Go module
  cache and a five-line throwaway program settles it.
  Check `total_count` on the API rather than reading the PR page, so "pending" and "never
  started" stop being the same observation.
- **The `PreToolUse` branch guard covers Bash as well as `Write|Edit|NotebookEdit`, but it is still one session's seatbelt.**
  It used to match the three file-writing tools and nothing else.
  A `sed`, a heredoc or a `git commit` routed through Bash was invisible to it, which made the
  guard trivially bypassable without anyone intending to bypass it: the shortest path to
  editing a file is often a Bash command, so the tool that was watched was the one least used.
  Bash is now in the matcher, and `scripts/lib/bash-guard.mjs` classifies the command so that
  adding it did not simply block `git status` on `main`.
  Read-only work stays allowed by design, `git merge-base` included, because a guard that
  trips on an inspection command is a guard somebody switches off within a day.
  Both directions are unit tested in `scripts/lib/bash-guard.test.mjs`: what must be blocked,
  and what must keep working.
  This used to matter most for `CHANGELOG.md`, which the release sequence told you to commit
  straight to `main`, so the documented process routed around the rule this file opens with
  and earned a direct-to-main commit every single release.
  That is now closed from the server side rather than by a carve-out: see the protection
  note under "Never implement on `main`" above.
  **The scope limit has not changed and is the part worth remembering.**
  This is a hook in one Claude Code session on one machine.
  It does not constrain a human in a terminal, the web UI, or the other checkout, so it is an
  early warning and never the thing that makes a rule true.
  Branch protection is what makes the rule true.

## The page banner is a component, not an sx snippet

`MainLayout` wraps every page in a `CONTENT_GUTTER` padding box.
That is right for page content and wrong for a bar meant to meet the sidebar and the header, which has to cancel the gutter with a negative margin.

That cancellation was copy-pasted verbatim into three list pages and absent from four banner pages, so half the app had flush bars and half did not.
It now lives in `components/common/page-banner.tsx` as `PageBanner`, with `variant="rail"` for the amber-underlined bars and `variant="plain"` for the list toolbars.

Two things to know before touching it:

- **The bleed is derived from `CONTENT_GUTTER`, exported by `main-layout.tsx`.** Do not restate `-3`. The whole reason seven pages could break silently was a magic number none of them imported.
- **`display: flex` belongs to the rail variant only.** The plain strip stacks a stat row above a toolbar and must stay a block container, or its children land side by side.

The invariant worth remembering: a `PageBanner`'s left edge always equals `#main-content`'s left edge, at any width.
That is what makes it flush against the sidebar on desktop and against the viewport on mobile, without overflowing either.

**The title inside it is a component too: `PageTitle`, in the same file.**
Ten pages restated the title style inline and had drifted to three sizes and two colours: 14px and 15px in amber, and Compare's 18px in white.
`PageTitle` is Compare's size and tracking in amber, rendered as the page's `h1`; pass `noWrap` for a title built from data.
A new banner page uses it rather than styling its own, for the same reason `PageBanner` exists at all.
The switches beside it follow the same rule from the other side: a banner or toolbar switch is `chipToggleSty(active, true)`, whose padding matches `panelToggleSty`, so every switch in a page's top strip is one height.

## Dependency decisions that are settled

- **`backend/go.mod` and the golangci-lint pin are locked to each other, in both directions, and the order you move them in is the whole trick.**
  Two constraints, pointing opposite ways:

  1. **The linter cannot be older than the module.** It refuses to run when the Go it was
     **built with** is lower than the `go` directive it analyzes. Measured on 2026-08-26 by
     raising go.mod to 1.27.0 against a go1.26-built binary:

     ```
     Error: can't load config: the Go language version (go1.26) used to build
     golangci-lint is lower than the targeted Go version (1.27.0)
     ```

     It exits without analyzing anything: a total loss of linting, not a warning.

  2. **The pin cannot be newer than the module either.** CI installs the linter with
     `go install` under `setup-go` reading go.mod, so the Go doing the building *is* the
     directive. Pinning v2.13.1 (which declares go 1.26.0) while go.mod said 1.25.13 failed
     the Backend job on 2026-08-27:

     ```
     github.com/golangci/golangci-lint/v2@v2.13.1 requires go >= 1.26.0
     (running go 1.25.13; GOTOOLCHAIN=local)
     ```

     That is the same failure `/ship` check 5b records from the v1.0.0 ship, walked into a
     second time.

  So **raise go.mod first, then the pin.** go.mod went to 1.26 on 2026-08-27 for exactly
  that reason, which is what makes v2.13.1 installable. It is not a free-floating "stay
  current" bump. One command says what the next ceiling is:

  ```bash
  go list -m -f '{{.GoVersion}}' github.com/golangci/golangci-lint/v2@<newest>
  ```

  **There is a third constraint, and it binds on the patch digit rather than the minor:
  the `go` directive is also the toolchain pin for CI.** Both the Backend and the Security
  jobs resolve Go with `go-version-file: backend/go.mod`, and `setup-go` installs the
  *exact* patch it finds there. So the directive is not only a statement about language
  version - it decides which stdlib CI compiles and scans against.

  Raising it to a bare `.0` therefore hands govulncheck the base release of that minor,
  carrying every stdlib CVE fixed since. Measured on 2026-08-27, moving 1.25.13 -> 1.26.0
  fixed Backend and broke Security in the same commit, with 21 findings, all of them
  `Fixed in: go1.26.1/.2/.3` and none of them in code this repo wrote. It went to 1.26.7
  and the count returned to 0.

  The trap is that 1.25.13 was a *patch* and so was quietly current, which is why the
  directive had never been thought of as a security input before. **Land on the newest
  patch of the minor, never the bare `.0`:**

  ```bash
  go list -m -versions golang.org/toolchain | tr ' ' '
' | grep -o 'go1.26.[0-9]*' | sort -V | tail -1
  ```

  **The Docker base images are half of this constraint, and the half this file used to
  deny.** For `go build` they genuinely are irrelevant: `golang:1.27-alpine` compiling a
  module whose directive says 1.26.0 is fine, Go is backward compatible, and a newer
  compiler building an older language version is the normal case. That much was right, and
  it is why the old comments' Air reasoning ("bumping the base image past 1.25 would
  outrun the Air pin") describes a minimum while golangci-lint's describes a maximum -
  opposite directions, read separately.

  What was **wrong** was extending "the base images can and do run ahead" to the linter,
  which type-checks the standard library **source** shipped in the image and so cannot be
  older than it. Two distinct failures, both measured inside `golang:1.27.0-alpine`:

  ```
  # prebuilt v2.12.2 binary (built with go1.26) - dies before analyzing anything
  panic: file requires newer Go version go1.27 (application built with go1.26)

  # v2.12.2 REBUILT with the image's go1.27 - gets further, then staticcheck dies
  buildir: package "poll": unexpected expr: *ast.KeyValueExpr
  ```

  The second is the instructive one. Building from source clears the version gate but not
  the vendored `honnef.co/go/tools` v0.7.0, which cannot build IR for 1.27 stdlib. **So the
  image's Go sets a floor on the linter version, not just on how it is installed** - the
  container needs v2.13.1 whether or not CI does, and "one pin, built from source
  everywhere" is not sufficient on its own. All three places run v2.13.2 today, which is
  what stops a finding appearing in one and not another.

  Two rules to carry away:

  - **Never install golangci-lint as a prebuilt binary anywhere in this repo.** Build it
    with `go install`, so the toolchain that builds it is the one it analyzes against.
  - **Check what a container's linter was actually built with after any base-image bump**,
    because nothing else reports it:

    ```bash
    podman exec app golangci-lint version
    ```

- **Vitest is on 5.x, and it needs a local type shim that is checked rather than remembered.**
  `@testing-library/jest-dom` augments vitest's `Assertion` interface so its matchers reach `expect(...)`.
  jest-dom 7.0.1, which is the newest release, declares `interface Assertion<T = any>`; vitest 5 declares `interface Assertion<R extends void | Promise<void> = void, T = unknown>`.
  TypeScript does not merge two declarations of one interface that disagree on type-parameter count, so the augmentation silently does nothing and every `toBeInTheDocument`, `toBeChecked` and `toHaveTextContent` drops off the type.
  The failure is a thousand `TS2339`s in the test suite, none of which name the real cause.

  `frontend/src/test/jest-dom-matchers.d.ts` redeclares the merge at vitest's arity. It is nine lines and it is a bet that upstream will fix this.

  **A bet nobody checks is how a workaround becomes permanent**, so the bet is settled on every run by the `jest-dom shim still needed` check in `preflight-versions.mjs`.
  It reads the arity straight out of the installed `types/vitest.d.ts` and fails in **both** directions: shim missing while jest-dom is still one-parameter, and shim present once jest-dom has gone to two.
  The second direction is the one that matters, because that is the day the shim becomes a second competing declaration rather than a fix, and nothing else would notice.
  Both directions were verified red before the check was trusted.

  Do not "tidy" the shim's empty interface bodies. An interface with no members of its own **is** the mechanism of declaration merging, which is why it carries a scoped `no-empty-object-type` disable and why jest-dom's own file is written the same way.

- **TypeScript tracks whatever `@typescript-eslint` admits, which today means 6.0.x. TypeScript 7 is blocked upstream, not deferred.**
  The binding constraint is one field, and it is the only thing worth checking:

  ```bash
  npm view @typescript-eslint/eslint-plugin version peerDependencies.typescript
  ```

  As of 2026-08-25 that is `8.68.0` and `>=4.8.4 <6.1.0`. TypeScript 7 cannot resolve against it without dropping `typescript-eslint` altogether, which would mean losing type-aware linting. `npm outdated` will keep offering 7.x at every `/ship`. Leave 7 alone until that peer range admits it.

  **This rule previously said "TypeScript stays on 5.x" and was wrong for months.** It quoted the same `<6.1.0` range and then drew a conclusion the range does not support: `<6.1.0` admits every 6.0.x. Nobody noticed because `npm outdated` only ever surfaces `latest`, which was 7.x, so 6.0.x was never once put in front of a human. It took a Dependabot config to propose 6.0.3 and expose the gap.

  6.0.3 was then verified rather than assumed: peers dedupe cleanly, `tsc --noEmit` is clean, ESLint keeps type-aware linting, and all 449 frontend tests pass.

  The lesson generalises past TypeScript. **State a pin as the constraint that actually binds, not as a version headline.** "Stays on 5.x" cannot be checked against anything; "must satisfy `@typescript-eslint`'s peer range" is one command, and it is self-correcting when upstream moves.

## Core principles

1. **Reuse first** - search for existing solutions / components before creating. Avoid duplication.
2. **Minimal context** - load only what the task needs.
3. **Test alongside implementation** - no feature is complete without coverage.
4. **Explicit patterns** - reference by ID, don't paste prose.
5. **Structured handoffs** - pass summaries between agents, not raw history.

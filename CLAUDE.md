@AGENTS.md

## Claude Code

Run `/start` at the beginning of every session.
It checks branch, CI, container, and migrations, and enforces the never-implement-on-main rule above.

Run `/ship` before pushing.
It is a pre-push audit covering everything in the Verification section plus npm audit, dependency currency, required GitHub secrets, hardcoded values, and the release sequence.
The check list lives in `.claude/commands/ship.md` and its summary table is the count, so neither this file nor AGENTS.md quotes a number that goes stale the next time a check is added.
It fixes what it can and flags the rest.

### Before `/ship`, hand over the walkthrough

`/ship` commits at its first step, so running it is already past the point of review. Feature
work is judged by using it, not by reading its diff: build it fully, leave it uncommitted on the
branch, bring it up on `:3001`, and **post a table of what to walk** before reaching for `/ship`,
`git commit` or `gh pr create`. No checkpoint commits along the way either.

One row per route or surface, one column for what to look at on it. Write what is checkable by
eye - a heading that appeared, a column that stopped clipping, a header that now stays put - not
a restatement of the change list. Group by route, because that is the order it gets walked in,
not by file or by commit.

Then flag separately, below the table, anything that is a **finding rather than a feature**: a
real bug met on the way, especially one that predates the branch. That is the part worth reading
and the part a change list buries. On the branch that produced this rule, the two findings were
that Terminals and Kits had been clipping unreachable columns at the 1280x720 floor, and that 52
elements on the data sheet were inheriting a font outside `SHEET_FONT_FACES` and had been
silently substituted in every `.pptx` export for the life of the feature.

This is why the rule is here rather than in `.claude/commands/ship.md`, which says "do not ask
for confirmation": by the time `/ship` is typed the decision is made. The constraint is on when
to reach for it.

### Handing work to a smaller model

`/plan-handoff <topic>` writes an implementation plan that `/execute-plan` runs literally, in a fresh session, on a smaller model.
The pair exists because a plan written for a reader who can exercise judgment gets executed wrongly by one that cannot, and the failure is silent: it picks an interpretation and reports success.

| Piece | What it is |
|---|---|
| `/plan-handoff` | Authoring side. Writes `_project/plans/<slug>.md` from `.claude/plan-template.md`, and is not finished until the lint exits 0. |
| `/execute-plan` | Executor side, pinned to `model: sonnet`. Numbered steps, literal stop conditions, authority ending at a local commit. |
| `node scripts/lint-plan.mjs <plan>` | Rejects a plan a smaller model cannot follow: line-number anchors, hedged wording, acceptance criteria with nothing checkable in them. |
| `node scripts/verify.mjs` | The single verification command. Runs everything in the AGENTS.md Verification section plus the five traps beneath it, and writes a receipt on success. |
| `node scripts/check-docs.mjs` | Holds the docs to the code: workflow inputs named in prose, CI job lists, versions quoted in prose, relative link targets, migration filenames, the diagrams, the gate counts quoted in prose (verify steps, preflight checks, `/ship` checks, CI jobs), that `docs/stack.md` names every dependency, workflow and compose service, that `docs/glossary.md` defines every value of the closed vocabularies, and that the catalog-lookup workflow's copies of app facts (band and mode options, template keys, length limits, `slugify`) match their sources. Runs inside `verify.mjs` and as a step of the `preflight` CI job. A knowingly-wrong file needs a written exception, never a silent one. |
| `node scripts/check-bundle.mjs` | Builds the frontend and fails on a cycle in the emitted chunk import graph. **The only check here that reads build output rather than source**, which is why the blank white screen described in AGENTS.md passed every other gate: a cyclic chunk graph is legal ES modules, builds cleanly, and breaks only when a chunk reads an imported binding at module scope. Runs inside `verify.mjs` as `bundle graph`, 0.8s. |
| `node scripts/verify-deploy.mjs --url <host> --boot` | Post-deploy smoke test; run it after every deploy, including a self-hosted one. Polls `/health`, checks `/ready`, the SPA, and a 401-vs-404 route pair; `--boot` additionally executes the page in headless Chrome, polled over the DevTools pipe on a wall-clock deadline rather than waiting for the network, and fails unless `#root` populates or the bundle redirects to sign-in, which is the check that distinguishes "served" from "starts". A missing browser is a failure, never a skip. |
| `node scripts/plan-status.mjs <state> <plan> "<msg>"` | Progress and outcome beacon at `.claude/.execute-plan-status.json`. `/execute-plan` writes `started`, then a `step` line as it clears each of its eight steps, then `blocked` or `committed`. `steps` accumulates, so `cat` that file to see a checklist of where a run is, not only how it ended. It carries no pid: the script is a short-lived grandchild of the session, so the pid it used to record was dead within seconds and always read as a failed run. Use `timestamp` for staleness and match the command line to find the process. |

When supervising a run, treat a beacon that has stopped changing as a possible stall, not as progress.
An executor has four outcomes, not three: it commits, it dies, it stops `blocked`, or it stalls before reaching any state the beacon can write, for example on a usage limit a few seconds in.
The fourth looks exactly like a run still working.
Ground truth is the tail of the run's own session transcript under `~/.claude/projects/<slug>/`, where an API error appears as an assistant entry with `isApiErrorMessage`.
A CLI executor authenticates separately from the desktop app, so it can be rate-limited while the supervising session is fine.

Five hooks in `.claude/settings.json` enforce or report mechanically what the rules above state as prose: two on `SessionStart`, one on `PreToolUse`, one on `PostToolUse` and one on `Stop`.

- **`SessionStart` identity report** (`scripts/env-report.mjs`) prints the machine and toolchain the session is on. It exits 0 whatever it finds.

- **`SessionStart` gate** (`scripts/start-checks.mjs`, beside `scripts/env-report.mjs`) runs the automatic half of `/start`: branch, CI on `main`, the dev container, migration annotations and uncommitted changes. It is committed so a fresh clone has it; it used to be a script in the maintainer's home directory. It reports and never blocks.

- **`PreToolUse` branch guard** (`scripts/branch-guard.mjs`) denies an edit while the target file's repo is on `main`, and denies a Bash command that would write to the repo while on `main`. The Bash half classifies the command with `scripts/lib/bash-guard.mjs` so reads such as `git status`, `npm ci` and `git merge-base` stay allowed.
- **`PostToolUse` em-dash check** (`scripts/check-em-dash.mjs`, on `Write|Edit`) rejects an em dash in a line the session just added. It cannot see hand edits or another machine's commits, which `scripts/check-em-dash-ci.mjs` covers.
- **`Stop` verify gate** (`scripts/verify-gate.mjs`) refuses to end a turn on changes under `frontend/`, `backend/`, or `scripts/` that have no passing `verify.mjs` receipt matching the current tree.

Both apply to every session in this repo, not only to handoffs.

One limitation to know before launching an executor: it runs in this checkout, not an isolated copy, so its `git checkout -b` switches the branch under any other session in the same folder, and the `Stop` gate cannot tell one session's edits from another's. Run one at a time. Worktree isolation waits on the dev container bind-mounting the main checkout, which would otherwise have an executor edit one tree and verify a different one.

### Role-based agents

Role-based agent guidance lives under `.claude/agents/*.md`:

| Agent | For | File |
|---|---|---|
| Frontend | UI, component, React, CSS, accessibility | `.claude/agents/frontend.md` |
| Backend | API, service, DB, auth, business logic | `.claude/agents/backend.md` |
| UI/UX | design, user flow, wireframe, usability | `.claude/agents/uiux.md` |
| DBA | schema, migration, index, query perf | `.claude/agents/dba.md` |
| DevOps | CI/CD, deploy, containers | `.claude/agents/devops.md` |
| Security | OWASP, XSS, injection, auth, pentest | `.claude/agents/security.md` |
| Validator | review, pattern check, architecture | `.claude/agents/validator.md` |

### No human time or effort estimates

Never estimate how long a task will take, and never size it in human effort.
No "~20 minutes", "a quick fix", "an afternoon", "a couple of days", "low effort",
"trivial", or story points. The estimate is trained on how long a person would take,
which has nothing to do with how the work actually gets done here, and it silently
becomes an argument for or against doing something.

Size work by what it actually touches instead, which is checkable:

| Instead of | Say |
|---|---|
| "quick, about 20 minutes" | "7 files, no new prose, no behavior change" |
| "a big lift" | "changes the API contract, so frontend and backend both move" |
| "low effort, high value" | "additive only, nothing depends on it yet" |

The same applies to recommending against work. "Not worth the time" is not a reason.
"Nothing consumes it, and the code already documents the convention" is.

If asked directly for a schedule estimate, say plainly that the estimate would be
guesswork and give the scope breakdown instead.

### Session discipline (token budget hygiene)

Sessions have compounding costs - every message re-sends the growing context.
The following rules keep usage sane:

1. **Use the Explore / general-purpose agent for open-ended searches.** Raw tool output (`Read`, `Grep`, etc.) stays in the main context forever; an agent's summary is a tiny fraction of the size. If a task is "find where X happens across the codebase" or "audit Y," spawn an agent.
2. **Short sessions beat long ones.** Finish a feature, commit, end the session. Don't accumulate hours of context. Starting fresh is cheaper than dragging state along.
3. **Run `/compact` proactively** at natural break points (after a feature ships, before starting a new area) rather than waiting for context pressure.
4. **Skip TodoWrite for 1-2 step tasks.** The tool is valuable for multi-step features; for trivial edits it's pure overhead.
5. **Commit incrementally, once the work is handed over.** Git log is cheap to re-read; reconstructing a long conversation isn't. Small commits let future sessions skim `git log` instead of trawling past chats. This applies after the walkthrough above has been posted and the feature ships, never mid-feature, where the no-checkpoint-commits rule holds.
6. **Don't over-document.** Cleanup work doesn't need docs. Architecture decisions that are non-obvious do - put them in the right focused file, not `project.md`.

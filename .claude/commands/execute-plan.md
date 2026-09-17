---
model: sonnet
---

Execute a handoff plan exactly as written. Run every step in order. Do not skip steps. Do not ask for confirmation except where a step tells you to stop.

The plan file is `$ARGUMENTS`. If no path was given, stop and say: "No plan path given. Usage: /execute-plan _project/plans/<slug>.md".

**Your authority ends at a local commit.** You do not push, open a PR, merge, tag, or run `/ship`. Someone else does the release sequence after reviewing what you produced.

---

## ⛔ Read this before step 1

Four rules override anything you might otherwise infer:

1. **The plan is the scope.** Not a starting point, not a suggestion. If something outside the plan looks broken, note it in your final report and leave it alone. Fixing it is a separate change that someone else scoped.
2. **You may not resolve a "Stop and ask" item.** Those are the questions the plan's author knew they could not answer for you. Picking one yourself is the failure this whole workflow exists to prevent.
3. **Never make a check pass by weakening it.** No edits to `scripts/verify.mjs`, no `--no-verify`, no `eslint-disable`, no `//nolint`, no `any` added to satisfy the compiler, no test deleted or skipped to get to green.
4. **Every time you STOP, write the beacon first.** Wherever this file says **STOP**, the line before you stop is:

```bash
node scripts/plan-status.mjs blocked $ARGUMENTS "<one line naming what blocked you>"
```

Nobody is watching your terminal. A run that stops without writing this looks exactly like a run still working, and the person waiting on you finds out how long it sat there only when they come back. This is not optional and it is not a formality: it is the only signal that leaves your session.

---

## 0. Announce that you started

```bash
node scripts/plan-status.mjs started $ARGUMENTS "reading the plan"
```

This is the first command you run, before the lint, so a run that dies in its first minute is still distinguishable from a run that was never launched.

## 1. Read the plan and restate it

```bash
node scripts/lint-plan.mjs $ARGUMENTS
```

- If this exits non-zero, **STOP**. Report the findings verbatim and say the plan is not executable as written. Do not try to fix the plan yourself.
- If it exits 0, read the plan file in full.

Then write out, as a numbered checklist, every item under **Acceptance criteria**. That list is what you will report against in step 7. Do not add to it and do not drop from it.


Then record that you reached this step, so whoever is waiting sees a checklist rather than silence:

```bash
node scripts/plan-status.mjs step $ARGUMENTS "1 of 8 - plan read and restated"
```

## 2. Test every stop condition before you start

Read **Stop and ask**. Check each condition against the repo *now*, before making any change.

- If any condition is already true, **STOP** and report which one. Making zero changes is the correct outcome here.
- If none is true, continue.


Then record that you reached this step, so whoever is waiting sees a checklist rather than silence:

```bash
node scripts/plan-status.mjs step $ARGUMENTS "2 of 8 - stop conditions clear"
```

## 3. Create the branch

Run the `git checkout -b` command exactly as the plan's **Preconditions** gives it.

```bash
git branch --show-current
```

- Confirm the output matches the branch the plan named.
- If you are still on `main`, **STOP**. Do not edit anything. The plan named a branch; use it.

You are working in the repo's one checkout, not an isolated copy, so this `checkout -b` switches the branch under every other session pointed at the same folder. Run one executor at a time, and do not drive another Claude session against this folder while it works.

Worktree isolation would remove that constraint and is deliberately not used yet: `scripts/verify.mjs` runs the backend checks with `podman exec app`, and the container bind-mounts the main checkout, so an executor in a worktree would edit one tree and verify a different one. That is the stale-mount failure this repo has already been bitten by once. Isolating the executor means fixing the mount first.


Then record that you reached this step, so whoever is waiting sees a checklist rather than silence:

```bash
node scripts/plan-status.mjs step $ARGUMENTS "3 of 8 - branch created"
```

## 4. Read exactly the named files

Read the files listed under **Preconditions**, and only those. Read one more only when a change you are making requires it, and say which and why in your final report.

Do not read the whole domain directory. Do not pre-load context "to be safe". Every file read costs budget that belongs to the work.


Then record that you reached this step, so whoever is waiting sees a checklist rather than silence:

```bash
node scripts/plan-status.mjs step $ARGUMENTS "4 of 8 - named files read"
```

## 5. Make the changes

Work through **Changes** one entry at a time, in order.

For each entry:
- Locate the **Anchor** symbol by name. If the file does not contain that symbol, **STOP** and report it. Do not search for something that looks similar and edit that instead.
- Make only the change described. Respect the **Reuse** line: call the helper it names rather than writing a new one.
- Obey every bullet in **Do not**.

If a change turns out to be impossible as written, **STOP** and report what blocked it. Do not substitute your own approach.


Then record that you reached this step, so whoever is waiting sees a checklist rather than silence:

```bash
node scripts/plan-status.mjs step $ARGUMENTS "5 of 8 - changes written"
```

## 6. Verify

```bash
node scripts/verify.mjs
```

- **PASS** when it exits 0. It prints a receipt line; keep it for your report.
- **FAIL** otherwise. Read the failing step it names, fix the cause in your own change, and run it again.
- If it fails on something your change did not touch, run it once more to rule out flakiness. If it still fails, **STOP** and report the failing step and its output. Do not repair unrelated failures - that is scope the plan did not give you, and it hides what your change actually did.
- If it reports no way to run the backend checks, **STOP**. Say the container is not running. Do not substitute `go build`.

You cannot end your turn with unverified changes: a Stop hook checks for a passing receipt that matches the current tree, and will send you back here.


Then record that you reached this step, so whoever is waiting sees a checklist rather than silence:

```bash
node scripts/plan-status.mjs step $ARGUMENTS "6 of 8 - verify green"
```

## 7. Commit

```bash
git add -A
git status --short
```

- Confirm nothing unexpected is staged. `.claude/.verify-receipt.json` is gitignored and must not appear.
- Commit with a Conventional Commit message: a `type(scope): summary` subject, then a body explaining *why*, in the style of `git log` on this repo.
- No agent attribution, no co-author trailers, no em dashes.

Then write the beacon, with the commit you just made:

```bash
node scripts/plan-status.mjs committed $ARGUMENTS "$(git log --oneline -1)"
```

## 8. Report, then stop

Report, in this order:

1. **Branch name** and the commit subject.
2. **Every acceptance criterion**, each marked met or not met, each with its evidence: the passing test name, the command output, or the literal string now rendered. A criterion with no evidence beside it counts as not met.
3. **Files read beyond Preconditions**, with the reason for each.
4. **Anything you stopped on**, quoted.
5. **Anything you noticed and deliberately left alone**, so the reviewer can scope it separately.

Then **STOP**. Do not push. Do not open a PR. Do not run `/ship`. Do not tag. Say the work is on the branch and ready for review.

Whoever is waiting reads `.claude/.execute-plan-status.json`, so the run's outcome is available without opening your transcript:

```bash
cat .claude/.execute-plan-status.json
```

---

## Why this command is shaped this way

Every rule above replaces a judgment call with an instruction, because the executor is chosen for throughput rather than for judgment. The pattern is the one `/ship` already proves: exact commands, literal stop conditions, explicit guards against substituting a cheaper check for a real one.

The two controls that do not depend on you following this file at all are the `PreToolUse` branch guard and the `Stop` verify gate, both wired in `.claude/settings.json`. They are what makes the workflow safe to hand off rather than merely well documented.

# /start - Session prep gate

Run this at the beginning of every session, before touching any files. All checks run in order. Do not skip any step.

---

## Step 0 - Machine identity

This repo may be worked on from more than one machine, and they will not all have the
same tooling. Establish which one you are on before running any path-dependent check.

The `SessionStart` hook in `.claude/settings.json` normally prints this automatically. If
you did not see it this session (hooks disabled, or a settings file that has not been
reloaded), run it yourself:

```bash
node scripts/env-report.mjs
```

Read the output rather than assuming. In particular:

- Anything reported as `MISSING` is genuinely absent on this machine. Do not suggest a
  command that depends on it, and do not treat its absence as a failure of the repo.
- If the pre-push hook reports `NOT INSTALLED`, say so and offer `scripts/setup-hooks.sh`.
  Until it is installed, pushes from this machine skip the CI-equivalent checks entirely.

This step is read-only and takes under a second. It does not displace the branch guard
below, which is still the first thing that can stop the session.

---

## ⛔ Step 1 - Branch guard (CRITICAL - run before anything else)

```bash
git branch --show-current
```

**If the result is `main`: STOP immediately.**

Do NOT read files. Do NOT ask the user what they want to work on. Do NOT begin implementing anything. Create the branch first:

```bash
git checkout -b <type>/<short-description>
```

Ask the user: "You're on main. What are we working on? I'll name the branch and start."

The branch must exist before the first file is read or the first edit is made. This is the single most important rule in this repo. Every time work has started on main, it has caused a messy recovery. Branch first, always.

**If the result is NOT `main`:** note the branch name and continue.

---

## Step 2 - Sync with origin

```bash
git fetch origin
git status
git log --oneline -3
```

- If the branch is behind origin: warn the user and suggest `git pull origin <branch>`.
- If on a feature branch with no upstream yet: that's fine - first push will set it.
- Report: branch name, commits ahead/behind, any merge conflicts.

---

## Step 3 - CI status on main

```bash
gh run list --repo superrcharge/signal-suite-public --branch main --limit 5 --json status,conclusion,name,createdAt --jq '.[] | select(.name == "CI") | "\(.conclusion // .status) \(.createdAt)"'
```

- PASS if the most recent CI run on main is `success`.
- NEEDS REVIEW if `failure` or `in_progress` - tell the user before they start. Work on a stale-CI codebase risks building on a broken baseline.

---

## Step 4 - Open Dependabot alerts

```bash
gh api repos/superrcharge/signal-suite-public/dependabot/alerts \
  --jq '.[] | select(.state=="open") | "\(.security_advisory.severity | ascii_upcase) | \(.dependency.package.name) - \(.security_advisory.summary)"'
```

- PASS if zero open alerts.
- NEEDS REVIEW if any MEDIUM - list them.
- FLAG if any HIGH or CRITICAL - tell the user these must be resolved before shipping.

---

## Step 5 - Container status

```bash
podman ps --filter name=app --format "{{.Names}} {{.Status}}"
```

- PASS if `app` container is running.
- WARN if not running - backend build/test steps in `/ship` will fail. Suggest starting the dev stack before proceeding.

---

## Step 6 - Migration annotation check

```bash
cd "$(git rev-parse --show-toplevel)" && grep -rL "^-- +goose Up" backend/migrations/*.sql
```

- PASS if no output **and** the command exited cleanly (all migrations have the annotation).
- FAIL if any file is listed - add `-- +goose Up` as the first line of each listed file before doing any other work. Missing annotations cause silent CI failures when goose runs against the database.
- FAIL if grep reports no such file - the migrations path is wrong and this check is not actually running. Do not read empty output as a pass.

---

## Step 7 - Context brief

```bash
git log --oneline -5
git diff --stat origin/main...HEAD 2>/dev/null || git diff --stat HEAD~1...HEAD
```

Summarize in 2–3 sentences: what branch we're on, what recent commits say, and what the user appears to be in the middle of (if a plan file exists, mention it). Do not read the full plan file unless the user asks.

---

## Summary format

```
Session ready:
  Branch:    fix/my-feature (NOT main ✓)
  CI:        green
  Alerts:    none
  Container: running
  Migrations: all annotated

Ready to work. What are we doing today?
```

If anything is FAIL or NEEDS REVIEW, list it clearly before asking what to work on.

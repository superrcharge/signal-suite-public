# Handoff plans

Implementation plans written by `/plan-handoff` and executed by `/execute-plan`.

They live in the repo rather than in `~/.claude/plans/` for three reasons:

- A fresh session on either machine can be pointed at a repo-relative path.
- The plan is committed with the work, so a reviewer can read what was asked for beside what was done.
- A plan that survives the session is evidence when the result is wrong: the defect is usually in the plan, not in the executor.

Every file here must pass:

```bash
node scripts/lint-plan.mjs _project/plans/<slug>.md
```

The required shape is in `.claude/plan-template.md`.
Once a plan's work has shipped, the file stays as a record; it is not cleaned up.

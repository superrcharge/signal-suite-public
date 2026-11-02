## What changed

<!-- One or two sentences. Conventional-commit title on the PR itself. -->

Closes #

## What to walk

<!-- One row per route or surface, in the order it gets walked. Write what is checkable by eye, not the change list. See "Before /ship, hand over the walkthrough" in CLAUDE.md. Delete the table for a change with no UI. -->

| Route or surface | What to look at |
|---|---|
|  |  |

## Findings

<!-- Anything met on the way that is a finding rather than a feature: a real bug, especially one that predates this branch. Write "None" when there are none. -->

## Checklist

- [ ] `node scripts/verify.mjs` passes
- [ ] `/ship` ran before the push
- [ ] `CHANGELOG.md` has this release's section, if this PR is a release
- [ ] Docs, the glossary and `docs/stack.md` are updated for anything this changes

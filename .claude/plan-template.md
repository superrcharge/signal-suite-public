# <Title: what changes, in one line>

<!--
The seven sections below are required, in this order, and are checked by:

    node scripts/lint-plan.mjs <this file>

Written for an executor that cannot ask you what you meant. Every rule exists
because a capable reader silently absorbed an ambiguity that a weaker one will
resolve by guessing and then report as success.

Delete these comments and every angle-bracket placeholder before handing off.
-->

## Context

<Why this work exists: the problem, what prompted it, the intended outcome.>

<The one section written for a human. The executor reads it to understand what
"done" is for, not to take instructions from. Keep it short.>

## Preconditions

Branch to create, before reading or writing anything:

```bash
git checkout -b <type>/<short-description>
```

Read exactly these files, and no others unless a change below requires it:

- `<path/to/file.tsx>`
- `<.claude/context/domains/<domain>.md>`

<State anything that must already be true: the dev container running, a
migration applied, a fixture present. If it is not true, that belongs in
"Stop and ask" below.>

## Acceptance criteria

<Numbered. Each one independently checkable by a named observation: a test
name, a command, or a literal string in backticks or quotes. If checking it
needs judgment, it is not a criterion - turn it into a test.>

1. `<test file>` covers <behaviour> and passes.
2. The page renders "<exact literal string>" for <role>.
3. `node scripts/verify.mjs` exits 0.

## Changes

<Per file: the path, the symbol to anchor on, what changes, and why. Never a
line number on its own - it drifts the moment the first edit lands. Name the
existing helper to reuse, with its path, so nothing gets rewritten from
scratch.>

### `<path/to/file.tsx>`

- **Anchor:** `<functionName>` / `<ComponentName>`
- **Change:** <what it becomes>
- **Why:** <the reason, so a judgment call at the margin lands the right way>
- **Reuse:** `<existingHelper>` from `<path/to/helper.ts>`

## Do not

<The boundaries. This is the section authors skip and the one a weaker model
needs most.>

- Do not add a new component; extend the existing one named above.
- Do not touch the backend.
- Do not widen a type or add an `any` to make the compiler agree.
- Do not edit `scripts/verify.mjs`, pass `--no-verify`, or add a lint
  suppression to reach green.
- Do not push, open a PR, merge, tag, or run `/ship`. Stop at a local commit.

## Stop and ask

<Every unresolved question, each with the condition that triggers it. A plan
carrying an open question that is not listed here is not ready to hand off.>

- If `<file>` does not contain `<symbol>`, stop and report it. Do not search
  for a replacement.
- If a test outside `<test file>` fails, stop and report which. Do not repair
  unrelated failures.

## Verify

```bash
node scripts/verify.mjs
```

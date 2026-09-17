Write an implementation plan that a smaller model can execute literally, in a fresh session, with nobody available to answer questions.

The topic is `$ARGUMENTS`. If nothing was given, ask what the plan should cover before doing anything else.

This is the authoring half of a pair. `/execute-plan` is the other half, and it is pinned to a smaller model on purpose. Everything you decide here is a decision the executor will not have to make, and every decision you leave open is one it will make by guessing.

---

## 1. Do the thinking here, not there

Explore the code until you can name, precisely:

- every file that changes, and the **symbol** in each one that anchors the change
- the existing helper, hook, or component to reuse in each case, with its path
- what proves the work: the test that covers it, the command that shows it, the literal string that appears
- what must **not** change

Follow the load-on-demand table in `AGENTS.md` while you explore. The plan you write will name a short list of files for the executor to read, and that list is the product of this step: it is what you concluded was necessary, not everything you looked at.

Reuse first. If a helper already exists, the plan names it. A plan that lets the executor write a second implementation of something is a defect in the plan.

## 2. Resolve the ambiguities, or list them

Every open question ends up in one of exactly two places:

- **Decided**, and written into **Changes** or **Do not** as an instruction.
- **Undecidable without the user**, and written into **Stop and ask** as a condition that halts the executor.

Nothing goes in a third place. Soft wording in the body ("drop this if it feels like scope creep") is the failure mode this workflow exists to remove: it reads as flexibility to you and as a coin flip to the executor. `scripts/lint-plan.mjs` rejects it.

If a question is genuinely the user's to answer and blocks the plan, ask them now with AskUserQuestion rather than shipping it as a stop condition.

## 3. Write the plan

Copy `.claude/plan-template.md` and fill it in. Write to:

```
_project/plans/<slug>.md
```

`_project/` is tracked, so the plan is committed alongside the work and reviewable in the PR. Use a slug that matches the branch the plan creates.

Rules the template encodes, and why each one is there:

| Rule | Because |
|---|---|
| Anchor changes on symbol names, never on a line number alone | Line numbers drift as soon as the first edit lands, and an executor that trusts one edits the wrong place |
| Every acceptance criterion names a test, a command, or a literal string | A criterion checked by eye is self-reported, which is the same as unchecked |
| **Do not** is filled in, always | It is the section authors skip and the one a weaker model needs most |
| **Preconditions** lists exact paths | "Read the relevant domain doc" is a judgment call; a path is not |
| **Verify** holds one command | A list of five commands gets paraphrased into four |

Write each full sentence on its own line, per the global Markdown rule. No em dashes.

## 4. Lint it

```bash
node scripts/lint-plan.mjs _project/plans/<slug>.md
```

This is not advisory. Keep fixing findings and re-running until it exits 0. You are not finished while it fails.

## 5. Read it back as the executor

Re-read the plan pretending you know nothing about this conversation, cannot ask a question, and will be judged on following it literally. For each instruction, ask: is there a second reasonable reading? If there is, one of the two is what you meant, so say which.

Check specifically:

- Could any **Changes** entry be satisfied by editing the wrong symbol?
- Does any acceptance criterion depend on something the **Preconditions** file list does not cover?
- Does **Do not** actually fence off the tempting wrong moves, or only the obvious ones?

## 6. Hand off

Report:

1. The plan path.
2. The branch it will create.
3. The acceptance criteria, as the user will see them reported back.
4. Any **Stop and ask** conditions, so the user knows in advance where it may halt.

Then tell the user to run this in a **fresh session**, either by typing it there:

```
/execute-plan _project/plans/<slug>.md
```

or from a terminal:

```bash
claude "/execute-plan _project/plans/<slug>.md"
```

A fresh session matters: the executor should work from the plan, not from the reasoning that produced it. If it needs this conversation to make sense, the plan is not finished.

Resume a session from a handoff file written by the /handoff command.

Steps (execute without asking for confirmation):

1. Read `.claude/context/handoff.md`. If it does not exist, stop and say: "No handoff file found at .claude/context/handoff.md - nothing to resume."
2. Run `git status` and `git diff HEAD` to verify current working tree state matches what the handoff describes.
3. Summarize in 3–5 bullet points: what was in progress, what's done, and what the immediate next action is.
4. State the single next concrete step clearly so work can begin without any further clarification.

Do not ask for confirmation at any step. Do not ask what to work on - the handoff file defines it.

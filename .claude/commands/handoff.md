Generate a session handoff file so work can resume immediately after an account switch. The goal is zero context loss - write this as if briefing a fresh Claude instance that has never seen this session.

Steps (execute without asking for confirmation):

1. Run `git status` and `git diff HEAD` to capture in-progress state.
2. Run `git log --oneline -5` to capture recent commits.
3. Write a handoff note to `.claude/context/handoff.md` with this structure:

---

## Task in flight
The specific step currently being worked on - not just the feature name, but where in the implementation we are.

## Done this session
Bullet list of completed sub-steps, including anything that was reverted or undone and why.

## Next action
The single next concrete step. Be specific enough that no clarification is needed.

## Mental model
What the incoming Claude needs to understand about how this part of the codebase works that isn't obvious from reading the files cold. Include: how pieces connect, any surprising behaviors discovered, implicit constraints, architectural context relevant to this task.

## Decisions made
Non-obvious choices made mid-session and the reasoning behind each. Include tradeoffs considered and why the chosen path won.

## Dead ends
Approaches explored and ruled out, with the specific reason each failed. This prevents re-exploring the same paths.

## Codebase discoveries
Specific files, functions, or behaviors found during this session that are relevant to the task. Include file paths and line numbers where useful.

## Open questions
Anything uncertain or unresolved that the next session should be aware of or investigate.

## Uncommitted changes
Summary of what's staged/unstaged and why it's in its current state.

---

4. Print: "Handoff written to .claude/context/handoff.md - safe to switch accounts."

If `.claude/context/` does not exist in the current project, create it first.
Do not omit sections - write "none" if a section has nothing to report.
Do not ask for confirmation at any step.

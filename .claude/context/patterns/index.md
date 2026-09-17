# Pattern Library Index

This library defines reusable patterns that agents reference by ID. Agents should load only the patterns they need.

Every ID below resolves to a file in this directory. If you add a pattern, add its row here; if an agent's "Required Patterns" list names an ID that is not in this table, the list is wrong, not the library.

## How to Use Patterns

1. Agents specify required patterns in their "Required Patterns" section
2. Load pattern definitions before starting work
3. Reference patterns by ID in reviews and handoffs

## Patterns

| ID | Name | File |
|----|------|------|
| `PATTERN:domain-structure` | Domain-Driven Folder Structure | [domain-structure.md](domain-structure.md) |
| `PATTERN:api-design` | REST API Design (Go Fiber) | [api-design.md](api-design.md) |
| `PATTERN:error-handling` | Domain-Specific Error Handling | [error-handling.md](error-handling.md) |
| `PATTERN:validation` | Domain-Owned Request Validation | [validation.md](validation.md) |
| `PATTERN:testing-backend` | Backend Testing | [testing-backend.md](testing-backend.md) |

## Scope

The library is backend-only, and deliberately so. It was inherited from `tau_service_template`, which advertised 23 patterns across frontend, data, UI/UX, and DevOps categories; 18 of those files were never written, so every agent's "Required Patterns" list pointed at documents that did not exist. The dangling IDs were removed rather than filled in, because the conventions they described are already visible and enforced elsewhere:

- **Frontend** - component and state conventions are set by the existing code under `frontend/src/`; accessibility and testing are enforced by `npx eslint src/` and `npx vitest run`.
- **Data** - migration rules live in `AGENTS.md` (sequential numbering, `-- +goose Up`, no unreviewed destructive ops).
- **DevOps** - the real pipeline is `.github/workflows/ci.yml`; running it is `docs/self-hosting.md`.
- **Security** - `.claude/context/authz.md` owns auth and RBAC.

Write a new pattern file when a convention is non-obvious, repeated, and not already enforced by a linter or documented in a focused context file. Do not restore an ID here without the file to back it.

## Pattern Template

When creating new patterns, use this template:

```markdown
# PATTERN:[id]

## Name
[Human-readable name]

## Intent
[What problem does this pattern solve?]

## Context
[When should this pattern be applied?]

## Solution
[How to implement this pattern]

## Examples

### Good Example
[Show correct usage]

### Anti-Pattern
[Show what to avoid]

## Consequences
- **Benefits:** [What you gain]
- **Trade-offs:** [What you give up]

## Related Patterns
- [PATTERN:another-id] - [relationship]

## Checklist
- [ ] [Verification item]
```

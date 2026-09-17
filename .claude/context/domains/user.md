# User domain

Identity-provider-synced user profiles. Created/updated on each authenticated request via `SyncFromToken`. Required for auth middleware - do not remove.

For the full authorization model (roles, bootstrap, guardrails, RequireRole usage, gated routes, UI gating, self-registration), see **authz.md**.

## Users page

- Admin-only list at `/users`. Non-admins hitting the route see a 403 alert instead of the grid.
- Each user row shows a role button, colored from `ROLE_COLORS` in `theme/asset-colors.ts` (admin red, editor green, rto purple, planner violet, viewer grey), with a chevron if clickable.
- **Before changing a role colour, read the constraint.** `ROLE_STYLE` here is a `Record<Role, ...>`, so a missing entry is a compile error - but `ROLE_COLORS` is a plain `as const` literal, so a missing entry **compiles and fails at runtime**. It also feeds `theme/co-occurrence.ts`'s `'users stat strip'` context, which holds every role colour OKLab-distinct from every other **under dichromacy simulation**, because the strip renders all of them at once. Pick against that test rather than by eye: planner's violet was chosen as the widest-margin palette entry against the other five, and needed no new `KNOWN_COLLISIONS` waiver as a result.
- Admins click a row's role button to open a role picker menu; the current user's own button is non-clickable and labeled "(you)" to enforce the self-demote guardrail in the UI.
- Last-admin guardrail surfaces as a server-side 409 that renders in a bottom-center Snackbar.
- **Stat strip** at the top: Total plus one cell per role. Each cell's caption is that role's permission summary, so the strip doubles as the privileges legend - there is no separate legend card. `planner` reads "Writes nets + PACE; reads the catalog". Non-interactive, because `useUsers` has no role filter for a cell to drive.
- Pagination: 30/page.

### Role counts

Counts come from `role_counts` on the list response, computed server-side by
`repo.CountAllByRole` (one `GROUP BY` over `jsonb_array_elements_text(roles)`).

They are deliberately **not** derived from the returned `users`: that array is a
single page and `limit` is capped at 100 server-side, so any client-side tally
understates every role as soon as the table outgrows one page. The service
overlays `ValidRoles` so a role nobody holds still reports `0` and keeps its
cell, while an unrecognised role left over from an older deploy is passed
through rather than dropped.

Because a user's `roles` is an array, the counts are per-role totals and need
not sum to the number of users - though every write path currently sets exactly
one role, so in practice they do.

## Ordering

The list is ordered most-recently-active first, with never-signed-in users last
(`ORDER BY last_login_at DESC NULLS LAST, created_at DESC` in `repository.go`).
The page does not re-sort and sends no sort parameter.

Note the column name understates what it holds: `SyncFromToken` stamps
`last_login_at` on **every authenticated request**, not just at sign-in, so it
is really a last-*activity* timestamp. That is what makes the ordering read as
"who was here most recently". A true last-sign-in value would need a separate
column.

New sign-ups land here automatically as `viewer` via the first-user-wins bootstrap - read-only until an admin promotes them (see authz.md).

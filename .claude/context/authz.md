# Authorization model

Authentication (who you are) is **federated to Azure Entra ID** - the Go backend validates JWT bearer tokens issued by Entra (via `coreos/go-oidc/v3` against the tenant's JWKS), and the SPA acquires those tokens through MSAL.js. Authorization (what you can do) is **locally owned**: every user has a role stored in the `users.roles` JSONB column, which is the single authority read by `middleware.RequireRole`. Entra's role / group claims are *not* consumed for authorization decisions.

This decouples the permission model from the IdP - the prior implementation used Keycloak fronted by oauth2-proxy, and swapping it out required no RBAC logic changes (only the auth middleware's claim source).

## Roles

See `user/model.go` for the constants.

- `admin` - full access, including managing other users' roles and reading the audit log
- `editor` - create/edit/delete in every domain; no user management
- `rto` - **scoped writer**: waveforms, nets, PACE cards, transports, platforms, organizations, operations, and equipment whose `terminal_type` is `radio`. Reads everything else. Note the deliberate asymmetry: `rto` writes the radio side of the catalog split, so it is excluded from `services` (SATCOM reference data) - see the route table below
- `planner` - **scoped writer**: nets, PACE cards, transports, platforms, organizations and operations only. Reads everything else, including the catalog it plans against. A role alongside `rto` rather than a narrowing of it: `rto` keeps writing everything it did
- `viewer` - read-only; cannot trigger any mutation (default for new users after the first)

Adding a role touches six places, and they do not all fail loudly:
`ValidRoles` (`user/model.go`), the `oneof` tag on `dto.UpdateRoleRequest.Role`,
the `UpdateRoleRequest` enum in `backend/docs/openapi.json`,
`ROLES` (`frontend/src/types/roles.ts`), `ROLE_OPTIONS` and `ROLE_COLORS`.
`TestUpdateRoleTagMatchesValidRoles` covers the first two; the error message in
`ErrInvalidRole` is derived from `ValidRoles` rather than restated.

Both of the frontend ones fail at compile time, which is worth knowing before
picking a colour. `roleStyle()` in `types/role-meta.ts` takes a `Role` and indexes
`ROLE_COLORS` with it, and `ROLE_COLORS` is a plain `as const` literal, so a role
missing from it is a type error at that index, not a runtime failure (it used to
be, when a separate `ROLE_STYLE` record carried the roles). `ROLE_COLORS` also
feeds `co-occurrence`'s
'users stat strip' context, which holds every role colour OKLab-distinct from
every other **under dichromacy simulation**. Pick against that test, not by eye:
`TestListUsers_RoleCounts` in `user/role_test.go` hard-codes every role in four
maps and is the intended alarm when `ValidRoles` grows.

### planner and the canWritePace split

`planner` writes nets and PACE and only reads the catalog, so the frontend's
`canWriteRadio` - which bundled nets, PACE, waveform creation and the catalog
editor into one flag - had to divide. `canWritePace` (admin, editor, rto,
planner) now gates nets and PACE; `canWriteRadio` keeps its original meaning for
waveforms and the catalog editor. Every role that held the old flag holds both.
`CsvWriteGate` in `csv-domains.ts` gained the same third value, and
`csv-domains.test.ts` asserts which datasets sit behind which.

**`planner` carries no read restriction, deliberately.** No GET route anywhere
names a role except `GET /api/v1/audit`, which is admin-only and always has
been. `terminal/routes.go` states that outright and `authz_test.go` calls it
"correct, not an oversight"; this role is not the first exception.

The shape of the read surface, since this used to be asserted as "all 30 GET
routes" and that was wrong in two directions at once - the count was stale and
it quietly folded three different gates into one number:

| GET routes | Gate |
|---|---|
| 22 | any authenticated user |
| 9 | **none at all** - the `…/import/template` routes, see the table below |
| 1 | admin (`/api/v1/audit`) |
| **32** | total |

Prefer the shape to the total. A single number here is the kind of claim that
goes stale on the next domain and reads exactly the same when it does. The frontend hides the pages it does not need - the sidebar
groups, the header nav items and the Dashboard's tiles, which are the same list, all off
`canSeeTrackers` - so the honest description is a decluttered view rather than a
boundary. Contracts goes one step further and is hidden from every role but
admin and editor, off `canSeeContracts`, for the same reason and with the same
limit: contracts are internal, and the reads stay open. Export in particular stays open to every role by decision, so a
planner can still export terminals and a viewer can still export contracts. `TestPlannerReachesOnlyItsOwnDomains` probes
each route's own gate closure with a planner user, so it reads the lists the
route files declare rather than lists restated in the test.

### The rto role is not expressible in RequireRole alone

`RequireRole` decides from role names only - it never sees the request body or
the target record. That is enough for waveforms, where the whole domain is radio
reference data. It is **not** enough for the equipment catalog: satcom and radio
records share one set of routes and are separated by the `terminal_type` column,
so `POST/PATCH/DELETE /api/v1/equipment/:id` serves both.

The rule is therefore completed in `equipment/service.go`, gated on
`ActorRadioOnly` - set by the handler from the caller's roles (never from the
body, following the `ActorID` convention) and true only when the caller holds
`rto` without `admin` or `editor`:

- **Create** - `terminal_type` must be `radio`
- **Update** - the existing record must be `radio`, **and** a supplied
  `terminal_type` must stay `radio`. The second half is what stops an rto user
  flipping a record to satcom and then editing it freely from then on
- **Delete** / **photo upload** / **photo removal** - the existing record must be `radio`. The two photo handlers check this themselves before touching blob storage, then again through `UpdateEquipment`

Violations return `ErrRadioScopeOnly` (403). Covered by
`equipment/authz_test.go`, including the boundary-flip escape.

## Bootstrap: first-user-wins

When `SyncFromToken` creates a brand-new user record, it queries `repo.Count(ctx)`. If the table is empty → `["admin"]`. Otherwise → `["viewer"]`.

Self-registration is open to anyone who can authenticate against the tenant, so a new account lands read-only and an admin has to promote it before it can write. Both branches are pinned by `TestSyncFromToken_NewUserBootstrap` in `user/sync_test.go`.

**An empty email is a valid row, and more than one may hold it.** A v2 access token carries no `email` claim for a guest, B2B or CTR identity unless the app registration adds it as an optional claim, and no `upn` either, so the middleware hands the sync `Email: ""`. The column was `NOT NULL UNIQUE`, which admitted exactly one such identity: every later one failed its insert on `users_email_key` and got `500 AUTH_SYNC_FAILED` on every request, a lockout keyed to who they were rather than to anything they did, and invisible to any member account. Migration `053_users_email_partial_unique.sql` replaces the constraint with a unique index on `email` where it is not empty, and widens `name` to 255 for display names that carry rank, component and unit. `TestSyncFromToken_NoEmailClaimSyncsAsEmpty` and `TestRepository_Upsert_EmptyEmailDoesNotCollide` pin the two halves. The `UPDATE … WHERE email = '…'` recipe above cannot reach such a row; key it on `oidc_subject` instead.

The OIDC subject identifier is the Entra `oid` claim, persisted in the `users.oidc_subject` column (the column was renamed from `keycloak_id` during the Entra refactor). New users are looked up by `repo.FindByOIDCSubject`, with `email` and `name` refreshed from the JWT on every login.

No env-var allowlist. If the wrong person logs in first, the fallback is a manual SQL update:

```sql
UPDATE users SET roles = '["admin"]'::jsonb WHERE email = '…';
```

## Role preservation on login

`SyncFromToken` refreshes `email`, `name`, `last_login_at` from JWT claims, but **never** touches the `roles` column for existing users. The `Upsert` query's `ON CONFLICT DO UPDATE` clause also excludes `roles` as defense-in-depth. A role only ever changes through an explicit admin action via `UpdateRole`.

## Role change endpoint

`PATCH /api/v1/users/:id/role` - admin-only (`RequireRole("admin")`). The service enforces two guardrails **server-side regardless of UI gating**:

1. An admin cannot change their own role (`ErrCannotModifySelf`, 403) - prevents accidental lockout.
2. The last remaining admin cannot be demoted (`ErrLastAdmin`, 409) - uses `repo.CountByRole("admin")` at decision time.

## RequireRole usage

Variadic. `RequireRole("admin", "editor")` authorizes if the user holds *any* of the listed roles.

### ⛔ The gate must be registered BEFORE the handler

```go
g.Post("/", writer, handler.CreateThing)  // correct - gate runs, then handler
g.Post("/", handler.CreateThing, writer)  // WRONG - gate never runs at all
```

Fiber executes only `Handlers[0]` of a matched route (`fiber/v3 router.go`, `route.Handlers[0](c)`); later handlers run only if the previous one calls `c.Next()`. Every domain handler terminates the chain with `c.Status(...).JSON(...)` and never calls `c.Next()`, so **a gate passed after the handler is dead code** and the route is left completely ungated.

This is not hypothetical - it shipped. Every gated write route across all eight domains, plus admin-only `GET /api/v1/users`, `PATCH /users/:id/role` and `GET /api/v1/audit`, was silently unauthorized until it was fixed. A `viewer` could write everything.

Two reasons it went unnoticed for so long, both worth remembering:

- **The group-level `.Use(auth.RequireAuth())` is unaffected**, because `Use` registers a separate prefix-matching route whose handler *does* call `c.Next()`. Authentication worked correctly the whole time, which made the routes look gated.
- **No test could catch it.** Every domain route test constructs the middleware with `auth.Config{Mode: auth.ModeNone}`, and `RequireRole` short-circuits to `c.Next()` when `!cfg.Enabled()` - an unconditional pass-through. Argument order is invisible under `ModeNone`.

The regression guard is `TestGatesPrecedeHandlers` in `backend/internal/middleware/authz_test.go`. It walks `app.GetRoutes()` for every domain's `RegisterRoutes` and asserts that any `RequireRole` handler sits at index 0, so a misordered gate fails CI regardless of which domain introduces it - including domains added later. It needs no database and no auth enabled.

## Gated routes

Source of truth is each domain's `routes.go`. Keep this table in sync when routes change.

| Domain | Endpoint | Required |
|---|---|---|
| terminals | `GET /api/v1/terminals`, `GET /:id`, `GET /terminals/tags` | auth only |
| terminals | `POST`, `PATCH /:id`, `DELETE /:id` | admin or editor |
| tags | `GET /api/v1/tags` | auth only |
| tags | `POST /api/v1/tags`, `DELETE /api/v1/tags/:name` | admin or editor |
| kits | `GET /api/v1/kits`, `GET /:id` | auth only |
| kits | `POST`, `PATCH /:id`, `DELETE /:id`, `POST /kits/import` | admin or editor |
| terminals | `POST /api/v1/terminals/import`, `POST /api/v1/import` (legacy) | admin or editor |
| sections | `GET /api/v1/sections` | auth only |
| sections | `POST`, `PATCH /:key`, `DELETE /:key` | admin or editor |
| contracts | `GET /api/v1/contracts`, `GET /:id`, `GET /contracts/fiscal-years` | auth only |
| contracts | `POST`, `PATCH /:id`, `DELETE /:id` | admin or editor |
| equipment | `GET /api/v1/equipment`, `GET /:id`, `GET /:id/photo` | auth only |
| equipment | `POST`, `PATCH /:id`, `DELETE /:id` | admin, editor or rto† |
| equipment | `POST /:id/photo` (Azure Blob photo upload), `DELETE /:id/photo` (photo removal) | admin, editor or rto† |
| equipment | `POST /api/v1/equipment/import` | admin, editor or rto† |
| waveforms | `GET /api/v1/waveforms`, `GET /waveforms/usage` | auth only |
| waveforms | `POST`, `PATCH /:id`, `DELETE /:id`, `POST /waveforms/import` | admin, editor or rto |
| services | `GET /api/v1/services`, `GET /services/usage` | auth only |
| services | `POST`, `PATCH /:id`, `DELETE /:id`, `POST /services/import` | admin or editor‡ |
| transports | `GET /api/v1/transports` | auth only |
| transports | `POST`, `PATCH /:id`, `DELETE /:id`, `POST /transports/import` | admin, editor, rto or planner¶ |
| platforms | `GET /api/v1/platforms` | auth only |
| platforms | `POST`, `PATCH /:id`, `DELETE /:id`, `POST /platforms/import` | admin, editor, rto or planner¶ |
| nets | `GET /api/v1/nets/:section` | auth only |
| nets | `POST /api/v1/nets/:section`, `PATCH /nets/id/:id`, `DELETE /nets/id/:id`, `POST /nets/:section/import` | admin, editor, rto or planner |
| pace | `GET /api/v1/pace/:section`, `GET /pace/:section/emblem` | auth only |
| pace | `PUT /api/v1/pace/:section` | admin, editor, rto or planner |
| pace | `POST /pace/:section/emblem`, `DELETE /pace/:section/emblem` | admin, editor, rto or planner |
| organizations | `GET /api/v1/organizations` | auth only |
| organizations | `POST`, `PATCH /:key`, `DELETE /:key`, `POST /organizations/import` | admin, editor, rto or planner¶ |
| operations | `GET /api/v1/operations`, `GET /:id`, `GET /:id/participants/:org_key` | auth only |
| operations | `POST`, `PATCH /:id`, `DELETE /:id`, `PUT /:id/phases`, `PUT /:id/sites`, `PUT /:id/phases/:phase_id/plan`, `PUT /:id/participants/:org_key`, `DELETE /:id/participants/:org_key`, `POST /:id/participants`, `PATCH /:id/participants/id/:pid`, `DELETE /:id/participants/id/:pid` | admin, editor, rto or planner¶ |
| import | `POST /api/v1/import` | admin or editor |
| export | `GET /api/v1/export/terminals`, `/kits`, `/contracts`, `/equipment`, `/waveforms`, `/services`, `/transports`, `/platforms`, `/organizations`, `/nets/:section`, `/pace-channels/:section` | auth only |
| template | `GET /api/v1/{terminals,kits,equipment,waveforms,services,transports,platforms,organizations}/import/template`, `/nets/import/template`, `/api/v1/import/template` (legacy) | **none**♦ |
| csv bulk | `POST /api/v1/export/bundle`, `POST /api/v1/template/bundle` | auth only§ |
| users | `GET /api/v1/users/me`, `GET /:id`, `PATCH /:id/preferences` | auth only |
| users | `GET /api/v1/users`, `PATCH /:id/role` | admin |
| audit | `GET /api/v1/audit` | admin |

♦ The ten template routes are registered on the raw `app`, **before** any group takes `RequireAuth()`, so they answer without a token. That is deliberate and asserted: `TestImportTemplatesAreReachableWithoutAuth` fails if any of them starts 401ing. A template is a header row and nothing else - it discloses column names the frontend already ships in `csv-columns.ts` - and gating it would mean a viewer could fetch a template from the header control and not from Settings, which is the asymmetry `csv-toolbar.tsx` documents at its `showTemplate`. They were missing from this table entirely until it was corrected, which is exactly the kind of omission the table's own "keep this table in sync" rule is about: ten unauthenticated routes are the entries most worth writing down.

† rto passes the route gate but is then narrowed per-record to `terminal_type = 'radio'` in the service. See the section above.

§ The two bundle endpoints are `POST` but carry no `RequireRole`, so they are two of the three entries in `ungatedWrites` in `authz_test.go` (the third is `PATCH /api/v1/users/:id/preferences`, authorized by ownership rather than role). They are POSTs because a nine-dataset column selection does not fit in a query string beside a Bearer token, not because they write anything - both produce a zip and change nothing. The allowlist already states that reasoning per entry, which is the pattern to follow: an entry there is a claim that a write is not a write, and it is argued where it is made.

‡ `rto` is deliberately **excluded** from the services writer gate, and `satcomservice/routes.go` says so at the registration. Services are SATCOM reference data hanging off equipment records - they carry the CIR/MIR rates on a terminal's service rows - and `rto` sits on the radio side of the catalog split. The waveform routes include `rto` for the mirror-image reason. The frontend follows suit: `ServiceLibraryPane` uses `canWrite` and `WaveformLibraryPane` uses `canWriteRadio`.

¶ Transports follow **PACE**, not the catalog, and this footnote used to say the opposite. It grouped transports with services as "catalogue reference data on the equipment side", which excluded `rto` and never admitted `planner`. That premise does not survive contact with the code: nothing in `backend/internal/domain/equipment/` references transports at all, and the only consumer is `TierSourceTransport` in `pace/model.go` - a transport is a non-SATCOM path a PACE tier names. So the writer set is PACE's writer set, and `TransportLibraryPane` uses `canWritePace`. `rto` was not an exception being withheld; it was a misfiling, and the planner gap it produced (build the card, but not the path the card names) is what surfaced it.

Two notes on reading that gate. It currently admits every role except `viewer`, which makes it look equivalent to "any writer" - keep it stated as PACE's set, because the two pick out the same four roles today and stop agreeing the moment a sixth role exists. And `TestPlannerReachesOnlyItsOwnDomains` carries `/api/v1/transports` in `plannerPrefixes` for this reason; a prefix added there with no reason is how that list stops meaning anything. Platforms, organizations and operations are on the same list for the same argument, each with its reason written beside it in the test: joint planning reference data, the participants an operation checks in, and the operations themselves, all gated to PACE's set in their own `routes.go`. The six prefixes there today are `/api/v1/nets`, `/api/v1/operations`, `/api/v1/organizations`, `/api/v1/pace`, `/api/v1/platforms` and `/api/v1/transports`.

### Squadron scoping is data partitioning, not an authorization boundary

`nets` and `pace` take `:section` from the URL, and the service validates it only for
**existence** (`SectionExists`). The consequence, stated plainly so it is not re-flagged
every review:

- Any authenticated user can read **any** squadron's nets and PACE card.
- Any `admin`/`editor`/`rto`/`planner` can write **any** squadron's nets and PACE card.
- There is no per-user section attribute anywhere - no `users.section` column, no claim,
  nothing for a service-layer check to compare against.

**This is intentional, not an oversight.** Roles in this app are global, and terminals and
kits behave identically: a section is a way of partitioning data, not a tenancy boundary.
Squadron scoping was added to stop squadrons from *overwriting each other by accident* -
one shared FIRES that A SQD edits and B SQD then flies with - not to stop an authorized
user from deliberately opening another squadron's card.

What the model does guarantee:

- A net belongs to exactly one squadron, so editing A SQD's FIRES cannot change B SQD's.
- `pace.Service.checkNets` rejects a channel referencing another squadron's net with
  `PACE_NET_WRONG_SECTION`, so a card cannot silently pick up a foreign net even by id.

What it does not guarantee: nothing about *who* may act on which squadron. Turning this
into a real authorization boundary is a schema change plus service-layer checks on all six
scoped endpoints (`users.section` or equivalent, compared against `:section` in
`radionet` and `pace`). That work has not been done and is not implied by the per-squadron
tables.

### The two route-walk guards, and what each one covers

`middleware/authz_test.go` holds two tests over the same route walk, because ordering and
existence are different failures:

- **`TestGatesPrecedeHandlers`** covers **ordering**. For every registered route it finds
  the `RequireRole` handler and asserts it sits at index 0. A route with **no**
  `RequireRole` handler is skipped (`gateIdx == -1` → `continue`) - reads, exports and CSV
  templates are legitimately ungated, and this walk cannot tell an intentional one from a
  mistake. On its own, then, it is blind to a write route registered with no gate at all.
- **`TestEveryWriteRouteIsGated`** covers **existence**, which is the gap the first test
  leaves. Every `POST`, `PUT`, `PATCH` and `DELETE` must carry a `RequireRole` handler
  somewhere in its chain. Reads are deliberately excluded: any authenticated user may
  read, so an ungated `GET` is correct.

The second test needs an allowlist, `ungatedWrites`, and it is keyed by
`METHOD /path` **with a required reason**, precisely so an unexplained entry reads as the
hole it would be. One route is on it: `PATCH /api/v1/users/:id/preferences`, which *is*
authorized - `canAccessUser` allows the caller's own record or an admin - just not by role,
because `RequireRole` cannot express "your own record".

Both walks assert a non-zero count, so a change in route-registration shape cannot make
them vacuously pass. Between them, CI now covers both the misordered gate that shipped once
and the missing gate that would ship the same bypass a different way.

Ten endpoints are deliberately **unauthenticated** - they serve static CSV templates containing no user data, and every one is registered on the raw app ahead of any group middleware:

- `GET /api/v1/import/template` (terminals, legacy path)
- `GET /api/v1/terminals/import/template`
- `GET /api/v1/kits/import/template`
- `GET /api/v1/equipment/import/template`
- `GET /api/v1/waveforms/import/template`
- `GET /api/v1/services/import/template`
- `GET /api/v1/transports/import/template`
- `GET /api/v1/nets/import/template`
- `GET /api/v1/platforms/import/template`
- `GET /api/v1/organizations/import/template`

This list said **two** until 2026-09-11, naming only the terminals and kits routes. The other six had been added one domain at a time, each following the pattern of the one before it, and nothing ever compared the list to the code - the same failure this repo names for version pins and prose. The count is what to check; one command settles it:

```bash
grep -rn "app\.Get(" backend/internal/domain/*/routes.go | grep -v "auth\.Require"
```

An eleventh appearing there without a line here is the signal, and the reason to keep the number in this sentence rather than writing "several".

Viewers can read everything and edit their own preferences but trigger 403 on any write. Editors can mutate every domain's records but cannot manage users or read the audit log. RTOs read everything and write the radio side of the catalog plus waveforms, nets, PACE cards, transports and platforms. Planners read everything and write nets, PACE cards, transports and platforms. Admins can do everything. Contracts navigation is shown to admins and editors only, which changes what the other roles are shown and nothing about what they may read.

## Frontend role surface

`AuthContext` (in `contexts/auth-context.tsx`) derives `role`, `isAdmin`, and `canWrite` from the current user's roles and exposes them through `useAuth()`.

**`role` is `roles[0]` and is display only. Every permission flag reads membership anywhere in `roles[]`.** That distinction is the whole of a real bug: the flags used to derive from `roles[0]` while the backend's `HasRole` scans the entire slice, so the two layers disagreed about the same user and the frontend was the stricter one. Any user whose array did not *begin* with a recognised role resolved to no role at all, which collapsed `isAdmin`, `canWrite` and `canWriteRadio` to false and hid controls the server would have allowed - no row edit icon, so no drawer, so no Delete. The API only ever writes one role, since `UpdateRole` replaces the array outright, which is exactly why position cannot be trusted: the arrays that break it are the ones the API did not write. `auth-context.test.tsx` pins the membership cases.

- `canWrite` = admin OR editor
- `canWriteRadio` = admin OR editor OR rto
- `canWritePace` = admin OR editor OR rto OR planner
- `canSeeContracts` = admin OR editor
- `canSeeTrackers` = admin OR editor
- `isAdmin` = admin only
- `isPlanner` = planner, AND none of admin / editor / rto

**There are now two scoped write surfaces, not one.** `canWriteRadio` used to gate four
things at once - nets, PACE, waveform creation and the catalog editor - and `planner` writes
the first two while only reading the catalog, so the flag had to divide before the role could
exist. `canWritePace` gates **nets and PACE**: the header's Add Net, the nets page actions and
drawer, `pace-section-page`'s edit entry and `pace-editor-page`'s guard. It also gates the
Operations surface, whose routes carry the same writer set: the Add Operation row and
button, the operation drawer, and on `/operations/:id` the banner's Edit, the Participants popup's Join Operation, Edit and Remove, each Loadout tab's Edit, the empty Loadout view's Join Operation, and the Web view's View plan chip,
and the Join Operation wizard's Add to library form (`OrganizationFields`), and the Settings page's Organizations tab (Add organization, each row's pencil and delete). `canWriteRadio` keeps
its original meaning for **waveform creation and the catalog editor**. Every role that held the
old flag holds both, so nothing lost access. `csv-domains.ts`'s `CsvWriteGate` gained the same
third value, with `nets` and `pace-channels` on `canWritePace` and `waveforms` staying on
`canWriteRadio`; `csv-domains.test.ts` asserts which dataset sits behind which.

Both remain deliberate booleans rather than a general `canWrite(scope)`: a boolean per scoped
surface stays cheaper than reworking the ~40 places that read `canWrite`.

`canSeeTrackers` (admin or editor) shapes **navigation** and must not be read as authorization.
It hides the sidebar's Terminals, Kits and By Section groups and the two header nav items for
the Terminals and Kits trackers, which are also the Dashboard's tiles, because the Dashboard
draws one tile per nav item the viewer can see (`visibleNavItems` in
`components/layouts/nav-items.tsx`). Viewer, rto and planner therefore see Dashboard, Stats,
Catalog, PACE, Operations and Settings. It is additive, like `canSeeContracts`, so a wider role
satisfies it directly.
The `/` redirect and the not-found button go to `/dashboard` for every role via
`homePathFor` / `fallbackPathFor` in `routes/home-path.ts`; they used to be planner-specific.

`isPlanner` used to carry the trackers rule for the planner role alone.
It still exists, with the nav list's `hideFromPlanner` field, and **subtracts** rather than
grants, so it excludes the broader roles; no nav item uses it today.

`canSeeContracts` is the second navigation flag and the same warning applies. Contracts are
internal, so the sidebar Contracts group, the header's Contracts page-menu entry and the
Stats page's Contracts panel render only for admin and editor, and the fiscal-years and
stats-count queries are skipped for everyone else. It is **additive** (`admin || editor`),
so unlike `isPlanner` it needs no "wider role wins" guard, and it is a flag of its own rather
than a reuse of `canWrite`: the two name the same roles today and stop agreeing the moment a
role can write contracts it should not be steered towards, the same argument the `¶` footnote
makes for stating transports as PACE's set. Nothing is denied: `GET /api/v1/contracts`, the
fiscal-years route and `GET /api/v1/export/contracts` stay auth-only, `/contracts` renders
read-only by URL for any role, and the export dialog still lists the dataset. The header carries
these gates as `gate: 'isAdmin' | 'canSeeContracts' | 'canSeeTrackers'` on a nav item, naming a flag the way
`help-content.ts` does, with `hideFromPlanner` kept separate because it subtracts.

`canWriteRadio` is read by `WaveformLibraryPane.tsx`, `sidebar.tsx` (the
catalog **Editor** link), `header.tsx` (the `+` menu's Add Waveform row, and the
other three library rows read `canWrite` or `canWritePace` to match the pane
table below), `catalog-editor-page.tsx`, the three CSV modules
(`csv-domains.ts`, `csv-header-controls.tsx`, `csv-toolbar.tsx`) and the help
surface (`help-content.ts` gates, rendered by `help-dialog.tsx`). It is defined
in `auth-context.tsx`.

The catalog editor gates on the *draft* rather than the user alone -
`canWrite || (canWriteRadio && draft.terminal_type === 'radio')` - since satcom
and radio records share that page.

**`help-dialog.tsx` is the only surface that reads all four flags**, and it is
the one place where a wrong flag is invisible. Its `gatePasses` switches over
`isAdmin`, `canWrite`, `canWriteRadio` and `canWritePace` to decide
whether a topic's `gate` admits the reader, so a topic gated on the wrong flag
does not throw, does not 403 and does not look broken - it simply shows a reader
instructions for a control they do not have, or hides instructions they do.
`help-content.test.ts` catches a gate on a route that refuses nobody and a route
a gate contradicts, but **not** a gate naming the wrong one of the four. That one
is read, not checked. When a flag's meaning changes, grep `gate:` in
`help-content.ts` alongside the component list above.

**`catalog-page.tsx` reads no permission flag at all, and that is worth stating
rather than leaving as an absence.** It used to read both: a waveform create
button, and `(isWaveforms && canWriteRadio) || (isServices && canWrite)` behind
an `Edit library` link that switched on which library tab was open. Both went
when the Waveforms and Services tabs were retired to `/catalog/comms-library`.
The browse page is now purely a read surface - every tab is a `terminal_type`
filter over equipment, and `GET /api/v1/equipment` is open to any authenticated
user - so a gate there would have nothing to gate. Write affordances for the
two libraries live on the Comms Library route, in the panes, which is where the
table below picks them up.

All of this is UX only; the backend enforces the same rules and is the actual
control.

**A screen hosting several domains needs one gate per domain, and assuming
otherwise produced three bugs here.** `canEditDraft` decides whether the
*equipment form* opens; it says nothing about the four reference libraries,
and each of those has its own backend writer role:

| Surface | Gate | Because |
|---|---|---|
| editor: equipment form | `canEditDraft` | one route serves satcom and radio, split by `terminal_type` |
| editor: `+SATCOM` in the list rail | `canWrite` | an `rto` starting a satcom draft can only reach the refusal screen |
| `WaveformLibraryPane` | `canWriteRadio` | waveforms are radio reference data, the one thing an `rto` writes |
| `ServiceLibraryPane` | `canWrite` | services are SATCOM reference data; `rto` writes none of it |
| `TransportLibraryPane` | `canWritePace` | a transport is a path a PACE tier names, so it follows PACE's writers - see ¶ |
| `PlatformLibraryPane` | `canWritePace` | a platform carries the radios a PACE tier plans around, so it follows transports |

Organizations have no pane. They are picked only inside Operations, and the
Join Operation wizard, participant board and roster popup on `/operations/:id`
gate their writes, the wizard's Add to library form included, on `canWritePace`
for the reason platforms do: an organization is a participant of an operation,
which PACE's writers plan.
The Settings page's Organizations tab, where the library is listed, added to,
edited and deleted, is gated on `canWritePace` for the same reason: the tab is
not drawn without it, and `?tab=organizations` falls back to the first tab the
reader may open.

The panes no longer live in the editor - they are their own components under
`components/catalog/`, mounted by `/catalog/comms-library`. **That each one
gates itself is what makes that route ungated**: browsing is open to everyone
and the editing affordances appear only for the roles that hold them. Any
further pane must gate itself too.

There are four of them now, and this section said three until it was corrected. A fifth,
an Organization Library pane, arrived with Operations stage 1 on 2026-10-09 and
was removed the same day, because organizations are visible only inside
Operations; its gate moved to the Join Operation wizard, as the note under the
table says.
That is worth more than a corrected number: the sentence "a fourth pane must
gate itself too" was written as a warning and then a fourth pane arrived, so
what the warning was for is now a row in the table above rather than a
prediction. Count the files rather than trusting the prose:

```bash
ls frontend/src/components/catalog/*LibraryPane.tsx
```

Two bugs and one near-miss are recorded in those gate choices. The two
`canWrite` panes were originally ungated, so an `rto` writer saw working-looking
`+ Add Service` and `+ Add Transport` buttons that returned 403. And
`WaveformLibraryPane` had **no gate at all** - correctly, while it only ever
rendered inside a screen already gated on `canWriteRadio`, and dangerously the
moment it moved to a route anyone can open, which would have handed waveform
create, edit and delete to every viewer. A gate inherited from a parent is not a
gate the component has. Both directions are pinned in
`comms-library-page.test.tsx` - hiding the controls unconditionally fails the
admin half.

The role list lives in `frontend/src/types/roles.ts`, not in `auth-context.tsx`:
exporting a value from the context module trips `react-refresh/only-export-components`.

Pages and components pull these helpers rather than re-deriving from `user.roles`.

`useCurrentUser()` (which fetches `/api/v1/users/me`) is gated on MSAL having an active account when `AUTH_ENABLED=true`. Without the gate, the request would fire pre-login without a Bearer token and the backend would 401.

### Viewer UI gating on the terminals page

When `canWrite` is false:
- Hide Import / Add Terminal buttons in the header (Export and Template stay - both are reads)
- Hide the hover-revealed row pencil
- Render each inline cell via `readOnly` prop (display only, no click-to-edit, no pencil, no menu)
- Disable the Notes click-to-open-drawer (swap "Add note…" placeholder for em-dash)
- Refuse to open `TerminalDrawer` even if a viewer crafts `?drawer=add` manually

Server-side `RequireRole` remains the authoritative gate; UI gating is purely cosmetic/UX.

## The newer sections, audited 2026-09-11

The catalog, the four reference libraries, compare, nets and PACE all arrived after
the sections above were written, and their permissions had never been stated in one
place. The audit's headline is that **the backend is sound**: `TestEveryWriteRouteIsGated`
walks every registered route and fails on a `POST`/`PUT`/`PATCH`/`DELETE` without a
`RequireRole` anywhere in its chain, so nothing here can ship ungated by accident. The
findings below are all about the frontend, the docs, or a policy nobody had decided.

**Compare has no backend at all.** `/catalog/compare` and `/catalog/compare/print` are
pure frontend over `GET /api/v1/equipment`, which is `RequireAuth` and nothing more.
There is nothing to gate, and the sidebar link is ungated deliberately - comparing is a
read, and every catalog read is open. Do not "fix" it by adding a gate.

**The Comms Library route is ungated and its panes gate themselves.**
`/catalog/comms-library` refuses nobody, and each pane reads the flag matching **its own
route** rather than whichever flag its neighbours in the chip row use:
`WaveformLibraryPane` on `canWriteRadio`, `ServiceLibraryPane` on `canWrite`,
`TransportLibraryPane` on `canWritePace`. Mirroring the neighbour instead of the route is
exactly how transports were mis-gated for as long as they existed. This is also why the
help topics pointing there carry `roles` but deliberately no `gate` - see
`.claude/context/help.md`.

### Three findings, all now fixed

Recorded and closed the same day by three pull requests. Kept here rather
than deleted, because each says why the gate is what it is, and a reader who sees only
the current role list will re-derive the old one.

**1. Transports were mis-classified, not merely missing `planner`.** Filed as
"extend transports to planner", which was the right role set reached by the wrong
argument. The gate read `admin, editor`, with `transport/routes.go` calling transports
"catalogue reference data on the equipment side of the split" and excluding `rto` for the
reason services exclude it. Nothing in `domain/equipment` references transports at all;
the only consumer is `TierSourceTransport` in `pace/model.go`. The gate is now
`admin, editor, rto, planner` and the pane `canWritePace` - see the `¶` footnote above
for the full reasoning and the two traps in reading it.

Services were **not** touched: they genuinely are SATCOM reference data hanging off
equipment records, so the `‡` footnote's services half stands unchanged.

**2. The equipment CSV import control was gated more tightly on the frontend than on the
backend.** `csv-domains.ts` gated Import on `canWrite`, while
`POST /api/v1/equipment/import` admits `rto` and narrows per record via `ActorRadioOnly`,
so an rto who could create a radio record through the form could not see Import for the
same records. The frontend now reads `canWriteRadio`. The backend was left alone
deliberately - tightening it instead would have removed a capability the service was
written to support and made `ActorRadioOnly` dead on that path.

**3. Photo upload had no gate of its own.** The control in `EquipmentFormPane`
read no permission flag; it was safe only because `CatalogEditorPage` early-returns a
refusal before rendering the pane - **a gate inherited from a parent is not a gate the
component has**, the same shape as the `WaveformLibraryPane` defect in an earlier release. It now
takes `canEdit` as a prop.

A prop rather than a second `useAuth()` call, which is where this differs from the
waveform fix: `canEditDraft` reads the record as well as the user ("an rto may edit a
radio record but not a satcom one"), and two copies of a per-record rule are two things
to keep in step.

Covering it needed one more step than it looks. Because the page refuses first, `canEdit`
is always true by the time the pane renders, so the false branch cannot be reached by
rendering the page - a page-level test can only ever show the control *appearing*, which
would leave the gate deletable with every test still green. `EquipmentFormPane` is
therefore exported for tests, which render it directly with `canEdit` false and true.
That in turn forced `EditorDraft` and `blankDraft` out into `catalog-editor-draft.ts`:
`react-refresh/only-export-components` fails a module mixing component and non-component
exports, and this repo lints at `--max-warnings 0`, so suppressing it was not an option.

### Route-level gating does not exist on the frontend, on purpose

`ProtectedRoute` waits on `isLoading` and nothing else, and every route in
`router.tsx` is wrapped in that same component - `/users` and
`/catalog/editor` included. Those pages are reachable by URL for any authenticated user
and answer with a refusal rather than a redirect. (`/audit` is now only a redirect to the
Settings page's Audit log tab, which is drawn for `isAdmin` alone and has no page-menu row.)
The header's page menu does not offer `/users` below admin, though: it carries
`gate: 'isAdmin'`, because it is a page whose **read** the server refuses, and a menu entry whose only destination
is a refusal screen is not navigation. Hidden from the menu and refusing by URL are the
same decision seen from two sides - the server is the authority either way. There is no `RequireRole`, no
`useRole`, no `can()` on the frontend; the whole surface is five booleans off `useAuth()`.

This is a decision, not an oversight, and it is recorded here because it reads like one.
A refusal tells the reader what happened; a silent redirect tells them the page does not
exist, which is a worse answer to "why can I not do this" - the question the whole
`roles` help group exists to answer. The server is the authority either way.

## Self-registration (Entra-driven)

Self-registration is now controlled at the Entra tenant level, not by the application. The app registration has no special "registration" toggle - anyone the tenant admin allows to authenticate against the tenant can sign in. On first sync to the backend they're bootstrapped via the first-user-wins logic above.

Tenant-side controls that affect who can sign in:

- **App reg "Supported account types"** - single-tenant by default (only the owning tenant's users); change to multi-tenant if you need cross-tenant access (and accept the auditing implications).
- **Conditional access policies** - MFA, device compliance, location restrictions, etc., enforced before tokens are issued. The app doesn't see these; tokens either arrive verified or the user can't sign in.
- **Admin consent on the `access_as_user` scope** - users can't request the API scope until a tenant admin has consented for the tenant. A tenant admin grants it once, on the app registration's API permissions page.

If unwanted users are signing in, the right place to fix it is the Entra tenant (assignment requirements, conditional access), not the backend.

## Local dev - auth disabled

The default compose dev stack runs with `AUTH_ENABLED=false` (set in `compose.dev.yaml`). When auth is disabled:

- The auth middleware bypasses verification entirely (`RequireAuth`, `OptionalAuth`, `RequireRole` all pass through `c.Next()`), and since 2026-10-30 `RequireAuth`, `OptionalAuth` and `Authenticate` attach the synthetic dev identity (`middleware.DevUserID`, "Dev Admin", admin) to Fiber Locals on the way through. Before that a dev request carried no user at all, so every write stored a blank `created_by`, the audit log's actor was blank, and a rule keyed on the actor's id (only the poster resolves an RFI) could never be satisfied on the dev stack. `auth_dev_test.go` holds it in both directions: attached with auth off, refused with auth on.
- The frontend's `apiFetch` skips the `Authorization` header (no MSAL token to acquire).
- `useCurrentUser` fetches `/users/me` unconditionally; with auth disabled the handler answers with the same dev admin **before** reading Locals, because the attached identity is a `middleware.AuthUser` and not a `*user.User`, and the type assertion the enabled path makes would otherwise turn every dev request into a 500. The id, email and name are the middleware's constants, so the two cannot drift apart.

This is the standard local-dev path - no Entra configuration required.

## Local dev - Entra auth enabled (validation only)

To validate the full MSAL → JWT → backend flow locally against your own Entra tenant, set `AUTH_ENABLED=true` plus the required Entra config. Two paths:

**Path A - Vite env vars** (frontend reads these via `import.meta.env`):

`frontend/.env.local`:
```
VITE_AUTH_ENABLED=true
VITE_AUTH_TENANT_ID=<your-tenant-id>
VITE_AUTH_CLIENT_ID=<your-app-reg-client-id>
VITE_AUTH_AUTHORITY_HOST=login.microsoftonline.com
```

Plus an env file for the compose stack supplying matching `AUTH_*` vars to the backend.

**Path B - let the backend inject `window.__SHF_AUTH__`** by running in static mode (`make prod-build`) so the backend templates the config block into the served `index.html`. Heavier (no HMR); useful for verifying the production injection path works end-to-end.

Either way: the app registration's SPA platform must have the dev origin (`http://localhost:3001/`, since the backend proxies the SPA) registered as a redirect URI. Remove the dev origin after validation, or leave it documented as a dev-only artifact.

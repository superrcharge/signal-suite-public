# Operation domain

An operation is a named effort the enterprise plans together.
Each organization **joins** it: what it brings (platforms, catalog radios and terminals, transports), who to call, which phase each thing is there for, where it sits in each phase, and who it must be able to talk to.
The page answers one question from three angles: who can talk to whom, on what, in which phase.

The sidebar's Operations group sits between PACE Planning and Contracts, open on first load.
The header's page picker has an Operations entry and the `+` menu an Add Operation row, both on the `CrosshairIcon` reticle.
Routes:

| Route | What it is |
|---|---|
| `/operations` | the picker, one tile per operation |
| `/operations/:id` | one operation: banner, three views (Loadout, Matrix, Web), the Participants popup, the Join Operation wizard and the Edit drawer over it |
| `/operations/:id/print` | the Web view's print route: one landscape page per phase |
| `/operations/:id/matrix/print` | the Matrix view's print route, paginated |

The two print routes are literal sub-paths of `/operations/:id`, so `router.tsx` declares both **above** the bare `:id` entry, or their last segment would match as an id and render the operation page for an operation that does not exist (the rule `/pace/:section/print` and `/catalog/:id` follow).
There is no per-operation compatibility route; the catalog's joint matrix (`/catalog/compatibility`, see `platform.md`) is a different thing and is untouched.

Stage 0 was the refactor that made the feature possible without copying: `PickerTile` out of `SquadronTile`, `matrix-panels.tsx` and `matrix-print-preview.tsx` out of the compatibility page, `MatrixAsset` and `equipmentColumns` on the matrix model, `article` and `emptyText` on `ReferenceLibraryPane`, and the branch vocabulary into `shared/branch`.
Stage 1 was organizations, operations and participants (migrations 046 to 050).
Stage 2, built on `feature/operations-stage-2`, added phases, per-asset phase marks, locations, per-phase plans, the Loadout, Matrix and Web views and the exports (migrations 051 and 052).

## The model, in the maintainer's words

- **People talk to who they need to talk to.** A phase names its own pairs of units that must be able to talk (requirements). It is not "everyone to everyone", and it is not a default to the JOC: the O6/O5 JOC is just another participant.
- **Everything supports the assault force**, so a phase usually has one supported unit, the **Tier select** (UI label "Tier select", tag "TIER SELECT"). It is set only in the Web view's plan panel.
- **ISB, FSB, MSS and "the X" are physical locations** (`sites` in code). A unit's location changes by phase, so the assault force can move.
- **A participant is an organization, not a person.** Several representatives of one organization share one row.
- **Every asset an organization brings is present in some of the phases**, and the per-phase picture reads only what is present in that phase.

### How a requirement's status is decided

`pairStatus` in `phase-plan-model.ts`, over the interop model built for that phase (`interop-model.ts`):

| Status | Meaning | Legend words | Glyph and colour |
|---|---|---|---|
| direct | the two units share a waveform, SATCOM service or transport, with a source present in that phase | "Direct" | ✓ green, solid |
| relay | they share nothing, but a path exists through other units present in the phase | "Relay - through the named unit" | ↻ amber, dashed |
| no link | no path at all | "No link" | ✕ red, solid |
| absent | one of the two units has nothing present in the phase, so it is not a column | no line is drawn | · |

On HTML surfaces (the Loadout By phase table, the Web key, the wizard's Must talk slot) the glyph is drawn by `StatusIcon` in `status-icon.tsx` as an icon, because the app fonts have no check mark and the text glyph fell back to a thin v.
The SVG picture's pills and the decks keep the text glyph, since their text is measured.

**The relay assumption is a planning rule, stated by the people who plan with it:** a unit holding two means can pass traffic between them (retransmission, cross-banding).
The path is a shortest one over the units' shared means, ties broken by column order, so every render gives the same answer.
It can run through more than one unit; the named `via` is the units along the path.

## Data model

Migrations 046 to 052 and 054, 29 tables and 54 migrations in all.
**Equipment, transport and service ids are not foreign keys**, following `platforms.equipment_ids` (040): the whole kit lives in one row, an organization whose kit is not yet known can join with empty lists, and an id naming a since-deleted record is kept and drawn as missing rather than stripped.
**Waveform abbrevs alone are validated** against the library on write, because the waveform library is the one list the app already refuses an unknown member of.

| Migration | What it adds |
|---|---|
| 046 | `organizations` (library, immutable key; nine colour-named placeholders seeded, see `organization.md`) |
| 047 | `operations` and `operation_participants` |
| 048 | the ad hoc identity columns on `operation_participants` |
| 049 | `operations.acronym`, `operation_participants.platform_ids` |
| 050 | `uav` joins the closed platform type list |
| 051 | `operation_phases`, `operation_participant_asset_phases` |
| 052 | `operation_sites`, `operation_phases.supported_participant_id`, `operation_phase_placements`, `operation_requirements` |
| 054 | `operation_rfis`, `operation_rfi_comments` (the RFI board; 053 is a users migration) |

### `operations`

| Column | Notes |
|---|---|
| `id` | UUID text |
| `name` | Unique case-insensitively (`operations_name_lower_idx`) |
| `status` | `planning` (default), `active`, `complete`; CHECK, and `ValidStatuses` in `model.go` is the same literal list, read by `scripts/check-docs.mjs` to hold the glossary to the code. **The column is kept and never shown**, see "The status model" below |
| `acronym` | 049. `VARCHAR(20)` NOT NULL default `''`; optional, rendered and sent uppercase by the drawer |
| `start_date`, `end_date` | `DATE NULL`; not shown by the frontend; CHECK `end_date >= start_date` when both set. Cross the API as `YYYY-MM-DD` (`DateFormat`, the contract domain's shape) or `""` |
| `notes` | up to 4000 |
| `created_by`, `updated_by`, `created_at`, `updated_at` | the usual; `updated_at` is bumped by the phase, site and plan writes too |

### `operation_participants`

| Column | Notes |
|---|---|
| `id` | UUID text |
| `operation_id` | `REFERENCES operations(id) ON DELETE CASCADE` - an operation owns its participants |
| `organization_key` | `REFERENCES organizations(key) ON UPDATE CASCADE ON DELETE RESTRICT`, **nullable since 048** (NULL for an ad hoc row) - a joined organization cannot be deleted; the organization service names the operations first, the constraint is the backstop. Indexed |
| `adhoc_name`, `adhoc_short_label`, `adhoc_branch`, `adhoc_color` | 048. `VARCHAR(120)` NOT NULL default `''`, `VARCHAR(20)` NOT NULL default `''`, `VARCHAR(8)` NULL (CHECK against the seven branches, the same list as 046), `VARCHAR(20)` NOT NULL default `''` |
| `platform_ids` | 049. `TEXT[]` NOT NULL default `{}`, Platform Library ids (airframe, UAV, vessel, vehicle, ground station), no FK, so an id naming a since-deleted platform is kept rather than blocking the delete; request `max=32`, each id `max=64` |
| `equipment_ids` | `TEXT[]`, catalog slugs, SATCOM and radio alike, no FK |
| `waveform_abbrevs` | `TEXT[]`, validated against the waveform library on write; deduplicated case-insensitively keeping the first spelling. **The wizard sends it empty** (direct picks are transports only) |
| `service_abbrevs` | `TEXT[]`, plain strings like `pace_tiers.service_abbrev`, not validated. The wizard sends it empty too |
| `transport_ids` | `TEXT[]`, no FK |
| `poc_name`, `poc_phone`, `poc_email` | 120 / 40 / 255 |
| `notes` | up to 4000 |
| `created_by`, `updated_by`, `created_at`, `updated_at` | `updated_at` is the lock value |

Two constraints from 048 carry the ad hoc rule.
`operation_participants_one_identity` is a CHECK that a row has exactly one identity: either `organization_key` set with `adhoc_name = ''`, or `organization_key` NULL with a non-empty `adhoc_name`.
`operation_participants_adhoc_unique` is a partial unique index on `(operation_id, lower(adhoc_name)) WHERE organization_key IS NULL`, so ad hoc names are unique per operation case-insensitively, while the existing `UNIQUE (operation_id, organization_key)` still holds for library rows because NULLs do not collide.
The 048 Down migration deletes ad hoc rows before restoring the NOT NULL.

### Phases and per-asset phase marks (051)

| Table | Notes |
|---|---|
| `operation_phases` | `id`, `operation_id` (cascade), `position`, `name` `VARCHAR(60)`. Unique `(operation_id, lower(name))`. **No unique constraint on position**, because a reorder rewrites several positions in one statement; the service writes position as the array index |
| `operation_participant_asset_phases` | `(participant_id, asset_id, phase_id)` primary key. **A row means "this asset is present in this phase".** `asset_id` is not a foreign key, like the participant's own id arrays, and can name a platform, a catalog record or a transport. Waveforms and services have no rows of their own: they follow the assets that carry them |

A new operation is seeded with `DefaultPhaseNames` (Phase I to Phase IV) by `CreateOperation`, in the same transaction as the operation insert.
Migration 051 backfilled the same four names for existing operations, with every asset already brought placed in all four.
The Go constant and the migration's VALUES mirror each other and must be changed together.

### Locations, tier select, placements and requirements (052)

There is no backfill: an operation starts with no sites, nothing placed and no requirements.

| Table or column | Notes |
|---|---|
| `operation_sites` | the "locations". `id`, `operation_id` (cascade), `position`, `name` `VARCHAR(60)`. Unique `(operation_id, lower(name))`, and no unique constraint on position, for the reason `operation_phases` has none. Zero sites is allowed |
| `operation_phases.supported_participant_id` | the phase's Tier select. NULL for none. `ON DELETE SET NULL`: a phase outlives the unit it supported |
| `operation_phase_placements` | `(phase_id, participant_id)` primary key, so a unit sits at one site per phase, and `site_id`. All three foreign keys cascade. A unit with no row is not placed, which the picture draws as "No location" |
| `operation_requirements` | `id`, `phase_id`, `participant_a`, `participant_b`. `CHECK (participant_a < participant_b)` and `UNIQUE (phase_id, participant_a, participant_b)`, so a pair is one row whichever way it was entered |

### RFIs (054)

An RFI (request for information) is a question one unit raises to the rest of the operation, answered in a flat thread and closed by the person who asked it.
Decided with the maintainer on 2026-10-30; see "Decisions and history".

| Table | Notes |
|---|---|
| `operation_rfis` | `id`, `operation_id` (cascade), `participant_id` → `operation_participants(id) ON DELETE SET NULL` (the posting unit; the RFI outlives it and is drawn as "Unit removed"), `question`, `status` `open` or `resolved` (CHECK, and `ValidRFIStatuses` in `model.go` is the same literal list, read by `scripts/check-docs.mjs` for the glossary), `created_by` (display name, as every table here), **`created_by_id`** (the local user UUID, because a display name is not an identity and is what the resolve right is checked against), `resolved_by`, `resolved_at`, `created_at`, `updated_at` |
| `operation_rfi_comments` | `id`, `rfi_id` (cascade), `body`, `created_by`, `created_by_id`, `created_at`. A flat list, no nesting |

**The posting unit is picked from the roster when the RFI is written.** The app has no user-to-organization link (`users.organization_key` is the unbuilt Stage 3 item), so the poster says which participant they are asking as.
**Only the user who posted an RFI can resolve it**, matched on `created_by_id`, not their organization and not an admin.
Stated limitation: an RFI whose poster is gone stays open.
Comments are accepted on open RFIs only; there is no reopen and no delete.
**On the dev stack the poster is always "Dev Admin"** (`middleware.DevUserID`): auth-disabled mode used to attach no user at all, so a dev write stored a blank actor and the resolve rule could never match, which this feature was the first to notice. The middleware now attaches the same identity `/users/me` reports; see `authz.md`, "Local dev - auth disabled". Switching the frontend's role (the `currentUser` query data) changes what the UI shows, not the actor the server records, so a second-writer check on dev needs a real sign-in.

## Backend

**Package:** `backend/internal/domain/operation/` - the platform package's shape without `csv.go`: `model.go`, `errors.go`, `dto/{request,response}.go`, `repository.go`, `repository_mock.go`, `service.go`, `service_test.go`, `handler.go`, `routes.go`, `validation.go`, plus the stage 2 files `phases.go`, `sites.go` and `plan.go`, and `rfis.go` for the RFI board, each with its own test file.
The service consumes `contracts.OrganizationLookup` (`checkOrganization`: a key that names no organization is `PARTICIPANT_UNKNOWN_ORGANIZATION`) and `contracts.WaveformLookup` (`checkWaveforms`, naming every unknown abbrev in the caller's spelling), and implements `contracts.OrganizationUsage` (`OperationsUsingOrganization`, the names of the operations an organization is joined to).
Both lookups are nil-tolerant, so a `Service` built without them skips the check and leaves the foreign key to refuse; a root-level test asserts the wiring rather than only the rule.
Wiring in `main.go`: `SetOrganizationLookup(organizationService)`, `SetWaveformLookup(waveformService)`, `SetAudit(auditService)`, and on the other side `organizationService.SetOrganizationUsage(operationService)`.

**Reads.**
`FindAll` orders `created_at DESC` (newest-created first, so the picker reads left to right from what was just added; it was `start_date DESC NULLS LAST` until 2026-10-14, an order no screen shows), then name natural-sorted, and reads `participant_count` with each row (not a column).
`GetOperation` returns the operation, its participants (each with an `organization` summary joined in by the query, and `asset_phases`), its phases (each with `supported_participant_id`, `placements` and `requirements`) and its `sites` in one response, so the page never makes a second call.
Both the list and the detail carry `open_rfi_count` the way they carry `participant_count`: a correlated count in `opCols`, not a column, so the banner's **RFIs (n)** reads it from the detail the page already polls.
The RFIs themselves are a separate `GET .../rfis` (two queries, RFIs then comments, however many there are), fetched only while the popup is open.
The plans of every phase come from two queries however many phases there are (`FindPhasePlans`), never one per phase.
Participants are ordered by organization name.

### Rules the routes follow

**Participant writes are an upsert or an id-keyed replace.**
`SaveParticipant` (`PUT .../participants/:org_key`) is an upsert keyed by (operation, organization): 201 when the organization had not yet joined, 200 when an existing row was replaced, and a save that changes nothing writes nothing and records nothing.
The id-keyed operations (`CreateParticipant`, `UpdateParticipantByID`, `DeleteParticipantByID`) are what the wizard and popup call.
Create takes either `organization_key` or an `adhoc` object (`name` required, `short_label`, `branch` through the same alias normaliser organizations use, `color`), never neither.
A library organization that is already joined collides with `UNIQUE (operation_id, organization_key)`, which the repository maps to `PARTICIPANT_STALE` (409), the same answer a lost first-save race gets; the wizard offers an already-joined organization as "already joined" so the case is not reached by clicking.
Update replaces the picks and contact fields with the same lock as the keyed `PUT`; it cannot change identity.
Moving a join to another organization is a remove and a new join, which is why the wizard makes step 1 read-only in edit mode.
Status, dates and date order are resolved on create and update (`resolveStatus` lowercases and defaults blank to `planning`; `parseDate` treats blank as nil; a present blank date on PATCH clears it).
`normaliseIDs` drops blanks and exact repeats; `normaliseAbbrevs` drops repeats differing only by case.

**`expected_updated_at` is an optimistic lock.**
A `PUT` replaces the whole row's picks, the contact fields and (when sent) its phase marks, and a `PATCH` by id carries the same lock, so saving over a row somebody else changed since the editor's read would silently discard whoever got there first.
The client sends back the `updated_at` it last read; a mismatch, or a row that has since been removed, is `PARTICIPANT_STALE` (409) and the wizard stays open so the picks are not lost.
A first save omits it.

**`asset_phases` on a participant write, and the omitted-asset rule.**
The participant PUT, POST and PATCH accept an optional `asset_phases` map (asset id to phase ids), and the row and its marks commit in one transaction under the same `updated_at` lock.
- Absent or null leaves the stored marks alone, except that an asset newly added to the lists goes into every phase and one removed from them loses its rows.
- When sent, each key must be one of the row's own platform, equipment or transport ids (`PARTICIPANT_UNKNOWN_ASSET`) and each phase id one of the operation's (`OPERATION_UNKNOWN_PHASE`).
- **An asset in the lists but missing from a sent map goes into every phase**, so a client that knows nothing about phases never benches an asset by accident. An empty list means "brought, in no phase".
- The read side agrees: an asset with no key in `asset_phases` is present in every phase (`isPresent` in `interop-model.ts`).

**`PUT /phases` is an ordered replace-all.**
An entry with an id is kept (renamed, repositioned), one without is inserted, an existing phase left out is deleted and its asset rows, placements and requirements cascade.
It needs at least one phase (`OPERATION_PHASES_REQUIRED`), names of 1 to 60 characters after trimming (`OPERATION_PHASE_NAME_INVALID`), no two names equal ignoring case (`OPERATION_PHASE_NAME_EXISTS`, 409), and ids that belong to the operation (`OPERATION_UNKNOWN_PHASE`).
A list that changes nothing writes nothing.
Its response carries each kept phase's plan as stored and a new phase with an empty one; it replaces the phase list only.

**Carry-forward.**
**A new phase copies the asset rows of the phase immediately before it in the new order, and a new first phase copies nothing.**
`carryForwardAssetRows` in `phases.go` is that rule and nothing else, with its own table of tests.

**`PUT /sites` is an ordered replace-all like phases**, with no carry-forward and zero allowed.
It parks every name on its own id before renaming, as the phases replace does, so a swap of two names does not collide on the unique index.

**`PUT /phases/:phase_id/plan` replaces one phase's whole plan:** its `supported_participant_id`, its `placements` (`{participant_id: site_id}`) and its `requirements` (`[{a, b}]`).
It returns the phase object bare, as GET carries it.

**The a < b rule.**
A requirement is an unordered pair, stored with the smaller participant id first.
The database refuses `a == b` and `a > b`, and the service normalises before writing, so a client may send either order.
A pair that is already stored keeps its row id when the plan is saved again.

**Merge rules (who edits what).**
The Web view's plan panel edits a whole phase; the wizard's Phases step edits one unit's slice of every phase.
The stored plan is the same, merged on save: the wizard sends the phase's whole plan back with only that unit's placement and the pairs that name that unit changed (`mergedPlan` in `wizard-phase-plan.ts`), so a save from the wizard cannot undo what someone planned on the Web view, and the supported unit is never touched by it.
The plan panel leaves alone a stored placement or requirement naming a unit that is not present in the phase.

**Cascades.**
Deleting a participant removes its asset marks, its placements and every requirement it appears in, and clears it as a phase's supported participant.
Deleting a site removes the placements at it, and the units that were there become unplaced.
Deleting a phase removes its asset marks, placements and requirements.
The foreign keys do all of this, and a mock cannot show a foreign key firing, so it was confirmed against the dev database by deleting a participant and a site inside a transaction.
The service pre-checks that a site and a participant belong to the operation, which the foreign keys cannot say, because they only know the row exists somewhere.

**Locks.**
Both the sites and the plan writes use PACE's writer set, take the operation row `FOR UPDATE`, bump `operations.updated_at`, and write nothing and record nothing when the request changes nothing.
The participant row's own lock is `expected_updated_at`, above.

**RFI writes** (`rfis.go`): posting needs a `participant_id` that belongs to this operation (`PARTICIPANT_NOT_FOUND`, the pre-check the foreign key cannot make) and a question of 1 to 2000 characters after trimming; a comment needs an open RFI on this operation and a body of 1 to 2000; resolving needs the caller's user id to equal the RFI's `created_by_id` (`RFI_NOT_POSTER`, 403) and refuses a second resolve (`RFI_RESOLVED`, 409).
Each is audited as `operation_rfi`: `create` for the post, `update` with a `comment` diff for a reply and a `status` diff for the resolve, the resource name being `<operation> - <unit label> - <the start of the question>`.

**Audit:** four resource types - `operation`, `operation_participant`, `operation_rfi` and, from the other package, `organization`.
An `operation` update diffs name, acronym, status, start date, end date and notes (dates render as `YYYY-MM-DD`), plus `phases: {old, new}` and `sites: {old, new}` as comma-separated name lists and `phase_plan: {old, new}`, one line each, naming the phase, the supported unit, the placements as `unit at site` and the requirements as `unit - unit`, with unit labels (short label, else name) and site names rather than ids.
An `operation_participant` (`resource_name` is `<operation> - <organization>`, or `<operation> - <ad hoc name>`) update diffs the four lists, recorded joined, the contact fields and notes, and `asset_phases`, naming only the assets that moved and the phases by name.
Every no-change write records no event. See `audit.md`.

**CSV:** none, declared `"no"` in `csv-manifest.json` with the reason per column: a participant row is meaningless without the operation and organization it joins, so a flat file of either table loses the relationship it exists to record; an import would bypass every cross-domain check the editor performs; and with no import a template is a file that leads nowhere.

## API

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/v1/operations` | any authenticated | All operations with `participant_count`, newest created first |
| GET | `/api/v1/operations/:id` | any authenticated | The operation, its participants (each with `asset_phases`), its phases (each with `supported_participant_id`, `placements`, `requirements`) and its `sites`. Never null: `[]` and `{}` |
| GET | `/api/v1/operations/:id/participants/:org_key` | any authenticated | One participant; 404 `PARTICIPANT_NOT_FOUND` when that organization has not joined |
| POST | `/api/v1/operations` | admin, editor, rto or planner | `name` required and unique (case-insensitive); 400 on a bad status or dates, 409 on a duplicate. Seeds the default phases |
| PATCH | `/api/v1/operations/:id` | admin, editor, rto or planner | Partial update - nil fields ignored; a present blank date clears it |
| DELETE | `/api/v1/operations/:id` | admin, editor, rto or planner | Hard delete, cascading to everything it owns, audited |
| PUT | `/api/v1/operations/:id/phases` | admin, editor, rto or planner | Ordered replace-all of the phase list |
| PUT | `/api/v1/operations/:id/sites` | admin, editor, rto or planner | Body `{sites: [{id?, name}]}`, an ordered replace-all, zero allowed. Returns `{sites}` |
| PUT | `/api/v1/operations/:id/phases/:phase_id/plan` | admin, editor, rto or planner | Body `{supported_participant_id: string or null, placements: {participant_id: site_id}, requirements: [{a, b}]}`, replacing that phase's whole plan |
| POST | `/api/v1/operations/:id/participants` | admin, editor, rto or planner | Join by id. Body is `organization_key` (a library organization) **or** `adhoc: {name, short_label, branch, color}` (an "Other"), plus the pick lists, `asset_phases`, `poc_name`, `poc_phone`, `poc_email`, `notes`. 201 with the participant |
| PATCH | `/api/v1/operations/:id/participants/id/:pid` | admin, editor, rto or planner | Replace the picks, marks and contact fields of one row, library or ad hoc; `expected_updated_at` optional, 409 when stale. Identity cannot change |
| DELETE | `/api/v1/operations/:id/participants/id/:pid` | admin, editor, rto or planner | Remove one row by its id (the Participants popup's Remove); 404 `PARTICIPANT_NOT_FOUND` when it is not on the operation |
| PUT | `/api/v1/operations/:id/participants/:org_key` | admin, editor, rto or planner | Upsert; the body replaces the whole row. `expected_updated_at` optional, refused with 409 when stale |
| DELETE | `/api/v1/operations/:id/participants/:org_key` | admin, editor, rto or planner | Remove by organization key; 404 when it has not joined. Unused by the UI |
| GET | `/api/v1/operations/:id/rfis` | any authenticated | `{rfis}`, each with its `comments`; open ones newest first, comments oldest first |
| POST | `/api/v1/operations/:id/rfis` | admin, editor, rto or planner | Body `{participant_id, question}`; 201 with the RFI |
| POST | `/api/v1/operations/:id/rfis/:rfi_id/comments` | admin, editor, rto or planner | Body `{body}`; 201 with the updated RFI; 409 `RFI_RESOLVED` on a closed one |
| POST | `/api/v1/operations/:id/rfis/:rfi_id/resolve` | admin, editor, rto or planner, **and the poster** | No body; 200 with the RFI; 403 `RFI_NOT_POSTER` for anyone else |

`id` is a literal segment in the id-keyed routes, so they cannot collide with the keyed ones, whose second segment is an organization key (radionet's `/nets/id/:id` shape).
The role gate is passed before the handler on every write route, because Fiber runs only `Handlers[0]` and a trailing gate would never execute.
`/api/v1/operations` and `/api/v1/organizations` are in `plannerPrefixes` in `middleware/authz_test.go`, which is what makes `TestPlannerReachesOnlyItsOwnDomains` expect a planner to pass these gates and fail every other.

**Error codes** (`operation/errors.go`):

| Code | Status | When |
|---|---|---|
| `OPERATION_NOT_FOUND` | 404 | the id is not an operation |
| `OPERATION_NAME_EXISTS` | 409 | the name is taken, compared case-insensitively |
| `OPERATION_INVALID_STATUS` | 400 | not `planning`, `active` or `complete` |
| `OPERATION_INVALID_DATES` | 400 | not `YYYY-MM-DD`, or the end before the start |
| `OPERATION_PHASES_REQUIRED` | 400 | a phase list with no phase |
| `OPERATION_PHASE_NAME_INVALID` | 400 | a phase name blank after trimming or over 60 characters |
| `OPERATION_PHASE_NAME_EXISTS` | 409 | two phases with the same name, compared case-insensitively |
| `OPERATION_UNKNOWN_PHASE` | 400 | a phase id that is not one of the operation's, in a phase list, in `asset_phases` or as `:phase_id`; the message names it |
| `OPERATION_SITE_NAME_INVALID` | 400 | a site name blank after trimming or over 60 characters |
| `OPERATION_SITE_NAME_EXISTS` | 409 | two sites with the same name, compared case-insensitively |
| `OPERATION_UNKNOWN_SITE` | 400 | a site id that is not one of the operation's, in the sites list or in `placements`; the message names it |
| `OPERATION_REQUIREMENT_SELF` | 400 | a requirement whose two participants are the same |
| `PARTICIPANT_NOT_FOUND` | 404 | a participant that has not joined this operation, including one named in `supported_participant_id`, `placements` or `requirements` |
| `PARTICIPANT_UNKNOWN_ORGANIZATION` | 400 | the key names no organization |
| `PARTICIPANT_UNKNOWN_WAVEFORM` | 400 | an abbrev the waveform library does not declare; the message names each one |
| `PARTICIPANT_UNKNOWN_ASSET` | 400 | an `asset_phases` key that is not one of the row's own platform, equipment or transport ids |
| `PARTICIPANT_IDENTITY_REQUIRED` | 400 | a create names neither `organization_key` nor an `adhoc` with a name |
| `PARTICIPANT_ADHOC_NAME_EXISTS` | 409 | that ad hoc name is already on this operation, compared case-insensitively |
| `PARTICIPANT_INVALID_BRANCH` | 400 | an ad hoc branch that is not one of the seven |
| `PARTICIPANT_STALE` | 409 | `expected_updated_at` does not match the stored row, the row is gone, or a second first-save of one library organization lost the race |
| `RFI_NOT_FOUND` | 404 | the `rfi_id` is not an RFI of this operation |
| `RFI_QUESTION_INVALID` | 400 | a question blank after trimming or over 2000 characters |
| `RFI_COMMENT_INVALID` | 400 | a comment body blank after trimming or over 2000 characters |
| `RFI_RESOLVED` | 409 | a comment or a second resolve on an RFI that is already resolved |
| `RFI_NOT_POSTER` | 403 | a resolve by anyone but the user who posted the RFI |
| `OPERATION_INTERNAL_ERROR` | 500 | anything else |

## Frontend data layer

- `types/operation.ts` - `OPERATION_STATUSES` (mirrors `ValidStatuses`) and `OPERATION_STATUS_LABELS`, kept for the API shape though nothing displays them; `Operation` (with `open_rfi_count`), `Participant` (with `asset_phases`), `ParticipantOrganization` (with `adhoc`), `AdhocOrganization`, `Phase` (with `supported_participant_id`, `placements`, `requirements`), `PhaseRequirement`, `Site`, `RFI` (with `comments` and `created_by_id`), `RFIComment`, `RFI_STATUSES`, and the create, update, save, phases, sites, plan and RFI request shapes.
- `services/operation-service.ts` - `useOperations`, `useOperation(id)` (the detail key, enabled only with an id), `useCreateOperation`, `useUpdateOperation`, `useDeleteOperation`, the keyed `useSaveParticipant` and `useDeleteParticipant`, the id-keyed `useCreateParticipant`, `useUpdateParticipantById` and `useDeleteParticipantById` (the last is what Remove calls), `useSaveOperationPhases`, `useSaveOperationSites` and `useSavePhasePlan`, and for the RFI board `useOperationRfis(id, enabled)`, `useCreateRfi`, `useAddRfiComment` and `useResolveRfi`. Every mutation invalidates `queryKeys.operations.all`. `queryKeys.operations` has `list()`, `detail(id)` and `rfis(id)`.
- **Sidebar:** the Operations group, `useSidebarToggle('operations', true)` so it is open on first load, ungated (every role reads operations and the pages hide their own write controls), outside the `canSeeTrackers` block so every role sees it beside Equipment Catalog and PACE Planning. An `allItem` "All Operations" then one `navItem` per operation from `useOperations`, in a `pl: '54px'` box, the row active when the path is `/operations/<that id>`. **`useOperations` is a `@/services` hook the sidebar calls**, so every test that mocks that module with a closed object and renders `MainLayout` must mock it; `checkServiceMocks` in `scripts/verify.mjs` is the authority.
- **Header:** an Operations entry in the page picker, and Add Operation last in the `+` menu (`group: 'operation'`, `canWritePace`, `/operations?drawer=add`), below every library row, with a divider drawn wherever the visible rows change group.
- **Help:** the `operations` group in `help/help-content.ts`, fourteen topics (`post-rfi` and `answer-rfi` are the RFI board's), see `help.md`. `/operations/:id`, `/operations/:id/print` and `/operations/:id/matrix/print` carry `not-navigable` entries in `ROUTE_EXCEPTIONS`, covered by `join-operation`, `print-operation` and `print-operation-matrix`. "Add Operation", "Edit", "Participants", "Join Operation", "Join", "Other", "Add to library", the three view chips "Loadout", "Matrix" and "Web", "Remove", and the RFI board's "RFIs", "Post RFI", "Reply" and "Resolve" are in `BUTTON_STEPS` in `help-dialog.tsx`, so every view and print topic draws its view step as the chip it names.
- **Near real time:** `useOperation` refetches every 10 s while the tab is visible.
The wizard and the plan panel key their draft on the row's id, so a refetch does not reset an edit.
The wizard sends the `updated_at` it read at open as `expected_updated_at`.
The plan write has no lock, so on that path the last save wins.
- **Writes are PACE's writer set** (`admin, editor, rto, planner`, `canWritePace`), for operations, participants and organizations alike: joint planning data, gated as platforms and transports are.

## The picker and the drawer

- `pages/operations-page.tsx` - `/operations`: `PageBanner` with `PageTitle` and a `PageSubtitle` ("Each operation keeps its own participants, phases and sites. Pick one to open it."), an Add Operation button under `canWritePace`, then `operation-picker.tsx`: one `PickerTile` per operation (the tile `SquadronTile` is built from, from `components/pace/SectionPicker.tsx`), titled by `operationTitle` (`operation-title.ts`: the acronym itself such as "OMS", else the full name) with the full name beneath when an acronym exists. No dates and no status are drawn. It takes `hrefFor` so the tile does not know the route.
- The drawer is URL state: `?drawer=add`, or `?drawer=edit&id=<id>`, and it opens only once its operation has resolved, so an edit link to an id that does not exist shows the picker rather than an empty form. A viewer never gets it, whatever the URL says, which is the evidence line `REFUSALS` in `help-content.test.ts` holds for `/operations?drawer=add`.
- `pages/operation-drawer.tsx` - **the Edit drawer**: Name (120), Acronym (max 20, rendered uppercase, sent uppercase), Notes (4000, with a counter), then the **Phases list editor** (a rename field per phase, move up and down, remove, add; removing a phase says how many asset marks go with it) and the **Locations list editor** (the same shape; zero is allowed, removing a location says how many placements go with it). On Edit there is a Delete with a confirm dialog that says the participants go with it. **No status control and no date inputs.** Saving the record, the phases and the locations are separate calls from one Save. `onDeleted` is separate from `onSaved` because the operation page hosts this drawer too and has nothing left to show once its operation is gone.

## The operation page

`pages/operation-page.tsx` - `/operations/:id`.
A missing id or the server's 404 both land on `NotFoundPage`, as the PACE section route does for an unknown squadron.
Below the banner is the Comms Library's canvas (full-bleed graphite, `mx: -CONTENT_GUTTER`, capped at 1280 except on Web, which is a drawing that gets more from more width) holding one of the three views.
With the sidebar closed the canvas is wider than that cap, and the capped box sits centred rather than hugging the left edge (an earlier release).
With the sidebar open nothing changes, and the Web view was never capped, so it is untouched.

### Banner

`PageBanner sticky`, three regions:

| Region | Contents |
|---|---|
| left | a back arrow (`ArrowBackIcon` alone in `BANNER_ICON_BTN_SX`, white, accessible name and tooltip **Operations**; the only backward step from an operation is the picker, so the label was spending title width on a repeat of the arrow), **Participants (n)** (`GroupsIcon`, white, opens the popup, for every role) and **RFIs** (`LiveHelpOutlined`, white, opens the RFI popup for every role; reads **RFIs (n)** only while `open_rfi_count` is above zero) |
| centre | the view chips **Loadout** and the title and **Matrix**, **Web**: Loadout left of the full-name `PageTitle noWrap`, Matrix and Web right of it. They are `chipToggleSty(active, true)`, the shape `TheaterSwitch` uses, so a switch in a page's top strip is one height. Left and right regions share `flex: 1`, which keeps the group optically centred |
| right | **Edit** (amber, `canWritePace`), and on the Matrix and Web views the standard share control then **Print / Save PDF**, with Edit riding inside `DocumentActions` as its child |

**Join Operation is not in the banner** (moved 2026-10-12, see the history below): it is the Participants popup's action and the empty Loadout view's prompt, and the bar needs its width at 1280 for share and Print / Save PDF.
The right region keeps its own `flex: 1` even when empty, so the title stays centred for a viewer.

URL state on `/operations/:id`:

| Param | Meaning |
|---|---|
| `?view=` | `matrix` or `web`; absent means Loadout. An unknown value, and the retired `?view=units`, `?view=links` and `?view=cards`, read as Loadout |
| `?unit=<participant id>` | the open Loadout tab; absent or unknown reads as the first. The Participants popup writes it |
| `?phase=<phase id>` | the phase on Matrix and Web. On Matrix absent or unknown reads as All phases; on Web it reads as the first phase |
| `?expand=brown,gold` | Matrix: the organizations opened into one column per asset. A key no column has is ignored |
| `?focus=<participant id>` | Web: the unit Focus is on; a change of phase leaves it alone |
| `?dialog=participants` | the Participants popup |
| `?dialog=rfis` | the RFI popup |
| `?dialog=join` | the wizard; `&pid=<participant id>` is edit mode on that row, opening at step 2 (Platform). A `pid` naming no row falls back to create mode |
| `?drawer=edit` | the Edit drawer |

The wizard and drawer never open for a reader whatever the URL says (`canWritePace &&` on both); the popup opens for every role.
A delete sets a `deleted` ref before navigating to `/operations` with `replace`, because the drawer's own close writes this route's query string and would otherwise navigate straight back to a page for an operation that no longer exists.

### Participants popup

`components/operations/participants-dialog.tsx`.
One row per participant: colour pip, label, branch chip (a library row), then a line of what it brought (`1 platform · 2 items · 5 waveforms`, the waveform count being `effectiveWaveforms`: what the platforms and picked radios carry plus any stored direct picks), with the POC on its own line (`POC: Capt Lee`) when there is one.
- **A row opens that unit's Loadout tab:** the popup closes and the page writes `?unit=` and drops `?view=`.
- **A writer gets Remove (an X) and Edit per row, and Join Operation at the foot.** Remove asks "Are you sure you want to remove X from operation Y?" and then deletes the row by id (`useDeleteParticipantById`); its asset marks, placements and requirements cascade, and the dialog says so. Remove on an Other unit also offers "Add to library and remove", which creates the organization from the row's details with a key derived from its name (`organization-key.ts`), then removes the row; a key that exists is reported and nothing is removed. Edit opens the wizard in edit mode.
- A reader gets the list and Close.

### RFI popup

`components/operations/rfi-dialog.tsx`, opened by `?dialog=rfis`, for every role.
It reads `useOperationRfis(operation.id, open)`, which refetches every 10 s while it is open, so a reply lands in front of everyone looking at the thread.
- **Open RFIs**, newest first, one card each: the posting unit's colour pip and label ("Unit removed" when the participant is gone), the poster and the time, the question, then the replies (name, time, body, oldest first).
- **A writer gets Post RFI** (in the action row), which opens an inline composer at the top: an **Asking as** select over the roster, the question (2000, with a counter), Post and Cancel; and a one-line reply field with **Reply** under every open RFI.
- **Only the poster gets Resolve**, shown when `rfi.created_by_id` equals the signed-in user's id; the server checks the same thing.
- **Resolved (n)** is a collapsed section at the bottom (`Collapse`, not Accordion, for the reason `csv-dialog.tsx` gives), omitted when there are none, each card read-only with who resolved it and when.
- A reader gets the threads and Close.

### Loadout view (the default)

`components/operations/participant-board.tsx` (`ParticipantBoard`; the file keeps its older name).
Nets-style scrollable folder tabs (the shared `folderTabsSx`), one per unit (`?unit=`), and under the open tab a panel with **the same four parts in the same order for every unit**, so flipping between tabs never moves a heading:

1. **Header:** the colour pip, label, name, branch chip, and Edit for a writer.
2. **Gear:** Platforms, Equipment and Transports, each row in the catalog card's title shape (a PLATFORM, SATCOM or Radio badge, the name in the display font, the nickname in amber quotes) with what it carries as small chips beneath, and under any asset that is not in every phase the phases it is in (`phaseCaption`: "Phase II-III"). There is no "Brings" heading. A record the library no longer has is struck through by id. An empty subsection says None rather than closing up.
3. **By phase:** a table with columns Phase, Location, Tier select, Must talk. One row per phase: the unit's location, the amber TIER SELECT chip when the phase supports it, and one line per requirement that names this unit with its status glyph and colour: "TF RED - SINCGARS +1" when they share means (the first, and how many more), "CAS via TF WHITE" through a relay, "JOC - no link", and "JOC - not in this phase" when the other unit has nothing in it. A phase the unit has nothing in reads "Not in this phase" across the row.
4. **POC:** the contact fields, or None.

It reads the same interop model as Matrix and Web, once per phase, so the three agree on who is in a phase and what they can say to each other.
A writer with nobody yet gets a Join Operation prompt; a reader gets a line saying no one has joined.
A stored direct waveform or service pick from an older row is drawn nowhere here.

### Matrix view (`?view=matrix`)

`operation-matrix-view.tsx`, `interop-matrix.tsx`, `interop-model.ts`.
The capability-by-unit grid, whose job is "what could everyone talk on":
- **Rows** are waveforms (library order), SATCOM services and transports, in sections (`sheet-parts.ts` holds the section captions).
- **One column per unit**, headed by pip, label and branch chip, with a switch that opens the unit into one column per asset (`?expand=`).
- **Each cell names the assets that give the unit the row**, as chips outlined in the unit's colour; a platform that carries a waveform only through a radio names the radio in the chip's title ("Black Hawk via AN/PRC-152"). On screen a collapsed cell shows the first asset and a "+N" chip for the rest (the Loadout's "SINCGARS +1" idiom), with the rest in its tooltip and a click on it opening the unit into its per-asset columns, so every row stays one line; the print sheet and the deck list every asset (10-19).
- **The phase switch** (`PhaseSwitch`, `?phase=`) has All phases then one chip per phase, and narrows the grid to what is present in that phase. Absent things are not drawn: a unit with nothing in the phase is not a column and a row nobody provides is not a row.
- No heading, no Shared column and no Requirements row; no legend either (a chip's title says what it is). The grid sits in the catalog compatibility page's paper box. What each unit **must** reach is the Web view's job, not drawn here.
- Loads every catalog record, not only radios, because a SATCOM terminal supplies services and a platform carries terminals as well as radios (`use-interop-input.ts`, the five libraries Matrix and Web both read).
- "No one has joined yet." with no participants; "Loading..." while the libraries are in flight; a line if one fails.

`buildInterop` (`interop-model.ts`) is the model.
It keeps the **source** of every cell (which platform, which radio, which transport) and the phase rule (`isPresent`: an asset with no key in `asset_phases` is in every phase; no phase means "in any phase at all"), which is why it replaced `buildMatrix` for this page.
Three kinds of asset are a source: a platform (its own waveforms and those of the radios it carries), a catalog equipment record, and a transport (which supplies itself).

### Web view (`?view=web`)

`operation-web-view.tsx`, `phase-picture.tsx`, `phase-picture-model.ts`, `phase-layout.ts`, `phase-show.ts`, `phase-plan-panel.tsx`.
The phase picture for **one phase at a time** (no All phases; `?phase=` absent reads as the first):
- **Location boxes** hold the unit cards sitting there; a unit with no placement is under "No location".
- **One line per requirement**, coloured by status only (green solid, amber dashed, red solid), with a label pill clear of everything, a numbered badge as the fallback matched in the requirement list below the picture.
- **The Tier select card** has an amber border and a TIER SELECT tag. A legend (Direct, Relay - through the named unit, No link) explains the lines.
- **Show: All | Gaps | Focus**, opening on All every time (since 2026-10-14; it used to reopen on the viewer's last choice, so a unit clicked earlier brought the view back in Focus). Each choice is still written to `shf-operation-show`, only so the print and deck exports draw what the screen shows. All and Gaps use the ELK flow layout (`elkjs`, lazily loaded in a chunk only this view loads, and only when All or Gaps is drawn; a chunk load that fails is not kept, so the next layout asks for it again, and the picture says why it could not be laid out and to reload, since 2026-10-27, when a stale dev tab's "could not lay out" was chased as a data fault); Gaps keeps All's positions and draws only relay and no-link lines, with a count. Focus (`?focus=`) puts one unit in the centre with its partners around it, in a deterministic layout of its own (`layoutFocus`, which does not need ELK); with no `?focus=` it is the supported or busiest unit of the phase. Lines run under cards.
- **Zoom** beside Show: the picture fits the canvas by default (never scaled up), and a Zoom group (Fit, minus, percentage, plus, steps of 1.25 between 25% and 300%) lets the viewer go larger, the frame then scrolling inside itself. The print route and the exports are untouched (10-19).
- **"View plan / Hide plan"** is a chip at the right end of the phase row (`aria-expanded`, remembered per viewer). For writers the plan panel sits beside the picture and edits that phase's **Tier select**, each present unit's **location**, and the **must-talk pairs**, with one Save and a Reset. The picture shows the unsaved edit, and switching phase with an unsaved plan asks first. Only units present in the phase can be picked, supported, placed or paired.
- A reader sees the picture alone across the whole width.

Automatic layout only: units are not dragged on the screen, and line colours are status only.

### The Join Operation wizard

`components/operations/join-operation-dialog.tsx`, opened by `?dialog=join`.
**Eight steps:**

| Step | Content |
|---|---|
| 1 Organization | the gate, and enough to join ("Join now, add equipment later"). Three ways to name one: pick a library organization (one already on the operation reads "already joined"), **Other** (name, short label, branch, colour; ad hoc, stored on this operation's row only), or **Add to library**, the organization form (`organization-fields.tsx`, the only place in the UI that creates an organization) which calls the Organization Library's create and then selects the new global organization |
| 2 Platform | every airframe, UAV, vessel, vehicle or ground station from the Platform Library, grouped by type in `PLATFORM_TYPES` order with empty groups omitted, 360px columns, with **Dismounted / no platform** spanning the top. Branch and Type filter rows over the values the library has, local state only |
| 3 Equipment | the embedded catalog picker (`catalog-picker.tsx`: SATCOM and Radios) |
| 4 Gear & phases | the "Bringing (n)" caption, then each picked platform (amber left bar) and equipment record (graphite left bar) as its own panel with what it carries (read-only waveform chips) and **per-asset phase chips** (an asset is in every phase until a chip is switched off). No transport list here (10-24) |
| 5 Transports | **Direct picks are transports only.** The transport strip with an open search field (`PickerSearch`) and the library listed alphabetically in a 260px scrolling box, matching name, kind, provider, owner and country word by word, an "n picked of m" caption beside a plain "Transports" label; then the transport phase panel (`role="list"` named "Transport phases") for picked transports. The strip collapses only where `collapsible` is left on; this step passes `collapsible={false}` (10-24) |
| 6 Comms links | per phase: a **Location** select (with "+ Add location..." and an Add location button that adds to the operation's list at once, `wizard-phases-step.tsx`) and **Must talk to** chips with live status: the status is an SVG icon (check, replay arrow, X, dot) in a fixed-width slot beside each chip, with the means, relay unit or no link in a tooltip on the chip and in the accessible name, so pressing a chip never moves its neighbours (10-16). A phase the unit has no gear in reads "Not in this phase" |
| 7 Contact | the POC fields and notes |
| 8 Review | the summary, with Edit links back to a step |

- **Frame:** fixed top and fixed 1200px width, only the bottom edge grows, and past the viewport the content scrolls inside the paper with the title, step strip and action row staying put. The title is one centred line, "Joining {operation name}" or "Editing {organization} - {operation name}", and no step has a heading or caption of its own, with one exception: step 4 (Gear) opens with step 3's "Bringing (n)" label and the line "Picked in steps 2 and 3. Select the relevant phases for each piece of equipment.", so the panels read as the picks just made (maintainer, 10-24). The action row is Back on the left and Cancel, Continue and the primary on the right; Back and Continue carry an arrow and name their destination ("Back to step 2", "Continue to step 5"), and Cancel, the X and Escape ask "Discard changes?" when anything is unsaved (10-16).
The title, the step strip and the content sit one 16px beat apart; the strip has no bottom padding of its own.
- **Step strip:** numbered tiles with a `›` between each pair, no band behind them. Tiles fill amber up to the current one, the current one carries an outer paper ring, the ones ahead are amber outlines. Steps past the first are disabled until step 1 is satisfied.
- **Save:** create mode POSTs by id with `organization_key` or `adhoc`; edit mode makes step 1 read-only and PATCHes by id with the `updated_at` it last read, staying open on `PARTICIPANT_STALE`. After the row saves, each phase whose choice changed gets its merged plan saved (`mergedPlan`); a failure there says "Saved the unit, but {phase}'s plan did not save".
- Choosing a library row clears Other and typing in Other clears the row. The `max=` limits are mirrored as `maxLength`.
- The wizard sends `waveform_abbrevs: []` and `service_abbrevs: []` on create and edit; the API fields stay, and because the id-keyed PATCH replaces every list, a row saved before then loses its stored direct picks on its next edit. `effectiveWaveforms` still unions whatever an older row holds, so the roster count and the wizard review stay right until then. The review keeps a Waveforms line (the derived summary) and a Transports line and has no Services line.
- The wizard edits one unit's slice of every phase plan; the plan panel edits a whole phase. Same stored plan, merged on save.
- Supporting files: `use-phase-rows.ts` (one phase as step 6 and the review show it; the draft unit goes by the id `DRAFT_UNIT_ID` until the server gives a new join its own), `wizard-phase-plan.ts` (pure), `wizard-phases-step.tsx` (`PhasesStep`, `PhasesReview`).

## The status model

"Status" is two different words in this domain and they must not be confused.
- **Operation `status`** (`planning`, `active`, `complete`) is **not shown or set anywhere in the frontend.** Operations are fluid. The column and its CHECK stay, the server still defaults a blank one to `planning`, and the API still accepts and returns it. Showing it again is a UI decision, not a schema one.
- **A requirement's status** (direct, relay, no link, and absent when a unit is not in the phase) is computed on the frontend by `pairStatus`, never stored. See "How a requirement's status is decided" above, which also holds the relay assumption.

## Exports and print

Three outputs from the share control, the same items in the same order on both views (`operation-share-actions.tsx`, `view="web"` or `view="matrix"` is the only thing that changes what they do):

| | Web view | Matrix view |
|---|---|---|
| `.png` and Copy image | the phase on screen | the grid on screen, with any unit you opened |
| `.pptx` | **one native slide per phase**, in the Show mode on screen | **only the scope on screen** (All phases or that phase), as a native, editable PowerPoint table |
| Print / Save PDF | `/operations/:id/print` | `/operations/:id/matrix/print` |

**The Web deck is native PowerPoint** (`phase-deck-native.ts`, `phase-native.ts`, `pptx-connector.ts`): text in the app fonts embedded as EOT (`OPERATION_DECK_FONTS`: Oswald and IBM Plex Mono); locations as rectangles and unit cards as groups of shapes; requirement lines as **connectors glued to the cards** (`stCxn` and `endCxn`), so dragging a card in PowerPoint drags its lines; the label pills stay put when a card moves, and a line with more bends than an elbow connector has is redrawn by PowerPoint between its two cards the first time either moves. It reads the same layout the screen does (`layoutPhase`, `layoutFocus`), through `phase-picture-model.ts`, so a gap on screen cannot be a direct line in the file. The deck uses the saved plan, never the plan panel's unsaved edit. Mode and focused unit are read when the item is chosen, never when the menu renders.
**The Matrix deck** (`matrix-native.ts`, `matrix-pages.ts`): a title and the grid as a real table (section rows merged, header cells with the unit's colour as a rule, a cell naming its assets one to a line, a dash for nobody). It is the collapsed grid, and one too wide or tall for a slide at a readable size is cut into "(k of n)" continuation slides, each with the label column and header again, so nothing is under 9pt.
**Print routes:**
- `/operations/:id/print` (`operation-print-page.tsx`): landscape, **one page per phase**, each the sheet the deck's slide is (title, key, the picture in the Show mode, the list of what that mode shows; `phase-deck-sheet.tsx` `PhaseSheet`). The screen's `?show=`, `?focus=` and `?phase=` ride in the query string (`operation-print-params.ts`) because the route has no way to read the viewer's choices. A phase taller or wider than the paper is scaled to fit, never cut. Centred phase chips in the toolbar choose what prints: All phases is every page, a phase is just its page (`?only=`). The toolbar also has a Preview zoom (minus, percentage, plus, 100%) that scales the on-screen sheets only through the CSS `zoom` property, undone under `@media print`, so the paper always gets the sheet's own fit scale (10-22).
- `/operations/:id/matrix/print` (`operation-matrix-print-page.tsx`): opens on the phase that was on screen (`?phase=`, none meaning All phases); the chips switch **one scope at a time**, as the Matrix's own switch does (maintainer, 2026-10-13: export the one you want, not every phase), written as `?only=` with `all` for All phases. Paginated by `matrix-print-paging.ts`, the header repeated on every page and a page that begins part way down a section saying which section it is in (`interop-matrix-sheet.tsx` `MatrixSheet`).
- Both inject their `@page` rule through a `<style>` in `document.head`, never an emotion `sx` (see AGENTS.md).

**Shared machinery** in `components/common/sheet-export/`, all additive (the existing exports are byte-identical, pinned by SHA-256 tests):
- `pptx.ts` gained native shapes, groups, connectors, tables and a multi-slide deck builder (`buildPptxDeck`).
- `pptx-connector.ts` is the DrawingML connector geometry; `pptx-package-checks.ts` parses every part of a package and is used by tests only.
- `sheet-export.ts` gained `downloadNativeDeck`, `operationStem` and `operationMatrixStem`; `sheet-specs.ts` gained `operationExportSpec` and `operationMatrixExportSpec`; `slide-geometry.ts` gained `WIDE_SLIDE`; `sheet-fonts.ts` gained `OPERATION_DECK_FONTS`.
- `PrintPageShell` gained an optional centred `toolbar` between Back and the document actions (screen only, outside the root, so it never prints). `DocumentActions` gained an optional `deck` (for a page whose `.pptx` is several slides) and an optional `onPrint` (omit it and Print / Save PDF is not drawn). `PhaseSwitch` gained `allPhases` and `flush`.
- **Not verifiable locally:** there is no PowerPoint or LibreOffice on the Mac, and Keynote and Quick Look substitute fonts and draw elbow connectors straight. See AGENTS.md, "The slide export".

## File map

### Pages (`frontend/src/pages/`)

| File | What it is |
|---|---|
| `operations-page.tsx` | `/operations`, the picker page |
| `operation-page.tsx` | `/operations/:id`: banner, view switch, popups, drawer |
| `operation-drawer.tsx` | the Edit drawer: name, acronym, notes, Phases list, Locations list, delete |
| `operation-print-page.tsx` | `/operations/:id/print`, the Web view's print route |
| `operation-matrix-print-page.tsx` | `/operations/:id/matrix/print`, the Matrix view's print route |

### Components (`frontend/src/components/operations/`)

| File | What it is |
|---|---|
| `operation-picker.tsx` | one `PickerTile` per operation |
| `operation-title.ts` | `operationTitle` (acronym or name) and `operationDisplayName`, pure |
| `participant-board.tsx` | the Loadout view: tabs and the four-part unit panel (name predates the Loadout rename) |
| `participants-dialog.tsx` | the roster popup, with Remove and Edit |
| `rfi-dialog.tsx` | the RFI popup: composer, open threads, Reply, Resolve and the collapsed Resolved section |
| `participant-label.ts` | the short label when there is one, else the full name |
| `participant-waveforms.ts` | pure: `effectiveWaveforms`, `platformWaveforms`, `equipmentWaveforms`, `equipmentServices` |
| `join-operation-dialog.tsx` | the eight-step wizard |
| `catalog-picker.tsx` | the Equipment Catalog browse body embedded in the wizard, all state local |
| `pick-strips.tsx`, `pick-strip-styles.ts` | the transport strip (the only pick strip left) and the chip styles |
| `organization-fields.tsx` | the organization form the wizard's Add to library draws |
| `wizard-phases-step.tsx` | wizard step 6, `PhasesStep` and `PhasesReview` |
| `wizard-phase-plan.ts` | pure: one unit's slice of a phase plan and the merge on save |
| `use-phase-rows.ts` | one phase as step 6 and the review show it, with `DRAFT_UNIT_ID` |
| `operation-matrix-view.tsx` | the Matrix view, and `InteropFrame` (the paper box and the phase switch) |
| `interop-matrix.tsx` | the grid itself: unit heads, section bands, asset chips |
| `interop-model.ts` | `buildInterop`, the source-keeping model, and `isPresent` |
| `interop-matrix-sheet.tsx` | one printed page of the Matrix |
| `interop-fixtures.ts` | test fixtures for the interop model |
| `use-interop-input.ts` | the five libraries Matrix and Web both read |
| `use-phase-param.ts` | `usePhaseParam` (`?phase=`) and `useExpandParam` (`?expand=`) |
| `phase-switch.tsx` | the All phases and per-phase chips; draws nothing with one phase or none |
| `phase-marks.ts` | pure: "Phase II-III" captions, Roman numerals, `nextPhaseName` |
| `phase-plan-model.ts` | pure: `pairStatus`, `phaseRequirements`, the status colours and glyphs |
| `phase-plan-draft.ts` | pure: the plan panel's working copy and its request |
| `phase-plan-panel.tsx` | the writers' planning column beside the Web picture |
| `operation-web-view.tsx` | the Web view page body |
| `phase-picture.tsx` | the Web picture, an SVG at the container's real width |
| `phase-picture-model.ts` | pure: what each Show mode draws and how a line reads; shared by the screen and the deck |
| `phase-layout.ts` | ELK compound-graph layout (All and Gaps) and `layoutFocus` |
| `phase-show.ts` | the Show mode and the focused unit |
| `phase-deck-plan.ts` | pure: one slide per phase, in phase order |
| `phase-deck-sheet.tsx` | `PhaseSheet`, a phase as paper: the print route's page |
| `phase-deck-native.ts`, `phase-native.ts` | the native deck: spec and the geometry of one slide |
| `phase-deck-fixtures.ts` | test fixtures for the decks |
| `matrix-pages.ts` | pure: what each Matrix slide and printed page holds, with column and row cutting |
| `matrix-native.ts` | the Matrix as native table slides |
| `matrix-print-paging.ts` | the printed Matrix's page measures |
| `sheet-parts.ts` | section captions and the title style the sheets share |
| `operation-share-actions.tsx` | the share control and Print / Save PDF for both views |
| `operation-print-params.ts` | `?show=&focus=&phase=` for the Web print route and the Matrix print route's href |

Each has a test file beside it.
`components/common/crosshair-icon.tsx` is the Operations glyph, a rifle-sight reticle drawn in-repo.

## Decisions and history

Recorded so a later session does not redo a rejected design.
Dates are 2026.

- **Steps 4 and 6 renamed (10-24):** "Gear" became "Gear & phases", since the step is where each asset's phases are set, and "Phases" became "Comms links", since that step sets where a unit sits and who it must talk to, phase by phase.
- **Transports have their own step (10-24).** The wizard's step 4 "Waveforms & transports" was split into 4 Gear (now Gear & phases) and 5 Transports, because the waveforms there are read-only (they come from the platforms and radios) and a long equipment list buried the one real pick, the transports.
- **Operations are fluid, so no date range and no status are shown** (09-09). `start_date`, `end_date` and `status` stay in the table, the API and the audit diff; nothing was removed.
- **The acronym names an operation on the picker tile and nowhere else.** The banner title, sidebar rows, roster, wizard and delete confirm use `name`, because a reader who arrived by a link has not seen the tile that pairs the two.
- **What counts as a unit's waveforms.** `effectiveWaveforms` unions each picked platform's own waveforms and those of the radios it lists, then each picked record's waveforms, then any stored direct picks, deduplicated case-insensitively. The roster count and the wizard review read it; the Loadout, Matrix and Web read the per-asset interop model instead.
- **An organization declares its platform before its radios** (09-09). A platform carries its own waveforms and radios, so a unit arriving on a Black Hawk is not "0 waveforms" for want of a radio of its own. A dismounted element skips the platform step. `uav` became its own platform type (050).
- **Interoperability is computed in the frontend, never stored.** Nothing derived is copied into a participant row.
- **Equipment, transport and service ids are not foreign keys**, and waveform abbrevs alone are validated (see "Data model").
- **A participant is an organization, not a person.** One row per (operation, organization) or per ad hoc name; several representatives share it, which is the reason for the optimistic lock.
- **An ad hoc ("Other") organization lives on the participant row only** (048). A one-off partner does not belong in the enterprise's member list and disappears with the operation or the removal; "Add to library" is the deliberate opposite path and creates a global organization.
- **The pane-based check-in was replaced by the Join Operation wizard** (09-09). It read like a second Platforms tab. An organization alone is enough to join.
- **Direct picks are transports only** (09-09). An organization's waveforms and services are what its platforms and equipment carry.
- **Check out was removed, then Remove returned.** "Check out has never meant remove" (maintainer, 09-09), so the board and roster lost the control and the delete routes sat unused. The Participants popup now has Remove, with a confirmation naming the unit and the operation; the keyed delete route is still unused by the UI.
- **The per-operation matrix page was removed and came back as a view** (09-09). The maintainer did not want the same table drawn twice as a second page, but said removing the comparison "is not the goal". What was removed as pages: the two compatibility routes and their router ordering rule, `operation-matrix-params.ts`, the `operationCompat` sheet export spec, the `operation-compatibility` and `print-operation-compatibility` help topics and `check-in-participant`. The catalog's joint matrix is untouched, as are `matrix-panels.tsx`, `matrix-print-preview.tsx`, `MatrixAsset` and `equipmentColumns`.
- **The participant board gave way to Loadout.** The page body had been one card per participant (the Cards view, with a Cards chip); it is now Loadout, with one tab per participant, beside Matrix and Web. `?view=cards` and the retired `?view=units` and `?view=links` land on Loadout. The component file kept the name `participant-board.tsx`.
- **Dead code removed from the branch.** `participantAssets` (`operation-matrix-model.ts`, participants shaped as `MatrixAsset` for `buildMatrix`) went when `buildInterop` replaced it, `EquipmentStrip` and `AbbrevStrip` when direct picks became transports only, and `extraWaveforms` and `extraServices` with the stored direct picks they described; `effectiveWaveforms` stays because an older row may still hold such picks.
- **The old matrix with Shared, Reach and Requirements rows is gone.** The Matrix view says what everyone could talk on and nothing more; what a unit must reach is the Web view's.
- **Rejected for the phase picture, and not features: Links, Hub, Ring, unit-colour lines and a "talks to all" reach.** They answered "everyone to everyone", which is not the model. The picture draws the requirements a phase names, in status colours, with an automatic layout and no dragging.
- **No default to the JOC.** The JOC is an ordinary participant; a phase's requirements say who talks to whom.
- **"Supported" became "Tier select"** in the UI (tag TIER SELECT); the column is still `supported_participant_id`, and a few code comments still say "supported unit".
- **Join Operation left the banner** (10-12). It is the Participants popup's action and the empty Loadout view's prompt, because the bar needs its width at 1280 for share and Print / Save PDF.
- **A toggle in a strip is `chipToggleSty(active, true)`; never a banner button sized to look like one.** Actions use the banner button styles.
- **The banner order groups by colour:** white controls (Back, Participants) left, amber (Edit) right, the view chips and title centred.
- **The Web deck is native PowerPoint, not a picture.** The picture deck was the first version, because an SVG with a per-width layout can only be a picture and native text renders in whatever face the viewer has unless embedded. Native won once the fonts were embedded as EOT and the lines became glued connectors; the picture deck (`phase-deck.tsx`, with `downloadSheetDeck`, `SheetDeckSpec` and `DeckSlideSource` in `sheet-export.ts`) was deleted as dead code once nothing called it. `PhaseSheet` survived, because the print route draws it.
- **The Matrix print and deck export one scope, not every phase** (10-13): export the one you want.
- **Frequency overlap highlighting (blue on blue) is a later idea, not scheduled.**
- **The demo is scripted, not hand-built** (10-15). `scripts/seed-dev-operation.mjs` builds `Exercise Silent Harbor` through the API from `scripts/lib/demo-operation.mjs`, leaving the White organization out for a live join, and `scripts/demo-operation-walkthrough.mjs` replays the whole feature in the installed Chrome with captions and records it. `docs/demo-operation.md` is the walk. The hand-built Night Owl on the dev stack is the scenario it copies, and nothing deletes it.
- **The RFI board (10-30).** Three choices, each with its reason. The posting unit is **picked from the roster** rather than inferred, because the app has no user-to-organization link and the maintainer did not want to design assigning and verifying one yet ("I like the idea of certain users belonging to certain organizations, just not sure if I want to make that a thing yet"). **Only the user who posted can resolve**, not their organization, for the same reason: there is no formal association of people and organizations to lean on, so the poster is the one identity the app does know. **The control sits beside Participants (n)**, not among the view chips, because the chips swap the page body and an RFI control there would read as a fourth view; it is a white, counted, every-role popup, which is what Participants already is. The count is shown only while something is open, so the label is `RFIs` at rest.
- **The "ad hoc" tag was dropped as noise** (10-16). The library distinction is shown only where it has a consequence, on Remove, where the only copy of an Other unit's details is about to be lost.

## What is next

Not built, in the maintainer's words:
- **PACE per requirement:** the primary, alternate, contingency and emergency means for each must-talk pair.
- **Location coordinates and a map view** in place of the abstract location boxes.
- **A distance check** (line-of-sight range) between two placed units.
- **Network reachback via kits:** a unit's link home through a kit's network booleans.

Also open from earlier stages:
- **Stage 3:** CSV for organizations, and `users.organization_key` ownership so a representative is tied to the organization they join for.
- **No pre-fill from a linked section.** An organization's `section_key` is stored (the Add to library form can set it) but displayed nowhere; joining does not yet read that squadron's data.
- **No per-person rows.** The POC fields are the only person on a participant row.

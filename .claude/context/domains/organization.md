# Organization domain

Organization Library - a centrally managed reference table of the **participants an operation can have join it** (the UI says join and remove; the backend and its error messages still say check in): a service component, a squadron, a coalition partner, an agency. It exists to feed one thing, the participant rows on an operation's page (see `operation.md`), and it is reference data: the enterprise's member list, loaded once and rarely changed.

**Organizations are picked only inside Operations.** The maintainer's rule, recorded 2026-10-09: external organizations live in the operations pane and nowhere else. There is no Comms Library chip for them and no Add Organization row in the header's `+` menu; until 2026-10-13 the one place in the UI that listed or created them was the Join Operation wizard's step 1, and it is still the only place one is chosen for an operation. A Comms Library pane and a `+` row both arrived with stage 1 and were removed the same day, before the branch shipped.

**Since 2026-10-13 the library also has a home in Settings.** The maintainer added an Organizations tab to the Settings page, gated on `canWritePace`, which lists every organization with how many operations use it and is where one is added, edited or deleted. It is the library's management screen, not a browse surface: there is still no Comms Library chip and no `+` row, and choosing an organization for an operation still happens only in the wizard. See `settings-page.md`.

## Why not a Section

A section is one of this enterprise's own units: terminals and kits are filed under it, and a PACE squadron has nets and a comms card. An operation's participants are mostly not that - another service's squadron, a partner nation, an agency with no inventory here. Putting them in `sections` would give each one a row in the By Section sidebar, the Terminals and Kits filters and the Settings page, with nothing filed under it. The two tables meet through `section_key`: an organization that *is* one of our squadrons can point at it, which is what a later stage's check-in pre-fill reads.

## Ad hoc organizations are deliberately not in this library

A one-off partner that matters to a single operation does not belong in the enterprise's member list. The Join Operation wizard's **Other** names such a partner on the participant row itself (name, short label, branch, colour; migration 048 on `operation_participants`), and it disappears with that operation or its removal. Nothing in `organizations` is created for it, and `organization_key` is NULL on that row. The wizard's **Add to library** is the opposite, deliberate path: it calls this library's ordinary create (the `OrganizationFields` form and `useCreateOrganization`) and selects the new global organization, so the partner is then reusable on every operation. Choosing between the two is the person joining; see `operation.md`.

## Decisions recorded 2026-10-09

- **The list is prebuilt.** The organizations are the enterprise's members, entered by the maintainer, not created by whoever checks in. Migration 046 seeds nine colour-named placeholders (`green`, `blue`, `white`, `orange`, `red`, `brown`, `gold`, `purple`, `silver`, each with a hex colour and no branch or section) so the library is not empty and stage 1 has something to check in against until the real list lands.
- **`branch` is optional**, one of the seven platform branches or none, and it is the branch chip a unit wears wherever the operation draws it (the Participants popup, the Loadout header, the Matrix column head, the Web unit cards). It does not group anything: the Matrix has one column per unit, in participant order, with no branch grouping and no "No branch" band.
- **The key never changes.** It is what `operation_participants` points at, and there is no rename route.

## Backend

**Migration:** `backend/migrations/046_create_organizations.sql`

| Column | Notes |
|---|---|
| `key` | `VARCHAR(50)` primary key. A lowercase slug, `^[a-z0-9][a-z0-9_]*$`, immutable; `NormaliseKey` in `model.go` trims and lowercases so `Green` and `green` are one key |
| `name` | Unique case-insensitively (`organizations_name_lower_idx` on `lower(name)`) |
| `short_label` | `VARCHAR(20)`, the badge an operation's participant rows show; drawn uppercase, stored as typed |
| `branch` | `VARCHAR(8) NULL`, CHECK against the seven branches. NULL means not a service component; served as `""`, never null |
| `color` | `VARCHAR(20)`, the same width as `sections.color`, blank allowed |
| `section_key` | `VARCHAR(50) NULL REFERENCES sections(key) ON UPDATE CASCADE ON DELETE SET NULL`, and **UNIQUE**: two organizations claiming one squadron would make a pre-fill ambiguous. `SET NULL` because deleting a section must neither be blocked by, nor cascade into, a reference library |
| `notes` | |
| `created_by`, `updated_by`, `created_at`, `updated_at` | the usual |

**Branch is the shared vocabulary, declared once.** Stage 0 moved it out of `platform/model.go` into `backend/internal/shared/branch/` (`Valid`, `Normalise`, `NormaliseOne`, the aliases map), because domains may not import each other and this is the second domain to need it. `platform.Branches` is now an alias of `branch.Valid`. `resolveBranch` in `organization/service.go` calls `branch.NormaliseOne`, so "Air Force" and "marine corps" land on `USAF` and `USMC`; anything else is `ORGANIZATION_INVALID_BRANCH`. `Valid` is a literal rather than computed because `scripts/check-docs.mjs` reads it to hold the glossary to the code.

**The section link is checked in the service, not only by the foreign key.** `checkSection` reads `contracts.SectionLister.GetSectionKeys` and refuses an unknown key with `ORGANIZATION_UNKNOWN_SECTION` (400). It is nil-tolerant, as every injected dependency here is: a `Service` built without the lister - every unit test in the package - accepts any key and leaves the foreign key to refuse it. A second organization claiming a section is `ORGANIZATION_SECTION_TAKEN` (409), mapped from the unique violation in `repository.go` alongside the key and name conflicts.

**Delete is refused while the organization is checked in anywhere.** `DeleteOrganization` asks `contracts.OrganizationUsage.OperationsUsingOrganization` (implemented by `operation.Service`) and answers `ORGANIZATION_IN_USE` naming the operations, in the shape `platform.ErrPlatformUnknownWaveform` set: "in use" with nothing named sends the user hunting. The `ON DELETE RESTRICT` on `operation_participants.organization_key` (047) is the backstop for a service built without that wiring, and the constructor's empty-list message says so.

**Package:** `backend/internal/domain/organization/` - the platform package's shape, `csv.go` included: `model.go`, `errors.go`, `dto/{request,response}.go`, `repository.go`, `repository_mock.go`, `service.go`, `service_test.go`, `handler.go`, `routes.go`, `validation.go`. Routes use PACE's writer set (`admin, editor, rto, planner`), stated as PACE's for the reason `transport/routes.go` gives. The service implements `contracts.OrganizationLookup` (`OrganizationsByKeys`, a map keyed by key; an absent key names no organization) for the operation domain, and consumes `contracts.OrganizationUsage` from it: the second mutually injected pair after `NetLookup`/`NetUsage`. Wiring in `main.go`: `SetSectionLister(sectionService)`, `SetOrganizationUsage(operationService)`, `SetAudit(auditService)`.

**Audit:** resource type `organization`, `resource_id` the slug key rather than a UUID; update diffs name, short label, branch, colour, section key and notes, and an update that changes nothing writes no row and no event. See `audit.md`.

**CSV:** export, import and template, declared once as `csvTable` in `organization/csv.go`. `csv-manifest.json` says `yes` to all three.

- **The key is a column, not an `id`.** It is typed by the person rather than minted by the server, so `key` is settable, required, and the table's `Identity`; there is no `id` column and no `RejectOnImport`. Export puts it first. `operation_count` is computed on read and is not a column.
- **Import creates and never updates.** The key is what operation participants point at and has no rename, so a row whose key already exists (compared case-insensitively, against stored keys and earlier rows of the file) is a row error, `duplicate - key already exists`, and the stored organization is left exactly as it was. There is no upsert. The key cell goes through `NormaliseKey`, so `Army_Aviation` lands as `army_aviation` and `Bad Key` is refused with the key rule.
- **The rules that live outside the parser are checked per row in `ImportOrganizations`**, the way the create route checks them: the name is unique case-insensitively against the library and earlier rows (`duplicate - name already exists`), a `section_key` must name a section (`checkSection`'s list, read once) and must not be linked by a stored organization or an earlier row. A refused row claims nothing, so a later valid row is not reported as a duplicate of it. A failure inside `Create` (a race on a unique index) is reported with the coded message.
- **Branch is closed and rejected per row, naming the value.** It goes through `resolveBranch`, so `Air Force` is stored as `USAF`; blank is a valid row. The `max=` limits of the create DTO (name 120, short label 20, colour 20, section key 50, notes 1000) are enforced in each column's `Set`, because import writes through the repository and the validator never runs.
- **Rows go in one at a time, not in one transaction**, so a file with a bad row still lands the rest, as for platforms. Import writes no audit rows, like every other domain's importer; the `created_by` and `updated_by` columns carry the actor.
- Routes: `GET /api/v1/export/organizations` (auth only), `GET /api/v1/organizations/import/template` (registered on the raw app, ungated), `POST /api/v1/organizations/import` under the same `writer` gate as create, update and delete: `admin, editor, rto, planner`. It is also a dataset of the bundle endpoints (`csvregistry` and `Exporters`). Tests: `csv_test.go` here, and `TestOrganizationImportWritersReachTheHandler` in `middleware/authz_test.go` for the role gate (a viewer is refused before the repository is reached).

## API

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/v1/organizations` | any authenticated | Returns all organizations, `ORDER BY lower(name) COLLATE natural_sort ASC`, each with `operation_count`: the distinct operations that have it checked in, computed on read by a correlated subquery in `selectCols`, ad hoc participants counting for nothing. It is what lets a client disable Delete before `ORGANIZATION_IN_USE`; create and update responses carry it too, 0 on create and the real count on update |
| POST | `/api/v1/organizations` | admin, editor, rto or planner | `key` and `name` required; 400 on a bad key, branch or unknown section, 409 on a taken key, name or section |
| PATCH | `/api/v1/organizations/:key` | admin, editor, rto or planner | Partial update - nil fields ignored. No `key` field in the body: the key is the identity |
| DELETE | `/api/v1/organizations/:key` | admin, editor, rto or planner | Hard delete, audited; 404 when the key does not exist, 409 while any operation has it checked in |
| GET | `/api/v1/export/organizations` | any authenticated | CSV export; `?columns=` picks columns |
| GET | `/api/v1/organizations/import/template` | none | CSV import template |
| POST | `/api/v1/organizations/import` | admin, editor, rto or planner | CSV import, create only, one row per organization; 207 when anything landed, 400 when every row failed |

The role gate is passed before the handler on every write route, because Fiber runs only `Handlers[0]` and a trailing gate would never execute.

**Error codes** (`organization/errors.go`):

| Code | Status | When |
|---|---|---|
| `ORGANIZATION_NOT_FOUND` | 404 | the key is not an organization |
| `ORGANIZATION_KEY_EXISTS` | 409 | the key is taken |
| `ORGANIZATION_NAME_EXISTS` | 409 | the name is taken, compared case-insensitively |
| `ORGANIZATION_INVALID_KEY` | 400 | not a lowercase slug of letters, digits and underscores starting with a letter or digit, or longer than 50 |
| `ORGANIZATION_INVALID_BRANCH` | 400 | not one of the seven branches or blank |
| `ORGANIZATION_UNKNOWN_SECTION` | 400 | `section_key` names no section |
| `ORGANIZATION_SECTION_TAKEN` | 409 | another organization already links that section |
| `ORGANIZATION_IN_USE` | 409 | checked in to an operation; the message names each one |
| `ORGANIZATION_INTERNAL_ERROR` | 500 | anything else |

## Frontend

- `types/organization.ts` (`Organization`, the two request shapes; `branch` is `Branch | ''`, imported from `types/platform.ts`), `services/organization-service.ts` (`useOrganizations` + three mutations, `queryKeys.organizations`). **Every mutation invalidates `queryKeys.operations.all` as well as `queryKeys.organizations.all`**, because a participant row embeds its organization's name, label, branch and colour, so an edit here changes what an operation's page shows.
- **No Comms Library pane and no `+` row.** `LIBRARIES` in `components/catalog/library-keys.ts` names four libraries, `LibraryPane` switches over four, and `LIBRARY_ADD` in `header.tsx` (keyed by `LibraryKey`, so a fifth chip cannot be added without that compiling red) has no organizations entry. Two UIs read `useOrganizations`: the Join Operation wizard's step 1 on `/operations/:id` (see `operation.md`), and the Settings page's Organizations tab (`/settings?tab=organizations`, see `settings-page.md`).
- `Organization.operation_count` is the number of distinct operations with a participant row for that key, served on `GET /api/v1/organizations`; ad hoc participants are not counted. The Settings tab shows it as Used by and disables Delete while it is above zero.
- `components/operations/organization-fields.tsx` - `OrganizationFields`, the organization form the wizard's **Add to library** and the Settings tab's `OrganizationEditDialog` (`components/operations/organization-edit-dialog.tsx`) both draw, with `components/catalog/organization-draft.ts` as its working copy (`OrganizationDraft`, `EMPTY_ORGANIZATION_DRAFT`, `slugOf`). The form was the body of the removed pane and moved here whole.
- **Validation and request bodies are declared once, in `organization-draft.ts`**: `ORGANIZATION_KEY_PATTERN` (mirrors `keyPattern` in `model.go`, so neither surface discovers the rule on Save), `organizationDraftComplete(draft, mode)`, `organizationDraftOf(organization)` for Edit, and `createOrganizationRequestOf` / `updateOrganizationRequestOf`. The PATCH body sends every field, blank included, so clearing a branch, colour or section link on Edit reaches the server. The wizard's own `KEY_PATTERN` and inline request body moved there on 2026-10-13, so the wizard and Settings cannot disagree about what a complete draft is.
- **The key is typed on Add and read-only on Edit.** The server has no rename, and a key box that accepted edits it then refused would read as a save that lost the change; the form's `mode="edit"` draws the key as a dashed value rather than a disabled input, since a greyed box invites a click that does nothing. The Settings tab's pencil passes `edit`; the wizard passes `add`, so the editor cannot drift from the add form in which fields it offers.
- **Branch is one toggle at a time**, the platform pane's branch toggles plus a leading None, since an organization belongs to one branch or to none. **Colour** is the section dialog's `SECTION_COLOR_PALETTE` as swatch buttons, with the stored colour prepended when it is not in the palette (the seeded organizations carry their own hues), and pressing the pressed swatch clears it. **Section link** is a plain select over `useSections`, "Not linked" being a real answer for an outside agency. Notes is a single-line box capped at 1000; the `max=` limits are mirrored as `maxLength` so the form caps as typed rather than 400ing on Save.
- Gated on `canWritePace` by the wizard and by the Settings tab, matching `organization/routes.go`: an organization is a participant of an operation, which PACE's writers plan.
- **CSV is a dataset of the header's share menu and the Settings Import/Export catalogue**, as `organizations` in `components/common/csv/csv-domains.ts` ("Organization Library", `writeGate: 'canWritePace'`, matching the import route), listed after platforms in `CSV_DOMAIN_ORDER`. `csv-labels.ts` carries the copy for `key`, `short_label`, `branch`, `color` and `section_key`, `INVALIDATES` in `services/csv-service.ts` refreshes `queryKeys.organizations` after an import, and `datasetForPath` pre-ticks the dataset on `/settings?tab=organizations`, the one route about it. There is no CSV control on the Organizations tab itself: the header's share button is the control, as on every route. `frontend/src/generated/csv-columns.ts` is regenerated from `csv.go`, never edited.
- Help: `add-organization` in the `operations` group of `help/help-content.ts`, steps Operations, the operation, Participants, Join Operation, Add to library, routed to `/operations` with `roles` but no `gate`, as `join-operation` is; its note names Settings, Organizations as the other place to add one. `edit-organization` follows it, steps Settings, Organizations, Edit organization, Save, routed to `/settings?tab=organizations` with a `canWritePace` gate. See `help.md`.

## What is deliberately not done yet

- **No CSV update path.** Import only adds. Changing an organization from a file would need the key to match a stored row and a decision about which blank cells clear a field; the Settings tab's Edit is the path for a change.
- **No rename.** A key is referenced by participants and would need a cascade the library does not offer; delete and recreate is the path, and a checked-in organization cannot be deleted.
- **No ownership.** `users.organization_key`, tying a user to the organization they check in for, is stage 3.
- **No pre-fill from the linked section.** `section_key` is stored (the Add to library form sets it, and the Settings tab's Edit changes or clears it) but displayed nowhere outside that form; nothing reads it yet.
- **No editing from inside Operations.** Edit and delete live in Settings, Organizations; the wizard's edit mode keeps step 1 read-only, because moving a check-in to another organization is a leave and a join.

# Kit domain

A top-level asset domain **parallel to Terminals**, not a filter over them. Standalone records with full feature parity: list page + status stat-strip, sidebar group, inline edit, add/edit drawer, CSV import + export + template, audit, and role gating (reads open to any authed user; writes = admin/editor).

Fields: `id` (UUID), `name` (case-insensitive unique → 409), `type` (`remote` | `ifk` | `atk`, **required on create**), `status` (the 7 shared asset statuses, same set as Terminals), `black` / `secret` / `topsecret` (BOOLEAN NOT NULL DEFAULT false), `section` (FK → `sections.key` ON UPDATE CASCADE, nullable), `owner` / `owner_email` / `owner_phone` (nullable = "assigned to"), `location` (VARCHAR(200)), `notes` (TEXT), `updated_by`, `created_at`, `updated_at`.

Valid statuses: `available` | `alert` | `alert-blue` | `alert-green` | `on-mission` | `reserved` | `inop`.
The set is shared with Terminals and declared once, in `backend/internal/shared/assetstatus` on the backend and `frontend/src/pages/asset-status-constants.ts` on the frontend.
Do not restate it in this domain.
An earlier issue asked for kit-specific statuses and was closed the other way: kits and terminals carry the same statuses permanently, so a change to the set changes both domains by construction.

Valid types: `remote` | `ifk` | `atk`. Required on create (a kit with no type can't be filed under a sidebar `?type=` filter). Optional on PATCH.

## Networks (three booleans, not a catalog)

`black`, `secret`, `topsecret` (shown as BLACK, SECRET, TS) are three independent boolean columns - deliberately **not** a managed catalog or multi-select chips (an earlier design was reversed). In the table each renders a centered green ✓ (`CheckIcon`) when true, a `-` when false. Inline-editable via a Yes/No `InlineSelectCell`. In the drawer they're a row of plain checkboxes under a "Networks" label. Diffed with `!=` in `diffKit` for audit.

## Table / UI

- **Column order:** name · type · section · status · BLACK · SECRET · TS · assigned-to · notes · updated · (row actions). Network columns are center-aligned. Notes absorbs remaining width with ellipsis + tooltip; everything else is tight-fit.
- **Row order:** `ORDER BY name COLLATE natural_sort, id` - names sort with embedded numbers ordered numerically, so `REMOTE-KIT 2` precedes `REMOTE-KIT 10` instead of the plain-text `1, 10, 11, 2, 9`. The collation comes from migration `038_natural_sort_collation.sql` and is applied only in `ORDER BY`, never as a column collation: search is `name ILIKE ...` in the `WHERE` clause and the uniqueness rule is `UNIQUE btree (LOWER(name))`, both of which take the column's own collation and are deliberately untouched. The `, id` tiebreaker keeps the order total, which plain `LIMIT`/`OFFSET` pagination needs. The export query is separate (`FindForExport`) and carries the same clause, so the CSV matches the screen. The frontend's `compareNatural` in `@/utils` is the client-side twin for the pages that sort in JavaScript.
- **Stat strip:** by status (Total / Available / ALERT / On Mission / Reserved / INOP), identical mechanic to Terminals - counts from the backend `status_counts` map, sticky, click to filter. Status-based (not type-based) because each type has its own `?type=` page.
- **Type filter:** `ToggleButtonGroup` (All / Remote / IFK / ATK), multi-select, hydrated from `?type=` (CSV) via `useEffect`. Server-side - joined as `type=remote,ifk` → `GET /api/v1/kits?type=...`, filtered with `type = ANY($n)`.
- **Type badge** colors: remote cyan `#39d3f0`, ifk magenta `#e879f9`, atk teal `#2dd4bf`. Neither may use a **reserved** color: `#1f6feb` belongs to Total tiles and `#a371f7` to the On Mission status (which is also C SQD's section color) - both render in the same Stats column as the type tiles. Defined in `TYPE_STYLES` (`kits-page.tsx`) and `KIT_TYPE_COLORS` (`stats-page.tsx`); **change both together or the table and the Stats page disagree.**
- **Section filter** via `?sections=` (plural, comma-separated), same as Terminals.
- **Search:** `?search=` substring `ILIKE` across `name`, `owner`, `location`, `notes` (2-char frontend minimum, 400ms debounce).
- **Assigned-to** = full owner (name/email/phone) now. Azure/Entra identity lookup is a deferred follow-up, not built.
- **Drawer** (`KitDrawer`, `mode: 'add' | 'edit'`): name, type (required select), section (+ inline section creation, shared pattern with Terminal drawer), status, Networks checkboxes, owner fields, location, notes. `?drawer=add` / `?drawer=edit&id=<uuid>` / `&focus=notes`. The edit record resolves against the
loaded page first and falls back to `GET /kits/:id` via `useKit(id)`, and the drawer opens only
once it has resolved - an unresolvable id gets a warning alert instead of a blank Add form. See
the "Editing surface" section of `terminal.md` for why that guard exists; kits had the
identical defect and carries the identical fix.
- **Inline edit:** name (text), type/section/status/networks (select), notes (opens drawer focused). Row-hover pencil. Admin+editor only.

## Constraints and behavior

- **Unique name (case-insensitive):** `CREATE UNIQUE INDEX kits_name_unique ON kits (LOWER(name))`. Repo maps `pgErr.Code == "23505"` → `ErrKitNameExists` (409), on both create and import (and on rename in `Update`).
- **Hard delete.** No archive/soft delete. Name immediately reusable.
- **Notes cap 250, location cap 200** (DTO `max` + input `maxLength`).
- **Nullable section:** empty string from client stored as NULL.
- **Pagination:** page-based, default 50/page, `?limit=N`, `limit=0` = all rows.
- **No seed data.** The table ships empty - no seed migration (user explicit).

## Cross-domain section reassignment (the easy-to-miss part)

Kits FK `sections`, so **deleting a section must reassign kits too**, alongside terminals. Wiring:
- `backend/internal/shared/contracts/kit.go` → `KitSectionReassigner { CountKitsInSection, ReassignKitsToSection }`, implemented by `kit.Service`.
- `section.Service` holds BOTH `reassign` (terminals) and `reassignKits` (nil-guarded); `SetKitReassigner` injects it. `DeleteSection` sums both counts for the in-use check and reassigns both. The audit change key is `reassigned_assets` (terminals + kits combined), renamed from the old terminal-only `reassigned_terminals`.
- `main.go`: after `kitService` is built, `sectionService.SetKitReassigner(kitService)`; `kitService.SetAudit(auditService)` in the audit block.

## CSV import / export

- **Template:** `GET /api/v1/kits/import/template` - **no auth**. Registered on the raw app in `routes.go` **before** `kits.Use(auth.RequireAuth())` so the group's prefix-matched auth middleware (which would otherwise gate `/api/v1/kits/*`) doesn't run - the template handler terminates the chain first. Distinct path from Terminals' global `/api/v1/import/template` to avoid collision. Frontend template `href` must match `/api/v1/kits/import/template`.
- **Import:** `POST /api/v1/kits/import` accepts `{ csv }`. Per-row validation: name required, **type required + valid**, section/status valid if present, booleans parsed via `csvtable.SetBool` (`shared/csvtable/value.go`; true/false/yes/no/y/n/t/f/1/0/blank; blank = false; anything else = row error), no duplicate names. Bulk-inserts valid rows via `CopyFrom`; returns per-row errors. Template example rows: `EXAMPLE REMOTE`, `EXAMPLE MINIMAL`.
- **Export:** `GET /api/v1/export/kits` (read-only, any auth). Query params `sections` / `statuses` / `types` / `columns` (all CSV). `type` is accepted as an alias for `types` and merged with it, matching the singular the list endpoint and the sidebar deep-links already use - see the export section of `terminal.md` for why the alias exists. Filters travel as a named `kit.ExportFilter` struct rather than positional slices. `ExportableColumns` canonical order: name, type, status, black, secret, topsecret, section, owner, owner_email, owner_phone, location, notes, updated_by, updated_at, created_at. Booleans render as `true`/`false`. Filename `signal-suite-kits-YYYYMMDD.csv`.

## Routes

`GET /api/v1/kits` (list) · `GET /api/v1/kits/:id` · `POST /api/v1/kits` (writer) · `PATCH /api/v1/kits/:id` (writer) · `DELETE /api/v1/kits/:id` (writer) · `GET /api/v1/kits/import/template` (no auth) · `POST /api/v1/kits/import` (writer) · `GET /api/v1/export/kits`.

## Stats

Moved to `dashboard.md` (the Stats page, its layout primitives and its kit strips).

## Who sees Kits

Terminals, Kits and By Section are offered only to admin and editor, on the `canSeeTrackers` flag (`admin || editor`, `contexts/auth-context.tsx`).
The flag gates the Kits entry in `NAV_ITEMS` (`components/layouts/nav-items.tsx`, so the header page menu and the Dashboard tiles drop it) and the sidebar's Terminals and Kits groups (`components/layouts/sidebar.tsx`).
It is a decluttered view, not a boundary: the reads stay open to every authed user and the route answers by URL.
See `dashboard.md`.

## Files

Backend: `backend/internal/domain/kit/` (clone of `terminal/`, minus model families/kit/pim/serial/pop_pin/tags). Migration `022_create_kits.sql`. Contract `shared/contracts/kit.go`.
Frontend: `pages/kits-page.tsx`, `pages/kit-drawer.tsx`, `pages/kit-constants.ts`, `services/kit-service.ts`. CSV is not a kit-specific dialog: it goes through the shared `components/common/csv/` cluster, where the kits dataset is one entry in `csv-domains.ts`. Registered in `services/index.ts`, `services/query-client.ts` (`queryKeys.kits`), `pages/index.ts`, `types/api.ts` + `types/index.ts`, `routes/router.tsx`, sidebar (static Remote/IFK/ATK links) + header (Kits nav item + actions block).

### What changed with csvtable

The column list, the template header and the importer all read one declaration in `<domain>/csv.go` now, rather than three hand-maintained copies.
Two consequences worth knowing:

- **`id` is exported, first, and refused on import.** A file carrying one came from an export and the user meant to update those rows; import creates, so without the guard every line would come back as a duplicate name - accurate and useless.
- **The frontend does not keep its own column list.** `backend/internal/csvregistry` generates `frontend/src/generated/csv-columns.ts`, and a Go test fails when the committed copy is stale. Regenerate with `go test ./internal/csvregistry -update` in the same commit as any column change.

The template is column-selectable (`?columns=`), and required columns are force-included whatever the caller asks for - a template missing one produces a file that cannot be imported. When that happens it prints a comment line saying so.

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
- **Type badge** colors: remote cyan `#39d3f0`, ifk magenta `#e879f9`, atk teal `#2dd4bf`. Neither may use a **reserved** color: `#1f6feb` belongs to Total tiles and `#a371f7` to the On Mission status (which is also C SQD's section color) - both render in the same dashboard column as the type tiles. Defined in `TYPE_STYLES` (`kits-page.tsx`) and `KIT_TYPE_COLORS` (`dashboard-page.tsx`); **change both together or the table and dashboard disagree.**
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
- **Import:** `POST /api/v1/kits/import` accepts `{ csv }`. Per-row validation: name required, **type required + valid**, section/status valid if present, booleans parsed via `parseBool` (true/false/yes/no/1/0/blank; blank = false; anything else = row error), no duplicate names. Bulk-inserts valid rows via `CopyFrom`; returns per-row errors. Template example rows: `EXAMPLE REMOTE`, `EXAMPLE MINIMAL`.
- **Export:** `GET /api/v1/export/kits` (read-only, any auth). Query params `sections` / `statuses` / `types` / `columns` (all CSV). `type` is accepted as an alias for `types` and merged with it, matching the singular the list endpoint and the sidebar deep-links already use - see the export section of `terminal.md` for why the alias exists. Filters travel as a named `kit.ExportFilter` struct rather than positional slices. `ExportableColumns` canonical order: name, type, status, black, secret, topsecret, section, owner, owner_email, owner_phone, location, notes, updated_by, updated_at, created_at. Booleans render as `true`/`false`. Filename `signal-suite-kits-YYYYMMDD.csv`.

## Routes

`GET /api/v1/kits` (list) · `GET /api/v1/kits/:id` · `POST /api/v1/kits` (writer) · `PATCH /api/v1/kits/:id` (writer) · `DELETE /api/v1/kits/:id` (writer) · `GET /api/v1/kits/import/template` (no auth) · `POST /api/v1/kits/import` (writer) · `GET /api/v1/export/kits`.

## Dashboard

`useKits({ limit: 1000 })` client-side aggregation. Three blocks.

**Layout primitives** (shared with Terminals and Contracts, all in `dashboard-page.tsx`):

- `BlockLabel` - heading that sits **above** its bordered block, never inside. Every heading on the page uses it (13px / 800 / `text.primary`).
- `StatPanel` - the bordered box holding one row of tiles. No rules inside it.
- `StripRow` - grid of `repeat(columns, minmax(0, 1fr))`, `columns` defaulting to `PANEL_COLUMNS` (5). Every row in a domain uses the **same column count**, so a 5-tile status row and a 4-tile type row share column widths and align; the shorter row just leaves trailing columns empty. Do not switch this to one column per tile - that misaligns the rows, which is what it exists to prevent.

Terminals and Kits sit **side by side** (`flex`, `gap: 3`, stacking on mobile) for status and type, matching the by-section row beneath them: terminals left, kits right, same column x.

Tiles whose `sub` is an **array** render it as a list to the right of the count, top-aligned with the label; a string `sub` renders beneath the count. Kit type tiles pass a single-element array for exactly this reason. `Total` tiles carry no subtext.

`SectionRow` reserves `minWidth: '2ch'` with `tabular-nums` on its count so the following hyphen lands at the same x on every row regardless of 1- vs 2-digit totals.

- **Kits by Status** strip - Available / ALERT / On Mission / Reserved / INOP, same colors and subtext as the `/kits` page strip so the two agree. ALERT rolls up `alert` + `alert-blue` + `alert-green`. No Total tile (it heads the type strip, matching Terminals). Tiles link to `/kits?status=<key>` (the page hydrates `?status=` on mount).
- **Kits by Type** strip - Total / Remote / IFK / ATK, structurally identical to Terminals by Type. Subtext on each type is that type's available count. Tiles link to `/kits?type=<value>`.
- **Kits by Section** sits beside "Terminals by Section" in a `flex` row separated by `gap: 3` only - no vertical divider (each panel has its own border and heading). Stacks on mobile.

Dashboard tests scope `getByText` to a strip via `getByText('<heading>').nextElementSibling` - the terminal and kit strips share several bucket subtexts, so unscoped queries collide. Both reuse the generalized `SectionRow` component (now takes `items` / `itemOrder` / `itemLabels` props instead of hard-coded terminal models) - kits pass `remote/ifk/atk`, terminals pass model families.

## Files

Backend: `backend/internal/domain/kit/` (clone of `terminal/`, minus model families/kit/pim/serial/pop_pin/tags). Migration `022_create_kits.sql`. Contract `shared/contracts/kit.go`.
Frontend: `pages/kits-page.tsx`, `pages/kit-drawer.tsx`, `pages/kit-constants.ts`, `services/kit-service.ts`. CSV is not a kit-specific dialog: it goes through the shared `components/common/csv/` cluster, where the kits dataset is one entry in `csv-domains.ts`. Registered in `services/index.ts`, `services/query-client.ts` (`queryKeys.kits`), `pages/index.ts`, `types/api.ts` + `types/index.ts`, `routes/router.tsx`, sidebar (static Remote/IFK/ATK links) + header (Kits nav item + actions block).

### What changed with csvtable

The column list, the template header and the importer all read one declaration in `<domain>/csv.go` now, rather than three hand-maintained copies.
Two consequences worth knowing:

- **`id` is exported, first, and refused on import.** A file carrying one came from an export and the user meant to update those rows; import creates, so without the guard every line would come back as a duplicate name - accurate and useless.
- **The frontend does not keep its own column list.** `backend/internal/csvregistry` generates `frontend/src/generated/csv-columns.ts`, and a Go test fails when the committed copy is stale. Regenerate with `go test ./internal/csvregistry -update` in the same commit as any column change.

The template is column-selectable (`?columns=`), and required columns are force-included whatever the caller asks for - a template missing one produces a file that cannot be imported. When that happens it prints a comment line saying so.

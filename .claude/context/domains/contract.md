# Contract domain

Tracks contracts by POP dates, vendor, POC, execution quarter, and fiscal year. Fields: `id` (UUID), `title`, `company`, `logform_number` (VARCHAR(20), nullable), `logform_url` (VARCHAR(2000), nullable), `poc_name`, `poc_email`, `poc_phone`, `pop_start` (DATE, nullable), `pop_end` (DATE, nullable), `execution_quarter` (Q1|Q2|Q3|Q4, nullable), `fiscal_year` (e.g. FY26), `notes` (≤250 chars), `updated_by`, `created_at`, `updated_at`.

Migration: `014_create_contracts.sql`. Indexes on `fiscal_year` and `pop_end`. Logform columns added in `020_add_contract_logform.sql`.

## Logform # column

`logform_number` and `logform_url` are both optional/nullable. In the contracts table, "Logform #" is the **second column** (after Contract Title, before Start date). Cell rendering:
- If `logform_url` is set: renders as a clickable `<a>` link opening in a new tab, displaying `logform_number` as link text.
- If `logform_number` is set but no URL: renders the number as plain bold text.
- If neither: shows `-` in muted italic.

Both fields are editable in the contract drawer (Logform Number + Logform URL inputs appear after Contract Title). Both are included in `ExportableColumns` and CSV export. The drawer sends empty strings as `null` to the backend via the `nullable()` helper.

## Constraints and behavior

- **Military FY:** Oct 1 – Sep 30. FY26 = Oct 2025 – Sep 2026. `fiscal_year` is a free-text `VARCHAR(4)` (e.g. FY25, FY26); no constraint enforced in DB - caller is responsible.
- **Notes cap: 250 chars.** Enforced in DTO and textarea. Over-limit blocks Save.
- **No cost field.** Deliberate - not currently tracked.
- **Deadline coloring on `pop_end` only:** red ≤30 days (including expired), orange 31–60, yellow 61–90, neutral 90+.
- **Pagination:** page-based, 30/page (configurable via `?limit=`).
- **Search:** `?search=` - title, company, poc_name, notes (ILIKE).
- **FY filter:** `?fy=FY26` - exact match.
- **Sorting:** `?sort_by=pop_end|execution_quarter` + `?sort_dir=asc|desc`. Whitelist-only (`safeOrderBy` in repo - no SQL injection risk). Default: `fiscal_year DESC, pop_end ASC NULLS LAST`.
- **Counts:** `total`, `expiring_30`, `expiring_60`, `expiring_90` returned on every list response via SQL FILTER aggregates - no extra query needed.

## Inline editing

Table supports per-cell inline editing (same pattern as terminals):
- `InlineTextCell` for Title, Company, POC Name, FY
- `InlineSelectCell` for Execution Quarter (Q1–Q4, plus empty/clear)
- POP Start / End: click opens the drawer (date picker inputs live there)
- Notes: click opens drawer with cursor auto-focused at end of existing text (`focusField='notes'`)

`InlineTextCell` has a `maxWidth` prop that truncates display with `…` and shows a tooltip with the full value on hover. Applied: Title 220px, Company 180px, POC 160px.

## API routes

```
GET    /api/v1/contracts                → ListContracts (fy, search, page, limit, sort_by, sort_dir)
GET    /api/v1/contracts/fiscal-years   → ListFiscalYears (distinct FYs desc)
GET    /api/v1/contracts/:id            → GetContract
POST   /api/v1/contracts               → CreateContract  [admin|editor]
PATCH  /api/v1/contracts/:id            → UpdateContract  [admin|editor]
DELETE /api/v1/contracts/:id            → DeleteContract  [admin|editor]
```

`fiscal-years` route must be declared before `/:id` in routes.go to avoid Fiber matching it as an ID.

## Sidebar

Contracts group in the sidebar is collapsible. Sub-items are dynamically loaded from `GET /api/v1/contracts/fiscal-years` via `useContractFiscalYears(enabled)`. The group renders only for `canSeeContracts` (admin and editor - contracts are internal), and the sidebar passes that same flag as `enabled`, so the query does not fire for a role whose Contracts group is not rendered. Clicking a FY navigates to `/contracts?fy=FY26`.

This is navigation shaping, not authorization: the reads stay open to every role, `/contracts` still renders read-only by URL, and the export dataset stays listed for everyone. The header page-menu entry and the Dashboard panel follow the same flag. See `context/authz.md`.

## Dashboard

The dashboard stat strip (Total / Expiring / Caution / Watch) fetches `useContracts({ limit: 1 }, canSeeContracts)` - minimal data pull, counts are always returned regardless of limit. The panel renders only for `canSeeContracts`, and the second argument disables the query for everyone else, so no contracts request leaves a viewer's dashboard. Clicking any tile navigates to `/contracts`.

## CSV export

`GET /api/v1/export/contracts` returns filtered CSV. Read-only (any auth user).

| Query param | Shape | Default |
|---|---|---|
| `fy` | comma-separated fiscal year strings (e.g. `FY25,FY26`) | all |
| `columns` | comma-separated column keys | all, canonical order |

Columns render in `contract.ExportableColumns` canonical order regardless of caller order. Unknown columns return `400 CONTRACT_INVALID_EXPORT_COLUMN`. Filename: `signal-suite-contracts-YYYYMMDD.csv` via `Content-Disposition`. The Export dialog drops the `fy` filter when all fiscal years are selected. It opens from the header's Export button on any route, with Contracts pre-ticked on `/contracts`; the Settings catalogue opens the same dialog locked to this one domain.

### What changed with csvtable

The column list, the template header and the importer all read one declaration in `<domain>/csv.go` now, rather than three hand-maintained copies.
Two consequences worth knowing:

- **`id` is exported, first, and refused on import.** A file carrying one came from an export and the user meant to update those rows; import creates, so without the guard every line would come back as a duplicate name - accurate and useless.
- **The frontend does not keep its own column list.** `backend/internal/csvregistry` generates `frontend/src/generated/csv-columns.ts`, and a Go test fails when the committed copy is stale. Regenerate with `go test ./internal/csvregistry -update` in the same commit as any column change.

The template is column-selectable (`?columns=`), and required columns are force-included whatever the caller asks for - a template missing one produces a file that cannot be imported. When that happens it prints a comment line saying so.

# Terminal domain

Tracks individual terminals. Fields: `id` (UUID), `name`, `model` (nullable), `kit`, `pim`, `serial`, `section` (FK to `sections.key`, nullable), `status`, `owner`, `owner_email`, `owner_phone`, `pop_pin` (Starshield-only PoP pin, nullable), `notes`, `tag` (free-form grouping label, nullable), `updated_by`, `created_at`, `updated_at`.

Valid statuses: `available` | `alert` | `alert-blue` | `alert-green` | `on-mission` | `reserved` | `inop`.
Shared with the Kit domain and owned by `backend/internal/shared/assetstatus`, not by this domain, with `frontend/src/pages/asset-status-constants.ts` as the frontend half.
A change to the set changes both domains.

Valid models - three families:
- **Starshield:** `mini` | `hp`
- **Paradigm:** `hornet` | `ragno`
- **OneWeb:** `ow7` | `ow10` | `ow11` (display labels: OW-7, OW-10, OW-11)

Nullable (unset terminals show `-`). Inline-editable in the table; selectable in the drawer. Included in CSV export and import. Validated via `oneof=mini hp hornet ragno ow7 ow10 ow11` in the DTO; error message: `"model must be one of: mini, hp, hornet, ragno, ow7, ow10, ow11"`.

## PIM # field (Hornet / Ragno)

Terminals have two kit-number columns in the DB:
- **`kit`** - used for Starshield (mini/hp) and OneWeb terminals.
- **`pim`** - `VARCHAR(100) NOT NULL DEFAULT ''`, added in migration 019. Used **only** for Paradigm (hornet/ragno) terminals.

In the drawer form, the field shows "PIM #" when `model === 'hornet' || model === 'ragno'`, and "Kit #" otherwise. In the terminal table the column header is **"Kit / PIM #"**; each row renders `t.pim` for hornet/ragno and `t.kit` for all others. Inline editing saves to the correct column. Both columns are included in `ExportableColumns` and in the CSV import row map.

## PoP pin (Starshield only)

`pop_pin` - `VARCHAR(20)` nullable, added in migration 021. Point of presence a **Starshield (mini/hp)** terminal is pinned to. NULL = not pinned. Slugs: `us-east` | `us-west` | `germany` | `uk` | `australia` (display labels: US-EAST, US-WEST, Germany, United Kingdom, Australia - mapped in `frontend/src/pages/terminal-constants.ts`).

- **Invariant lives in the service:** `CreateTerminal`/`UpdateTerminal` force `PopPin = nil` whenever the model isn't mini/hp - after the pointer applies, before `diffTerminal`, so an inline model change away from Starshield clears a stale pin and the clear is audited. Client-side gating is cosmetic only.
- **Clear convention is `""` not null** - a nil pointer means "field not provided" on PATCH, so the client sends `""` to clear. Validated by the custom `pop_pin` tag (registered in `validation.go`, reuses `ValidPopPins`) which accepts `""` or a valid slug - plain `omitempty,oneof` would reject `""` because a non-nil `*string` pointing to `""` still counts as "has value". `normalizePopPin` turns `""` into NULL (same as tag).
- **Table:** "PoP Pinned to" column between Assigned To and Notes. Visible only when the model filter is empty (All) or includes mini/hp - hidden for exclusively Paradigm/OneWeb filters (`showPopColumn`, header + body gated on the same flag). Mini/HP rows get an `InlineSelectCell` (Not pinned + 5 locations); other rows show static `-`.
- **Drawer:** "Is this terminal's PoP pinned?" checkbox + Collapse location select, between Owner Email/Phone and Notes, rendered only for mini/hp. Checked-but-empty saves as not pinned (doesn't block Save).
- **CSV:** included in `ExportableColumns` (between `owner_phone` and `notes`), export dialog, import template (padded EXAMPLE rows), and import validation - invalid slug or `pop_pin` on a non-mini/hp row is a row error.

## Constraints and behavior

- **Unique name (case-insensitive):** `CREATE UNIQUE INDEX terminals_name_unique ON terminals (LOWER(name))`. Repo maps `pgErr.Code == "23505"` → `ErrTerminalNameExists` (409). Applies to manual create and CSV import.
- **Hard delete:** `DELETE /api/v1/terminals/:id` permanently removes. No archive, no soft delete. Name is immediately reusable. Deliberate design choice - no record-keeping use case identified.
- **Notes cap: 250 chars.** Enforced in DTO (`validate:"omitempty,max=250"`) and textarea (`maxLength={250}`). Over-limit blocks Save.
- **Nullable section:** empty string from client stored as NULL.
- **Pagination:** page-based, default 50/page. Page size is user-configurable (25 / 50 / 100 / All) and synced to the URL via `?limit=N`. `limit=0` returns all matching rows with no LIMIT/OFFSET applied (the backend handles this case in `FindAll`). The page-size options and prev/next live in the table footer (`components/common/list-pagination.tsx`, shared with Kits and Contracts), left-aligned with the row count on the right - under the list, where reaching the end is when the next page is wanted, and out of the toolbar, which wrapped them onto their own line at 1280px with the sidebar open. Prev/next disable at the ends rather than hiding.
- **Search:** backend substring via `?search=` - `ILIKE '%term%'` across `name`, `kit`, `serial`, `owner`, and `notes`. Matches any position in the string (e.g. "sqd" finds every squadron key, "tac" finds "hq"). Frontend enforces a 2-character minimum before firing the query (400ms debounce already in place). No client-side filtering.
- **Variant filter (All / Mini / HP / Hornet / Ragno / OW-7 / OW-10 / OW-11):** multi-select `Set<string>` in local state. Hydrated from `?model=<value>` via `useEffect` on `searchParams` change so sidebar deep-links work when already on the page. Empty set = show all. `ToggleButtonGroup` without `exclusive` - click to add, click again to remove. **Model filtering is server-side** - active models are joined as `model=ow7,ow10` and sent to `GET /api/v1/terminals?model=...`. The backend filters via `model = ANY($n)` and the returned `total` and `total_pages` reflect only the matched rows, so the "Total" stat and pagination are correct for filtered views.
- **Owner fields:** free-text. Entra ID / Graph autocomplete was considered but deferred - needs Graph API access from the backend (token scope `https://graph.microsoft.com/User.Read.All` or similar), an extra MSAL token-acquisition path on the SPA, and a server-side proxy. Do not add autocomplete without that groundwork.
- **Tag:** `VARCHAR(100)` for ad-hoc grouping spanning sections (e.g. an operation name). One tag per terminal, nullable.
Free-form to type, but **not** free-form to store: tags are case-insensitive, and the `tags` catalog holds the one canonical spelling.
`Service.canonicalTag` registers every saved tag in the catalog and writes back whatever casing the catalog already uses, so `Op Alpha` and `op alpha` are one tag rather than two.
Existing casing always wins; a brand-new tag keeps what was typed.
That runs on create, update **and** CSV import - import batches the whole file through `canonicalizeRowTags` in one round trip, and is the path that never called `normalizeTag` at all, since `csvtable` only trims.

  The catalog write is **best-effort**: on failure the typed value is stored and the terminal saves normally.
The terminal row is what the user asked to change, while the catalog is a management list and a filter index, so failing the save to protect it would trade a real loss for a cosmetic one.
Same reasoning as `recordAudit`. `TestCreateTerminal_CatalogFailureDoesNotFailTheSave` pins that so a refactor cannot quietly promote it to fatal.

  Migration `039_canonical_tag_catalog.sql` backfilled the catalog from `terminals.tag` (`DISTINCT ON (LOWER(tag))`, earliest use winning the casing) and then rewrote the column to the catalog spelling.
Its `ON CONFLICT DO NOTHING` carries **no** target on purpose: `tags` has two arbiters (`tags_pkey` and the `tags_name_lower_unique` expression index) and a targeted clause can name only one.
The `Down` is a no-op, because a backfilled row is indistinguishable from a hand-created one.

  **Two endpoints, deliberately different.** `GET /api/v1/terminals/tags` returns the tags actually in use and drives the filter buttons; `GET /api/v1/tags` returns the whole catalog, each entry carrying `terminal_count`, and drives the Settings panel and the drawer autocomplete.
A tag nothing uses appears in the second and not the first, which is the point - pre-creating a tag for an upcoming operation is supported.
Both order by the `natural_sort` collation from migration `038` so `EXERCISE 2` precedes `EXERCISE 10`.

  `FindAllTags` deduplicates with `GROUP BY LOWER(tag)` and `MIN(tag)`, not `SELECT DISTINCT` - Postgres rejects an `ORDER BY` expression that is not literally in a `SELECT DISTINCT`'s select list, and `tag COLLATE natural_sort` is a different expression from `tag`, so the `DISTINCT` form answered 500 on every request.
It groups on `LOWER(tag)` because this was the sole case-sensitive query in the feature while filtering (`LOWER(tag) = LOWER($n)`), catalog uniqueness and delete all matched case-insensitively - so two casings rendered as two filter buttons returning an identical result set.
After canonicalization there is only ever one casing to group, so this is the guard rather than the mechanism.
`ListTagCatalog` gets its count from a correlated scalar subquery rather than a `LEFT JOIN ... GROUP BY`, which keeps it clear of that same collation trap and avoids `COUNT(*)` reporting 1 for a tag no terminal uses.

  **Editing surface:** the Terminal drawer only (no inline cell editing). The field is a MUI `Autocomplete` with `freeSolo` over the catalog - pick an existing tag or type a new one.
Both `value` and `inputValue` bind to `form.tag`, because the drawer is reused rather than remounted and binding one leaves the other stale across opens.
`renderInput` uses `params.slotProps` (MUI v9 has no `InputProps`/`inputProps` there, and writing the older form type-checks, renders, and caps nothing), spreading `...params.slotProps` back in so the `input` entry keeps its ref, class name and adornments.
Clearing sends `""` rather than null, so `normalizeTag` fires and NULLs the column.

  **Row marker:** a `LocalOfferOutlined` icon after the section badge, `fontSize: 17` in `text.primary` with `ml: 1`, tooltip carrying the value - no chip, no extra column.
Outlined rather than filled: the filled icon at that size reads as a solid blob and loses the tag silhouette.
`text.primary` rather than a literal white, so the icon tracks the palette rather than a hardcoded hex. The original reason was that the theme had a light mode where white would vanish; the app is dark-only now, so that specific hazard is gone and the rule stands on the ordinary one - a token survives a recolour and a hex does not.
It was previously 12px in `text.disabled`, the same treatment as an empty-value placeholder, which is the one thing a present value must not look like.

  **Filter:** button set inline next to the variant filter, exclusive selection (one tag at a time, plus "All") via the `?tag=` URL param, rebuilt whenever the terminals list invalidates.

  **Deleting a catalog tag** clears it from every terminal carrying it and writes one audit event per terminal, in the same `{"tag": {"old": ..., "new": ""}}` shape `diffTerminal` produces, so the audit log renders a bulk clear and a drawer edit identically.
Before that the bulk path was the one way to change terminal data and leave no trace.
`DELETE /api/v1/tags/{name}` answers 404 for a name not in the catalog; it previously discarded `RowsAffected` and returned 204, so a typo looked exactly like a successful delete.
The handler **percent-decodes the path segment** before using it - Fiber hands back the raw segment, so `Operation Verify` arrived as `Operation%20Verify` and matched nothing.
Every realistic tag has a space in it, so deleting a tag from Settings was a no-op for the entire life of the feature, and silent, because the 204 above reported success while nothing had been deleted.
`TestDeleteTagEntryHandler_DecodesTheName` pins it.

## CSV import

`GET /api/v1/import/template` downloads section-aware CSV template with `#`-prefixed comment lines. **No auth required** - the route is registered on the parent app outside the auth-protected group (`routes.go`), so the browser's direct `<a href>` download works without a Bearer token.

`POST /api/v1/import` accepts `{ csv: "..." }`, strips comments, validates per-row (name required, section key and status must be valid, no duplicate names against existing DB records), bulk-inserts valid rows, returns per-row errors for skipped rows.

**Template example rows are named `EXAMPLE STARSHIELD`, `EXAMPLE PARADIGM`, and `EXAMPLE MINIMAL` - do NOT rename these to realistic names like `ASQD MINI 1`.** Those realistic names overlap with seed data and the template would fail import as-is with duplicate-name conflicts. The frontend's import toast surfaces the first skipped row's reason so users who forget to delete the examples see the real cause.

## CSV export

`GET /api/v1/export/terminals` returns filtered CSV. Read-only (any auth user).

| Query param | Shape | Default |
|---|---|---|
| `sections` | comma-separated section keys | all |
| `statuses` | comma-separated status values | all |
| `models` | comma-separated model slugs; `model` is accepted as an alias and merged | all |
| `columns` | comma-separated column keys | all, canonical order |

**`models` accepts both spellings, deliberately.** The list endpoint spells it `model` and the
dashboard family tiles deep-link `?model=mini,hp`, so an export URL copied from that habit
would have been silently dropped - an unrecognised query param is ignored, which yields a full
export that *looks* filtered. Both are parsed and concatenated, so supplying both is additive
rather than one winning. Do not "tidy up" the alias. Note this is the export endpoint only;
the plural-only rule below still governs the list endpoint's `?sections=`.

The three filters travel to the repository as a named `terminal.ExportFilter` struct rather
than three positional `[]string` arguments, because three same-typed slices beside a `columns`
slice is a call site where two arguments transpose with no compiler complaint.

Columns render in `terminal.ExportableColumns` canonical order regardless of caller order. Unknown columns return `400 TERMINAL_INVALID_EXPORT_COLUMN`. Filename: `signal-suite-terminals-YYYYMMDD.csv` via `Content-Disposition`. Frontend Export dialog drops any filter that's fully selected before building the URL.

## Starter data

Eight sections and no terminals. Migration 006 inserts `asqd` through `fsqd` (keys unhyphenated by 012),
036 adds `hq` and 037 adds `spt`. Terminal names follow `<SECTION> <MODEL> <number>` by convention,
e.g. `ASQD MINI 1`, `BSQD HORNET 2`. For a populated dev database run `scripts/seed-dev-assets.mjs`
and `scripts/seed-dev-nets.mjs` against the running stack; they write through the API, not the migrations.

## Terminals page UI

- **Stat strip:** live counts (Total / Available / ALERT / On Mission / Reserved / INOP). Clicking a stat filters the table. Labels are colored with the status color; counts are neutral. Sticky - stays pinned at the top while the terminal list scrolls (MainLayout content area is the scroll container). **Counts come from the backend `status_counts` map in `ListTerminalsResponse`** (a `GROUP BY status` query that runs across the full filtered set, independent of pagination) - not from filtering the current page slice. ALERT aggregate = `alert` + `alert-blue` + `alert-green`.
- **Status badges:** per-status colors - Available green `#3fb950`, On Mission purple `#a371f7`, Reserved orange `#f0883e`, ALERT amber `#e3b341`, INOP red `#f85149`.
- **Section filter** via `?sections=key1,key2` (comma-separated). Sidebar section items toggle - click to add, click active to remove, stack multiple. "All Terminals" or "All Sections" clears the filter. Backend `FindAll` accepts `[]string` and emits `section IN (...)` for multi. **Use `?sections=` (plural) everywhere** - dashboard, deep links, and sidebar all use the plural form; `?section=` (singular) is ignored.
- **`ListTerminalsResponse` shape:** `{ terminals, total, page, total_pages, status_counts }`. `status_counts` is a `map[string]int` (Go) / `Record<string, number>` (TS) keyed by status value. Built by a separate `GROUP BY status` query in `FindAll` so it reflects the full filtered set regardless of page size.
- **Variant filter** - see server-side model filter description in Constraints above. Sidebar has three collapsible family groups (Starshield, Paradigm, OneWeb); clicking a model navigates to `?model=<slug>` and highlights the active item.
- **Columns:** tight-fit (`width: 1%` + `whiteSpace: nowrap`) except **Notes**, which absorbs remaining space with ellipsis truncation + hover Tooltip. Order: Name, Model, Kit / PIM #, Serial #, Section, Status, Assigned To, PoP Pinned to (conditional - see PoP pin section), Notes, Updated.
- **Row order:** `ORDER BY name COLLATE natural_sort, id` - names sort with embedded numbers ordered numerically, so `ASQD MINI 2` precedes `ASQD MINI 10` instead of the plain-text `1, 10, 11, 2, 9`. The collation comes from migration `038_natural_sort_collation.sql` and is applied only in `ORDER BY`, never as a column collation: search is `name ILIKE ...` in the `WHERE` clause and the uniqueness rule is `UNIQUE btree (LOWER(name))`, both of which take the column's own collation and are deliberately untouched. The `, id` tiebreaker keeps the order total, which plain `LIMIT`/`OFFSET` pagination needs. The export query is separate (`FindForExport`) and carries the same clause, so the CSV matches the screen. The frontend's `compareNatural` in `@/utils` is the client-side twin for the pages that sort in JavaScript.
- **`?model=` accepts comma-separated slugs** (e.g. `?model=mini,hp` from the dashboard family tiles) - hydration splits on commas so each toggle highlights.

### Editing surface

- **Terminal drawer** (`TerminalDrawer` with `mode: 'add' | 'edit'`, optional `terminal` prop, optional `focusField` prop):
  - `?drawer=add` - creation
  - `?drawer=edit&id=<uuid>` - edit mode, pre-filled
  - `?drawer=edit&id=<uuid>&focus=notes` - drops cursor into notes field
- **Where the edit record comes from, and why it is not just the current page.** The page
  resolves `?id=` against the loaded page of results first, then falls back to
  `GET /terminals/:id` via `useTerminal(id)` when that misses - the list is paginated, so a
  deep link, a bookmark, or a scope switch with the drawer open can all name a terminal that
  exists on another page. The drawer opens **only once the record has resolved**, and an id
  that resolves to nothing gets a dismissable warning alert above the table instead.

  That guard is load-bearing rather than cosmetic. `isEdit` is `mode === 'edit' && !!terminal`,
  so a drawer handed no terminal reads as Add mode: before this, an unresolvable edit URL
  rendered a blank **Add Terminal** form at an edit URL with no Delete button, and submitting
  it fell through to `createTerminal` and created a duplicate. `terminal-drawer.tsx` now also
  refuses to submit an edit with no record, so the fall-through is closed at both ends.
  `nets-page` was fixed for the same defect first; kits carries an identical fix.
- **Row edit:** hover-revealed pencil in trailing actions cell (opacity 0 → 1 on row hover or focus-within). Admin+editor only.
- **Inline field edit** via `InlineTextCell` / `InlineSelectCell` in `inline-edit-cell.tsx`:
  - Text cells (Name, Kit, Serial, Assigned To) open an inline TextField, pre-selected; Enter or blur saves, Escape cancels.
  - Section + Status cells open a MUI Menu of options.
  - Notes cell click opens the drawer with `focus=notes` (not an inline editor, because notes is too long for a cell).
  - 409 name collisions revert the cell and surface a bottom-center Snackbar.
- **Inline section creation** inside drawer: "Create section…" at bottom of section dropdown expands a Collapse panel with label input, 20-color swatch picker (auto-picks first unused color), key auto-derived from label (`'H SQD' → 'hsqd'`); new section auto-selected on save. Status colors are hard-reserved and excluded from the section palette.
- **Delete:** edit mode only. Danger-colored button in drawer footer opens a confirmation dialog before calling `DELETE`. Hard delete.

### What changed with csvtable

The column list, the template header and the importer all read one declaration in `<domain>/csv.go` now, rather than three hand-maintained copies.
Two consequences worth knowing:

- **`id` is exported, first, and refused on import.** A file carrying one came from an export and the user meant to update those rows; import creates, so without the guard every line would come back as a duplicate name - accurate and useless.
- **The frontend does not keep its own column list.** `backend/internal/csvregistry` generates `frontend/src/generated/csv-columns.ts`, and a Go test fails when the committed copy is stale. Regenerate with `go test ./internal/csvregistry -update` in the same commit as any column change.

The template is column-selectable (`?columns=`), and required columns are force-included whatever the caller asks for - a template missing one produces a file that cannot be imported. When that happens it prints a comment line saying so.

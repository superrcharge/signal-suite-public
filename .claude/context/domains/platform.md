# Platform domain

Global Platform Library - the fourth centrally managed reference table, beside Waveforms, Services and Transports. It holds **external comms platforms**: airframes, ships, vehicles and sites that are not equipment we own. It exists to feed one view, the **joint compatibility matrix** at `/catalog/compatibility`, which answers "which waveforms can all of these assets actually talk on" - the input to a PACE across a joint force.

## Why not an Equipment flag

An equipment row is a hardware type we hold, with SWAP, power, gain, EIRP, bands and a photo, and it feeds the facet rail, compare and the data sheet. An F-35 has none of that. Marking an airframe as equipment would put someone else's aircraft in the browse facets and the compare picker with nine-tenths of its data sheet blank.

## Backend

**Migrations:** `backend/migrations/040_create_platforms.sql`, `044_platform_category_branches.sql`, `045_platform_type.sql`, `050_platform_type_uav.sql`

| Column | Notes |
|---|---|
| `designation` | Natural key, `F-35A`. Case-insensitive unique index |
| `popular_name` | `Lightning II` |
| `category` | `TEXT[]`, closed: the branches operating the platform - `USA`, `USMC`, `USN`, `USAF`, `USSF`, `USCG`, `OGA` - stored in that order of precedence. Empty means none set. CHECK constraint and a GIN index (044) |
| `type` | Closed: `aircraft`, `uav`, `ship`, `ground vehicle`, `ground station`; default `aircraft`. CHECK constraint (045, widened by 050) |
| `waveform_abbrevs` | `TEXT[]` - waveforms declared on the platform directly. Each must already exist in the waveform library, or the write is refused |
| `equipment_ids` | `TEXT[]` - catalog radios it carries, where known |
| `notes` | |

**Category is the branch, and it is closed.** Migration 044 replaced two columns. The old `category` (organic / joint / coalition) described an asset relative to the reader, so the same F-15E was organic to one squadron and joint to the next. The old `operator` already held the branch in practice (`USAF`, `USN/USMC`, `SOCOM/USA`) but as free text the matrix re-parsed on every read. The branch says what the platform is, and a closed list cannot be typed two ways.

- **An array**, because one airframe is often flown by several services: an F-35 by the Air Force, Navy and Marine Corps is one row, not three.
- **OGA** is an agency inside the government but outside the military: CBP, NASA, NOAA, State and the like.
- **SOCOM is not a branch.** It is a combatant command, and a SOCOM platform belongs to the service that fields it. 044 dropped the token, keeping any other branch the row listed; the nine platforms that listed SOCOM alone were deleted from dev before the migration ran, and on any other database such a row migrates with an empty category, drawn as a blank to be set by hand.
- **The migration mapped every operator token**: a branch abbreviation (and `ARNG` / `ANG`, the Guard components) to its branch, `SOCOM` to nothing, anything else to `OGA`. Its Down puts the branches back into `operator` as `/`-joined text and every row's old category as `joint`, since nothing recorded which rows were organic.
- `NormaliseCategory` in `platform/model.go` delegates to `Normalise` in `shared/branch/branch.go`, where the branch list and aliases are declared (`Branches` is an alias of `branch.Valid`). It accepts branch names as well as abbreviations ("Air Force", "marine corps"), upper-cases, drops repeats, sorts into precedence order and returns anything that is not a branch separately, so the service can refuse it with `PLATFORM_INVALID_CATEGORY` and the CSV importer can name it in the row error.

**Type is closed too, since 045**, and was an open `kind` until then. An open list let a free-text value in through import - "launch platform", on one row, ML-1 (NASA's Mobile Launcher 1), since deleted - and every such value became a filter chip on the library and the matrix. 045 renamed the column, normalised values, mapped anything outside the four to `ground station` (none remained on dev), and added the CHECK; its Down renames back and cannot restore a remapped value. `NormaliseType` still lands `Ship`, `ground_vehicle` and repeated spaces on a listed type and blank on `aircraft`; anything else is `PLATFORM_INVALID_TYPE`, and on import a row error naming the value. Transports keep their open `kind`: that is a different vocabulary with a different argument (033).

**`uav` is the fifth type, since 050.** A UAV is an aircraft nobody talks to from inside it, so declaring one as an aircraft, which the Join Operation wizard had to do while the list had no value for it, put an unmanned airframe beside a crewed one on an operation's matrix with nothing to tell them apart. 050 drops and re-adds the CHECK with `uav` in the set; its Down restores the four-value CHECK and fails while a `uav` row exists, because nothing recorded what such a row was before. The label is the initialism `UAV`, the one value `platformTypeLabel` does not simply capitalise.

**No join table.** The schema has none. An abbrev the waveform library does not declare is refused on create, update and CSV import, and a waveform rename is carried onto every platform row, so the array cannot hold an orphan. What matters is that a platform's waveform set lives in **one** row. Abbrevs are deduplicated case-insensitively, keeping the first spelling. An `equipment_id` naming a deleted record is kept and ignored by the matrix, not stripped.

**Package:** `backend/internal/domain/platform/` - the transport package's shape. Routes use PACE's writer set (`admin, editor, rto, planner`), stated as PACE's.

**CSV:** one row per platform. The three arrays - category, waveforms, carried equipment - serialise as one `;`-separated cell each and all import. A category value that is not a branch fails that row and names the value; a blank category is a valid row. A type outside the list fails the row the same way; a blank type is `aircraft`. The **matrix** is a cross-tab, which `csvtable` cannot express; its export path is the print route. An abbrev the waveform library does not declare fails the row.

## API

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/v1/platforms` | any authenticated | Returns all platforms, `ORDER BY lower(designation) COLLATE natural_sort ASC` |
| POST | `/api/v1/platforms` | admin, editor, rto or planner | `designation` is required and unique (case-insensitive); 409 on a duplicate, 400 on a bad category, type or waveform |
| PATCH | `/api/v1/platforms/:id` | admin, editor, rto or planner | Partial update - nil fields ignored |
| DELETE | `/api/v1/platforms/:id` | admin, editor, rto or planner | Hard delete, audited; 404 when the id does not exist |
| GET | `/api/v1/export/platforms` | any authenticated | CSV export; `?columns=` picks columns |
| GET | `/api/v1/platforms/import/template` | none | Registered on the raw app before the group's `RequireAuth`, since the template carries no user data |
| POST | `/api/v1/platforms/import` | admin, editor, rto or planner | CSV import, one row per platform |

The role gate is passed before the handler on every write route, because Fiber runs only `Handlers[0]` and a trailing gate would never execute.

**Error codes** (`platform/errors.go`):

| Code | Status | When |
|---|---|---|
| `PLATFORM_NOT_FOUND` | 404 | the id is not a platform |
| `PLATFORM_DESIGNATION_EXISTS` | 409 | the designation is taken, compared case-insensitively |
| `PLATFORM_INVALID_CATEGORY` | 400 | a category value is not one of the seven branches |
| `PLATFORM_INVALID_TYPE` | 400 | the type is not one of the four |
| `PLATFORM_UNKNOWN_WAVEFORM` | 400 | an abbrev the waveform library does not declare; the message names each one |
| `PLATFORM_INTERNAL_ERROR` | 500 | anything else |

## Frontend

- `types/platform.ts`, `services/platform-service.ts` (`usePlatforms` + three mutations, `queryKeys.platforms`)
- `types/platform.ts` also exports `BRANCHES`, the `Branch` type and `BRANCH_NAMES` ("US Navy" and so on, for tooltips). `components/catalog/branch-colors.ts` holds one filled chip colour per branch - three distinct blues for the Navy, the Air Force and the Coast Guard, red for the Marine Corps, gold for the Army, slate for the Space Force, black for OGA - filled rather than outlined, so one style reads on both the matrix's paper and the library's dark rows. The ink is white except on the Army's gold, which white does not read on, so that chip carries black text (`INK`).
- `components/catalog/PlatformLibraryPane.tsx` - the fourth Comms Library chip, `?lib=platforms`. Category is picked with one toggle per branch, several at once, kept in precedence order whatever order they are clicked; each row shows one chip per branch. Type is a plain select of the four. **The filter bar filters by what a platform is, never by what it carries**: a Category row and a Type row (`facets`), any-of within a row and all-of across. It filtered by carried waveform until 2026-09, which made the library a lesser copy of the matrix, and each row's waveform chips drove the same filter a second way; they are now plain labels showing what the platform carries. A configuration of `ReferenceLibraryPane` - the only one passing no `fieldGrid`, since its form is two grids and two chip strips rather than a row of cells, and the only one using `renderRowExtra`, for its carried-waveform and carried-radio tiles. Self-gated on `canWritePace`, and advertised by an **Add Platform** row in the header's `+` menu under the same flag, navigating to `/catalog/comms-library?lib=platforms`
- `components/catalog/compat-matrix-model.ts` - `buildMatrix()`, pure and unit-tested. Rows are every library waveform and nothing else, an abbrev the library does not declare getting no row; columns are platforms plus every catalog **radio** (SATCOM terminals carry services, not waveforms, and are excluded)
- `components/catalog/compat-matrix-params.ts` - URL state: `branch`, `type`, `cols` (ids, or `all`), `hideEmpty`, `fit`. The pre-044 `cat` and `op` parameters, and the pre-045 `kind`, are ignored rather than half-applied
- **Every filter is in the Filters panel.** The banner used to carry ORGANIC / JOINT chips beside the title; they filtered like the panel's rows without looking like them, and their category is gone. The branch and type filters are any-of within each and all-of across them, and a catalog radio (no branch) never matches an active branch filter; type `radio` reaches the radios
- **Each column head carries one chip per branch and nothing else**, with the branches spelled out in its tooltip. A catalog radio has no branch and draws no chip
- **A supported cell draws one ✓ per branch, in that branch's colour** (`branchColor`, the chip fill, so a check always matches its chip). A UH-60L flown by USA and OGA is one record and one column, and a single ✓ hid that two organisations field it; it now shows a gold and a black check. Which branches draw is `MatrixColumn.checkBranches`: every branch unfiltered, only the filtered ones under a branch filter, since those brought the column in, and none for a radio, which keeps the neutral check. The glyph shrinks with the count (18 / 15 / 12px) so four fit the 76px minimum column. The checks in one column always appear together, because the waveform list is per record; two branches whose airframes really differ are two platform records. The legend keys only colours actually drawn
- **The page opens blank.** No `cols` means no columns, and the grid says to pick some: every one of 500-odd platforms side by side is too wide to read. `cols=all` (`ALL_COLUMNS`) is every column the filters allow, a token so the link stays short; the Columns panel's Select all sets it and Clear removes `cols`
- **Default column order**, used by `cols=all`, is by branch in precedence order (`BRANCH_ORDER`: USA, USMC, USN, USAF, USSF, USCG, OGA), then natural within, then platforms with no branch, then radios. A multi-branch platform is one column, placed by its first branch. A list of picked ids is drawn in the order picked
- The Columns panel groups its tiles with `groupByBranch()`, one `ChipRow` per branch with an ALL tile, and a multi-branch platform appears in every row it belongs to. `ChipRow` lives in `components/catalog/chip-row.tsx`, shared with the Compare panels
- `components/catalog/JointCompatibilityMatrix.tsx` - draws a model; `print` drops the scroll wrapper and fixes the label column at `MATRIX_LABEL_COL`. Also exports `MatrixLegend`, `MatrixPrintHeading` and `MatrixPrintPage`, the one component both the print route and the pagination twin draw a page with
- **Printing works the way the compare page's does, on the same paper and arithmetic.** `use-matrix-print-pagination.tsx` is `usePrintPagination` for this grid: columns split arithmetically (`paginateColumns` with the matrix's `MATRIX_LABEL_COL` 150 and `MATRIX_MIN_COL` 72, the label column repeating on every page across), rows split by measuring a hidden twin of the real print pages (`paginateRows`, the header row repeating on every page down, the heading and key costing their height on each column chunk's first page), and Fit to one page (`fit=1`, compare's key) zooming to the smaller of what rows and columns need, floor 70%, by CSS `zoom`. `sliceModel` cuts a model to one page's columns and rows. The live page shows the count beside its Fit toggle ("prints on N pages", shortened to "N pages" below 1400px, where the banner has one toggle more than compare's and the prefix was the 40px it ran past the content line at the 1280 floor), and the panel toggles sit straight after the title. The print route is built like compare's: a preview of the actual pages with captions, and `?print=1` drawing the pages alone and opening the dialog once measured
- `pages/catalog-compatibility-page.tsx`, `pages/catalog-compatibility-print-page.tsx` - both declared before `/catalog/:id`. The page carries the same Print / Save PDF button and `SheetExportMenu` as `/catalog/compare`, right-justified through `DocumentActions`, with `compatExportSpec()` in `sheet-export/sheet-specs.ts`. The sheet root is the max-content box around the grid and legend, never the scroll wrapper, so off-screen columns are exported
- No summary readout. A "common to all N" line and per-row counts were removed in an earlier release because they read as the page's verdict; the matrix is read across a row
- Sidebar: static **Compatibility** item under Equipment Catalog. No `@/services` hook

A platform's effective waveform set is its own abbrevs **union** every carried radio's `data.waveforms`, resolved at render. A cell is one boolean, drawn as ✓ or a dash: where the waveform came from is not recorded, because a platform that carries a radio with a waveform has that waveform, and variants that differ are separate platform rows. Rows are the waveform library and nothing else; an abbrev a column names that the library does not declare gets no row, and the equipment editor's orphan chip is where such an entry is seen and removed. The legend keys each branch whose colour is drawn, plus the catalog radios' neutral check when one shows.

## Two compatibility surfaces - and which one is live

| | Section 03b, on a radio's data sheet | `/catalog/compatibility` |
|---|---|---|
| Columns | Other catalog radios only | Platforms and catalog radios |
| Data | **Snapshot** copied into that radio's JSONB | **Live**, resolved every render |
| Right for | A printed record of what was true then | Planning across a joint force |

Section 03b drifting from the catalog is by design, not a bug in the matrix. Letting 03b pick platforms as columns is a possible follow-up, not built.

# Platform domain

Global Platform Library - the fourth centrally managed reference table, beside Waveforms, Services and Transports. It holds **external comms platforms**: airframes, ships, vehicles and sites that are not equipment we own. It exists to feed one view, the **joint compatibility matrix** at `/catalog/compatibility`, which answers "which waveforms can all of these assets actually talk on" - the input to a PACE across a joint force.

## Why not an Equipment flag

An equipment row is a hardware type we hold, with SWAP, power, gain, EIRP, bands and a photo, and it feeds the facet rail, compare and the data sheet. An F-35 has none of that. Marking an airframe as equipment would put someone else's aircraft in the browse facets and the compare picker with nine-tenths of its data sheet blank.

## Backend

**Migration:** `backend/migrations/040_create_platforms.sql`

| Column | Notes |
|---|---|
| `designation` | Natural key, `F-35A`. Case-insensitive unique index |
| `popular_name` | `Lightning II` |
| `category` | Open vocabulary, default `joint`. Suggestions: organic, joint, coalition |
| `kind` | Open vocabulary, default `aircraft`. Suggestions: aircraft, ship, ground vehicle, ground station |
| `operator` | Service or nation |
| `waveform_abbrevs` | `TEXT[]` - waveforms declared on the platform directly. Each must already exist in the waveform library, or the write is refused |
| `equipment_ids` | `TEXT[]` - catalog radios it carries, where known |
| `notes` | |

**Category and kind are unconstrained `TEXT`, not `VARCHAR` enums** - the same decision transports made for `kind` in 033. A joint exercise brings assets nobody anticipated. Shape is enforced in `platform/model.go`: lowercased, trimmed, internal whitespace collapsed, underscores become spaces, and anything outside `[a-z0-9 -]` up to 40 characters is rejected.

**No join table.** The schema has none. An abbrev the waveform library does not declare is refused on create, update and CSV import, and a waveform rename is carried onto every platform row, so the array cannot hold an orphan. What matters is that a platform's waveform set lives in **one** row. Abbrevs are deduplicated case-insensitively, keeping the first spelling. An `equipment_id` naming a deleted record is kept and ignored by the matrix, not stripped.

**Package:** `backend/internal/domain/platform/` - the transport package's shape. Routes use PACE's writer set (`admin, editor, rto, planner`), stated as PACE's.

**CSV:** one row per platform. The two arrays serialise as one `;`-separated cell each and both import. The **matrix** is a cross-tab, which `csvtable` cannot express; its export path is the print route. An abbrev the waveform library does not declare fails the row.

## Frontend

- `types/platform.ts`, `services/platform-service.ts` (`usePlatforms` + three mutations, `queryKeys.platforms`)
- `components/catalog/PlatformLibraryPane.tsx` - the fourth Comms Library chip, `?lib=platforms`. A configuration of `ReferenceLibraryPane` - the only one passing no `fieldGrid`, since its form is two grids and two chip strips rather than a row of cells, and the only one using `renderRowExtra`, for its carried-waveform and carried-radio chip strip. Self-gated on `canWritePace`
- `components/catalog/compat-matrix-model.ts` - `buildMatrix()`, pure and unit-tested. Rows are every library waveform plus any orphan abbrev a column names; columns are platforms plus every catalog **radio** (SATCOM terminals carry services, not waveforms, and are excluded)
- `components/catalog/compat-matrix-params.ts` - URL state: `cat`, `cols`, `hideEmpty`
- `components/catalog/JointCompatibilityMatrix.tsx` - draws a model; `print` drops the scroll wrapper
- `pages/catalog-compatibility-page.tsx`, `pages/catalog-compatibility-print-page.tsx` - both declared before `/catalog/:id`. The page carries the same Print / Save PDF button and `SheetExportMenu` as `/catalog/compare`, right-justified through `DocumentActions`, with `compatExportSpec()` in `sheet-export/sheet-specs.ts`. The sheet root is the max-content box around the grid and legend, never the scroll wrapper, so off-screen columns are exported
- No summary readout. A "common to all N" line and per-row counts were removed in an earlier release because they read as the page's verdict; the matrix is read across a row
- Sidebar: static **Compatibility** item under Equipment Catalog. No `@/services` hook

A platform's effective waveform set is its own abbrevs **union** every carried radio's `data.waveforms`, resolved at render. A cell is one boolean, drawn as ✓ or a dash: where the waveform came from is not recorded, because a platform that carries a radio with a waveform has that waveform, and variants that differ are separate platform rows. Rows are the waveform library and nothing else; an abbrev a column names that the library does not declare gets no row, and the equipment editor's orphan chip is where such an entry is seen and removed. Legend has two entries.

## Two compatibility surfaces - and which one is live

| | Section 03b, on a radio's data sheet | `/catalog/compatibility` |
|---|---|---|
| Columns | Other catalog radios only | Platforms and catalog radios |
| Data | **Snapshot** copied into that radio's JSONB | **Live**, resolved every render |
| Right for | A printed record of what was true then | Planning across a joint force |

Section 03b drifting from the catalog is by design, not a bug in the matrix. Letting 03b pick platforms as columns is a possible follow-up, not built.

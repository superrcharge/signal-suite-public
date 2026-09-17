# Equipment domain

Equipment catalog for SATCOM and radio terminal data sheets. Independent of the Terminals domain - equipment records describe *types* of hardware, not individual fielded assets.

**`data.waveforms[]` is read by PACE as well as by the catalog datasheet.** A PACE tier can name any catalog record, radios included, and `loadTiers` resolves the tier's capability abbreviation against `data->'services'` and `data->'waveforms'` concatenated. So both snapshots are printed surfaces, and the `name` inside them is what a comms card shows. See `pace.md`.

## Global Waveform Library

A shared reference table (`waveforms`) governs all waveform entries across the catalog. Editors maintain waveforms centrally; equipment records reference them by abbrev.

**Migration:** `backend/migrations/018_create_waveforms.sql`

```sql
CREATE TABLE waveforms (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  abbrev      TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL DEFAULT '',
  updated_by  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX waveforms_abbrev_lower_idx ON waveforms (lower(abbrev));
```

**Domain:** `backend/internal/domain/waveform/` - full CRUD domain (model, repository, service, handler, routes, validation, DTOs).

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v1/waveforms` | any authenticated |
| POST | `/api/v1/waveforms` | editor+ |
| PATCH | `/api/v1/waveforms/:id` | editor+ |
| DELETE | `/api/v1/waveforms/:id` | editor+ |

**Frontend hooks:** `useWaveforms`, `useCreateWaveform`, `useUpdateWaveform`, `useDeleteWaveform` in `services/waveform-service.ts`. Query key: `queryKeys.waveforms.list()`.

The SATCOM side has the same arrangement in `services` / `backend/internal/domain/satcomservice/`, hooks in `services/service-library.ts`, gated on admin and editor only. See `service.md`.

## Backend

**Migration:** `backend/migrations/017_create_equipment.sql`

**Schema:**
```sql
CREATE TABLE equipment (
  id               TEXT PRIMARY KEY,          -- meaningful slug, e.g. "hornet", "mpu5-satcom"
  nomenclature     TEXT NOT NULL,
  nickname         TEXT,
  one_liner        TEXT,
  doc_number       TEXT,
  photo_url        TEXT,
  make             TEXT,
  terminal_type    TEXT NOT NULL DEFAULT 'satcom',  -- 'satcom' | 'radio'
  operational_mode TEXT[] NOT NULL DEFAULT '{}',
  data             JSONB NOT NULL DEFAULT '{}',     -- all flexible spec data (see below)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       TEXT,
  updated_by       TEXT
);
```

The `data` JSONB column holds all type-specific spec data:
```json
{
  "services":      [...],   // SATCOM: EquipmentService[] (abbrev, name, description, cir, mir, best_effort)
  //                             abbrev/name/description populated via Services Library chips;
  //                             cir/mir/best_effort stay per-terminal. See service.md.
  "waveforms":     [...],   // Radio: EquipmentWaveform[] (abbrev, name, description) - populated via Waveform Library chips
  "compatibility": {        // Radio: waveform compatibility matrix
    "comparisons": [...]    // CompatibilityComparison[] - see type note below
  },
  "bands":         [...],   // EquipmentBand[] (band, downlink, uplink, eirp, gt, tx_power)
  "standard_specs": {},     // type-branching key/value (see StandardSpecsTable component)
  "physical_specs": [...],  // SpecRow[] (label, value)
  "rf_specs":      [...],   // SpecRow[]
  "swap":          {},      // EquipmentSwap (size: {length, width, height}, weight, power)
  "features":      [...],   // EquipmentFeature[] (title, description)
  "accessories":   "...",   // string (radio only)
  "use_cases":     "..."    // string
}
```

**`CompatibilityComparison` type:**
```ts
interface CompatibilityComparison {
  equipment_id?: string;  // FK to Equipment.id - links to the actual inventory record
  nomenclature: string;   // denormalised copy for display
  nickname?: string;
  waveforms: string[];    // abbrev strings - subset of the compared radio's Section 03 waveforms
}
```
`equipment_id` is set by the editor when radios are selected via inventory chips. Legacy entries created before this field existed will have `equipment_id: undefined`.

**Domain layout:** `backend/internal/domain/equipment/`
- `model.go` - `Equipment`, `EquipmentSummary`
- `errors.go` - `ErrEquipmentNotFound`, `ErrEquipmentIDExists`, `ErrEquipmentInternalError`
- `dto/request.go`, `dto/response.go`
- `repository.go` - `FindAll(ctx, terminalType, search)`, `FindByID`, `Create`, `Update`, `Delete`, `ExistsID`
- `service.go` - `ListEquipment`, `GetEquipment`, `CreateEquipment`, `UpdateEquipment`, `DeleteEquipment`. Top-level scalar columns use PATCH-style updates (nil fields ignored), but the `data` JSONB is **full-replace** on update - see API gotcha below.
- `handler.go` - standard CRUD + `UploadPhoto` (multipart → Azure Blob → update `photo_url`)
- `routes.go` - registers routes (see API below)
- `validation.go`

**Blob storage:** `backend/internal/blob/blob.go`
- `NewClient(serviceURL, container string) (*Client, error)` - uses `azidentity.DefaultAzureCredential`
- `UploadStream(ctx, blobName, contentType string, r io.Reader) (string, error)` - uploads blob, returns URL stored in `photo_url`
- `Download(ctx, blobName string) (io.ReadCloser, string, error)` - downloads blob using the same credential; returns body + content-type
- `BlobNameFromURL(rawURL string) (string, error)` - extracts the blob name from a stored URL by stripping the service URL and container prefix
- `Delete(ctx, blobName string) error` - removes a blob. An already-absent blob is reported as success, which is what lets a partially-failed delete converge on retry
- Handler passes `nil` blob client when `AZURE_STORAGE_URL` is empty; `UploadPhoto` and `GetPhoto` return 501 in that case

**Two interfaces sit in front of the client** so the failure paths are testable without Azure:
- `PhotoStore` (`handler.go`) - `UploadStream` + `Download` + `Delete` + `BlobNameFromURL`; the handler's field type
- `BlobStore` (`service.go`) - `Delete` + `BlobNameFromURL`; injected via `SetBlobStore`, mirroring the nil-safe `SetAudit` pattern

**Wired in `main.go`:** the blob client is created conditionally, then assigned to a `PhotoStore` variable **only when non-nil**, before `equipment.NewHandler(service, validator, photoStore)` and `equipmentService.SetBlobStore(photoStore)`. A nil `*blob.Client` assigned straight to an interface yields a non-nil interface wrapping a nil pointer, which would defeat every "storage not configured" guard and panic on first use.

### Photo blob lifecycle (gotcha)

`photo_url` is the **only** reference to a blob, so every path that drops it must delete the blob or the object is stranded permanently.

- **Delete equipment** - blob goes **before** the row. The row holds the only pointer, so blob-first fails safe: the record survives pointing at a missing image and a retry converges. Row-first would strand the blob with nothing left to locate it by. A blob failure returns 500 and leaves the row intact.
- **Replace photo** - uploads mint a fresh UUID name and never overwrite, so `UpdateEquipment` deletes the superseded blob after the row commits. **Guarded on an actual URL change**, because this is the generic edit path - without that comparison, editing a nickname would destroy the photo. Best effort: logged, never fails the request.
- **Failed upload** - if the row update fails after the upload, `UploadPhoto` deletes the blob it just wrote, so no failure path leaves an unreferenced object.
- A `photo_url` outside the configured container is logged and skipped rather than blocking the delete.

If the storage account has soft-delete retention (1 day is a sensible setting), "deleted" means recoverable for that window and then purged.

## API

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/v1/equipment` | any | `?type=satcom\|radio`, `?search=` |
| GET | `/api/v1/equipment/:id` | any | |
| POST | `/api/v1/equipment` | editor+ | Client-provided `id` (slug) |
| PATCH | `/api/v1/equipment/:id` | editor+ | Partial update on top-level fields, **but `data` is full-replace** - see below |
| DELETE | `/api/v1/equipment/:id` | editor+ | |
| GET | `/api/v1/equipment/:id/photo` | any | Proxy - fetches the stored blob via Managed Identity, streams bytes with correct `Content-Type`. 404 if no photo, 501 if blob not configured. |
| POST | `/api/v1/equipment/:id/photo` | editor+ | Multipart `photo` field (JPEG/PNG/WebP). Uploads to Azure Blob, updates `photo_url`, returns `{ url }`. Returns 501 if blob not configured. |

### PATCH gotcha - `data` is full-replace, not merge

On update, top-level scalar columns (`nomenclature`, `nickname`, `make`, `terminal_type`, `operational_mode`, etc.) follow nil-fields-ignored semantics. **The `data` JSONB column does not.** `service.go` uses `if len(req.Data) > 0 { e.Data = req.Data }` - any non-empty `data` in the request replaces the entire JSONB blob. Sending `{"data": {"services": [...]}}` erases `bands`, `standard_specs`, `physical_specs`, `rf_specs`, `swap`, `features`, `use_cases`, and any other keys not in the request - silently, with no error.

The frontend editor's `useUpdateEquipment` mutation always sends the complete draft via `draftToEquipment`, so the UI never trips this. **Direct API callers (scripts, curl, imports) must always GET → modify → send the full `data` object on update.**

## Frontend

**Types:**
- `frontend/src/types/equipment.ts` - `Equipment`, `EquipmentData`, `EquipmentService`, `EquipmentWaveform`, `CompatibilityComparison` (with `equipment_id?`), `EquipmentBand`, `SpecRow`, `EquipmentSwap`, `EquipmentFeature`, `TerminalType`, `ListEquipmentResponse`, `CreateEquipmentRequest`, `UpdateEquipmentRequest`. All snake_case to match backend JSON. `RadioStandardSpecs` includes `range_unit?: 'mi' | 'km'` alongside `range?: number` - stored in `data.standard_specs` JSONB; backward-compat (absent = `'mi'`).
- `frontend/src/types/waveform.ts` - `Waveform`, `ListWaveformsResponse`, `CreateWaveformRequest`, `UpdateWaveformRequest`.

**Service hooks:** `frontend/src/services/equipment-service.ts`
- `useEquipment(params?)` - list query, key `['equipment', params]`
- `useEquipmentItem(id)` - single query, key `['equipment', id]`, disabled when id is empty
- `useCreateEquipment()` - invalidates list on success; navigate to `/catalog/:id/edit` after
- `useUpdateEquipment()` - invalidates list + detail
- `useDeleteEquipment()` - invalidates list
- `useUploadEquipmentPhoto()` - POSTs `FormData` to `/:id/photo`, invalidates list + detail

**CSS tokens:** `frontend/src/styles/catalog-tokens.css` - loaded lazily on catalog routes. Defines `--shf-amber`, `--shf-paper`, `--shf-graphite-*`, `--font-display` (Oswald), `--font-condensed` (Barlow Condensed), `--font-body` (IBM Plex Sans), `--font-mono` (IBM Plex Mono). Fonts are self-hosted via `@font-face` declarations pointing to TTF files bundled at `public/fonts/` - no external CDN dependency (required for air-gapped deployments).

**Components:** `frontend/src/components/catalog/`
- `DataSheet.tsx` - 1024px-wide article shell (amber-bordered graphite header, page body). `showPageBreak` prop renders a red dashed boundary line at `pageBreakAt` px (default 1315) to indicate print overflow. `pageBreakAt` should be set to `Math.round(PAGE_H / effectiveScale)` from the preview so the line tracks the true print clip point as scale changes.
  - **`elevated` is opt-in, and the reason is worth reading before you turn it on.** The sheet's height flows with the record, while `catalog-sheet-page` and `catalog-print-page` render it inside an 816x1056 page box that already carries its own shadow at the paper's edges. So on any record short of a full page, the sheet's own `0 12px 48px` shadow fell *inside* the paper - measured on BE-900, 350px above the page foot - and read as a soft grey band across the middle of the sheet. Only `catalog-editor-page`'s Live Preview sets it, because that one renders the sheet bare on a dark `#1A1D20` canvas with no page box, so the shadow is the only thing separating the two.
  - **Diagnosing that band in print media clears the guilty party.** `catalog-tokens.css` strips this shadow under `.catalog-print-wrapper`, so with print emulation on it computes to `none` and the element looks innocent while the band is plainly there on screen. Check a sheet property in the medium the reporter is actually looking at.
- `DataSheetView.tsx` - assembles full `Equipment` object into all sections; handles SATCOM vs Radio branching. `showPageBreak` / `pageBreakAt` / `elevated` props passed through (all three used by the editor preview only - never by the print page).
- `HeroBlock.tsx` - manufacturer (`make`) in monospace above nomenclature; nickname inline to the right of nomenclature (baseline-aligned, smaller); `oneLiner` in italic below; services table (SATCOM) or waveforms pill row (Radio). A service with `best_effort: true` renders the words "Best Effort" in both the CIR and MIR cells instead of rate numbers, so the table stays 4 columns. The editor clears `cir`/`mir` when the flag is set, so a flagged service never carries stale rates.
- `SectionBlock.tsx` - section wrapper with bold condensed title. `hideDivider` prop (default `false`) suppresses the 4px×48px accent bar. All data sheet sections use `hideDivider`.
- `SpecTable.tsx` - generic label/value rows. `borderSide` prop (`'top'` | `'bottom'` | `'none'`, default `'top'`). Physical specs use `'none'`; RF specs use `'bottom'`.
- `FrequencyTable.tsx` - multi-band RF table (SATCOM: S/C/X/Ku/K/Ka; Radio: HF/VHF/UHF/L). Band name cell uses `font-mono 11px weight-600` and `padding: 4px 0` - deliberately matched to `StandardSpecsTable` row heights so the two side-by-side columns align on SATCOM sheets.
- `StandardSpecsTable.tsx` - type-branching fixed-row specs (7 rows SATCOM, 4 rows Radio). The Radio **Range** row reads `range_unit` from the specs object (`'mi'` | `'km'`, defaults to `'mi'` when absent) to display the correct unit - `formatStandardValue` receives the full specs as a third argument for this purpose.
- `SwapBlock.tsx` - Size / Weight / Power tile. 2px separator is at the **bottom**.
- `FeaturesBlock.tsx` - 2-col feature grid.
- `CompatibilityMatrix.tsx` - waveforms × radios grid. ✓ marks compatible cells (waveform abbrev present in comparison's `waveforms` array).
- `AccessoriesList.tsx` - accessories list (radio only).
- `StatusPill.tsx` - operational status badge (5 variants).
- `BrowseGrid.tsx` - card grid used by CatalogPage.
- `index.ts` - barrel export.

**Pages:**
- `catalog-page.tsx` - browse view in `MainLayout`; search + All/SATCOM/Radio filter chips + a facet sidebar (see "The facet sidebar" below) + `BrowseGrid`. **Sort order on All tab: SATCOM items alphabetically, then Radio items alphabetically.** Sorting happens client-side via `compareNatural` from `@/utils`, not in SQL - so embedded numbers order numerically (`VSAT 2` before `VSAT 10`), matching the `natural_sort` collation the API uses elsewhere. The active tab is URL state via `?type=` (`satcom` / `radio`; unrecognized values fall back to All, and All omits the param), so the dashboard catalog tiles deep-link into it. **Every tab is a `terminal_type` filter, and that is new.** `waveforms` and `services` were also tabs, and they were a different kind of thing: they replaced `BrowseGrid` with a read-only view of a reference table. Both retired to `/catalog/comms-library`, which browses and edits them; the two old URLs redirect there rather than falling back to All, so a deep link does not silently land on the equipment grid. See `waveform.md` and `service.md` for what was lost with them.
- `catalog-sheet-page.tsx` - single sheet in `MainLayout`. Layout: 240px inventory sidebar (`CATALOG_RAIL_W`; All/SATCOM/Radio tabs, click-to-navigate, highlights active item) + main canvas. Banner: a rail-width `RailTitle` ("Data Sheet", rendered as a `div` because the sheet's own `HeroBlock` carries the record name as the page's `h1`), Back to Catalog, scale slider (min 45%, max = auto-fit - single-page constraint enforced), relative % display (auto = 100%), Reset chip, then right-justified `DocumentActions`: Edit (writers), Full Screen, share, Print / Save PDF. `viewZoom` fills the canvas width; `autoScale` is computed after `document.fonts.ready` from actual `scrollHeight`. `userScale` resets to null on item navigation.
- `catalog-print-page.tsx` - chrome-free full-screen data sheet at `/catalog/:id/print`. Reads `?scale=` and `?custom=1` query params. After fonts + images ready, injects `@media print` CSS with `transform: scale(N)` and conditionally calls `window.print()` when `?print=1`. Hard single-page constraint via `overflow: hidden` on wrapper. The wrapper also carries `background: var(--shf-paper)`, because it *is* the printed page and was the only page box in the app with no paper under it - without it the paper changed colour where the sheet ended, 253px up from the foot on a sparse record.
- `catalog-editor-page.tsx` - 3-pane editor (240px `CATALOG_RAIL_W` list + remainder form + 800px preview while shown). Equipment list pane has **All/SATCOM/Radio tabs** with SATCOM-first sort on All. **Equipment IDs are auto-derived slugs** from nomenclature on create (`slugify`: lowercase, non-alphanum → dash, max 80 chars). Section 03 (Radio waveforms) uses **toggle chips from the global waveform library** - orphaned entries surface as removable gray chips. Section 03b uses **inventory radio chips** (all radio-type equipment except current) linked by `equipment_id`; toggling a radio on pre-populates its waveforms from that radio's own Section 03 data (hard requirement). Preview pane shows a red-tinted warning banner below the paper when content overflows the page boundary. Gated: non-writers see redirect message. **Radio Section 04 Range field:** compound control - number input + inline `mi` / `km` toggle buttons; switching units converts the value in-place (`× 1.60934` mi→km, `× 0.62137` km→mi). Saves both `range` (number) and `range_unit` (`'mi'` | `'km'`) into `standard_specs`. Records without `range_unit` default to `'mi'` on display.

- `catalog-compare-page.tsx` - the live comparison at `/catalog/compare`, in `MainLayout`. Equipment and parameter pickers, the `CompareMatrix` grid, the PNG/clipboard/PPTX export, a Fit to one page toggle with a live page-count caption, and the Print / Save PDF button, right-justified through `DocumentActions`. Selection is URL state (`ids`, `params`, `fit`), so a comparison is pasteable.
- `catalog-compare-print-page.tsx` - chrome-free comparison at `/catalog/compare/print`. Without `?print=1` it is a preview of exactly the pages a printer will produce; with it, the pages alone plus a `window.print()`. Toolbar: title and Back to compare left; right-justified `DocumentActions` holding Paper / Dark, Fit to one page with its caption, then Print / Save PDF last.

> **The form primitives no longer live in this file.** `SHFTextField`, `SHFNumberField`, `SHFSelectField`, `SHFMultiCheck`, `SHFCheckbox`, `SHFRowList` and `EditorFormSection` were lifted verbatim into **`frontend/src/components/shf-form/`** (`index.tsx` for the components, `styles.ts` for `labelSty` / `inputSty` / `rowSty` / `onFocus` / `onBlur`), so the PACE card editor could look like this editor rather than approximate it. Both `catalog-editor-page.tsx` and `pace-editor-page.tsx` import from there - reach for that directory before writing another field control. `SHFFreqRange` and `SHFWeight` deliberately stayed behind, since they are the two that depend on the equipment domain's own shapes. Every value comes from `catalog-tokens.css`, so any page using these primitives must import that stylesheet.

**Routes:**
```
/catalog                → CatalogPage
/catalog/compare/print  → CatalogComparePrintPage  ← must be BEFORE /catalog/compare
                                                       (else unmatched) and /catalog/:id
/catalog/compare        → CatalogComparePage       ← must be BEFORE /catalog/:id
/catalog/editor         → CatalogEditorPage        ← must be BEFORE /catalog/:id
/catalog/comms-library  → CommsLibraryPage         ← must be BEFORE /catalog/:id
/catalog/:id/edit       → CatalogEditorPage
/catalog/:id/print      → CatalogPrintPage
/catalog/:id            → CatalogSheetPage
```

**Sidebar:** "Equipment Catalog" collapsible group above Contracts - "All Equipment", "Compare", an ungated "Comms Library", and a canWriteRadio-only "Editor" item. Only the Editor is gated, because it is the one write-only screen; the Comms Library is a read surface whose panes gate themselves.

The "All Equipment" active highlight is `isCatalogBrowse`, a named boolean, rather than
`isCatalogRoute` with exclusions inlined at three call sites. It read
`startsWith('/catalog') && !includes('/edit')`, so `/catalog/compare` lit up the wrong entry the
moment that route existed. **Every sub-route added under /catalog has to be excluded there
explicitly**, which is the whole reason it is one boolean now.

The Editor link gates on **`canWriteRadio`, not `canWrite`**, and it read `canWrite` until it was
fixed. `POST /api/v1/equipment` admits `rto` and the service narrows that role to
`terminal_type = 'radio'` per record, so an `rto` writer holds a real write in this domain and had
no way into the page that performs it - the help topic for adding radio equipment documented the
`/catalog/editor` URL as the workaround. The editor still refuses that role a SATCOM draft, which
is where the narrowing belongs. Three cases are pinned in `sidebar.test.tsx`, one per answer the
flag can give.

**Header:** "Catalog" entry in the page-picker dropdown.

## Deployment notes

Photo upload and display are both handled by the backend using the container's Azure identity - no public blob access. The storage account and the `equipment-photos` container are created outside this repo; the identity the container runs as needs `Storage Blob Data Contributor` on it, and `AZURE_STORAGE_URL` is the account's blob endpoint.

If the default name `<prefix>equipment` is globally taken in the target cloud, override `azureStorageAccountName` in the environment parameter file. Storage account names are immutable after creation, so pick once and keep it.

## CSV export / import

`GET /api/v1/export/equipment` returns the catalog as CSV, filtered by the same
`terminal_type` and `search` params the list endpoint takes.
`GET /api/v1/equipment/import/template` returns the import template (no auth, like every template).
`POST /api/v1/equipment/import` bulk-creates, admin/editor/rto.

**An imported record has an empty datasheet, and that is by design.**
Bands, standard/physical/RF specs, SWAP, features, compatible services and waveforms all live in the `data` JSONB column, and a nested structure does not go in a CSV cell without inventing a convention nobody would want to fill in by hand.
So a CSV import creates a correctly named and typed record with `data = {}`, for bulk-seeding a catalog from a spreadsheet of nomenclatures; the specs are filled in afterwards in the 3-pane editor.
The template says so on its first line.
A JSON import is the honest tool for round-tripping a full record and is deliberately not built.

`data` is still exported, as compact JSON: an export that dropped it would be useless for reading the catalog outside the app, and a column that can be read but not written is exactly what a nil `Set` expresses.

Two things specific to this domain:

- **`id` is importable here and nowhere else.** An equipment id is a user-authored slug and is required on create, so its column has a real parser and appears in the template. Nothing special-cases the name; the behaviour falls out of the column carrying a `Set`.
- **The per-record radio scope is reproduced on the import path.** The catalog separates satcom from radio by a column rather than by route, so `RequireRole` cannot express "radio only" and the check happens per row. Without it, CSV would be a way around a boundary the drawer enforces (`ErrRadioScopeOnly`).

## The facet sidebar

`/catalog` carries a left column of filters - values with counts, and numeric ranges with preset
cuts plus a custom entry. It answers the question the search box cannot: someone who opens a large
catalog, does not know what any of it is, and has a requirement rather than a name.

**It is the compare page read backwards, and that is what makes it cheap.** Compare lays a declared
parameter's values out across records; a facet asks which records hold which value. `compare-params.ts`
is already the one declaration of what can be read off a record - the extractor, the SATCOM/radio
scoping, the stable URL id, the single place `na` is produced - so a facet references a param by id
and never restates any of it. `facet-params.ts` holds only what compare has no use for: bucket cuts,
curated ordering, tail truncation.

| File | What | Pure |
|---|---|---|
| `components/catalog/catalog-vocab.ts` | `SATCOM_BAND_OPTS`, `RADIO_BAND_OPTS`, `ORBIT_OPTS`, `OPMODE_OPTS`, lifted out of the editor so the facets can order by them | yes |
| `components/catalog/facet-params.ts` | `FacetSpec`, `CATALOG_FACETS`, `readFacet`, `facetValues`, bucket cuts | yes |
| `components/catalog/facet-selection.ts` | URL codec, `applyFacets`, `buildFacetModels`, `tabFacets` | yes |
| `components/catalog/FacetSidebar.tsx` | draws a `FacetModel[]` and calls back. No hooks, no URL, no filtering rule | no |

Thirteen things to know before touching it.

**Numbers come from `compareValue`, never from parsing `extract`'s string.** `formatWeight` renders
`3 lbs 4 oz`; a range filter needs 3.25. `compare-params.ts` gained `compareValue` / `compareUnit`
on the five filterable numeric params, reading the record rather than the rendered string. The
contract - `compareValue` returns null exactly when `extract` returns `blank` - is asserted over a
fixture matrix, and it is the only thing keeping the two readings of one fact in agreement.
The `lbs_oz` branch is why this is more than a conversion: `formatWeight` suppresses a zero
component, so `{weight: 0, weight_oz: 0}` renders blank and must read null rather than 0.

**A value's count excludes its own facet's dimension.** Within a facet terms OR, across facets they
AND. Counting a band against the band filter would drop every unchecked band to 0 the moment one was
checked - telling the reader that clicking Ku yields nothing at the exact moment it would *add*
records. Excluded, a count always reads as "results if this were also checked" and does not jump
when clicked. The tab and the search box are not facets; they scope the pool.

**A range filter excludes blanks, and says how many.** A record with no weight cannot satisfy "under
20 lbs". But a gap that drops out silently is a gap nobody closes, so every facet carries a counted
`Not specified` toggle that ORs the blank population back in. Same on the bool facet: `false` and
unset are different claims, so ALT-PNT is three lines, never two.

**Displaying a facet and applying it are separate decisions, and conflating them widens a link.**
A facet the pool answers one way (Orbit when every record is GEO) is a control whose only setting is
"everything", so it is not drawn. It is still *applied* when a URL carries a term for it, because
dropping it would return more records than the link promised - the same failure the stale-key rule
guards against, through a different door. Any facet with an active term is drawn regardless, so an
applied filter always has a visible way off. This was wrong for one build and the browser caught it,
not the tests.

**A term the tab does not admit is counted separately from one it applies, and that is the bug.**
`tabFacets` narrows the facet list per tab, so a radio-scoped term on the SATCOM tab is
structurally never handed to `recordMatchesFacet`. It is still kept, for the reason directly
above. What was wrong was that `activeTermCount` never saw the facet list at all, so `Filters (n)`
and `Clear (n)` counted it anyway - a claim of a filter over a grid nothing had narrowed, with no
chip to switch it off because the tab does not draw that facet. `partitionSelection` now splits the
selection into `applied` and `paused`, defined as the **complement of what `applyFacets` iterates**
rather than re-derived, and the rail names the held terms under "Held for the RADIO tab" with a
per-term clear. Three things to keep true:

- **The predicate stays structural.** A stale *value* key (`f.make=nonesuch`) is APPLIED, because `make` is admitted on every tab and really is why the grid is empty. The moment "paused" becomes value-dependent, the rail starts offering to drop terms whose removal widens the result from zero to everything.
- **`Clear` removes exactly what the number counted.** It used to return `EMPTY_SELECTION`, which destroyed a held term through a button - the destruction `tabFacets` refuses to do through a tab switch. `clearAllFacets` was deleted rather than left beside the tab-aware one.
- **The `Paused (n)` marker lives on the toolbar, not only in the rail.** The rail is unmounted while Filters is closed and starts closed below `md`, which is exactly the state a shared link lands a reader in.

**Values are derived from the records on screen.** The editor's `OPMODE_OPTS` is already contradicted
by CSV-imported rows carrying `fixed` and `on the move`, so a hardcoded list would hide records.
`spec.order` only orders what is present. Nothing is aliased - `on the move` and `COTM` stay two
values, because merging them is a data claim a display layer has no standing to make, and leaving
them apart is what makes the mess visible to someone who can fix it in the editor.

**URL grammar is `f.<facetId>=<term>,<term>`**, terms being a value key, a `min..max` range (min
inclusive, max **exclusive**, either side omissible), or `~none` for the blank population. A preset
encodes as its range rather than as a preset identity, so one filter has one URL and re-cutting a
bucket cannot break a saved link. Out-of-scope terms are kept and never written back, so
All → Radio → All restores a SATCOM filter. A value key no record carries is kept too, for the
widening reason above - which is the one place this codec is deliberately less tolerant than
`compare-selection.ts`.

**Every section collapses, they all start collapsed, and a collapsed one still declares its
filter.** Twelve facets expanded is a rail metres long that has to be walked past to reach the one
you want, so the rail opens as a list of headings and the facet names are the index. Each heading is
the collapse/expand control - the whole heading, not a small sign beside it, since a 12px target used
this often is a bad target - and the rail header carries Collapse all / Expand all. The toolbar's
Filters switch is the only way to close the rail itself. A collapsed facet with active terms prints
`n on` on its header, for the same reason a one-answer facet stays drawn while active: a working
filter always has something on screen saying so. That is what makes collapsed-by-default safe - it
hides controls and never hides an applied filter, so a shared link still explains the grid it
narrowed. The body is hidden with the `hidden` attribute, so a collapsed section's chips leave the
accessibility tree and the tab order rather than merely going invisible; the `+`/`−` glyph is
`aria-hidden` and `aria-expanded` carries the state, so a screen reader hears "Bands, collapsed"
rather than "plus Bands".

**The state tracks which sections are OPEN, not which are closed, and that is load-bearing.** The
default is then the empty set, which needs no facet list. Seeding a *collapsed* set with every facet
id would need the models, and there are none on the first render: the equipment query has not
resolved, so the set would seed empty and every section would open. That is the third appearance of
one latch in this feature - the other two were the rail's own open/closed default against
`useMediaQuery` and the custom threshold box - and inverting the set is the one fix that removes the
data dependency rather than working around it. `catalog-page.test.tsx` pins the default, because a
default nothing asserts is one a refactor can flip silently; the negative was verified by flipping
the sense and watching it go red.

**The Filters switch is the FIRST tile in the toolbar and must stay mounted on every tab.** It sits
over the rail it governs, so unmounting it slid every control behind it 88px left and moved the tabs
out from under the pointer on the click that got you there. It used to be rendered-but-disabled on
the waveforms and services tabs, which carried none of these fields; with those tabs retired there
is no disabled case left - `tabFacets` is a pure filter over the static `CATALOG_FACETS` and every
remaining tab is an equipment filter, so the guard was permanently true and was removed rather than
left reading like a live one. If a tab ever does run out of facets, `FacetSidebar` already says
"Nothing here varies enough to filter on".

**The rail's own view state lives in `catalog-page.tsx` beside `filtersChoice`, not in
`FacetSidebar`.** The rail is conditionally rendered, so closing it from the toolbar switch unmounts
it and local state would go with it - which is what happened: open a section, close the rail, reopen
it, and everything had collapsed again. (The original cause was a library tab unmounting the rail;
the tabs are gone and the toolbar switch does the same thing.) None of it is URL state: a link
pasted to a colleague should carry the filters, not the reader's view of them.

**A control that seeds itself from `useState` on first render will be wrong, because the first
render has no data.** The custom threshold box did exactly that, and the equipment query has not
resolved on mount - so there are no models, `custom` is null, and opening `?f.weight=..45` showed a
filter that was visibly narrowing the grid above a blank box claiming no threshold was set. It now
holds keystrokes-in-progress or `null` for "show the URL". This is the second control in this
feature to be caught by that exact latch; the first was the rail's open/closed default against
`useMediaQuery`.

**`minWidth: 0` on the grid column is mandatory.** `BrowseGrid` is
`repeat(auto-fill, minmax(320px, 1fr))`, and a flex item's default `min-width: auto` refuses to
shrink below its content, so without it the grid pushes the panel into a horizontal scroll instead
of reflowing to fewer columns. The rail is pinned to `calc(100vh - HEADER_HEIGHT)` with
`alignSelf: flex-start`, because `#main-content` is the scroll container; an earlier `maxHeight: 100%`
resolved against the card grid and left a 1168px rail in a 656px viewport, scrolling away.

Not facetable, and why: `swap.power` is free text (`110-240 VAC, 50/60 Hz`, `BB-2590 rechargeable`) -
there is a real battery/vehicle-DC/AC-mains facet in there, but it needs a controlled vocabulary in
the editor, not a regex here. `swap.size` is three optional dimensions answering a question ("does it
fit in a case") that is none of them. Per-band metrics are ambiguous by construction - "EIRP ≥ 50"
means *any* band or *the Ka* band - and compare already owns that. `physical_specs` / `rf_specs` are
free-typed labels with no shared key, the same reason compare refuses them.

## The Comms Library

`/catalog/comms-library` puts the four centrally-managed reference tables - waveforms, SATCOM
services, transports and platforms - on a route of their own, with a sidebar entry under the
Editor. Which library is open is URL state (`?lib=waveforms|services|transports|platforms`,
waveforms omitted as the default), so a link can name one.

Three of the four moved out of `catalog-editor-page.tsx` unchanged; platforms arrived later, with
the compatibility matrix. The move was mechanical: each pane took no props and closed over nothing
from the editor, so it was already a self-contained screen living in the wrong file.

**They are now one screen configured four ways.** `components/catalog/ReferenceLibraryPane.tsx`
owns the toolbar, the search, the add form, the three-way empty state, the inline row editor and
all five handlers; `{Waveform,Service,Transport,Platform}LibraryPane.tsx` are the configurations.
Four things to know before touching it:

- **`canWrite` is a required prop with no default, and each wrapper passes its own flag** - `canWriteRadio`, `canWrite`, `canWritePace`, `canWritePace`. That per-pane self-gating is what lets this route be ungated. A default of true would fail open into a public write surface; a default of false would fail silently closed and get "fixed" by someone passing true.
- **The shared pane owns save and delete error reporting**, and that is forced rather than chosen: it owns `editingId`, so it decides whether the editor closes, so it must await the write and branch on rejection. Create keeps an inline red note instead, so nothing double-reports. Before this, a refused save left the editor open with no message on two of the four panes, and a refused delete was invisible on three.
- **`fieldGrid` and `renderRowExtra` are optional, and platform is why.** Its form is two grids and two chip strips rather than a row of cells, so it passes no `fieldGrid` and gets no column-header strip; its row is two levels, so the chip strip is `renderRowExtra`. Those two escape hatches have tests of their own in `ReferenceLibraryPane.test.tsx`, written before platform converted precisely so the conversion could not quietly change the prop shape.
- **Two differences between the panes are deliberate and survive.** The em-dash fallback for a blank field is not uniform (waveform and service fall back on the name, transport does not, because its name is required), and platform trims only `designation` on create where the others trim every text field. The column headers used to be a third: transport's sat above the list and lined up with nothing. Since #253 they sit inside the Add form and share the inputs' grid, so they line up by construction and are drawn only for a writer; a read-only viewer sees the rows with no header strip.

`iconToolbarBtn` and `addDashedBtn` live in `components/shf-form/styles.ts` beside the field styles,
since the editor and all four panes use them. `VocabField` - the select whose last entry types a new
value - is there too, previously a copy each in the transport and platform panes.

**"Comms Library", not "RF Library".** Transports name the non-SATCOM paths a PACE tier can point
at, and the first of those is a fibre circuit - not radio frequency at all. The name has to cover
the set it actually holds.

Each pane carries a search box in its header row and its Add form above the list, not below it: the
list is the long, scrolling part, and a form under it is a form you have to scroll past everything
to reach. Search filters the binding rather than the render, so every count, separator and empty
state downstream stays honest about what is on screen - with one deliberate exception, the transport
kind dropdown, which reads the unfiltered list because searching the rows is not a statement about
which kinds exist. The route caps its width at 1280px (`comms-library-page.tsx`), up from 720px, so
the usage-names column on the waveform and service rows has room.

**The editor no longer carries the three ⊞ library buttons.** They were the only reason
`catalog-editor-page.tsx` had an `EditorPanel` state at all, so that whole switch is gone with them
and the centre pane is always the equipment form. A writer who needs to add a waveform goes to the
sidebar entry, which is visible from everywhere, instead of into the editor and then into a small
button inside it.

Three more, from when the panes first moved to this route, and still true.

**The panes are self-gating, and one of them was not.** `ServiceLibraryPane` and
`TransportLibraryPane` already gated their own write controls on `canWrite`. `WaveformLibraryPane`
had **no gate at all**, because it only ever rendered inside the editor page, which gates the whole
screen on `canWriteRadio`. Mounting it on a route anyone can open would have handed waveform create,
edit and delete to every viewer. It now gates on `canWriteRadio` - not `canWrite`, because waveforms
are radio reference data and that is the one thing an `rto` may write, matching the sidebar's Editor
link and the `rto` in `waveform/routes.go`'s writer role. Both directions are tested, and the
negative was verified by removing the gate and watching the test go red.

**That gate is what makes the route ungated.** Because every pane decides its own write affordances,
browsing is open to everyone - which is new for the Transport Library, whose contents had no readable
surface anywhere in the app before this. Waveforms and Services were at least reachable through the
browse page's chips; transports were visible only to a writer who opened the editor and knew to
click a small button.

**`isCatalogBrowse` must exclude this route**, or "All Equipment" stays lit on it. That named boolean
in `sidebar.tsx` exists precisely because each sub-route added under `/catalog` has to be excluded by
hand; `sidebar.test.tsx` now pins two of them.

**Print and share.** The library banner ends in `DocumentActions` (share then Print / Save PDF,
right-justified on the 28px content line) with `libraryExportSpec(activeLabel)`, so the active pane
exports to a `.png`, the clipboard or a `.pptx`; the pane's root carries `sheetRootProps()`, title
bar included. Print / Save PDF opens `/catalog/comms-library/print` with the same `?lib=` in a new
tab (`comms-library-print-page.tsx`), which renders `LibraryPane` with `readOnly` so the add form and
the row pencils do not print, on portrait Letter at 0.4in margins with `print-color-adjust: exact`.
The `@page` rule goes through a `<style>` appended to `document.head`, never through `sx`, for the
reason AGENTS.md records; the route is a `PrintPageShell`, the shell the compatibility and nets
print routes share. `LibraryPane` (`components/catalog/library-pane.tsx`) and the `?lib=` vocabulary
(`LIBRARIES`, `isLibraryKey`, `libraryLabel`, `libraryQuery`, `components/catalog/library-keys.ts`) are
shared by both routes, so a page module exports one component and fast refresh keeps working. The
share image is the whole pane, title bar included, minus what a reader without write access never
sees: the search box, the add form and the row pencils carry `sheetOmitProps`, the rasterizer drops
them from the clone, and the measured height gives the form's space back so the slide does not end
in a blank band.

## The comparison matrix

`/catalog/compare` puts any number of catalog records side by side on any subset of parameters.
Rows are parameters, columns are equipment, and SATCOM and radio may be mixed. No backend change:
`GET /api/v1/equipment/` already returns full records including `data`, so `useEquipment()` is the
whole data layer.

Nine files, and the split is what makes it testable - five pure pieces with no rendering to mock,
one hook that exists only to measure, and three renderers that each know only their own surface:

| File | What |
|---|---|
| `components/catalog/compare-params.ts` | The one declaration of a comparable parameter. Pure |
| `components/catalog/compare-selection.ts` | The URL codec and row visibility. Pure |
| `components/catalog/compare-page-guides.ts` | Column-seam and column-width maths - where a printed page divides across, and how tight to draw the grid. Pure |
| `components/catalog/compare-pagination.ts` | `paginateRows`: measured row heights in, printed row pages out. Pure |
| `components/catalog/compare-palette.ts` | The `DARK` and `INK` `--cmp-*` color schemes (+ test asserting contrast). Pure |
| `components/catalog/use-print-pagination.tsx` | Mounts the hidden twin, measures it, and hands every surface the one pagination answer |
| `components/catalog/CompareMatrix.tsx` | The screen renderer, which knows nothing about equipment |
| `components/catalog/CompareSheet.tsx` | The print-only table renderer |
| `components/catalog/CompareControls.tsx` | The two picker panels |

Five things to know before touching it.

**A blank cell and an `n/a` cell are different claims, and the whole feature rests on the
difference.** `n/a` says the parameter does not exist for that kind of equipment, so the empty cell
is final. Blank says it does exist and nobody filled it in, which is a gap someone can close.
Collapse the two and every real gap in the catalog hides behind a legitimate-looking answer, which
is exactly what would make mixing the two terminal types worthless. `catalog-compare-page.test.tsx`
pins it with one record of each kind in a single assertion.

**Note the glyphs, because the datasheet spends "N/A" on the other meaning.**
`StandardSpecsTable`, `SwapBlock` and `FrequencyTable` all print `N/A` for *no value*. So the matrix
prints `EMPTY_VALUE` for blank and a lowercase `n/a` for inapplicable. Reusing the sheet's token
here would give one string two readings across two pages of one catalog.

**`extract` never returns `na`.** Applicability is decided once, by `cellFor`, from `appliesTo`
against the record's `terminal_type`. Each extractor therefore has exactly one job and the rule is
tested once instead of once per parameter. An extractor that branched on `terminal_type` itself
would be the place that rule silently drifts, and a test asserts none of them does.

**Per-band rows are generated from the selection, not enumerated.** A static cross product is six
SATCOM bands times four metrics plus four radio bands times two, nearly all of it empty for any
real selection. `bandCompareParams` emits one row per (band, metric) pair that some selected record
actually populates, with ids shaped `band:ka:eirp`. Two consequences: the parameter list depends on
the columns, and deselecting a column can remove a row's reason to exist. Both are handled the same
way a deleted record is, by dropping the id silently rather than erroring. There is still a static
`Bands` row listing names, because "what bands at all" should not need six derived rows to answer.

**Units are rendered as entered.** Weight has three modes (`lbs`, `oz`, `lbs_oz`), radio range has
mi/km, radio bands have MHz/GHz, and none of it is normalized. This cut does no numeric comparison,
sorting or best-value emphasis, so a normalized number buys nothing and loses something: `3 lbs 4
oz` is what the vendor sheet says, and rewriting it to `3.25 lbs` is a claim the catalog never
made. **The moment highlighting or sorting arrives that reverses**, and the place for it is a
`compareValue` field beside `extract`, not a rewrite of the extractors.

### `physical_specs` and `rf_specs` are deferred, not forgotten

Both are `SpecRow[]` keyed on a user-typed `label` with no normalization anywhere in the codebase,
so "Operating Temp", "Operating Temperature" and "Op Temp" are three rows and one concept. A
normalizing key does not fix that, it hides it: lowercasing merges two of the three and leaves the
third standing alone, so the matrix shows two authoritative-looking rows and neither is complete. A
matrix wrong in a way the reader cannot see is worse than one that does not have those rows.

The honest fix is upstream and is a different change: a label autocomplete in the editor over
labels already in use, or promotion of the recurring ones into `standard_specs`. The parameter
picker says so in one line, so a reader who knows a record carries "Operating Temp" is told why it
is absent rather than concluding the page is broken.

Because the parameter list is already `static ++ generated`, adding a `specRowParams(selection)`
generator later touches neither the renderer, the picker, nor the URL format.

### Why the pickers are chips rather than the CSV checklist

`common/csv/csv-checklist.tsx` exports `Section`, `ChecklistGrid`, `ChecklistOption` and
`ToggleAll`, and reuse would normally be the rule. It is not reused here, for a checkable reason:
those are MUI controls that take their colour from the app theme, while every surface under
`/catalog` is a hardcoded `--shf-graphite-900`. Under the light theme they render dark-on-dark.
Toggle chips are also the idiom Section 03 of the editor already uses for the same
pick-many-from-a-library job, so amber-fill-means-selected already means something to the reader.

### Print and export

`/catalog/compare/print` is a preview page with its own Paper / Dark toggle and Print / Save PDF
button, and the live page's Print / Save PDF button opens it without `print=1`, so the palette is
chosen before the dialog opens rather than defaulting to paper. Its toolbar puts the title and Back
to compare left and, right-justified, Paper / Dark, Fit to one page with a caption saying what Fit
did, then Print / Save PDF - the same order every printable page uses: settings that change what
the output looks like sit immediately left of the actions, and share then Print are the last two
controls, through `DocumentActions` in `components/common/sheet-export` (this preview passes no
export spec, so here Print stands alone; the live matrix carries the share trigger). (It used to centre the
Print chip between equal flex blocks and put the settings flush right; the convention replaced
that.) It is a separate route from the live matrix rather than a print stylesheet layered over it,
the same choice `/catalog/:id/print` and `/pace/:section/print` already made.

**`CompareSheet.tsx` renders a real HTML `<table>`, not the CSS grid `CompareMatrix.tsx` draws on
screen.** A browser repeats `<thead>` on every printed page for free, and `tr { break-inside: avoid
}` is honoured consistently across print engines, where CSS grid fragmentation is not - Chrome and
Firefox disagree on where a grid item may break, which is exactly the ambiguity a printed
comparison cannot afford. So the screen and the print sheet are two renderers over one selection,
not one component styled two ways: rows and group headings never split across a page, and columns
are never split either.

**Columns are balanced across pages, and `compare-page-guides.ts` is what keeps the on-screen
vertical guides and the printed page in agreement.** Its `seamIndices` decide where a page divides
from the column count alone, so 9 columns at 6 per page print as 5 and 4, not 6 and 3 - every page
fills edge to edge instead of leaving the last one nearly empty. The red dashed vertical "Page edge"
guides drawn on the live matrix read the same function, so what the reader sees on screen is what
the printer will do, not an approximation of it that could quietly drift from the paper.

**Row breaks are decided once, off a real measurement, and every surface reads that one decision
back - print, the preview captions and the live page's horizontal guides alike.** This replaced a
guess: the live matrix used to measure its own SCREEN row heights and snap a guide to the nearest
boundary under `PAGE_H`, which was wrong on two counts at once - screen rows are taller than print
(compact density, no repeated photo strip, no repeated thead subtracted from the budget) - so the
guide could point at a fold the printer would never actually make. `use-print-pagination.tsx` now
mounts a hidden, off-screen `twin`: one full `CompareSheet` per column chunk, at print density and
print width, with `CompareSheet` marking every group heading and param row with
`data-print-key="g:<group>"` / `data-print-key="r:<param.id>"` and its `<thead>` and photo strip with
`data-print-part`. A `ResizeObserver` over that twin (plus a re-measure once `document.fonts.ready`
settles, since a fallback font's metrics are rarely the display font's) feeds the measured heights to
`paginateRows` in `compare-pagination.ts`, a pure function: rows and group headings are atomic, a
heading may never end a page (its first row moves with it, or - opening an otherwise-empty page -
both are allowed to overflow together rather than orphan the heading forever), and an item taller
than a whole page goes alone and overflows rather than loop. `PAGE_SAFETY` (4px) is subtracted from
the usable page height first, because the first Fit attempt at this spilled a row anyway from
sub-pixel rounding across twenty-odd measured heights.

**The twin's heights are read raw, and must never be divided by `zoom`.** The twin models a zoomed
page by being laid out WIDE - `width: PAGE_W / zoom` - and is not itself scaled, so its boxes are
already in the unzoomed layout units the pagination budget is expressed in. An early version divided
by the current zoom as though the twin were scaled, which is a no-op with Fit off (zoom is 1) and
silently wrong the moment Fit engages: the reported total becomes `T / zoom`, so `fitScale` returns
`pageH * zoom / T`, an iteration with no fixed point unless `T` happens to equal `pageH`. It does not
settle on the right scale - it walks to the `FIT_FLOOR` clamp or back to 1, re-measuring at every
step. Nothing local catches this, because the ten seeded dev records fit on one page and hold zoom at
1; it only appears against content tall enough to paginate.

Every printed page is now one `(column chunk, row page)` pair, each its own `<table>` with its own
`<thead>` via `CompareSheet`'s `rowKeys`/`showPhotos` props - the browser decides no row break at
all, where it used to be left to `tr { break-inside: avoid }` alone. The preview's captions name the
real pages ("Page 3 of 4 (columns 6-10, Identification to Weight)"), reading group/param labels back
off the same `g:`/`r:` keys. The live page passes `usePrintPagination`'s `rowPages` down as
`printBreakKeys` (every row page's first key, except the first page - there is nothing above it to
guide the reader past) to `CompareMatrix`, which keys its own on-screen rows with `data-row-key` and
draws each horizontal guide at the measured screen-y of that key rather than snapping to an assumed
row height. `snapToRows` is gone.

**One number, `PRINT_MARGIN_IN`, drives both the `@page` rule and the page geometry**, so the two
cannot disagree the way they could if each were tuned on its own: `PRINT_PAGE_CSS` derives the
physical page margin from it, and `PAGE_W` / `PAGE_H` (1008 x 768, the printable box at 96dpi)
derive the on-screen guide positions from that same value.

**An `@page` rule written inside an emotion `sx` object is emitted nested inside a class rule,
which every browser silently ignores.** That is what broke the first print: `catalog-tokens.css`'s
own `@page { size: letter portrait; margin: 0 }` won by default, and the landscape comparison sheet
printed on portrait paper with no error anywhere to read. `PRINT_PAGE_CSS` is injected through a
real `<style>` element instead, the same fix `pace-print-page.tsx` already uses for this trap.

**Browsers drop background colours when printing by default**, which is why the Paper palette
cannot lean on backgrounds for legibility - it is dark text, outlined chips, and a light grey zebra
that still reads against unprinted white, with amber kept to a single top rule. Dark printing needs
the opposite: the on-screen graphite ground and zebra stripe are real backgrounds, so the Dark print
path forces them with `print-color-adjust: exact` rather than trust the reader's print dialog to
have "background graphics" already on.

**Two palettes, `DARK` and `INK`, are semantic `--cmp-*` custom properties in
`compare-palette.ts`.** `DARK` is used on screen and by the digital exports, and reproduces the
original graphite exactly, so turning the toggle to Dark changes nothing anyone already saw on the
live matrix. `INK` is paper-only. A unit test asserts WCAG contrast for every text/ground pair in
both schemes, because a palette that only fails contrast in the one mode nobody previewed is exactly
the kind of defect that ships unnoticed.

**Features is not a comparable parameter.** Feature titles are free text written per record, so the
row never lined one value up against another; it read as a column of unrelated phrases. It was
removed after reviewing the printed sheet, and a record's features stay on its datasheet. An old
`?params=features` link simply drops the id, as with any unknown parameter.

**Five things settled by printing real PDFs rather than reading the code**, each invisible to a
unit test:

- **Rows are vertically centred and values horizontally centred** under the centred equipment names,
  with row labels left. Top alignment printed every small mono label above the larger value beside
  it, and baseline did not level them either. A table cell always fills its row, so `middle` is
  exact here in a way it cannot be on the screen grid.
- **The photo strip is skipped on a page where no column has a photo.** The screen keeps an empty
  well for uniformity; on paper a row of identical NO PHOTO boxes cost about an inch per page and
  said nothing. Row padding is also half the screen's, since paper is the scarce axis.
- **The photo well is framed only when there is no photo.** The border was unconditional,
  inherited from the screen, where a dark ground makes it a subtle slot. The well is full cell
  width while `objectFit: contain` fits the image into a fixed height, so on anything but a
  perfectly proportioned landscape shot the printed sheet drew a grey box around two margins of
  white paper with a small picture stranded in the middle. Kept for a record with **no** photo,
  which is the one case where it works: it is what makes an empty slot read as a slot rather than
  as a gap someone forgot to fill. An image already states its own bounds.
- **Only the sheet is visible in print.** Anything fixed-position the app mounts beside the route
  (the React Query devtools toggle in dev, a toast) otherwise printed in the corner of every page.
- **The print effect marks itself done at the moment it prints, not when its async chain starts.**
  Marking up front meant StrictMode's dev remount cancelled the only chain while the ref claimed it
  had printed, so in dev the dialog never opened. A test renders under `StrictMode` to pin it.

**The PNG, clipboard and PowerPoint export beside the toggle always stays dark, whichever palette
the preview currently shows** - it captures what the screen already looked like before this page
had a Paper option, not the print palette. `compareExportSpec` in `sheet-specs.ts` is the first
export spec here with no fixed size: it measures the marked grid at click time, and only the grid,
never its viewport-wide scroll wrapper, which would crop off-screen columns out of the capture.
Filename stem is `compareStem()` in `sheet-export.ts`, `signal-suite-equipment-comparison`.

**Print always renders at `printDensity`, a second, tighter tier from `compare-page-guides.ts` -
never `compareDensity`, which stays screen-only.** With every parameter selected, a single-line row
at screen density printed about 0.34in tall and only around twenty rows fit a landscape Letter page.
Paper can afford to run smaller than the screen's readability floor because it is read differently:
arm's length, at 300+dpi print resolution, on a surface that holds contrast a backlit display does
not need to - so `printDensity`'s 9.5px value text (about 7pt) stays legible where it would not in
the app. `CompareDensity` also now carries `line`, the row line-box height, so a print tier can
shrink that alongside `value` and `label`; the screen matrix keeps it at `17` in every tier, which is
what makes this addition invisible there.

**A value that would wrap shrinks to stay on one line before it is ever allowed to wrap, down to a
floor - and never truncates.** `fitTextScale(natural, available)` in `compare-page-guides.ts` is the
whole rule: shrink to `available / natural`, but not past `FIT_TEXT_FLOOR` (80%); past that, wrap
instead. Power's `110-240 VAC, 50/60 Hz` was the value that forced this - paper has no hover `title`
to recover a clipped string with, so truncation was never on the table as an outcome. `CellValue`'s
scalar kinds (`text`, `num`, `bool`) render through an internal `FitLine` span behind a `fit` prop,
default `false` so the screen matrix is untouched; it measures its own `scrollWidth` against its
parent table cell's content width with a `ResizeObserver`, and re-measures only past a 0.5% change so
it cannot oscillate against its own resize. The `list` (chip), `na` and `blank` kinds are unchanged -
chips already wrap between each other, which needed no new floor.

**"Fit to one page" is a second, independent shrink - the whole sheet, not one value - and it uses
`zoom`, never `transform`, and it is now shared URL state, `FIT_PARAM`, between the live page and
the print preview rather than a preview-only toggle.** A reader who turns it on while still looking
at the live matrix sees the same choice reflected when they open Print / Save PDF, and `toggleFit` on
both pages holds it to the same off-is-never-spelled-out-in-the-URL asymmetry `ink` already used.
`usePrintPagination` computes it from the SAME twin measurement row pagination reads: with Fit off,
`zoom` is 1 and the pagination budget is `PAGE_H - PAGE_SAFETY`; with Fit on, `zoom =
min(fitScale(total, PAGE_H - PAGE_SAFETY), columnFitScale(n))` where `total` is headH + firstExtra +
every measured row's height and `n` the column count, and the pagination budget becomes `(PAGE_H - PAGE_SAFETY) / zoom` - everything scaled by the
same factor, so it is the same row pagination in unzoomed units either way. Because the twin renders
at `PAGE_W / zoom`, a zoom change re-lays it out and the hook re-measures, converging within a pass
or two behind the same >0.5%-change guard `FitLine` already uses to avoid oscillating against its own
resize. `zoom` is used deliberately over a CSS `transform: scale()`: print paginates a page from its
layout boxes, and a transformed element still occupies its original, unscaled box for that purpose,
so a scaled-down sheet would still break exactly where the unscaled one does; `zoom` actually resizes
the box the print engine paginates against, and each page wrapper's `width` is set to `PAGE_W / zoom`
alongside it so the zoomed content keeps filling the full printable width rather than shrinking into
a corner of it. The print effect waits for `usePrintPagination`'s `measured` flag (or a 3-second
timeout, so an environment that can never lay anything out still prints) before its fonts/images/two-
`requestAnimationFrame` chain, so the pages it prints are the pages the measurement actually decided.

**Fit fits both axes, and the live page says what it did (2026-09-16).** Fit used to shrink rows
only, so a wide comparison came out two pages across with Fit on or off, and the compare page read
only the row breaks off the hook, so toggling it there changed nothing visible. `columnFitScale(n)`
in `compare-page-guides.ts` is the column half, pure arithmetic: a page at zoom `z` is `PAGE_W / z`
wide and holds `floor((PAGE_W / z - LABEL_COL) / MIN_COL)` columns, so every column fits when `z <=
PAGE_W / (LABEL_COL + n * MIN_COL)` - 0.73 for ten columns, the floor for eleven. The hook takes the
smaller of the two axes, lays the twin out at `PAGE_W / zoom`, and paginates columns against that
width, which is what collapses two column pages into one. It also returns `pageCount`, column pages
times row pages; the compare page prints "prints on N pages" (and "at 73%" once Fit engages) beside
its toggle and leaves the matrix full size - it is a working view - while the preview's toggle says
"at 73%" or "still 2 pages at 70%". The tests that existed asserted URL plumbing and nothing
rendered, which is how a toggle shipped that a reader could not see working.

## Slide export

The datasheet exports to a `.png`, the clipboard, or a `.pptx` slide, from a share control beside
the amber `Print / Save PDF` button on `/catalog/:id` and on the preview branch of the print page.
The same control the PACE card carries; see `pace.md` for why it is per-page rather than in the
header with the CSV controls.

**The marker goes on the 816x1056 page box in the two pages, not on `DataSheet.tsx`'s
`<article>`.** The page box is what the print CSS produces, so capturing it means the export cannot
drift from print, and it honours the scale slider for free. Putting the marker on the `<article>`
would put two of them on the catalog editor page, which mounts a second `DataSheetView` in its live
preview, and would reintroduce the exact ambiguity the bare `document.querySelector('article')` in
`catalog-print-page.tsx` already has.

The export passes `transform: 'none'` to cancel the cosmetic `viewZoom` the page box carries.
That zoom comes from a `ResizeObserver` fitting the sheet to the window, and `html-to-image` copies
the computed transform onto its clone, so without cancelling it the same click produces a
differently scaled picture at different window widths. The article's own print scale is *inside*
that box and is left alone, which is what makes the export honour the slider.
It also passes `overflow: 'hidden'`, matching print: a datasheet taller than one page spills on
screen and print clips it, so the export follows print or a slide would carry content the printed
sheet drops.

### This sheet stays a picture, deliberately

The PACE card's `.pptx` carries native editable text. This one does not, and the asymmetry is a
judgement about this sheet's construction rather than a gap:

- **Roughly 100 to 120 non-text shapes would have to be synthesised.** 70 to 95 of the hairlines
  are `border-bottom` on text-bearing divs rather than elements of their own, plus fill rectangles,
  four reticle brackets, the photo-well graph-paper gradient and a bullet square per feature.
- **The effective type size varies with the record.** `autoScale` is
  `Math.min(PAGE_W / SHEET_W, PAGE_H / contentHeight, 1)`, so a dense record shrinks the whole
  sheet and a 14px paragraph lands at 11.2pt on a short record and around 7pt on a long one. Every
  emitted run's size would be a computed value, known only after a font-load and measure cycle.
- **Rows align on a shared baseline.** `alignItems: 'baseline'` on every spec row has no PowerPoint
  equivalent; a text box anchors top, middle or bottom.
- **Three CSS properties have no DrawingML expression**: `textTransform: uppercase` at 15 sites
  (the string would have to be upcased, so what the reader edits stops matching the record),
  `fontVariantNumeric: 'tabular-nums'` in five numeric columns, and `wordBreak: 'break-word'`.

The likelier route, if this is ever wanted, is not transcribing the DOM but regenerating from
`EquipmentData` into real PowerPoint tables: `FrequencyTable`, `SpecTable`, `StandardSpecsTable`,
`SwapBlock` and `CompatibilityMatrix` all have fixed column schemas in code, which gets the borders
for free and sidesteps the baselines entirely. That is a slide *generator* rather than an export of
what is on screen, and it would not match the printed sheet.

### The watermark, removed rather than supplied

`DataSheet.tsx` used to render `<img src="/signal-suite-logo.png">` - a 460px, 7%-opacity, grayscale mark
bleeding off the right edge. **That file was never in the repo.** Not deleted at some point:
`git log --all -- '*signal-suite-logo*'` returns nothing, so it was never committed at all. The `<img>`
arrived with the catalog's own first commit, which means every datasheet ever rendered
here carried a broken image, on screen and in print, in every environment.

It was removed rather than drawn, because the sheet does not need branding and a decorative element
nobody has ever seen is not a regression to restore. Nothing changed visually.

Two things it had already cost, both worth keeping in mind because neither pointed at the logo:

- **It broke the slide export outright.** `html-to-image` substitutes an empty `src` for a resource
  it cannot fetch, and an `<img src="">` inside the serialized SVG makes Chrome fail the whole
  outer image, so the export produced *nothing at all* rather than a picture with a gap.
  `inline-blob-images.ts` swaps broken images for a transparent pixel before capture and restores
  after. **That workaround stays and is not dead code**: an equipment delete drops the blob before
  the row on purpose, so a partially-failed delete leaves a record whose `photo_url` names an image
  that is gone, and that sheet still has to export. Same for `wait-for-sheet.ts`'s `allSettled`,
  where the consequence of a broken image is a hang rather than an error.
- **It was the sole named justification for `img-src 'self'`** in `middleware.go`'s CSP. The
  directive is unchanged - `'self'` is the tightest source that still admits a bundled asset - but
  the comment no longer claims a same-origin image the app does not have.

If branding is ever wanted back, note the print interaction that was never wired: `waitForImages()`
in `catalog-print-page.tsx` is called only when `equipment.photo_url` is set, so an image the sheet
always carries would need that gate made unconditional or it can lose the race and be absent from
the printed sheet.

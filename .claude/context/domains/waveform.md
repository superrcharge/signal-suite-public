# Waveform domain

Global Waveform Library - a centrally managed reference table that governs all waveform definitions across the Equipment Catalog. Editors maintain waveforms here once; radio equipment records link to them by abbrev via toggle chips in the Section 03 editor panel.

**Waveforms reach PACE through a tier's capability abbreviation, not through nets.** The `nets.waveform_abbrev` link was dropped in migration `030_drop_net_waveform.sql` and has not come back. What exists instead: a PACE tier whose source is a radio stores that radio's waveform abbrev in `pace_tiers.service_abbrev`, and `loadTiers` resolves it against the equipment record's `data->'waveforms'` snapshot. The tile then prints the waveform's `name` spelled out, so editing a full name here changes what a printed comms card says. See `pace.md`.

## Backend

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

Unique constraint is case-insensitive on `abbrev` - "SATCOM" and "satcom" are the same waveform.

**Domain layout:** `backend/internal/domain/waveform/`
- `model.go` - `Waveform`
- `errors.go` - coded `*Error` values implementing `response.CodedError`: `ErrWaveformNotFound`, `ErrWaveformAbbrevExists`, `ErrWaveformInternalError`
- `dto/request.go`, `dto/response.go`
- `repository.go` - `FindAll(ctx)`, `FindByID`, `Create`, `Update`, `Delete`, `AbbrevExists`, `AbbrevExistsExcluding`
- `service.go` - `ListWaveforms`, `CreateWaveform`, `UpdateWaveform`, `DeleteWaveform`, plus `SetAudit` and `diffWaveform`
- `repository_mock.go`, `service_test.go`
- `handler.go` - standard CRUD handlers
- `routes.go` - registers routes
- `validation.go`

**Writes record audit events.** `SetAudit` is wired in `main.go` and the handler captures `ActorID`; create / update / delete each record a `"waveform"` `ResourceType` event, and update carries a `diffWaveform` payload.
They previously left no trail at all - for eight releases this domain and Transports were the only two that mutated without recording, which nothing reported because `recordAudit` is nil-tolerant by design.
`Delete` reads the row before removing it, because `the abbrev` is unrecoverable once the row is gone.
See `.claude/context/domains/audit.md` for the parity tests that now hold this.

There is no `GetWaveform` service method and no `GET /:id` route.
`FindByID` exists but is only used internally by update and delete.

## API

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/v1/waveforms` | any authenticated | Returns all waveforms, `ORDER BY lower(abbrev) COLLATE natural_sort ASC` |
| GET | `/api/v1/waveforms/usage` | any authenticated | `{usage: {abbrev: [names]}, total}` - every equipment record and platform carrying each abbrev, keys lowercased and trimmed, an uncarried abbrev **absent** rather than empty. Reads the same `usageMap` merge as the delete guard. 500 on a lookup failure, never an empty map |
| POST | `/api/v1/waveforms` | admin, editor or **rto** | `abbrev` is required and must be unique (case-insensitive) |
| PATCH | `/api/v1/waveforms/:id` | admin, editor or **rto** | Partial update - nil fields ignored |
| DELETE | `/api/v1/waveforms/:id` | admin, editor or **rto** | 409 `WAVEFORM_IN_USE` when any equipment record or platform carries the abbrev |

`rto` writes the whole domain: waveforms are radio reference data, so no per-record
scoping is needed here. See `authz.md`.

> **Deletion is blocked when an asset carries the abbrev, and a rename is carried to the carriers.** Both landed together, and both reverse what this file said before it, which was that neither was guarded.
>
> The reason there was nothing to guard is that assets store the abbrev as **text, not as a foreign key** - `equipment.data->'waveforms'[].abbrev` and `platforms.waveform_abbrevs` - so the database refuses nothing and every check has to live in the service. `contracts.WaveformAssets` is how it gets there: implemented by the equipment and platform services, consumed by this one, wired in `main.go`. `contracts.WaveformLookup` is its mirror, letting platforms reject an abbrev the library does not declare. Together they close both directions, the shape `NetLookup`/`NetUsage` already uses for nets and wheels.
>
> Three things to keep true:
>
> - **A usage-lookup failure blocks the delete.** A lookup that errored has not established that the waveform is unused, and treating it as unused turns an outage into silent data loss. The nets guard makes the same choice and its test pins it; so does this one.
> - **Carriers are renamed BEFORE the library row.** The two live in different domains behind different repositories, so no transaction spans them - which makes the *order* the safety property. Fail in this direction and every asset still points at a name that exists; do it the other way and a failure strands them all, which is the state the guard exists to prevent. Same reasoning as the photo-blob "blob before row" rule in `equipment.md`.
> - **A pure case change is not a rename.** `AbbrevExistsExcluding` compares on `lower()`, so `anw2` -> `ANW2` reaches the cascade; `strings.EqualFold` skips it, because rewriting every carrier to say what it already says is pure cost.
>
> **An orphan is still reachable on a radio, and the matrix no longer draws it.** Equipment create and update take `data` as raw JSON and do not check `data.waveforms[].abbrev` against the library - out of scope, and deliberately so. The equipment editor only offers library chips and the equipment CSV import carries no waveforms, so from the UI the state cannot be made; a raw API write can still make it. `/catalog/compatibility` used to draw such an abbrev as a struck-through row; since the matrix rows became exactly the library, it gets no row, and the equipment editor's orphan chip is where such an entry is seen and removed.
>
> Historical note, because it reads like a contradiction otherwise: a nets↔waveform link existed briefly on the PACE branch - `nets.waveform_abbrev`, protected by a 409 - and migration `030_drop_net_waveform.sql` removed all of it. That guard protected an enforced FK; this one protects a text reference, so it is a different mechanism rather than a restoration. `migrations/040_create_platforms.sql:33-44` still argues for tolerating orphans, and is left alone as a record of what was true when it was written: the tolerance it describes existed to survive rename and retirement, and both are now handled directly.

## Frontend

**Types:** `frontend/src/types/waveform.ts`
```ts
interface Waveform {
  id: string;
  abbrev: string;
  name: string;
  description: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}
interface ListWaveformsResponse { waveforms: Waveform[]; total: number; }
interface CreateWaveformRequest { abbrev: string; name?: string; description?: string; }
interface UpdateWaveformRequest { abbrev?: string; name?: string; description?: string; }
```

**Service hooks:** `frontend/src/services/waveform-service.ts`
- `useWaveforms()` - list query, key `queryKeys.waveforms.list()`
- `useWaveformUsage()` - usage query, key `queryKeys.waveforms.usage()`; read by `WaveformLibraryPane` as `usage?.usage[abbrev.trim().toLowerCase()] ?? []` and rendered by `UsageCount` / `UsageNames` from `ReferenceLibraryPane.tsx`
- `useCreateWaveform()` / `useUpdateWaveform()` / `useDeleteWaveform()` - each invalidates `queryKeys.waveforms.all` on success, which covers `usage()` because it nests under `all`

Query key factory: `queryKeys.waveforms.all` is `['waveforms']`; `queryKeys.waveforms.list()` is `['waveforms', 'list']`; `queryKeys.waveforms.usage()` is `['waveforms', 'usage']`.

**Usage is derived from other tables, so their writes invalidate it.** Equipment create/update/delete/photo and platform create/update/delete all invalidate `queryKeys.waveforms.usage()` explicitly (`equipment-service.ts`, `platform-service.ts`). Changing a record's Section 03 waveforms changes the answer while leaving `waveforms.all` untouched, so without that the pane shows a count that was true a moment ago.

**There is no waveforms browse tab any more.** `/catalog?type=waveforms` was a read-only view of
this library sitting inside the equipment browse page: a Cards/Matrix toggle, a per-waveform list of
the radios carrying it, a global waveform x radio coverage grid, and an `Edit library` link out. It
is gone, along with `WaveformGrid`, `WaveformMatrix` and `waveform-index.ts`. The Comms Library
browses and edits this table in one place, so a second read-only surface was two places to look for
one fact; the catalog tabs are now only `all`, `satcom` and `radio`, which are all `terminal_type`
filters over equipment.

`/catalog?type=waveforms` **redirects** to `/catalog/comms-library` rather than falling through to
the All tab, which would land someone on the equipment grid with a stale `?type=` in the address bar
and nothing saying the list they asked for had moved. `catalog-page.test.tsx` pins the redirect with
a `LocationProbe`, because `renderWithRoute` mounts the element under a `MemoryRouter` with no
`<Routes>` - a `<Navigate>` there changes the location and leaves the same element mounted, so
asserting "nothing rendered" would really be asserting the fallback.

**What was lost with it, and what came back.** Three things went: the per-waveform usage count, the
named reverse index of which assets carry each waveform, and the coverage grid where a gap reads as
an empty column.

**The first two returned in the pane itself**, rather than as a second matrix on
`/catalog/compare` as originally planned - the surface changed because the question is a library
one. Each row shows how many assets carry it and names them, reading `GET /api/v1/waveforms/usage`.
At `md` and up the names are a column on the row's own line (`UsageNames layout="column"`, a
fixed-basis cell kept even when empty so the column edge stays straight), which keeps every row one
even line; below `md` they fall back to a strip beneath the row, where a 30% column would stack the
chips one per line. The page is capped at 1280px rather than 720px so that column has room.
Descriptions get two lines at a fixed height (`NameAndDesc`), drawn even when empty, which is what
keeps every row the same height; longer text clamps and shows in full as the tooltip.
**The coverage grid did not come back and is not planned**; `/catalog/compatibility` answers the
adjacent question for platforms and radios.

The facet rail's `wf` facet was never a substitute and still is not - facet values come from the
equipment pool, so a waveform no radio carries never appears at all, which is exactly the case a
usage readout exists to surface. That is why the readout is keyed off the library and not the pool.

**Waveform Library pane** (`components/catalog/WaveformLibraryPane.tsx`, mounted by `/catalog/comms-library`):
- It used to live inside `catalog-editor-page.tsx`, reached by a ⊞ button that swapped it into the centre column. It is now a component of its own on the Comms Library route, which any authenticated user can open; see `equipment.md`'s "The Comms Library" section.
- **It gates its own write controls on `canWriteRadio`.** While it only rendered inside the editor it had no gate at all, which was correct there and would have handed waveform create, edit and delete to every viewer the moment it moved. A gate inherited from a parent is not a gate the component has.
- Full list of waveforms with inline create / edit / delete, a search box over abbrev, name and description, and the Add form above the list; abbrev is the canonical identifier. The abbrev input carries `maxLength` (`WAVEFORM_ABBREV_MAX`, 50), and name and description share the fixed two-line `NameAndDesc` cell every pane uses
- Section 03 of radio equipment uses **toggle chips** sourced from this library: amber = selected, outline = not selected. Waveform abbrevs stored in `equipment.data.waveforms[].abbrev`.
- **Orphan chips:** if an equipment record's `data.waveforms` contains an abbrev not present in the global library (e.g. from a legacy free-text era), it renders as a dim gray chip with an ✕ so the editor can remove it.

## Relationship to Equipment domain

The waveform domain is independent - it does not import from equipment and equipment does not import from waveform at the DB level. The link is purely by `abbrev` string in the `data` JSONB column of `equipment`.

In the editor's Section 03b (Compatibility Matrix), each `CompatibilityComparison` entry carries a `waveforms: string[]` field (abbrev strings) - a subset of the compared radio's own Section 03 waveforms. These are populated automatically when a radio is toggled on in the editor (pre-population from that radio's `data.waveforms`) and are also keyed by `equipment_id` for inventory-linked comparisons.

See `equipment.md` for full details on the compatibility matrix, `CompatibilityComparison` type, and the PATCH `data` full-replace gotcha.

## CSV export / import

`GET /api/v1/export/waveforms`, `GET /api/v1/waveforms/import/template`, `POST /api/v1/waveforms/import` (admin/editor/rto, matching the rest of the domain).

The identity is **`abbrev`, not `name`**: it is what the PACE sheet and the equipment editor chips key on, and what the uniqueness constraint is built around.
A file repeating an abbrev already stored is a row error, compared case-insensitively.

Rows are inserted one at a time rather than through a bulk path.
A reference library is dozens of rows, `Create` already carries the uniqueness handling, and a row that fails at the database becomes a row error - the same partial-success model the caller already handles.

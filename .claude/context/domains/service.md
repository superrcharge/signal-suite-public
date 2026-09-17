# Service domain

Global Services Library - a centrally managed reference table of SATCOM services (GX, WGS, Best Effort, …). Editors maintain services here once; SATCOM equipment records link to them by abbrev via toggle chips in the Section 03 editor panel.

The SATCOM-side twin of the Waveform Library. Read `waveform.md` first if you have not - this file documents mainly where the two differ, and they differ in three places that matter.

**`name` is printed on PACE comms cards.** A tier tile spells the service out - "Inmarsat Global Express", not "GX" - reading `name` from the equipment record's own services snapshot, so editing a service's full name here changes what a squadron's printed sheet says. `abbrev` is still what the catalog datasheet's narrow Service column prints, and is unaffected. There is no separate vendor field: the operator is conventionally the prefix of `name`, which is what the editor's own "Inmarsat Global Express" placeholder documents. See `pace.md`.

## Backend

**Migration:** `backend/migrations/026_create_services.sql`

```sql
CREATE TABLE services (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  abbrev      TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL DEFAULT '',
  updated_by  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX services_abbrev_lower_idx ON services (lower(abbrev));
```

Unique constraint is case-insensitive on `abbrev` - "GX" and "gx" are the same service.

**The same migration backfills the library** from every abbrev already typed into `equipment.data->'services'`, guarded by `jsonb_typeof(...) = 'array'` and collapsed with `DISTINCT ON (lower(trim(abbrev)))`, keeping the spelling that carried the longest name. Without the backfill, every pre-existing SATCOM terminal would have read as an orphan on day one, because services were free text before this table existed. The Down migration drops the table and never touches the equipment JSONB.

**Domain layout:** `backend/internal/domain/satcomservice/`

The package is `satcomservice`, not `service`, for the reason `radionet` is not `net`: `service.Service` reads as nothing, and the entity would collide with the layer. Entity type is `SatcomService`; the layer type is `Service`, matching `waveform.Service`.

- `model.go` - `SatcomService`
- `errors.go` - coded `*Error` values implementing `response.CodedError`: `ErrServiceNotFound`, `ErrServiceAbbrevExists`, `ErrServiceInternalError`
- `dto/request.go`, `dto/response.go`
- `repository.go` - `FindAll(ctx)`, `FindByID`, `Create`, `Update`, `Delete`, `AbbrevExists`, `AbbrevExistsExcluding`
- `service.go` - `ListServices`, `CreateService`, `UpdateService`, `DeleteService`, plus `SetAudit`
- `repository_mock.go`, `service_test.go`
- `handler.go` - standard CRUD handlers
- `routes.go` - registers routes
- `validation.go`

There is no `GetService` service method and no `GET /:id` route, matching waveforms. `FindByID` exists but is only used internally by update and delete.

**Three things the mature domains do that this one now does too:**

- **A unique-violation on `abbrev` maps to 409, not 500.** `AbbrevExists` / `AbbrevExistsExcluding` lose the race to a concurrent insert, so `repository.go` inspects `pgconn.PgError` for SQLSTATE `23505` and returns `ErrServiceAbbrevExists` - the same shape `radionet` already had. Pinned by tests on both create and update.
- **Writes record audit events.** `SetAudit` is wired in `main.go` and the handler captures `ActorID`; create / update / delete each record a `"service"` `ResourceType` event. They previously left no trail at all.
- **`Create` uses `RETURNING id`.** The default `gen_random_uuid()::text` is generated in the database, so `RETURNING` is what carries it back. Reading the row back afterwards by abbrev could return a different row than the one just written.

Repository `errors.Is` for `pgx.ErrNoRows` matches every other repository.

**One thing goes in `shared/contracts/`, and it reads rather than guards.** `contracts.ServiceAssets` lets this domain ask which catalog terminals offer each service without importing the equipment domain. It has **one** method and **one** implementer, where the waveform side's `WaveformAssets` has three and two - a service has no rename cascade, no delete guard, and no platform carrier.

No table references a service, so there is still nothing to guard: `TestDeleteServiceIsNotGuarded` pins that a delete stays unrefused, deliberately. The waveform side guards because the compatibility matrix depends on every carried name being lookupable; a service has no such consumer.

(This paragraph twice said the opposite. It once cited waveforms as the counter-example on the strength of an enforced `nets.waveform_abbrev`, which migration 030 deleted; it then said "waveforms have no contracts either now", which a later change made false by reintroducing `contracts/waveform.go`. The live example of a two-way enforced reference is still `contracts.NetLookup` / `NetUsage` between `radionet` and `pace`.)

## API

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/v1/services` | any authenticated | Returns all services, `ORDER BY lower(abbrev) COLLATE natural_sort ASC` |
| GET | `/api/v1/services/usage` | any authenticated | `{usage: {abbrev: [nomenclatures]}, total}` - every catalog terminal offering each abbrev, via `contracts.ServiceAssets` (equipment only). Same key rules as the waveform endpoint: lowercased, trimmed, absent when unused. 500 on a lookup failure |
| POST | `/api/v1/services` | admin, editor | `abbrev` is required and must be unique (case-insensitive) - **409** `SERVICE_ABBREV_EXISTS` when taken, including when the pre-check loses a race |
| PATCH | `/api/v1/services/:id` | admin, editor | Partial update - nil fields ignored |
| DELETE | `/api/v1/services/:id` | admin, editor | Hard delete, never refused |

> **Difference 1 - the writer gate excludes `rto`.** The waveform routes gate on `admin, editor, rto` because waveforms are radio reference data. Services are the SATCOM side of the catalog split, where `rto` writes nothing else in the app, so the gate is `admin, editor` and the frontend uses `canWrite` rather than `canWriteRadio`. Copying the waveform gate would have granted `rto` its first SATCOM write.

> **Difference 2 - deletion is never blocked.** A service's only reference is the denormalized abbrev inside `equipment.data`, which the catalog already tolerates going orphan. (Waveforms **are** guarded: a delete is refused when an equipment record or platform carries the abbrev, and a rename is carried to the carriers. The difference is therefore open again, on a different argument than the one it closed on - waveforms are carried by two asset kinds and the compatibility matrix depends on every carried name being lookupable, where a service has no such consumer.) Deleting a service leaves removable gray chips in the Section 03 editor, exactly as an orphaned waveform does. `TestDeleteServiceIsNotGuarded` pins this so a future guard has to be a deliberate change.

## Frontend

**Types:** `frontend/src/types/service.ts`
```ts
interface Service {
  id: string;
  abbrev: string;
  name: string;
  description: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}
interface ListServicesResponse { services: Service[]; total: number; }
interface CreateServiceRequest { abbrev: string; name?: string; description?: string; }
interface UpdateServiceRequest { abbrev?: string; name?: string; description?: string; }
```

`Service` (library entry) sits beside the pre-existing `EquipmentService` (per-terminal copy) exactly as `Waveform` sits beside `EquipmentWaveform`.

**Service hooks:** `frontend/src/services/service-library.ts`
- `useServices()` - list query, key `queryKeys.services.list()`
- `useServiceUsage()` - usage query, key `queryKeys.services.usage()` (`['services', 'usage']`); read by `ServiceLibraryPane` the same way as the waveform readout. Equipment writes invalidate it explicitly; platform writes do not, because platforms carry no services
- `useCreateService()` / `useUpdateService()` / `useDeleteService()` - each invalidates `queryKeys.services.all` on success, which covers `usage()`

The filename breaks the `<domain>-service.ts` convention on purpose: `service-service.ts` inside `src/services/` reads as nothing.

**There is no services browse tab any more.** `/catalog?type=services` mirrored the waveforms tab -
a Cards/Matrix toggle, a per-service list of the SATCOM terminals offering it, a global service x
terminal coverage grid, and an `Edit library` link gated on `canWrite`. It is gone with
`ServiceGrid`, `ServiceMatrix` and `service-index.ts`, for the reason `waveform.md` gives: the Comms
Library browses and edits this table in one place, and the catalog tabs are now only the three
`terminal_type` filters.

`/catalog?type=services` **redirects** to `/catalog/comms-library?lib=services`, so the deep link
still names the right library rather than the Comms Library's waveforms default.

**What was lost, and what came back.** Three things went: the per-service usage count, the named
reverse index of offering terminals, and the coverage grid.

**The first two returned in the pane itself**, reading `GET /api/v1/services/usage` - each
row shows how many catalog terminals offer it and names them, in a column on the row's line at `md`
and up and beneath it below, exactly as the waveform pane does (see `waveform.md`), and each row's
name and description share the same fixed two-line `NameAndDesc` cell. **The coverage grid did not**, and
there is no plan for one: a boolean cross-tab would discard the CIR/MIR rates that are the whole
reason two terminals on one service differ, and a service has no platform column source the way a
waveform does. The facet rail's `svc` facet is not a substitute either - its values come from the
equipment pool, so a service nothing offers never appears.

**Service Library pane** (`components/catalog/ServiceLibraryPane.tsx`, mounted by `/catalog/comms-library`):
- It used to live inside `catalog-editor-page.tsx`, reached by a ⊞ button below the waveform one that swapped it into the centre column. Both buttons and the `EditorPanel` state behind them are gone; the pane is now a component of its own on the Comms Library route. See `equipment.md`'s "The Comms Library" section.
- **The pane's write controls gate on `canWrite`, and the pane itself does not.** This was the one place the frontend was looser than the backend: the editor admits an `rto` writer because `POST /api/v1/equipment` does, and that role then reached a working-looking `+ Add Service` and per-row ✎ / ✕ that `satcomservice/routes.go` rejects with a 403. It now reads the library and writes nothing in it. The gate is `canWrite` rather than the editor's `canEditDraft` - a draft's `terminal_type` says nothing about who may edit global SATCOM reference data - and self-gating is what lets the Comms Library route be open to everyone.
- Full list of services with inline create / edit / delete, a search box over abbrev, name and description, and the Add form above the list; abbrev is the canonical identifier. The inputs carry `maxLength` (`SERVICE_ABBREV_MAX` / `SERVICE_NAME_MAX` / `SERVICE_DESC_MAX`, matching the DTO's `max=50` / `100` / `250`), so a field stops accepting characters rather than the save being rejected.
- Section 03 of SATCOM equipment uses **toggle chips** sourced from this library. Toggling on appends `{ abbrev, name, description }` copied from the library entry; toggling off filters by abbrev.
- **Difference 3 - chip matching is case-insensitive**, unlike the waveform chips, which compare `abbrev` exactly. The backfill keeps only one spelling per abbrev, so an exact test would report a terminal that typed "gx" as an orphan of the library's "GX". Both the active test and both filters normalize with `trim().toLowerCase()`.
- **Orphan chips:** an abbrev in `data.services` with no library match renders as a dim gray chip with an ✕, same as waveforms.

### Why the chips did not replace the row list

`EquipmentService` is richer than `EquipmentWaveform` - it also carries `cir`, `mir`, and `best_effort`. Those are **per-terminal**, not per-service: two terminals on the same GX service have different committed rates. So the library row stays `abbrev / name / description`, and Section 03 keeps an `SHFRowList` beneath the chips holding the rate fields, the Best Effort checkbox, and the ▲/▼ reorder.

Ordering is the reason the row list survives at all: `data.services[]` array order **is** the row order of the datasheet Services table. Chips alone would have made it click order.

Within a row, `abbrev` and `name` are now read-only labels - the library owns them. `description` stays editable per terminal, so pre-existing terminal-specific wording is not overwritten by the backfilled library text.

`SHFRowList` gained optional `newItem` / `addLabel` for this; omitting both drops the dashed footer button, since services are added by chip.

### The form primitives are shared now, not editor-local

`SHFRowList` and its siblings no longer live in `catalog-editor-page.tsx`. They were lifted verbatim into **`frontend/src/components/shf-form/`**:

- `index.tsx` - `SHFTextField`, `SHFNumberField`, `SHFSelectField`, `SHFMultiCheck`, `SHFCheckbox`, `SHFRowList`, `EditorFormSection`
- `styles.ts` - `labelSty`, `inputSty`, `rowSty`, `onFocus`, `onBlur`. Separate from the components because react-refresh requires a module to export only components; mixing constants in costs Fast Refresh and fails the repo's `--max-warnings 0` lint.

Consumed by **both** `catalog-editor-page.tsx` and `pace-editor-page.tsx` - that second consumer is why the extraction happened, so the PACE card editor could look like this editor rather than approximate it. Check this directory before writing a new field control.

`SHFFreqRange` and `SHFWeight` deliberately stayed in `catalog-editor-page.tsx`: they are the two that depend on the equipment domain's own shapes (`band`, `swap`). Every value in `styles.ts` comes from `catalog-tokens.css`, so a page using these primitives must import that stylesheet.

## Relationship to Equipment domain

Independent at the DB level, exactly like waveforms: the link is the `abbrev` string inside the `data` JSONB column of `equipment`.

**`equipment.data.services[]` did not change shape.** Same five keys, same optionality, same order. Only the way it gets populated changed, from typing to checking a chip. That is what keeps `HeroBlock`'s 4-column `Service / Description / CIR / MIR` table, the paper-colored quick-ID chips in `BrowseGrid`, and the catalog search haystack rendering exactly as before - none of them were touched, and `HeroBlock.test.tsx` passes unmodified as the proof.

See `equipment.md` for the PATCH `data` full-replace gotcha: a script that PATCHes only `{"data":{"services":[…]}}` erases bands, specs, swap, and features.

## CSV export / import

`GET /api/v1/export/services`, `GET /api/v1/services/import/template`, `POST /api/v1/services/import` (admin/editor - rto is not a SATCOM writer, matching the rest of the domain).

Identity is `abbrev`, for the same reason as waveforms: it is what the chips and the sheet key on.

# Transport domain

Global Transport Library - the third centrally managed reference table, alongside the Waveform Library and the Services Library. It names the non-SATCOM paths a PACE tier can point at: a fibre circuit, a cellular plan, a MANET mesh, or whatever else a squadron actually runs.

A tier on a comms card is usually a terminal from the Equipment Catalog, but an alternate or a contingency often is not. Before this library those had nowhere to live, so a squadron typed them free-hand and twelve squadrons spelled "cellular" twelve ways. Naming an entry once and picking it from a list is what makes it reference data rather than prose.

## Backend

**Migration:** `backend/migrations/033_create_transports.sql`

```sql
CREATE TABLE transports (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'other',
  provider    TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL DEFAULT '',
  updated_by  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX transports_kind_idx ON transports (kind);
CREATE UNIQUE INDEX transports_name_lower_idx ON transports (lower(name));
```

Two things differ from the waveform table this mirrors:

- There is **no `abbrev` column.** `Waveform` carries both an abbrev and a name; a transport has only a name, so the case-insensitive unique index sits on `lower(name)` rather than `lower(abbrev)`. "Verizon LTE" and "verizon lte" are the same entry.
- `kind` is an **open vocabulary**, not a closed set. There is no CHECK constraint, and `DefaultKinds` in `model.go` is a starting list of four (`fiber`, `cellular`, `manet`, `other`), not an allow-list. A squadron running a path nobody anticipated adds its own kind rather than filing it under `other` and losing the distinction.
- What is enforced is **shape, not membership**: `IsValidKind` requires 40 characters or fewer matching `^[a-z0-9][a-z0-9 -]*$`, so a category name cannot become a pasted paragraph or render as markup. A malformed kind is a coded 400, not a 500 from a failed insert.
- The consistency a closed set would have given is bought back by `NormaliseKind`, which lowercases, trims and collapses internal whitespace. `Cellular`, `  CELLULAR  ` and `cellular` all store as `cellular`, so the list cannot fill with one kind spelled three ways. An empty kind normalises to `other` rather than erroring.
- `hf` was in the original five and was removed. It is still storable as a custom kind like any other, it is simply no longer offered by default.

**Domain layout:** `backend/internal/domain/transport/`
- `model.go` - `Transport`, plus `DefaultKinds`, `NormaliseKind`, `IsValidKind` (shape) and `IsDefaultKind` (presentation only)
- `errors.go` - coded `*Error` values implementing `response.CodedError`: `ErrTransportNotFound`, `ErrTransportNameExists`, `ErrTransportInvalidKind`, `ErrTransportInternalError`
- `dto/request.go`, `dto/response.go`
- `repository.go` - `FindAll(ctx)`, `FindByID`, `Create`, `Update`, `Delete`, `NameExists`, `NameExistsExcluding`
- `service.go` - `ListTransports`, `CreateTransport`, `UpdateTransport`, `DeleteTransport`, plus `resolveKind` (normalise then shape-check), `SetAudit` and `diffTransport`
- `repository_mock.go`, `service_test.go`
- `handler.go` - standard CRUD handlers
- `routes.go` - registers routes
- `validation.go` - message formatters only, matching waveform

**Writes record audit events.** `SetAudit` is wired in `main.go` and the handler captures `ActorID`; create / update / delete each record a `"transport"` `ResourceType` event, and update carries a `diffTransport` payload.
They previously left no trail at all - for eight releases this domain and Waveforms were the only two that mutated without recording, which nothing reported because `recordAudit` is nil-tolerant by design.
`Delete` reads the row before removing it, because `the name` is unrecoverable once the row is gone.
See `.claude/context/domains/audit.md` for the parity tests that now hold this.

As in the waveform domain there is no `GetTransport` service method and no `GET /:id` route. `FindByID` exists but is only used internally by update and delete.

An empty `kind` on write is defaulted to `other` rather than rejected, so a client that does not care about the category still gets a usable row. Anything non-empty is normalised and then shape-checked; it does not have to be one of the defaults.

## API

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/v1/transports` | any authenticated | Returns all transports, `ORDER BY lower(name) COLLATE natural_sort ASC` |
| POST | `/api/v1/transports` | admin, editor, rto or planner | `name` is required and must be unique (case-insensitive); 409 on duplicate, 400 on a bad `kind` |
| PATCH | `/api/v1/transports/:id` | admin, editor, rto or planner | Partial update - nil fields ignored |
| DELETE | `/api/v1/transports/:id` | admin, editor, rto or planner | Hard delete, never refused |

**Writers are admin, editor, `rto` and `planner`**, the same set as nets, PACE and platforms (`transport/routes.go`). This file used to say `rto` was deliberately absent; the routes admit it. A `viewer` receives 403 on every write. See `authz.md`.

The role gate is passed before the handler on every write route, because Fiber runs only `Handlers[0]` and a trailing gate would never execute.

## Frontend

**Types:** `frontend/src/types/transport.ts`
```ts
type TransportKind = string;                          // open vocabulary, deliberately not a union
const DEFAULT_TRANSPORT_KINDS: TransportKind[];       // fiber, cellular, manet, other
function transportKindLabel(kind): string;            // built-in label, else title-cased
function transportKindOptions(inUse): TransportKind[];// the four defaults plus every kind in use
interface Transport { id, name, kind, provider, description, created_by, updated_by, created_at, updated_at }
interface ListTransportsResponse { transports: Transport[]; total: number; }
interface CreateTransportRequest { name: string; kind?: TransportKind; provider?: string; description?: string; }
interface UpdateTransportRequest { name?: string; kind?: TransportKind; provider?: string; description?: string; }
```

`transportKindLabel` is not decoration. Without it a kind prints as its raw column value, so MANET reads "manet" on a sheet a squadron hands to aircrew. Kinds outside the built-in four are title-cased, so a custom `line of sight` reads `Line Of Sight`.

`transportKindOptions` is what makes the vocabulary self-extending: it returns the four defaults plus every kind already present in the library, so a kind one person adds becomes a suggestion for everyone after them. No separate kinds table and no extra endpoint; the list the pane already fetched is the source.

Both the types and the two constants are re-exported from `frontend/src/types/index.ts`. That barrel is a **named** re-export list, not `export *`, so anything added to `transport.ts` is unreachable through `@/types` until it is named there explicitly.

**Service hooks:** `frontend/src/services/transport-service.ts`
- `useTransports()` - list query, key `queryKeys.transports.list()`
- `useCreateTransport()` / `useUpdateTransport()` / `useDeleteTransport()` - each invalidates `queryKeys.transports.all` on success

Query key factory: `queryKeys.transports.all` is `['transports']`; `queryKeys.transports.list()` is `['transports', 'list']`.

The update hook calls `apiClient.patch`, matching the `PATCH` route. This mirrors `waveform-service.ts`; a `PUT` here would 405.

**Transport Library pane** (`components/catalog/TransportLibraryPane.tsx`, mounted by `/catalog/comms-library`):
- One of four panes, beside `WaveformLibraryPane`, `ServiceLibraryPane` and `PlatformLibraryPane`. The first three used to live in `catalog-editor-page.tsx`, reached by ⊞ rail buttons that swapped one into the centre column; those buttons and the `EditorPanel` state behind them are gone. All four are now configurations of `ReferenceLibraryPane` - see `equipment.md`'s "The Comms Library" section, which documents the shared screen and what each wrapper still owns.
- **This is the domain the move mattered most for.** Transports have no browse tab - a chip row does not grow a fourth entry gracefully - so before the Comms Library route existed, the only way to read this table at all was to hold a write role, open the editor and know to click a small button. It is now readable by anyone the app admits.
- Full list with inline create, edit and delete. Each row shows name, kind label, provider and description; the create row carries a name field, a `VocabField`, a provider field and a description field, and sits above the list. Name, provider and description carry `maxLength` (`TRANSPORT_NAME_MAX` 120, `TRANSPORT_PROVIDER_MAX` 120, `TRANSPORT_DESC_MAX` 500), so a field stops accepting characters rather than the save being rejected. The column headers sit inside the Add form and share the inputs' grid, so they line up with the inputs and are shown only to a writer. The rows beneath are a flex strip of name+description / 90px / 110px in their own order, and name and description share the fixed two-line `NameAndDesc` cell every pane uses.
- **Those write controls gate on `canWritePace`**, matching the transport routes: a transport is a non-SATCOM path a PACE tier names, and nothing in the equipment domain has ever referenced one, so the writer set follows the card rather than the catalog. This file previously said `canWrite`, which was wrong in both directions - it excluded the `rto` and `planner` roles the routes admit. `authz.md`'s pane table is the authority. The pane stays readable, since reads are open to every role, and each pane gating itself is what lets the Comms Library route be ungated.
- **The search box filters the rows; the kind dropdown deliberately reads the unfiltered list.** Which kinds the library holds is not a claim the search is making, so hiding a row must not withdraw its kind from the picker. `comms-library-page.test.tsx` pins this with a custom kind - a built-in one cannot show it, since the four defaults are offered whether any row uses them or not.
- `VocabField` (`components/shf-form/VocabField.tsx`) is a `<select>` whose last entry is `+ Add new kind…`, carrying the sentinel value `__add__`. Choosing it swaps the select for a text input so a kind outside the list can be typed. This mirrors the `__create__` / `Create section…` entry in the Section select on `terminal-drawer.tsx`. It was `KindField` here plus a near-copy in the platform pane; the wording of that last entry is a prop rather than a constant, because `help-content.test.ts` keys a written exception on this exact literal - the step names an `<option>`, not a button.
- A `<datalist>` combobox was tried first and rejected: typing filters the suggestions away exactly when the user wants to see them, so the list appeared not to open at all.
- A custom kind already on the record is appended to the options when rendering, or the select would silently blank a value it does not recognise.
- Delete prompts first, and says that removing a library entry leaves existing PACE cards unaffected.

## Relationship to the PACE domain

Nothing in the PACE domain references transports yet. Wiring the library into the PACE tier pickers, including the `pace_tiers.transport_id` foreign key, is `_project/plans/pace-tier-options.md`.

This domain is independent in the same way the waveform domain is: it imports nothing from equipment or pace, and neither imports from it.

## CSV export / import

`GET /api/v1/export/transports`, `GET /api/v1/transports/import/template`, `POST /api/v1/transports/import` (admin/editor).

**`kind` carries no enum on the CSV path**, because `DefaultKinds` is a suggestion rather than a closed set - a squadron running a path nobody anticipated adds its own.
The column leans on `NormaliseKind` instead, so `"  Line Of Sight "` imports as `line of sight` and the list cannot fill up with the same kind spelled three ways.
A blank kind becomes `other` rather than a row error, matching what the drawer does: a client that does not care about the category still gets a usable row.

# Nets domain (Nets Library)

**Per-squadron** library of radio nets - name, net ID, TX/RX frequencies, ROIP, and the
radio that carries them. Each squadron keeps its own; nets are referenced by that
squadron's PACE Planner channel wheels, so a net's frequency is entered once and never
retyped per channel.

The Go package is **`radionet`**, not `net`, so it does not shadow the standard library's
`net` package. The table, the API path, and the UI all say "nets".

## Backend

**Migrations:** `024_create_nets.sql` created the table; `028_scope_nets_to_section.sql`
made it per-squadron; `029_add_net_roip.sql` added `roip`; `030_drop_net_waveform.sql`
removed `waveform_abbrev`. The current shape:

```sql
CREATE TABLE nets (
  id              UUID          NOT NULL PRIMARY KEY,
  section         VARCHAR(50)   NOT NULL REFERENCES sections(key) ON UPDATE CASCADE,
  name            VARCHAR(100)  NOT NULL,
  net_id          VARCHAR(50)   NOT NULL DEFAULT '',
  radio_type      VARCHAR(10)   NOT NULL DEFAULT 'both',   -- jem | mpu5 | both
  tx_freq         VARCHAR(60)   NOT NULL DEFAULT '',       -- freeform
  rx_freq         VARCHAR(60)   NOT NULL DEFAULT '',       -- freeform
  freq_unit       VARCHAR(4)    NOT NULL DEFAULT 'MHz',    -- MHz | GHz
  roip            BOOLEAN       NOT NULL DEFAULT FALSE,
  description     TEXT          NOT NULL DEFAULT '',
  notes           TEXT          NOT NULL DEFAULT '',
  created_by      VARCHAR(200)  NOT NULL DEFAULT '',
  updated_by      VARCHAR(200)  NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX nets_section_name_unique ON nets (section, LOWER(name));
CREATE INDEX idx_nets_section    ON nets (section);
CREATE INDEX idx_nets_net_id     ON nets (net_id);
CREATE INDEX idx_nets_radio_type ON nets (radio_type);
```

### Uniqueness is per squadron, and that is the headline

`nets_section_name_unique` is on `(section, LOWER(name))`, **not** on `LOWER(name)` alone.
(That is 028's index; 042 replaced it with `nets_section_theater_name_unique`, described under theater below, which keeps the per-squadron rule and adds the theater.)
Two squadrons may each have a FIRES; neither may have two. Migration 028 exists for
exactly this: every squadron previously shared one global pool, so A SQD editing FIRES'
frequency changed it for B SQD too. Net names are commonly shared (FIRES, CMD, ASLT)
while the frequencies and channels behind them are not.

The table is deliberately **not** a shared vocabulary. A squadron types its own net names;
nothing is centrally approved. What prevents retyping is the durable-record shape: a
channel points at a net, so changing a net's frequency updates every channel showing it,
and moving it between channels carries the frequency along.

**028 clears the table.** Both its Up and its Down `DELETE FROM channel_assignments` and
`DELETE FROM nets` first, because no row can survive a change in what uniqueness means,
in either direction. Reseed with `make seed-nets`. See `scripts/seed-dev-nets.mjs` and
its guards before running it.

`section` is a FK to `sections(key)` with `ON UPDATE CASCADE`, and is deliberately **not
updatable** through the API: a net does not move between squadrons, it is recreated.

### The two identifiers are easy to confuse

- **`id`** is the UUID primary key (`uuid.New().String()`). Machine-only - it is what
  `channel_assignments.net_id` points at, and what PATCH/DELETE key off.
- **`net_id`** is the human-facing label an RTO writes on a sheet (`N01`, `W01`). Free
  text, indexed but **not unique**, and not a key of anything.

**The UI calls `net_id` "Channel #", and the field is still `net_id` everywhere else.**
Radio operators call that value a channel, and a row carrying both `name` and something
called a net ID made one net look like it spanned two values.
The rename is display-only: the table header, the drawer field, the wheel's accessible
table and the export dialog's column picker.
The DB column, the JSON key, the Go field and the CSV header row are all unchanged, so no
export, import or API consumer moved.
Note what this means for `validation.go` - its `case "ID"` message, "net ID is required",
is about the UUID above and not about the channel number, so it correctly stayed as it was.

The primary key is deliberately radio-agnostic because `radio_type` can be `both`: keying
a net by radio would force a genuinely shared net to exist twice, which is the duplication
this library exists to prevent.

### Three modelling decisions worth knowing

**TX/RX are freeform text, not numerics.** A net is recorded as a range
(`225.000 - 399.975`) or a placeholder word as readily as a single figure; a numeric
column would reject the majority of real entries. Both share one `freq_unit` - a net
does not transmit in MHz and receive in GHz. Clearing a frequency is just an empty
string, so the update DTO needs no `clear_*` flag.

**`radio_type` includes `both` as a first-class value.** A net that genuinely runs on
both radios must not have to be entered twice. `CarriedBy(netRadioType, radio)` in
`model.go` is the single place that rule lives; `both` matches either wheel. This is the
column the PACE domain reads to refuse an MPU5-only net on a JEM channel.

**`theater` is tri-state, `conus | oconus | both`, the same shape as `radio_type`** (042).
A net used in both theaters is entered once and appears in either list.
Empty on create is `conus`, not `both`: a caller that predates theaters is describing the only theater there was.
Unknown values are `NET_INVALID_THEATER` (400).

The uniqueness rule has two layers, and they are deliberately different:

- **The index is exact.** `nets_section_theater_name_unique` is on `(section, theater, LOWER(name))`, so a CONUS FIRES and an OCONUS FIRES coexist - which is the whole point, since the frequencies behind a name differ by theater.
- **The service refuses more.** `NameExists` and `NameExistsExcluding` take the theater and match any same-name net whose theater OVERLAPS (`theater = $3 OR theater = 'both' OR $3 = 'both'`), because a `both` FIRES beside a `conus` FIRES would both appear in the CONUS list. The index is the floor a race cannot get under; the service rule is what a reader would call a duplicate. `UpdateNet` applies a theater change before the name check and re-checks when either moved, since moving a net into a theater where its name is taken is the same collision as renaming onto one.

Whether a net may sit on a card is `contracts.TheaterCarries`, applied by the PACE domain; this domain only declares the value.
`InfoByIDs` selects it so `NetsByIDs` can carry it across.

**`roip` is per net, not per channel** (029). Whether a net is carried over IP rather than
RF alone is a property of the net itself, so a card can show at a glance which nets are
ROIP'd without the flag being restated on every position that carries them.

> **There is no waveform on a net.** Migration 030 dropped `waveform_abbrev` along with
> its write-time validation and the reverse delete guard. The field did not earn its place
> in net configuration, which left the column, the validation, and the guard all serving
> nothing - and dormant machinery reads as intentional to whoever finds it next. The
> Waveform Library itself is untouched; equipment still references it, which is where
> waveforms earn their keep. Nothing in `shared/contracts/` links the two.

**Domain layout:** `backend/internal/domain/radionet/`
- `model.go` - `Net`, `ValidFreqUnits`/`IsValidFreqUnit`, `ValidRadioTypes`/`IsValidRadioType`, `CarriedBy`
- `errors.go` - coded `*Error` values implementing `response.CodedError`, plus the
  `ErrNetInUse(plans)` constructor
- `dto/request.go`, `dto/response.go`
- `repository.go` - `FindBySection`, `FindByID`, `NameExists`, `NameExistsExcluding`,
  `SectionExists`, `Create`, `Update`, `Delete`, `InfoByIDs`
- `repository_mock.go` - hand-rolled `MockRepository` (outside `_test.go`, so it is importable)
- `service.go`, `handler.go`, `routes.go`, `validation.go`, `helpers.go`
- `service_test.go` - table-driven, stdlib `testing` only

There is no `FindAll`. Every read is scoped to a squadron, so `FindBySection(section)` is
the only list method, and `SectionExists` is checked before it - an unknown section is a
404, not an empty list. `NameExists`/`NameExistsExcluding` both take `section` as their
first argument, mirroring the index.

**Errors are coded, not `errors.New`.** `ErrNetNameExists` etc. implement
`GetCode()`/`GetStatus()`, so the shared envelope renders a real code. A plain
`errors.New` falls through to `INTERNAL_ERROR` and would tell a user "internal server
error" when what actually happened is a duplicate name.

## API

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/v1/nets/:section` | any authenticated | That squadron's nets, `ORDER BY lower(name) COLLATE natural_sort ASC` |
| POST | `/api/v1/nets/:section` | admin, editor, **rto** or **planner** | `name` required, unique per squadron and theater (case-insensitive; a `both` net overlaps either theater, by the two-layer rule above) |
| PATCH | `/api/v1/nets/id/:id` | admin, editor, **rto** or **planner** | Partial update - nil fields ignored |
| DELETE | `/api/v1/nets/id/:id` | admin, editor, **rto** or **planner** | Refused with 409 when the net is on a wheel |

There is no unscoped `GET /api/v1/nets` and no unscoped `POST` - a per-squadron library has
no "all nets" to list and nowhere to create a net without naming its owner. Update and
delete key off the net's own id, which already carries its section.

> **`id` is effectively a reserved section key.** `GET /api/v1/nets/:section` is a
> wildcard, so the literal `/id/` segment that PATCH and DELETE use is only distinguishable
> from a section named `id` by which method arrived. Harmless today, because no section is
> keyed `id`, but a trap for whoever adds one: the card-bearing sections are not a fixed set
> but every section with `sections.pace_enabled` (migration 036, seeded true for `asqd`,
> `bsqd`, `csqd`, `dsqd` and `fsqd`), so a section keyed `id` would make `GET /nets/id` collide.

`rto` is included deliberately: the PACE Planner is the product RTOs maintain, and `planner`
writes nets as one of the four domains that role exists for (`radionet/routes.go`). The
frontend gate is **`canWritePace`**, not `canWrite` - `canWrite` is admin/editor only
and would hide every control from exactly the role this is built for.

**Error codes:** `NET_SECTION_NOT_FOUND` (404), `NET_NOT_FOUND` (404), `NET_NAME_EXISTS`
(409), `NET_IN_USE` (409), `NET_INVALID_FREQ_UNIT` (400), `NET_INVALID_RADIO_TYPE` (400),
`NET_INVALID_THEATER` (400), `NET_INTERNAL_ERROR` (500).

`theater` rides in the body on create and update, like `radio_type`, and `GET /api/v1/nets/:section`
keeps returning every net the squadron has: the theater lists are filtered on the client, as the
radio tabs are.

### Deletion is guarded in both layers

`channel_assignments.net_id` is `ON DELETE RESTRICT` (migration 025), so the database
refuses to let a net vanish out from under a printed comms card regardless of what the
service does. The service check exists to return something **useful**: `DeleteNet` calls
`contracts.NetUsage.CountAssignmentsForNet`, and when the count is non-zero it calls
`PlansUsingNet` and returns `ErrNetInUse(plans)` - 409 with a message naming the wheels,
e.g. `it is on A SQD JEM, A SQD MPU5`. If naming the wheels fails, the delete still
refuses; a failure to build the message must not downgrade into a successful delete.

## Frontend

**Types:** `frontend/src/types/net.ts` - `Net`, `NET_FREQ_UNITS`, `NET_RADIO_TYPES`,
`NET_RADIO_TYPE_LABELS`, `carriedBy()`, plus `ListNetsResponse`, `CreateNetRequest` and
`UpdateNetRequest` (a `Partial<CreateNetRequest>`).

**Frequency formatting:** `frontend/src/types/net-format.ts` - `formatNetFrequency(tx, rx, unit)`.
Lives here, not in the wheel, because the wheel, the library table, and the printed sheet
must read identically; two implementations had already drifted apart once. Rules: a
simplex pair collapses to one figure, a differing pair reads `TX x / RX y`, and the unit
is only appended when there is a digit for it to qualify (`TBD MHz` is nonsense).

**Service hooks:** `frontend/src/services/net-service.ts` - `useNets(section)`,
`useCreateNet`, `useUpdateNet`, `useDeleteNet`. Query keys `queryKeys.nets.all` and
`queryKeys.nets.list(section)` - the key carries the section, since there is no combined
list to cache.

Every mutation invalidates **both** `queryKeys.nets.all` and `queryKeys.pace.all`. The
PACE card endpoint JOINs `nets` and returns the resolved name and frequencies, so with the
app's 5-minute `staleTime` a corrected frequency would keep printing at the old value for
minutes with nothing on screen to say so - on a card someone prints and flies with. The
`pace` root rather than one section, because nothing client-side guarantees which cards
reference a given net.

### Pages

| Route | File | What it is |
|---|---|---|
| `/nets` | `pages/nets-index-page.tsx` | Squadron picker - there is no combined list to land on |
| `/nets/:section` | `pages/nets-page.tsx` | That squadron's library |

`nets-index-page` uses `components/pace/SectionPicker`, shared with `/pace` - both are
"pick a squadron, then work on its thing", and both list exactly the card-bearing
squadrons (`sections.pace_enabled`, migration 036; see `pace.md`).

`nets-page.tsx`:
- **JEM / MPU5 tabs**, held in the URL as `?radio=`. A `both` net appears under each tab
  rather than being duplicated. Tab counts include shared nets.
- **CONUS / OCONUS**, held in the URL as `?theater=oconus` with the default deleted rather
  than written (the comms library's `?lib=` convention), read through `parseTheater` in
  `components/pace/theater.ts`. The control is `components/pace/TheaterSwitch.tsx`, the same
  component the card page carries in the same place, so it is learned once. The list is
  `carriedBy(radio) && inTheater(theater)`, the tab counts are within the theater, switching
  keeps `radio` and drops `drawer`/`id`, and Print and the export label carry both. A new net
  from the drawer starts in the theater on screen (`NetDrawer`'s optional `theater` prop). The
  table gains a **Theater** column beside Carried by, for the same reason that column exists:
  a `Both` net shows under either list.
- The table carries a centre-aligned **ROIP** column, holding the **ICE mark**
  (`components/common/ice-mark.tsx`) where the flag is set and `EMPTY_VALUE` where it is
  not. The column survived a proposal to move the mark beside the net name: the mark
  carries no words and not every reader knows it on sight, so the column header is what
  teaches it. One fact, one place - not both.
- Drawer state is URL-driven (`?drawer=add`, `?drawer=edit&id=`), matching terminals and
  kits - that is what lets a `?drawer=add` link open the add drawer. The header's **Add Net**
  no longer deep-links here: it opens its own drawer in place (see below).
  The edit lookup resolves against *all* nets for the squadron, not the filtered tab, so a
  deep link still opens a net that belongs to the other radio. Terminals and kits go one step
  further and fall back to a by-id fetch, which nets does not need precisely because it loads
  a whole section rather than a page: here a miss really does mean the net is gone.
- **Both dead-end drawer URLs are said out loud**, sharing one warning `Alert`. An
  `?drawer=edit&id=` resolving to nothing is one; a `?drawer=add` reaching a user without
  `canWritePace` is the other. An add link is shareable, so a viewer can arrive at one from
  an rto's URL and find the drawer gated shut, which without a message reads as the page
  being broken rather than as a permission boundary.
- The empty row carries the add hint, "Use Add Net at the top of the page", gated on
  `canWritePace`. The header's Add Net button is gated the same way, so an ungated hint
  would send a viewer looking for a button that is not on their screen. The page heading is
  just `<SQD> - Nets Library`: instructions belong where the user is stuck, not in the title.

### The header's Add Net button

In `components/layouts/header.tsx`, gated on `canWritePace` alone. It is on **every**
route, so the Add rows read as one menu instead of one that grows and shrinks as you move
around the app. It is the third of eight rows, after Add Terminal and Add Kit and before the
four Comms Library rows and Add Operation, which is the order the app introduces each thing.

```ts
const paceSectionMatch = /^\/(?:nets|pace)\/([^/]+)/.exec(location.pathname);
const matchedSection = paceSectionMatch?.[1];
const { sections: squadrons, hasCard } = usePaceSections();
const netSection = matchedSection && hasCard(matchedSection) ? matchedSection : '';
const [addNetOpen, setAddNetOpen] = useState(false);
// the Add Net row: onSelect: () => setAddNetOpen(true)
{addNetOpen && <NetDrawer open section={netSection} squadrons={squadrons} theater={theater} net={null} ... />}
```

**The click is the add.** Add Net opens the drawer in place, over whatever page is on
screen, the way Add Terminal and Add Kit open theirs. It used to navigate first: to
`/nets/:section?drawer=add` from a squadron's own routes, and to the `/nets` picker from
everywhere else, which read as being sent somewhere you were not supposed to be before
being allowed to add. The `AddItem` row type has `onSelect` beside `href` for exactly this
row; every other row still navigates.

**The URL is a seed, not the answer.** The route used to be the only thing that decided the
squadron: the drawer took it as a prop, never showed it, and posted to it. Nothing on screen
said where the net would land, and a net never moves between squadrons once created, so one
filed from the wrong library could only be deleted and typed in again. The drawer opens
with a **Squadron** select as its first field, listing exactly the card-bearing squadrons
(`usePaceSections().sections`, passed down as `squadrons` so the drawer's closed test mock
stays closed). The match is a **prefix**, so `/nets/:section`, `/pace/:section`,
`/pace/:section/edit` and `/pace/:section/print` all pre-select their squadron; any other
route starts it empty and the drawer refuses to create until one is chosen ("Squadron is
required."). Hidden in edit mode, because the API does not take it.

**After Create, the app lands where the net is.** The drawer shows the toast, "Net created
in <squadron>", then calls `onCreated` with the squadron, radio type and theater it sent,
and the host navigates to `netsLibraryPath(created, params)` from
`components/pace/net-landing.ts`: `/nets/<squadron>?radio=<tab>&theater=<theater>`. The
radio tab and theater move to the new net's values, because an MPU5-only net created from
the JEM tab, or an OCONUS-only net from CONUS, was created correctly and filtered straight
out of the list, which read as the net being lost. A `both` value keeps the current tab or
theater, since the net is visible under either. A push, not a replace, so Back returns to
where the user was. The helper is pure and shared by the header's drawer and the nets page's
own (`?drawer=add` deep link, still supported), so the two cannot land differently.

Three things are load-bearing:

- **The PACE editor is the one host that does not navigate after Create.** It holds one
  unsaved draft for the whole card and an SPA navigation away discards it with no
  `beforeunload` to catch it, so the header checks `/pace/:section/edit` and leaves the
  editor on screen; the toast still names the squadron. Opening the drawer over the editor
  loses nothing, which is why the route is no longer excluded from the seed.
- **The drawer is mounted on the click and unmounted on close**, never held open with a
  prop. It calls the two net mutation hooks, and mounting it on every route would put them
  in every closed `vi.mock('@/services')` that renders `MainLayout` - the same rule the CSV
  dialogs follow. `checkServiceMocks` reads header.tsx's own `@/services` import line,
  which stays `useLogout`; `header-add-net.test.tsx` is where the drawer is exercised, with
  its own mock, so `header.test.tsx`'s deliberately short mock stays short.
- **The card flag is checked**, since only a section with a card holds nets. The header
  reads it through `usePaceSections()`, which is the one `@/services` hook the header is
  allowed to pull - see the note in `header.test.tsx`.

The picker at `/nets` is navigation only: a squadron tile opens that squadron's library,
never the add drawer.

The row sits third rather than first: the menu reads in the order the sidebar does, Terminals,
Kits, then the Nets Library under PACE Planning, so Add Kit and Add Terminal stay where the eye
expects them. It used to be the leftmost of three header buttons for the same reason.

**Drawer:** `frontend/src/pages/net-drawer.tsx` - squadron (a `Select` over the card-bearing
squadrons, add mode only, pre-selected to the library on screen - see above), name, channel #
(`net_id`), radio type and freq unit (each a `ToggleButtonGroup`, since both are closed sets),
TX/RX, a **ROIP** checkbox, and notes. No waveform field, and no `description` field: the column exists and the API accepts
it, but the drawer does not surface it. Text inputs carry client-side `maxLength` matching
the DTO's `max=` caps, so the field stops accepting characters rather than the server
rejecting the save. Values arriving from the API that are not in `NET_RADIO_TYPES` /
`NET_FREQ_UNITS` fall back to the defaults rather than putting the toggle in an
unrepresentable state.

## Squadron scoping is data partitioning, not authorization

`:section` comes from the URL and is validated only for existence. Any authenticated user
can read any squadron's nets, and any `admin`/`editor`/`rto` can write them. There is no
per-user section attribute in the model.

**This is intentional**, and consistent with terminals and kits: roles here are global.
What the per-squadron shape guarantees is that a net cannot accidentally *leak* between
squadrons - one squadron editing FIRES cannot change another's, and the PACE domain's
`checkNets` refuses a channel referencing another squadron's net. What it does not do is
stop an authorized user from choosing to edit another squadron's library. Making it an
authorization boundary would need a `users.section` column plus service-layer checks. See
`authz.md`.

## Relationship to other domains

- **PACE Planner** (`pace.md`) - channel wheels assign nets to positions. `radio_type`
  lets a JEM wheel's picker offer only JEM and shared nets, which is what makes it
  impossible to drop an MPU5-only net onto a JEM channel. Both directions of the reference
  are closed through `backend/internal/shared/contracts/net.go`: `NetLookup` (this domain
  implements `NetsByIDs`, backed by `repo.InfoByIDs`) lets PACE validate a save, and
  `NetUsage` (PACE implements it) lets this domain refuse a delete. `NetSectionCounter`
  (this domain implements it as `CountNetsInSection`, backed by `repo.CountBySection`) lets
  a section delete refuse while the squadron still has nets. Wired by setter injection in
  `main.go` - neither package imports the other.
- **Sections** (`section.md`) - `nets.section` is a FK to `sections(key)`. Which sections
  actually get a nets page is `sections.pace_enabled` (migration 036). One flag gates both
  the nets library and the comms card, which is why adding HQ needed only a row.
- **Waveforms** (`waveform.md`) - **no relationship.** Removed in migration 030.

## CSV export / import

`GET /api/v1/export/nets/:section` exports one squadron's nets.
`GET /api/v1/nets/import/template` is shared across squadrons.
`POST /api/v1/nets/:section/import` imports into the squadron in the path (admin, editor, rto or planner).

Everything here follows from nets being per-squadron:

- **Export is section-scoped, with no squadron facet.** There is no "all nets" query and never has been. Adding a cross-section read purely to populate a filter chip would invent a view the domain does not have.
- **`section` is exported but has no parser, so it can never be imported.** The squadron is the write target, taken from the URL and stamped after parsing, which means a file naming another squadron still lands where the URL says. There is a test for this specifically.
- **Uniqueness is checked within the target squadron only**, by the same theater overlap rule as create (`NameExists`), matching it: two squadrons commonly run a net of the same name on different frequencies.

Two enums that deliberately disagree, both tested so the inconsistency does not read as a bug:

| Column | Folded? | Why |
|---|---|---|
| `radio_type` | yes | `JEM` and `jem` both import; it is never printed raw |
| `theater` | yes | same reason; blank, or a file with no theater column at all, imports as `conus` through the column's `Default` |
| `freq_unit` | **no** | `mhz` is rejected - it prints on a wheel exactly as stored |

`tx_freq` and `rx_freq` stay freeform strings. A net is recorded as a range or a placeholder word at least as often as a single figure, so a numeric column would reject most real entries.

**The `net_id` column's picker label is "Channel #", and its header row is still `net_id`.**
`csvtable`'s `Label` is only read by `ColumnMeta`, which feeds the export dialog's column
picker and the generated `frontend/src/generated/csv-columns.ts`; `Export` writes the
header row from the column `Key` (`csvtable/export.go`). So renaming a label cannot break
a file anyone already has, and an import written against the old export still parses.

## Print and export

`/nets/:section` carries the same right-justified share-then-Print pair every printable page does
(`DocumentActions` in `components/common/sheet-export`). Print / Save PDF opens `/nets/:section/print?radio=<tab>`,
`pages/nets-print-page.tsx`: the radio tab that was open, drawn by the same `NetsTable`
(`components/pace/NetsTable.tsx`) the live page uses, read only - no Actions column, no pencils - in
the app's dark palette with `print-color-adjust: exact`, portrait Letter through a `<style>` in
`document.head` - all of it the shared `PrintPageShell`, which the library print route uses too. Share exports the table container, which is the sheet root, via `netsExportSpec`.
The route is excepted from help coverage in `help-content.test.ts` and covered by the `print-nets` topic.

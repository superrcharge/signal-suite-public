# PACE domain (PACE Planner)

A squadron's comms card: the JEM and MPU5 channel wheels, the net sitting on each wheel
position, and the header the sheet prints above them. One card per squadron.

The card is the unit of work, not the channel. That single decision explains most of the
shape below - one read endpoint, one save endpoint, one transaction, one page with one
Save button.

Read `net.md` first if you have not. Nets are the library this domain assigns; the two
reference each other through `shared/contracts` and neither imports the other.

## Backend

**Migrations:** `backend/migrations/025_create_channel_plans.sql` and
`backend/migrations/027_create_pace_plans.sql`

```sql
-- 025: one wheel per squadron per radio
CREATE TABLE channel_plans (
  id            UUID         NOT NULL PRIMARY KEY,
  section       VARCHAR(50)  NOT NULL REFERENCES sections(key) ON UPDATE CASCADE,
  radio_type    VARCHAR(20)  NOT NULL,                 -- 'jem' | 'mpu5'
  label         VARCHAR(60)  NOT NULL DEFAULT '',       -- caption under the wheel
  channel_count SMALLINT     NOT NULL DEFAULT 16 CHECK (channel_count BETWEEN 1 AND 64),
  notes         TEXT         NOT NULL DEFAULT '',
  updated_by    VARCHAR(200) NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (section, radio_type)
);

-- 025: which net sits on which position
CREATE TABLE channel_assignments (
  plan_id            UUID     NOT NULL REFERENCES channel_plans(id) ON DELETE CASCADE,
  channel_number     SMALLINT NOT NULL CHECK (channel_number >= 1),
  net_id             UUID     NOT NULL REFERENCES nets(id) ON DELETE RESTRICT,
  tx_freq_override   VARCHAR(60) NOT NULL DEFAULT '',
  rx_freq_override   VARCHAR(60) NOT NULL DEFAULT '',
  freq_unit_override VARCHAR(4)  NOT NULL DEFAULT '',
  label_override     VARCHAR(60) NOT NULL DEFAULT '',
  PRIMARY KEY (plan_id, channel_number)
);
CREATE INDEX idx_channel_assignments_net ON channel_assignments (net_id);
CREATE INDEX idx_channel_plans_section   ON channel_plans (section);

-- 027: the card header, one row per squadron
CREATE TABLE pace_plans (
  id             UUID         NOT NULL PRIMARY KEY,
  section        VARCHAR(50)  NOT NULL UNIQUE REFERENCES sections(key) ON UPDATE CASCADE,
  title          VARCHAR(200) NOT NULL DEFAULT '',
  effective_date DATE         NULL,
  heading        VARCHAR(200) NOT NULL DEFAULT 'Services provided via the following PACE:',
  classification VARCHAR(60)  NOT NULL DEFAULT '',
  notes          VARCHAR(250) NOT NULL DEFAULT '',
  -- 031: the squadron emblem drawn in both wheel hubs. NOT NULL DEFAULT ''
  -- because the empty string is the "no emblem" value everywhere above it.
  emblem_url     VARCHAR(500) NOT NULL DEFAULT '',
  updated_by     VARCHAR(200) NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

```sql
-- 032: the sheet's middle band, all free-form text typed by the squadron
CREATE TABLE pace_freq_rows (
  id        UUID        NOT NULL PRIMARY KEY,
  section   VARCHAR(50) NOT NULL REFERENCES sections(key) ON UPDATE CASCADE,
  block     VARCHAR(10) NOT NULL,          -- CHECK (block IN ('ltac','tacsat'))
  position  INT         NOT NULL,          -- server-assigned, from list order
  name      VARCHAR(80) NOT NULL DEFAULT '',
  up_freq   VARCHAR(80) NOT NULL DEFAULT '',
  down_freq VARCHAR(80) NOT NULL DEFAULT '',
  sat       VARCHAR(80) NOT NULL DEFAULT '',
  crypto    VARCHAR(80) NOT NULL DEFAULT '',
  UNIQUE (section, block, position)
);

CREATE TABLE pace_tmn_rows (
  id       UUID         NOT NULL PRIMARY KEY,
  section  VARCHAR(50)  NOT NULL REFERENCES sections(key) ON UPDATE CASCADE,
  position INT          NOT NULL,
  label    VARCHAR(80)  NOT NULL DEFAULT '',
  value    VARCHAR(160) NOT NULL DEFAULT '',
  UNIQUE (section, position)
);
```

### Two row tables, not one with a discriminator

A TACTICAL MISSION NETWORK row is a label and a value; a frequency row is five named fields. One
table for both would give every column two meanings depending on `block`, and the CHECK
constraint would be the only thing saying which. `block` still discriminates LTAC from
TACSAT, but those two genuinely are the same shape.

`position` is the row's zero-based index in the submitted list, assigned by the server.
The client never sends it, so it cannot open gaps or duplicates that `UNIQUE` would then
reject.

### The two FK delete behaviours are different on purpose

**`channel_assignments.plan_id` is `ON DELETE CASCADE`.** An assignment has no meaning
without its wheel; deleting the plan should take its rows with it.

**`channel_assignments.net_id` is `ON DELETE RESTRICT`.** A net sitting on a wheel must
not vanish out from under a printed comms card. The soft equivalent on
`equipment.data.waveforms` accumulates orphans precisely because nothing enforces this;
here the database refuses the delete outright. `idx_channel_assignments_net` exists so
that refusal can *name* the wheels rather than only refuse - see `PlansUsingNet` below.

Both `section` columns are `REFERENCES sections(key) ON UPDATE CASCADE`, so renaming a
section key carries the card with it.

### Only assigned channels get a row

An empty wheel is zero rows, not sixteen blank ones. The UI renders `1..channel_count`
and fills the gaps with the unassigned placeholder. `channel_count` is a column rather
than a constant so a radio with a different number of positions needs data, not a
migration; `DefaultChannelCount` (16) is only the value a new plan starts with.

### Three columns on `pace_plans` ship unused

`heading`, `classification`, and `notes` are written by no code path. They exist so that
switching either on later is a UI change rather than a migration. `effective_date` is
nullable and **that nullability is the flag** - nil means the sheet shows no date subtext.
A separate `show_date` boolean could contradict the column and then something would have
to arbitrate.

**Domain layout:** `backend/internal/domain/pace/`

- `model.go` - `ChannelPlan`, `ChannelAssignment`, `NetRef`, `CardHeader`, `CommsCard`;
  `RadioJEM`/`RadioMPU5`, `ValidRadios`, `IsValidRadio`, `DefaultChannelCount`;
  `CommsCard.PlanFor(radio)`
- `errors.go` - coded `*Error` values implementing `response.CodedError`
- `dto/request.go` - `SaveCardRequest`, `SavePlanInput`, `SaveChannelInput`, `GetCardRequest`
- `dto/response.go` - `CardResponse`, `PlanResponse`, `ChannelResponse`, `NetSummary`.
  **`NetSummary` carries `roip`**, and did not until the ICE mark needed it. The card
  reads a deliberately narrow projection of a net, so the flag existed on every radionet
  read path while the one surface that gets printed and carried around could not see it.
  The hydrating JOIN in `repository.go` selects `n.roip` for the same reason - a field
  added to this DTO without the SELECT is silently always false.
- `repository.go` - `SectionExists`, `FindCard`, `SaveCard`, `CountAssignmentsForNet`,
  `PlansUsingNet`
- `repository_mock.go` - hand-rolled `MockRepository` (outside `_test.go`, so it is importable)
- `service.go` - `GetCard`, `SaveCard`, `checkNets`; `SetAudit`, `SetNetLookup`
- `helpers.go` - `toCardResponse`, `toPlanResponse`, `toChannelResponse`, `diffCard`
- `handler.go`, `routes.go`, `validation.go`
- `service_test.go` - table-driven, stdlib `testing` only

The package is `pace`, and the entity is a `CommsCard` rather than a `Pace` - there is no
noun "a pace". Channel plans and their assignments live in this one domain rather than
being split, because they are always read and saved together.

### Override precedence lives in the model, once

A net carries its own frequency, and moving it between channels is meant to carry that
frequency along. The four `*_override` columns are the exception: the same net running on
a different frequency for this squadron's wheel only.

`ChannelAssignment.EffectiveTx()` / `EffectiveRx()` / `EffectiveUnit()` resolve
override-then-net, and `IsOverridden()` reports whether the channel departs from the net
at all so the editor can show the difference is deliberate. The API response carries
`tx_freq`/`rx_freq`/`freq_unit` **already resolved**, so the sheet, the editor and the
print route cannot disagree about precedence.

### `NetRef` is a local read model, not a shared type

`FindCard` joins `nets` and populates `ChannelAssignment.Net`. The pace domain cannot
import `radionet`, so the seven fields it needs are restated as `pace.NetRef` rather than
reaching for a shared type. The write direction goes through `contracts.NetLookup`
instead - see below.

### PACE tiers

**Migration:** `backend/migrations/034_create_pace_tiers.sql`, plus `035_add_freq_row_channel.sql` for the TACSAT channel column described below.

```sql
CREATE TABLE pace_tiers (
  id             UUID PRIMARY KEY,
  section        VARCHAR(50)  NOT NULL REFERENCES sections(key) ON UPDATE CASCADE,
  tier           CHAR(1)      NOT NULL,   -- P A C E
  source         VARCHAR(12)  NOT NULL DEFAULT 'none',
  equipment_id   TEXT         NULL REFERENCES equipment(id)  ON DELETE SET NULL,
  transport_id   TEXT         NULL REFERENCES transports(id) ON DELETE SET NULL,
  service_abbrev VARCHAR(40)  NOT NULL DEFAULT '',
  custom_label   VARCHAR(120) NOT NULL DEFAULT '',
  detail         VARCHAR(200) NOT NULL DEFAULT '',
  CONSTRAINT pace_tiers_section_tier_unique UNIQUE (section, tier)
);
```

A tier is one of four things, recorded in `source`:

| source | Renders | Carries |
|---|---|---|
| `equipment` | Any Equipment Catalog record - a SATCOM terminal or a radio - with its photo and, for a terminal, its rates | `equipment_id` + `service_abbrev` |
| `transport` | An entry from the Transport Library | `transport_id` |
| `custom` | A line the squadron typed | `custom_label` |
| `none` | The dashed placeholder tile, letter and label only | nothing |

`detail` prints under the name whatever the source is.

**`ON DELETE SET NULL`, never `CASCADE`.** Deleting a catalog terminal must not silently delete a squadron's whole PACE tier; the tier survives with its reference cleared.

**Whichever reference does not match `source` is cleared on write**, in `tiersFrom` at `helpers.go`. A tier switched from equipment to custom keeps no `equipment_id`, so a stale reference cannot resurface if it is switched back. There is a service test for exactly this.

**Absent means unchanged.** A `tiers` array omitted from the PUT leaves the stored tiers alone; present replaces all four. That is what lets a client predating this feature keep saving channel edits without wiping tiers it never knew about. It is the one place the card departs from whole-payload replace, and it is deliberate: the band arrays clear when omitted, the tiers do not. The repository skips the tier write entirely when `CommsCard.Tiers` is nil.

**The read pads to four**, in `TierLetters` order, so `GET` always returns exactly four entries even for a squadron that has configured none and no consumer handles a partially configured card.

**Rates come from the equipment record, not the Services Library.** `loadTiers` joins the selected equipment and picks the entry from its own `data->'services'` array matching `service_abbrev`, then formats it as `dl/ul Mbps` the way the catalog datasheet does. The global Services Library is the vocabulary; the per-equipment entry carries the CIR and MIR, because two terminals on the same service carry different committed rates. `service_abbrev` is therefore a string, not a foreign key.

**`service_abbrev` names a capability, and a capability is a service *or* a waveform.**
A radio keeps its capabilities in `data->'waveforms'`, not `data->'services'`, and the editor's picker reads both so either kind can be chosen into the one column.
That is what lets a radio be a tier source without a second column and a discriminator to read it by.

Two consequences worth knowing before touching it:

- **The tile needs no join to print a capability, so `loadTiers`' LATERAL reads `data->'services'` alone.** The abbreviation is stored on the tier row and prints straight off it; the join exists only to find rates. Concatenating `data->'waveforms'` into it, as an earlier version did, could only ever match an entry whose four rate columns COALESCE to empty - which is exactly what no match already produces.
- **A radio tile prints no CIR/MIR, and that is correct.** A waveform object carries no `cir`/`mir` keys. No branch on `terminal_type` is needed anywhere, which is the point of reusing the one column - `terminal_type` is still absent from the tier payload.

**The tile prints `service_abbrev`, not the spelled-out name.** A card reads "GX", not "Inmarsat Global Express": the abbreviation is what the operators reading it call the capability, and it is the one form that fits a 186px tile without a wrap.
The spelled-out name has not gone anywhere - the editor's capability picker renders `GX - Inmarsat Global Express` - so the editor is where the acronym is learned and the card is where it is read.
The tile keeps a two-line clamp anyway, because `service_abbrev` is validated at 40 characters, the tile is a fixed 186px with `overflow: hidden`, and the print route does not scale; without it an over-long abbreviation would push CIR/MIR and the detail line out of the box silently rather than visibly.

**An equipment tile is titled with the catalog `nickname`, falling back to `nomenclature`.**
A card reads "Falcon" rather than "AN/PRC-158", for the same reason it reads "GX": the people reading a printed card know their terminals by the nickname.
`loadTiers` projects `equipment_nickname` beside the nomenclature and the photo, and the fallback is applied on the client in `PaceTile`, so the printed sheet and the editor's live preview cannot disagree about which one a tile is titled with.
It is `||` and not `??`: the field is projected as an empty string for a record that recorded no nickname, so `??` would title the tile blank instead of falling back.

Resolving on the server is what lets the print route render from one payload: it calls `window.print()` as soon as it has what it needs, and a second round trip would race it.

Three coded 400s in `errors.go` back the write rules: `PACE_INVALID_TIER_SOURCE`, `PACE_DUPLICATE_TIER`, `PACE_TIER_MISSING_REF`. Like the radio checks, they live in `Service.SaveCard` rather than in `validation.go`, which holds only message formatters in this domain.

**`PACE_TIER_MISSING_REF` names the tier and the field, and the client refuses before it is reached.**
The bare "a tier names a source but carries no matching reference" was true and unusable: four tiers and three sources that need a reference, so the only way to act on it was to open all four and check each by hand.
It was reported from a card whose Contingency tier had Source "Custom" with Detail filled in and Label empty - Detail sits directly under Label and is optional, so the tier looked configured and printed blank.

Three things carry the fix, and the middle one is the load-bearing part:

- **`Error.Is` matches on `Code` rather than identity.** Without it, specialising the message would have silently broken every `errors.Is(err, ErrTierMissingRef)` in the tests, because the specialised value is a different pointer. The `PACE_TIER_MISSING_REF` code every client keys on is unchanged.
- **The rule lives in `components/pace/tier-source.ts`, not in the page.** Pure, unit tested directly, and the single source for both the inline field mark and the Save message, so the two cannot disagree about which tier is at fault. It is a separate module for the same reason `wheel-geometry.ts` is, and because react-refresh forbids a non-component export from a module that holds a component.
- **A source the map does not know is reported as no gap.** That is the safe direction: a client predating a new source must not refuse a card the server would accept.

The message wording is Section 06's own field and source labels ("Label", "Catalog equipment") rather than the column names, so it names what is on screen.
Save refuses locally rather than disabling the button, because a disabled Save with no stated reason is the same dead end as the opaque 400 - and Section 06 collapses, so the message has to be actionable with the section shut.

`SHFTextField` and `SHFSelectField` gained an optional `error` for this; they had no error state at all, which is why a bad field could not be marked.
It is additive, and it added the `--shf-error` token that `--shf-info` always implied and `catalog-tokens.css` never had.
A field in error keeps its border through focus and blur - the shared `onBlur` hardcoded the resting colour and wiped the mark the first time the field was left.

**Editor Section 06, "PACE options"** (`pace-editor-page.tsx`): one `TierRow` per tier. The source select reveals only the fields that source needs, and changing it clears the previous source's fields in the draft as well as in `toRequest`, so the editor never shows a terminal it is no longer going to send. The service select is disabled until a terminal is chosen, because the services it offers are read off that record via `useEquipmentItem`. Tier edits go through `patch`, not `setDraft`: `patch` is what marks the form dirty, and without it Save stays disabled after a tier change.

**The sheet tile** (`PaceTile` in `SheetPreview.tsx`): the tier letter sits **above** the bordered tile, not inside it, and becomes the spelled-out word ("Primary", "Alternate", ...) once a source is set.
The grey subtext stays inside the tile and shows only on an empty one, so no tile ever prints the same word twice.
The tile background is `var(--shf-white)`, because a terminal photo usually carries a white backdrop and the sheet is tan, so without it the picture sat inside a visible tan band inside a black border.
A tile **with** a photo lays the photo left at 40% width with its text in a column beside it; a tile **without** one, meaning a transport or custom tier, keeps the centred single column, because there is nothing to leave room beside.
The photo row is `alignItems: 'center'`: the photo is a fixed 78px tall and the text column beside it is usually taller, so `flex-start` hung the picture off the top of a block it should sit level with.
It cannot be checked in a browser on a dev machine - equipment photos go to Azure Blob and the endpoint is a 501 locally, the same as the emblem - so it is pinned by a computed-style assertion in `pace-section-page.test.tsx` instead, jsdom resolving emotion's injected rules well enough for that.
The row carries **no heading** above it: the tier words say what it is, and the hardcoded "Services provided via the following PACE:" line is gone.

### The TACSAT channel column

`pace_freq_rows.channel` (migration `035`) holds the channel a frequency sits on. It prints in the TACSAT table only, between NAME and UP; LTAC carries the column in the row type and the table but never renders it.

Free-form text like every other field in the band, not an integer: a channel is as often `1-16` or `A` as it is a single number.

The column lives on the shared `pace_freq_rows` table rather than a TACSAT-only one, because the two blocks are otherwise identical and splitting them for one field would give every other column two meanings depending on which table it came from. The cost is that an LTAC row carries `channel: ""` in the payload; there is a test asserting exactly that, so the emptiness is deliberate rather than a bug someone later "fixes".

`FreqTable` takes a `withChannel` flag that drives the heading row and the cells together, so the columns cannot drift out of step with their headings.

TACTICAL MISSION NETWORK keeps a heading row but renders it empty. The row is what carries the rule and the line of height that puts its divider on the same baseline as LTAC's and TACSAT's; deleting the row pulls the block up and the three headings fall out of step. Only the words are gone, because a label column already says what each line is, whereas a bare frequency does not say whether it is an uplink or a downlink. The editor's Section 05 mirrors it with `TACSAT_FIELDS` and a matching grid, so what a squadron types is laid out the way it prints.

### The editor's live preview

It is **the wheels on the left and the four PACE tiles in a column on their right**, which turns the card on its side: on the sheet the tiles run across the bottom, and a preview pane half a window wide has no room for that.
Stacking them under two wheels would put them below the fold, which is the one thing the preview exists to prevent - before this, checking a tier meant Save, back to the card, look, and back in to edit.

Three things follow from that:

- **The tiles are `PaceTile` from `SheetPreview.tsx`, not a copy.** It and `PACE_TIERS` are exported for this. `PACE_TIERS` moved to `pace-constants.ts`, because the editor also restated it as a `TIER_LETTERS`/`TIER_LABELS` pair - two lists of the same four things, free to disagree about a spelling. Both now derive from the one list.
- **The tier's display fields are resolved client-side, in `tierPreviewFrom`.** `PaceTier` carries `equipment_nomenclature`, `equipment_nickname`, `equipment_photo_url`, `transport_name` and the two rates, and all of them are filled by `loadTiers` on the server - an unsaved draft has only ids. So the preview resolves them off `useEquipment()` and `useTransports()`, which the page now calls at top level; React Query dedupes against the identical calls in every `TierRow`, and a per-tier `useEquipmentItem` would be a hook in a loop. The list endpoint selects the same columns as the detail endpoint, so `data.services` is there and the rates come off the terminal's **own** services array, matched by abbreviation - the same rule the SQL follows, and `formatTierRate` has to keep agreeing with `formatRate` in `repository.go`.
- **The wheels column must be a fraction, never `auto`.** See the width trap below - `minmax(0, 1fr)` is definite, which is what keeps `WHEEL_PREVIEW_W` a cap rather than the only sizing there is.

The two panes are the height of the window and scroll inside themselves, rather than the page scrolling as one.
The form pane was capped at a flat `75vh`, which left a quarter of the window empty at every size.
`EDITOR_CHROME_H` is built from `HEADER_HEIGHT`, the banner block and `CONTENT_GUTTER` rather than written as one number, because a bare `calc(100vh - 156px)` says nothing about which 156 and goes quietly wrong the next time the banner changes.
The top gutter is deliberately absent from it: `PageBanner` cancels that one with its own negative margin.

Two things about it have bitten, both fixed and both easy to reintroduce:

- **The wheels need a definite width, not just a maximum.** `ChannelWheel` renders `<svg width="100%">` with no intrinsic size. In a content-sized column that percentage has nothing to resolve against, so the browser falls back to the 300px it gives any replaced element with no dimensions. Uncapped it went the other way and scaled to the column, over 1000px on a wide monitor against a 580-unit viewBox. The preview pane therefore carries `width: 528 + padding` with `maxWidth: '100%'`, 528 being half the sheet's 1056px page, which is the width each wheel actually gets when it prints.
- **The preview must be passed the emblem.** It was not, so its hubs rendered empty while the Section 02 thumbnail updated correctly. Uploading an emblem looked like it had silently failed. It now takes `card?.emblem_url || placeholderEmblem(sectionLabel)`, using the same exported helper the sheet uses so the two cannot disagree about what a squadron with no emblem looks like. There is a test asserting two `svg image` elements render.

**Emblem upload returns 501 in local dev.** The endpoint writes to Azure Blob Storage, which is not wired locally, so the upload path cannot be exercised on a dev machine at all. To test emblem *rendering* locally, set `pace_plans.emblem_url` directly to a URL the browser can fetch; note the column is `varchar(500)`, so a data URI will not fit.

### Changed marks and the version label

**Migration:** `backend/migrations/041_add_pace_highlights.sql`

A revised card is handed on, and the person receiving it needs to see what moved. **Nothing
compares versions.** The squadron ticks the box in any field that changed, the sheet prints
that value in `SHEET_CHANGED` red (`pace-constants.ts`), and "Clear all marks" in Section 01
starts the next revision. `pace_plans.version` is free text (`v2`) printed after the date,
empty meaning none - the `emblem_url` convention.

- **Each row carries its own marks**, as `highlights TEXT[] NOT NULL DEFAULT '{}'` on all six
  card tables, naming that row's own fields (`HeaderHighlights`, `ChannelHighlights`, ... in
  `model.go`). Not one card-level list of positional keys: the band is a delete-and-reinsert
  with a server-assigned position, so "LTAC row 2" would mark the wrong row the moment one
  above it was deleted.
- **An unknown name is a coded 400, `PACE_INVALID_HIGHLIGHT`, naming the row** - refused, not
  dropped, because dropping it prints in black the one value the recipient was meant to
  notice. A repeat is de-duplicated instead (`keepHighlights`), and the DTO cap is loose for
  that reason.
- **Never nil on the way in.** pgx writes a nil slice as NULL against a NOT NULL column, so
  every write goes through `keepHighlights` or `orEmpty`. Responses carry `[]`, never `null`.
- **A channel mark covers the printed value, override or not.** `tx` on a channel that
  inherits its net's frequency still reds that line. On the wheel two lines are TX then RX; a
  single line (simplex, or only one half set) is red if either half is marked.
- **An emptied position cannot be marked.** Only assigned channels have a row, so the editor
  offers the net tick only on an assigned channel rather than accept a tick it would drop.
  The version label is how a removal is announced.
- **Audited: the version, not the marks.** `diffCard` logs `version`; toggling a mark is
  presentation and would bury the edits it describes.

Two export rules, both of which fail silently:

- **Never add visually hidden text outside a `figure`.** `pace-text-runs.ts` walks every
  laid-out element outside the wheels and would emit it as a stray PPTX text box. The wheel's
  accessible table says "(changed)" in words because it is inside the figure, which the walk
  skips.
- **A value that can be red on its own must be its own laid-out element.** The walker emits
  an element with only inline children as one run in that element's colour. The date and the
  version are therefore flex siblings, not spans in one line, or a red version would export
  grey inside a grey date.

The editor's tick is `SHFMarkToggle`, surfaced through optional `marked` / `onMark` props on
`SHFTextField` and `SHFSelectField`; no other form passes them, so no other form changed. It
sits **beside** every field, never inset: an inset tick is impossible on a select, whose right
edge is the chevron, and a mix of the two read as inconsistent. The width it costs the narrow
TX/RX pair is paid for by the channel rows' number gutter, now 16px and left-aligned so the
number starts on the Wheel caption field's left edge (it was a right-aligned 26px column).

**The LTAC and TACSAT editor rows are two lines of three** (`LTAC_LINES` / `TACSAT_LINES`):
NAME / UP / DOWN over CH / SAT / CRYPTO, LTAC leaving its CH cell empty so the columns agree.
Six cells plus six ticks do not fit a half-pane row at 1280 - CH and SAT went to a few pixels
- and the two cheaper answers were both rejected in review: a tick inset in the box, and a
tick under each cell, which added a row of loose checkboxes under every entry. Do not go back
to one line of six with ticks. The sheet itself is unchanged: this is editor layout only.

**Every box in the three band tables is titled above itself, in every entry** - NAME, UP,
DOWN, CH, SAT, CRYPTO, LABEL, VALUE. A heading block over each table's first row was tried
and rejected: once the table scrolls, nothing says which box is which. The tick keeps a full
`markName` ("TACSAT 3 up") because the title alone would give every tick in a column one
accessible name.

On a greyscale printer the red prints as a dark grey close to black; the marks are for a
colour print or the screen.

## API

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/v1/pace/:section` | any authenticated | The whole card in one payload: `emblem_url`, plus `ltac_rows`, `tacsat_rows` and `tmn_rows`, each always an array |
| PUT | `/api/v1/pace/:section` | admin, editor or **rto** | The whole card in one save |
| POST | `/api/v1/pace/:section/emblem` | admin, editor or **rto** | Multipart `emblem` field (JPEG/PNG/WebP). Uploads to Azure Blob, writes `emblem_url`, returns `{ url }`. 501 if blob not configured. |
| DELETE | `/api/v1/pace/:section/emblem` | admin, editor or **rto** | Clears `emblem_url`, deletes the blob, 204. 501 if blob not configured. |

The card itself is two endpoints, because the editor is a single page with a single Save.
Granular per-channel endpoints would exist only to be called in a batch anyway.

### The band rides on the card save

`ltac_rows`, `tacsat_rows` and `tmn_rows` are part of `PUT /api/v1/pace/:section`, not
endpoints of their own: every value is per squadron and belongs to the card, and the card
already has exactly one save.

The write is a **whole-band replace**. The repository deletes every row for the section in
both tables and reinserts the submitted list, inside the transaction `SaveCard` already
runs in. An upsert per row would leave the rows past the end of a shorter list behind, so
deleting a row would be impossible.

Caps live in `dto/request.go` as `max=8` on both frequency arrays and `max=6` on the
tmn array, with the messages registered in `validation.go`; over-long lists are a 400.
They are constants, not configuration: the sheet is a fixed 816px page and the band has a
fixed share of it, so an unbounded row count would push the PACE tiles off the paper.
The editor pads its grid to the same numbers.

Responses always carry arrays, never `null`. A `null` forces every consumer to guard, and
the sheet renders nothing either way, so the difference would go unnoticed until it did
not.

### The emblem is uploaded on selection, not on card Save

`emblem_url` is deliberately **not** in `SaveCardRequest` and **not** in the editor's
`Draft`. The editor POSTs the file the moment one is chosen, and reads the stored URL back
off the card. The card save is a whole-card replace, so routing the emblem through it
would clear an emblem the editor was never holding on every unrelated save.

The write path is its own repository method, `SetEmblemURL(ctx, section, url)`, which
touches only that column and `updated_at`. It upserts rather than updates, because the
header row is lazily created: a squadron that has never saved a card has no row, and a
plain UPDATE would match nothing and drop the emblem while reporting success.

Blob lifecycle mirrors the Equipment Catalog (`equipment.md`), whose `UploadPhoto` is the
reference implementation: a fresh UUID blob name per upload, the blob deleted when the row
write fails, and the blob deleted after the row commits on a clear. `emblem_url` is the
only reference to that blob, so any path that drops it without deleting strands the
object. `pace.EmblemStore` is the three-method subset of `equipment.PhotoStore`
(`UploadStream` + `Delete` + `BlobNameFromURL`) the pace handler needs; `main.go` passes it
the same nil-safe `photoStore` value.

`rto` writes alongside admin and editor: the PACE Planner is the product RTOs maintain.
The frontend gate is **`canWritePace`**, not `canWrite`.

**A squadron with nothing saved is not a 404.** `GetCard` scaffolds an empty header and,
via `toCardResponse`, always emits both radios in `ValidRadios` order with
`channel_count: 16` and no channels. There is no "create plan" step in the UI, and no
"not set up yet" case for a consumer to special-case. The plan rows themselves are
created lazily by the first save (`ON CONFLICT (section, radio_type) DO UPDATE`).

**Error codes** (all of `errors.go`):

| Code | Status | Raised when |
|---|---|---|
| `PACE_SECTION_NOT_FOUND` | 404 | `:section` is not a row in `sections` |
| `PACE_INVALID_RADIO` | 400 | a plan's `radio_type` is not `jem` or `mpu5` |
| `PACE_CHANNEL_OUT_OF_RANGE` | 400 | `channel_number` < 1 or > that plan's `channel_count` |
| `PACE_DUPLICATE_CHANNEL` | 400 | the same channel appears twice in one plan |
| `PACE_DUPLICATE_RADIO` | 400 | the same radio appears twice in `plans` |
| `PACE_UNKNOWN_NET` | 400 | a channel names a net id that does not exist |
| `PACE_NET_WRONG_SECTION` | 400 | a channel names another squadron's net |
| `PACE_NET_WRONG_RADIO` | 400 | a net was put on a wheel its `radio_type` does not carry |
| `PACE_INVALID_DATE` | 400 | `effective_date` is not `YYYY-MM-DD` |
| `PACE_INTERNAL_ERROR` | 500 | repository failure |

`PACE_DUPLICATE_RADIO` is not pedantry. Two `jem` plans both resolve to the same row via
`ON CONFLICT ... RETURNING id`, and then the second iteration's `DELETE FROM
channel_assignments` wipes the first's inserts and the request returns 200 OK. Refusing is
the only honest answer - there is no way to tell which of the two the client meant.

### The whole-card save contract

`PUT /api/v1/pace/:section` is a **partial replace, per radio**:

- A radio **omitted** from `plans` is left completely untouched. Its row, its label, its
  assignments all stay as they were.
- A radio **present with an empty `channels` list** clears that wheel. The plan row is
  upserted (so label/count/notes still apply) and every assignment is deleted.
- A radio present with channels replaces that wheel's assignments wholesale: delete, then
  insert. There is no per-channel patch.

The header is always upserted from `title` + `effective_date`. An empty `effective_date`
string leaves the column NULL, which is exactly what unticking the editor's "Include
date" checkbox does.

`SaveChannelInput.NetID` carries a net's **UUID primary key**, not its human-facing
`net_id` label, and validates as `required,uuid` - so a malformed value is a 400 at the DTO
rather than a confusing `PACE_UNKNOWN_NET` from the lookup. See `net.md` on the two
identifiers.

`Plans` is capped at `max=2` in the DTO - `len(pace.ValidRadios)`, which is the most a
payload can legitimately carry, since a repeat is refused as `PACE_DUPLICATE_RADIO`. The
cap sits in the DTO rather than only in the service because **one save is one
transaction**: an unbounded `plans` array would hold the write lock over an arbitrary
number of upsert + DELETE + insert cycles and stall every other squadron's save.

### `SaveCard` is the repo's first transaction

`PostgresRepository.SaveCard` wraps the whole write in `db.Begin` with an unconditional
`defer tx.Rollback` (a no-op once `Commit` succeeds, so no path leaves a transaction
open). It matters here specifically: replacing a wheel's assignments is a delete followed
by inserts, and a failure between the two would leave a squadron's wheel *empty* rather
than unchanged. `section/service.go` carries a note wishing for this; this is where it
finally arrived.

`FindCard` reads the card in three queries - header, plans, then all assignments for the
section joined to `nets` - and stitches them by plan id.

### Cross-domain wiring

Both directions of the nets reference are closed, through `backend/internal/shared/contracts/net.go`,
wired in `main.go`:

```go
paceService.SetNetLookup(netService)   // contracts.NetLookup
netService.SetNetUsage(paceService)    // contracts.NetUsage
```

- **Write direction** - `Service.checkNets` calls `NetsByIDs` and asserts three facts per
  channel: the net exists (`PACE_UNKNOWN_NET`), it belongs to the squadron whose card is
  being saved (`PACE_NET_WRONG_SECTION`), and the wheel's radio carries it
  (`PACE_NET_WRONG_RADIO`, where `both` belongs on either). The last check is the payoff
  for the nets library's `radio_type`: it makes assigning an MPU5-only net to a JEM
  channel impossible rather than merely discouraged.
- **Delete direction** - `Service.CountAssignmentsForNet` and `Service.PlansUsingNet`
  satisfy `contracts.NetUsage`, so deleting a net that sits on a wheel returns 409
  `NET_IN_USE` naming the wheels. `PlansUsingNet` returns strings like `A SQD JEM`, built
  from the section label so the message reads like the UI.

`checkNets` no-ops when `s.nets` is nil, which is how the unit tests exercise the rest of
`SaveCard` without a nets library.

### Audit

`SaveCard` records one `update` event with `ResourceType: "pace_section"` and the section
key as both `ResourceID` and `ResourceName`. `GetCard` records nothing.

`diffCard(before, after, touched)` summarises the save rather than logging it
channel-by-channel, which would drown the entry. Per wheel it records
`<radio>_assigned_channels` (how many positions carry a net) and `<radio>_label`, plus
`title` and `effective_date` at the card level. Only changed values appear.

**The diff covers only the radios the request carried**, which is `touched` - the same set
that backs the duplicate-radio guard. This is not an optimisation. The earlier version
diffed the whole DB card against a card built only from `req.Plans`, so a radio the
request omitted looked emptied: the audit log recorded
`mpu5_assigned_channels {old: 3, new: 0}` while the wheel sat untouched in the database.
A radio present with an empty channel list *is* a real clear and is still logged.

## Frontend

**Types:** `frontend/src/types/pace.ts` - `PACE_RADIOS`, `PaceRadio`,
`PACE_RADIO_LABELS`, `PaceCard`, `PacePlan`, `PaceChannel`, `PaceNetSummary`,
`SavePaceCardRequest` / `SavePacePlanInput` / `SavePaceChannelInput`.

**Service hooks:** `frontend/src/services/pace-service.ts` - `usePaceCard(section)` and
`useSavePaceCard()`. Query keys `queryKeys.pace.all` / `queryKeys.pace.card(section)`.

Note the reverse invalidation in `net-service.ts`: every net mutation invalidates
`queryKeys.pace.all` as well as the nets library, because the card endpoint JOINs `nets`
and returns the resolved name and frequencies. With the app's 5-minute `staleTime`,
correcting a frequency would otherwise leave the wheel and the print sheet showing the old
value for minutes with nothing on screen to say so - on a card someone prints and flies
with. It invalidates the `pace` root rather than one section because nothing client-side
guarantees which cards reference a net.

**Which section gets a card:** the `sections.pace_enabled` column, added in migration 036.
It was `PACE_SECTION_KEYS`, a hardcoded list of five, and that constant's own comment said
to promote it to a column once the list started changing. HQ was it changing.

- `hasPaceCard(section)` in `components/pace/pace-constants.ts` takes the **section record**
  and reads the flag. Stays pure. Use it wherever a `Section` is already in hand -
  sidebar, `SectionPicker`, the CSV facet vocabularies.
- `usePaceSections()` in `components/pace/use-pace-sections.ts` is for the call sites that
  hold a route param instead: `hasCard(key)`, the filtered list, and `isLoading`.
- **The 404 gates must wait on `isLoading`.** This used to be answerable synchronously, so
  `nets-page`, `pace-section-page` and `pace-editor-page` could return `NotFoundPage`
  immediately. They cannot now: the first render has no sections, and not waiting flashes
  "404" for a squadron that exists on every load. `pace-section-page.test.tsx` pins this.
- **Absence is false.** A response cached from before 036 has no such field, and a squadron
  silently gaining a card because a key was missing is worse than one silently not.
- Editable from the Settings section dialog ("PACE squadron" toggle), and audited, because
  switching it off removes a squadron's card and nets library for everyone with no deploy
  and no other trace.

**HQ** is seeded by 036 with `pace_enabled = true` and colour `#8fd14f`, and **SPT** by
`037_add_st_section.sql` with `pace_enabled = true` and colour `#818cf8`. Nothing in the
code names either; they are rows like any other squadron - SPT needed no frontend change at
all, which is the payoff 036 was bought for.

SPT is also the section that proves the key derivation earns its keep: the label keeps its
ampersand, the key is `st`, and so nothing that interpolates a section key into a path, a
query string or a filename ever has to escape one. See `section.md`.

### Pages

| Route | File | What it is |
|---|---|---|
| `/pace` | `pages/pace-index-page.tsx` | "JEM / MPU5 Wheels" landing - pick a squadron |
| `/pace/:section` | `pages/pace-section-page.tsx` | The card, drawn as the printed sheet |
| `/pace/:section/edit` | `pages/pace-editor-page.tsx` | The card editor |
| `/pace/:section/print` | `pages/pace-print-page.tsx` | The sheet alone, for printing or saving as PDF |

`components/pace/SectionPicker.tsx` is shared by `pace-index-page` and
`nets-index-page` - both are "pick a squadron, then work on its thing", and both list
exactly the card-bearing squadrons, so they are one component with a different
destination (`hrefFor`) rather than two that drift apart.

The `/pace/:section/print` entry is registered **before** `/pace/:section` in the route
array. The other order lets the section route match `print` as a section key and render
the section page for a squadron that does not exist.

**`components/pace/SheetPreview.tsx`** is the sheet body itself, exported along with
`PAGE_W` and `PAGE_H`. It used to be a local function inside `pace-section-page.tsx`,
which is why the print route could not render it; both callers now draw the same
component, so the printed sheet and the on-screen one cannot drift.

**`pace-print-page.tsx`** serves that component two ways off one route. With `?print=1`
it renders the sheet alone, waits on `document.fonts.ready`, then injects
`@media print { @page { size: letter landscape; margin: 0; } }` and calls
`window.print()`, removing the injected `<style>` on unmount. Without the parameter it
renders the sheet on the dark canvas with a `Print / Save PDF` button that reopens the
route with `print=1`.

A fixed landscape page rule replaces the catalog datasheet's scale slider, because the
PACE sheet is already exactly one landscape page at 1056x816 and has nothing to scale
to fit.

It waits on `waitForImages()` only when the card carries an uploaded `emblem_url`,
guarded the same way `catalog-print-page.tsx` guards it on `photo_url`. That helper only
returns early once it has seen a loaded `<img>`; with none on the page it runs to its own
5s fallback timer, which would stall the print dialog for five seconds on every card. The
wheels and the placeholder emblem are SVG `<image>` with inline data URIs and need no wait.

The `Print / Save PDF` button on the section page carries no MUI `Tooltip`, unlike the
`Edit` button beside it. A Tooltip title is promoted to the child's `aria-label`, which
would rename the control to the tooltip sentence and leave its visible label and its
accessible name disagreeing.

**`pace-section-page.tsx`** draws the sheet at its true output size - US Letter landscape
at 96dpi, 1056x816. Reviewing the wheels in a responsive column would flatter a layout
that has to survive a fixed landscape page. The sheet is three bands stacked flush, no gap or border between them: the wheels row
(`flex: '1 1 auto'`, so it gives up its own slack), the tables band (`flex: '0 0 auto'`,
LTAC and TACSAT across the left 70% and TACTICAL MISSION NETWORK down the right 30%), and the PACE
tier tiles. Every band row is a fixed 18px so the two frequency tables stay aligned line
for line, and a block with no rows still renders its heading row so the sheet keeps its
structure when only one table is filled.

Both hubs draw `card.emblem_url` when the
squadron has uploaded one; otherwise they fall back to a placeholder SVG drawing the
squadron's own label with SAMPLE across it, so a placeholder on B SQD's card never reads
"A SQD" and is never mistaken for a real patch. The label is XML-escaped before being
spliced in, because it is a DB value going into markup.

**`pace-editor-page.tsx`** holds one `Draft` for the whole card - title, the "Include
date" checkbox, the date, and a dense `PlanDraft` per radio where index 0 is channel 1, so
every position has a row whether filled or not. Section 02 is the squadron emblem, which
sits under the header because it belongs to the card rather than to either wheel; the two
radio sections are 03 and 04, and Section 05 is the sheet tables. The band draft is padded
to the full 8/8/6 grid so there is always somewhere to type, and `toRequest` drops any row
still blank after trimming, so the padding never becomes stored rows. A card with no
tmn rows saved is seeded with the labels DATA SYNC, CHAT and MEDICAL
PLUGIN. It is built from the shared form
primitives in `@/components/shf-form` (see `service.md`), which is what makes it look like
the Equipment Catalog editor rather than approximate it.

### The channel list fills down its columns, not across them

Sections 03 and 04 lay their channels out in two columns filling **downward**: 1..8 on the
left, 9..16 on the right.

That is the wheel's own halves, which is the whole reason for it. Channel 1 sits at 6
o'clock and numbering runs clockwise, so 2..8 are the wheel's left side, 9 is at 12
o'clock, and 10..16 are its right side - measured on a rendered wheel rather than inferred
from the maths. The editor's columns therefore map onto the preview beside them. Filling
across instead would also put every odd channel in one column and every even one in the
other, which is a poor way to read a numbered list, and it is what a "tidy" back to the
CSS default would silently reintroduce.

**`gridAutoFlow` is `column` unconditionally and the breakpoint rides on the row count.**
At `xs` the rows are the full channel count against a single column, so the same flow lays
them out 1..16 in one column; at `sm` the rows are half that against two. Keeping the flow
out of a media query is what lets a test assert it, since jsdom does not evaluate the `sm`
rule - so the test pins `gridAutoFlow`, not `gridTemplateColumns`. The row count comes from
the plan rather than the constant 8, because `channel_count` is a column (1..64).

The channels stay in **DOM order 1..16** either way, so the tab order runs down the left
column and then down the right, and tests address a channel by its `aria-label` rather
than by position.

Two spacing values are measured rather than chosen, both at the `lg` boundary where the
form pane is at its narrowest - below `lg` the panes stack and it gets the whole window.
There the TX/RX override pair had 64.3px of usable width against 66.5px of "TX override",
so the placeholder clipped. The row's number gutter is 26px rather than 34 (two mono
digits at 12px measure about 14, and 34 was sized when a row spanned the whole pane) and
the pair's own gutter is 4px rather than 8, which puts it at 70.3px.

Two behaviours worth knowing before touching it:

- **The reload effect has a dirty guard, mirrored into a ref.** Typing while the post-save
  refetch is in flight used to discard every keystroke since Save and clear `dirty` with
  them, disabling Save with no sign anything had gone. The flag is a ref so the effect can
  read it without depending on it - depending on `dirty` re-runs the effect the moment a
  save clears it and resets from the pre-save card.
- **A failed card fetch renders an error, not an empty card.** Rendering an untitled card
  with two empty wheels is indistinguishable from a squadron that has not built one. The
  channel selects likewise wait for their net options to arrive, since drawing early makes
  an assigned channel read as empty and re-assigning it silently drops the TX/RX
  overrides.

### The wheel

`components/pace/ChannelWheel.tsx` renders one wheel from a sparse `assignments` array;
`components/pace/wheel-geometry.ts` is the pure maths, kept apart so it is asserted
directly rather than through rendered markup (`wheel-geometry.test.ts`).

The wheel is a **dial, not a pie**: a numbered ring with each net's label outside it.
**Channel 1 sits at 6 o'clock** and numbering runs clockwise, so at the default 16
positions channel 9 is at the top.

**Each label sits on its own spoke**, so it reads as belonging to the tick it touches.
Naive radial placement does collide: at 16 positions the angular step near 12 and 6
o'clock puts adjacent labels only `ringOuter * 0.076` apart vertically, about 14 units,
against roughly 40 for a three-line label. The answer is not to abandon the spokes but to
slide a crowded label further **outward along its own**, which is the one direction that
separates it from its neighbour without breaking the link to its tick. Radius is solved
from a target height (`r = (y - cy) / sin(angle)`), which is what keeps it on the spoke.

The **leader is two segments meeting at one bend**: the first continues the tick's own
radial line so the two read as a single line, the second runs horizontally into the label.
It matches the tick on colour *and* weight, because a 1px amber stroke antialiases visibly
paler than the 2px tick and the join then reads as two marks that happen to touch. It
arrives at the **net name**, with the frequencies hanging beneath, rather than at the
label block's centre where it would point at neither.

**Two positions are the exception: the ones on the vertical axis.**
Channel 1 at 6 o'clock and the 12 o'clock position have a spoke with no horizontal component, so they carry their label centred on the spoke, `anchor: 'middle'`, and no leader at all (`leader` is `null`, which is what forces the render to guard).
The sideways offset every other label needs is pure error on a vertical spoke: it puts the label 18 units to one side of its own tick, reading as belonging to nothing, and a leader into a centred label either strikes through its own text or is too short to see.
They are also placed from an **explicit radius** rather than from the relaxation pass, because a centred label is in neither column and so is not crowding the neighbour that pushed it outward.
The two radii differ: `baseRadius` at the bottom, `baseRadius + AXIS_TOP_CLEARANCE` at the top.
That asymmetry is real, because a label block hangs **downward** from its line - the net name sits on the line and the frequencies stack beneath it - so the bottom label runs away from the dial and fits at the base radius, while the top label runs back toward it and needs a whole block of clearance or its frequencies land on the ring.
The bottom label's old relaxed position put its frequency lines at about y=438 inside a viewBox that stops at 430, and the SVG is `overflow: visible`, so they painted straight over the LTAC table beneath the wheel.

**The top clearance is reserved in one file and spent in another, and that split is deliberate.**
`AXIS_TOP_CLEARANCE` (30) is the *worst* case, a net carrying separate TX and RX lines, because `wheelGeometry` is handed a channel count and nothing else - it cannot know which net will land on that position.
Reserving the worst case and stopping there is what left net 9 visibly adrift: measured on a real card, its block sat **19 units off its own tick against channel 1's 0**, because most nets carry one frequency line and a few carry none.
So `ChannelWheel` nudges the top axis label back down by `(2 - detailLines.length) * FREQ_LINE_STEP`, which is where the assignment is actually known, and the gap comes out at 5.8 units against the bottom label's 0.8.
It reads as belonging to the dial again.
The constant was `labelSpacing` (42) before that, which is the gap between two labels *in a column* and has nothing to do with a block's height - a quantity borrowed because it was nearby and roughly the right size.

The cost is worth knowing before anyone "tidies" it: the reservation is still in the viewBox, so a wheel whose top net carries one line now has about **23px of unused space above it** rather than 3.
`TOP_TRIM` is the only lever on that, it is a single hand-measured constant applied at every channel count, and `maxLabelRadius` (210) already lets an off-axis label reach y=5 against a trim of 13 - so raising it to reclaim the space needs the worst case re-measured across counts first, not a guess.

**The wheel's hidden table is `table-layout: fixed`, and that is load-bearing.**
It carries every channel's net and frequency, so it lays out around 486 units wide if left alone, and an auto-layout table ignores a `width` narrower than its content - the `width: 1` in `visuallyHidden` simply did not bind.
The table escaped its `<figure>` and gave the **whole document** a horizontal scrollbar on any window narrower than that, on every page carrying a wheel.
Invisible, so the only symptom was the page sliding sideways with nothing out there to look at.

The **caption's baseline is measured down from `ringInner`**, not up from `hubRadius` (`CAPTION_BASELINE_DROP`).
Measured from the hub it landed the words' cap height inside the amber ring band, so "JEM" and "MPU5" were struck through by the ring.

### Three sizing numbers that move together

Written down because two of them were learned by getting it wrong. Two wheels share a
1056px sheet, so each renders into about 526px and the SVG fills it at `width:100%`, which
makes the rendered circle `ringOuter / width` of the cell.

- **Widening the viewBox buys nothing.** It is a pure zoom-out: ring and text shrink
  together and their ratio, which decides whether a label fits, does not move.
- **Shrinking the ring to make label room shrinks the dial** by the same proportion.
- **Height is the axis that is actually free**, and the viewBox is trimmed to what the
  content occupies, which is also what keeps the wheels tight under the title.

`WHEEL_SPREAD` in `pace-section-page.tsx` pushes each wheel toward its own edge of the
sheet. Its cap is measured, not felt: the widest label leaves about 24 viewBox units of
slack, the Paper clips, and a larger spread cuts the outermost frequencies off the page
rather than moving them. **Frequency font size, `WHEEL_SPREAD` and viewBox height are
coupled** - enlarging the frequency text widens every label and eats both margins, so
none of the three can be changed without re-measuring the others.

Frequency text comes from `types/net-format.ts`, shared with the nets library and the
printed sheet - see `net.md`.

### Sidebar and header

The sidebar's **PACE Planning** group holds the Nets Library collapsible and the
per-squadron wheel items (`sidebar.tsx`). The header's **Add Net** button is gated on
`canWritePace` plus an anchored path match - see `net.md`, which documents the gate and
why `/pace/:section/edit` deliberately does not match it.

## Squadron scoping is data partitioning, not authorization

`:section` comes from the URL and is validated only for existence. Any authenticated user
can read any squadron's card, and any `admin`/`editor`/`rto` can write any squadron's
card. There is no per-user section attribute anywhere in the model.

**This is intentional**, and consistent with how terminals and kits already behave: roles
in this app are global. What the per-squadron shape guarantees is that a card cannot
accidentally *leak* between squadrons - `checkNets` rejects a channel referencing another
squadron's net with `PACE_NET_WRONG_SECTION`. What it does not do is stop an authorized
user from choosing to edit another squadron's card. Making it an authorization boundary
would need a `users.section` column plus service-layer checks on both endpoints. See
`authz.md` for the full statement.

## Relationship to other domains

- **Nets** (`net.md`) - the library this domain assigns. Both directions guarded through
  `shared/contracts/net.go`; neither package imports the other.
- **Sections** (`section.md`) - both `channel_plans.section` and `pace_plans.section` are
  FKs to `sections(key)`, and `SectionExists` is checked before every read and write.
  Which sections get a card is the `sections.pace_enabled` column, added by migration 036.
  It was a frontend constant until HQ needed one, which is what forced the promotion.
  See the `pace_enabled` section above for how the flag reaches the page and the header.
- **Equipment Catalog** (`equipment.md`) - no data relationship. The editor borrows the
  catalog editor's form primitives (`components/shf-form/`) and its `catalog-tokens.css`,
  which is why a page using those primitives must import that stylesheet.

## CSV export

`GET /api/v1/export/pace-channels/:section` exports one squadron's assigned wheel positions.

**Export only, and named for what the file actually carries.**
A comms card is a composite - two channel plans and their assignments, the LTAC and TACSAT tables, the TACTICAL MISSION NETWORK rows, the four tiers and a header - and none of that fits one CSV shape.
Rather than bend the card to look like a table, the export builds a purpose-made flat row (`channelRow`) and the card stays as it is.
The resource is `pace-channels` rather than `pace` so the omission is visible in the URL instead of implied by it; the freq tables, tmn rows and tiers are separate resources if they are ever wanted, not a reshaping of this one.

There is no template and no import.
`csvTable.New` is nil, so `Parse` refuses by construction: a channel row is meaningless without a plan and a net that already exist, and a CSV would bypass every cross-domain check the editor performs.
A test asserts that stays true.

Frequencies are the **effective** values - the override when one is set, otherwise the net's own - with `is_overridden` alongside so a difference reads as deliberate rather than as stale data.
Unassigned positions are skipped rather than padded: a typical wheel is mostly empty, and blank rows for positions nobody planned are harder to read than a list of what is assigned.

## Slide export

The comms card exports to a `.png`, the clipboard, or a `.pptx` slide, from a share control beside
the amber `Print / Save PDF` button on `/pace/:section` and on the preview branch of the print page.
Never in a `?print=1` branch, which fires `window.print()` on mount.

**The control is per-page, and that does not contradict the header rule.**
CSV moved into the header because CSV export is *dataset* scoped: nine domains, five pages, three
domains with no page at all, which is how six domains shipped exports nobody could reach. The
dialog exists to answer "which dataset?".
This control is *document* scoped. It exports the DOM on screen at the scale currently set, so
there is no "which sheet?" question to answer. In the header it would manufacture one and sit
permanently disabled on every route without a sheet.

`SheetPreview`'s `<Paper>` carries `data-sheet-root`, spread from `sheetRootProps()`. An attribute
rather than an `id`, because the catalog editor mounts a second `DataSheetView` in its live preview
and an id must be unique.

### The slide is one picture plus text, and the decomposition is not the obvious one

The `.pptx` is **one full-bleed picture of the sheet with its HTML text hidden, plus one native
PowerPoint text box per hidden run**, laid back on top at its measured position. 47 boxes on a
typical card, about 140 on a full one.

The obvious alternative, capturing the two wheels as pictures and emitting everything else as
text, was tried and rejected: "everything else" is not all text. The sheet draws 13 header rules as
`border-bottom` on heading cells, four tile frames and fills, and up to four tile photos, none of
them text nodes, and all of them would simply have been lost. Photographing the whole page keeps
every one of them, keeps both wheels intact including their labels, and costs no geometry at all,
because a full-bleed picture has nothing to crop and no viewBox to map back.

Four things to know before touching `pace-text-runs.ts`:

- **Hiding is `color: transparent`, never `visibility` and never `display`.** All three hide the
  text; only that one leaves the element's box decoration drawn. The rules under the LTAC and
  TACSAT column heads are `border-bottom` on the heading cells themselves, so hiding those elements
  deletes two of the three header rules from the picture the text is laid over. That was measured,
  not theorised: the first version shipped with one rule where there should be three.
- **Everything inside a `figure` is skipped wholesale.** That is where the wheels live, and each
  wheel also carries a visually hidden accessibility table of 69 text nodes, 138 per sheet, which a
  node-by-node walk would emit as 1x1 text boxes. The wheel labels stay raster on purpose: they are
  anchored start, middle and end against leader lines and ticks that are themselves in the picture,
  so a substituted font slides the text off its leader.
- **`letterSpacing` is read from the COMPUTED style, which is already pixels.** The sheet declares
  tracking in `em` at five different values; converting from `em` would mean re-deriving each
  against its own font size. `a:rPr/@spc` is hundredths of a point.
- **`textTransform` has no DrawingML equivalent**, so `uppercase` is applied to the string. What
  the operator then edits is not what the record holds.

A `wrap="none"` box may be shrink-wrapped to its single line by the consumer. That is harmless for
left-aligned text, which still starts at the measured x, and not harmless for centred text, where a
narrower box re-centres the string and slides it sideways. Non-wrapping is therefore honoured only
for left-aligned runs.

### The PACE card alone gets native text

The catalog datasheet stays a single flat picture, and the asymmetry is deliberate. See
`equipment.md` for the reasons, all of which are properties that card does not have: about 100
hairlines drawn as borders on text divs, a scale that varies with the record's content height, and
rows aligned on a shared baseline, which a PowerPoint text box cannot express.

### Fonts travel with the file

The slide names Oswald and Barlow Condensed, and native text names a font rather than carrying one.
Neither is installed on a standard machine, so both families are embedded, which PowerPoint on
Windows honours. Keynote ignores embedded fonts outright and PowerPoint for Mac is version
dependent about them, so **a slide opened on a Mac showing substituted type says nothing about
whether the embedding is correct.**

`ppt/fonts/*.fntdata` is **EOT, not an sfnt** - see the rule in `AGENTS.md`, because a raw TTF there
fails silently in every direction.

Only these two families are embedded, not the seven `SHEET_FONT_FACES` carries for the raster path.
The other five are IBM Plex, drawn only on the catalog datasheet, which is a picture and so already
carries its own glyphs.

**Confirmed working in PowerPoint on Windows, 2026-09-09.** The text is editable and renders in the
card's own faces on a machine without them installed, which is the only claim that mattered and the
only one no check on a Mac could make.

Worth keeping the reason it was doubted, because the doubt was reasonable and someone will notice
the same thing again. Oswald ships here only as a variable font, so its EOT header reports weight
400, its default instance, and its bold slot points at that same file; the card's one Oswald run is
the w600 title, and the expectation was that it would render light. It does not. PowerPoint handled
the variable face. **Do not "fix" this by adding a static Oswald SemiBold** - that was the planned
remedy and it is not needed, so it would be weight in `public/fonts` bought for nothing.

Barlow Condensed is static at 400 and 700 and carries every table cell, so it was never the risk.

### The no-Tooltip rule has a boundary

The rule applies to the `Print / Save PDF` button because MUI promotes a Tooltip title to
`aria-label` and the chip already has a visible label, so the two would disagree. The share trigger
is an icon at every width, so nothing else names it: it carries a `Tooltip` **and** an explicit
`aria-label`, which makes the promotion a no-op rather than the naming mechanism.

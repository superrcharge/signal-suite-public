# Section domain

Manages unit sections. Fields: `key` (natural string slug, e.g. `asqd`), `label` (stored uppercase), `color` (hex string), `pace_enabled` (boolean, migration 036).

`pace_enabled` is whether the squadron runs a JEM/MPU5 comms card. One flag gates two surfaces - the card at `/pace/:section` **and** the per-squadron nets library at `/nets/:section` - which is why adding HQ needed a row and a flag rather than code. It was a hardcoded list of five in the frontend until then; see `pace.md` for the frontend side, including why the 404 gates now have to wait on the sections query.

Defaults to `false`. A card is a deliberate choice about who produces one, not something every section gets. The starter sections that do are A/B/C/D/F SQD, HQ (migration 036) and SPT (`037_add_st_section.sql`).

**Key derivation:** The label-to-key slugifier collapses whitespace away (no hyphen) and drops non-alphanumerics - `"H SQD"` → `"hsqd"`, `"SPT"` → `"st"`. Migration 012 backfilled the original hyphenated seed keys (`a-sqd` → `asqd`, etc.) and upgraded `terminals.section` FK to `ON UPDATE CASCADE`, so any future key rename via SQL propagates automatically.

That strip is what lets a label carry punctuation safely. SPT keeps its ampersand in the label - which is stored and displayed verbatim, and reaches raw markup only in the PACE emblem SVG, where `escapeXmlText` in `components/pace/emblem.ts` already handles it - while the key stays plain ASCII, so nothing that interpolates a key into a URL path, a query string or a CSV zip entry name has to escape one.

**The rule is stated twice, in two languages, and they have to agree.** `labelToKey` in `pages/terminal-drawer.tsx` (copied verbatim into `kit-drawer.tsx`) and `slugifyKey` in `domain/section/service.go` are the two halves. The Go used to stop after the whitespace collapse while its comment already claimed parity, so `"SPT"` slugified to `st` in the browser and `r&d` through the API; the UI never exposed it, because both drawers slugify client-side and POST the finished key, but curl or a script could store a key that then flowed unencoded into `PATCH /sections/${key}`, `navigate('/nets/${key}')` and a `csvbulk` filename. `slugifyKey` now strips too, and `service_test.go` pins the cases that would have failed against the old version. An input with nothing alphanumeric in it slugifies to `""` and is refused with `SECTION_INVALID_KEY` (400) rather than written as a blank primary key.

**Key changes via UI are still locked** - the section edit dialog only mutates label, color and the PACE squadron toggle. CASCADE is for safe direct-DB rename operations (rare, like the squad rename), not a feature exposed to the app.

## Management endpoints (admin + editor)

- `POST /api/v1/sections` - create
- `PATCH /api/v1/sections/:key` - rename label, change color, and/or toggle `pace_enabled`. All three are optional; `pace_enabled` is a pointer on the request so "leave it alone" and "turn it off" are different requests. A change to it is audited, because switching it off takes a squadron's card and nets library away from everyone with no deploy and no other trace.
- `DELETE /api/v1/sections/:key?reassign_to=<target>` - delete with safe reassignment:
  - section still has **nets or a saved PACE card** → `409 SECTION_HAS_PLANNING_DATA`, whatever `reassign_to` says, and **before anything is moved**. The message names what is there ("3 nets and a saved PACE card"). A squadron's nets and PACE card are its own planning, so a delete neither moves nor clears them.
  - no `reassign_to` param and section has terminals or kits → `409 SECTION_IN_USE` (UI prompts for reassign target and retries)
  - `reassign_to=__none__` → sets `section = NULL` on the affected terminals and kits, then deletes section
  - `reassign_to=<other-key>` → moves all affected terminals and kits to that section (validated to exist and not be self), then deletes
  - Response includes `reassigned` count and optional `to` key

**Why the planning check comes first.** Nets and the five PACE tables (`pace_plans`, `channel_plans`, `pace_freq_rows`, `pace_tmn_rows`, `pace_tiers`) all foreign-key `sections` with no `ON DELETE` rule. The delete used to reassign terminals and kits and only then reach the database, where those keys refused it: a 500, with the terminals and kits already moved and the section still standing. Refusing first closes that without a transaction, because nothing has been touched yet.

**A squadron with a saved PACE card cannot be deleted from the app at all.** Nets can be deleted one at a time, but no route deletes a card - `/pace/:section` has GET and PUT, and DELETE only on its emblem. That is the chosen behaviour, which is why the message says "cannot be deleted while they exist" rather than telling the user to remove something they have no control for. Turning off the **PACE squadron** toggle hides the card and nets library without deleting anything.

## Cross-domain contract

`section.Service` relies on `contracts.TerminalSectionReassigner` (in `shared/contracts/terminal.go`) and `contracts.KitSectionReassigner` (`kit.go`) to count and bulk-reassign terminals and kits during delete, and on `contracts.NetSectionCounter` and `contracts.PaceSectionChecker` (`section.go`) to refuse it. The first two count **and move**; the last two only **report**. All four are wired in `main.go` with setter injection (`sectionService.SetReassigner(terminalService)`, `SetKitReassigner`, `SetNetCounter(netService)`, `SetPaceChecker(paceService)`) so the services can reference each other without a constructor cycle. `service_test.go` pins the refusal, that it moves nothing, and that a failed lookup is a 500 rather than permission.

## Section drill-down (terminals ⇄ kits)

Sections filter both lists - `GET /terminals?sections=` and `GET /kits?sections=` both accept a
comma-joined key list. The sidebar's **By Section** group is route-aware: clicking a section keeps you
on whichever list you are already viewing (`/kits` if that is the current route, otherwise
`/terminals`), highlights active sections on both, and preserves the rest of the query string instead
of rebuilding the URL from scratch. Only `drawer`/`id`/`focus` are dropped, since a filter change can
exclude the row a drawer was opened for.

`ScopeSwitch` (`components/common/scope-switch.tsx`) is the Terminals ⇄ Kits control in both list
toolbars, right of the search field. It shows each side's count for the active section filter - the
host page passes its own total, the counterpart is fetched with `limit: 1` and only `total` is read.
Switching carries `sections`, `status`, and `limit` (shared meaning on both pages) and drops
`model`/`tag`/`type` and drawer state.

The host page also passes its debounced search term, so the counterpart count answers "how many kits
match what I just typed" - `search` is server-side on both endpoints, so these are true totals, not a
count of the loaded page. Switching appends `?search=`, and both pages hydrate their search box from
it on mount. The live prop wins over whatever `?search=` the page was opened with, so clearing the box
and switching does not resurrect a stale term. Search stays local state after mount; the URL is a
deep-link entrypoint only, matching how `?status=` and `?model=` already behave.

## Sidebar UI (admin + editor)

Each section item in the left sidebar has a hover-revealed pencil icon that opens `SectionEditDialog`:
- Label input + 20-color swatch picker (same palette as Add Terminal inline creator) + a **PACE squadron** switch
- Save / Delete / Cancel
- Delete that hits `SECTION_IN_USE` swaps the dialog body in place to a reassign prompt (dropdown of other sections plus "None") and a danger-colored confirm button. No navigation; everything happens inside the modal.

Also reachable from the Settings page Sections panel (table of all sections with same pencil → same dialog; thin wrapper).

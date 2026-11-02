# Product

This page says what the Asset Tracker is for and who it serves.
How it is built is documented elsewhere, starting at [AGENTS.md](../AGENTS.md) and [project.md](../.claude/context/project.md).
Domain words used here are defined in [glossary.md](glossary.md).


## Who made it

Michael Charge created the Asset Tracker and owns it.
He designed and built it, from the first prototype through the current platform, and he is its maintainer.

## What it is

A web application, branded Signal Suite in its header, that does two jobs for one organization.

The first is inventory.
It tracks the organization's fielded SATCOM terminals and kits: which unit each one is filed under, its status, who it is assigned to, and its serial or kit number.
It also tracks the organization's contracts by period of performance and fiscal year.

The second is comms planning.
An Equipment Catalog holds data sheets for types of SATCOM and radio hardware, and four shared libraries hold the waveforms, SATCOM services, transports and external platforms those data sheets and plans refer to; the organizations that take part in an operation are a list picked inside Operations and managed on the Settings page.
From those, each squadron keeps its own list of radio nets and builds a PACE comms card, printed on one landscape page and exportable to a slide.
A joint compatibility matrix reads every waveform against our radios and against other forces' platforms, as the input to a PACE across a joint force.
An operation gathers the organizations taking part in one named effort, records what each brings and in which phase, and plans who must be able to talk to whom in each phase.

Every authenticated user can read and export everything.
Writing is split by role, described below.

## Who uses it

### By app role

The five roles are defined in [authz.md](../.claude/context/authz.md).
Roles are held in the app's own database; Entra only proves who someone is.

| Role | What it can do | Who holds it in practice |
|---|---|---|
| `admin` | Everything, plus changing other users' roles and reading the audit log | headquarters staff. The first person to sign in to a fresh database becomes admin, and the app always keeps at least one |
| `editor` | Create, edit and delete in every domain; no user management | The asset shop, the crew who keep the inventory, catalog and contracts accurate |
| `rto` | Writes waveforms, radio catalog records, nets, PACE cards, transports, platforms, organizations and operations; reads the rest | The squadron RTOs |
| `planner` | Writes nets, PACE cards, transports, platforms, organizations and operations; reads the rest | Planners, mostly signal officers (SIGOs), who build the cards but do not manage inventory |
| `viewer` | Reads and exports only | Everyone else. Every new account starts here until an admin promotes it |

### By operational role

Essentially everyone in the unit uses it, which is why there are five roles rather than one.

- **Section and squadron leads** read the Stats page to see what their unit holds and in what state; the section drill-down in the sidebar is shown to admin and editor only.
- **Comms planners and RTOs in each PACE squadron** maintain the squadron's nets and produce the comms card, then hand it on as a printout or a slide in a brief.
- **The asset shop** keeps terminal and kit records, statuses and assignments current, and curates the Equipment Catalog.
- **Contract and budget staff** track contracts against period-of-performance end dates, fiscal year and execution quarter. Contracts are hidden from navigation for every role but admin and editor, because they are internal; Terminals, Kits and By Section are hidden from navigation on the same terms (`canSeeTrackers`).

The user base is internal, and sign-in is optional: it is off by default and can be switched on with Entra.

## The problem it solves

The original need was a rapid prototype built to solve an immediate operational need, tracking terminals, kit assignments and section ownership for field units.
That prototype was later rebuilt into the current platform.

Before it, nothing was built for the job: tracking lived in poorly managed spreadsheets, email and people's memory.
Two features still carry that history: the catalog's CSV import exists "for bulk-seeding a catalog from a spreadsheet of nomenclatures", and the sheet exports exist so a product can be pasted into a brief "without printing, cropping or screenshotting it".

Several design notes do state the specific problem a feature replaced:

- **Free-hand paths on comms cards.** Before the Transport Library, squadrons typed non-SATCOM paths by hand and "twelve squadrons spelled cellular twelve ways" ([transport.md](../.claude/context/domains/transport.md)).
- **One shared net pool.** Nets were once global, so one squadron editing FIRES changed another squadron's frequency ([net.md](../.claude/context/domains/net.md)).
- **Unreachable exports.** While CSV controls lived on individual pages, domains without a page had no export anywhere; they now sit in the header on every page ([AGENTS.md](../AGENTS.md)).
- **Revised cards with no visible change.** Changed marks exist so whoever receives a revised card can see what moved ([pace.md](../.claude/context/domains/pace.md)).

## What each area is for

**Dashboard** (`/dashboard`).
The home page for every role: one tile for each page the signed-in person can open, in the page menu's order, so what shows depends on the role.
Clicking a tile opens that page, and the Signal Suite mark at the top right of the header brings a person back here from anywhere.

**Stats** (`/stats`).
The fleet overview: terminals and kits by status, type and section, catalog counts, and for admin and editor a contracts panel counting what expires within 30, 60 and 90 days.
Every tile opens the matching filtered list, so it is a way in rather than a report.
Its layout is described in the Stats section of [kit.md](../.claude/context/domains/kit.md).

**Terminals** (`/terminals`).
The register of individual SATCOM terminals across three families, Starshield, Paradigm and OneWeb, with section, status, assignee, serial, kit or PIM number, and a tag for grouping terminals by operation.
It is shown in navigation to admin and editor only; the page stays readable by URL.
See [terminal.md](../.claude/context/domains/terminal.md).

**Kits** (`/kits`).
The register of kits, parallel to terminals, by type (Remote, IFK, ATK) with three independent network flags, BLACK, SECRET and TS, and a location.
It is shown in navigation to admin and editor only, like Terminals.
See [kit.md](../.claude/context/domains/kit.md).

**Sections** (sidebar **By Section**, Settings).
The organization's units.
Filtering by section works on both registers, and a section's PACE squadron setting decides whether it gets a nets library and a comms card.
A section that still holds nets or a saved card cannot be deleted.
See [section.md](../.claude/context/domains/section.md).

**Contracts** (`/contracts`).
Contracts by period of performance, vendor, point of contact, fiscal year, execution quarter and Logform reference, with end dates coloured as they approach.
There is deliberately no cost field.
See [contract.md](../.claude/context/domains/contract.md).

**Equipment Catalog** (`/catalog`, compare, editor, print).
Data sheets for types of SATCOM and radio hardware, filterable the way a shopping site is, comparable side by side, printable, and exportable to a slide.
It describes what a model can do, not which units are held; that is Terminals and Kits.
See [equipment.md](../.claude/context/domains/equipment.md).

**Comms Library** (`/catalog/comms-library`).
The four shared reference tables, each defined once so every record and card spells an entry the same way:

- Waveforms, the signal formats radios carry; see [waveform.md](../.claude/context/domains/waveform.md).
- SATCOM services, with their operator and ultimate owner; see [service.md](../.claude/context/domains/service.md).
- Transports, the fibre, cellular, MANET and other paths a PACE tier can name; see [transport.md](../.claude/context/domains/transport.md).
- Platforms, other forces' aircraft, UAVs, ships, vehicles and ground stations, by branch and type; see [platform.md](../.claude/context/domains/platform.md).

**Joint compatibility matrix** (`/catalog/compatibility`).
Which waveforms any chosen set of platforms and catalog radios share, read live, so a planner can see what a joint force can actually talk on.
See [platform.md](../.claude/context/domains/platform.md).

**Nets Library** (`/nets/:section`).
One squadron's own radio nets, with channel numbers, frequencies and the radio that carries each, kept separately for CONUS and OCONUS.
See [net.md](../.claude/context/domains/net.md).

**PACE Planner** (`/pace/:section`).
The squadron's comms card for each theater: the JEM and MPU5 channel wheels filled from its nets, the Primary, Alternate, Contingency and Emergency tiles filled from the catalog or the Transport Library, and the LTAC, TACSAT and TACTICAL MISSION NETWORK tables.
It prints on one landscape page and exports to an editable slide.
See [pace.md](../.claude/context/domains/pace.md).

**Operations** (`/operations`).
One named effort at a time, with an optional acronym, which the picker tile shows as the tile's title (for example "OMS") above the full name that every other surface uses, and no date range because operations are fluid, and the organizations checked in to it: one row per organization, never per person, naming the platforms, terminals, radios and transports it brings and who to call; its waveforms and services follow from those assets rather than being picked.
An operation is cut into ordered phases (Phase I to IV to begin with) and has its own list of locations (ISB, FSB, MSS, the X) that units sit at, which can change by phase.
A participant joins through an eight-step wizard, declaring the platforms it brings (airframes, UAVs, vessels, vehicles, ground stations) before its radios, which phases each asset is present in, and where it sits and who it must talk to in each phase; it can be a library organization or a one-off partner named only on that operation.
The operation page has three views: Loadout, a tab per participant showing what it brings and where it is by phase; Matrix, a capability-by-unit grid of what everyone could talk on; and Web, one phase drawn as locations, units and a line per must-talk requirement coloured Direct, Relay or No link, with a tier select (the supported unit) set per phase.
The Web view and the Matrix both print to PDF and export to an editable `.pptx`, and the joint compatibility matrix is the wider comparison.
The organizations that can join - service components, squadrons, partners and agencies, keyed by a slug that never changes - are managed in Settings, Organizations, and the wizard lists them and its Add to library creates one; see [organization.md](../.claude/context/domains/organization.md).
See [operation.md](../.claude/context/domains/operation.md).

**Users** (`/users`, admin only).
Who has signed in, most recent first, and what role each holds; where roles are changed.
See [user.md](../.claude/context/domains/user.md) and [authz.md](../.claude/context/authz.md).

**Audit log** (Settings, Audit log, admin only; `/audit` redirects there).
Every create, update, delete and role change, with who made it and what changed, kept forever.
See [audit.md](../.claude/context/domains/audit.md).

**Settings** (`/settings`).
One tabbed page fronting sections, tags, organizations, Import/Export and the audit log.
See [settings-page.md](../.claude/context/settings-page.md).

**Import and export** (header share button, every page).
CSV export and import templates for the data domains that declare them, several at once as a `.zip`, and CSV import one file at a time into the domains that support it.
The authority on which domain supports what is `backend/internal/domain/csv-manifest.json`.

**Help** (header `?`, every page).
A searchable FAQ whose answers name the on-screen controls and the roles allowed to use them.
See [help.md](../.claude/context/help.md).

## Environments

| Environment | What it is | How to run it |
|---|---|---|
| Self-hosted | One production container plus PostgreSQL on your own machine, with sign-in off by default | `compose.selfhost.yaml`; see [self-hosting.md](self-hosting.md) |
| Local development | A developer's machine, with sign-in bypassed | Run from the checkout; see [development.md](development.md) |

## Current status

The app is in use and releases are published as container images by `release.yml`.
Authentication and Blob Storage are optional: with auth off every visitor is the built-in admin, and with Blob Storage unset photo upload answers 501.

## What success looks like

Success is two things:

- **Total ownership and accountability** of every terminal assigned to the hand receipt, the property book.
- **Every assigned piece of equipment and capability logged in the catalog**, so it can be used for communications planning against other known platforms and waveforms, for joint and FVEY missions.

What the design notes optimize for in service of those two:

- The Stats page and the registers match what is actually on hand, because every status count is computed across the full filtered set rather than one page.
- A squadron can produce a correct comms card for either theater and hand it on as a printout or a slide without retyping anything.
- A planner can answer "which waveforms can all of these assets talk on" from the matrix without assembling it by hand.
- Every dataset can be exported from any page, and every change can be traced to the person who made it.
- A release is known to be serving and booting, not merely published.


## Out of scope

Things the repository states the app deliberately does not do:

- **No cost tracking on contracts.** There is no cost field, by decision ([contract.md](../.claude/context/domains/contract.md)).
- **No soft delete.** Terminals and kits are hard-deleted; no record-keeping use case was identified, and the audit log keeps the history ([terminal.md](../.claude/context/domains/terminal.md)).
- **No roles from the identity provider.** Entra proves identity only; authorization is app-local ([authz.md](../.claude/context/authz.md)).
- **No Key Vault, no auth proxy, no Redis, no sidecar.** One container and one process; the database password is supplied by configuration, and Entra sign-in to Postgres is optional ([self-hosting.md](self-hosting.md)).
- **No classification marking in the UI.** The kit network flags are domain data, not markings.
- **No owner lookup from Entra.** Assignee fields are free text; directory autocomplete was considered and deferred ([terminal.md](../.claude/context/domains/terminal.md)).

Things not built, which the repository records as gaps rather than decisions:

- **No automated end-to-end suite.** The old Playwright suite was bound to the retired auth stack and removed, and no replacement has been written ([development.md](development.md)).

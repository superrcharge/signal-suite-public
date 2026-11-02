# Glossary

This glossary defines the organizational, comms, contracting and platform words that a successor meets in this repository and in the app.
It exists so that nobody has to reverse-engineer what a label means from the code that stores it.
The engineering detail behind each term lives in the file named in the third column; this page only says what the word means.

**The rule for `UNCONFIRMED`.**
A row whose Meaning starts with `UNCONFIRMED` is a guess awaiting the owner's correction.
It is the best inference from the repository and from well-known public usage, and it must not be cited as fact.
Where part of a row is established and part is not, the cell says which part is which.
When a row is confirmed, delete the marker and correct the text in the same change.

Domain files are under `.claude/context/domains/`, shortened below to `domains/<name>.md`.
Companion page: [product.md](product.md) for what the app is for.

## Organization and units

| Term | Meaning | Where it shows up in the app |
|---|---|---|
| SHF | Super High Frequency, the 3 to 30 GHz band where most SATCOM operates. | Frequency band options in the catalog editor and the nets library; `domains/equipment.md` |
| Section | A unit of the organization that assets are filed under. Each has a key (`asqd`), an uppercase label (`A SQD`), a colour and a PACE squadron flag. Migration `023_remove_seed_data.sql` states that the sections are the real unit structure, not seed data. | Sidebar **By Section**, Settings > Sections, the section field on terminals and kits; `domains/section.md` |
| Squadron | The repo's word for a section that runs its own nets library and PACE comms card. Everything under PACE is keyed per squadron. | PACE Planning sidebar group, `/nets/:section`, `/pace/:section`; `domains/pace.md`, `domains/net.md` |
| A SQD to F SQD (the A-F SQD scheme) | The six lettered squadrons, written ASQD, BSQD and so on, and keyed `asqd` to `fsqd`. A, B, C, D and F SQD run PACE cards; E SQD does not | Sections everywhere; `domains/section.md`, migration `036_add_section_pace_enabled.sql` |
| HQ | Headquarters, a starter section with its own nets library and PACE card, added by migration 036 | Sections, PACE Planning; migration `036_add_section_pace_enabled.sql` |
| SPT | Support, a starter section with its own nets library and PACE card, added by migration 037 | Sections, PACE Planning; migration `037_add_st_section.sql` |
| USA, USMC, USN, USAF, USSF, USCG | The US military branches: Army, Marine Corps, Navy, Air Force, Space Force and Coast Guard. They are the closed list a platform's category is picked from, in that order of precedence, each drawn as a coloured chip. | Comms Library > Platforms, the compatibility matrix; `domains/platform.md` |
| OGA | Other Government Agency: an agency inside the government but outside the military, such as CBP, NASA, NOAA or State. The seventh platform category. | Comms Library > Platforms, the compatibility matrix; `domains/platform.md` |
| SOCOM | US Special Operations Command. The repo treats it as a combatant command, not a branch, so it is not a platform category; a SOCOM platform belongs to the service that fields it. | Platform category rules; `domains/platform.md` |
| ARNG, ANG | Army National Guard and Air National Guard. Migration `044_platform_category_branches.sql` mapped them to their parent branch. | Platform category; `domains/platform.md` |
| RTO | Radio Telephone Operator (public military term). Also the name of the `rto` app role, which writes the radio side of the catalog. A net's channel number is described as "the label an RTO writes on a sheet". | Users page, role chip; `.claude/context/authz.md`, `domains/net.md` |

## Comms and equipment

| Term | Meaning | Where it shows up in the app |
|---|---|---|
| SATCOM | Satellite communications. In the catalog, `satcom` is one of the two equipment types, the other being `radio`. | Equipment Catalog type filter, Stats catalog tiles; `domains/equipment.md` |
| Terminal | One fielded SATCOM terminal: a physical unit with a name, model, serial, section, status, owner and notes. Not the same thing as a catalog record, which describes a type of hardware. | Terminals page, Stats; `domains/terminal.md` |
| Kit | A transportable set of comms equipment, issued and tracked as one asset: an IFK, an ATK or a Remote kit (RK). What a kit contains varies too much to list, and the people using the app know it; the app tracks the kit, not its contents. A kit has a type, three network flags, a location, an owner and the shared statuses. A terminal's `Kit #` field is free text and is not linked to a kit record | Kits page, Stats; `domains/kit.md` |
| Remote | One of the three kit types, the Remote kit (RK) | Kits type filter and sidebar; `domains/kit.md` |
| IFK | In-Flight Kit, one of the three kit types | Kits type filter and sidebar; `domains/kit.md` |
| ATK | At-The-Halt Kit, one of the three kit types | Kits type filter and sidebar; `domains/kit.md` |
| BLACK | The transport network. One of three independent network flags on a kit, saying the kit can join it. They are domain data, not classification markings | Kits page columns and drawer **Networks**; `domains/kit.md` |
| SECRET | The second kit network flag, for a kit that carries a Secret-level network, independent of the others | Kits page columns and drawer **Networks**; `domains/kit.md` |
| TS | Top Secret. The third kit network flag, for a kit that carries a Top Secret-level network, independent of the others | Kits page columns and drawer **Networks**; `domains/kit.md` |
| Starshield | SpaceX's government satellite service built on the Starlink constellation (public). In the app, a terminal family with models `Mini` and `HP`. Only Starshield terminals carry a PoP pin. | Terminals page, sidebar family group, Stats; `domains/terminal.md` |
| Paradigm | A terminal family named for its manufacturer, with models `Hornet` and `Ragno`. Paradigm terminals record a PIM # instead of a Kit #. | Terminals page, sidebar family group, Stats; `domains/terminal.md` |
| PIM # | The identifier recorded for a Paradigm (Hornet or Ragno) terminal where other families record a Kit #. PIM is Paradigm's interface module, the controller the terminals are operated through (public product term). | Terminals column "Kit / PIM #"; `domains/terminal.md` |
| OneWeb | The Eutelsat OneWeb low-earth-orbit constellation: operated as OneWeb and owned by Eutelsat, a French company. In the app, a terminal family with models `OW-7`, `OW-10` and `OW-11`. | Terminals page, sidebar family group, Stats; `domains/terminal.md`, `domains/service.md` |
| Terminal models: Mini, HP, Hornet, Ragno, OW-7, OW-10, OW-11 | The closed list of terminal models the app tracks, by family: Starshield `Mini` and `HP`, Paradigm `Hornet` and `Ragno`, and the OneWeb OW series, `OW-7`, `OW-10` and `OW-11` | Terminals model column and filter, sidebar family groups, Stats; `domains/terminal.md` |
| Kit # | The kit number written on a terminal record, for Starshield and OneWeb terminals. Free text. | Terminals column "Kit / PIM #"; `domains/terminal.md` |
| PoP pin | The point of presence a Starshield terminal is pinned to: US-EAST, US-WEST, Germany, United Kingdom or Australia. Not the same as POP, period of performance, under Contracts. | Terminals column "PoP", terminal drawer; `domains/terminal.md` |
| Equipment Catalog | Data sheets for types of SATCOM and radio hardware, with bands, specs, SWAP, features, services or waveforms, and a photo. It describes what a model can do, not which units are held. | `/catalog`, data sheet, Compare, Editor; `domains/equipment.md` |
| Nomenclature, nickname | Nomenclature is a record's formal designation, such as `AN/PRC-158`; the nickname is what operators call it, such as "Falcon". A PACE card prints the nickname. | Catalog data sheet header, PACE tiles; `domains/equipment.md`, `domains/pace.md` |
| Operational mode | How a piece of equipment is used, such as on the move. Stored as free values and never aliased, so `on the move` and `COTM` are kept as two values. | Catalog facet rail, data sheet; `domains/equipment.md` |
| COTM | Communications on the move (public term). One of the operational mode values. | Catalog facet rail; `domains/equipment.md` |
| HF, VHF, UHF, L, S, C, X, Ku, K, Ka | Radio frequency bands. The catalog's SATCOM frequency table uses S, C, X, Ku, K and Ka; the radio table uses HF, VHF, UHF, L, S and C. | Catalog data sheet, band facet, Compare; `domains/equipment.md` |
| EIRP | Effective isotropic radiated power, a transmit-strength figure recorded per band. | Catalog data sheet, Compare; `domains/equipment.md` |
| G/T | Gain-to-noise-temperature, a receive-sensitivity figure recorded per band. | Catalog data sheet, Compare; `domains/equipment.md` |
| SWAP | Size, weight and power (often written SWaP). The physical block of a data sheet. | Catalog data sheet, weight facet; `domains/equipment.md` |
| Waveform | A signal format a radio can operate with. Defined once in the Global Waveform Library and linked to radio records by abbreviation. Waveforms are the rows of the joint compatibility matrix. | Comms Library > Waveforms, catalog editor Section 03, the matrix; `domains/waveform.md` |
| L16, MADL | Example waveform abbreviations in the repo: Link 16, the tactical data link, and the Multifunction Advanced Data Link used by the F-35 (public terms). | Comms Library > Waveforms, Platforms; `domains/audit.md`, `domains/platform.md` |
| Service (SATCOM service) | A satellite service a terminal can use, such as GX or WGS. Defined once in the Global Services Library and linked to SATCOM records by abbreviation. A PACE tile prints the abbreviation. | Comms Library > Services, catalog editor Section 03; `domains/service.md` |
| GX | Inmarsat Global Express, the repo's standard example of a service abbreviation. | Services Library, PACE tiles; `domains/service.md` |
| WGS | Wideband Global SATCOM, the US military's wideband satellite constellation (public). An example service. | Services Library; `domains/service.md` |
| MUOS | Mobile User Objective System, the US Navy's narrowband UHF SATCOM system (public). The repo's example of a state-owned system for the owner field. | Services Library owner field; `domains/service.md` |
| CIR | Committed Information Rate: the data rate a service guarantees. Recorded per terminal per service, because two terminals on one service carry different committed rates. | Catalog editor **Services Available** rows, data sheet, PACE tiles; `domains/service.md` |
| MIR | Maximum Information Rate: the most a service allows above the committed rate. Recorded beside CIR. | Same as CIR; `domains/service.md` |
| Best Effort | A service sold with no committed rate. The flag clears and disables the CIR and MIR fields. | Catalog editor service rows; `domains/service.md` |
| Operator, owner (`owned_by`, `owner_country`) | The operator is who a service or transport is bought from; the owner is the ultimate controlling parent and the country it is headquartered in. They differ in exactly the cases a DoD reader cares about. | Comms Library > Services and Transports; `domains/service.md`, `domains/transport.md` |
| Transport | A non-SATCOM path a PACE tier can name: a fibre circuit, a cellular plan, a MANET mesh, or another path a squadron runs. Its kind is an open list. | Comms Library > Transports, PACE tier source; `domains/transport.md` |
| MANET | Mobile ad hoc network: radios that form a self-healing mesh with no fixed infrastructure (public term). A default transport kind. | Transports; `domains/transport.md` |
| Platform | An external comms platform that is not our equipment, such as an F-35, a DDG or a ground station. It has a designation, a popular name, one or more branches, a type and the waveforms or radios it carries. | Comms Library > Platforms, the compatibility matrix; `domains/platform.md` |
| Platform type: aircraft, uav, ship, ground vehicle, ground station | The closed list of platform types; every platform has exactly one. | Platform Library filter, matrix filter; `domains/platform.md` |
| UAV | An unmanned aircraft; a platform nobody talks to from inside it, kept apart from aircraft so an operation's matrix can tell the two apart. | Platform type since migration 050; `domains/platform.md` |
| DDG | A guided-missile destroyer (public US Navy hull designation). Used in the repo as an example platform. | Platform examples; `README.md` |
| Net | A radio net: a name, a channel number, TX and RX frequencies, the radio that carries it, its theater and a ROIP flag. Each squadron keeps its own, so two squadrons can each have a net named FIRES with different frequencies. | Nets Library `/nets/:section`, PACE wheels; `domains/net.md` |
| Net radio type: JEM, MPU5, both | Which radio carries a net. A net that runs on both radios is entered once as `both`, which matches either radio's wheel (`CarriedBy` in the net domain). | Nets Library tabs, PACE wheels; `domains/net.md` |
| Channel # (`net_id`) | The human-facing channel label on a net, such as `N01` or `W01`. The UI says "Channel #"; the column is still `net_id`. | Nets Library; `domains/net.md` |
| TX, RX | Transmit and receive frequency. Free text, because a net is recorded as a range or a placeholder as readily as a single figure. | Nets Library; `domains/net.md` |
| FIRES, CMD, ASLT | Common net names in the repo's examples: fires, command and assault (standard military abbreviations). | Nets Library; `domains/net.md` |
| ROIP | Radio over IP: a net carried over an IP network rather than RF alone. | Nets Library flag, marked with the ICE designator; `domains/net.md` |
| ICE | Instant Connect Enterprise, a third-party product whose mark the app uses to designate a ROIP net. | Nets table and PACE card; `frontend/src/components/common/ice-mark.tsx` |
| JEM | JTRS Enhanced MBITR, a handheld tactical radio. One of the two radios on a PACE card, with its own channel wheel, and a net radio type of `jem`, `mpu5` or `both` | Nets Library JEM tab, PACE wheels; `domains/pace.md`, `domains/net.md` |
| MPU5 | Persistent Systems' MPU5, a MANET radio (public product). The second radio on a PACE card, with its own channel wheel. | Nets Library MPU5 tab, PACE wheels; `domains/pace.md`, `domains/net.md` |
| PACE | Primary, Alternate, Contingency, Emergency: the standard military communications-planning method that names four independent ways to communicate, in order of preference (public term). In the app, the PACE Planner produces one comms card per squadron per theater. | PACE Planning, `/pace/:section`; `domains/pace.md` |
| Primary | The first PACE tier: the path used by default. | PACE card tile P, editor "PACE options"; `domains/pace.md` |
| Alternate | The second PACE tier: used when the primary fails. | PACE card tile A; `domains/pace.md` |
| Contingency | The third PACE tier: used when primary and alternate both fail. | PACE card tile C; `domains/pace.md` |
| Emergency | The fourth PACE tier: the last-resort path. | PACE card tile E; `domains/pace.md` |
| TACSAT | Tactical satellite: UHF military SATCOM used for tactical voice and data (public term). On the comms card, a frequency table with NAME, UP, DOWN, CH, SAT and CRYPTO columns, capped at eight rows. | PACE card middle band, editor; `domains/pace.md` |
| LTAC | L-band Tactical Satellite. A frequency table on the comms card with the same columns as TACSAT except CH, capped at eight rows | PACE card middle band, editor; `domains/pace.md` |
| TACTICAL MISSION NETWORK | A tactical mission network. A box of up to six label and value rows on the comms card | PACE card middle band, editor; `domains/pace.md` |
| CONUS, OCONUS | Continental United States, and outside it (public terms). Every squadron keeps one comms card and one nets list for each. | Theater switch on PACE and Nets pages, `?theater=oconus`; `domains/pace.md` |
| Uplink, downlink (UP, DOWN, `dl/ul`) | Ground-to-satellite and satellite-to-ground. A PACE tile prints a terminal's rates as `dl/ul Mbps`. | PACE tiles, TACSAT and LTAC tables; `domains/pace.md` |

## Contracts and money

| Term | Meaning | Where it shows up in the app |
|---|---|---|
| Contract | A tracked contract: title, company, Logform number and link, point of contact, period of performance, execution quarter, fiscal year and notes. There is deliberately no cost field. Only admin and editor see Contracts in the navigation, because contracts are internal; the page is still readable by URL. | Contracts page, Stats contracts panel; `domains/contract.md` |
| POP | Period of performance: the dates a contract runs, `pop_start` to `pop_end` (public contracting term). Not the same as PoP pin, a Starshield point of presence. | Contracts columns, deadline colours; `domains/contract.md` |
| Deadline colours (Expiring, Caution, Watch) | Colouring on a contract's POP end date: red at 30 days or fewer, including expired; orange at 31 to 60; yellow at 61 to 90. The Stats tiles count the same three bands. | Contracts table, Stats; `domains/contract.md` |
| Logform, Logform # | A record in the unit's own proprietary, CRM-related system that tracks the contract action. An optional reference number of up to 20 characters and an optional URL; with a URL the number renders as a link | Contracts second column, contract drawer; `domains/contract.md` |
| FY | Fiscal year, the federal one: 1 October to 30 September, named for the year it ends in, so FY26 runs October 2025 to September 2026. Stored as free text such as `FY26`. | Contracts sidebar grouping, filter; `domains/contract.md` |
| Execution quarter | The fiscal quarter in which a contract is meant to be executed. One of `Q1` to `Q4`, or empty; under the federal fiscal year Q1 is October to December | Contracts column, sortable; `domains/contract.md` |
| POC | Point of contact: the name, email and phone recorded for a contract. | Contracts columns and drawer; `domains/contract.md` |
| Company | The vendor holding the contract, stored as `company`. | Contracts column; `domains/contract.md` |

## App concepts

| Term | Meaning | Where it shows up in the app |
|---|---|---|
| Signal Suite | The product lockup that closes the app header on every page: `SIGNAL` in the text colour and `SUITE` in amber. It is a link to the Dashboard. | App header; `README.md` |
| Dashboard | The home page for every role: one tile for each page the signed-in person can open, in the page menu's order, with the menu's icon and the page title under it. The Signal Suite mark in the header links back to it, and `/` redirects to it. | `/dashboard`; `README.md` |
| Stats | The fleet overview page: terminals and kits counted by status, type and section, catalog tiles, and a contracts panel for admin and editor. Every tile links into the filtered list. Every role sees it. | `/stats`; `domains/kit.md` (Stats section) |
| Asset status | The closed set of seven operational statuses that terminals and kits share, defined once in `backend/internal/shared/assetstatus/assetstatus.go` and `frontend/src/pages/asset-status-constants.ts`. | Status column, stat strips, Stats; `domains/terminal.md`, `domains/kit.md` |
| Available | Status: the asset is free for assignment. | Stat strip, badges (green) |
| On Mission | Status: the asset is out on a mission. | Stat strip, badges (purple) |
| Reserved | Status: the asset is set aside for a planned use. | Stat strip, badges (orange) |
| ALERT, ALERT BLUE, ALERT GREEN | `ALERT` is a status for an asset held on alert (`alert`); ALERT BLUE and ALERT GREEN (`alert-blue`, `alert-green`) are sub-states of it. The three share one amber badge and roll up into a single ALERT tile on every stat strip | Stat strip, badges (amber); `frontend/src/pages/asset-status-constants.ts` |
| INOP | Status: inoperative (standard military abbreviation). | Stat strip, badges (red) |
| Roles | Five app roles stored in the app's own database, not in Entra: admin, editor, rto, planner, viewer. | Users page, role chip beside the avatar, Help > Roles & Access; `.claude/context/authz.md` |
| admin | Role: full access, including changing other users' roles and reading the audit log. | Users, Settings (Audit log); `.claude/context/authz.md` |
| editor | Role: create, edit and delete in every domain; no user management. | Everywhere; `.claude/context/authz.md` |
| rto | Role: scoped writer for waveforms, radio catalog records, nets, PACE cards, transports, platforms, organizations and operations. Cannot write SATCOM records or the Services Library. | Catalog editor, Comms Library, PACE, Operations; `.claude/context/authz.md` |
| planner | Role: scoped writer for nets, PACE cards, transports, platforms, organizations and operations; reads everything else. Its navigation hides the Terminals and Kits trackers, as viewer and rto navigation does, which is decluttering, not a permission. | PACE, Comms Library, Operations; `.claude/context/authz.md` |
| viewer | Role: read and export only. Every new user after the first starts here. | Everywhere, read-only; `.claude/context/authz.md` |
| First user wins | The first person to sign in to a fresh database becomes admin; everyone after starts as viewer until an admin promotes them. | Users page; `.claude/context/authz.md` |
| Last-admin guardrail | The app refuses to demote the only admin, and nobody can change their own role, so handing over means promoting the new admin and having them change yours. | Users page; `.claude/context/authz.md`, Help |
| Tag | One case-insensitive grouping label per terminal that spans sections, typically an operation or exercise name. Tags can be created before any terminal uses them. | Terminal drawer, tag filter buttons, Settings > Tags; `domains/terminal.md` |
| PACE squadron toggle (`pace_enabled`) | The section setting that gives a section its own nets library and comms card. Turning it off hides both without deleting anything. | Section edit dialog, Settings > Sections; `domains/section.md` |
| Comms card | A squadron's PACE Planner sheet for one theater: the JEM and MPU5 channel wheels, the four PACE tiles, the LTAC, TACSAT and TACTICAL MISSION NETWORK tables, and the squadron emblem, laid out for one landscape page. Saved as a whole in one save. | `/pace/:section`, editor, print route, exports; `domains/pace.md` |
| Channel wheel | The numbered dial for one radio on a comms card, one position per channel, with the assigned net's label outside the ring. Sixteen channels by default, sizable per wheel. | PACE card; `domains/pace.md` |
| Tier source | What a PACE tier points at: an Equipment Catalog record, a Transport Library entry, a typed custom line, or nothing. | PACE editor "PACE options"; `domains/pace.md` |
| Theater | CONUS or OCONUS. Each squadron has one card and one nets list per theater, and a card may only assign nets from its own theater, or nets marked for both. | Theater switch, `?theater=`; `domains/pace.md`, `domains/net.md` |
| Operation | A named effort the enterprise plans together, with an optional acronym and notes. With an acronym set, the picker tile shows the acronym itself (for example "OMS") with the full name beneath; every other surface uses the full name. No date range is shown. Organizations join it. It keeps a status in the data, but the app shows it nowhere, because operations are fluid. | Operations |
| Organization | A participant an operation can check in: a service component, a squadron or a partner, with a short label, colour and optional branch. Kept in a library keyed by a lowercase slug that never changes. The library is managed in Settings, Organizations (list, add, edit, delete), and an organization is picked for an operation, or added with Add to library, in the Join Operation wizard, step 1. | Settings, Organizations; Join Operation wizard, step 1; `domains/organization.md` |
| Check-in (participant) | One organization's entry in one operation: the platforms, equipment and transports it brings, the waveforms and services those carry, which phases each asset is present in, and a point of contact. An organization has at most one per operation, and Remove in the Participants popup deletes the row together with its phase marks, placements and requirements; the operation's locations stay. Created by the Join Operation wizard, where naming the organization is enough. | Operation detail; `domains/operation.md` |
| Join Operation | The eight-step wizard that checks one organization in to an operation, or edits its row: organization, platform, equipment, gear and phases, transports, comms links, contact, review. It is opened from the Participants popup, or from the prompt on an empty Loadout view, and is not in the operation's banner. | Operation page; `domains/operation.md` |
| Loadout | The operation page's default view: one tab per participant, every tab laid out the same way - who the unit is, the platforms, equipment and transports it brings with the phases each is in, a By phase table of where it sits and who it must talk to, and its point of contact. | `/operations/:id`, `?view=loadout`; `domains/operation.md` |
| Matrix (operation) | The operation page's capability-by-unit grid: one row per waveform, SATCOM service or transport anyone brings, one column per participant, each cell naming the assets that provide it. It answers "what could everyone talk on" and says nothing about who must; it is not the joint compatibility matrix in the Equipment Catalog. | `/operations/:id`, `?view=matrix`; `domains/operation.md` |
| Web view (phase picture) | One phase drawn as a diagram: locations as boxes holding the participants' cards, and a line for every requirement coloured by its status. Always about one phase, with an automatic layout and a Show switch of All, Gaps and Focus. | `/operations/:id`, `?view=web`; `domains/operation.md` |
| Phase | One ordered stage of an operation, such as Phase I. A new operation starts with Phase I to IV, and the drawer renames, reorders, adds and removes them. Each phase has its own placements of units at locations, its own requirements and its own tier select. | Operation drawer, Matrix and Web phase switch, wizard Phases step; `domains/operation.md` |
| Asset phase mark | A per-asset statement that a platform, catalog record or transport is present in a given phase; waveforms and services have no marks of their own and follow the assets that carry them. An asset with no marks stated is in every phase; one marked in none is brought but never counted. A new phase starts with the marks of the phase before it. | Wizard step 4 phase chips; `domains/operation.md` |
| Location (site) | A physical place units sit during an operation, such as ISB, FSB, MSS or the X. The operation keeps one ordered list and may have none; a unit's location is chosen per phase, so it can move. Called a site in the code and the API. | Operation drawer Locations, wizard Phases step, Web plan panel; `domains/operation.md` |
| Tier select | The one unit a phase's other units support, usually the assault force. Set per phase, only in the Web view's plan panel, and drawn with an amber border and a TIER SELECT tag. | Web view, Loadout By phase table; `domains/operation.md` |
| Requirement (must-talk pair) | A pair of participants that one phase says must be able to talk. Only the stated pairs are checked: it is not everyone to everyone, and no unit is assumed to talk to the joint operations centre unless a pair says so. | Wizard Phases step (Must talk to), Web plan panel; `domains/operation.md` |
| Direct, Relay, No link | The three states of a requirement in its phase. **Direct**: the two units share a waveform, SATCOM service or transport that is present in that phase. **Relay**: they share nothing, but other units present in the phase connect them, on the planning assumption that a unit holding two means can pass traffic. **No link**: neither. Drawn as a solid green line, an amber dashed line and a red line, with the glyphs ✓, ↻ and ✕. | Web view legend, wizard Phases step, Loadout By phase table; `domains/operation.md` |
| Dismounted | A participant with no platform: a ground element that brings radios or nothing, rather than an airframe, vessel or vehicle. The Join Operation wizard's Platform step has a Dismounted / no platform toggle. | Join Operation wizard, step 2; `domains/operation.md` |
| Ad hoc organization | An "Other" participant: a one-off partner named only on one operation's row, with its own name, short label, branch and colour, never added to the Organization Library and gone when that operation or its check-in is. "Add to library" in the wizard is the alternative that creates a global organization. | Join Operation wizard, step 1; `domains/operation.md` |
| Unit | The word the operation screens use for a participant: one organization checked in to one operation. | Loadout tabs, Web unit cards, wizard Phases step; `domains/operation.md` |
| ISB | Location example: intermediate staging base. | Operation drawer Locations, Web view; `domains/operation.md` |
| FSB | Location example: forward staging base. | Operation drawer Locations, Web view; `domains/operation.md` |
| MSS | Location example: mission support site. | Operation drawer Locations, Web view; `domains/operation.md` |
| The X | Location example: the objective. | Operation drawer Locations, Web view; `domains/operation.md` |
| JOC | Joint operations centre. In an operation it is an ordinary participant, never a default hub: no unit is assumed to talk to it unless a phase's requirements say so. | Participants, Must talk pairs; `domains/operation.md` |
| Direct pick | Something chosen by name in the Join Operation wizard rather than inherited from an asset. Direct picks are transports only; a unit's waveforms and services follow the platforms and equipment that carry them. | Join Operation wizard, step 4; `domains/operation.md` |
| Show modes (All, Gaps, Focus) | The Web view's Show switch. **All** draws every requirement line; **Gaps** keeps the same layout and draws only relay and no-link lines, with a count; **Focus** puts one unit in the centre with its partners around it. Remembered per viewer. | Web view; `domains/operation.md` |
| Participants popup | The operation page's list of who has joined, one row per participant, where Join Operation, Edit and Remove live. | `/operations/:id`, `?dialog=participants`; `domains/operation.md` |
| Plan panel | The Web view panel behind the View plan / Hide plan chip that edits a whole phase: its Tier select, each present unit's location and the must-talk pairs, with one Save and a Reset. Writers only. | Web view; `domains/operation.md` |
| planning | Operation status: the default for a new operation, being scoped and not yet under way. Stored on the operation, but no screen shows or sets it. | `domains/operation.md` |
| active | Operation status: under way. Stored on the operation, but no screen shows or sets it. | `domains/operation.md` |
| complete | Operation status: finished. Stored on the operation, but no screen shows or sets it. | `domains/operation.md` |
| RFI | Request for information: a question one unit raises to the others on an operation, with a flat thread of replies. It is posted as one of the operation's units, and only the user who posted it can resolve it. | `/operations/:id`, `?dialog=rfis`; `domains/operation.md` |
| open | RFI status: raised and not yet resolved. Open RFIs are counted on the banner as RFIs (n) and take replies. | RFIs popup; `domains/operation.md` |
| resolved | RFI status: closed by the user who posted it. A resolved RFI keeps its thread, is read-only, and sits in the collapsed Resolved (n) section. There is no reopen. | RFIs popup; `domains/operation.md` |
| Changed marks, version label | A tick on any comms card field makes that value print red, so the reader of a revised card sees what moved. The optional version label (`v2`) prints after the date. Marks are set by hand, not computed. | PACE editor, card, print, exports; `domains/pace.md` |
| Emblem | A squadron's image drawn in the hub of both wheels. | PACE editor; `domains/pace.md` |
| Comms Library | The page holding the four global reference tables: Waveforms, Services, Transports and Platforms. It is not the Nets Library, which is per squadron. | `/catalog/comms-library`; `domains/equipment.md` |
| Nets Library | One squadron's own nets, split into JEM and MPU5 tabs and CONUS and OCONUS lists. | `/nets/:section`; `domains/net.md` |
| Joint compatibility matrix | Every library waveform against chosen platforms and catalog radios, read live at render, so editing a radio moves the matrix. The input to a PACE across a joint force. | `/catalog/compatibility`; `domains/platform.md` |
| Section 03b matrix | The per-radio compatibility table on a radio's data sheet. It is a snapshot copied into the record, and drifting from the live matrix is by design. | Catalog data sheet; `domains/platform.md` |
| Data sheet | One catalog record's full page: specs, frequencies, features and compatibility. Prints and exports. | `/catalog/:id`; `domains/equipment.md` |
| Compare | Any number of catalog records side by side on chosen parameters. | `/catalog/compare`; `domains/equipment.md` |
| Editor (catalog) | The three-pane catalog editor: record list, form and live preview. "Section 03" is its panel of service or waveform toggle chips. | `/catalog/editor`; `domains/equipment.md` |
| Sheet export | Exporting a printable sheet to a `.png`, the clipboard or a `.pptx` slide, so it can be pasted into a brief. | Share menu on printable pages; `AGENTS.md` (slide export section) |
| CSV dataset, template, import | Most data domains export to CSV, and most of those import; operations, audit, users and sections have no CSV. A template is the empty header row an import needs. Several datasets export together as one `.zip`; import is always one file into one dataset. | Header share button; `backend/internal/domain/csv-manifest.json`, `AGENTS.md` |
| Audit log | The append-only record of every create, update, delete and role change, kept forever. Admin only. | Settings, Audit log (`/audit` redirects there); `domains/audit.md` |
| Stat strip | The row of counts at the top of a list page. Clicking a count filters the list. | Terminals, Kits, Contracts, Users pages |
| Drawer | The side panel used to add or edit a terminal, kit, contract, net or operation. | List pages; `domains/terminal.md` |
| Settings | One tabbed page fronting sections management, tags, organizations, Import/Export and the audit log. | `/settings`; `.claude/context/settings-page.md` |
| Help | The searchable FAQ behind the `?` in the header. Each answer names the on-screen controls and the roles allowed to use them. | Header `?`; `.claude/context/help.md`, `frontend/src/help/help-content.ts` |
| EXAMPLE and SEED rows | Placeholder names in import templates (`EXAMPLE STARSHIELD`) and in local sample data (every row named `SEED`), chosen so they cannot collide with real records. | CSV templates, local dev only; `domains/terminal.md`, `README.md` |

## Platform and tooling

| Term | Meaning | Where it shows up in the app |
|---|---|---|
| Entra ID (Entra) | Microsoft Entra ID, formerly Azure Active Directory: the identity provider users sign in with. It proves identity only; roles are held in the app. | Sign-in page; `.claude/context/authz.md` |
| OIDC | OpenID Connect. Users sign in to the app over it when auth is enabled. | Sign-in; `.claude/context/authz.md` |
| MSAL | Microsoft Authentication Library, which the browser app uses to get tokens from Entra. | Sign-in; `.claude/context/authz.md` |
| JWT, JWKS | The signed token the browser sends with each request, and the tenant's published key set the backend checks it against. | Not visible; `.claude/context/authz.md` |
| GHCR | GitHub Container Registry. Every version tag's image is published to it by the release workflow. | Not in the app; `.github/workflows/release.yml` |
| Blob Storage | Optional Azure storage holding equipment photos and squadron emblems. When it is not configured, photo upload answers 501. | Catalog photos, PACE emblems; `docs/self-hosting.md` |
| Goose | The SQL migration tool; every file under `backend/migrations/` starts with `-- +goose Up`. | Not in the app; `AGENTS.md` |
| `verify.mjs`, receipt | The single local verification command, and the file it writes on success that the pre-push hook and the Stop hook read. | Not in the app; `AGENTS.md` |
| `/start`, `/ship` | The session-open gate and the pre-push audit, as Claude Code commands under `.claude/commands/`. | Not in the app; `CLAUDE.md` |

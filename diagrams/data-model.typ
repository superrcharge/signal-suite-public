#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge
#import "design/theme.typ": palette, divider
#import "design/parts.typ": scaled, edge-label, group-tab, legend-under, legend-edge

// Text a step above the shared tokens: tight gaps leave the width to the
// text rather than to whitespace. See design/parts.typ.
#let tokens = scaled(1.15)

// Source of truth: backend/migrations/*.sql. Every table below is a CREATE TABLE
// and every solid edge a REFERENCES clause in that directory - nothing planned,
// nothing retired. The dotted soft() edges are the exception by design: they
// resolve by abbrev or id inside a JSONB or array column, and no FK exists.
// To re-read it:
//   grep -h "CREATE TABLE" backend/migrations/*.sql
//   grep -hoE "REFERENCES [a-z_]+" backend/migrations/*.sql
//
// The six section spokes out of PACE are drawn as ONE edge from the cluster,
// not six from the tables. Six parallel lines to the same target says
// nothing the one line does not, and it costs the diagram its legibility.
//
// Layout is three columns of fixed-width cards, read top to bottom: the hub
// and the assets that key on it, then PACE, then the reference libraries,
// then the three tables no foreign key touches. It is narrow on purpose. The
// README draws it at 838px, and the four-column version it replaced came out
// at 4.6px text there; see design/tokens.typ for the rule.

#set page(
  // auto rather than a fixed width: a magic number is what let an earlier
  // version of this diagram clip its right-hand column silently.
  width: auto,
  height: auto,
  margin: (top: 16pt, bottom: 10pt, left: 6pt, right: 6pt),
  fill: palette.surface,
)

#set text(
  font: ("CaskaydiaMono NFP", "Cascadia Mono", "Consolas"),
  size: tokens.size-body,
  fill: palette.ink,
)

// Every card is the same width and its lines wrap inside it, so no single
// long line can widen a column, and so the whole diagram.
#let card-width = 226pt

// -- Table node: name + (scope) + divider + the columns that carry meaning --
// A name joining two tables with " + " is drawn on two lines. A name too long
// for the card wraps after an underscore, which Typst otherwise never breaks at.
#let tbl(name, scope, cols, hue: palette.blue) = block(width: card-width, stack(
  dir: ttb,
  spacing: tokens.gap-structured-text,
  align(center, text(weight: tokens.weight-bold, size: tokens.size-title, fill: hue.ink,
    name.split(" + ").map(n => n.replace("_", "_\u{200B}")).join([ +#linebreak()]))),
  align(center, text(style: "italic", size: tokens.size-caption, fill: hue.ink, "(" + scope + ")")),
  divider(hue: hue),
  stack(dir: ttb, spacing: 4pt,
    ..cols.map(c => align(left, text(size: tokens.size-label, fill: hue.ink, c)))
  ),
))

#let card(pos, name, scope, cols, hue, nm) = node(pos,
  tbl(name, scope, cols, hue: hue),
  shape: fletcher.shapes.rect,
  fill: hue.fill,
  stroke: (paint: hue.stroke, thickness: tokens.stroke-default),
  inset: 7pt,
  corner-radius: tokens.radius-shape,
  name: nm,
)

// A group: a dashed hull behind its members, captioned by a tab on its own
// top border (design/parts.typ says why the tab, and why it is placed).
#let hull-inset = 12pt
#let hull(members, caption, corner, nm) = node(enclose: members,
  group-tab(caption, corner, hull-inset, t: tokens),
  shape: fletcher.shapes.rect, fill: palette.surface-muted,
  stroke: (paint: palette.border, dash: "dashed", thickness: tokens.stroke-thin),
  corner-radius: tokens.radius-container, inset: hull-inset,
  layer: -1, name: nm)

// -- Edge kinds --
//   fk      a real REFERENCES clause
//   fk-hard REFERENCES ... ON DELETE RESTRICT - the delete a user can be refused
//   soft    resolved by abbrev inside a JSONB column; no FK exists
//
// Every label sits on its own line; see edge-label in design/parts.typ.

#let fk(from, to, lbl: none, via: (), ..args) = edge(from, ..via, to, "-|>",
  ..edge-label(lbl, palette.blue.stroke, t: tokens),
  label-fill: palette.surface, label-side: center,
  stroke: (paint: palette.blue.stroke, thickness: tokens.stroke-default), ..args)

#let fk-hard(from, to, lbl: none, ..args) = edge(from, to, "-|>",
  ..edge-label(lbl, palette.red.stroke, t: tokens),
  label-fill: palette.surface, label-side: center,
  stroke: (paint: palette.red.stroke, thickness: tokens.stroke-emphasis), ..args)

#let soft(from, to, lbl: none, ..args) = edge(from, to, "-o",
  ..edge-label(lbl, palette.ink-muted, t: tokens),
  label-fill: palette.surface, label-side: center,
  stroke: (paint: palette.ink-muted, thickness: tokens.stroke-default, dash: "dotted"), ..args)

#let model = diagram(
  spacing: (30pt, 46pt),

  // == Cluster hulls, drawn behind their members ==
  hull((<pace>, <nets>, <assign>, <plans>, <rows>, <tiers>),
    [PACE: keyed on section and theater], top + right, <pacehull>),
  hull((<transports>, <equipment>, <waveforms>, <services>, <platforms>, <tags>),
    [Reference libraries: never squadron-scoped], top + right, <libhull>),
  hull((<sites>, <placements>, <requirements>, <phases>, <assetphases>, <rfis>, <operations>, <participants>, <orgs>),
    [Operations: who checks in to what, and when], top + right, <ophull>),
  hull((<contracts>, <users>, <audit>),
    [No foreign key in or out], top + right, <standalone>),

  // == Locations and phase plans - row -3: where each unit is, and who must talk ==
  card((0, -3), "operation_sites", "operation",
    ([name . position], [ISB . FSB . MSS . the X], [UNIQUE operation, lower(name)]),
    palette.coral, <sites>),

  card((1, -3), "operation_phase_placements", "unit + phase",
    ([PK phase, participant], [site_id: where the unit is]), palette.coral, <placements>),

  card((2, -3), "operation_requirements", "unit pair + phase",
    ([participant_a < participant_b], [UNIQUE phase, a, b], [who must talk in that phase]),
    palette.coral, <requirements>),

  // == Phases - row -2: which of a check-in's assets is there in which phase ==
  card((0, -2), "operation_phases", "operation",
    ([name . position], [UNIQUE operation, lower(name)], [supported_participant_id], [replaced as an ordered list]),
    palette.coral, <phases>),

  card((1, -2), "operation_participant_asset_phases", "asset + phase",
    ([PK participant, asset_id, phase], [asset_id: no FK, any of the three id arrays], [a row = present in that phase]),
    palette.coral, <assetphases>),

  // The RFI board (054): one card for the question and its flat thread, the
  // way the two PACE row tables share one. A unit asks as one of the
  // operation's participants, and only the user who posted can resolve.
  card((2, -2), "operation_rfis + operation_rfi_comments", "RFI board",
    ([question . status: open | resolved], [participant_id: the unit asked as, SET NULL], [created_by_id: only the poster resolves], [comments: a flat thread, CASCADE]),
    palette.coral, <rfis>),

  // == Operations - row -1, above the hub its organizations key on ==
  card((0, -1), "operations", "operation",
    ([name . acronym], [status: planning | active | complete], [start_date . end_date]),
    palette.coral, <operations>),

  card((1, -1), "operation_participants", "one check-in",
    ([UNIQUE operation, organization_key or adhoc_name], [platform_ids[] . equipment_ids[]], [waveform_abbrevs[] . service_abbrevs[]], [transport_ids[]], [poc_name . poc_phone . poc_email]),
    palette.coral, <participants>),

  card((2, -1), "organizations", "library",
    ([key: PK, immutable slug], [name . short_label . color], [branch: nullable], [section_key: UNIQUE]),
    palette.yellow, <orgs>),

  // == The hub and the assets that key on it - row 0 ==
  card((0, 0), "terminals", "asset",
    ([name . serial . status], [Starshield / Paradigm / OneWeb], [model . pim . owner]),
    palette.blue, <terminals>),

  card((1, 0), "sections", "the hub",
    ([key: PK, 9 foreign keys in], [label . color], [pace_enabled -> comms card]),
    palette.green, <sections>),

  card((2, 0), "kits", "asset",
    ([name . type], [Remote / IFK / ATK], [black . secret . topsecret], [status . owner . location]),
    palette.blue, <kits>),

  // == PACE - rows 1 and 2 ==
  card((0, 1), "pace_plans", "squadron + theater",
    ([UNIQUE section, theater], [emblem . version . header], [changed marks on each row]),
    palette.coral, <pace>),

  card((1, 1), "nets", "squadron + theater",
    ([name . net_id . tx / rx . roip], [radio_type: jem | mpu5 | both], [theater: conus | oconus | both], [UNIQUE section, theater, lower(name)]),
    palette.orange, <nets>),

  card((2, 1), "channel_assignments", "wheel position",
    ([channel 1..count, max 64], [plan_id: CASCADE], [net_id: RESTRICT]), palette.orange, <assign>),

  card((0, 2), "pace_freq_rows + pace_tmn_rows", "squadron + theater",
    ([LTAC . TACSAT . TACTICAL MISSION NETWORK], [capped at 8 / 8 / 6 rows], [UNIQUE section, theater, block, position]),
    palette.coral, <rows>),

  card((1, 2), "pace_tiers", "squadron + theater",
    ([tier: P / A / C / E], [equipment_id -> equipment], [transport_id -> transports], [or a typed line], [UNIQUE section, theater, tier]),
    palette.coral, <tiers>),

  card((2, 2), "channel_plans", "squadron + theater",
    ([one per radio_type], [UNIQUE section, theater, radio_type]),
    palette.orange, <plans>),

  // == Global reference libraries - rows 3 and 4 ==
  card((0, 3), "transports", "library",
    ([name . kind . provider], [owned_by], [kinds open: fiber, cellular, manet, other]), palette.yellow, <transports>),

  card((1, 3), "equipment", "catalog",
    ([nomenclature . make], [terminal_type: satcom | radio], [data JSONB: the datasheet], [with waveform + service abbrevs]),
    palette.yellow, <equipment>),

  card((2, 3), "waveforms", "library",
    ([abbrev . name], [carried by radio equipment]), palette.yellow, <waveforms>),

  card((1, 4), "services", "library",
    ([abbrev . name . owned_by], [SATCOM; rates live on equipment]), palette.yellow, <services>),

  // tags has no foreign key either, but it is a global catalog, which is what
  // this group is; drawing it here keeps the last band to one row.
  card((0, 4), "tags", "catalog",
    ([the terminal tag catalog], [name; a terminal stores its spelling]), palette.purple, <tags>),

  card((2, 4), "platforms", "library",
    ([designation . type], [category[]], [waveform_abbrevs[]], [equipment_ids[]]), palette.yellow, <platforms>),

  // == No foreign key in or out - row 5 ==
  card((0, 5), "contracts", "asset",
    ([vendor . poc . logform], [pop_start . pop_end], [fy . execution quarter]),
    palette.blue, <contracts>),

  card((1, 5), "users", "platform",
    ([oidc_subject . email], [roles: admin / editor / rto / planner / viewer], [preferences]),
    palette.purple, <users>),

  card((2, 5), "audit_log", "platform",
    ([append-only], [actor . action . entity], [before / after payload]),
    palette.purple, <audit>),


  // == Edges - every fk and fk-hard is a REFERENCES clause; soft is not ==
  // The two spokes into sections carry no label: a foreign key into sections is
  // always its section column, and the gaps are too narrow to hold one.
  fk(<terminals>, <sections>),
  fk(<kits>, <sections>),
  fk(<pacehull>, <sections>, lbl: [section x6], label-pos: 0.4),

  fk(<participants>, <operations>),
  fk(<phases>, <operations>),
  fk(<assetphases>, <phases>),
  fk(<assetphases>, <participants>),
  fk(<sites>, <operations>, bend: -45deg),
  fk(<placements>, <sites>),
  fk(<placements>, <phases>),
  fk(<requirements>, <phases>),
  fk(<placements>, <participants>, via: ((1.5, -2.5), (1.5, -1.5))),
  fk(<phases>, <participants>, lbl: [supported]),
  fk(<requirements>, <participants>, lbl: [a / b], label-pos: 0.3, via: ((2, -2),)),
  fk-hard(<participants>, <orgs>),
  fk(<orgs>, <sections>),
  fk(<rfis>, <participants>),
  fk(<rfis>, <operations>, via: ((1.5, -1.5), (0.5, -1.5))),

  fk(<assign>, <plans>, lbl: [plan_id]),
  fk-hard(<assign>, <nets>),

  fk(<tiers>, <equipment>, lbl: [equipment_id]),
  fk(<tiers>, <transports>, lbl: [transport_id]),

  soft(<equipment>, <waveforms>),
  soft(<equipment>, <services>, lbl: [abbrev]),
  soft(<platforms>, <waveforms>, lbl: [waveform_abbrevs]),
  soft(<platforms>, <equipment>, lbl: [equipment_ids]),
)

#legend-under(model, t: tokens, (
  (legend-edge((paint: palette.blue.stroke, thickness: tokens.stroke-default), marks: "-|>"),
    [foreign key. The arrow points at the referenced table]),
  (legend-edge((paint: palette.red.stroke, thickness: tokens.stroke-emphasis), marks: "-|>"),
    [ON DELETE RESTRICT. Deleting a net that sits on a wheel, or an organization that is checked in to an operation, is refused, and the error names which]),
  (legend-edge((paint: palette.ink-muted, thickness: tokens.stroke-default, dash: "dotted"), marks: "-o"),
    [no foreign key. equipment.data JSONB carries service and waveform abbrevs, and both libraries were backfilled from them; platforms carry abbrev and equipment id arrays]),
  (box(width: 14pt, height: 10pt, rect(width: 100%, height: 100%,
      fill: palette.green.fill,
      stroke: (paint: palette.green.stroke, thickness: tokens.stroke-default),
      radius: 3pt)),
    [sections. Deleting one prompts to reassign its terminals and kits, and is refused while it has nets or PACE card data]),
),
note: [29 tables across 54 migrations. Uniqueness inside PACE is per squadron and per theater, never global: several squadrons run a FIRES, and one editing it must not change another's.])

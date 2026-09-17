#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge
#import "design/tokens.typ": tokens
#import "design/theme.typ": palette, divider

// Source of truth: backend/migrations/*.sql. Every table and every edge below is
// a CREATE TABLE or a REFERENCES clause in that directory - nothing planned,
// nothing retired. To re-read it:
//   grep -h "CREATE TABLE" backend/migrations/*.sql
//   grep -hoE "REFERENCES [a-z_]+" backend/migrations/*.sql
//
// The seven section spokes out of PACE are drawn as ONE edge from the cluster,
// not seven from the tables. Seven parallel lines to the same target says
// nothing the one line does not, and it costs the diagram its legibility.

#set page(
  // auto rather than a fixed width: a magic number is what let the previous
  // version of this diagram clip its right-hand column silently.
  width: auto,
  height: auto,
  margin: (top: 24pt, bottom: 32pt, left: 24pt, right: 24pt),
  fill: palette.surface,
)

#set text(
  font: ("CaskaydiaMono NFP", "Cascadia Mono", "Consolas"),
  size: tokens.size-body,
  fill: palette.ink,
)

// -- Table node: name + (scope) + divider + the columns that carry meaning --
#let tbl(name, scope, cols, hue: palette.blue) = stack(
  dir: ttb,
  spacing: tokens.gap-structured-text,
  block(width: 100%, align(center,
    text(weight: tokens.weight-bold, size: tokens.size-title, fill: hue.ink, name)
  )),
  block(width: 100%, align(center,
    text(style: "italic", size: tokens.size-caption, fill: hue.ink, "(" + scope + ")")
  )),
  divider(hue: hue),
  stack(dir: ttb, spacing: 3pt,
    ..cols.map(c => align(left, text(size: tokens.size-label, fill: hue.ink, c)))
  ),
)

#let card(pos, name, scope, cols, hue, nm) = node(pos,
  tbl(name, scope, cols, hue: hue),
  shape: fletcher.shapes.rect,
  fill: hue.fill,
  stroke: (paint: hue.stroke, thickness: tokens.stroke-default),
  inset: tokens.pad-inside-shape,
  corner-radius: tokens.radius-shape,
  name: nm,
)

// -- Edge kinds --
//   fk      a real REFERENCES clause
//   fk-hard REFERENCES ... ON DELETE RESTRICT - the delete a user can be refused
//   soft    resolved by abbrev inside a JSONB column; no FK exists
#let fk(from, to, lbl) = edge(from, to, "-|>",
  text(size: tokens.size-label, fill: palette.blue.stroke, lbl),
  label-fill: palette.surface, label-sep: tokens.label-sep,
  stroke: (paint: palette.blue.stroke, thickness: tokens.stroke-default))

#let fk-hard(from, to, lbl) = edge(from, to, "-|>",
  text(size: tokens.size-label, fill: palette.red.stroke, lbl),
  label-fill: palette.surface, label-sep: tokens.label-sep,
  stroke: (paint: palette.red.stroke, thickness: tokens.stroke-emphasis))

#let soft(from, to, lbl) = edge(from, to, "-o",
  text(size: tokens.size-label, fill: palette.ink-muted, lbl),
  label-fill: palette.surface, label-sep: tokens.label-sep,
  stroke: (paint: palette.ink-subtle, thickness: tokens.stroke-thin, dash: "dotted"))

#diagram(
  spacing: (140pt, 92pt),

  // == Cluster hulls, drawn behind their members ==
  node(enclose: (<pace>, <nets>, <assign>, <plans>, <rows>, <tiers>),
    align(bottom + right, text(size: tokens.size-label, fill: palette.ink-subtle,
      style: "italic", [PACE - every table below but channel_assignments keys on section])),
    shape: fletcher.shapes.rect, fill: palette.surface-muted,
    stroke: (paint: palette.border, dash: "dashed", thickness: tokens.stroke-thin),
    corner-radius: tokens.radius-container, inset: tokens.pad-inside-container,
    layer: -1, name: <pacehull>),

  // Bottom-left, not bottom-right: platforms is the bottom-right member, and a
  // caption anchored there ran underneath its card. Nothing sits below
  // transports, so the bottom-left corner is empty.
  node(enclose: (<transports>, <equipment>, <waveforms>, <services>, <platforms>),
    align(bottom + left, text(size: tokens.size-label, fill: palette.ink-subtle,
      style: "italic", [Global reference libraries - never squadron-scoped])),
    shape: fletcher.shapes.rect, fill: palette.surface-muted,
    stroke: (paint: palette.border, dash: "dashed", thickness: tokens.stroke-thin),
    corner-radius: tokens.radius-container, inset: tokens.pad-inside-container,
    layer: -1),

  // == Platform - column 0. None of these carries a section. ==
  card((0, 0), "users", "platform",
    ([oidc_subject . email], [role: admin / editor / rto / planner / viewer], [preferences]),
    palette.purple, <users>),

  card((0, 1), "audit_log", "platform",
    ([append-only], [actor . action . entity], [before / after payload]),
    palette.purple, <audit>),

  card((0, 2), "tags", "platform",
    ([the terminal tag catalog], [name]), palette.purple, <tags>),

  // == Assets - column 1 ==
  card((1, 0), "terminals", "asset",
    ([name . serial . status], [Starshield / Paradigm / OneWeb], [model . pim . owner]),
    palette.blue, <terminals>),

  card((1, 1), "kits", "asset",
    ([name . type: Remote / IFK / ATK], [black . secret . topsecret], [status . owner . location]),
    palette.blue, <kits>),

  card((1, 2), "contracts", "asset",
    ([vendor . poc . logform], [pop_start . pop_end], [fy . exec quarter]),
    palette.blue, <contracts>),

  // == The hub. Eight foreign keys point here. ==
  card((2, 1), "sections", "the hub",
    ([key - PK, 8 foreign keys point here], [label . color], [pace_enabled -> comms card]),
    palette.green, <sections>),

  // == PACE - rows 4 and 5 ==
  card((1, 3), "pace_plans", "per squadron",
    ([UNIQUE section], [emblem . version . sheet header], [changed marks on every PACE row]),
    palette.coral, <pace>),

  card((2, 3), "nets", "per squadron",
    ([name . net_id . tx/rx], [radio_type: jem | mpu5 | both], [roip]),
    palette.orange, <nets>),

  card((3, 3), "channel_assignments", "wheel position",
    ([channel 1..channel_count, max 64], [plan_id . net_id]), palette.orange, <assign>),

  card((3, 4), "channel_plans", "per squadron",
    ([one per radio_type], [UNIQUE section, radio_type]),
    palette.orange, <plans>),

  card((1, 4), "pace_freq_rows + pace_tmn_rows", "per squadron",
    ([LTAC . TACSAT . TACTICAL MISSION NETWORK], [capped 8 / 8 / 6 rows], [UNIQUE section, block, position]),
    palette.coral, <rows>),

  card((2, 4), "pace_tiers", "per squadron",
    ([tier: P / A / C / E], [equipment_id | transport_id | typed], [UNIQUE section, tier]),
    palette.coral, <tiers>),

  // == Global reference libraries - rows 6 and 7, under pace_tiers ==
  card((1, 5), "transports", "library",
    ([name . kind . provider], [fiber / cellular / manet / other, open]), palette.yellow, <transports>),

  card((2, 5), "equipment", "catalog",
    ([nomenclature . make], [terminal_type: satcom | radio], [data JSONB - the datasheet]),
    palette.yellow, <equipment>),

  card((3, 5), "waveforms", "library",
    ([abbrev . name], [carried by radio equipment]), palette.yellow, <waveforms>),

  card((2, 6), "services", "library",
    ([abbrev . name], [SATCOM; the rates live on equipment]), palette.yellow, <services>),

  card((3, 6), "platforms", "library",
    ([designation . category . kind], [waveform_abbrevs[] . equipment_ids[]]), palette.yellow, <platforms>),

  // == Edges - every one a REFERENCES clause ==
  fk(<terminals>, <sections>, [section]),
  fk(<kits>, <sections>, [section]),
  fk(<pacehull>, <sections>, [section x6]),

  fk(<assign>, <plans>, [plan_id . CASCADE]),
  fk-hard(<assign>, <nets>, [net_id . RESTRICT]),

  fk(<tiers>, <equipment>, [equipment_id]),
  fk(<tiers>, <transports>, [transport_id]),

  soft(<equipment>, <waveforms>, [abbrev]),
  soft(<equipment>, <services>, [abbrev]),
  soft(<platforms>, <waveforms>, [abbrev]),
  soft(<platforms>, <equipment>, [equipment_ids]),
)

// -- Legend - outside the diagram, so it cannot inflate a column --
#v(tokens.gap-cell * 2)
#line(length: 100%, stroke: tokens.stroke-thin + palette.border-muted)
#v(tokens.gap-cell)
#text(size: tokens.size-label, weight: tokens.weight-bold,
  fill: palette.ink-muted, upper([Legend]))
#v(tokens.gap-cell)

#let leg(marker, desc) = grid(
  columns: (120pt, auto),
  column-gutter: tokens.gap-cell,
  align: horizon,
  marker,
  text(size: tokens.size-label, fill: palette.ink-muted, desc),
)

#stack(dir: ttb, spacing: 8pt,
  leg(text(fill: palette.blue.stroke, [--------|>]),
      [foreign key. The arrow points at the referenced table]),
  leg(text(fill: palette.red.stroke, weight: tokens.weight-bold, [========|>]),
      [ON DELETE RESTRICT. Deleting a net that sits on a wheel is refused, and the error names the wheels]),
  leg(text(fill: palette.ink-subtle, [. . . . . .o]),
      [no foreign key. equipment.data JSONB carries service and waveform abbrevs, and both libraries were backfilled from them; platforms carry abbrev and equipment id arrays]),
  leg(stack(dir: ltr, spacing: 4pt,
      box(width: 14pt, height: 9pt, rect(width: 100%, height: 100%,
        fill: palette.green.fill,
        stroke: (paint: palette.green.stroke, thickness: tokens.stroke-default),
        radius: 3pt))),
      [sections. Deleting one prompts to reassign its terminals and kits, and is refused while it has nets or PACE card data]),
)

#v(tokens.gap-cell)
#text(size: tokens.size-label, fill: palette.ink-subtle, style: "italic",
  [19 tables across 41 migrations. Uniqueness inside PACE is per squadron, never global: several squadrons run a FIRES, and one editing it must not change another's.])

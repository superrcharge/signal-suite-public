// ==============================================================
// Parts - the pieces every diagram draws the same way.
//
// Each of these was worked out on the data model and then needed by
// all four diagrams, so it lives here once rather than as four copies
// that drift. Nothing here picks a colour or a size of its own: sizes
// come from tokens.typ and colours from theme.typ.
// ==============================================================

#import "tokens.typ": tokens
#import "theme.typ": palette
#import "@preview/fletcher:0.5.8" as fletcher: diagram, edge

// A legend sample drawn by Fletcher with the very stroke and marks the edge
// kind uses, so the legend cannot disagree with the picture. The markers used
// to be typed characters ("= = = >", ". . . .>") that stood in for a stroke
// and matched none of them: a thick dashed edge read as a double line, a
// dashed one as dot-dash. Pass the same `stroke` and `marks` the edge
// definition passes, and nothing else.
#let legend-edge(stroke, marks: "->", width: 64pt) = box(
  height: 10pt,
  align(horizon, diagram(
    spacing: (width, 0pt),
    node-inset: 0pt,
    edge((0, 0), (1, 0), marks, stroke: stroke),
  )),
)

// Text sizes scaled up by k, for a diagram with whitespace to trade for
// larger text. Up only: tokens.typ is the floor the legibility check in
// scripts/check-docs.mjs reads, so a diagram may be larger than it,
// never smaller.
#let scaled(k) = {
  assert(k >= 1, message: "scaled() only scales text up; tokens.typ is the floor")
  tokens + (
    size-label: tokens.size-label * k,
    size-caption: tokens.size-caption * k,
    size-body: tokens.size-body * k,
    size-title: tokens.size-title * k,
    label-size: tokens.label-size * k,
  )
}

// An edge label, as the positional arguments to pass to edge(). A label
// sits ON its line, which runs through it (label-side: center at the call
// site), so it can only be read as belonging to that line. Labels beside a
// line were read as belonging to a neighbouring line, or to nothing.
//
// none gives no label at all. An empty [] would still draw its label-fill
// box, which shows as a stray dot on the line.
#let edge-label(lbl, ink, t: tokens) = if lbl == none { () } else {
  (text(size: t.size-label, fill: ink, lbl),)
}

// A group caption drawn as a tab straddling the group's own top border, so
// it cannot be read as naming the group above or below it. Pass the result
// as the content of an enclosing node() whose inset is `inset`.
//
// It is place()d because Fletcher sizes a grid column by the content of an
// enclosing node centred in it: an unplaced caption widens that column by
// its own length, which cost the data model 242 units once.
#let group-tab(caption, corner, inset, t: tokens) = place(corner,
  dx: if corner.x == right { inset - 10pt } else { 10pt - inset },
  dy: -inset - 0.8em,
  box(fill: palette.surface, stroke: (paint: palette.border, thickness: t.stroke-thin),
    radius: 4pt, inset: (x: 6pt, y: 3pt),
    text(size: t.size-label, fill: palette.ink-muted, style: "italic", caption)))

// A legend, held to the width of the diagram it sits under, so its prose
// wraps beneath the picture instead of widening the page past it.
// `entries` is a list of (marker, description) pairs; `note` is the italic
// line under them, or none.
#let legend-under(fig, entries, note: none, marker-width: 72pt, t: tokens) = context {
  let w = measure(fig).width
  fig
  block(width: w, {
    v(t.gap-cell)
    line(length: 100%, stroke: t.stroke-thin + palette.border-muted)
    v(t.gap-cell * 0.6)
    text(size: t.size-label, weight: t.weight-bold, fill: palette.ink-muted, upper([Legend]))
    v(t.gap-cell * 0.6)
    stack(dir: ttb, spacing: 8pt,
      ..entries.map(((marker, desc)) => grid(
        columns: (marker-width, 1fr),
        column-gutter: t.gap-cell,
        align: (left + horizon, left + horizon),
        marker,
        text(size: t.size-label, fill: palette.ink-muted, desc),
      )))
    if note != none {
      v(t.gap-cell * 0.8)
      text(size: t.size-label, fill: palette.ink-subtle, style: "italic", note)
    }
  })
}

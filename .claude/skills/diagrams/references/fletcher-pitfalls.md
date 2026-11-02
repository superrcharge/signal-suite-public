<!-- Vendored from the TAU platform team's typst-diagrams skill (references/fletcher-pitfalls.md), 2026-09-28, so this repo's diagrams can be edited without it. Only punctuation was changed (em and en dashes to "-", per this repo's style gate). The one path under ~/tau/ below names an example in TAU's own workspace, not in this repo. -->

# Fletcher pitfalls

Version-specific gotchas in Fletcher 0.5.x and the patterns that work around them. Reach here when something doesn't render the way the source suggests it should.

## Self-loop circular extent (auto-page-height blow-up)

**Symptom.** A diagram with `edge((0,0), (0,0), bend: …)` inside a document that uses `set page(height: auto)` produces a wildly oversized SVG (page height around 4×10¹⁷pt). Visible content is compressed to invisibility; the file looks blank.

**Cause.** Fletcher computes self-loop extent relative to the page height; `height: auto` makes the page height a function of content height; the two diverge in fixed-point iteration.

**Workaround.**

1. Give the loop endpoint a name: `node((0, 0), [reading], name: <r>)`, then `edge(<r>, <r>, "->", bend: …)`. Self-loops via positional `(0, 0) → (0, 0)` don't reliably resolve.
2. Wrap the loop's `diagram(...)` inside a fixed-size `box(width: …, height: …, clip: true)`. The fixed dimensions break the circular dependency.

```typst
box(width: 240pt, height: 180pt, clip: true,
  diagram(
    spacing: (60pt, 60pt),
    node((0, 0), [reading], name: <r>),
    edge(<r>, <r>, "->", bend: 150deg),
  ),
)
```

## Self-loop bend angle range

**Symptom.** A self-loop with `bend: 180deg` collapses (loop diameter approaches infinity); at very small bends (<115°) the loop hides inside the source node.

**Workaround.** Stay in the practical range `(115°, 160°)`. The midpoint (~138°) gives a balanced loop.

## `repr()` of unicode-escape strings

**Symptom.** `repr("\u{F00C}").slice(3, 7)` returns `{f00`, not `f00c`.

**Cause.** `repr()` on a single-codepoint string returns a 10-char form `"\u{f00c}"` (literal quotes + `\u{` + 4 hex + `}`). Indices 0-2 are `"\u`, index 3 is `{`, the hex starts at index 4, the closing `}"` is the last 2 chars.

**Workaround.** Slice from index 4 to `len() - 2` for robustness across hex lengths:

```typst
let r = repr(codepoint)
let hex = upper(r.slice(4, r.len() - 2))
```

## let-rebind inside an if-block

**Symptom.** A `#let` variable conditionally reassigned inside `if … { x = … }` doesn't propagate the new value when read later in the same function body. Cells that depend on the rebound value silently render in their pre-condition state.

**Workaround.** Use immutable conditional bindings instead of mutation:

```typst
// Don't:
let s-color = base-color
if faded { s-color = base-color.lighten(60%) }

// Do:
let s-color = if faded { base-color.lighten(60%) } else { base-color }
```

Reach for this any time a cell renders in the wrong state - it's almost always a mutation that didn't propagate.

## Fletcher mark word-form coverage

**Symptom.** `edge(a, b, "-round")` errors with `Invalid marks shorthand`.

**Cause.** Fletcher's mark parser accepts word forms only for primitives explicitly registered with that name. Defined primitives `round` and `origin` are accessible only via aliases, not word form.

**Word forms that parse:** `head`, `straight`, `solid`, `stealth`, `bar`, `hook`, `circle`, `square`, `diamond`, `cross`, `bracket`, `parenthesis`, `crowfoot`.

**Aliases:** `>` head, `<` rev-head, `|>` stealth, `<|` rev-stealth, `|` bar, `/` bar@60°, `o` / `O` circle small/large, `x` / `X` cross small/large, `n` crowfoot-many.

**Stroke-body characters:** `-` solid, `=` double, `--` dashed, `..` dotted, `~` wavy. `~~>` does **not** parse - wavy uses a single `~`.

## `show raw:` rules are document-scoped

**Symptom.** A `show raw: ...` rule placed inside a function body or a `let` binding doesn't apply to raw spans rendered outside that scope.

**Cause.** Typst show rules apply only within their lexical scope. They don't survive a function boundary.

**Workaround.** Declare `show raw:` rules at the top level of the document (or wherever scope encompasses every raw span the rule should affect):

```typst
#show raw: r => text(fill: palette.accent.stroke, r)
```

This pattern is also the typical way to differentiate `raw()` content from prose when both render in the same font family - a tinting rule on raw spans gives code a visual marker.

## `shape: none` errors at draw time

**Symptom.** A node with `shape: none` errors during compile: `expected function, found none` from `(node.shape)(node, extrude)` in fletcher's `draw.typ`.

**Cause.** Fletcher invokes `node.shape` as a function at draw time. `none` isn't callable.

**Workaround.** For label-only nodes (no visible boundary), use an invisible rect:

```typst
node((0, row),
  align(right, text(...)),
  shape: fletcher.shapes.rect,
  fill: none,
  stroke: none,
)
```

The rect contributes the node's bounding box for layout but renders no border or fill.

## Comma-separated route strings parse as separate arguments

**Symptom.** Two distinct failures, depending on context:

1. `edge((0, 0), "r,d", (2, 2), "->", "label")` - Fletcher reports `Couldn't interpret edge() arguments label. Try using named arguments. Interpreted previous arguments as (vertices: ((0, 0), "r", "d", (2, 2)), marks: "->")`.
2. `edge((-1, 0), "r,d", (0, 1), "->")` (no label) - Fletcher reports `Adjacent vertices must be distinct.`

**Cause.** Fletcher 0.5.x parses each component of a comma-separated routing string as a *separate positional argument*. `"r,d"` becomes the two strings `"r"` and `"d"`, slotted into the vertex list:

- When a label follows, the parser has already consumed the route components into the vertex list and treats the label string as another position it doesn't know how to interpret.
- Each relative-direction string (`"r"`, `"d"`, `"l"`, `"u"`) is interpreted as a unit-grid step. With the wrong displacement, the last step lands exactly on the destination tuple, producing a zero-length final segment that trips the polyline draw-time assertion.

A comma-separated route happens to render only when (a) no positional argument follows the destination and (b) the displacement and route together don't produce coincident vertices. The catalog example at `~/tau/diagrams/ingredients/edges-and-marks/waypoints.typ` worked accidentally on both counts; it has been switched to the canonical form below.

**Workaround.** Use explicit coordinate tuples for every waypoint:

```typst
edge((0, 0), (1, 0), (1, 2), (2, 2), "->", "step")
```

The polyline visits each tuple in order. Add as many intermediates as the path needs. Plays cleanly with positional labels, `label-fill`, `label-pos`, and any other edge parameter. This is the form already in use across rendered TAU diagrams (see `format/core/readme.typ` for an in-the-wild example).

## Empty-content node errors at draw time

**Symptom.** `node(coord, none, shape: fletcher.shapes.rect, fill: none, stroke: none, inset: 0pt)` errors during compile: `array is empty` from `path` in cetz `drawable.typ`. The intent is a zero-size invisible junction node that exists only as an edge endpoint.

**Cause.** Cetz computes the node's bounding box from its drawn segments. A node with `none` body produces no segments; the path-segments array is empty when the renderer tries to compute bounds.

**Workaround.** Don't use a junction node - use a multi-vertex coord polyline instead, where the would-be junction coord is just an intermediate vertex:

```typst
// Don't:
node((1, 2), none, shape: fletcher.shapes.rect, fill: none, stroke: none)
edge((0, 2), (1, 2), "-", "label")
edge((1, 2), (2, 1), "->")
edge((1, 2), (2, 3), "->")

// Do:
edge((0, 2), (1, 2), (2, 1), "->", "label")
edge((0, 2), (1, 2), (2, 3), "->")
```

The two edges share the segment `(0, 2) → (1, 2)`; Fletcher draws each edge independently so the segment renders twice (visually identical to once). The "fork" emerges from the divergent terminal segments. No invisible node needed.

If you genuinely need a node at that coord (e.g., for `enclose:` membership), give it a 1pt invisible box body: `box(width: 1pt, height: 1pt)` - non-empty content satisfies cetz, and the rect remains effectively invisible.

## Bend sign convention is counter-intuitive

**Symptom.** A bent edge curves the opposite way from intuition. Author sets `bend: 25deg` expecting the curve to arc upward; it arcs downward (or vice versa).

**Cause.** Fletcher's bend sign is relative to the from→to vector, but the y-axis on the default canvas points *down* (top-origin). For a horizontal left-to-right edge, "left of from→to" is geometrically up but numerically smaller y; "right of from→to" is geometrically down but numerically larger y. Authors used to math-axis (bottom-origin) y mentally flip the meaning.

**Practical rule (verified empirically across phase 03 + phase 04):** positive `bend` curves toward larger y on Fletcher's default top-origin canvas. For a horizontal left-to-right edge, positive bends *down*; negative bends *up*. For a top-to-bottom vertical edge, positive bends *right*; negative bends *left*.

**Workaround.** On the first render of any bent edge, flip-test: render once with the bend value, render again with its negation, pick whichever direction reads correctly. The cost of one extra render is lower than the cost of debugging an inverted curve in a complex diagram.

## Inset accepts only a single absolute value

**Symptom.** `node(..., inset: (x: 12pt, y: 8pt))` errors with `dictionary has no method to-absolute` at compile time. The intent is asymmetric padding (more horizontal, less vertical) on a node body.

**Cause.** Fletcher 0.5.8 expects `inset` as a single absolute length, not a dictionary. The dictionary form works in Typst's general `box(inset: ...)` API but not in Fletcher's `node(inset: ...)`.

**Workaround.** Use a single absolute value that suits the node:

```typst
node(..., inset: 10pt)
```

If asymmetric padding is essential, wrap the body in an inner `box(inset: (x: 12pt, y: 8pt), ...)` and let the node's `inset` be a small additional buffer (or 0):

```typst
node((0, 0),
  box(inset: (x: 12pt, y: 8pt), body-content),
  shape: fletcher.shapes.rect,
  inset: 0pt,
  ...
)
```

## Mark overlay on shape (unsolved)

**Symptom.** Placing an arrowhead *inside* a shape - for instance, an edge that should terminate visually at a specific point inside a target rect rather than at its boundary - produces clipped arrows in Fletcher 0.5.x. Specifying the destination as a literal coord plus `layer: 1` to render above the shape gives the right z-order, but the arrowhead silhouette itself gets cut off where the shape's draw path masks it.

**Workaround.** Use a mark style that lands cleanly *at* the shape boundary instead of inside:

- `-O` (open large circle) - sits at the boundary edge as a docking association.
- `->` (standard head) - terminates at the boundary by Fletcher's default routing.

If a "pointer-into-region" semantic is essential, the cleanest fallback is a small unstyled inner node at the target region with its own incoming edge - not a literal-coord destination overlay. This remains an open thread for Fletcher 0.5.x; if a future version exposes a clip-aware overlay primitive, this entry should be revisited.

## Edge label position can collide with endpoints

**Symptom.** With `label-pos: 0.5` (default) on a short edge between adjacent shapes, the label visually sits inside or overlaps one of the endpoint shapes.

**Workaround.** Parameterize `label-pos` per call site so each edge can position its label appropriately. `label-pos: 0.7` anchors near the destination; `0.3` near the source.

```typst
let event-edge(from, to, label: none, label-pos: 0.5) = edge(from, to, "->",
  stroke: …,
  text(weight: "bold", label),
  label-side: left,
  label-sep: 10pt,
  label-pos: label-pos,
)
```

`label-sep` below 6pt produces visible crowding between the label and the edge line.

**When the label width exceeds the segment length.** Biasing `label-pos` doesn't help - the label is wider than the edge can accommodate, so it overflows whichever endpoint it's biased toward. Three structural fixes:

- **Increase column spacing** to widen the segment: `spacing: (space-between-shapes * 4, space-between-ranks)` gives the label horizontal room before either endpoint.
- **Switch to a vertical-stack layout** (the vertical-stack pattern in TAU's `diagram-ingredients` skill): place cards in a single column and use `label-side: right` / `left` to push labels into the empty horizontal space beside the edge.
- **Shorten the label** - sometimes the verbose form belongs in prose, and a 1-2 word edge label suffices for the diagram.

## Edge label fill: native parameter, not a custom box

**Symptom.** Wrapping an edge label in a `box(fill: surface, ...)` produces an unwanted white border in dark mode. The wrapper renders correctly, but Fletcher's auto-wrap renders an outer rectangle at hardcoded white *outside* the custom box.

**Workaround.** Use Fletcher's native `label-fill: surface` parameter on the edge, not a custom box:

```typst
edge(from, to, "->",
  label-fill: palette.surface,
  text(weight: "bold", "label"),
)
```

## Wide in-diagram nodes inflate the column they sit in

**Symptom.** A diagram with a clean matrix or grid suddenly renders with a huge left margin (or a huge gap between two adjacent columns at a single row). Inspecting the source shows a "legend" or "caption" node that spans the full width of the diagram, placed at one of the existing column coordinates (e.g., col 0).

**Cause.** Fletcher computes each column's width as the **max** node width at that column across *every* row. A wide node at `(0, last-row)` widens column 0 for all rows above it too - pushing every other column rightward.

**Workaround.** Move supplementary content (legends, captions, footnotes) **outside** the `#diagram(...)` call. They render as page-level Typst content directly below the diagram and don't participate in Fletcher's grid sizing.

```typst
#diagram(
  // ... matrix nodes, no wide caption inside ...
)

#v(tokens.gap-cell)
#align(center,
  stack(dir: ltr, spacing: tokens.gap-cell * 1.5,
    text(size: tokens.size-label, fill: palette.ink-muted, style: "italic", "\u{F00C} supported"),
    text(size: tokens.size-label, fill: palette.ink-muted, style: "italic", "\u{F469} streaming"),
    text(size: tokens.size-label, fill: palette.ink-muted, style: "italic", "- not supported"),
  )
)
```

Page-level content auto-sizes against the page's `auto` width, which is itself the diagram's width - so the legend stays narrower than the diagram unless it has wider intrinsic content. The diagram's grid is untouched.

If the legend *must* live inside the diagram (e.g., it needs to be addressable as a fletcher node for `enclose:` membership), give it a fractional coord between two existing columns (e.g., `(2.5, last-row)`) so it expands a *new* column rather than widening an existing one. Other rows have no node at that coord, so the extra column shows up as a small gap rather than a layout shift.

## Typst SVG always emits fixed pt dimensions

Typst's `compile … out.svg` always emits `<svg viewBox="…" width="900pt" height="1234.5pt" …>`. The fixed dimensions prevent responsive scaling when embedded via `<img width="100%">`; the viewBox carries the aspect ratio. In this repo `diagrams/mise.toml` implements the strip and the static / responsive distinction.

---
name: diagrams
description: Edit, add or re-render the architecture, data model and CI/CD diagrams under diagrams/. Covers the pinned Typst renderer, the font that must be installed, the dual-theme render, what check-docs holds a diagram to, and the Fletcher pitfalls that fail silently. Use whenever a .typ file under diagrams/ changes, when a migration adds or drops a table, when a workflow changes, or when /ship check 10b asks whether a diagram still matches the code.
---

# Diagrams

The four diagrams are Typst sources rendered to a light and a dark SVG each, each embedded in a README with a `<picture>` element that picks the theme.

| Source | Drawn from | Embedded in |
|---|---|---|
| `diagrams/system-architecture.typ` | the request path in `backend/` and the compose files | `README.md` |
| `diagrams/data-model.typ` | every table a migration in `backend/migrations/` creates | `README.md` |
| `diagrams/cicd-pipeline.typ` | `.github/workflows/` | `README.md` |

## Render

```bash
cd diagrams && mise run render                    # all four, both themes
cd diagrams && mise run render-file data-model.typ
```

- **Typst is pinned in `diagrams/mise.toml`.** An unpinned renderer rewrites every SVG with no content change; the file's comments record how.
- **The font is a separate install, and a missing one fails silently.** Install CaskaydiaMono NFP (the Nerd Font "proportional" cut of Cascadia Mono) before rendering, or the SVGs come out in a fallback face with no error.
- **Fletcher comes from the Typst package registry** (`@preview/fletcher`, version pinned in each import), so the first render on a machine needs network access to fetch it.
- **Commit both themes.** A diagram is rendered `responsive` unless its source carries a `// render: static` comment; responsive output has its `pt` width and height stripped so it scales in the README.

## What check-docs holds a diagram to

`node scripts/check-docs.mjs`, step "diagrams match the code", fails when:

- a table some migration creates is not drawn in `data-model.typ`,
- a `.typ` is missing either rendered theme,
- a responsive SVG still carries a `pt` width,
- a count of tables or migrations quoted in a `.typ` or in prose is not the real count,
- a responsive diagram is too wide for its smallest text to reach 11px in the 838px README column, or a diagram sets a literal text size instead of a token.

It searches only the **quoted string literals** in a `.typ`, which are the box labels a reader sees.
Typst `<label>` cross-references repeat table names, so an earlier version that searched the whole file passed with a table's card deleted.
Keep table names in quoted labels.

What it cannot hold is any other claim a picture makes.
`/ship` check 10b asks that question per diagram against the diff; answer it rather than assuming.

## Keep it readable at 838px

The README draws every diagram at `width="100%"` of an 838px column, so a diagram W units wide is shown at 838/W of its size.
Raising every size together changes nothing, because the SVG is scaled to the column whatever its size; only the layout decides legibility.
With 11pt labels a diagram can be at most about 838 units wide, and `scripts/lib/diagram-legibility.mjs` holds it there.

What keeps a layout inside that:

- **Fixed-width cards.** Every card is a `block(width: ...)`, so a long line wraps inside the card instead of widening its column.
- **Three columns at most**, two when the cards carry long lines, with gaps of 40pt to 60pt. Take height instead; a tall diagram scrolls, a wide one shrinks.
- **Tight gaps, bigger text.** Whitespace is the only thing to trade at a fixed column, so gaps are 28pt to 30pt, padding is thin, and text is set a step above the tokens with `scaled(1.15)`. All four land at about 13px.
- **Every edge label sits on its own line**, which runs through it (`label-side: center`). A label beside a line was read as belonging to its neighbour, or to nothing. Keep labels short, drop one the card already says, and pass `none` for no label: an empty `[]` still draws its fill as a stray dot.
- **Group captions are tabs on the group's own border**, never text floating between two groups.
- **Legend held to the diagram width**, so its prose wraps under the picture instead of setting the page width.

All four come from `diagrams/design/parts.typ`: `scaled`, `edge-label`, `group-tab` and `legend-under`. Change them there, once.

Two Fletcher traps that widen a diagram silently:

- **An enclosing node's content sizes the grid column it is centred in.** A caption written into a hull node widened the middle column of the data model by 242 units. `place()` the caption so it takes no room.
- **Typst draws inline code at 0.8em**, under the token floor. Each diagram sets `#show raw: set text(size: tokens.size-label)`.

And one that changes what the reader sees: `--` in markup renders as an en dash and `---` as an em dash, so a flag such as `--boot` written as plain text shows as a wrong character. Put commands in backticks.

To see what a reader sees, compile a PNG at the README width: `typst compile --root . --input theme=light --ppi <838 * 72 / width> <file>.typ out.png`, taking the width from the SVG's viewBox.

## Design layer

`diagrams/design/tokens.typ` holds sizes, spacing and stroke; `diagrams/design/theme.typ` holds the two palettes, traced to GitHub Primer; `diagrams/design/parts.typ` holds the pieces every diagram draws the same way.
Both are copies of the TAU platform team's diagram standard, adapted here.
Change a colour or a size in these files, never inline in a diagram, so all four stay one system.
Hierarchy is weight and size in one font family, never a second font.

## Fletcher traps

[references/fletcher-pitfalls.md](references/fletcher-pitfalls.md) lists the Fletcher behaviours that render wrong or fail at draw time without pointing at the cause: route strings with commas, empty-content nodes, `shape: none`, bend sign, label collisions, and the always-`pt` SVG size above.
Read it before debugging a diagram that renders oddly.

The upstream skills this was drawn from (`tau-diagrams`, `typst-diagrams`, `diagram-authoring`, `diagram-design-system`, `diagram-ingredients`) belong to the TAU platform team and are not part of this repo.
This file and its reference are what this repo needs from them.

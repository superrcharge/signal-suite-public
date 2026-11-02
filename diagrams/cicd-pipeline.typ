#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge
#import "design/theme.typ": palette, divider
#import "design/parts.typ": scaled, edge-label, legend-under

// Text a step above the shared tokens: tight gaps leave the width to the
// text rather than to whitespace. See design/parts.typ.
#let tokens = scaled(1.15)

// What actually runs today. Sources: .github/workflows/*.yml, and the branch
// protection settings recorded in AGENTS.md. Every job id below is a key under
// `jobs:` in ci.yml - scripts/check-docs.mjs holds this diagram's prose and the
// README's to that same list.
//
// The one thing worth noticing: `preflight` is NOT a required status check.
// It runs on every PR and it is the fastest signal there is, but the five
// checks that gate the merge are the ones named on the `main` node.
//
// Two columns: the pipeline runs down the left, the workflows that ride
// alongside it sit on the right. Narrow on purpose - the README draws this at
// 838px, and the four-column version it replaced came out at 4.5px text
// there. See design/tokens.typ for the rule.

#set page(
  width: auto,
  height: auto,
  margin: (top: 6pt, bottom: 10pt, left: 6pt, right: 6pt),
  fill: palette.surface,
)

#set text(
  font: ("CaskaydiaMono NFP", "Cascadia Mono", "Consolas"),
  size: tokens.size-body,
  fill: palette.ink,
)

// Typst draws inline code at 0.8em, which would put it under the size floor
// in design/tokens.typ. Hold it to the label size like every other line.
#show raw: set text(size: tokens.size-label)

// Fixed card widths, one per column, so a long line wraps instead of
// widening its column.
#let spine-width = 384pt
#let side-width = 338pt

#let stage(title, kind, details, hue: palette.blue, width: spine-width) = block(width: width, stack(
  dir: ttb,
  spacing: tokens.gap-structured-text,
  block(width: 100%, align(center,
    text(weight: tokens.weight-bold, size: tokens.size-title, fill: hue.ink, title)
  )),
  block(width: 100%, align(center,
    text(style: "italic", size: tokens.size-caption, fill: hue.ink, "(" + kind + ")")
  )),
  divider(hue: hue),
  stack(dir: ttb, spacing: 4pt,
    ..details.map(d => align(left, text(size: tokens.size-label, fill: hue.ink, d)))
  ),
))

#let auto-stage(pos, title, kind, details, hue, nm, width: spine-width) = node(pos,
  stage(title, kind, details, hue: hue, width: width),
  shape: fletcher.shapes.rect,
  fill: hue.fill,
  stroke: (paint: hue.stroke, thickness: tokens.stroke-default),
  inset: 7pt,
  corner-radius: tokens.radius-shape,
  name: nm,
)

// Every label sits on its own line; see edge-label in design/parts.typ.
#let flow(from, to, lbl: none, ..args) = edge(from, to, "->",
  ..edge-label(lbl, palette.green.stroke, t: tokens),
  label-fill: palette.surface, label-side: center,
  stroke: (paint: palette.green.stroke, thickness: tokens.stroke-emphasis), ..args)

#let side(from, to, lbl: none, ..args) = edge(from, to, "->",
  ..edge-label(lbl, palette.ink-muted, t: tokens),
  label-fill: palette.surface, label-side: center,
  stroke: (paint: palette.ink-muted, thickness: tokens.stroke-default, dash: "dashed"), ..args)

#let pipeline = diagram(
  spacing: (30pt, 52pt),

  auto-stage((0, 0), "Pull request", "every PR, every push to main",
    ([branch protection makes this the only way anything reaches `main`],),
    palette.blue, <pr>),

  auto-stage((0, 1), "ci.yml", "six jobs",
    ([`preflight` - version pins, doc agreement + UI tokens, seconds, compiles nothing],
     [`backend` - golangci-lint, build, unit + integration tests on postgres:16],
     [`frontend` - ESLint, `tsc --noEmit`, vitest, npm audit],
     [`scripts` - scripts/lib unit tests + CSV coverage],
     [`style` - em dash gate over added lines. PRs only, it needs a merge base],
     [`security-scan` - Trivy filesystem + govulncheck]),
    palette.blue, <ci>),

  auto-stage((0, 2), "main", "protected branch",
    ([PR required, 0 approvals - GitHub forbids self-approval],
     [5 required checks: Backend, Frontend, Script tests, Style, Security Scan],
     [linear history, squash merge, admins included],
     [a direct push is refused by the remote: GH006]),
    palette.green, <main>),

  auto-stage((0, 3), "git tag v*", "starts the release build",
    ([/ship runs `preflight-versions.mjs --release` first: a dated CHANGELOG section, a tag not already taken, and an increment],),
    palette.green, <tag>),

  auto-stage((0, 4), "release.yml", "on the tag",
    ([builds Dockerfile.prod with buildx],
     [Trivy scans the built IMAGE - CRITICAL/HIGH fail],
     [GitHub Release, notes taken from CHANGELOG.md]),
    palette.green, <release>),

  auto-stage((0, 5), "GHCR", "ghcr.io/<owner>/asset-tracker",
    ([`:X.Y.Z` and `:X.Y` for tag vX.Y.Z], [`:latest` only when the tag has no prerelease dash]),
    palette.coral, <ghcr>),

  auto-stage((1, 1), "security.yml", "cron + push to main",
    ([Trivy + govulncheck, Mondays 06:00 UTC],
     [catches CVEs published after the last commit landed]),
    palette.yellow, <sec>, width: side-width),

  flow(<pr>, <ci>),
  flow(<ci>, <main>, lbl: [all five required checks green]),
  flow(<main>, <tag>, lbl: [manual, at release time]),
  flow(<tag>, <release>),
  flow(<release>, <ghcr>, lbl: [push]),
  // security.yml deliberately has no edge into the pipeline: it is a second,
  // slower pass over the same tree, not a stage anything waits on.
)

#legend-under(pipeline, t: tokens, marker-width: 24pt, (
  (box(width: 14pt, height: 10pt, rect(width: 100%, height: 100%,
      fill: palette.green.fill,
      stroke: (paint: palette.green.stroke, thickness: tokens.stroke-default),
      radius: 3pt)),
    [fires on its own - a push, a tag, or a schedule]),
  (text(fill: palette.ink-subtle, [image]),
    [the GHCR image is the release artifact. Deploying it is up to whoever runs the app - see docs/self-hosting.md]),
),
note: [A push can produce no workflow run at all, and the PR then waits forever with an empty check list. Check total_count on the runs API rather than reading the PR page: "pending" and "never started" look identical from there.])

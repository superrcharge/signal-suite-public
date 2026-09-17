#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge
#import "design/tokens.typ": tokens
#import "design/theme.typ": palette, divider

// What actually runs today. Sources: .github/workflows/*.yml, and the branch
// protection settings recorded in AGENTS.md. Every job id below is a key under
// `jobs:` in ci.yml - scripts/check-docs.mjs holds this diagram's prose and the
// README's to that same list.
//
// The one thing worth noticing: `preflight` is NOT a required status check.
// It runs on every PR and it is the fastest signal there is, but the five
// checks that gate the merge are the ones named on the `main` node.

#set page(
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

#let stage(title, kind, details, hue: palette.blue) = stack(
  dir: ttb,
  spacing: tokens.gap-structured-text,
  block(width: 100%, align(center,
    text(weight: tokens.weight-bold, size: tokens.size-title, fill: hue.ink, title)
  )),
  block(width: 100%, align(center,
    text(style: "italic", size: tokens.size-caption, fill: hue.ink, "(" + kind + ")")
  )),
  divider(hue: hue),
  stack(dir: ttb, spacing: 3pt,
    ..details.map(d => align(left, text(size: tokens.size-label, fill: hue.ink, d)))
  ),
)

#let auto-stage(pos, title, kind, details, hue, nm) = node(pos,
  stage(title, kind, details, hue: hue),
  shape: fletcher.shapes.rect,
  fill: hue.fill,
  stroke: (paint: hue.stroke, thickness: tokens.stroke-default),
  inset: tokens.pad-inside-shape,
  corner-radius: tokens.radius-shape,
  name: nm,
)


#let flow(from, to, lbl) = edge(from, to, "->",
  text(size: tokens.size-label, fill: palette.green.stroke, lbl),
  label-fill: palette.surface, label-sep: tokens.label-sep,
  stroke: (paint: palette.green.stroke, thickness: tokens.stroke-emphasis))

#let side(from, to, lbl) = edge(from, to, "->",
  text(size: tokens.size-label, fill: palette.ink-muted, lbl),
  label-fill: palette.surface, label-sep: tokens.label-sep,
  stroke: (paint: palette.ink-subtle, thickness: tokens.stroke-thin, dash: "dashed"))

#diagram(
  spacing: (128pt, 76pt),

  auto-stage((1, 0), "Pull request", "every PR, every push to main",
    ([branch protection means this is the only], [way anything reaches `main`]),
    palette.blue, <pr>),

  auto-stage((1, 1), "ci.yml", "six jobs",
    ([`preflight` - version pins, doc agreement + UI tokens, seconds, compiles nothing],
     [`backend` - golangci-lint, build, unit + integration tests on postgres:16],
     [`frontend` - ESLint, tsc --noEmit, vitest, npm audit],
     [`scripts` - scripts/lib unit tests + CSV coverage],
     [`style` - em dash gate over added lines. PRs only, it needs a merge base],
     [`security-scan` - Trivy filesystem + govulncheck]),
    palette.blue, <ci>),

  auto-stage((1, 2), "main", "protected branch",
    ([PR required, 0 approvals - GitHub forbids self-approval],
     [5 required checks: Backend, Frontend, Script tests, Style, Security Scan],
     [linear history, squash merge, admins included],
     [a direct push is refused by the remote: GH006]),
    palette.green, <main>),

  auto-stage((1, 3), "git tag v*", "starts the release build",
    ([/ship runs preflight-versions.mjs --release first:],
     [dated CHANGELOG section, tag not already taken, increments]),
    palette.green, <tag>),

  auto-stage((1, 4), "release.yml", "on the tag",
    ([builds Dockerfile.prod with buildx],
     [Trivy scans the built IMAGE - CRITICAL/HIGH fail],
     [GitHub Release, notes taken from CHANGELOG.md]),
    palette.green, <release>),

  auto-stage((1, 5), "GHCR", "ghcr.io/<owner>/asset-tracker",
    ([`:1.9.0` and `:1.9`], [`:latest` only when the tag has no prerelease dash]),
    palette.coral, <ghcr>),



  auto-stage((2, 1), "security.yml", "cron + push to main",
    ([Trivy + govulncheck, Mondays 06:00 UTC],
     [catches CVEs published after the last commit landed]),
    palette.yellow, <sec>),



  flow(<pr>, <ci>, []),
  flow(<ci>, <main>, [all five required checks green]),
  flow(<main>, <tag>, [manual, at release time]),
  flow(<tag>, <release>, []),
  flow(<release>, <ghcr>, [push]),

  // security.yml deliberately has no edge into the pipeline: it is a second,
  // slower pass over the same tree, not a stage anything waits on.
)

#v(tokens.gap-cell * 2)
#line(length: 100%, stroke: tokens.stroke-thin + palette.border-muted)
#v(tokens.gap-cell)
#text(size: tokens.size-label, weight: tokens.weight-bold,
  fill: palette.ink-muted, upper([Legend]))
#v(tokens.gap-cell)

#let leg(marker, desc) = grid(
  columns: (100pt, auto),
  column-gutter: tokens.gap-cell,
  align: horizon,
  marker,
  text(size: tokens.size-label, fill: palette.ink-muted, desc),
)

#stack(dir: ttb, spacing: 8pt,
  leg(box(width: 14pt, height: 9pt, rect(width: 100%, height: 100%,
        fill: palette.green.fill,
        stroke: (paint: palette.green.stroke, thickness: tokens.stroke-default),
        radius: 3pt)),
      [fires on its own - a push, a tag, or a schedule]),
  leg(text(fill: palette.ink-subtle, [image]),
      [the GHCR image is the release artifact. Deploying it is up to whoever runs the app - see docs/self-hosting.md]),
)

#v(tokens.gap-cell)
#text(size: tokens.size-label, fill: palette.ink-subtle, style: "italic",
  [A push can produce no workflow run at all, and the PR then waits forever with an empty check list. Check total_count on the runs API rather than reading the PR page: "pending" and "never started" look identical from there.])

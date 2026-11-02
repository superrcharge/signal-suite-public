#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge
#import "design/theme.typ": palette, divider
#import "design/parts.typ": scaled, edge-label, group-tab, legend-under, legend-edge

// Text a step above the shared tokens: tight gaps leave the width to the
// text rather than to whitespace. See design/parts.typ.
#let tokens = scaled(1.15)

// The running system, not a target state. Sources:
//   compose.selfhost.yaml        the containers and their env wiring
//   backend/config/config.go     every environment variable the backend reads
//   backend/internal/middleware  auth, frontend serving, security headers
//   frontend/src/auth            msal-config.ts, api-client.ts
//   frontend/package.json        React version
//   backend/go.mod               Go version
//
// Two boxes are optional and dashed for that reason: Entra ID, which only
// exists when AUTH_ENABLED=true, and Blob Storage, which only exists when
// AZURE_STORAGE_URL is set. The self-hosted stack in docs/self-hosting.md
// runs with neither.

#set page(
  // auto, so the page can never be narrower than the diagram it holds.
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

// Every card is the same width and its lines wrap inside it, so no single
// long line can widen a column. Narrow on purpose: the README draws this at
// 838px, and the version it replaced came out at 6.3px text there. See
// design/tokens.typ for the rule.
#let card-width = 224pt

// -- Node body: title + (kind) + divider + detail lines --
#let svc(title, kind, details, hue: palette.blue) = block(width: card-width, stack(
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

#let owned(pos, title, kind, details, hue, nm) = node(pos,
  svc(title, kind, details, hue: hue),
  shape: fletcher.shapes.rect,
  fill: hue.fill,
  stroke: (paint: hue.stroke, thickness: tokens.stroke-emphasis),
  inset: 7pt,
  corner-radius: tokens.radius-shape,
  name: nm,
)

#let external(pos, title, kind, details, hue, nm) = node(pos,
  svc(title, kind, details, hue: hue),
  shape: fletcher.shapes.rect,
  fill: palette.surface-muted,
  stroke: (paint: palette.border, dash: "dashed", thickness: tokens.stroke-default),
  inset: 7pt,
  corner-radius: tokens.radius-shape,
  name: nm,
)

// -- Three edge kinds. Every label sits on its own line; see edge-label in
// design/parts.typ. --
#let flow-edge(from, to, lbl: none, ..args) = edge(from, to, "->",
  ..edge-label(lbl, palette.green.stroke, t: tokens),
  label-fill: palette.surface, label-side: center,
  stroke: (paint: palette.green.stroke, thickness: tokens.stroke-default), ..args)

#let auth-edge(from, to, lbl: none, ..args) = edge(from, to, "->",
  ..edge-label(lbl, palette.orange.stroke, t: tokens),
  label-fill: palette.surface, label-side: center,
  stroke: (paint: palette.orange.stroke, thickness: tokens.stroke-default, dash: "dashed"), ..args)

#let system = diagram(
  spacing: (30pt, 64pt),

  // -- Browser, top left --
  owned((0, 0), "Browser", "SPA . MSAL.js",
    ([React 19 . Vite 8 . MUI v9],
     [reads window.\_\_SHF\_AUTH\_\_],
     [tokens in localStorage],
     [sends Authorization: Bearer]),
    palette.blue, <browser>),

  // -- Entra, top right --
  external((2, 0), "Microsoft Entra ID", "optional identity provider",
    ([present only when AUTH\_ENABLED=true],
     [ONE app registration],
     [audience: the bare client ID],
     [AUTH\_AUTHORITY\_HOST picks the login host],
     [publishes JWKS]),
    palette.orange, <entra>),

  // -- The app, centre --
  owned((1, 1), "Asset Tracker", "Go 1.26 . Fiber v3 . one container",
    ([verifies the JWT in-process],
     [signature . issuer . audience],
     [expiry . RS256 only (go-oidc)],
     [roles from the users table],
     [serves `/api/v1/*` and the SPA],
     [`/health`, `/ready` skip auth],
     [HSTS . CSP . rate limit],
     [AUTH\_ENABLED=false: no sign-in, every visitor is admin]),
    palette.green, <backend>),

  // -- Data stores, bottom --

  external((1, 2), "PostgreSQL 16", "postgres:16 container, or your own server",
    ([goose migrations run on boot],
     [DB\_AUTH\_MODE=password: DB\_PASSWORD from env],
     [DB\_AUTH\_MODE=managed\_identity: an Entra token],
     [pgxpool.BeforeConnect swaps it in]),
    palette.blue, <db>),

  external((0, 2), "Azure Blob Storage", "optional",
    ([present only when AZURE\_STORAGE\_URL is set],
     [otherwise photo upload answers 501],
     [photos . squadron emblems],
     [the API proxies the bytes],
     [stored URLs are not public]),
    palette.yellow, <blob>),

  // -- Edges --
  auth-edge(<browser>, <entra>, lbl: [1. MSAL sign-in]),
  flow-edge(<browser>, <backend>, lbl: [2. HTTPS + Bearer JWT]),
  auth-edge(<entra>, <backend>, lbl: [3. JWKS keys], label-pos: 0.35),

  flow-edge(<backend>, <db>, lbl: [SQL . pgx/v5], label-pos: 0.3),
  flow-edge(<backend>, <blob>, lbl: [photo read / write]),
)

#legend-under(system, t: tokens, marker-width: 92pt, (
  (legend-edge((paint: palette.green.stroke, thickness: tokens.stroke-default)),
    [request and data flow]),
  (legend-edge((paint: palette.orange.stroke, thickness: tokens.stroke-default, dash: "dashed")),
    [identity. Entra proves who you are; the role that decides what you may do is app-local]),
  (box(width: 14pt, height: 10pt, rect(width: 100%, height: 100%,
      fill: palette.green.fill,
      stroke: (paint: palette.green.stroke, thickness: tokens.stroke-emphasis),
      radius: 3pt)),
    [built here]),
  (box(width: 14pt, height: 10pt, rect(width: 100%, height: 100%,
      fill: palette.surface-muted,
      stroke: (paint: palette.border, dash: "dashed", thickness: tokens.stroke-default),
      radius: 3pt)),
    [something the container talks to. Dashed titles marked optional can be left out entirely]),
)
)

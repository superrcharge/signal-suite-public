#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge
#import "design/tokens.typ": tokens
#import "design/theme.typ": palette, divider

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
  margin: (top: 24pt, bottom: 32pt, left: 24pt, right: 24pt),
  fill: palette.surface,
)

#set text(
  font: ("CaskaydiaMono NFP", "Cascadia Mono", "Consolas"),
  size: tokens.size-body,
  fill: palette.ink,
)

// -- Node body: title + (kind) + divider + detail lines --
#let svc(title, kind, details, hue: palette.blue) = stack(
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

#let owned(pos, title, kind, details, hue, nm) = node(pos,
  svc(title, kind, details, hue: hue),
  shape: fletcher.shapes.rect,
  fill: hue.fill,
  stroke: (paint: hue.stroke, thickness: tokens.stroke-emphasis),
  inset: tokens.pad-inside-shape,
  corner-radius: tokens.radius-shape,
  name: nm,
)

#let external(pos, title, kind, details, hue, nm) = node(pos,
  svc(title, kind, details, hue: hue),
  shape: fletcher.shapes.rect,
  fill: palette.surface-muted,
  stroke: (paint: palette.border, dash: "dashed", thickness: tokens.stroke-default),
  inset: tokens.pad-inside-shape,
  corner-radius: tokens.radius-shape,
  name: nm,
)

// -- Three edge kinds --
#let flow-edge(from, to, lbl) = edge(from, to, "->",
  text(size: tokens.size-label, fill: palette.green.stroke, lbl),
  label-fill: palette.surface, label-sep: tokens.label-sep,
  stroke: (paint: palette.green.stroke, thickness: tokens.stroke-default))

#let auth-edge(from, to, lbl) = edge(from, to, "->",
  text(size: tokens.size-label, fill: palette.orange.stroke, lbl),
  label-fill: palette.surface, label-sep: tokens.label-sep,
  stroke: (paint: palette.orange.stroke, thickness: tokens.stroke-default, dash: "dashed"))


#diagram(
  spacing: (168pt, 118pt),

  // -- Browser, top left --
  owned((0, 0), "Browser", "SPA . MSAL.js",
    ([React 19 . Vite 8 . MUI v9],
     [reads window.\_\_SHF\_AUTH\_\_ from index.html],
     [tokens cached in localStorage],
     [sends Authorization: Bearer]),
    palette.blue, <browser>),

  // -- Entra, top right --
  external((2, 0), "Microsoft Entra ID", "optional identity provider",
    ([present only when AUTH\_ENABLED=true],
     [ONE combined app registration],
     [audience: the bare client ID (v2 tokens)],
     [AUTH\_AUTHORITY\_HOST picks the login host],
     [publishes JWKS]),
    palette.orange, <entra>),

  // -- The app, centre --
  owned((1, 1), "Asset Tracker", "Go 1.26 . Fiber v3 . one container",
    ([validates the JWT in-process - coreos/go-oidc],
     [issuer checked, signing alg pinned to RS256],
     [RBAC resolved from the local users table],
     [serves `/api/v1/*` AND the built SPA from `./static`],
     [`/health` and `/ready` skip auth; every other route does not],
     [HSTS . CSP . per-client-IP rate limit],
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
     [equipment photos . squadron emblems],
     [stored URL is not browser-fetchable, so],
     [the API proxies the bytes]),
    palette.yellow, <blob>),

  // -- Edges --
  auth-edge(<browser>, <entra>, [1. MSAL sign-in]),
  flow-edge(<browser>, <backend>, [2. HTTPS + Bearer JWT]),
  auth-edge(<entra>, <backend>, [3. JWKS . verify signature, issuer, audience, expiry . RS256 only]),

  flow-edge(<backend>, <db>, [SQL . pgx/v5]),
  flow-edge(<backend>, <blob>, [photo read / write]),
)

// -- Legend, outside the diagram so it cannot widen a column --
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
  leg(text(fill: palette.green.stroke, [--------->]),
      [request and data flow]),
  leg(text(fill: palette.orange.stroke, [- - - - - >]),
      [identity. Entra proves who you are; the role that decides what you may do is app-local]),
  leg(stack(dir: ltr, spacing: 4pt,
      box(width: 14pt, height: 9pt, rect(width: 100%, height: 100%,
        fill: palette.green.fill,
        stroke: (paint: palette.green.stroke, thickness: tokens.stroke-emphasis),
        radius: 3pt))),
      [built here]),
  leg(box(width: 14pt, height: 9pt, rect(width: 100%, height: 100%,
        fill: palette.surface-muted,
        stroke: (paint: palette.border, dash: "dashed", thickness: tokens.stroke-default),
        radius: 3pt)),
      [something the container talks to. Dashed titles marked optional can be left out entirely]),
)


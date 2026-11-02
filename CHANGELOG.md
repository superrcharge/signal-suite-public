# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning Convention

- **Releases**: `v<major>.<minor>.<patch>` (e.g., `v1.0.0`)
- **Default to a patch bump.** A minor bump is for a genuinely new user-facing capability; a major
  bump is for a breaking change to the API contract or the data model.

---

## v2.0.0 - 2026-11-02

Re-cut from the upstream repository's development line as of 2026-11-02, so this copy carries
every change made since the initial public release. The highlights:

### Added

- **Operations.** An Operations group in the sidebar: a picker of operations, each with ordered
  phases, physical locations, the organizations taking part and what each brings, a Tier select
  and must-talk requirements per phase, and three views of the result: Loadout (one tab per
  participant), Matrix (a capability grid, printable) and Web (a phase picture with Show All, Gaps
  and Focus modes and a plan panel). The Web view exports one native, editable PowerPoint slide
  per phase; the Matrix exports an editable table. An RFI board on the operation page, where any
  participant posts a request and only its poster resolves it.
- **Organization Library.** The organizations an operation can check in, each with an immutable
  key, a branch, a colour and an optional section link, managed on a Settings tab and exportable
  as CSV. A fresh database starts with nine colour-named organizations.
- **Join Operation wizard**, eight steps from Organization to Contact, with search on the pick
  lists, a Phases step, and a Transports step.
- **Dashboard** (`/dashboard`), the home page for every role: one square tile per page, gated per
  role. The old Dashboard is now Stats (`/stats`).
- **Settings is tabbed**: Sections, Tags, Organizations, Import/Export and Audit log.
- **PACE per theater.** A squadron's nets, card, wheels and frequency rows are kept per theater
  (CONUS and OCONUS), and the card's exports name the theater.
- **Platform category and type** are closed lists (the service branches, and aircraft / ship /
  ground vehicle / ground station / UAV), each drawn as a coloured chip.
- **A sample operation for demos.** `scripts/seed-dev-operation.mjs` (`make seed-operation`)
  builds one against a running dev stack, and `scripts/demo-operation-walkthrough.mjs` records a
  walkthrough of it; `docs/demo-operation.md` describes both.
- **Docs**: `docs/glossary.md` (every closed vocabulary defined, held to the code by a check),
  `docs/product.md` (what the app is for and who it serves) and `docs/stack.md` (every
  component, held to the manifests by a check).

### Changed

- **Dependencies.** Go 1.26.10, `go-jose` 4.1.6, `golang.org/x/net` 0.61.0 and the current
  patch and minor releases of every frontend package, which clears the Trivy and govulncheck
  findings the weekly scan had been reporting against the initial release.
- **Boot check.** `scripts/verify-deploy.mjs --boot` drives Chrome over the DevTools protocol on a
  wall-clock deadline instead of waiting for the network to go quiet, so a slow third-party
  request can no longer hang it.
- **Auth with a second guest or B2B user** no longer fails every request, and a long display name
  is stored rather than refused.
- **Em dashes are rejected** by a hook and a CI job, and prose counts of gates, jobs and checks
  are held to the code.

---

## v1.0.0 - 2026-09-17

### Added

- **Initial public release.** Terminals, kits, contracts and sections; an Equipment Catalog with
  SATCOM and radio data sheets, a compare view and a printable joint compatibility matrix; a Comms
  Library of waveforms, services, transports and platforms; a per-section Nets Library and PACE
  comms card with JEM/MPU5 channel wheels; CSV export, import and templates for every domain; role
  based access (admin, editor, rto, planner, viewer) with optional Microsoft Entra ID sign-in; an
  in-app FAQ with "Take me there" navigation.
- **Self-hosting.** `compose.selfhost.yaml` and `docs/self-hosting.md` run the production image and
  a PostgreSQL container on any machine with Podman or Docker, no cloud account required.
- **Created by Michael Charge in 2026.**

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning Convention

- **Releases**: `v<major>.<minor>.<patch>` (e.g., `v1.0.0`)
- **Default to a patch bump.** A minor bump is for a genuinely new user-facing capability; a major
  bump is for a breaking change to the API contract or the data model.

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

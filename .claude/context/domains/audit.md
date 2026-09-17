# Audit domain

Append-only log of every mutation that passes through the app. Schema in `migrations/010_create_audit_log.sql`: `id`, `actor_id/name/email`, `resource_type`, `resource_id`, `resource_name`, `action` (`create`|`update`|`delete`|`role_change`), `changes` JSONB, `created_at`. Indexed on `(resource_type, resource_id)`, `actor_id`, `created_at DESC`, and `action`.

`resource_type` is an unconstrained `VARCHAR(50)` - there is no CHECK and no enum, so adding a type needs no migration. That is also why nothing stops a typo, and why the parity tests below exist.

**Retention:** forever. No TTL. Deliberate - an asset tracker's mutation history is a feature, not overhead.

## Capture model

Service layer emits events via `contracts.AuditRecorder` (in `shared/contracts/audit.go`), which takes a `contracts.AuditEventInput`. Each mutation-producing service holds a nilable `audit` field and a `SetAudit` setter. `main.go` wires `audit.Service` into each after all are constructed.

**`recordAudit` is nil-tolerant on purpose**, so a unit test can build a service without a recorder. The cost is that a service whose `SetAudit` is never called behaves exactly like a correctly wired one: every write returns early and records nothing, and no test fails. That is not hypothetical - it is what happened to Transports and Waveforms.

**Audit writes are best-effort.** If the insert fails we log a warning and continue - a broken audit log must never roll back a real mutation. Missing audit rows are recoverable; rolled-back-silently deletes are not.

## Events captured

Twelve domains record. `audit` itself does not, being the recorder.

| resource_type | Domain package | Actions | Changes payload |
|---|---|---|---|
| `terminal` | `terminal` | create, update, delete | update diffs name, kit, serial, section, status, owner fields, notes; create via import carries `{ via: "import" }`, one row per imported terminal; delete empty, `resource_name` snapshotted pre-delete |
| `kit` | `kit` | create, update, delete | update diffs kit fields; create may carry an import hint |
| `section` | `section` | create, update, delete | update diffs label/color; delete carries `{ reassigned_terminals, reassigned_to }` when rows were moved |
| `contract` | `contract` | create, update, delete | update diffs title, company, POC name/email/phone, POP start/end, execution quarter, fiscal year, notes, logform number/URL. Dates render as `YYYY-MM-DD`, not RFC3339, so a one-day move stays readable |
| `equipment` | `equipment` | create, update, delete | update diffs nomenclature, nickname, one-liner, doc number, photo URL, make, terminal type, operational mode. The `data` spec sheet is recorded as moved-or-not rather than structurally diffed - dozens of nested keys belong in the datasheet view, not a one-line entry |
| `waveform` | `waveform` | create, update, delete | update diffs abbrev, name, description |
| `service` | `satcomservice` | create, update, delete | update diffs abbrev, name, description |
| `transport` | `transport` | create, update, delete | update diffs name, kind, provider, description |
| `platform` | `platform` | create, update, delete | update diffs designation, popular name, category, kind, operator, notes; the two lists (`waveform_abbrevs`, `equipment_ids`) are recorded joined, so the entry reads `L16 -> L16, MADL` rather than two arrays |
| `net` | `radionet` | create, update, delete | update diffs net fields |
| `pace_section` | `pace` | update | diff of the card |
| `user` | `user` | role_change | `{ role: {old, new} }` |

Note the two names that are not their package: `service` for `satcomservice` and `net` for `radionet`, matching the package-naming reasons in `.claude/context/structure.md`. And `pace_section`, not `pace`.

`user` records `role_change` only. `UpdatePreferences` is deliberately unrecorded: it is a caller editing their own display settings, so the log would fill with noise carrying no accountability value.

**Actor identity snapshotted by value** (`actor_name`, `actor_email`) at write time so later renames or deletions don't retroactively relabel history. `ActorID` on the request DTOs is the local user UUID the log keys events by, and is distinct from `CreatedBy`/`UpdatedBy`, which carry the display name. **No FKs** to users/terminals/sections for the same reason - the log is authoritative even if the underlying rows are later removed.

## The parity tests, and what each is for

`backend/audit_wiring_test.go`. All four read the sources at runtime rather than comparing against a hand-kept list, so a domain added later is covered without anyone remembering to extend the file.

| Test | Catches |
|---|---|
| `TestEveryMutatingDomainCanRecordAudit` | a service with Create/Update/Delete that declares no `SetAudit`. Exemptions live in `notAuditable` and need a written reason |
| `TestEveryAuditableDomainIsWired` | a `SetAudit` that `main.go` never calls. No compile-time assertion covers this, because nil-tolerance makes it look like a pass |
| `TestEveryUpdateEventCarriesADiff` | an update event with no `Changes`, which records that a row was edited without recording what |
| `TestAuditPageFiltersEveryRecordedResourceType` | drift between the emitted literals and the frontend filter list, in both directions |

The last one is cross-language on purpose. The page's Resource dropdown once listed three of nine types, so events for kits, contracts, equipment, services, nets and PACE cards were written and then unreachable - the rows existed and the only filter the page offers could not ask for them, which reads as "no activity" rather than "wrong filter". Neither side could catch that alone: the Go compiled, the TSX compiled, and the drifting pair was string literals in two languages.

## Read surface

`GET /api/v1/audit` with optional filters: `resource_type`, `resource_id`, `actor_id`, `action`, `since`, `until` (both RFC3339). Page-based pagination (default 50, max 200). Admin-only.

**Frontend:** `/audit` route with Resource / Action select filters, expandable rows for per-field diff rendered as `FIELD old → new` lines. `RESOURCE_TYPES` in `pages/audit-page.tsx` is the filter list the test above holds to the backend. `ResourceTypeChip` renders underscores as spaces so `pace_section` reads "Pace section" - `textTransform: capitalize` only touches the first letter, so the raw literal used to leak through. Reachable via the admin-only "Audit Log" nav entry (direct access) or the Audit Log panel in Settings.

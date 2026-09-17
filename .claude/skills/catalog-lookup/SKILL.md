---
name: catalog-lookup
description: Research one or more terminal/radio make+models (in parallel) and format their technical specs in Equipment Catalog editor field order, ready to paste into the "New Equipment"/"Edit Equipment" form. Use when the user gives a make/model (or a list of them) and wants catalog spec data (frequency bands, gain/EIRP, power, SWAP, features) looked up. Do not use for Terminal inventory records (name/serial/owner/status) - that form has no technical-spec fields.
---

# Catalog lookup

Given a make/model, research its public specs and hand back a copy-paste-ready
answer in the exact order the Equipment Catalog editor asks for them
(`frontend/src/pages/catalog-editor-page.tsx`, `EquipmentFormPane`). This skill
never calls the backend API and never writes to the app - output is for the
user to paste into the editor themselves.

## Step 1 - Get make/model(s) + terminal_type

Take the make/model(s) from the invocation (e.g. `/catalog-lookup Paradigm
Hornet` or `/catalog-lookup Paradigm Ragno, Paradigm Hornet, L3Harris
Falcon`). For each one, if it's not obvious from the name whether it's a
**SATCOM** terminal or a **Radio**, ask the user before researching - it
changes which field branch applies (Standard Specs, Services vs. Waveforms,
band options). Batch all ambiguous items into one question if there are
several.

## Step 2 - Run the `catalog-lookup` Workflow

Call the `Workflow` tool with
`scriptPath: "<repo-root>/.claude/workflows/catalog-lookup.js"` (use the
absolute path) - **not** `name: "catalog-lookup"`. Invoking this workflow by
`name` has been observed to silently reuse a stale cached copy of the
script that ignores subsequent edits and drops `args` (every field comes
back as literal `"undefined"`); `scriptPath` reliably picks up the current
file and passes `args` through correctly. If this is retested later and
`name` invocation turns out fixed, it's fine to switch back - but verify
with a real lookup first, don't assume.

Set `args` to an array of `{make, model, terminalType}` objects
(`terminalType` is `"satcom"` or `"radio"`), one per terminal - even for a
single lookup, pass a one-element array. The workflow researches every
terminal **in parallel**, one agent per terminal, each forced to return
structured JSON (via a schema) instead of free-form prose:

- Hard-spec fields (identification codes, Standard Specs, SWAP, Frequencies,
  Additional Physical/RF Specs) come back as `{value, sources, confidence,
  conflict_note?}` - cross-checked against ≥2 independent sources with no
  cap on how many sources are searched, so services/bands/features are
  enumerated exhaustively rather than stopping at the first hit.
- Free-text narrative fields (`one_liner`, `power`, service/feature
  descriptions, `use_cases`, `recommended_accessories`) come back as plain
  strings - no source-verification bureaucracy for prose.
- SATCOM services carry an `is_model_specific` flag distinguishing specs
  tied to the exact model vs. only documented at a shared
  controller/platform level.

The workflow returns an array of per-terminal result objects - one per
input item, in the same order.

The full field list the workflow's schema covers (for reference - the
schema in `.claude/workflows/catalog-lookup.js` is the source of truth, this
just maps schema keys to catalog editor sections):

| Section | Schema path | Notes |
|---|---|---|
| 01 Identification | `identification.{terminal_type,nomenclature,nickname,one_liner,doc_number,operational_mode}` | `one_liner` is free text; the rest are verified fields. Skip `id` (slug) - app auto-derives it from `nomenclature`. |
| 02 Photo | n/a | Skip. Note in output: "no photo lookup - upload manually." |
| 03 Services/Waveforms | `services[]` (SATCOM: `abbrev`,`name`,`description`,`is_model_specific`,sources,confidence) or `waveforms[]` (Radio) | CIR/MIR are out of scope entirely - the workflow doesn't research them; just print the fixed `N/A - service-plan data, not a hardware spec` note once for the section. |
| 04 Standard Specs | `standard_specs.*` | SATCOM: antennaType, reflector, modem, orbit, bucTransmitPower, windTolerance, altPntAvailable. Radio: antennaType, transmitPower, crypto, range, range_unit. All verified fields. |
| 05 SWAP | `swap.{size_length,size_width,size_height,weight,power}` | `power` is free text; the rest are verified fields. |
| 06 Frequencies | `frequencies[]` (`band`,`downlink`,`uplink`,+`eirp`,`gt` for SATCOM) | Verified fields per band. |
| 07 Additional Physical Specs | `additional_physical_specs[]` (`label`,`value`,sources,confidence) | |
| 08 Additional RF Specs | `additional_rf_specs[]` (same shape) | |
| 09 Features | `features[]` (`title`,`description`) | Free text - no sources. Radio only: `recommended_accessories` (free text). |
| 10 Use Cases | `use_cases` | Free text. **Skip in output** - internal-org field, don't print it even though the workflow still returns it. |

## Step 3 - Format the findings for the user

For each item in the workflow's result array, print its fields using the
section numbers and labels above, in that exact order:

- **Verified fields**: `Label: value (source1; source2)` when
  `confidence: "cross-checked"`; `Label: value (source) - single source
  only` when `"single-source"`; `Label: Not found - verify manually` when
  `"not_found"`. If `conflict_note` is present, append it in parentheses
  instead of picking one value.
- **Free-text fields**: `Label: value` - no source annotation.
- **Services**: append `(model-specific)` or `(documented only at the
  platform/controller level - not confirmed for this model)` per
  `is_model_specific`.
- Print the fixed `Services CIR/MIR: N/A - service-plan data, not a
  hardware spec` line once under Section 03 for SATCOM items.
- **SWAP (Section 05) units**: lead with inches for `size_length`,
  `size_width`, `size_height`, and pounds for `weight` - put the
  metric figure in parentheses after, e.g. `18.03 in (458 mm)`. If a
  source only publishes metric, convert and label the converted value
  as such rather than dropping the imperial figure.
- **Section 10 (Use Cases)**: never print this section - it's internal
  to the org. The workflow still returns `use_cases` in its JSON; just
  drop it silently when formatting output, don't note that it was
  omitted.

No raw JSON dump, no extra narrative - just the structured field list per
terminal, one terminal after another if multiple were looked up.

Close with one line noting this is copy-paste-ready for the Equipment
Catalog editor and that nothing was written to the app.

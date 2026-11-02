---
name: catalog-lookup
description: Research one or more terminal/radio make+models (in parallel) and hand them back as the app's import-template CSVs - one equipment row per item, plus every researched waveform - with a spec file in Equipment Catalog editor field order for the datasheet, which import leaves empty. Use when the user gives a make/model (or a list of them) and wants catalog spec data (frequency bands, gain/EIRP, power, SWAP, features) looked up. Do not use for Terminal inventory records (name/serial/owner/status) - that form has no technical-spec fields.
---

# Catalog lookup

Given a make/model, research its public specs and hand back the app's own
import files: an equipment CSV and a waveforms CSV in the import-template
format, plus a spec file listing everything else in the exact order the
Equipment Catalog editor asks for it
(`frontend/src/pages/catalog-editor-page.tsx`, `EquipmentFormPane`). The
equipment importer writes an empty datasheet
(`backend/internal/domain/equipment/csv.go`), so the spec file is what the
datasheet is filled in from after import. This skill reads the local app's
waveform library but never writes to the app - the user imports the files and
fills in the editor themselves.

## Step 1 - Get make/model(s) + terminal_type

Take the make/model(s) from the invocation (e.g. `/catalog-lookup Paradigm
Hornet` or `/catalog-lookup Paradigm Ragno, Paradigm Hornet, L3Harris
Falcon`). For each one, if it's not obvious from the name whether it's a
**SATCOM** terminal or a **Radio**, ask the user before researching - it
changes which field branch applies (Standard Specs, Services vs. Waveforms,
band options). Batch all ambiguous items into one question if there are
several.

## Step 2 - Run the `catalog-lookup` Workflow

When any item is a radio, first read the waveform library from the running
app:

```bash
curl -s http://localhost:3001/api/v1/waveforms
```

Take `abbrev` and `name` from each of `data.waveforms[]` as
`existing_waveforms`. It is used only to spell a researched waveform the way
the library already spells it (`Wave Relay`, not `WAVE-RELAY`), matched in
code ignoring case and punctuation; the research agents never see it. **It
never filters the CSV.** This is the dev library, the import target is usually a different instance,
and the two hold different rows, so every researched waveform goes into the
file and the target's importer reports its own duplicates. If the call fails,
pass `[]`: the workflow then keeps the researchers' own spelling and says so
in `csv_notes`.

Call the `Workflow` tool with
`scriptPath: "<repo-root>/.claude/workflows/catalog-lookup.js"` (use the
absolute path) - **not** `name: "catalog-lookup"`. Invoking this workflow by
`name` has been observed to silently reuse a stale cached copy of the
script that ignores subsequent edits and drops `args` (every field comes
back as literal `"undefined"`); `scriptPath` reliably picks up the current
file and passes `args` through correctly. If this is retested later and
`name` invocation turns out fixed, it's fine to switch back - but verify
with a real lookup first, don't assume.

Set `args` to one object, even for a single lookup:

```json
{
  "items": [{"make": "Persistent Systems", "model": "MPU5", "terminalType": "radio"}],
  "existing_waveforms": [{"abbrev": "Wave Relay", "name": "Wave Relay MANET"}]
}
```

`items` holds one `{make, model, terminalType}` per item, and `terminalType`
is `"satcom"` or `"radio"`. The workflow rejects anything else, because the
value is also the CSV's `terminal_type`. It researches every item **in
parallel** with three agents per item, each filling a fixed set of the
editor's sections (01, 04 and 05; 03 and 06; 07 to 09), so N items cost 3N
research agents. Each agent is forced to return structured JSON (via a
schema) instead of free-form prose:

- Hard-spec fields (identification codes, Standard Specs, SWAP, Frequencies,
  Additional Physical/RF Specs) come back as `{value, sources, confidence,
  conflict_note?}` - cross-checked against ≥2 independent sources with no
  cap on how many sources are searched, so services/bands/features are
  enumerated exhaustively rather than stopping at the first hit.
- Free-text narrative fields (`one_liner`, `power`, service/feature
  descriptions) come back as plain strings - no source-verification
  bureaucracy for prose.
- Three sections are never researched, because the unit fills them in:
  03b Waveform Compatibility, 09b Recommended Accessories and 10 Use Cases.
- SATCOM services carry an `is_model_specific` flag distinguishing specs
  tied to the exact model vs. only documented at a shared
  controller/platform level.

The workflow returns one object:

| Key | What it is |
|---|---|
| `items[]` | one per input item, in input order: the research fields (the full field list below), plus `failed_groups`, `not_researched`, `import_row`, and `csv_abbrev` on each radio waveform |
| `equipment_csv` | one row per item whose 01 Identification research returned, under exactly the header `GET /api/v1/equipment/import/template` serves; `""` when there is none |
| `waveforms_csv` | one row per distinct waveform across every radio, in the `GET /api/v1/waveforms/import/template` shape; `""` when there is none |
| `csv_check` | what `wc -lc` prints for each CSV once written: `{equipment: {lines, bytes}, waveforms: {lines, bytes}}` |
| `waveform_rows[]` | the waveforms CSV's rows, plus `researched_as` (every spelling the research used), `items` and `in_dev_library` |
| `in_dev_library[]` | waveform abbrevs the dev library already has. They stay in the CSV; this is only so the hand-back can say an import into dev reports them as duplicates |
| `failed[]` | every item with a failed group, as `{item, failed_groups, not_researched, csv_effect}`, where `csv_effect` is the computed "When it fails" sentence below, or `""` |
| `csv_notes[]` | computed lines for the hand-back: a nomenclature that fell back to the model name, a shared id, a clipped value, the waveforms spelled the way the dev library spells them |

`failed_groups` names each agent that did not come back, for example on a
usage limit, by its internal key, and is `[]` when all three did.
`not_researched` lists the same failures as the editor sections they leave
empty, named exactly as the editor heads them. Every line a person reads uses
`not_researched`; never print a group key. So an empty list in a section that
was researched means "researched, nothing found", and a section in
`not_researched` means "not researched":

| Internal key | Editor sections it fills | When it fails |
|---|---|---|
| `core` | 01 Identification, 04 Standard Specs, 05 Size · Weight · Power | the item has no equipment CSV row and `import_row` is `null`: its identity was not researched |
| `spectrum` | 03 Services Available (SATCOM) or 03 Waveforms (Radio), 06 Frequencies | a radio's waveforms are missing from the waveforms CSV |
| `extra` | 07 Additional Physical Specs, 08 Additional RF Specs, 09 Features | neither CSV changes; only the spec file is short |

The agents' labels in the workflow's progress tree name the same sections, for
example `L3Harris AN/PRC-158 [sections 01, 04, 05]`.

`import_row` is the item's equipment CSV row. Its `id` is the editor's slug
rule applied to `nomenclature` (lowercase, each run of other characters to
`-`, trimmed, at most 80 characters), which is how the template's own example
gets `an-prc-158`. `operational_mode` is pipe-joined in the editor's COTM/COTP
vocabulary, and `terminal_type` and `make` are the caller's.

The full field list the workflow's schema covers (for reference - the
schema in `.claude/workflows/catalog-lookup.js` is the source of truth, this
just maps schema keys to catalog editor sections):

| Section | Schema path | Notes |
|---|---|---|
| 01 Identification | `identification.{terminal_type,nomenclature,nickname,one_liner,doc_number,operational_mode}` | `one_liner` is free text; the rest are verified fields, and `operational_mode`'s value is a list in the editor's COTM/COTP vocabulary. `id` (slug) is not researched: the workflow derives it from `nomenclature` and returns it in `import_row`. |
| 02 Photo | n/a | Skip. Note in output: "no photo lookup - upload manually." |
| 03 Services Available (SATCOM) / 03 Waveforms (Radio) | `services[]` (SATCOM: `abbrev`,`name`,`description`,`is_model_specific`,sources,confidence) or `waveforms[]` (Radio: `abbrev`,`name`,`description`,sources,confidence, plus the computed `csv_abbrev`) | CIR/MIR are out of scope entirely - the workflow doesn't research them; just print the fixed `N/A - service-plan data, not a hardware spec` note once for the section. |
| 04 Standard Specs | `standard_specs.*` | SATCOM: antennaType, reflector, modem, orbit, bucTransmitPower, windTolerance, altPntAvailable. Radio: antennaType, transmitPower, crypto, range, range_unit. All verified fields. |
| 05 Size · Weight · Power | `swap.{size_length,size_width,size_height,weight,power}` | `power` is free text; the rest are verified fields. |
| 06 Frequencies | `frequencies[]` (`band`,`downlink`,`uplink`,+`eirp`,`gt` for SATCOM) | Verified fields per band. `band` is one of the editor's options: SATCOM S, C, X, Ku, K, Ka; Radio HF, VHF, UHF, L, S, C. |
| 07 Additional Physical Specs | `additional_physical_specs[]` (`label`,`value`,sources,confidence) | |
| 08 Additional RF Specs | `additional_rf_specs[]` (same shape) | |
| 09 Features | `features[]` (`title`,`description`) | Free text - no sources. |
| 09b Recommended Accessories | n/a | Radio only. Not researched: the unit enters it in the editor. Don't print it. |
| 10 Use Cases | n/a | Not researched: internal to the org, entered in the editor. Don't print it. |

## Step 3 - Format the findings for the user

Hand the results back as files in `<scratchpad>`. `<batch>` is the one item's
`import_row.id` when a single item was looked up and has one, and otherwise
`radios`, `satcom` or `catalog` by the items' types.

1. `equipment-<batch>.csv`: `equipment_csv`, exactly as returned. Skip it
   when it is `""`.
2. `waveforms-<batch>.csv`: `waveforms_csv`, exactly as returned. Skip it
   when it is `""`, which it always is for a SATCOM-only lookup.
3. `catalog-specs-<batch>.md`: the field list below.

The workflow has already encoded both CSVs the way the importers read them (a
header of column keys, no `#` lines, LF line endings, a cell quoted only when
it holds a comma, quote or line break). Copy each string into its file without
re-typing, reordering or re-quoting anything, and never drop a waveform row
because the dev library has it. Then run `wc -lc` on each CSV: both numbers
must equal that file's `csv_check` entry. A mismatch means the copy is wrong,
so rewrite the file before sending it.

The spec file lists every item in `items` order, printing its fields under the
section numbers and labels above, in that exact order:

- **Section 01** opens with `ID (slug): <import_row.id>`, the id the
  equipment CSV carries.
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
- **Waveforms** (Section 03 for a radio): print each one's `csv_abbrev`, the
  chip it becomes once the waveforms CSV is imported, with the researched
  `abbrev` in parentheses when the two differ.
- **SWAP (Section 05) units**: lead with inches for `size_length`,
  `size_width`, `size_height`, and pounds for `weight` - put the
  metric figure in parentheses after, e.g. `18.03 in (458 mm)`. If a
  source only publishes metric, convert and label the converted value
  as such rather than dropping the imperial figure.
- **Sections 03b, 09b and 10**: never print them. The workflow does not
  research them, and the spec file says nothing about them.
- **A section in `not_researched`**: print it as `Not researched - re-run
  this item`, never as `Not found`.

No raw JSON dump, no extra narrative - just the structured field list per
terminal, one terminal after another if multiple were looked up.

Send the files with one `SendUserFile` call (`display: "attach"`), then print:

1. One table, one row per item in input order, from `import_row`:

   | ID | Nomenclature | Make | Type | Mode | Not researched |

   `Not researched` lists the item's `not_researched` sections and is blank
   when there are none. An item with no `import_row` shows its own `make` and
   `terminal_type_requested`, and `-` for the rest.
2. Every `csv_notes` line, as it is.
3. If `in_dev_library` is non-empty, one line naming those abbrevs: they are
   in the file, and an import into dev reports them as duplicates because
   import never updates a row. Do not turn them into suggested edits.
4. If `failed` is non-empty, one line per entry: the item, `Not researched:`
   and its `not_researched` sections, then its `csv_effect`. Offer to re-run
   those items; a re-run is a new workflow call with only them, and its files
   hold only them.

Close with one line on the import order: the waveforms CSV first, through the
header's CSV menu (Import, dataset **Waveform Library**), so its chips exist
before any record needs them; then the equipment CSV (dataset **Equipment
Catalog**); then each record's datasheet in the editor, from the spec file.
Nothing was written to the app.

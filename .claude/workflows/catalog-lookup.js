export const meta = {
  name: 'catalog-lookup',
  description: 'Research one or more terminal/radio make+models in parallel for the Equipment Catalog editor, returning structured cross-checked field data plus the equipment and waveform import CSVs',
  whenToUse: 'Called by the catalog-lookup skill. args is {items, existing_waveforms}: items is an array of {make, model, terminalType} ("satcom" or "radio"), existing_waveforms the dev Global Waveform Library as [{abbrev, name}]. A bare items array, or a single item object, is also accepted.',
  phases: [{ title: 'Research', detail: 'three agents per item, each filling a fixed set of editor sections: 01, 04 and 05; 03 and 06; 07 to 09' }],
}

// ---------------------------------------------------------------------------
// What this copies from the app. Each one is a fact that can drift, so each
// names where it comes from.
// ---------------------------------------------------------------------------

// The editor's Operational Mode options (OPMODE_OPTS in
// frontend/src/components/catalog/catalog-vocab.ts), in its order.
const OPMODE_OPTS = ['COTM', 'COTP']

// The import templates' column keys, in their order: GET
// /api/v1/equipment/import/template (backend/internal/domain/equipment/csv.go)
// and GET /api/v1/waveforms/import/template (waveform/csv.go). The importers
// match headers on these keys, not on labels. The equipment id is the
// user-authored slug below; a waveform id is server-owned, and an id header
// fails the waveform file outright.
const EQUIPMENT_KEYS = ['id', 'nomenclature', 'terminal_type', 'nickname', 'make', 'one_liner', 'doc_number', 'operational_mode']
const WAVEFORM_KEYS = ['abbrev', 'name', 'description']

// The request DTOs' max= tags (equipment/dto and waveform/dto request.go). The
// importers do not enforce them and the editor and library pane do, so an
// over-length value imports and then cannot be saved again unchanged.
const NOMENCLATURE_MAX = 200
const WAVEFORM_ABBREV_MAX = 50

// Chosen here, not copied from the app (the waveform DTO sets no limit): a
// library description says what the name stands for, what it does and what is
// unique about it, and that fits in 200 characters.
const WAVEFORM_DESCRIPTION_MAX = 60

// The data sheet is a one-page, at-a-glance card, not a database record, so
// the extra sections carry only the few things worth a glance. Chosen here,
// not copied from the app. A research agent asked to "enumerate everything"
// once filled the AN/PRC-152 with 16 features and 34 extra specs, most
// repeating what the sheet's SWAP block, standard specs and band table
// already show, and pushed it past a page.
const SHEET_FEATURES = 4
const SHEET_SPECS = 4
const SHEET_VALUE_MAX = 40

// The editor's ID rule, verbatim (slugify in
// frontend/src/pages/catalog-editor-page.tsx). It also gives the template's
// own example id, an-prc-158.
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

// Verified fields (hard specs / named values) require sources + a confidence
// level and can carry a conflict note if two sources disagree. Free-text
// narrative fields (one_liner, power, service/feature descriptions, use
// cases) are plain strings - no source-verification bureaucracy for prose.
const VF = (valueSchema) => ({
  type: 'object',
  properties: {
    value: valueSchema,
    sources: {
      type: 'array',
      items: { type: 'string' },
      description: 'URL(s) or page title(s) consulted. Include every source checked - at least 2 when independently corroborated.',
    },
    confidence: {
      type: 'string',
      enum: ['cross-checked', 'single-source', 'not_found', 'n/a'],
    },
    conflict_note: {
      type: 'string',
      description: 'Only set if sources disagree: describe each conflicting value and its source.',
    },
  },
  required: ['value', 'sources', 'confidence'],
})

const STR = { type: 'string' }
const VFSTR = VF(STR)

const LABEL_VALUE = {
  type: 'array',
  maxItems: SHEET_SPECS,
  items: {
    type: 'object',
    properties: { label: STR, value: STR, sources: { type: 'array', items: STR }, confidence: { type: 'string', enum: ['cross-checked', 'single-source', 'not_found'] } },
    required: ['label', 'value', 'sources', 'confidence'],
  },
}

// ---------------------------------------------------------------------------
// Schema group A "core": identification, standard_specs, swap. Use cases are
// not researched: they are the unit's own, entered in the editor.
// (make/model are NOT in any group schema - each agent call only researches
// its slice of fields; make/model get merged back in from item.make/item.model
// after all three calls return, since the caller already knows them).
// ---------------------------------------------------------------------------
function buildSchemaCore(terminalType) {
  // Every identification field but terminal_type goes into a cell of the
  // equipment import CSV as it is. A lookup on 2026-09-30 came back with
  // variants, part numbers and superseded documents packed into single fields,
  // which a cell cannot carry, so each of these asks for one value.
  const oneValue = (field, what = '') => VF({ type: 'string', description: `${what}One value, as it would be typed into the editor's ${field} field: when sources give several (variants, part numbers, superseded designations), put the current one here and name the others in conflict_note.` })
  const identification = {
    type: 'object',
    properties: {
      terminal_type: VFSTR,
      nomenclature: oneValue('Nomenclature', 'The designation the record is filed under: the military nomenclature when one is assigned (AN/PRC-158), otherwise the manufacturer\'s model designation (MPU5). '),
      nickname: oneValue('Nickname'),
      one_liner: { type: 'string', description: 'What it is at a glance, at most 80 characters ("5 W multiband handheld, 30-512 MHz, Type 1.").' },
      doc_number: oneValue('Document Number'),
      operational_mode: VF({
        type: 'array',
        items: { type: 'string', enum: OPMODE_OPTS },
        description: 'Every mode a source supports, in the editor\'s two options: COTM (communications on the move: works while the platform or operator moves) and COTP (communications on the pause: works set up at the halt, fixed or fly-away). A radio used both ways is both. [] with confidence "not_found" when no source says.',
      }),
    },
    required: ['terminal_type', 'nomenclature', 'nickname', 'one_liner', 'doc_number', 'operational_mode'],
  }

  const standardSpecsSatcom = {
    type: 'object',
    properties: {
      antennaType: VF({ type: 'string', description: 'The antenna type as a short phrase, at most 60 characters ("Flat panel, electronically steered").' }), reflector: VFSTR, modem: VFSTR, orbit: VFSTR,
      bucTransmitPower: VFSTR, windTolerance: VFSTR, altPntAvailable: VFSTR,
    },
    required: ['antennaType', 'reflector', 'modem', 'orbit', 'bucTransmitPower', 'windTolerance', 'altPntAvailable'],
  }

  const standardSpecsRadio = {
    type: 'object',
    properties: {
      antennaType: VF({ type: 'string', description: 'The antenna type as a short phrase, at most 60 characters ("Blade, TNC connector").' }),
      transmitPower: VFSTR,
      crypto: VF({ type: 'string', description: 'The encryption it supports: the type, or the highest variant of a family, at most 30 characters, as the class and suite only ("NSA Type 1, Suite B", "AES-256"). No module, mode or fill-device names.' }),
      range: VFSTR,
      range_unit: VFSTR,
    },
    required: ['antennaType', 'transmitPower', 'crypto', 'range', 'range_unit'],
  }

  const swapDim = VF({ type: 'string', description: 'Inches first, e.g. "18.03 in (458 mm)". Convert if the source only publishes metric - never drop the imperial figure.' })
  const swapWeight = VF({ type: 'string', description: 'Pounds first, e.g. "19.8 lb (9 kg)". Convert if the source only publishes metric - never drop the imperial figure.' })
  const swap = {
    type: 'object',
    properties: {
      size_length: swapDim, size_width: swapDim, size_height: swapDim,
      weight: swapWeight,
      power: { type: 'string', description: 'The power source the equipment requires or can take, as a short phrase of at most 60 characters ("BB-2590 Li-ion battery, 10-32 VDC", "90-240 VAC, 50-60 Hz"). No adapter lists, no caveats, and never an estimated power draw.' },
    },
    required: ['size_length', 'size_width', 'size_height', 'weight', 'power'],
  }

  const properties = {
    identification,
    standard_specs: terminalType === 'satcom' ? standardSpecsSatcom : standardSpecsRadio,
    swap,
  }
  const required = ['identification', 'standard_specs', 'swap']

  return { type: 'object', properties, required }
}

// ---------------------------------------------------------------------------
// Schema group B "spectrum": frequencies, and services (satcom) / waveforms (radio)
// ---------------------------------------------------------------------------
function buildSchemaSpectrum(terminalType) {
  const satcomServices = {
    type: 'array',
    description: 'Every compatible service/network plan found - enumerate exhaustively (do not stop at the first hit). Check each major GEO/MEO operator by name: Viasat (HCX, GX), Intelsat (FlexMove), SES, Eutelsat, Inmarsat, and any other operator named on the manufacturer page, datasheet, or press releases.',
    items: {
      type: 'object',
      properties: {
        abbrev: STR,
        name: STR,
        description: STR,
        is_model_specific: { type: 'boolean', description: 'true only if a source ties this service to THIS exact model, not just a sibling product or the shared controller/platform' },
        sources: { type: 'array', items: STR },
        confidence: { type: 'string', enum: ['cross-checked', 'single-source', 'platform-level-only'] },
      },
      required: ['abbrev', 'name', 'description', 'is_model_specific', 'sources', 'confidence'],
    },
  }

  // Each waveform also becomes a row of the waveforms import CSV, so abbrev,
  // name and description describe the waveform itself, the way a library row
  // does.
  const waveformProps = {
    abbrev: { type: 'string', description: `The short form operators use (SINCGARS, ANW2, SRW), at most ${WAVEFORM_ABBREV_MAX} characters. It becomes the waveform's library abbrev.` },
    name: { type: 'string', description: 'The waveform\'s full name.' },
    description: { type: 'string', description: `What the name stands for, what it does and what is unique about it, at most ${WAVEFORM_DESCRIPTION_MAX} characters - not this radio's implementation, and no history or justification. It becomes the library row's description.` },
    sources: { type: 'array', items: STR },
    confidence: { type: 'string', enum: ['cross-checked', 'single-source'] },
  }
  const radioWaveforms = {
    type: 'array',
    description: 'Every supported waveform found on the datasheet, e.g. SINCGARS, ANW2, SRW.',
    items: { type: 'object', properties: waveformProps, required: Object.keys(waveformProps) },
  }

  // The editor's band options (SATCOM_BAND_OPTS and RADIO_BAND_OPTS in
  // frontend/src/components/catalog/catalog-vocab.ts), listed here in
  // frequency order. The radio list lacked S and C until 2026-09-30, so a
  // MANET radio's S- or C-band module (MPU5, TW-950) had no band the schema
  // would accept.
  const bandEnum = terminalType === 'satcom'
    ? ['S', 'C', 'X', 'Ku', 'K', 'Ka']
    : ['HF', 'VHF', 'UHF', 'L', 'S', 'C']

  const frequencyBandProps = {
    band: { type: 'string', enum: bandEnum },
    downlink: VF({ type: 'string', description: 'The range only, as min-max and unit ("30-225 MHz"). No commentary.' }),
    uplink: VF({ type: 'string', description: 'The range only, as min-max and unit ("30-225 MHz"). No commentary.' }),
  }
  if (terminalType === 'satcom') {
    frequencyBandProps.eirp = VFSTR
    frequencyBandProps.gt = VFSTR
  }
  const frequencies = {
    type: 'array',
    description: 'One entry per supported band. Enumerate every band the terminal supports, not just the first one found.',
    items: { type: 'object', properties: frequencyBandProps, required: Object.keys(frequencyBandProps) },
  }

  const properties = { frequencies }
  const required = ['frequencies']

  if (terminalType === 'satcom') {
    properties.services = satcomServices
    required.push('services')
  } else {
    properties.waveforms = radioWaveforms
    required.push('waveforms')
  }

  return { type: 'object', properties, required }
}

// ---------------------------------------------------------------------------
// Schema group C "extra": additional_physical_specs, additional_rf_specs,
// features. Recommended accessories are not researched: the unit enters them.
// ---------------------------------------------------------------------------
function buildSchemaExtra(terminalType) {
  const features = {
    type: 'array',
    description: `The ${SHEET_FEATURES} most important differentiating features, at most. A title of a few words and a description of one short line, at most ${SHEET_VALUE_MAX + 20} characters. Nothing the specs already state (bands, crypto, power, waveforms, size).`,
    maxItems: SHEET_FEATURES,
    items: { type: 'object', properties: { title: STR, description: STR }, required: ['title', 'description'] },
  }

  const properties = {
    additional_physical_specs: LABEL_VALUE,
    additional_rf_specs: LABEL_VALUE,
    features,
  }
  const required = ['additional_physical_specs', 'additional_rf_specs', 'features']

  return { type: 'object', properties, required }
}

// ---------------------------------------------------------------------------
// Prompt group A "core"
// ---------------------------------------------------------------------------
function buildPromptCore(item) {
  const { make, model, terminalType } = item
  const kind = terminalType === 'satcom' ? 'SATCOM terminal' : 'Radio'
  return `Research the public technical specifications of the "${make} ${model}" ${kind}, focusing on identification, standard specs, and SWAP (size/weight/power) for the Equipment Catalog.

Prioritize the manufacturer's official datasheet/spec-sheet PDF first, then the manufacturer's product page, then reputable distributor/government spec pages. Avoid forums, marketplace listings, or other unverified sources.

Critical requirements:
- Cross-check every hard-spec field (identification codes, standard specs, SWAP) against at least two independent sources before marking it "cross-checked". If only one source exists anywhere, use confidence "single-source" rather than overstating certainty. If sources disagree, keep confidence at the lower tier and fill in conflict_note describing both values and their sources - never silently pick one.
- Do NOT cap how many sources you check - the goal is completeness, not speed.
- Free-text narrative fields (one_liner, power) do not need source citation or cross-checking - just report the best available description.
- Never fabricate a number that no source states. If a field can't be verified from any credible source, set value to "Not found - verify manually" and confidence "not_found".
- SWAP dimensions and weight: always lead with the imperial unit (inches / pounds), metric in parentheses - even when the only source published is metric, convert it rather than reporting metric alone.
- swap.power specifically: the power source the equipment requires or can take, as a short phrase ("BB-2590 Li-ion battery, 10-32 VDC"). No adapter lists or caveats. Do not compute or estimate an actual power draw/consumption figure (Watts or Amps drawn) - that number is rarely published, so an estimate here would misrepresent a spec field as verified data.
- Every value is what gets typed into the editor's box, so keep it to the length its field states. Detail, alternatives and caveats belong in conflict_note, never in value.
- Identification values go into the equipment import CSV as they are, so each is one value. nomenclature is the military nomenclature when one is assigned (AN/PRC-158), otherwise the manufacturer's model designation (MPU5). When sources give several values for a field (variants, part numbers, superseded designations), put the current one in value and name the others in conflict_note.
- operational_mode takes only the editor's two options, every one a source supports: COTM (works on the move) and COTP (works at the halt, fixed or fly-away). Its value is a list, so when no source says, set it to [] with confidence "not_found" rather than to the "Not found" text.
- ${terminalType === 'satcom' ? `bucTransmitPower specifically: this field is being filled in for a form that needs a worst-case/rated figure to enter, not a perfectly precise one. If the exact model's spec sheet lacks a number, search harder for ANY credible rated/max transmit power figure - the shared BUC/amplifier module's datasheet, a sibling variant, or a distributor spec page - and report the highest/worst-case wattage found, labeling it clearly (e.g. "40 W (rated max, per shared BUC module datasheet - not confirmed model-specific)") with confidence "single-source" or noting the caveat in conflict_note. Only use "Not found - verify manually" if no rated transmit power figure exists in any source at all.
- modem specifically: if the datasheet states an integrated/proprietary modem (e.g. "integrated Qualcomm modem, proprietary interface") rather than a named standalone modem model, report that description as the value (not "Not found") - this is a real, verifiable answer, just not a separate part number.` : ''}

Call the structured output tool with the researched data.`
}

// ---------------------------------------------------------------------------
// Prompt group B "spectrum"
// ---------------------------------------------------------------------------
function buildPromptSpectrum(item) {
  const { make, model, terminalType } = item
  const kind = terminalType === 'satcom' ? 'SATCOM terminal' : 'Radio'
  const listNoun = terminalType === 'satcom' ? 'services' : 'waveforms'
  return `Research the public technical specifications of the "${make} ${model}" ${kind}, focusing on supported frequency bands and ${terminalType === 'satcom' ? 'compatible services/network plans' : 'supported waveforms'} for the Equipment Catalog.

Prioritize the manufacturer's official datasheet/spec-sheet PDF first, then the manufacturer's product page, then reputable distributor/government spec pages. Avoid forums, marketplace listings, or other unverified sources.

Critical requirements:
- Cross-check every hard-spec field (frequency bands, ${listNoun}) against at least two independent sources before marking it "cross-checked". If only one source exists anywhere, use confidence "single-source" rather than overstating certainty. If sources disagree, keep confidence at the lower tier and fill in conflict_note describing both values and their sources - never silently pick one.
- Do NOT cap how many sources you check - the goal is completeness, not speed. Enumerate every variant of a list field (every compatible service/operator, every supported band) before concluding the list is complete. Check each major operator/band individually rather than stopping at the first hit.
- ${terminalType === 'satcom'
    ? 'For services, explicitly determine whether each one is tied to THIS exact model (is_model_specific: true) versus only documented at a shared controller/platform level or on a sibling product (is_model_specific: false) - state this distinction, don\'t blur it.'
    : 'For waveforms, only list ones the datasheet or manufacturer page attributes to this exact model.'}
- CIR/MIR service data rates are out of scope - do not attempt to find them (they are service-plan data, not a hardware spec).
- Never fabricate a number that no source states. If a field can't be verified from any credible source, set value to "Not found - verify manually" and confidence "not_found".

Call the structured output tool with the researched data.`
}

// ---------------------------------------------------------------------------
// Prompt group C "extra"
// ---------------------------------------------------------------------------
function buildPromptExtra(item) {
  const { make, model, terminalType } = item
  const kind = terminalType === 'satcom' ? 'SATCOM terminal' : 'Radio'
  return `Research the public technical specifications of the "${make} ${model}" ${kind}, focusing on additional physical/RF specs and key differentiating features for the Equipment Catalog.

Prioritize the manufacturer's official datasheet/spec-sheet PDF first, then the manufacturer's product page, then reputable distributor/government spec pages. Avoid forums, marketplace listings, or other unverified sources.

Critical requirements:
- Cross-check every hard-spec field (additional physical specs, additional RF specs) against at least two independent sources before marking it "cross-checked". If only one source exists anywhere, use confidence "single-source" rather than overstating certainty. If sources disagree, keep confidence at the lower tier and fill in conflict_note describing both values and their sources - never silently pick one.
- Do not cap how many sources you check, but DO cap what you return: this fills a one-page, at-a-glance data sheet. Return at most ${SHEET_SPECS} additional physical specs, ${SHEET_SPECS} additional RF specs and ${SHEET_FEATURES} features - the ones an operator would want at a glance, not everything found.
- Each spec value is a short phrase of at most ${SHEET_VALUE_MAX} characters ("-24 to +140 F", "2 m for 30 min"). Put source detail and disagreements in conflict_note, never in value.
- Leave out anything the sheet already shows elsewhere: size, weight, power or battery, antenna or connector, frequency range or bands, transmit power, encryption, and waveforms.
- Free-text narrative fields (feature descriptions) do not need source citation or cross-checking - just report the best available description.
- Never fabricate a number that no source states. If a field can't be verified from any credible source, set value to "Not found - verify manually" and confidence "not_found".

Call the structured output tool with the researched data.`
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
let parsedArgs = args
if (typeof parsedArgs === 'string') {
  parsedArgs = JSON.parse(parsedArgs)
}
// The skill passes {items, existing_waveforms}. A bare array of items, or a
// single item, is still accepted and runs with no library to spell against.
const wrapped = !!parsedArgs && typeof parsedArgs === 'object' && !Array.isArray(parsedArgs) && Array.isArray(parsedArgs.items)
const rawItems = wrapped ? parsedArgs.items : Array.isArray(parsedArgs) ? parsedArgs : [parsedArgs]

// terminalType picks the schema branch and is also the CSV's terminal_type,
// which the importer admits only as satcom or radio. Anything but an exact
// "satcom" used to be researched as a radio without a word, "SATCOM" included.
const items = rawItems.map((item) => {
  if (!item || typeof item !== 'object' || !item.make || !item.model || !item.terminalType) {
    throw new Error(`Bad workflow args item: ${JSON.stringify(item)} - expected {make, model, terminalType}`)
  }
  const terminalType = String(item.terminalType).trim().toLowerCase()
  if (terminalType !== 'satcom' && terminalType !== 'radio') {
    throw new Error(`Bad workflow args item: ${JSON.stringify(item)} - terminalType must be "satcom" or "radio"`)
  }
  return { make: String(item.make).trim(), model: String(item.model).trim(), terminalType }
})
if (!items.length) {
  throw new Error('Bad workflow args: no items - expected {items: [{make, model, terminalType}]}')
}

// The dev Global Waveform Library, read by the skill from the running app. It
// is used only to spell a researched waveform the way the library already
// spells it, never to leave a row out: the import target is usually a different instance, whose
// library holds different rows and whose importer reports its own duplicates.
const library = []
const libraryLower = new Set()
for (const w of wrapped && Array.isArray(parsedArgs.existing_waveforms) ? parsedArgs.existing_waveforms : []) {
  const abbrev = w && typeof w === 'object' && w.abbrev != null ? String(w.abbrev).trim() : ''
  if (!abbrev || libraryLower.has(abbrev.toLowerCase())) continue
  libraryLower.add(abbrev.toLowerCase())
  library.push({ abbrev, name: w.name == null ? '' : String(w.name).trim() })
}

// ---------------------------------------------------------------------------
// Research: three agents per item, so N items cost 3N agents
// ---------------------------------------------------------------------------
const GROUPS = ['core', 'spectrum', 'extra']
const label = (item) => `${item.make} ${item.model}`

// The editor sections each agent fills, named exactly as the editor heads them
// (EditorFormSection in frontend/src/pages/catalog-editor-page.tsx). The group
// keys are internal only: the agent labels, the log and everything the skill
// hands back name these sections instead, so nobody has to learn what "core"
// means. 03b Waveform Compatibility, 09b Recommended Accessories and 10 Use
// Cases are not researched at all: the unit fills them in.
function sectionsOf(group, terminalType) {
  const radio = terminalType !== 'satcom'
  if (group === 'core') return ['01 Identification', '04 Standard Specs', '05 Size · Weight · Power']
  if (group === 'spectrum') return [radio ? '03 Waveforms' : '03 Services Available', '06 Frequencies']
  return ['07 Additional Physical Specs', '08 Additional RF Specs', '09 Features']
}
const agentLabel = (item, group) => `${label(item)} [sections ${sectionsOf(group, item.terminalType).map((s) => s.split(' ')[0]).join(', ')}]`

// A group counts as returned only when it is an object carrying every key its
// schema requires. agent() returns null when a subagent dies (a usage limit, a
// terminal API error) and parallel() turns a thrown thunk into null, so before
// this a failed group only left its keys out of the merge, which read exactly
// like "researched, nothing found".
function returned(result, schema) {
  return !!result && typeof result === 'object' && !Array.isArray(result) && schema.required.every((k) => k in result)
}

phase('Research')
const researched = await parallel(
  items.map((item) => async () => {
    const schemas = {
      core: buildSchemaCore(item.terminalType),
      spectrum: buildSchemaSpectrum(item.terminalType),
      extra: buildSchemaExtra(item.terminalType),
    }
    const [core, spectrum, extra] = await parallel([
      () => agent(buildPromptCore(item), { label: agentLabel(item, 'core'), phase: 'Research', schema: schemas.core }),
      () => agent(buildPromptSpectrum(item), { label: agentLabel(item, 'spectrum'), phase: 'Research', schema: schemas.spectrum }),
      () => agent(buildPromptExtra(item), { label: agentLabel(item, 'extra'), phase: 'Research', schema: schemas.extra }),
    ])
    const got = { core, spectrum, extra }
    const failedGroups = GROUPS.filter((g) => !returned(got[g], schemas[g]))

    const result = { make: item.make, model: item.model }
    for (const g of GROUPS) {
      if (!failedGroups.includes(g)) Object.assign(result, got[g])
    }
    // The schema asks for the one-page budget; this holds it if an agent
    // returns more anyway.
    for (const [key, max] of [['features', SHEET_FEATURES], ['additional_physical_specs', SHEET_SPECS], ['additional_rf_specs', SHEET_SPECS]]) {
      if (Array.isArray(result[key])) result[key] = result[key].slice(0, max)
    }
    result.terminal_type_requested = item.terminalType
    result.failed_groups = failedGroups
    result.not_researched = failedGroups.flatMap((g) => sectionsOf(g, item.terminalType))
    return result
  })
)

// An item whose own thunk threw comes back from parallel() as null. None of it
// can be trusted, so all three of its groups are recorded as failed.
const results = researched.map((r, i) => r || {
  make: items[i].make,
  model: items[i].model,
  terminal_type_requested: items[i].terminalType,
  failed_groups: GROUPS.slice(),
  not_researched: GROUPS.flatMap((g) => sectionsOf(g, items[i].terminalType)),
})

// ---------------------------------------------------------------------------
// Import CSVs - computed, not judged
// ---------------------------------------------------------------------------
const oneLine = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()

// Case- and punctuation-blind, so "HAVE QUICK" meets HAVEQUICK and "L-TAC"
// meets LTAC. The importer's own uniqueness is only case-blind, so a spelling
// variant would otherwise import as a second row for the same waveform.
const wfKey = (s) => oneLine(s).toUpperCase().replace(/[^A-Z0-9]/g, '')

// A header of column keys and no # lines, LF line endings, and a cell quoted
// only when it holds a comma, quote or line break.
function cell(v) {
  const s = String(v == null ? '' : v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (keys, rows) => [keys.join(',')].concat(rows.map((r) => keys.map((k) => cell(r[k])).join(','))).join('\n') + '\n'

// A verified field's value for a cell, or '' when research found none. The
// "Not found - verify manually" sentinel belongs in the spec file, never in a
// record.
function cellValue(field) {
  if (!field || typeof field !== 'object' || field.confidence === 'not_found' || field.confidence === 'n/a') return ''
  const v = oneLine(field.value)
  return /^(not found\b|n\/a$|none$|-+$)/i.test(v) ? '' : v
}

// operational_mode as the editor stores it: the options found, in the editor's
// order, pipe-joined as the equipment template's note asks.
function modesValue(field) {
  if (!field || typeof field !== 'object' || field.confidence === 'not_found' || field.confidence === 'n/a') return ''
  const given = Array.isArray(field.value) ? field.value : String(field.value == null ? '' : field.value).split(/[^A-Za-z]+/)
  const found = new Set(given.map((m) => String(m).trim().toUpperCase()))
  return OPMODE_OPTS.filter((m) => found.has(m)).join('|')
}

// Cut at a word boundary, so a clipped value does not end mid-word.
function clip(s, n) {
  if (s.length <= n) return s
  const cut = s.slice(0, n)
  const sp = cut.lastIndexOf(' ')
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '')
}

const notes = []

// One equipment row per item whose core group (sections 01, 04 and 05)
// returned. An item without it
// gets none: its identity was not researched, and a row guessed from the make
// and model would file a record under an id nothing verified.
const equipmentRows = []
results.forEach((r, i) => {
  const item = items[i]
  r.import_row = null
  if (r.failed_groups.includes('core')) return
  const ident = r.identification || {}
  let nomenclature = cellValue(ident.nomenclature)
  if (!nomenclature) {
    nomenclature = oneLine(item.model)
    notes.push(`${label(item)}: no nomenclature was found, so its row is filed under the model name as given, ${nomenclature}.`)
  }
  if (nomenclature.length > NOMENCLATURE_MAX) {
    const cut = clip(nomenclature, NOMENCLATURE_MAX)
    notes.push(`${label(item)}: the nomenclature is longer than the editor's ${NOMENCLATURE_MAX}-character limit and was cut to "${cut}".`)
    nomenclature = cut
  }
  const row = {
    id: slugify(nomenclature) || slugify(label(item)),
    nomenclature,
    terminal_type: item.terminalType,
    nickname: cellValue(ident.nickname),
    make: oneLine(item.make),
    one_liner: oneLine(ident.one_liner),
    doc_number: cellValue(ident.doc_number),
    operational_mode: modesValue(ident.operational_mode),
  }
  r.import_row = row
  equipmentRows.push(row)
})

const labelsById = new Map()
results.forEach((r, i) => {
  if (!r.import_row) return
  if (!labelsById.has(r.import_row.id)) labelsById.set(r.import_row.id, [])
  labelsById.get(r.import_row.id).push(label(items[i]))
})
for (const [id, labels] of labelsById) {
  if (labels.length > 1) notes.push(`${labels.join(' and ')} share the id ${id}: the importer reports every row after the first as a duplicate.`)
}

// Every waveform researched for every radio, one row per waveform. A waveform
// the dev library already has stays in: all it takes from the library is the
// spelling. Matching is done in code only, ignoring case and punctuation, so
// the research never carries the library and no agent is spent on it.
//
// The library's spelling wins whenever one library row is meant, because a
// different spelling imports as a second row and the record's chip then points
// at the copy. So a waveform matches, in this order, on its abbrev; on its full
// name; on a designation the library row carries in its name (MIL-STD-188-181B
// is "UHF SATCOM Dedicated Channel (MIL-STD-188-181B)", which is TACSAT); or on
// a library abbrev plus a version suffix (HAVEQUICK II is HAVEQUICK); then,
// for a waveform researched under its standard's number, on a library name
// its own name contains ("MIL-STD-188-181C Integrated Waveform ..." is IW), and
// last on a library abbrev standing as a word in it ("MIL-STD-188-182A 5 kHz
// UHF DAMA SATCOM" is DAMA). The first
// rule that names exactly one row decides; one that names two decides nothing.
// csv_notes lists every waveform the library lacks so the rest can be spotted
// before import.
const libraryExact = new Map(library.map((w) => [w.abbrev, w]))
const libraryByKey = new Map()
for (const w of library) {
  if (!libraryByKey.has(wfKey(w.abbrev))) libraryByKey.set(wfKey(w.abbrev), w)
}
const designations = (name) => {
  const out = [wfKey(name)]
  for (const m of String(name || '').matchAll(/\(([^)]*)\)/g)) {
    for (const part of m[1].split(/[,/;]/)) out.push(wfKey(part))
  }
  return out.filter(Boolean)
}
const only = (rows) => (new Set(rows).size === 1 ? rows[0] : null)
// Words, for phrase matching: " integrated waveform " inside a longer name.
const words = (v) => ` ${String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
function libraryMatch(w) {
  const keys = [wfKey(w.abbrev), wfKey(w.name)].filter(Boolean)
  const rules = [
    (k) => library.filter((l) => wfKey(l.abbrev) === k),
    (k) => library.filter((l) => wfKey(l.name) === k),
    (k) => library.filter((l) => designations(l.name).includes(k)),
    (k) => library.filter((l) => {
      const base = wfKey(l.abbrev)
      return base && k.startsWith(base) && /^(i|ii|iii|iv|v)$/.test(k.slice(base.length))
    }),
  ]
  const named = words(w.name)
  const phraseRules = [
    () => library.filter((l) => words(l.name).trim().includes(' ') && named.includes(words(l.name))),
    () => library.filter((l) => words(l.abbrev).trim() && named.includes(words(l.abbrev))),
  ]
  for (const rule of rules) {
    const hit = only(keys.flatMap(rule))
    if (hit) return hit
  }
  for (const rule of phraseRules) {
    const hit = only(rule())
    if (hit) return hit
  }
  return null
}

const researchedWaveforms = []
results.forEach((r, i) => {
  if (!Array.isArray(r.waveforms)) return
  for (const w of r.waveforms) {
    if (!w || typeof w !== 'object') continue
    const spelled = oneLine(w.abbrev) || oneLine(w.name)
    if (!wfKey(spelled)) {
      w.csv_abbrev = ''
      notes.push(`${label(items[i])}: a waveform with neither an abbrev nor a name was left out of the waveforms CSV.`)
      continue
    }
    if (!oneLine(w.abbrev)) notes.push(`${label(items[i])}: a waveform came back with no abbrev, so its row uses the name, ${spelled}.`)
    researchedWaveforms.push({ w, spelled, item: items[i] })
  }
})

const waveformRows = []
const rowByKey = new Map()
const longDescriptions = []
for (const { w, spelled, item } of researchedWaveforms) {
  const match = libraryMatch({ abbrev: spelled, name: w.name })
  let abbrev = match ? match.abbrev : spelled
  if (abbrev.length > WAVEFORM_ABBREV_MAX) {
    const cut = clip(abbrev, WAVEFORM_ABBREV_MAX)
    notes.push(`"${abbrev}" is longer than the ${WAVEFORM_ABBREV_MAX}-character abbrev limit and was cut to "${cut}".`)
    abbrev = cut
  }
  const k = wfKey(abbrev)
  let row = rowByKey.get(k)
  if (!row) {
    row = { abbrev, name: '', description: '', in_dev_library: !!match, researched_as: [], items: [] }
    rowByKey.set(k, row)
    waveformRows.push(row)
  }
  if (!row.name) row.name = oneLine(w.name)
  if (!row.description) {
    const d = oneLine(w.description)
    row.description = clip(d, WAVEFORM_DESCRIPTION_MAX)
    if (d.length > WAVEFORM_DESCRIPTION_MAX) longDescriptions.push(row.abbrev)
  }
  if (!row.researched_as.includes(spelled)) row.researched_as.push(spelled)
  if (!row.items.includes(label(item))) row.items.push(label(item))
  w.csv_abbrev = row.abbrev
}

for (const row of waveformRows) {
  // The importer requires a name, and a blank one fails the row.
  if (!row.name) row.name = row.abbrev
}
waveformRows.sort((a, b) => {
  const x = a.abbrev.toLowerCase()
  const y = b.abbrev.toLowerCase()
  return x < y ? -1 : x > y ? 1 : 0
})

const respelled = []
const merged = []
for (const row of waveformRows) {
  for (const s of row.researched_as) {
    if (s === row.abbrev || clip(s, WAVEFORM_ABBREV_MAX) === row.abbrev) continue
    ;(row.in_dev_library ? respelled : merged).push(`"${s}" as ${row.abbrev}`)
  }
}
if (respelled.length) notes.push(`Waveforms spelled the way the dev library spells them: ${respelled.join(', ')}.`)
if (merged.length) notes.push(`Waveforms merged under the first spelling found: ${merged.join(', ')}.`)
if (longDescriptions.length) notes.push(`Descriptions cut to ${WAVEFORM_DESCRIPTION_MAX} characters at a word boundary: ${longDescriptions.join(', ')}.`)
const newToLibrary = waveformRows.filter((w) => !w.in_dev_library).map((w) => w.abbrev)
if (library.length && newToLibrary.length) notes.push(`Not in the dev library, so they import as new rows; check none is a library waveform under another name: ${newToLibrary.join(', ')}.`)
if (waveformRows.length && !library.length) {
  notes.unshift('No dev waveform library was passed, so every waveform abbrev is the researchers\' own spelling.')
}

const inDevLibrary = waveformRows.filter((w) => w.in_dev_library).map((w) => w.abbrev)

// A file with a header and no rows is one the importer rejects outright, so an
// empty set is returned as '' and the skill writes no file for it.
const equipmentCsv = equipmentRows.length ? toCsv(EQUIPMENT_KEYS, equipmentRows) : ''
const waveformsCsv = waveformRows.length ? toCsv(WAVEFORM_KEYS, waveformRows) : ''

// What `wc -lc` prints for each file once written. The skill copies the CSVs
// out of this result into files, and a dropped quote or a lost row there would
// otherwise pass unnoticed: the encoding above only holds if the copy is exact.
function utf8Bytes(s) {
  let n = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
  }
  return n
}
const wc = (csv) => ({ lines: (csv.match(/\n/g) || []).length, bytes: utf8Bytes(csv) })

// One entry per incomplete item, in the terms the hand-back prints: the
// sections nobody researched, and what that leaves out of the two CSVs.
const failed = results
  .filter((r) => r.failed_groups.length)
  .map((r) => {
    const effect = []
    if (r.failed_groups.includes('core')) effect.push('It has no row in the equipment CSV, because its identity was not researched.')
    if (r.failed_groups.includes('spectrum') && r.terminal_type_requested === 'radio') effect.push('Its waveforms are missing from the waveforms CSV.')
    return { item: `${r.make} ${r.model}`, failed_groups: r.failed_groups, not_researched: r.not_researched, csv_effect: effect.join(' ') }
  })
if (failed.length) {
  log(`${failed.length} of ${items.length} item(s) came back incomplete. ${failed.map((f) => `${f.item}: not researched ${f.not_researched.join(', ')}`).join('; ')}`)
}
log(`${equipmentRows.length} equipment row(s) and ${waveformRows.length} waveform row(s) for the import CSVs, ${inDevLibrary.length} of the waveforms also in the dev library`)

return {
  items: results,
  equipment_csv: equipmentCsv,
  waveforms_csv: waveformsCsv,
  csv_check: { equipment: wc(equipmentCsv), waveforms: wc(waveformsCsv) },
  waveform_rows: waveformRows,
  in_dev_library: inDevLibrary,
  failed,
  // One line each, even when several items raised the same one.
  csv_notes: Array.from(new Set(notes)),
}

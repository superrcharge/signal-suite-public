export const meta = {
  name: 'catalog-lookup',
  description: 'Research one or more terminal/radio make+models in parallel for the Equipment Catalog editor, returning structured cross-checked field data',
  whenToUse: 'Called by the catalog-lookup skill. args is an array of {make, model, terminalType} ("satcom" or "radio"). Also accepts a single object for one-terminal lookups.',
  phases: [{ title: 'Research' }],
}

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
  items: {
    type: 'object',
    properties: { label: STR, value: STR, sources: { type: 'array', items: STR }, confidence: { type: 'string', enum: ['cross-checked', 'single-source', 'not_found'] } },
    required: ['label', 'value', 'sources', 'confidence'],
  },
}

// ---------------------------------------------------------------------------
// Schema group A "core": identification, standard_specs, swap, use_cases
// (make/model are NOT in any group schema - each agent call only researches
// its slice of fields; make/model get merged back in from item.make/item.model
// after all three calls return, since the caller already knows them).
// ---------------------------------------------------------------------------
function buildSchemaCore(terminalType) {
  const identification = {
    type: 'object',
    properties: {
      terminal_type: VFSTR,
      nomenclature: VFSTR,
      nickname: VFSTR,
      one_liner: STR,
      doc_number: VFSTR,
      operational_mode: VFSTR,
    },
    required: ['terminal_type', 'nomenclature', 'nickname', 'one_liner', 'doc_number', 'operational_mode'],
  }

  const standardSpecsSatcom = {
    type: 'object',
    properties: {
      antennaType: VFSTR, reflector: VFSTR, modem: VFSTR, orbit: VFSTR,
      bucTransmitPower: VFSTR, windTolerance: VFSTR, altPntAvailable: VFSTR,
    },
    required: ['antennaType', 'reflector', 'modem', 'orbit', 'bucTransmitPower', 'windTolerance', 'altPntAvailable'],
  }

  const standardSpecsRadio = {
    type: 'object',
    properties: { antennaType: VFSTR, transmitPower: VFSTR, crypto: VFSTR, range: VFSTR, range_unit: VFSTR },
    required: ['antennaType', 'transmitPower', 'crypto', 'range', 'range_unit'],
  }

  const swapDim = VF({ type: 'string', description: 'Inches first, e.g. "18.03 in (458 mm)". Convert if the source only publishes metric - never drop the imperial figure.' })
  const swapWeight = VF({ type: 'string', description: 'Pounds first, e.g. "19.8 lb (9 kg)". Convert if the source only publishes metric - never drop the imperial figure.' })
  const swap = {
    type: 'object',
    properties: {
      size_length: swapDim, size_width: swapDim, size_height: swapDim,
      weight: swapWeight,
      power: { type: 'string', description: 'Describe the power INPUT method(s) available - input voltage range, frequency, AC/DC, connector/generator compatibility (e.g. "90-240 VAC, 50-60Hz"). Do NOT compute or estimate a power draw/consumption figure (Watts or Amps of actual draw) - that number is rarely published and varies by which BUC/amplifier option is fitted, so guessing it would be misleading on a free-text spec field.' },
    },
    required: ['size_length', 'size_width', 'size_height', 'weight', 'power'],
  }

  const properties = {
    identification,
    standard_specs: terminalType === 'satcom' ? standardSpecsSatcom : standardSpecsRadio,
    swap,
    use_cases: STR,
  }
  const required = ['identification', 'standard_specs', 'swap', 'use_cases']

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

  const radioWaveforms = {
    type: 'array',
    description: 'Every supported waveform found on the datasheet, e.g. SINCGARS, ANW2, SRW.',
    items: {
      type: 'object',
      properties: { abbrev: STR, name: STR, description: STR, sources: { type: 'array', items: STR }, confidence: { type: 'string', enum: ['cross-checked', 'single-source'] } },
      required: ['abbrev', 'name', 'description', 'sources', 'confidence'],
    },
  }

  const bandEnum = terminalType === 'satcom'
    ? ['S', 'C', 'X', 'Ku', 'K', 'Ka']
    : ['HF', 'VHF', 'UHF', 'L']

  const frequencyBandProps = {
    band: { type: 'string', enum: bandEnum },
    downlink: VFSTR,
    uplink: VFSTR,
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
// features, and (radio only) recommended_accessories
// ---------------------------------------------------------------------------
function buildSchemaExtra(terminalType) {
  const features = {
    type: 'array',
    description: 'Key differentiating features. Enumerate all found, not just the first.',
    items: { type: 'object', properties: { title: STR, description: STR }, required: ['title', 'description'] },
  }

  const properties = {
    additional_physical_specs: LABEL_VALUE,
    additional_rf_specs: LABEL_VALUE,
    features,
  }
  const required = ['additional_physical_specs', 'additional_rf_specs', 'features']

  if (terminalType !== 'satcom') {
    properties.recommended_accessories = STR
    required.push('recommended_accessories')
  }

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
- Free-text narrative fields (one_liner, power, use_cases) do not need source citation or cross-checking - just report the best available description.
- Never fabricate a number that no source states. If a field can't be verified from any credible source, set value to "Not found - verify manually" and confidence "not_found".
- SWAP dimensions and weight: always lead with the imperial unit (inches / pounds), metric in parentheses - even when the only source published is metric, convert it rather than reporting metric alone.
- swap.power specifically: report the power INPUT method(s) available (input voltage range, frequency, AC/DC, connector/generator compatibility - e.g. "90-240 VAC, 50-60Hz"). Do not compute or estimate an actual power draw/consumption figure (Watts or Amps drawn) - that number depends on which BUC/amplifier option is fitted and is rarely published, so an estimate here would misrepresent a spec field as verified data.
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
  return `Research the public technical specifications of the "${make} ${model}" ${kind}, focusing on additional physical/RF specs and key differentiating features${terminalType === 'satcom' ? '' : ', plus recommended accessories'} for the Equipment Catalog.

Prioritize the manufacturer's official datasheet/spec-sheet PDF first, then the manufacturer's product page, then reputable distributor/government spec pages. Avoid forums, marketplace listings, or other unverified sources.

Critical requirements:
- Cross-check every hard-spec field (additional physical specs, additional RF specs) against at least two independent sources before marking it "cross-checked". If only one source exists anywhere, use confidence "single-source" rather than overstating certainty. If sources disagree, keep confidence at the lower tier and fill in conflict_note describing both values and their sources - never silently pick one.
- Do NOT cap how many sources you check - the goal is completeness, not speed. Enumerate every named feature before concluding the list is complete, not just the first found.
- Free-text narrative fields (feature descriptions${terminalType === 'satcom' ? '' : ', recommended_accessories'}) do not need source citation or cross-checking - just report the best available description.
- Never fabricate a number that no source states. If a field can't be verified from any credible source, set value to "Not found - verify manually" and confidence "not_found".

Call the structured output tool with the researched data.`
}

let parsedArgs = args
if (typeof parsedArgs === 'string') {
  parsedArgs = JSON.parse(parsedArgs)
}
const rawItems = Array.isArray(parsedArgs) ? parsedArgs : [parsedArgs]

for (const item of rawItems) {
  if (!item || typeof item !== 'object' || !item.make || !item.model || !item.terminalType) {
    throw new Error(`Bad workflow args item: ${JSON.stringify(item)} - expected {make, model, terminalType}`)
  }
}

const results = await parallel(
  rawItems.map((item) => async () => {
    const [core, spectrum, extra] = await parallel([
      () => agent(buildPromptCore(item), { label: `${item.make} ${item.model} [core]`, schema: buildSchemaCore(item.terminalType) }),
      () => agent(buildPromptSpectrum(item), { label: `${item.make} ${item.model} [spectrum]`, schema: buildSchemaSpectrum(item.terminalType) }),
      () => agent(buildPromptExtra(item), { label: `${item.make} ${item.model} [extra]`, schema: buildSchemaExtra(item.terminalType) }),
    ])

    return {
      make: item.make,
      model: item.model,
      ...core,
      ...spectrum,
      ...extra,
      terminal_type_requested: item.terminalType,
    }
  })
)

return results

// The Exercise Silent Harbor demo scenario, as data.
//
// Pure data and checks, no I/O, so the seed script and the walkthrough read one
// source and `node --test` covers it. The scenario reproduces the hand-built
// a hand-built operation on the dev stack under its own name, so seeding it never
// touches any other operation.

export const DEMO_OPERATION_NAME = 'Exercise Silent Harbor'
export const DEMO_OPERATION_ACRONYM = 'SILENT HARBOR'

// Units left out by default so a presenter can join them live.
export const DEFAULT_LEAVE_OUT = ['TF WHITE', 'CAS']

// Migration 046 creates nine placeholder organizations. Gold, purple and silver
// stay untouched on purpose: they are the spare library rows for a live join.
export const PLACEHOLDER_KEYS = ['green', 'blue', 'white', 'orange', 'red', 'brown', 'gold', 'purple', 'silver']

export const ORGANIZATION_NAMES = {
  green: { name: '1st SFOD-D', short_label: 'TF GREEN', branch: 'USA' },
  white: { name: '24th STS', short_label: 'TF WHITE', branch: 'USAF' },
  red: { name: '75th Ranger Regiment', short_label: 'TF RED', branch: 'USA' },
  brown: { name: '160th SOAR', short_label: 'TF BROWN', branch: 'USA' },
  blue: { name: 'DEVGRU', short_label: 'TF BLUE', branch: 'USN' },
  orange: { name: 'ISA', short_label: 'TF ORANGE', branch: 'USA' },
}

// Platform writes validate abbrevs against this library, so it is seeded first.
export const WAVEFORMS = [
  { abbrev: 'ANW2', name: 'Adaptive Networking Wideband Waveform' },
  { abbrev: 'APCO', name: 'APCO P25' },
  { abbrev: 'DAMA', name: 'UHF SATCOM Demand Assigned Multiple Access' },
  { abbrev: 'HAVEQUICK', name: 'HAVE QUICK II' },
  { abbrev: 'HPW', name: 'High Performance Waveform' },
  { abbrev: 'IW', name: 'Integrated Waveform' },
  { abbrev: 'Link 16', name: 'Link 16 tactical data link' },
  { abbrev: 'MUOS', name: 'Mobile User Objective System' },
  { abbrev: 'SINCGARS', name: 'Single Channel Ground and Airborne Radio System' },
  { abbrev: 'TACSAT', name: 'UHF SATCOM Dedicated Channel (MIL-STD-188-181B)' },
  { abbrev: 'TSM', name: 'TrellisWare Streamscape' },
  { abbrev: 'VULOS', name: 'VHF/UHF Line of Sight' },
  { abbrev: 'WR', name: 'Wave Relay MANET' },
]

const SERVICES = {
  BE: { abbrev: 'BE', name: 'Best Effort Service' },
  GXS: { abbrev: 'GXS', name: 'Global Xpress Standard' },
  GXA: { abbrev: 'GXA', name: 'Global Xpress Assured' },
  WGS: { abbrev: 'WGS', name: 'Wideband Global SATCOM' },
  GX: { abbrev: 'GX', name: 'Global Express' },
  COM: { abbrev: 'COM', name: 'Commercial Ku Lease' },
}

const wf = (...abbrevs) =>
  abbrevs.map((a) => {
    const w = WAVEFORMS.find((x) => x.abbrev === a)
    return { abbrev: w.abbrev, name: w.name }
  })

const record = (id, nomenclature, nickname, make, terminal_type, waveforms, services) => ({
  id,
  nomenclature,
  nickname,
  make,
  terminal_type,
  data: {
    waveforms,
    services: services.map((s) => ({ ...SERVICES[s] })),
    bands: [],
    physical_specs: [],
    rf_specs: [],
    features: [],
    swap: {},
    standard_specs: {},
  },
})

export const EQUIPMENT = [
  record('prc-152', 'AN/PRC-152', 'Falcon III', 'L3Harris', 'radio', wf('SINCGARS', 'HAVEQUICK', 'VULOS', 'TACSAT', 'DAMA', 'IW', 'HPW', 'APCO'), []),
  record('prc-158', 'AN/PRC-158', 'Manpack', 'L3Harris', 'radio', wf('ANW2', 'SINCGARS', 'MUOS', 'TSM'), []),
  record('prc-163', 'AN/PRC-163', 'Leader', 'L3Harris', 'radio', wf('ANW2', 'TSM', 'SINCGARS'), []),
  record('mpu5', 'MPU5', 'Wave Relay', 'Persistent Systems', 'radio', wf('WR'), []),
  record('be-only', 'BE-900', 'Skyhook', 'Ragno Systems', 'satcom', [], ['BE']),
  record('gx-2', 'GX-2', null, 'Paradigm', 'satcom', [], ['GXS']),
  record('gx-10', 'GX-10', null, 'Paradigm', 'satcom', [], ['GXA', 'WGS']),
  record('gx-terminal', 'GX-220', 'Hornet', 'Paradigm', 'satcom', [], ['GX']),
  record('ka-flyaway', 'KA-450', 'Ragno', 'Ragno Systems', 'satcom', [], ['WGS']),
  record('ku-manpack', 'KU-110', 'Mini', 'Ragno Systems', 'satcom', [], ['COM']),
]

export const PLATFORMS = [
  { designation: 'UH-60M', popular_name: 'Black Hawk', category: ['USA'], type: 'aircraft', waveform_abbrevs: ['SINCGARS', 'HAVEQUICK'] },
  { designation: 'CH-47F', popular_name: 'Chinook', category: ['USA'], type: 'aircraft', waveform_abbrevs: ['SINCGARS', 'HAVEQUICK'] },
  { designation: 'C-130J', popular_name: 'Super Hercules', category: ['USAF'], type: 'aircraft', waveform_abbrevs: ['HAVEQUICK', 'SINCGARS'] },
  { designation: 'F-15E', popular_name: 'Strike Eagle', category: ['USAF'], type: 'aircraft', waveform_abbrevs: ['Link 16', 'HAVEQUICK'] },
  { designation: 'MQ-9A', popular_name: 'Reaper', category: ['USAF'], type: 'uav', waveform_abbrevs: ['Link 16'] },
  { designation: 'KC-135R', popular_name: 'Stratotanker', category: ['USAF'], type: 'aircraft', waveform_abbrevs: ['HAVEQUICK', 'Link 16'] },
  { designation: 'HH-60W', popular_name: 'Jolly Green II', category: ['USAF'], type: 'aircraft', waveform_abbrevs: ['SINCGARS', 'HAVEQUICK', 'Link 16'] },
  { designation: 'RC-135V', popular_name: 'Rivet Joint', category: ['USAF'], type: 'aircraft', waveform_abbrevs: ['Link 16', 'HAVEQUICK'] },
]

export const TRANSPORTS = [
  { name: 'ISB Fiber Backbone', kind: 'fiber', owned_by: 'JOC' },
  { name: 'Host-nation 5G', kind: 'cellular', owned_by: '' },
]

const P = ['Staging', 'Infil', 'Actions on Objective', 'Exfil']
const IAE = ['Infil', 'Actions on Objective', 'Exfil']
const AOO = ['Actions on Objective']
const none = { name: '', phone: '', email: '' }
const poc = (name, phone) => ({ name, phone, email: '' })

const unit = (label, who, gear, asset_phases, pocv = none) => ({
  label,
  ...who,
  platforms: gear.platforms ?? [],
  equipment: gear.equipment ?? [],
  transports: gear.transports ?? [],
  asset_phases,
  poc: pocv,
})
const lib = (organization_key) => ({ organization_key })
const adhoc = (name, short_label, branch, color) => ({ adhoc: { name, short_label, branch, color } })

export const DEMO = {
  name: DEMO_OPERATION_NAME,
  acronym: DEMO_OPERATION_ACRONYM,
  notes: 'Demonstration scenario for the Operations feature; safe to delete.',
  phases: P,
  sites: ['ISB', 'MSS', 'HLZ', 'the X', 'FSB', 'ORP', 'BP North', 'Overhead'],
  units: [
    unit('TF GREEN', lib('green'), { equipment: ['prc-163', 'mpu5', 'ku-manpack'] }, { mpu5: IAE, 'ku-manpack': IAE }, poc('MAJ Torres', 'DSN 555-0141')),
    unit('TF WHITE', lib('white'), { equipment: ['prc-152', 'prc-163'] }, { 'prc-152': AOO, 'prc-163': AOO }, poc('MSgt Ortiz', 'DSN 555-0124')),
    unit('TF RED', lib('red'), { equipment: ['prc-152', 'mpu5'] }, { 'prc-152': IAE, mpu5: IAE }),
    unit('TF BROWN', lib('brown'), { platforms: ['UH-60M', 'CH-47F'], equipment: ['prc-152'] }, { 'UH-60M': IAE, 'prc-152': IAE, 'CH-47F': ['Infil', 'Exfil'] }, poc('CW3 Nakamura', 'DSN 555-0160')),
    unit('TF BLUE', lib('blue'), { equipment: ['prc-163', 'mpu5'] }, { 'prc-163': IAE, mpu5: IAE }),
    unit('TF ORANGE', lib('orange'), { platforms: ['MQ-9A'], equipment: ['be-only'] }, {}),
    unit('GUNSHIP', adhoc('AC-130J Gunship', 'GUNSHIP', 'USAF', '#5D4037'), { platforms: ['C-130J'] }, { 'C-130J': AOO }),
    unit('CAS', adhoc('Close Air Support', 'CAS', 'USAF', '#78909C'), { platforms: ['F-15E'] }, { 'F-15E': AOO }),
    unit('TANKER', adhoc('KC-135R Tanker', 'TANKER', 'USAF', '#90A4AE'), { platforms: ['KC-135R'] }, { 'KC-135R': AOO }),
    unit('MEDEVAC', adhoc('MEDEVAC', 'MEDEVAC', 'USAF', '#D32F2F'), { platforms: ['HH-60W'], equipment: ['prc-152'], transports: ['Host-nation 5G'] }, { 'HH-60W': IAE, 'prc-152': IAE, 'Host-nation 5G': IAE }),
    unit('JOC', adhoc('O6 JOC', 'JOC', '', '#9E9E9E'), { equipment: ['ka-flyaway', 'gx-10', 'prc-158'], transports: ['ISB Fiber Backbone'] }, {}, poc('LTC Park', 'DSN 555-0100')),
    unit('QRF', adhoc('Quick Reaction Force', 'QRF', 'USA', '#607D8B'), { equipment: ['prc-152', 'mpu5'], transports: ['ISB Fiber Backbone'] }, {}),
    unit('RIVET JOINT', adhoc('RC-135V Rivet Joint', 'RIVET JOINT', 'USAF', '#455A64'), { platforms: ['RC-135V'] }, { 'RC-135V': ['Infil', 'Actions on Objective'] }),
  ],
  plans: {
    Staging: {
      tier: 'TF GREEN',
      placements: { JOC: 'ISB', 'TF GREEN': 'ISB', 'TF ORANGE': 'MSS' },
      requirements: [['JOC', 'TF ORANGE'], ['JOC', 'TF GREEN']],
    },
    Infil: {
      tier: 'TF GREEN',
      placements: {
        JOC: 'ISB', 'TF ORANGE': 'MSS', 'TF GREEN': 'HLZ', 'TF RED': 'HLZ', 'TF BROWN': 'HLZ',
        'TF BLUE': 'ORP', MEDEVAC: 'FSB', QRF: 'FSB', 'RIVET JOINT': 'Overhead',
      },
      requirements: [
        ['MEDEVAC', 'TF BROWN'], ['JOC', 'RIVET JOINT'], ['JOC', 'QRF'], ['JOC', 'TF BROWN'],
        ['TF ORANGE', 'TF GREEN'], ['TF BLUE', 'TF GREEN'], ['TF RED', 'TF BROWN'], ['TF GREEN', 'TF BROWN'],
      ],
    },
    'Actions on Objective': {
      tier: 'TF GREEN',
      placements: {
        JOC: 'ISB', 'TF ORANGE': 'MSS', 'TF GREEN': 'the X', 'TF WHITE': 'the X', 'TF RED': 'BP North',
        'TF BROWN': 'HLZ', 'TF BLUE': 'ORP', MEDEVAC: 'FSB', QRF: 'FSB', GUNSHIP: 'Overhead',
        CAS: 'Overhead', TANKER: 'Overhead', 'RIVET JOINT': 'Overhead',
      },
      requirements: [
        ['MEDEVAC', 'TF GREEN'], ['MEDEVAC', 'TF BROWN'], ['TF WHITE', 'GUNSHIP'], ['TF WHITE', 'TF GREEN'],
        ['TF WHITE', 'CAS'], ['JOC', 'TF ORANGE'], ['JOC', 'RIVET JOINT'], ['JOC', 'QRF'], ['JOC', 'TF GREEN'],
        ['JOC', 'TF BROWN'], ['TF ORANGE', 'TF GREEN'], ['GUNSHIP', 'TF GREEN'], ['TANKER', 'CAS'],
        ['TF BLUE', 'TF GREEN'], ['QRF', 'TF RED'], ['TF RED', 'TF GREEN'], ['TF GREEN', 'TF BROWN'],
      ],
    },
    Exfil: {
      tier: 'TF GREEN',
      placements: {
        JOC: 'ISB', 'TF ORANGE': 'MSS', 'TF GREEN': 'HLZ', 'TF RED': 'HLZ', 'TF BROWN': 'HLZ',
        'TF BLUE': 'HLZ', MEDEVAC: 'FSB', QRF: 'FSB',
      },
      requirements: [
        ['MEDEVAC', 'TF BROWN'], ['JOC', 'QRF'], ['JOC', 'TF BROWN'], ['TF BLUE', 'TF BROWN'],
        ['TF RED', 'TF BROWN'], ['TF GREEN', 'TF BROWN'],
      ],
    },
  },
}

/** A copy of the demo without the named units and everything that refers to them. */
export function leaveOut(demo, labels) {
  const out = new Set(labels)
  const plans = {}
  for (const [phase, plan] of Object.entries(demo.plans)) {
    plans[phase] = {
      tier: plan.tier !== null && out.has(plan.tier) ? null : plan.tier,
      placements: Object.fromEntries(Object.entries(plan.placements).filter(([label]) => !out.has(label))),
      requirements: plan.requirements.filter(([a, b]) => !out.has(a) && !out.has(b)),
    }
  }
  return {
    ...structuredClone({ ...demo, plans: {}, units: [] }),
    units: structuredClone(demo.units.filter((u) => !out.has(u.label))),
    plans,
  }
}

/** Every consistency problem in the demo data; empty when it is sound. */
export function validateDemo(demo) {
  const problems = []
  const labels = new Set()
  for (const u of demo.units) {
    if (labels.has(u.label)) problems.push(`duplicate unit label: ${u.label}`)
    labels.add(u.label)
  }
  const phases = new Set(demo.phases)
  const sites = new Set(demo.sites)
  const designations = new Set(PLATFORMS.map((p) => p.designation))
  const equipmentIds = new Set(EQUIPMENT.map((e) => e.id))
  const transportNames = new Set(TRANSPORTS.map((t) => t.name))

  for (const u of demo.units) {
    const own = new Set([...u.platforms, ...u.equipment, ...u.transports])
    for (const [key, list] of Object.entries(u.asset_phases)) {
      if (!own.has(key)) problems.push(`${u.label}: asset_phases names ${key}, which the unit does not bring`)
      for (const ph of list) if (!phases.has(ph)) problems.push(`${u.label}: asset_phases for ${key} names unknown phase ${ph}`)
    }
    const hasKey = typeof u.organization_key === 'string' && u.organization_key !== ''
    const hasAdhoc = u.adhoc !== undefined && u.adhoc !== null
    if (hasKey === hasAdhoc) problems.push(`${u.label}: needs exactly one of organization_key and adhoc`)
    if (hasKey && !PLACEHOLDER_KEYS.includes(u.organization_key)) {
      problems.push(`${u.label}: organization_key ${u.organization_key} is not a placeholder key`)
    }
    for (const d of u.platforms) if (!designations.has(d)) problems.push(`${u.label}: unknown platform ${d}`)
    for (const e of u.equipment) if (!equipmentIds.has(e)) problems.push(`${u.label}: unknown equipment ${e}`)
    for (const t of u.transports) if (!transportNames.has(t)) problems.push(`${u.label}: unknown transport ${t}`)
  }

  for (const [phase, plan] of Object.entries(demo.plans)) {
    if (!phases.has(phase)) problems.push(`plans names unknown phase ${phase}`)
    if (plan.tier !== null && plan.tier !== undefined && !labels.has(plan.tier)) {
      problems.push(`${phase}: tier ${plan.tier} is not a unit`)
    }
    for (const [label, site] of Object.entries(plan.placements)) {
      if (!labels.has(label)) problems.push(`${phase}: placement names unknown unit ${label}`)
      if (!sites.has(site)) problems.push(`${phase}: placement of ${label} names unknown site ${site}`)
    }
    for (const [a, b] of plan.requirements) {
      if (a === b) problems.push(`${phase}: requirement pairs ${a} with itself`)
      for (const l of [a, b]) if (!labels.has(l)) problems.push(`${phase}: requirement names unknown unit ${l}`)
    }
  }
  return problems
}

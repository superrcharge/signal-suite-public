#!/usr/bin/env node
// Seed the demo operation "Exercise Silent Harbor" for local development.
//
// This is NOT a migration, deliberately. `023_remove_seed_data.sql` exists
// because seeded demo rows from earlier migrations shipped to a deployed environment and sat
// alongside real records. Seeding through the API, from a script that refuses to
// talk to anything but localhost, cannot repeat that.
//
// Rules this file follows, in order of importance:
//   1. Local, unauthenticated stacks only. The hostname must be loopback and the
//      target must not have authentication enabled; one check alone is not
//      enough, see the guard section.
//   2. Say what it did. Every row created, patched or skipped is printed.
//   3. Never clobber. Library rows are looked up by natural key and created only
//      when missing; the three placeholder organizations are renamed only while
//      they still carry their factory name. The operation is skipped when it
//      exists, and removed only with --reset, and only by this exact name, so
//      every other operation is never touched.
//   4. The scenario lives in lib/demo-operation.mjs, so the walkthrough script
//      reads the same data.
//
// Flags: --full seeds all 13 units (default leaves out TF WHITE and CAS so they
// can be joined live); --reset deletes the existing demo operation first.

import {
  DEFAULT_LEAVE_OUT,
  DEMO,
  DEMO_OPERATION_NAME,
  EQUIPMENT,
  ORGANIZATION_NAMES,
  PLATFORMS,
  TRANSPORTS,
  WAVEFORMS,
  leaveOut,
  validateDemo,
} from './lib/demo-operation.mjs'

const DEFAULT_BASE = 'http://localhost:3001'
const BASE = process.env.SEED_API_URL ?? DEFAULT_BASE
const FULL = process.argv.includes('--full')
const RESET = process.argv.includes('--reset')

// --- Guard: loopback host ----------------------------------------------------
// A loopback hostname says nothing about what is *behind* the port: a port
// forward or SSH tunnel makes a deployed environment answer on localhost:3001.
// That is what the auth probe in main() is for; this check only rules out the
// obvious `SEED_API_URL=https://prod.example.com` mistake.
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
let target
try {
  target = new URL(BASE)
} catch {
  console.error(`refusing to run: SEED_API_URL is not a valid URL (${BASE})`)
  process.exit(1)
}
if (!ALLOWED_HOSTS.has(target.hostname)) {
  console.error(`refusing to run against a non-local host: ${target.hostname}`)
  console.error('This script seeds fake data and must never reach a deployed environment.')
  process.exit(1)
}

// Overriding the default is the only way to aim this at a tunnelled port, so it
// requires saying out loud that you know where it points.
if (BASE !== DEFAULT_BASE && process.env.SEED_I_UNDERSTAND !== 'local') {
  console.error(`refusing to run: SEED_API_URL is overridden (${BASE}).`)
  console.error('A loopback port can be forwarded to a deployed environment. If you are')
  console.error('certain this is your own local stack, re-run with SEED_I_UNDERSTAND=local.')
  process.exit(1)
}

async function api(path, init) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

const send = (method, path, payload) =>
  api(path, { method, body: payload === undefined ? undefined : JSON.stringify(payload) })

// Any non-2xx is fatal: a half-built operation is worse than none, and the next
// run with --reset starts clean.
function must(res, what) {
  if (res.status < 200 || res.status >= 300) {
    console.error(`  FAIL    ${what}  -> ${res.status} ${res.body?.error?.code ?? ''} ${res.body?.error?.message ?? ''}`)
    process.exit(1)
  }
  return res.body?.data
}

// POST responses carry the new row bare; GET /operations/:id wraps it. Accept
// both so a change of envelope fails loudly in must() rather than here.
const idOf = (data) => data?.id ?? data?.operation?.id

const lc = (s) => String(s ?? '').toLowerCase()
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

async function main() {
  console.log(`Seeding the demo operation against ${BASE}${FULL ? ' (all 13 units)' : ''}${RESET ? ' (reset)' : ''}\n`)

  // Health first, so a stopped stack gives a clear message rather than a
  // confusing fetch failure per row.
  try {
    const res = await fetch(`${BASE}/health`)
    if (!res.ok) throw new Error(`health returned ${res.status}`)
  } catch (err) {
    console.error(`cannot reach ${BASE} - is the dev stack up? (make dev)`)
    console.error(String(err))
    process.exit(1)
  }

  // The guard that actually catches a forwarded port. This script sends no
  // Authorization header, so it can only work against AUTH_ENABLED=false, i.e. a
  // local dev stack. Reading the organizations is that probe, and it happens
  // before a single row is written.
  const orgRes = await api('/organizations')
  if (orgRes.status === 401 || orgRes.status === 403) {
    console.error(`refusing to run: ${BASE} requires authentication (${orgRes.status}).`)
    console.error('This script only works against a stack with AUTH_ENABLED=false, so an')
    console.error('authenticated target is not a local dev stack - most likely a forwarded')
    console.error('port pointing at a deployed environment. Nothing was written.')
    process.exit(1)
  }
  if (orgRes.status !== 200) {
    console.error(`cannot read organizations (${orgRes.status}). Nothing was written.`)
    process.exit(1)
  }

  const demo = FULL ? DEMO : leaveOut(DEMO, DEFAULT_LEAVE_OUT)
  const problems = validateDemo(demo)
  if (problems.length > 0) {
    console.error('the demo data is inconsistent, nothing was written:')
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }

  const counts = { created: 0, patched: 0, skipped: 0 }

  // 1. Organizations. Rename a placeholder only while it still carries its
  //    factory name, so a patch someone made by hand is never overwritten.
  console.log('Organizations')
  const orgs = new Map((orgRes.body?.data?.organizations ?? []).map((o) => [o.key, o]))
  for (const [key, want] of Object.entries(ORGANIZATION_NAMES)) {
    const have = orgs.get(key)
    if (!have) {
      console.log(`  skipped ${key} (not in the library)`)
      counts.skipped += 1
    } else if (have.name === cap(key)) {
      must(await send('PATCH', `/organizations/${key}`, want), `patch ${key}`)
      console.log(`  patched ${key} -> ${want.name} / ${want.short_label}`)
      counts.patched += 1
    } else {
      console.log(`  kept    ${key} (${have.name})`)
      counts.skipped += 1
    }
  }

  // 2. Waveforms. Platform writes validate abbrevs against this library.
  console.log('\nWaveforms')
  const wfs = must(await api('/waveforms'), 'list waveforms')
  const knownWf = new Set((wfs?.waveforms ?? []).map((w) => lc(w.abbrev)))
  for (const w of WAVEFORMS) {
    if (knownWf.has(lc(w.abbrev))) {
      console.log(`  skipped ${w.abbrev}`)
      counts.skipped += 1
    } else {
      must(await send('POST', '/waveforms', w), `create waveform ${w.abbrev}`)
      console.log(`  created ${w.abbrev}`)
      counts.created += 1
    }
  }

  // 3. Equipment.
  console.log('\nEquipment')
  const eqs = must(await api('/equipment'), 'list equipment')
  const knownEq = new Set((eqs?.equipment ?? []).map((e) => lc(e.id)))
  for (const e of EQUIPMENT) {
    if (knownEq.has(lc(e.id))) {
      console.log(`  skipped ${e.id}`)
      counts.skipped += 1
    } else {
      const { nickname, ...rest } = e
      must(await send('POST', '/equipment', nickname ? { ...rest, nickname } : rest), `create equipment ${e.id}`)
      console.log(`  created ${e.id} (minimal datasheet)`)
      counts.created += 1
    }
  }

  // 4. Platforms. Ids are resolved by designation, never hard-coded.
  console.log('\nPlatforms')
  let plats = must(await api('/platforms'), 'list platforms')?.platforms ?? []
  const knownPlat = new Set(plats.map((p) => lc(p.designation)))
  for (const p of PLATFORMS) {
    if (knownPlat.has(lc(p.designation))) {
      console.log(`  skipped ${p.designation}`)
      counts.skipped += 1
    } else {
      must(await send('POST', '/platforms', p), `create platform ${p.designation}`)
      console.log(`  created ${p.designation}`)
      counts.created += 1
    }
  }
  plats = must(await api('/platforms'), 'list platforms')?.platforms ?? []
  const platformId = new Map(plats.map((p) => [lc(p.designation), p.id]))

  // 5. Transports.
  console.log('\nTransports')
  let trs = must(await api('/transports'), 'list transports')?.transports ?? []
  const knownTr = new Set(trs.map((t) => lc(t.name)))
  for (const t of TRANSPORTS) {
    if (knownTr.has(lc(t.name))) {
      console.log(`  skipped ${t.name}`)
      counts.skipped += 1
    } else {
      must(await send('POST', '/transports', t), `create transport ${t.name}`)
      console.log(`  created ${t.name}`)
      counts.created += 1
    }
  }
  trs = must(await api('/transports'), 'list transports')?.transports ?? []
  const transportId = new Map(trs.map((t) => [lc(t.name), t.id]))

  // 6. The operation. Exiting here, before any write below, is what makes a
  //    second run harmless.
  console.log('\nOperation')
  const ops = must(await api('/operations'), 'list operations')?.operations ?? []
  const existing = ops.find((o) => lc(o.name) === lc(DEMO_OPERATION_NAME))
  if (existing && !RESET) {
    console.log(`  already present, nothing written (${existing.id})`)
    console.log(`\nOpen http://localhost:3001/operations/${existing.id}`)
    console.log('Pass --reset to rebuild it.')
    return
  }
  if (existing) {
    must(await send('DELETE', `/operations/${existing.id}`), `delete ${DEMO_OPERATION_NAME}`)
    console.log(`  reset   deleted the existing ${DEMO_OPERATION_NAME} (${existing.id})`)
  }
  const op = must(
    await send('POST', '/operations', { name: demo.name, acronym: demo.acronym, notes: demo.notes }),
    'create operation',
  )
  const opId = idOf(op)
  if (!opId) {
    console.error('  FAIL    create operation returned no id')
    process.exit(1)
  }
  console.log(`  created ${demo.name} (${opId})`)
  counts.created += 1

  // 7. Phases replace the four defaults, then sites. Re-read for the ids.
  must(await send('PUT', `/operations/${opId}/phases`, { phases: demo.phases.map((name) => ({ name })) }), 'save phases')
  must(await send('PUT', `/operations/${opId}/sites`, { sites: demo.sites.map((name) => ({ name })) }), 'save sites')
  const detail = must(await api(`/operations/${opId}`), 'read operation')
  const phaseId = new Map((detail.phases ?? []).map((p) => [p.name, p.id]))
  const siteId = new Map((detail.sites ?? []).map((s) => [s.name, s.id]))
  console.log(`  phases  ${[...phaseId.keys()].join(', ')}`)
  console.log(`  sites   ${[...siteId.keys()].join(', ')}`)

  // 8. Participants. The wizard sends empty direct picks, so this does too.
  console.log('\nParticipants')
  const assetId = (u, key) => {
    if (u.platforms.includes(key)) return platformId.get(lc(key))
    if (u.transports.includes(key)) return transportId.get(lc(key))
    return key
  }
  const participantId = new Map()
  for (const u of demo.units) {
    const asset_phases = {}
    for (const [key, names] of Object.entries(u.asset_phases)) {
      asset_phases[assetId(u, key)] = names.map((n) => phaseId.get(n))
    }
    const payload = {
      ...(u.organization_key ? { organization_key: u.organization_key } : { adhoc: u.adhoc }),
      platform_ids: u.platforms.map((d) => platformId.get(lc(d))),
      equipment_ids: [...u.equipment],
      transport_ids: u.transports.map((n) => transportId.get(lc(n))),
      waveform_abbrevs: [],
      service_abbrevs: [],
      poc_name: u.poc.name,
      poc_phone: u.poc.phone,
      poc_email: u.poc.email,
      notes: '',
      asset_phases,
    }
    const created = must(await send('POST', `/operations/${opId}/participants`, payload), `join ${u.label}`)
    const pid = idOf(created) ?? created?.participant?.id
    if (!pid) {
      console.error(`  FAIL    join ${u.label} returned no id`)
      process.exit(1)
    }
    participantId.set(u.label, pid)
    console.log(`  joined  ${u.label}`)
    counts.created += 1
  }

  // 9. One plan per phase: tier select, placements, requirements.
  console.log('\nPhase plans')
  let requirements = 0
  for (const name of demo.phases) {
    const plan = demo.plans[name]
    const payload = {
      supported_participant_id: plan.tier ? participantId.get(plan.tier) : null,
      placements: Object.fromEntries(
        Object.entries(plan.placements).map(([label, site]) => [participantId.get(label), siteId.get(site)]),
      ),
      requirements: plan.requirements.map(([a, b]) => ({ a: participantId.get(a), b: participantId.get(b) })),
    }
    must(await send('PUT', `/operations/${opId}/phases/${phaseId.get(name)}/plan`, payload), `plan ${name}`)
    requirements += plan.requirements.length
    console.log(`  saved   ${name}: ${plan.tier ?? 'no tier'}, ${plan.placements ? Object.keys(plan.placements).length : 0} placements, ${plan.requirements.length} requirements`)
  }

  // 10. Summary.
  const left = DEMO.units.map((u) => u.label).filter((l) => !demo.units.some((u) => u.label === l))
  console.log(
    `\n${counts.created} created, ${counts.patched} patched, ${counts.skipped} skipped: ` +
      `${demo.units.length} participants, ${demo.phases.length} phases, ${demo.sites.length} sites, ${requirements} requirements.`,
  )
  console.log(`Open http://localhost:3001/operations/${opId}`)
  console.log(left.length > 0 ? `Left out for a live join: ${left.join(', ')}.` : 'All 13 units seeded (--full).')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

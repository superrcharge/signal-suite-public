#!/usr/bin/env node
// Seed Terminals and Kits with sample rows for local development.
//
// A sibling of `seed-dev-nets.mjs`, and it follows that file's rules for the
// same reasons - read its header for the full argument. In short:
//
//   1. Local, unauthenticated stacks only. Two independent checks run before a
//      single row is written, because a loopback hostname says nothing about
//      what is behind the port: a forwarded port makes a deployed environment
//      answer on localhost. The auth probe is what actually catches that.
//   2. Say what it did. Every row is named `SEED ...`, so the seeded data is
//      trivially identifiable and removable afterwards.
//   3. Never clobber. A record whose name already exists is skipped, not
//      overwritten, so running it twice is safe.
//
// This is NOT a migration. `023_remove_seed_data.sql` exists because demo rows
// from migrations 006, 014 and 016 shipped to production and now sit beside real
// records. Seeding through the API, from a script that refuses to talk to
// anything but localhost, cannot repeat that.
//
// Usage:  node scripts/seed-dev-assets.mjs [--per N]

const DEFAULT_BASE = 'http://localhost:3001'
const BASE = process.env.SEED_API_URL ?? DEFAULT_BASE

const perArg = process.argv.indexOf('--per')
const PER = perArg > -1 ? Number(process.argv[perArg + 1]) : 25
if (!Number.isInteger(PER) || PER < 1 || PER > 200) {
  console.error('--per must be a whole number between 1 and 200')
  process.exit(1)
}

// --- Guard: loopback host ----------------------------------------------------
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
if (BASE !== DEFAULT_BASE && process.env.SEED_I_UNDERSTAND !== 'local') {
  console.error(`refusing to run: SEED_API_URL is overridden (${BASE}).`)
  console.error('A loopback port can be forwarded to a deployed environment. If you are')
  console.error('certain this is your own local stack, re-run with SEED_I_UNDERSTAND=local.')
  process.exit(1)
}

// --- The data ----------------------------------------------------------------
// The model and type lists are the API's own enums, copied from
// `terminal/dto/request.go` and `kit/dto/request.go`. A value this file invents
// fails validation per row rather than up front, so they are worth keeping
// aligned - if a new model is added there and not here, the seed simply will
// not cover it, which is the quiet failure to watch for.
const MODELS = ['mini', 'hp', 'hornet', 'ragno', 'ow7', 'ow10', 'ow11']
const KIT_TYPES = ['remote', 'ifk', 'atk']

// Spread across every status so the stat strip has something in each cell and
// its filters have something to filter. Weighted toward `available`, which is
// what a real inventory looks like.
const STATUSES = [
  'available', 'available', 'available',
  'alert', 'alert-blue', 'alert-green',
  'on-mission', 'reserved', 'inop',
]

const MODEL_LABEL = {
  mini: 'MINI', hp: 'HP', hornet: 'HORNET', ragno: 'RAGNO',
  ow7: 'OW-7', ow10: 'OW-10', ow11: 'OW-11',
}

async function api(path, init) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

/** Reading the section list is also the auth probe - see the note in main(). */
async function fetchSections() {
  const res = await api('/sections')
  if (res.status === 401 || res.status === 403) {
    console.error(`refusing to run: ${BASE} requires authentication (${res.status}).`)
    console.error('Every deployed environment has auth on, so this loopback port is')
    console.error('forwarded somewhere it should not be. No rows were written.')
    process.exit(1)
  }
  if (res.status !== 200) {
    console.error(`cannot read sections (${res.status}) - no rows written`)
    process.exit(1)
  }
  const sections = res.body?.data?.sections ?? res.body?.sections ?? []
  if (sections.length === 0) {
    console.error('no sections exist yet - create one before seeding')
    process.exit(1)
  }
  return sections
}

async function existingNames(path, key) {
  // limit=0 is the API's "all rows", so the skip check sees every page rather
  // than only the first - otherwise a second run recreates everything past 50.
  const res = await api(`${path}?limit=0`)
  const rows = res.body?.data?.[key] ?? res.body?.[key] ?? []
  return new Set(rows.map((r) => String(r.name).toLowerCase()))
}

async function main() {
  console.log(`Seeding ${String(PER)} terminals per model and ${String(PER)} kits per type against ${BASE}\n`)

  try {
    const res = await fetch(`${BASE}/health`)
    if (!res.ok) throw new Error(`health returned ${res.status}`)
  } catch (err) {
    console.error(`cannot reach ${BASE} - is the dev stack up?`)
    console.error(String(err))
    process.exit(1)
  }

  // The guard that actually catches a forwarded port. This script sends no
  // Authorization header, so it can only work against AUTH_ENABLED=false - a
  // local dev stack. Fail closed before writing anything.
  const sections = await fetchSections()
  console.log(`${String(sections.length)} sections: ${sections.map((s) => s.label ?? s.key).join(', ')}\n`)

  let created = 0
  let skipped = 0
  let failed = 0

  // --- Terminals ---
  const knownTerminals = await existingNames('/terminals', 'terminals')
  for (const model of MODELS) {
    let made = 0
    let skip = 0
    for (let i = 1; i <= PER; i += 1) {
      const n = String(i).padStart(2, '0')
      const name = `SEED ${MODEL_LABEL[model]} ${n}`
      if (knownTerminals.has(name.toLowerCase())) { skip += 1; continue }
      const section = sections[(i - 1) % sections.length]
      const payload = {
        name,
        model,
        status: STATUSES[(i - 1) % STATUSES.length],
        section: section.key,
        serial: `SN-${MODEL_LABEL[model].replace('-', '')}-${n}`,
        kit: i % 4 === 0 ? `K-${n}` : '',
        pim: i % 5 === 0 ? `P-${n}` : '',
        notes: i % 6 === 0 ? 'Seeded sample row.' : '',
      }
      const res = await api('/terminals', { method: 'POST', body: JSON.stringify(payload) })
      if (res.status === 201) { made += 1 } else {
        failed += 1
        if (failed <= 3) console.log(`  FAIL  ${name} -> ${String(res.status)} ${res.body?.error?.code ?? ''}`)
      }
    }
    created += made
    skipped += skip
    console.log(`  terminals ${MODEL_LABEL[model].padEnd(7)} ${String(made).padStart(3)} created, ${String(skip).padStart(3)} already there`)
  }

  // --- Kits ---
  const knownKits = await existingNames('/kits', 'kits')
  for (const type of KIT_TYPES) {
    let made = 0
    let skip = 0
    for (let i = 1; i <= PER; i += 1) {
      const n = String(i).padStart(2, '0')
      const name = `SEED ${type.toUpperCase()} ${n}`
      if (knownKits.has(name.toLowerCase())) { skip += 1; continue }
      const section = sections[(i - 1) % sections.length]
      const payload = {
        name,
        type,
        status: STATUSES[(i - 1) % STATUSES.length],
        section: section.key,
        // Vary the three network flags so the columns are not uniformly empty
        // and the checkmark rendering gets exercised in every combination.
        black: i % 2 === 0,
        secret: i % 3 === 0,
        topsecret: i % 4 === 0,
        location: i % 3 === 0 ? `Bay ${n}` : '',
        notes: i % 6 === 0 ? 'Seeded sample row.' : '',
      }
      const res = await api('/kits', { method: 'POST', body: JSON.stringify(payload) })
      if (res.status === 201) { made += 1 } else {
        failed += 1
        if (failed <= 3) console.log(`  FAIL  ${name} -> ${String(res.status)} ${res.body?.error?.code ?? ''}`)
      }
    }
    created += made
    skipped += skip
    console.log(`  kits      ${type.toUpperCase().padEnd(7)} ${String(made).padStart(3)} created, ${String(skip).padStart(3)} already there`)
  }

  console.log(`\n${String(created)} created, ${String(skipped)} already present, ${String(failed)} failed.`)
  console.log('Every row is named "SEED ..." - filter on that to find or remove them.')
  if (failed > 0) process.exitCode = 1
}

void main()

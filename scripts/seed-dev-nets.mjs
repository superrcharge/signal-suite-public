#!/usr/bin/env node
// Seed the Nets Library with sample data for local development.
//
// This is NOT a migration, deliberately. `023_remove_seed_data.sql` exists
// because seeded demo rows from migrations 006, 014 and 016 shipped to production and
// now sit alongside real records. Seeding through the API, from a script that
// refuses to talk to anything but localhost, cannot repeat that.
//
// Rules this file follows, in order of importance:
//   1. Local, unauthenticated stacks only. Two independent checks run before any
//      row is written: the hostname must be loopback, and the target must not
//      have authentication enabled. See the guard section for why one check is
//      not enough.
//   2. Say what it did. Every row created is printed, so the seeded data is
//      trivially identifiable and removable afterwards.
//   3. Never clobber. A net whose name already exists is skipped, not
//      overwritten - your own records are safe if you run this twice.
//   4. Seeds every card-bearing squadron. Nets are a per-squadron library, so
//      there is no global list to seed - each squadron gets its own copies, with
//      the same names on deliberately different frequencies. That is the shape
//      real data takes: FIRES exists everywhere, on nobody else's frequency.

const DEFAULT_BASE = 'http://localhost:3001'
const BASE = process.env.SEED_API_URL ?? DEFAULT_BASE

// The squadrons to seed are read from the API at run time - see
// fetchCardSections(). There is deliberately no list here.
//
// There used to be one, under a comment saying it must match PACE_SECTION_KEYS
// in the frontend. That constant was deleted when migration 036 promoted "which
// squadrons run a comms card" to the sections.pace_enabled column, so the
// comment named nothing and no mechanism kept the list honest. It went stale
// immediately and silently: HQ (036) and SPT (037) were both skipped while
// the script's own rule 4 promised every card-bearing squadron and its summary
// line reported "across 5 squadrons" - confidently, and wrongly.
//
// Adding a squadron is exactly when you want the sample data to cover it, since
// that is when everything gets verified end to end.

// --- Guard: loopback host ----------------------------------------------------
// A loopback hostname says nothing about what is *behind* the port. A
// `kubectl port-forward svc/signal-suite-api 3001:3001` or an SSH tunnel makes a deployed
// environment answer on localhost:3001 and sail straight through this check.
// That is what the auth probe in main() is for - this check only rules out the
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

// --- The data ----------------------------------------------------------------
// Deliberately spans every shape the UI has to survive, rather than 16 identical
// rows: simplex and split TX/RX, a range, a non-numeric placeholder, all three
// radio types, MHz and GHz, and a mix of ROIP on and off.
//
// NET 13 carries a range in BOTH tx and rx. That is the case measured as
// overflowing the wheel label budget (209 units against 137 available). It is
// here on purpose - better to see it break now than after the editor has
// hardened the layout around it.
const NETS = [
  { name: 'SEED NET 01', net_id: 'N01', radio_type: 'jem',  tx_freq: '30.5000',  rx_freq: '30.5000',  freq_unit: 'MHz' },
  { name: 'SEED NET 02', net_id: 'N02', radio_type: 'jem',  tx_freq: '31.0000',  rx_freq: '41.0000',  freq_unit: 'MHz' },
  { name: 'SEED NET 03', net_id: 'N03', radio_type: 'jem',  tx_freq: '31.5000',  rx_freq: '31.5000',  freq_unit: 'MHz' },
  { name: 'SEED NET 04', net_id: 'N04', radio_type: 'jem',  tx_freq: '32.0000',  rx_freq: '42.0000',  freq_unit: 'MHz' },
  { name: 'SEED NET 05', net_id: 'N05', radio_type: 'jem',  tx_freq: '32.5000',  rx_freq: '32.5000',  freq_unit: 'MHz' },
  { name: 'SEED NET 06', net_id: 'N06', radio_type: 'jem',  tx_freq: '225.000 - 399.975', rx_freq: '', freq_unit: 'MHz' },
  { name: 'SEED NET 07', net_id: 'N07', radio_type: 'jem',  tx_freq: 'TBD',      rx_freq: 'TBD',      freq_unit: 'MHz' },
  { name: 'SEED NET 08', net_id: 'N08', radio_type: 'jem',  tx_freq: '34.0000',  rx_freq: '',         freq_unit: 'MHz' },
  { name: 'SEED NET 09', net_id: 'W01', radio_type: 'mpu5', tx_freq: '1.3550',   rx_freq: '1.3550',   freq_unit: 'GHz' },
  { name: 'SEED NET 10', net_id: 'W02', radio_type: 'mpu5', tx_freq: '1.3600',   rx_freq: '1.4600',   freq_unit: 'GHz' },
  { name: 'SEED NET 11', net_id: 'W03', radio_type: 'mpu5', tx_freq: '1.3650',   rx_freq: '1.3650',   freq_unit: 'GHz' },
  { name: 'SEED NET 12', net_id: 'W04', radio_type: 'mpu5', tx_freq: '2.4000 - 2.4835', rx_freq: '', freq_unit: 'GHz' },
  { name: 'SEED NET 13', net_id: 'W05', radio_type: 'mpu5', tx_freq: '225.000 - 399.975', rx_freq: '225.000 - 399.975', freq_unit: 'MHz' },
  { name: 'SEED NET 14', net_id: 'S01', radio_type: 'both', tx_freq: '243.000',  rx_freq: '243.000',  freq_unit: 'MHz' },
  { name: 'SEED NET 15', net_id: 'S02', radio_type: 'both', tx_freq: '38.7500',  rx_freq: '48.7500',  freq_unit: 'MHz' },
  { name: 'SEED NET 16', net_id: 'S03', radio_type: 'both', tx_freq: '',         rx_freq: '',         freq_unit: 'MHz' },
]

async function api(path, init) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

/**
 * Same net names per squadron, shifted frequencies -- as real data behaves.
 *
 * The shift is POSITIONAL: it comes from where a squadron falls in the list, and
 * that list is now the API's, ordered by label. So adding a squadron that sorts
 * before an existing one moves that one's sample frequencies on a *fresh* seed.
 *
 * Harmless, but non-obvious enough to write down rather than have rediscovered.
 * Rule 3 means an existing row is skipped by name and never rewritten, so only a
 * brand-new database is affected, and these are arbitrary sample figures either
 * way. As it happens the current order is kind - A, B, C, D, F SQD, SPT, HQ
 * leaves the original five at indices 0-4.
 */
function netsFor(sectionIndex) {
  const shift = sectionIndex * 0.25
  // Only shift a plain single figure. An empty value must stay empty and a
  // range or a word must stay verbatim -- Number('') is 0, not NaN, so a bare
  // Number() check would turn "no frequency" into "0.0000".
  const bump = (v) => {
    if (v === '' || v.includes('-') || Number.isNaN(Number(v))) return v
    return (Number(v) + shift).toFixed(4)
  }
  return NETS.map((n) => ({ ...n, tx_freq: bump(n.tx_freq), rx_freq: bump(n.rx_freq) }))
}

/**
 * The card-bearing squadrons, read from the API rather than restated here.
 *
 * `pace_enabled` is the single flag that gates both the comms card and the
 * per-squadron nets library (migration 036), so it is also the correct answer to
 * "which squadrons have a nets library to seed". A section without the flag has
 * no library at all - GET /nets/<key> 404s - so seeding one is not a thing to
 * want.
 *
 * Doubles as the auth probe. This script sends no Authorization header, so
 * against any stack with auth on this is the request that says so, and it
 * happens before a single row is written.
 */
async function fetchCardSections() {
  const res = await api('/sections')
  if (res.status === 401 || res.status === 403) {
    console.error(`refusing to run: ${BASE} requires authentication (${res.status}).`)
    console.error('This script only works against a stack with AUTH_ENABLED=false, so an')
    console.error('authenticated target is not a local dev stack - most likely a forwarded')
    console.error('port pointing at a deployed environment. Nothing was written.')
    process.exit(1)
  }
  if (res.status !== 200) {
    console.error(`cannot read sections (${res.status}). Nothing was written.`)
    process.exit(1)
  }

  const sections = (res.body?.data?.sections ?? []).filter((sec) => sec.pace_enabled === true)
  if (sections.length === 0) {
    console.error('no section has pace_enabled set, so there is no nets library to seed.')
    console.error('Check that migrations have run against this stack.')
    process.exit(1)
  }
  return sections
}

async function main() {
  console.log(`Seeding nets against ${BASE}\n`)

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
  // Authorization header, so it can only ever work against a stack running with
  // AUTH_ENABLED=false - i.e. a local dev stack. Every deployed environment has
  // auth on, so a 401/403 here means the loopback port is tunnelled somewhere it
  // should not be. Fail closed and say so, rather than emitting 80 confusing
  // per-row FAIL lines.
  //
  // Reading the squadron list IS that probe, so it still happens before a single
  // row is written - fetchCardSections() owns the 401/403 branch now.
  const sections = await fetchCardSections()
  console.log(
    `${sections.length} card-bearing squadrons: ${sections.map((sec) => sec.label).join(', ')}`,
  )

  let created = 0
  let skipped = 0

  for (const [sectionIndex, sec] of sections.entries()) {
    const section = sec.key
    const existing = await api(`/nets/${section}`)
    if (existing.status !== 200) {
      console.log(`\n${sec.label}: cannot read library (${existing.status}) - skipping`)
      continue
    }
    const known = new Set(
      (existing.body?.data?.nets ?? []).map((n) => n.name.toLowerCase()),
    )

    console.log(`\n${sec.label}`)
    // Per squadron, NOT the running totals. The status line used to compare one
    // squadron's net count against the cumulative `skipped`, which is only ever
    // right for the first squadron: by the time SPT was reached, `skipped` held
    // every earlier squadron's skips, so a squadron that had just been seeded
    // 16 nets reported "already present". Invisible while all five squadrons
    // were always in the same state; wrong the moment one differs, which is
    // exactly what deriving the list at run time makes possible.
    let sectionCreated = 0
    let sectionSkipped = 0
    for (const [i, net] of netsFor(sectionIndex).entries()) {
      if (known.has(net.name.toLowerCase())) {
        sectionSkipped += 1
        continue
      }
      // Vary ROIP so the column is not uniformly empty.
      const payload = { ...net, roip: i % 3 === 0 }
      const res = await api(`/nets/${section}`, { method: 'POST', body: JSON.stringify(payload) })
      if (res.status === 201) {
        sectionCreated += 1
      } else {
        console.log(`  FAIL    ${net.name}  -> ${res.status} ${res.body?.error?.code ?? ''}`)
      }
    }
    created += sectionCreated
    skipped += sectionSkipped
    console.log(
      sectionCreated > 0
        ? `  seeded ${sectionCreated}${sectionSkipped > 0 ? `, ${sectionSkipped} already present` : ''}`
        : '  already present',
    )
  }

  console.log(`\n${created} created, ${skipped} skipped, across ${sections.length} squadrons.`)
  console.log('Every seeded row is named "SEED NET nn". The same names exist in each')
  console.log('squadron on different frequencies -- editing one cannot affect another.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

#!/usr/bin/env node
// Play the Exercise Silent Harbor walkthrough in a real browser and record it.
//
// This drives the running dev stack at :3001 through the whole Operations
// feature in twelve chapters, with a caption bar along the bottom of the
// viewport so a room can follow, and saves a video to _project/demo/. It is the
// replay of docs/demo-operation.md, and it reads the same scenario as the seed
// (lib/demo-operation.mjs), so the two live joins cannot drift from the data.
//
// Why Playwright with the installed Chrome: the script is dev only, and a
// browser download is never acceptable here. `playwright` is a devDependency of
// frontend/ (the library only, no test runner), imported through createRequire
// so it resolves against that tree, and the browser launched is the machine's
// own Google Chrome (`channel: 'chrome'`), or the binary named by CHROME_PATH.
//
// Rules this file follows, in order of importance:
//   1. Local, unauthenticated stacks only. The hostname must be loopback and the
//      target must not have authentication enabled; one check alone is not
//      enough, see the guard section. It then resets the demo operation by
//      running the seed with --reset, which deletes only that exact name.
//   2. Locators are roles and accessible names, never CSS classes, so a restyle
//      does not break the walk and a wrong name fails loudly.
//   3. A failure leaves evidence: the chapter title and error are printed, a
//      screenshot goes to _project/demo/failed-<chapter>.png, and the browser is
//      closed so the partial video is still saved.
//
// Flags: --pace <ms> (default 2500, the hold after each caption); --step (wait
// for Enter in the terminal between chapters, for presenting live); --headless
// (recording only; the default is a visible window); --keep (skip the reset and
// seed, and skip a join whose unit is already on the operation).

import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_LEAVE_OUT, DEMO } from './lib/demo-operation.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const VIDEO_DIR = join(REPO, '_project', 'demo')
const DEFAULT_BASE = 'http://localhost:3001'
const BASE = process.env.SEED_API_URL ?? DEFAULT_BASE

const argv = process.argv.slice(2)
const flagValue = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}
const PACE = Number(flagValue('--pace', '2500'))
const STEP = argv.includes('--step')
const HEADLESS = argv.includes('--headless')
const KEEP = argv.includes('--keep')
if (!Number.isFinite(PACE) || PACE < 0) {
  console.error('--pace needs a number of milliseconds')
  process.exit(1)
}

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

async function api(path) {
  const res = await fetch(`${BASE}/api/v1${path}`)
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

const lc = (s) => String(s ?? '').toLowerCase()
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- Playwright, from the frontend tree, and the installed Chrome -------------
const { chromium } = createRequire(new URL('../frontend/package.json', import.meta.url))('playwright')

async function launch() {
  // Playwright's own Ctrl+C handler kills the browser at once, which leaves the
  // recording unfinished under a raw name; this script closes it itself
  // (`finishVideo`), so the handlers are off.
  const base = { headless: HEADLESS, slowMo: HEADLESS ? 0 : 120, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false }
  try {
    return await chromium.launch({ channel: 'chrome', ...base })
  } catch (err) {
    if (!process.env.CHROME_PATH) {
      console.error('could not start the installed Google Chrome, and CHROME_PATH is not set.')
      throw err
    }
    return chromium.launch({ executablePath: process.env.CHROME_PATH, ...base })
  }
}

// --- Captions ------------------------------------------------------------------
// A fixed bar injected into the page. A full page load discards it, so the
// current text is remembered and put back on every load.
let currentCaption = ''

async function caption(page, text) {
  currentCaption = text
  await page.evaluate((t) => {
    let bar = document.getElementById('demo-caption')
    if (!bar) {
      bar = document.createElement('div')
      bar.id = 'demo-caption'
      document.body.appendChild(bar)
    }
    const display = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim()
    const family = display || getComputedStyle(document.body).fontFamily
    Object.assign(bar.style, {
      // Translucent, so the drawer's Cancel and Save at the foot of the viewport
      // stay readable behind it; a solid bar hid them in the first recording.
      position: 'fixed', left: '0', right: '0', bottom: '0', height: '40px',
      background: 'rgba(31, 35, 40, 0.82)', color: '#f9a825', fontSize: '17px', fontFamily: family,
      padding: '0 24px', lineHeight: '40px', zIndex: '100000', pointerEvents: 'none',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'border-box',
    })
    bar.textContent = t
  }, text).catch(() => {})
}

async function visit(page, path) {
  await page.goto(`${BASE}${path}`)
  await caption(page, currentCaption)
}

// --- The two live joins ----------------------------------------------------------
const unitOf = (label) => {
  const u = DEMO.units.find((x) => x.label === label)
  if (!u) throw new Error(`the demo has no unit ${label}`)
  return u
}

let operation = null // { id, name }

async function loadOperation() {
  const res = await api(`/operations/${operation.id}`)
  if (res.status !== 200) throw new Error(`cannot read the operation (${res.status})`)
  return res.body.data
}
const participantLabels = (detail) => (detail.participants ?? []).map((p) => p.organization?.short_label || p.organization?.name)

const wizardOf = (page) => page.getByRole('group', { name: 'Steps', exact: true })
const beat = () => sleep(Math.max(300, Math.round(PACE / 3)))

async function setPressed(locator, want) {
  const on = (await locator.getAttribute('aria-pressed')) === 'true'
  if (on !== want) await locator.click()
}

// Swatches are a fixed palette; the unit's own colour is not in it, so the
// closest entry is picked. Exact when present.
const SWATCH_FOR = { '#78909C': '#79c0ff' }
const swatchFor = (c) => SWATCH_FOR[c] ?? c

async function openJoinWizard(page) {
  await page.getByRole('button', { name: /^Participants \(/ }).click()
  await page.getByRole('button', { name: 'Join Operation', exact: true }).click()
  await wizardOf(page).waitFor()
}

async function joinUnit(page, label, how) {
  const u = unitOf(label)
  const before = (await loadOperation()).participants.length
  await openJoinWizard(page)

  // 1. Who: a library row, or Other.
  if (how === 'other') {
    await page.getByRole('button', { name: 'Other', exact: true }).click()
    await page.getByLabel('Other name', { exact: true }).fill(u.adhoc.name)
    await page.getByLabel('Other short label', { exact: true }).fill(u.adhoc.short_label)
    if (u.adhoc.branch) await page.getByRole('group', { name: 'Other branch' }).getByRole('button', { name: u.adhoc.branch, exact: true }).click()
    await page.getByRole('group', { name: 'Other color' }).getByRole('button', { name: swatchFor(u.adhoc.color) }).click()
  } else {
    await page.getByRole('group', { name: 'Organizations' }).getByRole('button', { name: new RegExp(escapeRe(label)) }).click()
  }
  await beat()
  const next = page.getByRole('button', { name: /^Continue to step \d$/ })
  await next.click()

  // 2. Platform.
  if (u.platforms.length === 0) {
    await setPressed(page.getByRole('group', { name: 'Platforms' }).getByRole('button', { name: /^Dismounted/ }), true)
  } else {
    for (const d of u.platforms) {
      await page.getByRole('group', { name: 'Platforms' }).getByRole('button', { name: new RegExp(`^${escapeRe(d)}`) }).click()
    }
  }
  await beat()
  await next.click()

  // 3. Equipment, found through the picker's own search box.
  const eqList = (await api('/equipment')).body?.data?.equipment ?? []
  const equipmentLabelOf = new Map()
  for (const id of u.equipment) {
    const rec = eqList.find((e) => lc(e.id) === lc(id))
    if (!rec) throw new Error(`equipment ${id} is not in the catalog`)
    const text = rec.nomenclature || rec.nickname || rec.id
    equipmentLabelOf.set(id, text)
    const search = page.getByPlaceholder(/^Search by name/)
    await search.fill(text)
    const card = page.getByRole('button', { name: new RegExp(`^(?!Remove).*${escapeRe(text)}`) }).first()
    await card.click()
  }
  await page.getByPlaceholder(/^Search by name/).fill('')
  await beat()
  await next.click()

  // 4. Gear: where each asset is, phase by phase.
  const assetLabel = (key) => (u.platforms.includes(key) ? key : equipmentLabelOf.get(key) ?? key)
  for (const key of [...u.platforms, ...u.equipment]) {
    const want = u.asset_phases[key] ?? DEMO.phases
    for (const ph of DEMO.phases) {
      await setPressed(page.getByRole('button', { name: `${assetLabel(key)} in ${ph}`, exact: true }), want.includes(ph))
    }
  }
  await beat()
  await next.click()

  // 5. Transports: none for these units, so the step is passed through.
  await beat()
  await next.click()

  // 6. Where the unit sits and who it must talk to, in each phase it is in.
  const roster = new Set(participantLabels(await loadOperation()))
  for (const ph of DEMO.phases) {
    const plan = DEMO.plans[ph]
    const site = plan.placements[label]
    if (site) await page.getByLabel(`Location in ${ph}`, { exact: true }).selectOption({ label: site })
    for (const [a, b] of plan.requirements) {
      if (a !== label && b !== label) continue
      const partner = a === label ? b : a
      if (!roster.has(partner)) continue
      await setPressed(page.getByRole('button', { name: `Must talk to ${partner} in ${ph}`, exact: true }), true)
    }
  }
  await beat()
  await next.click()

  // 7. The point of contact, when there is one.
  if (u.poc.name) await page.getByLabel('POC name', { exact: true }).fill(u.poc.name)
  if (u.poc.phone) await page.getByLabel('POC phone', { exact: true }).fill(u.poc.phone)
  if (u.poc.email) await page.getByLabel('POC email', { exact: true }).fill(u.poc.email)
  await beat()
  await next.click()

  // 8. Review, then Join.
  await beat()
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await wizardOf(page).waitFor({ state: 'detached' })

  const after = (await loadOperation()).participants.length
  if (after !== before + 1) throw new Error(`joining ${label}: participants went from ${before} to ${after}, expected ${before + 1}`)
}

// --- The twelve chapters ---------------------------------------------------------
const viewGroup = (page) => page.getByRole('group', { name: 'View', exact: true })
const phaseGroup = (page) => page.getByRole('group', { name: 'Phase', exact: true })
async function pickView(page, name) {
  await viewGroup(page).getByRole('button', { name, exact: true }).click()
  await viewGroup(page).getByRole('button', { name, exact: true, pressed: true }).waitFor()
}
const opPath = () => `/operations/${operation.id}`

const CHAPTERS = [
  {
    title: 'Dashboard: the Operations tile',
    caption: 'Operations sits beside the Equipment Catalog and PACE Planning.',
    async run(page) {
      await visit(page, '/')
      await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Operations' }).hover()
    },
  },
  {
    title: 'Operations picker',
    caption: 'One tile per operation; the acronym names it here and nowhere else.',
    async run(page) {
      await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Operations' }).click()
      await page.getByRole('button', { name: /SILENT HARBOR/ }).waitFor()
      await caption(page, currentCaption)
      await page.getByRole('button', { name: /SILENT HARBOR/ }).hover()
    },
  },
  {
    title: 'Add Operation, then Cancel',
    caption: 'A new operation starts with four phases; rename them and add locations in the Edit drawer.',
    async run(page) {
      await page.getByRole('button', { name: 'add', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Add Operation' }).click()
      await page.getByLabel(/^Name/).fill('Exercise Example')
      await page.getByLabel('Acronym', { exact: true }).fill('EXAMPLE')
      await page.waitForTimeout(PACE)
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.getByLabel(/^Name/).waitFor({ state: 'detached' })
      // The Phases and Locations editors live in the Edit drawer of an existing operation.
      await page.getByRole('button', { name: /SILENT HARBOR/ }).click()
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      await caption(page, currentCaption)
      await page.getByRole('group', { name: 'Phases' }).scrollIntoViewIfNeeded()
      await page.waitForTimeout(PACE)
      await page.getByRole('group', { name: 'Locations' }).scrollIntoViewIfNeeded()
      await page.waitForTimeout(PACE)
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.getByRole('group', { name: 'Phases' }).waitFor({ state: 'detached' })
    },
  },
  {
    title: 'Participants popup',
    caption: 'A participant is an organization, not a person.',
    async run(page) {
      await page.getByRole('button', { name: /^Participants \(/ }).click()
      await page.getByRole('button', { name: /^Open / }).first().waitFor()
      await page.waitForTimeout(PACE)
    },
    after: async (page) => { await page.keyboard.press('Escape') },
  },
  {
    title: 'Join Operation: CAS as Other',
    caption: 'CAS is not in the library, so it joins as Other, in F-15E at Overhead for Actions on Objective only.',
    async run(page) {
      if (KEEP && participantLabels(await loadOperation()).includes('CAS')) {
        await caption(page, 'CAS is already on this operation, so the live join is skipped.')
        return
      }
      await joinUnit(page, 'CAS', 'other')
    },
  },
  {
    title: 'Join Operation: TF WHITE from the library',
    caption: 'Three requirements that were waiting on this unit just went green.',
    async run(page) {
      if (KEEP && participantLabels(await loadOperation()).includes('TF WHITE')) {
        await caption(page, 'TF WHITE is already on this operation, so the live join is skipped.')
        return
      }
      await joinUnit(page, 'TF WHITE', 'library')
    },
  },
  {
    title: 'Loadout: TF WHITE',
    caption: 'Same four parts in the same order for every unit.',
    async run(page) {
      await pickView(page, 'Loadout')
      await page.getByRole('tab', { name: 'TF WHITE' }).click()
      await page.getByRole('table', { name: 'TF WHITE by phase' }).scrollIntoViewIfNeeded()
      await page.waitForTimeout(Math.round(PACE / 2))
      await page.getByRole('region', { name: 'TF WHITE point of contact' }).scrollIntoViewIfNeeded()
    },
  },
  {
    title: 'Matrix: Actions on Objective',
    caption: 'What everyone could talk on, by phase.',
    async run(page) {
      await pickView(page, 'Matrix')
      await phaseGroup(page).getByRole('button', { name: 'Actions on Objective', exact: true }).click()
      await page.getByRole('button', { name: 'Expand TF WHITE', exact: true }).click()
    },
  },
  {
    title: 'Web: gaps, focus, plan',
    caption: 'Who must talk to whom, and whether they can.',
    async run(page) {
      await pickView(page, 'Web')
      await phaseGroup(page).getByRole('button', { name: 'Actions on Objective', exact: true }).click()
      const show = page.getByRole('group', { name: 'Show', exact: true })
      await show.getByRole('button', { name: 'Gaps', exact: true }).click()
      await page.waitForTimeout(Math.round(PACE / 2))
      await show.getByRole('button', { name: 'Focus', exact: true }).click()
      await page.getByRole('region', { name: /who must talk to whom/ }).getByText('TF WHITE', { exact: true }).first().click()
      await page.waitForTimeout(Math.round(PACE / 2))
      await show.getByRole('button', { name: 'All', exact: true }).click()
      const view = page.getByRole('button', { name: 'View plan', exact: true })
      if (await view.count() > 0) await view.click()
      await page.getByRole('button', { name: 'Hide plan', exact: true }).waitFor()
      await caption(page, 'The plan panel holds the tier select, locations and pairs; closing it saves nothing.')
      await page.waitForTimeout(PACE)
      await page.getByRole('button', { name: 'Hide plan', exact: true }).click()
      await caption(page, 'Staging shows the one red line: JOC to TF ORANGE has no way to talk.')
      await phaseGroup(page).getByRole('button', { name: 'Staging', exact: true }).click()
    },
  },
  {
    title: 'Share menu and print page',
    caption: 'Native PowerPoint, one slide per phase.',
    async run(page) {
      await page.getByRole('button', { name: 'share this sheet', exact: true }).click()
      await page.getByRole('menuitem', { name: /Download \.pptx/ }).waitFor()
      await page.waitForTimeout(PACE)
      await page.keyboard.press('Escape')
      await page.getByRole('menuitem', { name: /Download \.pptx/ }).waitFor({ state: 'detached' })
      // Print / Save PDF opens a new tab; open the same route in this page so the video follows it.
      const [popup] = await Promise.all([
        page.context().waitForEvent('page'),
        page.getByRole('button', { name: 'Print / Save PDF' }).click(),
      ])
      await popup.waitForLoadState()
      const url = popup.url()
      await popup.close()
      await page.goto(url)
      await caption(page, currentCaption)
      await page.waitForTimeout(PACE)
      await page.goBack()
      await caption(page, currentCaption)
    },
  },
  {
    title: 'Settings: Organizations and Audit log',
    caption: 'Every join and every plan save is audited.',
    async run(page) {
      await visit(page, '/settings?tab=organizations')
      await page.waitForTimeout(Math.round(PACE / 2))
      await visit(page, '/settings?tab=audit')
    },
  },
  {
    title: 'End card',
    caption: 'That is the whole walk.',
    async run(page) {
      await caption(page, `Exercise Silent Harbor: ${BASE}${opPath()}`)
    },
  },
]

// --- Running ---------------------------------------------------------------------
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function waitForEnter() {
  return new Promise((resolveEnter) => {
    const rl = createInterface({ input: process.stdin })
    // Readline can take Ctrl+C for itself; hand it on so the run still tidies up.
    rl.on('SIGINT', () => { process.emit('SIGINT') })
    rl.once('line', () => { rl.close(); resolveEnter() })
  })
}

const stamp = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

async function main() {
  const started = Date.now()
  console.log(`Walking Exercise Silent Harbor against ${BASE}${HEADLESS ? ' (headless)' : ''}${KEEP ? ' (keep)' : ''}, pace ${PACE} ms${STEP ? ', stepping' : ''}\n`)

  try {
    const res = await fetch(`${BASE}/health`)
    if (!res.ok) throw new Error(`health returned ${res.status}`)
  } catch (err) {
    console.error(`cannot reach ${BASE} - is the dev stack up? (make dev)`)
    console.error(String(err))
    process.exit(1)
  }

  // The guard that actually catches a forwarded port. Nothing here sends an
  // Authorization header, so it can only work against AUTH_ENABLED=false, i.e. a
  // local dev stack. It runs before the seed writes a single row.
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

  if (!KEEP) {
    const seed = spawnSync(process.execPath, [join(HERE, 'seed-dev-operation.mjs'), '--reset'], { stdio: 'inherit', env: process.env })
    if (seed.status !== 0) {
      console.error('the seed failed, so the walkthrough was not started')
      process.exit(1)
    }
    console.log('')
  }

  const ops = (await api('/operations')).body?.data?.operations ?? []
  const found = ops.find((o) => lc(o.name) === lc('Exercise Silent Harbor'))
  if (!found) {
    console.error('Exercise Silent Harbor is not on this stack. Run without --keep, or run scripts/seed-dev-operation.mjs first.')
    process.exit(1)
  }
  operation = { id: found.id, name: found.name }
  console.log(`Operation ${operation.id}, leaving out ${DEFAULT_LEAVE_OUT.join(' and ')} until the live joins\n`)

  mkdirSync(VIDEO_DIR, { recursive: true })
  const before = new Set(readdirSync(VIDEO_DIR))

  const browser = await launch()
  // The video encoder is Playwright's own ffmpeg build, a separate download
  // from the browser. It is never fetched here; when it is missing the walk
  // still runs, unrecorded, and says how to turn recording on.
  // 1440x810 rather than the 1280x720 design floor: at the floor, with the
  // sidebar open, the banner's sides leave the centre about 400px on the
  // Matrix and Web views and a 22-character name truncates to an ellipsis.
  // The floor is where layout is checked, not where a recording looks best.
  const SIZE = { width: 1440, height: 810 }
  const open = async (record) => {
    const ctx = await browser.newContext({
      viewport: SIZE,
      ...(record ? { recordVideo: { dir: VIDEO_DIR, size: SIZE } } : {}),
    })
    // The print route calls window.print() on load and would hang a recording.
    await ctx.addInitScript(() => { window.print = () => {} })
    return { ctx, pg: await ctx.newPage() }
  }
  let context
  let page
  try {
    ;({ ctx: context, pg: page } = await open(true))
  } catch (err) {
    if (!/ffmpeg/i.test(String(err))) throw err
    console.log('No video: Playwright\'s ffmpeg is not installed, so this run is not recorded.')
    console.log('Recording needs a one-off download (`npx playwright install ffmpeg` from frontend/); it is not fetched automatically.\n')
    ;({ ctx: context, pg: page } = await open(false))
  }
  page.on('domcontentloaded', () => { void caption(page, currentCaption) })

  // Closes the browser, which is what finalises a recording, then gives the
  // main page's video its readable name and drops any other video this run
  // made (the print tab is recorded as its own file). Shared by the normal
  // end, a failed chapter and Ctrl+C, so no exit leaves a raw `page@<hash>.webm`.
  let finishing = null
  const finishVideo = (suffix) => {
    finishing ??= finalise(suffix)
    return finishing
  }
  const finalise = async (suffix) => {
    const video = page.video()
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
    try {
      if (!video) throw new Error('recording was off for this run')
      const raw = await video.path()
      const named = join(VIDEO_DIR, `silent-harbor-${stamp()}${suffix}.webm`)
      renameSync(raw, named)
      for (const f of readdirSync(VIDEO_DIR)) {
        if (f.endsWith('.webm') && !before.has(f) && join(VIDEO_DIR, f) !== named) rmSync(join(VIDEO_DIR, f))
      }
      return named
    } catch (err) {
      console.log(`no video saved: ${String(err.message ?? err)}`)
      return null
    }
  }
  // An interrupt owns the exit: it finishes the video and exits 130, while the
  // chapter loop, which sees the browser close under it, stands aside.
  let interrupted = false
  process.once('SIGINT', () => {
    interrupted = true
    console.log('\nInterrupted; saving what was recorded.')
    void finishVideo('-partial').then((named) => {
      if (named) console.log(`Video: ${named}`)
      process.exit(130)
    })
  })

  let failure = null
  for (const [i, chapter] of CHAPTERS.entries()) {
    const n = i + 1
    console.log(`${String(n).padStart(2)}. ${chapter.title}`)
    try {
      await caption(page, chapter.caption)
      await chapter.run(page)
      if (STEP) {
        console.log('    (Enter for the next chapter)')
        await waitForEnter()
      } else {
        await page.waitForTimeout(PACE)
      }
      if (chapter.after) await chapter.after(page)
    } catch (err) {
      if (interrupted) await new Promise(() => {})
      failure = { n, chapter, err }
      console.error(`\nFAILED chapter ${n}: ${chapter.title}`)
      console.error(String(err?.stack ?? err))
      const shot = join(VIDEO_DIR, `failed-${n}-${slug(chapter.title)}.png`)
      await page.screenshot({ path: shot }).then(() => { console.error(`screenshot: ${shot}`) }).catch(() => {})
      break
    }
  }

  const saved = await finishVideo(failure ? '-failed' : '')

  const seconds = Math.round((Date.now() - started) / 1000)
  if (saved) {
    console.log(`\nVideo: ${saved}`)
    console.log(`ffmpeg -i "${saved}" -c:v libx264 -pix_fmt yuv420p "${saved.replace(/\.webm$/, '.mp4')}"`)
  }
  if (failure) {
    console.error(`\nStopped at chapter ${failure.n} after ${seconds}s.`)
    process.exit(1)
  }
  console.log(`\nAll ${CHAPTERS.length} chapters done in ${seconds}s.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

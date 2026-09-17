#!/usr/bin/env node
// Post-deploy smoke check. Answers the question a green deploy workflow does
// not: is the new build actually serving?
//
// A platform's restart command returns as soon as it ACCEPTS the restart, not
// when the container is up and answering. So a deploy step goes green while the
// site is still on the old image, or still booting, or failing to boot at all.
// Every deploy therefore used to end with someone remembering to go and check by
// hand, and "remembering to" is not a control.
//
// The checks, in the order they answer useful questions:
//
//   1. /health returns 200          - the container is up at all. Polled, because
//                                     this is the one that legitimately takes time.
//   2. /ready returns 200           - it reached its dependencies, notably Postgres.
//   3. / returns HTML               - the SPA is being served, not just the API.
//   4. an API route returns 401     - the route EXISTS and enforces auth.
//   5. a nonsense route returns 404 - the control that makes step 4 mean something.
//
// Steps 4 and 5 are a pair and neither is worth much alone. A 401 on its own could
// be a catch-all auth middleware in front of a route that was never registered; a
// 404 on the nonsense path is what proves the server distinguishes them, so the
// 401 really does say "this route is deployed". Getting 200 on step 4 is a finding
// in the other direction: an unauthenticated read route, which is the class of bug
// An earlier pull request existed to close.
//
// Usage:
//   node scripts/verify-deploy.mjs --url https://<host>
//   node scripts/verify-deploy.mjs --url https://<host> --timeout 420
//   node scripts/verify-deploy.mjs --url http://localhost:3001 --auth-disabled
//
// `--auth-disabled` is for pointing this at local dev, where auth.Config runs in
// ModeNone and RequireAuth is a pass-through, so step 4 legitimately answers 200.
// It is never right for a real deployment. Expecting auth is the default precisely so that
// forgetting the flag fails loudly rather than quietly weakening the check.

import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const base = (arg('url') || '').replace(/\/+$/, '')
const timeoutSec = Number.parseInt(arg('timeout', '300'), 10)

if (!base) {
  console.error('usage: node scripts/verify-deploy.mjs --url https://<host> [--timeout 300]')
  process.exit(2)
}

// A route that requires auth on every method, and a sibling that is not
// registered at all. Kept adjacent under the same prefix on purpose: if the
// prefix itself were missing, both would 404 and the pair would report that
// honestly rather than the control silently carrying the check.
const AUTHED_ROUTE = '/api/v1/terminals'
const NONSENSE_ROUTE = '/api/v1/__deploy_probe_should_not_exist__'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(path, { redirect = 'manual' } = {}) {
  const res = await fetch(`${base}${path}`, {
    redirect,
    headers: { 'user-agent': 'signal-suite-deploy-smoke/1' },
  })
  return res
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`  ${name} ... ${ok ? 'pass' : 'FAIL'}  (${detail})`)
}

console.log(`smoke: ${base}\n`)

// ---------------------------------------------------------------------------
// 1. /health, polled
// ---------------------------------------------------------------------------

const deadline = Date.now() + timeoutSec * 1000
let healthy = false
let lastSeen = 'no response'
let attempts = 0

while (Date.now() < deadline) {
  attempts += 1
  try {
    const res = await get('/health')
    lastSeen = `HTTP ${res.status}`
    if (res.status === 200) {
      healthy = true
      break
    }
  } catch (err) {
    lastSeen = err?.cause?.code ?? err?.message ?? String(err)
  }
  await sleep(5000)
}

record(
  '/health is up',
  healthy,
  healthy
    ? `200 after ${attempts} attempt${attempts === 1 ? '' : 's'}`
    : `never returned 200 within ${timeoutSec}s (last: ${lastSeen})`,
)

// Everything below needs a live server. Reporting five more failures because the
// container never booted is noise, not information.
if (!healthy) {
  console.error(
    `\nsmoke: FAILED. The deploy workflow may still be green - it returns when Azure\n` +
      `accepts the restart, not when the container serves. This is that gap.`,
  )
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 2-5. The rest, once
// ---------------------------------------------------------------------------

try {
  const res = await get('/ready')
  record('/ready is up', res.status === 200, `HTTP ${res.status}`)
} catch (err) {
  record('/ready is up', false, err?.message ?? String(err))
}

try {
  const res = await get('/')
  const body = await res.text()
  const isHtml = /<\s*html/i.test(body) || /<\s*div\s+id="root"/i.test(body)
  record(
    'SPA is served',
    res.status === 200 && isHtml,
    `HTTP ${res.status}, ${isHtml ? 'HTML body' : 'non-HTML body'}`,
  )
} catch (err) {
  record('SPA is served', false, err?.message ?? String(err))
}

const authDisabled = args.includes('--auth-disabled')
const wantStatus = authDisabled ? 200 : 401
const label = authDisabled
  ? `${AUTHED_ROUTE} exists (auth disabled)`
  : `${AUTHED_ROUTE} exists and requires auth`

let authedStatus = null
try {
  const res = await get(AUTHED_ROUTE)
  authedStatus = res.status
  record(
    label,
    res.status === wantStatus,
    res.status === 404
      ? 'HTTP 404 - route is not deployed'
      : res.status === 200 && !authDisabled
        ? 'HTTP 200 - UNAUTHENTICATED READ, this is a security finding'
        : `HTTP ${res.status}`,
  )
} catch (err) {
  record(label, false, err?.message ?? String(err))
}

try {
  const res = await get(NONSENSE_ROUTE)
  const ok = res.status === 404
  record(
    'unregistered route 404s (control)',
    ok,
    ok
      ? 'HTTP 404'
      : `HTTP ${res.status} - the 401 above proves nothing if everything answers ${res.status}`,
  )
  if (ok && authedStatus === wantStatus) {
    console.log(
      `    -> ${wantStatus} vs 404 confirms the deployed build has the route registered`,
    )
  }
} catch (err) {
  record('unregistered route 404s (control)', false, err?.message ?? String(err))
}

// ---------------------------------------------------------------------------
// The SPA actually BOOTS, not merely that HTML was served.
//
// This exists because of a shipped outage. An earlier release served a blank white screen
// in every browser, and every check above passed against it: /health and /ready
// were 200, `/` returned correct HTML, every asset returned 200, and the
// 401-vs-404 pair confirmed the routes were registered. The server was fine.
// React never initialised, because a cyclic chunk graph left a bundler helper
// undefined when the vendor chunk read it at module scope.
//
// "SPA is served" and "SPA boots" are different claims, and only the first one
// was ever being made. The difference is executing the JavaScript.
//
// Headless Chrome's `--dump-dom` prints the DOM AFTER scripts run, so the test
// is simply whether the shell populated. The backend serves an empty
// `<div id="root"></div>`; if that is still empty once the page has run, nothing
// mounted. Measured both directions: the broken build dumps 963 bytes with the
// empty root intact, a working build dumps tens of kilobytes without it.
//
// No npm dependency, deliberately - it drives a browser the CI image already
// has. A missing browser is a FAILURE, never a skip: a boot check that quietly
// does nothing is the same hollow gate this whole file exists to replace.
//
// What it does NOT do: read the console. It answers "did anything render",
// which is the question a blank page poses. A page that renders while logging
// errors is a different check and is not this one.

const EMPTY_ROOT = /<div id="root">\s*<\/div>/

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean)

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' })
    if (probe.status === 0) return { path: candidate, version: (probe.stdout || '').trim() }
  }
  return null
}

if (args.includes('--boot')) {
  const browser = findBrowser()
  if (!browser) {
    record(
      'SPA boots',
      false,
      [
        'no headless browser found, so this check could not run.',
        'Tried CHROME_PATH, google-chrome, google-chrome-stable, chromium,',
        'chromium-browser and the two macOS app paths.',
        'This is a failure rather than a skip on purpose: the outage this check',
        'exists for passed every other check in this file.',
      ].join('\n      '),
    )
  } else {
    const dump = spawnSync(
      browser.path,
      [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        // Lets scripts, and the MSAL redirect, actually run before the dump.
        '--virtual-time-budget=15000',
        '--dump-dom',
        `${base}/`,
      ],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    )

    const dom = dump.stdout ?? ''
    if (dump.status !== 0 && dom.length === 0) {
      record('SPA boots', false, `browser exited ${dump.status}: ${(dump.stderr ?? '').slice(0, 300)}`)
    } else if (EMPTY_ROOT.test(dom)) {
      record(
        'SPA boots',
        false,
        [
          `#root is still empty after the page ran (${dom.length} bytes of DOM).`,
          'The server is serving correctly and the app is not starting. Open the',
          'site and read the browser console; a bundler-level failure shows up',
          'there and nowhere else.',
        ].join('\n      '),
      )
    } else {
      record('SPA boots', true, `#root populated, ${dom.length} bytes of DOM after scripts ran`)
    }
  }
}

// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok)
console.log()
if (failed.length > 0) {
  console.error(`smoke: FAILED ${failed.length} of ${results.length}.`)
  process.exit(1)
}
console.log(`smoke: PASSED all ${results.length} checks. The deployed build is serving.`)

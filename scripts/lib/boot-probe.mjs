// The headless-browser half of `verify-deploy.mjs --boot`: load the deployed
// SPA and say whether its JavaScript actually started.
//
// It used to be `chrome --headless --virtual-time-budget=15000 --dump-dom`, and
// that stalled intermittently on a deploy (2026-10-23, 2026-10-25) and on a
// workstation. The cause is how the budget works: Chrome only advances virtual
// time while NO network fetch is pending, so a single request that is slow or
// never answers holds the dump back with no upper bound. Measured against a page
// whose script fetches an endpoint that never responds: the budget run was still
// waiting when killed at 40s, the same page without the budget dumped in 1.2s.
//
// And most of what a deployed page fetches is not ours. Unauthenticated, MSAL
// redirects to the Entra sign-in page, so the DOM that was dumped (84 KB) was
// Microsoft's sign-in page, waiting on its own CDN, telemetry and SSO probes.
// Any one of those hanging hung the check.
//
// So this does not wait for the network at all. It drives Chrome over the
// DevTools protocol on a pipe (no port, no npm dependency), navigates, and polls
// the live page on a wall-clock deadline until one of two things is true:
//
//   mounted     - still on the deployed origin and #root has children. React ran.
//   redirected  - the page navigated to another http(s) origin. Only the bundle's
//                 MSAL code sends it there, because `/` itself is served as 200
//                 HTML (verify-deploy's "SPA is served" checks that without
//                 following redirects), so leaving proves the bundle executed.
//
// Neither by the deadline is a failure, and the message says which way: #root
// still empty (the v1.8.2 blank screen), no #root at all, or the page never loaded.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const BOOT_DEADLINE_MS = 60_000
const POLL_MS = 250
// Time allowed for Chrome to exit after Browser.close before the whole process
// group is killed.
const CLOSE_GRACE_MS = 5_000

// The browser flags. A fresh profile per run, so no run can inherit a lock, a
// crash-restore prompt or a cache from another, and the background services that
// talk to Google on startup switched off, since none of them is the page.
export function chromeArgs(userDataDir) {
  return [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-extensions',
    '--remote-debugging-pipe',
    'about:blank',
  ]
}

// The pipe carries JSON messages each terminated by a NUL byte, and a chunk from
// the stream can hold several messages or part of one.
export function createFrameDecoder(onMessage) {
  let buffered = ''
  return (chunk) => {
    buffered += chunk.toString('utf8')
    let end
    while ((end = buffered.indexOf('\0')) >= 0) {
      const frame = buffered.slice(0, end)
      buffered = buffered.slice(end + 1)
      if (frame) onMessage(JSON.parse(frame))
    }
  }
}

// What the poll reads out of the page. Plain data, so classifyBoot is testable.
// rootChildren counts elements and non-blank text, the same thing the old
// empty-root regex treated as content; null means there is no #root at all.
export const SNAPSHOT_EXPRESSION = `(() => {
  const root = document.getElementById('root')
  return {
    href: location.href,
    readyState: document.readyState,
    rootChildren: root
      ? Array.from(root.childNodes).filter(
          (n) => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim() !== ''),
        ).length
      : null,
  }
})()`

function httpOrigin(href) {
  try {
    const u = new URL(href)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null
  } catch {
    return null
  }
}

// Decide from one snapshot. `waiting` means keep polling.
export function classifyBoot(startUrl, snapshot) {
  if (!snapshot) return { verdict: 'waiting' }
  const start = httpOrigin(startUrl)
  const here = httpOrigin(snapshot.href)
  if (here && here !== start) {
    return { verdict: 'redirected', host: new URL(snapshot.href).host }
  }
  if (here === start && snapshot.rootChildren > 0) {
    return { verdict: 'mounted', rootChildren: snapshot.rootChildren }
  }
  return { verdict: 'waiting' }
}

// The failure message for a page that was still `waiting` at the deadline, from
// the last snapshot taken.
export function describeTimeout(startUrl, snapshot, deadlineMs) {
  const secs = Math.round(deadlineMs / 1000)
  if (!snapshot) {
    return `the browser never returned a snapshot of the page within ${secs}s`
  }
  const here = httpOrigin(snapshot.href)
  if (!here) {
    return `the page never loaded within ${secs}s (browser is at ${snapshot.href})`
  }
  if (snapshot.rootChildren === null) {
    return `the page has no #root element after ${secs}s (readyState ${snapshot.readyState})`
  }
  return [
    `#root is still empty ${secs}s after navigating (readyState ${snapshot.readyState}).`,
    'The server is serving correctly and the app is not starting. Open the',
    'site and read the browser console; a bundler-level failure shows up',
    'there and nowhere else.',
  ].join('\n      ')
}

// Run the probe. Resolves to { ok, detail }; it never rejects and never outlives
// deadlineMs by more than the close grace, because a stuck browser must fail the
// check rather than hang the deploy job.
export async function probeBoot({ browserPath, url, deadlineMs = BOOT_DEADLINE_MS }) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'shf-boot-probe-'))
  // detached puts Chrome at the head of its own process group, so one kill
  // reaches the GPU, network and renderer helpers as well as the browser.
  const child = spawn(browserPath, chromeArgs(userDataDir), {
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
    detached: true,
  })
  let stderr = ''
  child.stderr.on('data', (d) => {
    if (stderr.length < 4000) stderr += d.toString('utf8')
  })
  const exited = new Promise((resolve) => child.once('exit', resolve))
  let spawnError = null
  child.once('error', (err) => {
    spawnError = err
  })

  const toChrome = child.stdio[3]
  const fromChrome = child.stdio[4]
  toChrome.on('error', () => {})
  let nextId = 1
  const pending = new Map()
  fromChrome.on(
    'data',
    createFrameDecoder((msg) => {
      const waiter = msg.id !== undefined && pending.get(msg.id)
      if (!waiter) return
      pending.delete(msg.id)
      if (msg.error) waiter.reject(new Error(msg.error.message))
      else waiter.resolve(msg.result)
    }),
  )
  function send(method, params = {}, sessionId) {
    const id = nextId++
    const frame = JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params })
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      toChrome.write(`${frame}\0`)
    })
  }

  const started = Date.now()
  const deadline = started + deadlineMs
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // The guards raced against the browser are unref'd, so a probe that finishes
  // early does not hold node open until the deadline. Measured before this: every
  // run passed in about a second and the script still took 60.2s to exit.
  const guard = (ms) => new Promise((r) => setTimeout(r, ms).unref())
  // Every protocol call is raced against the deadline, so a browser that stops
  // answering the pipe ends the probe on time too.
  const bounded = (promise) =>
    Promise.race([
      promise,
      guard(Math.max(0, deadline - Date.now())).then(() => {
        throw new Error('deadline')
      }),
    ])

  let result
  let last = null
  try {
    if (child.pid === undefined) throw new Error('spawn')
    const { targetId } = await bounded(send('Target.createTarget', { url: 'about:blank' }))
    const { sessionId } = await bounded(send('Target.attachToTarget', { targetId, flatten: true }))
    await bounded(send('Page.navigate', { url }, sessionId))

    while (Date.now() < deadline) {
      try {
        const res = await bounded(
          send('Runtime.evaluate', { expression: SNAPSHOT_EXPRESSION, returnByValue: true }, sessionId),
        )
        if (res?.result?.value) last = res.result.value
      } catch {
        // Mid-navigation the old document's context is gone and the new one is
        // not ready; that is an ordinary moment to keep polling through.
      }
      const c = classifyBoot(url, last)
      const secs = ((Date.now() - started) / 1000).toFixed(1)
      if (c.verdict === 'mounted') {
        result = { ok: true, detail: `#root populated (${c.rootChildren} children) ${secs}s after navigating` }
        break
      }
      if (c.verdict === 'redirected') {
        result = {
          ok: true,
          detail: `the bundle ran and redirected to ${c.host} ${secs}s after navigating (MSAL sign-in)`,
        }
        break
      }
      await sleep(POLL_MS)
    }
    if (!result) result = { ok: false, detail: describeTimeout(url, last, deadlineMs) }
  } catch (err) {
    if (spawnError || err.message === 'spawn') {
      result = { ok: false, detail: `could not start the browser: ${spawnError?.message ?? browserPath}` }
    } else if (err.message === 'deadline') {
      result = { ok: false, detail: describeTimeout(url, last, deadlineMs) }
    } else {
      result = {
        ok: false,
        detail: `browser failed before the page could be checked: ${err.message}. ${stderr.slice(0, 300)}`,
      }
    }
  } finally {
    for (const { reject } of pending.values()) reject(new Error('closed'))
    pending.clear()
    if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
      try {
        toChrome.write(`${JSON.stringify({ id: nextId++, method: 'Browser.close', params: {} })}\0`)
      } catch {
        // The pipe may already be gone; the kill below covers it.
      }
      const closed = await Promise.race([exited.then(() => true), guard(CLOSE_GRACE_MS).then(() => false)])
      if (!closed) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          // Already gone between the check and the kill.
        }
        await Promise.race([exited, guard(CLOSE_GRACE_MS)])
      }
    }
    child.stdio.forEach((s) => s?.destroy?.())
    rmSync(userDataDir, { recursive: true, force: true })
  }
  return result
}

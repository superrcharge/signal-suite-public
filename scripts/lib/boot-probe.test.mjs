// Unit tests for the boot probe's decisions.
//
// The verdicts matter in both directions. A false pass is the hollow gate
// verify-deploy exists to replace (v1.8.2's blank screen), and a probe that waits
// on the network is the stall that held two deploys, so each way out of
// classifyBoot, and the flags that keep the network out of it, get a test.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { chromeArgs, classifyBoot, createFrameDecoder, describeTimeout } from './boot-probe.mjs'

const URL_ = 'https://asset-tracker.example.test/'

// ---------------------------------------------------------------------------
// classifyBoot
// ---------------------------------------------------------------------------

test('mounted when still on the deployed origin and #root has content', () => {
  const c = classifyBoot(URL_, { href: URL_, readyState: 'complete', rootChildren: 2 })
  assert.equal(c.verdict, 'mounted')
})

test('redirected when the page moved to another http(s) origin', () => {
  const c = classifyBoot(URL_, {
    href: 'https://login.microsoftonline.us/tenant/oauth2/v2.0/authorize?x=1',
    readyState: 'loading',
    rootChildren: null,
  })
  assert.equal(c.verdict, 'redirected')
  assert.equal(c.host, 'login.microsoftonline.us')
})

test('waits, never passes, on an empty #root (the v1.8.2 blank screen)', () => {
  const c = classifyBoot(URL_, { href: URL_, readyState: 'complete', rootChildren: 0 })
  assert.equal(c.verdict, 'waiting')
})

test('waits, never passes, when the deployed page has no #root', () => {
  const c = classifyBoot(URL_, { href: URL_, readyState: 'complete', rootChildren: null })
  assert.equal(c.verdict, 'waiting')
})

test('a Chrome error page is not a redirect', () => {
  const c = classifyBoot(URL_, { href: 'chrome-error://chromewebdata/', readyState: 'complete', rootChildren: null })
  assert.equal(c.verdict, 'waiting')
})

test('about:blank before the navigation commits is not a redirect', () => {
  const c = classifyBoot(URL_, { href: 'about:blank', readyState: 'complete', rootChildren: null })
  assert.equal(c.verdict, 'waiting')
})

test('a different path on the same origin is not a redirect', () => {
  const c = classifyBoot(URL_, { href: `${URL_}login`, readyState: 'complete', rootChildren: 0 })
  assert.equal(c.verdict, 'waiting')
})

test('a missing snapshot waits', () => {
  assert.equal(classifyBoot(URL_, null).verdict, 'waiting')
})

// ---------------------------------------------------------------------------
// describeTimeout
// ---------------------------------------------------------------------------

test('timeout on an empty #root names the blank-screen failure', () => {
  const d = describeTimeout(URL_, { href: URL_, readyState: 'complete', rootChildren: 0 }, 60_000)
  assert.match(d, /#root is still empty 60s/)
  assert.match(d, /browser console/)
})

test('timeout on an error page says the page never loaded', () => {
  const d = describeTimeout(URL_, { href: 'chrome-error://chromewebdata/', readyState: 'complete', rootChildren: null }, 5_000)
  assert.match(d, /never loaded within 5s/)
})

test('timeout with no #root says so', () => {
  const d = describeTimeout(URL_, { href: URL_, readyState: 'complete', rootChildren: null }, 5_000)
  assert.match(d, /no #root element/)
})

test('timeout with no snapshot at all says so', () => {
  assert.match(describeTimeout(URL_, null, 5_000), /never returned a snapshot/)
})

// ---------------------------------------------------------------------------
// chromeArgs
// ---------------------------------------------------------------------------

test('never waits on the network: no virtual-time budget and no --dump-dom', () => {
  const a = chromeArgs('/tmp/x')
  assert.ok(!a.some((f) => f.startsWith('--virtual-time-budget')), a.join(' '))
  assert.ok(!a.includes('--dump-dom'), a.join(' '))
})

test('drives the page over the DevTools pipe with a profile of its own', () => {
  const a = chromeArgs('/tmp/shf-boot-probe-abc')
  assert.ok(a.includes('--remote-debugging-pipe'))
  assert.ok(a.includes('--user-data-dir=/tmp/shf-boot-probe-abc'))
  assert.ok(a.includes('--headless'))
})

// ---------------------------------------------------------------------------
// createFrameDecoder
// ---------------------------------------------------------------------------

test('decodes several NUL-terminated messages from one chunk', () => {
  const got = []
  const feed = createFrameDecoder((m) => got.push(m))
  feed(Buffer.from('{"id":1}\0{"id":2}\0'))
  assert.deepEqual(got, [{ id: 1 }, { id: 2 }])
})

test('holds a partial message until the rest arrives', () => {
  const got = []
  const feed = createFrameDecoder((m) => got.push(m))
  feed(Buffer.from('{"id":1,"res'))
  assert.deepEqual(got, [])
  feed(Buffer.from('ult":{}}\0'))
  assert.deepEqual(got, [{ id: 1, result: {} }])
})

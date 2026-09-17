// Unit tests for the receipt reuse decision.
//
// The refusals matter more than the hit. Reusing a receipt that does not
// describe the tree lets unverified code reach a push, and nothing downstream
// reports it, so every way a receipt can be wrong gets a test here.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { receiptDecision } from './receipt.mjs'

const DIGEST = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

// ---------------------------------------------------------------------------
// The one case that reuses
// ---------------------------------------------------------------------------

test('reuses on an exact digest match', () => {
  const d = receiptDecision(
    { digest: DIGEST, timestamp: '2026-09-03T03:36:10.823Z', backend: 'container (podman exec app)' },
    DIGEST,
  )
  assert.equal(d.reuse, true)
  assert.match(d.reason, /2026-09-03/)
  assert.match(d.reason, /container/)
})

test('still reuses when the receipt omits timestamp and backend', () => {
  const d = receiptDecision({ digest: DIGEST }, DIGEST)
  assert.equal(d.reuse, true)
})

// ---------------------------------------------------------------------------
// Everything that must fall back to a full run
// ---------------------------------------------------------------------------

test('refuses when the tree changed', () => {
  const d = receiptDecision({ digest: OTHER }, DIGEST)
  assert.equal(d.reuse, false)
  assert.match(d.reason, /tree changed/)
})

for (const [label, receipt] of [
  ['null (file absent or unreadable)', null],
  ['undefined', undefined],
  ['a non-object', 'not json'],
  ['an array', []],
]) {
  test(`refuses on ${label}`, () => {
    assert.equal(receiptDecision(receipt, DIGEST).reuse, false)
  })
}

// The trap this module exists to avoid: `undefined === undefined` is true, so a
// naive comparison treats a receipt with no digest as a match against a tree
// whose digest also failed to compute, and waves the push through.
test('refuses a receipt with no digest field, even against an undefined digest', () => {
  assert.equal(receiptDecision({ timestamp: 'x' }, undefined).reuse, false)
  assert.equal(receiptDecision({}, undefined).reuse, false)
})

test('refuses a non-string or empty digest on either side', () => {
  assert.equal(receiptDecision({ digest: 123 }, DIGEST).reuse, false)
  assert.equal(receiptDecision({ digest: '' }, DIGEST).reuse, false)
  assert.equal(receiptDecision({ digest: DIGEST }, '').reuse, false)
  assert.equal(receiptDecision({ digest: DIGEST }, null).reuse, false)
})

test('every refusal explains itself', () => {
  for (const d of [
    receiptDecision(null, DIGEST),
    receiptDecision({}, DIGEST),
    receiptDecision({ digest: OTHER }, DIGEST),
    receiptDecision({ digest: DIGEST }, ''),
  ]) {
    assert.equal(d.reuse, false)
    assert.ok(d.reason.length > 0, 'a refusal with no reason is unactionable')
  }
})

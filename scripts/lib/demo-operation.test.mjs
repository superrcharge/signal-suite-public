// Unit tests for the Silent Harbor demo data.
//
// Both directions: the shipped data must validate clean, and each rule of
// validateDemo must actually fire when its invariant is broken, because a
// validator that never reports anything looks identical to a sound dataset.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { DEFAULT_LEAVE_OUT, DEMO, leaveOut, validateDemo } from './demo-operation.mjs'

const copy = () => structuredClone(DEMO)
const unitOf = (d, label) => d.units.find((u) => u.label === label)
const reports = (d, fragment) => validateDemo(d).some((p) => p.includes(fragment))

test('DEMO validates clean', () => {
  assert.deepEqual(validateDemo(DEMO), [])
})

test('DEMO has 13 units, 4 phases and 8 sites', () => {
  assert.equal(DEMO.units.length, 13)
  assert.equal(DEMO.phases.length, 4)
  assert.equal(DEMO.sites.length, 8)
})

test('leaveOut on the default pair validates clean and drops everything naming them', () => {
  const d = leaveOut(DEMO, DEFAULT_LEAVE_OUT)
  assert.deepEqual(validateDemo(d), [])
  assert.equal(d.units.length, 11)
  for (const plan of Object.values(d.plans)) {
    for (const [a, b] of plan.requirements) {
      assert.ok(![a, b].some((l) => DEFAULT_LEAVE_OUT.includes(l)))
    }
  }
  const aoo = d.plans['Actions on Objective']
  assert.ok(!('TF WHITE' in aoo.placements))
  assert.ok(!('CAS' in aoo.placements))
  assert.equal(Object.keys(aoo.placements).length, 11)
  assert.equal(aoo.requirements.length, 13)
})

test('leaveOut does not mutate its input', () => {
  const before = JSON.stringify(DEMO)
  leaveOut(DEMO, DEFAULT_LEAVE_OUT)
  assert.equal(JSON.stringify(DEMO), before)
})

test('leaveOut nulls a tier that names a left-out unit', () => {
  const d = leaveOut(DEMO, ['TF GREEN'])
  for (const plan of Object.values(d.plans)) assert.equal(plan.tier, null)
  assert.deepEqual(validateDemo(d), [])
})

test('reports a duplicate label', () => {
  const d = copy()
  d.units[1].label = d.units[0].label
  assert.ok(reports(d, 'duplicate unit label'))
})

test('reports an asset_phases key the unit does not bring', () => {
  const d = copy()
  unitOf(d, 'TF GREEN').asset_phases['prc-152'] = ['Infil']
  assert.ok(reports(d, 'which the unit does not bring'))
})

test('reports an unknown phase in asset_phases', () => {
  const d = copy()
  unitOf(d, 'TF GREEN').asset_phases.mpu5 = ['Nowhere']
  assert.ok(reports(d, 'unknown phase Nowhere'))
})

test('reports an unknown phase in plans', () => {
  const d = copy()
  d.plans.Nowhere = { tier: null, placements: {}, requirements: [] }
  assert.ok(reports(d, 'unknown phase Nowhere'))
})

test('reports a tier that is not a unit', () => {
  const d = copy()
  d.plans.Staging.tier = 'NOBODY'
  assert.ok(reports(d, 'tier NOBODY'))
})

test('reports an unknown placement site', () => {
  const d = copy()
  d.plans.Staging.placements.JOC = 'Atlantis'
  assert.ok(reports(d, 'unknown site Atlantis'))
})

test('reports a placement naming no unit', () => {
  const d = copy()
  d.plans.Staging.placements.NOBODY = 'ISB'
  assert.ok(reports(d, 'placement names unknown unit NOBODY'))
})

test('reports a requirement naming no unit', () => {
  const d = copy()
  d.plans.Staging.requirements.push(['JOC', 'NOBODY'])
  assert.ok(reports(d, 'requirement names unknown unit NOBODY'))
})

test('reports a requirement pairing a unit with itself', () => {
  const d = copy()
  d.plans.Staging.requirements.push(['JOC', 'JOC'])
  assert.ok(reports(d, 'with itself'))
})

test('reports an organization_key outside the nine placeholders', () => {
  const d = copy()
  unitOf(d, 'TF GREEN').organization_key = 'teal'
  assert.ok(reports(d, 'not a placeholder key'))
})

test('reports a unit with both organization_key and adhoc', () => {
  const d = copy()
  unitOf(d, 'TF GREEN').adhoc = { name: 'X', short_label: 'X', branch: '', color: '#000000' }
  assert.ok(reports(d, 'exactly one of'))
})

test('reports a unit with neither organization_key nor adhoc', () => {
  const d = copy()
  delete unitOf(d, 'TF GREEN').organization_key
  assert.ok(reports(d, 'exactly one of'))
})

test('reports an unknown platform, equipment id and transport', () => {
  const d = copy()
  const u = unitOf(d, 'TF GREEN')
  u.platforms.push('X-99')
  u.equipment.push('no-such-radio')
  u.transports.push('Carrier Pigeon')
  assert.ok(reports(d, 'unknown platform X-99'))
  assert.ok(reports(d, 'unknown equipment no-such-radio'))
  assert.ok(reports(d, 'unknown transport Carrier Pigeon'))
})

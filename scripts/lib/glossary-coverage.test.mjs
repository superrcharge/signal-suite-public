// Unit tests for the glossary coverage check, in both directions: a value
// with no glossary row must be reported, and the shapes the real glossary
// uses to define several terms in one row must count.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { glossaryTerms, goSliceValues, goStringConsts, missingTerms, normalise } from './glossary-coverage.mjs'

const GO = `package kit

const (
	TypeRemote = "remote"
	TypeIFK    = "ifk" // inline comment
	TypeATK    = "atk"
)

type Status string

const Available Status = "available"

var ValidTypes = []string{
	TypeRemote,
	TypeIFK, // trailing comment
	TypeATK,
}

var Branches = []string{"USA", "USMC"}
var Mixed = []Status{Available, "custom"}
`

test('goStringConsts reads const blocks, typed consts and inline comments', () => {
  const c = goStringConsts(GO)
  assert.equal(c.get('TypeIFK'), 'ifk')
  assert.equal(c.get('Available'), 'available')
})

test('goSliceValues resolves identifiers and literals', () => {
  assert.deepEqual(goSliceValues(GO, 'ValidTypes'), ['remote', 'ifk', 'atk'])
  assert.deepEqual(goSliceValues(GO, 'Branches'), ['USA', 'USMC'])
  assert.deepEqual(goSliceValues(GO, 'Mixed'), ['available', 'custom'])
})

test('goSliceValues handles CRLF', () => {
  assert.deepEqual(goSliceValues(GO.replace(/\n/g, '\r\n'), 'ValidTypes'), ['remote', 'ifk', 'atk'])
})

test('goSliceValues fails loudly rather than returning nothing', () => {
  assert.throws(() => goSliceValues(GO, 'Nope'), /no `var Nope/)
  assert.throws(() => goSliceValues('var X = []string{Unknown}', 'X'), /cannot resolve `Unknown`/)
  assert.throws(() => goSliceValues('var X = []string{}', 'X'), /is empty/)
})

test('normalise folds case and punctuation', () => {
  assert.equal(normalise('alert-blue'), 'alertblue')
  assert.equal(normalise('ALERT  BLUE'), 'alertblue')
  assert.equal(normalise('OW-7'), normalise('ow7'))
  assert.equal(normalise('SPT'), 'spt')
})

const MD = `# Glossary

| Term | Meaning | Where |
|---|---|---|
| **ALERT, ALERT BLUE, ALERT GREEN** (statuses) | ... | Terminals |
| AAA / BBB / CCC | ... | Deploy |
| \`admin\` and \`editor\` | ... | Users |
| On mission | ... | Terminals |

Prose mentioning IFK does not define it.
`

test('glossaryTerms splits multi-term rows and ignores the header and prose', () => {
  const t = glossaryTerms(MD)
  for (const want of ['alert', 'alert blue', 'alert green', 'statuses', 'aaa', 'admin', 'editor', 'on mission']) {
    assert.ok(t.has(normalise(want)), `expected ${want}`)
  }
  assert.ok(!t.has('term'))
  assert.ok(!t.has('ifk'))
})

test('a "Label: a, b" row defines each listed value', () => {
  const t = glossaryTerms('| Platform type: aircraft, ground vehicle | ... |\n')
  assert.ok(t.has(normalise('ground vehicle')))
  assert.ok(t.has(normalise('aircraft')))
})

test('missingTerms reports only values with no row', () => {
  const t = glossaryTerms(MD)
  const missing = missingTerms(t, [
    { vocabulary: 'status', values: ['alert-blue', 'on-mission', 'inop'] },
    { vocabulary: 'role', values: ['admin', 'viewer'] },
  ])
  assert.deepEqual(missing, [
    { vocabulary: 'status', value: 'inop' },
    { vocabulary: 'role', value: 'viewer' },
  ])
})

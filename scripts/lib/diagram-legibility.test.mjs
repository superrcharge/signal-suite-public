// Unit tests for the diagram legibility check, in both directions: a
// diagram too wide for its smallest text fails, one that fits passes, and the
// readers refuse to guess when their input does not have the expected shape.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  MIN_TEXT_PX,
  literalSizes,
  maxWidth,
  renderedPx,
  smallestTokenSize,
  viewBoxWidth,
} from './diagram-legibility.mjs'

const TOKENS = `#let tokens = (
  pad-inside-shape:       10pt,
  size-label:     11pt,
  size-caption:   11pt,
  size-body:      12pt,
  size-title:     13.5pt,
  label-sep:        10pt,
  label-size:       11pt,
)`

test('smallestTokenSize reads size-* and label-size, and ignores other pt tokens', () => {
  assert.equal(smallestTokenSize(TOKENS), 11)
  assert.equal(smallestTokenSize(TOKENS.replace('label-size:       11pt', 'label-size:       9.5pt')), 9.5)
  // pad-inside-shape and label-sep are pt values but not text sizes
  assert.equal(smallestTokenSize('  pad: 2pt,\n  size-label: 11pt,'), 11)
})

test('smallestTokenSize refuses a file with no size tokens', () => {
  assert.throws(() => smallestTokenSize('#let tokens = (pad: 2pt)'), /no size-\*/)
})

test('viewBoxWidth reads the third viewBox number', () => {
  assert.equal(viewBoxWidth('<svg class="typst-doc" viewBox="0 0 824.5 1150" xmlns="x">'), 824.5)
  assert.equal(viewBoxWidth('<svg xmlns="x"><g/></svg>'), null)
})

test('the real regression: 9pt labels at 1627 units is unreadable, 11pt at 824 is not', () => {
  assert.ok(renderedPx(9, 1627) < MIN_TEXT_PX)
  assert.ok(renderedPx(11, 824) >= MIN_TEXT_PX)
  assert.equal(Math.round(maxWidth(11)), 838)
})

test('literalSizes finds size literals and skips comments and tokens', () => {
  const src = [
    '// size: 9pt in a comment is fine',
    'text(size: tokens.size-label, x)',
    'text(size: 9pt, x)',
    '  text(size:1.2em, y)',
  ].join('\n')
  assert.deepEqual(
    literalSizes(src).map((l) => l.line),
    [3, 4],
  )
})

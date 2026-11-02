// Unit tests for the readers behind check-docs.mjs's `catalog-lookup copies
// match the app` step, in both directions: a copy that disagrees with its
// source must be reported, and the differences a copy is allowed - band
// order, formatting, the String() wrapper round slugify's input - must not.
//
// The fixtures are trimmed from the real files, so a reader that passes here
// is reading the shapes it will meet.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  arrowFunction,
  bandEnums,
  disagreements,
  goMaxTag,
  goTemplateKeys,
  numberConst,
  stringArray,
  tokens,
  verified,
} from './catalog-lookup-copies.mjs'

const VOCAB = `// Shared vocabularies.
export const SATCOM_BAND_OPTS = ['S', 'C', 'X', 'Ku', 'K', 'Ka'];
export const RADIO_BAND_OPTS = ['L', 'S', 'C', 'HF', 'UHF', 'VHF'];
export const ORBIT_OPTS: readonly string[] = [
  'GEO', // geostationary
  "MEO",
  'LEO',
] as const;
export const OPMODE_OPTS_OLD = ['fixed'];
export const OPMODE_OPTS = ['COTM', 'COTP'];
`

const WORKFLOW = `export const meta = { name: 'catalog-lookup' }

// The editor's Operational Mode options (OPMODE_OPTS in catalog-vocab.ts).
const OPMODE_OPTS = ['COTM', 'COTP']

const EQUIPMENT_KEYS = ['id', 'nomenclature', 'terminal_type', 'nickname', 'make', 'one_liner', 'doc_number', 'operational_mode']
const WAVEFORM_KEYS = ['abbrev', 'name', 'description']

const NOMENCLATURE_MAX = 200
const WAVEFORM_ABBREV_MAX = 50

// The editor's ID rule, verbatim.
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

// Verified fields require sources.
const VF = (valueSchema) => ({ type: 'object', properties: { value: valueSchema } })

function buildSchemaSpectrum(terminalType, library) {
  const waveformProps = {
    abbrev: { type: 'string', description: \`at most \${WAVEFORM_ABBREV_MAX} characters\` },
  }
  const bandEnum = terminalType === 'satcom'
    ? ['S', 'C', 'X', 'Ku', 'K', 'Ka']
    : ['HF', 'VHF', 'UHF', 'L', 'S', 'C']
  return { band: { type: 'string', enum: bandEnum } }
}
`

const EDITOR = `import { useState } from 'react';

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);


// Draft type
export function Hint() {
  return <p>Don't name it twice; it's derived from the nomenclature.</p>;
}
`

const CSV_GO = `package equipment

// csvTable is the single declaration, with a { brace in a comment.
var csvTable = csvtable.Table[Equipment]{
	Domain:   "EQUIPMENT",
	Identity: "id",
	Preamble: []string{
		"REQUIRED: id, nomenclature and terminal_type. A } brace in a string.",
	},

	Columns: []csvtable.Column[Equipment]{
		{
			// Set: in a comment is not a Set.
			Key: "id", Label: "ID", Required: true,
			Get:     csvtable.Str(func(e *Equipment) string { return e.ID }),
			Set:     csvtable.SetStr(func(e *Equipment, v string) { e.ID = strings.ToLower(v) }),
			Example: []string{"example-radio-1", "example-terminal-1"},
		},
		{
			Key: "terminal_type", Label: "Type", Required: true,
			Enum: []string{TerminalTypeSATCOM, TerminalTypeRadio}, EnumFold: true,
			Get:  csvtable.Str(func(e *Equipment) string { return e.TerminalType }),
			Set:  csvtable.SetStr(func(e *Equipment, v string) { e.TerminalType = v }),
		},
		{
			Key: "operational_mode", Label: "Operational Mode",
			Set: func(e *Equipment, v string) error {
				e.OperationalMode = splitModes(v) // "}" in a comment
				return nil
			},
		},
		{
			// Export-only: a photo is uploaded, not named in a spreadsheet.
			Key: "photo_url", Label: "Photo URL",
			Get: csvtable.PtrStr(func(e *Equipment) *string { return e.PhotoURL }),
		},
		{
			Key: \`legacy\`, Set: nil,
		},

		// Server-owned.
		{
			Key: "created_by", Label: "Created By",
			Get: csvtable.Str(func(e *Equipment) string { return e.CreatedBy }),
		},
	},
}

func helper() { _ = csvtable.Column[Equipment]{Key: "later", Set: nil} }
`

const DTO_GO = `package dto

type CreateEquipmentRequest struct {
	ID           string  \`json:"id"           validate:"required,min=1,max=100"\`
	Nomenclature string  \`json:"nomenclature" validate:"required,min=1,max=200"\`
	Nickname     *string \`json:"nickname"\`
}

type UpdateEquipmentRequest struct {
	Nomenclature *string \`json:"nomenclature,omitempty" validate:"omitempty,min=1,max=200"\`
	ID           string  \`json:"-" validate:"required"\`
}
`

// ---------------------------------------------------------------------------
// The lexer
// ---------------------------------------------------------------------------

const kinds = (src, lang) => [...tokens(src, lang)].map((t) => `${t.kind}:${t.text}`)

test('tells a regex literal from a division', () => {
  assert.deepEqual(kinds("x.replace(/a\\/b[/]/g, '-')", 'js'), [
    'ident:x', 'punct:.', 'ident:replace', 'punct:(', 'regex:/a\\/b[/]/g', 'punct:,', "string:'-'", 'punct:)',
  ])
  assert.deepEqual(kinds('a / b / c', 'js'), ['ident:a', 'punct:/', 'ident:b', 'punct:/', 'ident:c'])
  assert.deepEqual(kinds('return /x/', 'js'), ['ident:return', 'regex:/x/'])
})

test('keeps strings whole, escapes included, and drops comments', () => {
  assert.deepEqual(kinds(`'it\\'s' /* a */ "q\\"" // b`, 'js'), ["string:'it\\'s'", 'string:"q\\""'])
})

test('a Go backquote string is raw', () => {
  assert.deepEqual(kinds('x := `C:\\path` + "\\""', 'go'), [
    'ident:x', 'punct::', 'punct:=', 'string:`C:\\path`', 'punct:+', 'string:"\\""',
  ])
})

test('an unterminated literal fails loudly', () => {
  assert.throws(() => [...tokens("'open", 'js')], /unterminated string/)
  assert.throws(() => [...tokens('x(/open', 'js')], /unterminated regex/)
  assert.throws(() => [...tokens('/* open', 'go')], /unterminated comment/)
})

// ---------------------------------------------------------------------------
// JavaScript and TypeScript readers
// ---------------------------------------------------------------------------

test('stringArray reads exports, annotations, comments, trailing commas and as const', () => {
  assert.deepEqual(stringArray(VOCAB, 'SATCOM_BAND_OPTS'), ['S', 'C', 'X', 'Ku', 'K', 'Ka'])
  assert.deepEqual(stringArray(VOCAB, 'ORBIT_OPTS'), ['GEO', 'MEO', 'LEO'])
  assert.deepEqual(stringArray(WORKFLOW, 'OPMODE_OPTS'), ['COTM', 'COTP'])
  assert.deepEqual(stringArray(WORKFLOW, 'WAVEFORM_KEYS'), ['abbrev', 'name', 'description'])
})

test('stringArray does not mistake a longer name for the one asked for', () => {
  assert.deepEqual(stringArray(VOCAB, 'OPMODE_OPTS'), ['COTM', 'COTP'])
})

test('stringArray handles CRLF', () => {
  assert.deepEqual(stringArray(VOCAB.replace(/\n/g, '\r\n'), 'ORBIT_OPTS'), ['GEO', 'MEO', 'LEO'])
})

test('stringArray fails loudly rather than returning nothing', () => {
  assert.throws(() => stringArray(VOCAB, 'NOPE'), /no `const NOPE = \.\.\.` declaration/)
  assert.throws(() => stringArray("const X = [A, 'b']", 'X'), /holds `A`, which is not a string literal/)
  assert.throws(() => stringArray('const X = []', 'X'), /X is empty/)
  assert.throws(() => stringArray("const X = ['a'", 'X'), /never closed/)
  assert.throws(() => stringArray("const X = makeList('a')", 'X'), /expected `\[` to open X's array/)
  assert.throws(() => stringArray("// const X = ['a']", 'X'), /no `const X/)
})

test('numberConst reads an integer and refuses an expression', () => {
  assert.equal(numberConst(WORKFLOW, 'NOMENCLATURE_MAX'), 200)
  assert.equal(numberConst(WORKFLOW, 'WAVEFORM_ABBREV_MAX'), 50)
  assert.equal(numberConst('const N = 7;', 'N'), 7)
  assert.throws(() => numberConst('const N = 100 * 2', 'N'), /is an expression/)
  assert.throws(() => numberConst("const N = '200'", 'N'), /not an integer literal/)
  assert.throws(() => numberConst('const M = 1', 'N'), /no `const N/)
})

test('bandEnums reads both lists, whichever way round the condition is', () => {
  assert.deepEqual(bandEnums(WORKFLOW), {
    satcom: ['S', 'C', 'X', 'Ku', 'K', 'Ka'],
    radio: ['HF', 'VHF', 'UHF', 'L', 'S', 'C'],
  })
  const flipped = "const bandEnum = terminalType === 'radio' ? ['HF'] : ['Ka']"
  assert.deepEqual(bandEnums(flipped), { satcom: ['Ka'], radio: ['HF'] })
})

test('bandEnums fails loudly when the shape moves', () => {
  assert.throws(() => bandEnums('const bands = []'), /no `const bandEnum/)
  assert.throws(() => bandEnums("const bandEnum = ['S']"), /not a `condition \? \[\.\.\.\] : \[\.\.\.\]` ternary/)
  assert.throws(() => bandEnums("const bandEnum = kind === 'satcom' ? ['S'] : ['HF']"), /condition is `kind === 'satcom'`/)
  assert.throws(() => bandEnums("const bandEnum = terminalType === 'satcom' ? SATCOM : ['HF']"), /expected `\[`/)
})

test('arrowFunction reads the editor and the workflow forms as the same function', () => {
  const editor = arrowFunction(EDITOR, 'slugify')
  const copy = arrowFunction(WORKFLOW, 'slugify')
  assert.equal(editor.text, "s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)")
  assert.equal(copy.text, "String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)")
  assert.equal(copy.canonical, editor.canonical)
})

test('arrowFunction ignores formatting, comments, annotations and the parameter name', () => {
  const editor = arrowFunction(EDITOR, 'slugify').canonical
  const reformatted = `const slugify = (text: string): string =>
  text
    .toLowerCase() // case first
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);`
  assert.equal(arrowFunction(reformatted, 'slugify').canonical, editor)
})

test('arrowFunction tells apart every change that would change an id', () => {
  const editor = arrowFunction(EDITOR, 'slugify').canonical
  const variants = [
    "const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)",
    "const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^-+|-+$/g, '').slice(0, 80)",
    "const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)",
    "const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80)",
    "const slugify = (s) => s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)",
    "const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)",
    "const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' -').replace(/^-+|-+$/g, '').slice(0, 80)",
    "const slugify = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)",
  ]
  for (const v of variants) assert.notEqual(arrowFunction(v, 'slugify').canonical, editor, v)
})

test('arrowFunction fails loudly when the shape moves', () => {
  assert.throws(() => arrowFunction(VOCAB, 'slugify'), /no `const slugify/)
  assert.throws(() => arrowFunction('const slugify = makeSlugger()', 'slugify'), /expected `\(`/)
  assert.throws(() => arrowFunction('const slugify = (s, n) => s', 'slugify'), /exactly one parameter/)
  assert.throws(() => arrowFunction('const slugify = (s) =>\n', 'slugify'), /has no body/)
})

// ---------------------------------------------------------------------------
// Go readers
// ---------------------------------------------------------------------------

test('goTemplateKeys returns the columns carrying a Set, in declaration order', () => {
  assert.deepEqual(goTemplateKeys(CSV_GO), ['id', 'terminal_type', 'operational_mode'])
})

test('goTemplateKeys handles CRLF', () => {
  assert.deepEqual(goTemplateKeys(CSV_GO.replace(/\n/g, '\r\n')), ['id', 'terminal_type', 'operational_mode'])
})

test('goTemplateKeys counts a raw-string Key and a Set added to an export-only column', () => {
  const src = CSV_GO.replace('Key: `legacy`, Set: nil,', 'Key: `legacy`, Set: csvtable.SetStr(nil),')
  assert.deepEqual(goTemplateKeys(src), ['id', 'terminal_type', 'operational_mode', 'legacy'])
})

test('goTemplateKeys fails loudly rather than returning nothing', () => {
  assert.throws(() => goTemplateKeys('package x'), /no `var csvTable/)
  assert.throws(() => goTemplateKeys('var csvTable = csvtable.Table[T]{ Domain: "X" }'), /no `Columns:` field/)
  assert.throws(
    () => goTemplateKeys('var csvTable = csvtable.Table[T]{ Columns: []csvtable.Column[T]{ { Key: KeyID, Set: s } } }'),
    /has no `Key: "\.\.\."` string literal/,
  )
  assert.throws(
    () => goTemplateKeys('var csvTable = csvtable.Table[T]{ Columns: []csvtable.Column[T]{ { Key: "id" } } }'),
    /no column with a Set/,
  )
  assert.throws(() => goTemplateKeys('var csvTable = csvtable.Table[T]{ Columns: []csvtable.Column[T]{ { Key: "id"'), /never closed/)
})

test('goMaxTag reads the one limit every request agrees on', () => {
  assert.equal(goMaxTag(DTO_GO, 'nomenclature'), 200)
  assert.equal(goMaxTag(DTO_GO, 'id'), 100)
})

test('goMaxTag refuses requests that disagree, and a field with no limit', () => {
  const split = DTO_GO.replace('omitempty,min=1,max=200', 'omitempty,min=1,max=150')
  assert.throws(
    () => goMaxTag(split, 'nomenclature'),
    /max=200 on CreateEquipmentRequest, max=150 on UpdateEquipmentRequest/,
  )
  assert.throws(() => goMaxTag(DTO_GO, 'nickname'), /no field tagged json:"nickname" carries a validate max=/)
})

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

const RADIO = 'RADIO_BAND_OPTS in catalog-vocab.ts'

test('the real drift: a radio enum without S and C is reported by name', () => {
  const problems = disagreements([
    { copy: 'the radio band enum', source: RADIO, compare: 'set', copied: ['HF', 'VHF', 'UHF', 'L'], truth: ['L', 'S', 'C', 'HF', 'UHF', 'VHF'] },
  ])
  assert.deepEqual(problems, [`the radio band enum lacks S, C, which ${RADIO} has`])
})

test('a band enum in another order is not a disagreement', () => {
  const pair = { copy: 'the radio band enum', source: RADIO, compare: 'set', copied: ['HF', 'VHF', 'UHF', 'L', 'S', 'C'], truth: ['L', 'S', 'C', 'HF', 'UHF', 'VHF'] }
  assert.deepEqual(disagreements([pair]), [])
  assert.equal(verified(pair), '{L, S, C, HF, UHF, VHF}')
})

test('a band the editor does not offer is reported too', () => {
  const problems = disagreements([
    { copy: 'the satcom band enum', source: 'SATCOM_BAND_OPTS', compare: 'set', copied: ['S', 'C', 'X', 'Ku', 'K', 'Ka', 'Q'], truth: ['S', 'C', 'X', 'Ku', 'K', 'Ka'] },
  ])
  assert.deepEqual(problems, ['the satcom band enum has Q, which SATCOM_BAND_OPTS does not'])
})

test('a list compares in order', () => {
  const pair = (copied) => ({ copy: 'WAVEFORM_KEYS', source: 'the template', compare: 'list', copied, truth: ['abbrev', 'name', 'description'] })
  assert.deepEqual(disagreements([pair(['abbrev', 'name', 'description'])]), [])
  assert.deepEqual(disagreements([pair(['name', 'abbrev', 'description'])]), [
    'WAVEFORM_KEYS is [name, abbrev, description], but the template is [abbrev, name, description]',
  ])
  assert.deepEqual(disagreements([pair(['abbrev', 'name'])]), ['WAVEFORM_KEYS lacks description, which the template has'])
  assert.deepEqual(disagreements([pair(['id', 'abbrev', 'name', 'description'])]), ['WAVEFORM_KEYS has id, which the template does not'])
  assert.equal(verified(pair([])), '[abbrev, name, description]')
})

test('a value and an expression compare exactly', () => {
  assert.deepEqual(disagreements([{ copy: 'NOMENCLATURE_MAX', source: 'max=', compare: 'value', copied: 200, truth: 200 }]), [])
  assert.deepEqual(disagreements([{ copy: 'NOMENCLATURE_MAX', source: 'max=', compare: 'value', copied: 150, truth: 200 }]), [
    'NOMENCLATURE_MAX is 150, but max= is 200',
  ])
  const editor = arrowFunction(EDITOR, 'slugify')
  const drifted = arrowFunction(WORKFLOW.replace('slice(0, 80)', 'slice(0, 64)'), 'slugify')
  assert.deepEqual(disagreements([{ copy: 'slugify', source: 'the editor', compare: 'expression', copied: arrowFunction(WORKFLOW, 'slugify'), truth: editor }]), [])
  const [problem] = disagreements([{ copy: 'slugify', source: 'the editor', compare: 'expression', copied: drifted, truth: editor }])
  assert.match(problem, /slice\(0, 64\)[\s\S]*slice\(0, 80\)/)
})

// Holds the catalog-lookup workflow's copies of app facts to their sources.
//
// A workflow script is self-contained: .claude/workflows/catalog-lookup.js
// cannot import from the frontend or the Go code, so it copies what it needs.
// The editor's Operational Mode and band options, the two import templates'
// column keys, two request length limits and the editor's id rule all sit in
// it as literals, and each one is a fact that can drift with nothing noticing.
// The radio band enum lacked S and C for as long as the editor offered them,
// which a 16-radio lookup on 2026-09-30 ran into: the MPU5's and the TW-950's
// S- and C-band modules had no band the schema would accept.
//
// So each copy is read out of the workflow, each source out of its own
// declaration, and check-docs.mjs fails when a pair disagrees. Every reader
// throws when its declaration is not where it expects, so a refactor on either
// side fails the check loudly instead of comparing two empty lists.
//
// Pure functions only, same shape as glossary-coverage.mjs: check-docs.mjs
// reads the files.

// A Windows checkout with core.autocrlf reads CRLF; every anchor below is \n.
const lf = (s) => s.replace(/\r\n/g, '\n')

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
//
// Just enough of a lexer to tell code from strings, regex literals and
// comments, which is the whole difficulty: a brace inside a Go string, or a
// space inside a JavaScript one, is content, and a pattern that cannot tell
// the difference compares the wrong thing.
//
// It is a generator, and every reader starts it at a declaration rather than
// at the top of the file and stops at the end of that statement. That is not
// only economy. catalog-editor-page.tsx is mostly JSX, whose text is not
// JavaScript (the apostrophe in "Don't" opens no string), so lexing the whole
// file would fail on markup that has nothing to do with slugify.

/**
 * @typedef {{ kind: 'ident' | 'number' | 'string' | 'regex' | 'punct', text: string, start: number, end: number }} Token
 */

const WORD = /[A-Za-z_$][\w$]*/y
const NUMBER = /\d[\w.]*/y

// Words after which a `/` opens a regex literal rather than dividing.
const BEFORE_OPERAND = new Set([
  'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete',
  'void', 'throw', 'instanceof', 'yield', 'await',
])

function sticky(re, src, i) {
  re.lastIndex = i
  return re.exec(src)?.[0]
}

// Offset just past the string literal opening at i. A Go backquote string is
// raw, so a backslash in it is only a backslash.
function stringEnd(src, i, lang) {
  const quote = src[i]
  const raw = quote === '`' && lang === 'go'
  for (let j = i + 1; j < src.length; j++) {
    const d = src[j]
    if (d === quote) return j + 1
    if (d === '\\' && !raw) j++
    else if (d === '\n' && quote !== '`') break
  }
  throw new Error(`unterminated string at offset ${String(i)}`)
}

// Offset just past the regex literal opening at i, flags included. A slash
// inside a character class does not close it.
function regexEnd(src, i) {
  let inClass = false
  for (let j = i + 1; j < src.length; j++) {
    const d = src[j]
    if (d === '\\') j++
    else if (d === '\n') break
    else if (d === '[') inClass = true
    else if (d === ']') inClass = false
    else if (d === '/' && !inClass) return j + 1 + (sticky(/[a-z]*/iy, src, j + 1) ?? '').length
  }
  throw new Error(`unterminated regex literal at offset ${String(i)}`)
}

function operandExpected(prev) {
  if (!prev) return true
  if (prev.kind === 'ident') return BEFORE_OPERAND.has(prev.text)
  if (prev.kind === 'punct') return !/^[)\]}]$/.test(prev.text)
  return false
}

/**
 * Tokens of Go or JavaScript source from `from` on, without whitespace or
 * comments. Strings keep their quotes. In JavaScript a `/` where an operand is
 * expected opens a regex literal; Go has none, and a backquote there is a raw
 * string.
 * @param {string} src
 * @param {'go' | 'js'} lang
 * @param {number} [from]
 * @returns {Generator<Token>}
 */
export function* tokens(src, lang, from = 0) {
  let i = from
  let prev = null
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (src.startsWith('//', i)) {
      const nl = src.indexOf('\n', i)
      i = nl === -1 ? src.length : nl
      continue
    }
    if (src.startsWith('/*', i)) {
      const close = src.indexOf('*/', i + 2)
      if (close === -1) throw new Error(`unterminated comment at offset ${String(i)}`)
      i = close + 2
      continue
    }
    let kind = 'punct'
    let end = i + 1
    if (c === '"' || c === "'" || c === '`') {
      kind = 'string'
      end = stringEnd(src, i, lang)
    } else if (c === '/' && lang === 'js' && operandExpected(prev)) {
      kind = 'regex'
      end = regexEnd(src, i)
    } else {
      const word = sticky(WORD, src, i)
      const number = word ? undefined : sticky(NUMBER, src, i)
      if (word) {
        kind = 'ident'
        end = i + word.length
      } else if (number) {
        kind = 'number'
        end = i + number.length
      }
    }
    prev = { kind, text: src.slice(i, end), start: i, end }
    i = end
    yield prev
  }
}

// A one-token lookahead over tokens(), for the readers below.
function cursor(src, lang, from) {
  const it = tokens(src, lang, from)
  let ahead
  const peek = () => {
    if (ahead === undefined) {
      const n = it.next()
      ahead = n.done ? null : n.value
    }
    return ahead
  }
  const next = () => {
    const t = peek()
    ahead = undefined
    return t
  }
  const expect = (text, where) => {
    const t = next()
    if (t?.text !== text) throw new Error(`expected \`${text}\` ${where}, found ${found(t)}`)
    return t
  }
  return { peek, next, expect }
}

const found = (t) => (t ? `\`${t.text}\`` : 'the end of the file')

// The value of a string token. What is compared here is band names, mode
// names and column keys, so the only escapes worth undoing are the quote and
// the backslash themselves.
const unquote = (s) => s.slice(1, -1).replace(/\\(.)/g, '$1')

// ---------------------------------------------------------------------------
// JavaScript and TypeScript readers
// ---------------------------------------------------------------------------

// Offset just past `name` in its const, let or var declaration, `export`ed or
// not, at the start of a line. The word boundary keeps OPMODE_OPTS from
// matching a neighbouring OPMODE_OPTS_OLD.
function declared(src, name) {
  const word = name.replace(/\$/g, '\\$')
  const m = new RegExp(String.raw`^[ \t]*(?:export[ \t]+)?(?:const|let|var)[ \t]+${word}\b`, 'm').exec(src)
  if (!m) throw new Error(`no \`const ${name} = ...\` declaration found`)
  return m.index + m[0].length
}

// Steps over a TypeScript annotation, if there is one, and the `=` after it.
function pastEquals(c, name) {
  const t = c.next()
  if (t?.text === '=') return
  if (t?.text !== ':') throw new Error(`expected \`=\` after ${name}, found ${found(t)}`)
  for (let a = c.next(); a?.text !== '='; a = c.next()) {
    if (!a) throw new Error(`${name}'s type annotation runs to the end of the file`)
  }
}

// The string elements of the array literal the cursor is at, through its `]`.
function arrayLiteral(c, name) {
  c.expect('[', `to open ${name}'s array`)
  const values = []
  for (;;) {
    const t = c.next()
    if (t?.text === ']') break
    if (t?.kind !== 'string') {
      throw new Error(t ? `${name} holds \`${t.text}\`, which is not a string literal` : `${name}'s array is never closed`)
    }
    values.push(unquote(t.text))
    const sep = c.next()
    if (sep?.text === ']') break
    if (!sep) throw new Error(`${name}'s array is never closed`)
    if (sep.text !== ',') throw new Error(`expected \`,\` or \`]\` in ${name}, found ${found(sep)}`)
  }
  if (values.length === 0) throw new Error(`${name} is empty`)
  return values
}

/**
 * The elements of `const <name> = [...]`, in order. Takes `export`, a type
 * annotation and a trailing `as const`, so it reads catalog-vocab.ts and the
 * workflow alike.
 * @param {string} text JavaScript or TypeScript source
 * @param {string} name
 * @returns {string[]}
 */
export function stringArray(text, name) {
  const src = lf(text)
  const c = cursor(src, 'js', declared(src, name))
  pastEquals(c, name)
  return arrayLiteral(c, name)
}

/**
 * The value of `const <name> = <integer>`. Refuses anything after the number
 * on the same line, so `200 * 2` cannot read as 200.
 * @param {string} text
 * @param {string} name
 * @returns {number}
 */
export function numberConst(text, name) {
  const src = lf(text)
  const c = cursor(src, 'js', declared(src, name))
  pastEquals(c, name)
  const t = c.next()
  if (t?.kind !== 'number' || !/^\d+$/.test(t.text)) throw new Error(`${name} is ${found(t)}, not an integer literal`)
  const after = c.peek()
  if (after && after.text !== ';' && !src.slice(t.end, after.start).includes('\n')) {
    throw new Error(`${name} is an expression (\`${t.text} ${after.text} ...\`), not an integer literal`)
  }
  return Number(t.text)
}

/**
 * The two lists of the workflow's
 * `const bandEnum = terminalType === 'satcom' ? [...] : [...]`, whichever way
 * round the condition is written.
 * @param {string} text the workflow
 * @returns {{ satcom: string[], radio: string[] }}
 */
export function bandEnums(text) {
  const src = lf(text)
  const c = cursor(src, 'js', declared(src, 'bandEnum'))
  c.expect('=', 'after bandEnum')
  const test = []
  for (let t = c.next(); t?.text !== '?'; t = c.next()) {
    if (!t) throw new Error('bandEnum is not a `condition ? [...] : [...]` ternary')
    test.push(t)
  }
  const written = test.length ? src.slice(test[0].start, test[test.length - 1].end) : ''
  const branch = /^terminalType\s*===\s*(['"])(satcom|radio)\1$/.exec(written)?.[2]
  if (!branch) {
    throw new Error(`bandEnum's condition is \`${written}\`; this reader expects \`terminalType === 'satcom'\` or \`=== 'radio'\``)
  }
  const whenTrue = arrayLiteral(c, 'bandEnum')
  c.expect(':', "between bandEnum's two lists")
  const whenFalse = arrayLiteral(c, 'bandEnum')
  return branch === 'satcom' ? { satcom: whenTrue, radio: whenFalse } : { satcom: whenFalse, radio: whenTrue }
}

// The tokens of the expression the cursor is at, through the end of its
// statement: a `;`, a `,` or a closing bracket that is not its own, or a line
// break before anything but a `.`, which is the next link of a method chain.
// The workflow is written without semicolons, so the line break is what ends
// a statement there.
function expression(c, src) {
  const body = []
  let depth = 0
  for (let t = c.peek(); t; t = c.peek()) {
    if (depth === 0) {
      if (t.text === ';' || t.text === ',' || /^[)\]}]$/.test(t.text)) break
      const last = body[body.length - 1]
      if (last && t.text !== '.' && src.slice(last.end, t.start).includes('\n')) break
    }
    if (/^[([{]$/.test(t.text)) depth++
    else if (/^[)\]}]$/.test(t.text)) depth--
    body.push(c.next())
  }
  return body
}

/**
 * The body of `const <name> = (<param>) => <expression>`, as source text for
 * a message and as a canonical form for comparison. The canonical form drops
 * whitespace, comments, both TypeScript annotations and the parameter's name,
 * and reads a `String(<param>)` wrapper round the input as the input itself:
 * the workflow wraps it, and for the string the editor passes the wrapper
 * changes nothing. Everything else - every regex, replacement and limit - has
 * to match token for token.
 * @param {string} text
 * @param {string} name
 * @returns {{ text: string, canonical: string }}
 */
export function arrowFunction(text, name) {
  const src = lf(text)
  const c = cursor(src, 'js', declared(src, name))
  c.expect('=', `after ${name}`)
  c.expect('(', `to open ${name}'s parameter list`)
  const param = c.next()
  if (param?.kind !== 'ident') throw new Error(`${name} does not take a named parameter`)
  for (let t = c.next(); t?.text !== ')'; t = c.next()) {
    if (!t || t.text === ',') throw new Error(`${name} does not take exactly one parameter`)
  }
  let t = c.next()
  if (t?.text === ':') {
    do t = c.next()
    while (t && !(t.text === '=' && c.peek()?.text === '>'))
  }
  if (t?.text !== '=' || c.next()?.text !== '>') throw new Error(`${name} is not an arrow function`)

  const body = expression(c, src)
  if (body.length === 0) throw new Error(`${name} has no body`)
  const words = body.map((b) => (b.kind === 'ident' && b.text === param.text ? '<param>' : b.text))
  if (words.slice(0, 4).join(' ') === 'String ( <param> )') words.splice(0, 4, '<param>')
  return { text: src.slice(body[0].start, body[body.length - 1].end), canonical: words.join(' ') }
}

// ---------------------------------------------------------------------------
// Go readers
// ---------------------------------------------------------------------------

/**
 * The import template's column keys: every column of `var csvTable` that
 * carries a Set, in declaration order. That is what csvtable's Template emits
 * for an empty column list, and so what GET .../import/template serves.
 * `Set: nil` carries none.
 * @param {string} text Go source of a domain's csv.go
 * @returns {string[]}
 */
export function goTemplateKeys(text) {
  const toks = [...tokens(lf(text), 'go')]
  const decl = toks.findIndex((t, i) => t.text === 'csvTable' && toks[i - 1]?.text === 'var')
  if (decl === -1) throw new Error('no `var csvTable = csvtable.Table[...]{...}` found')
  let i = toks.findIndex((t, k) => k > decl && t.text === 'Columns' && toks[k + 1]?.text === ':')
  if (i === -1) throw new Error('csvTable has no `Columns:` field')
  while (i < toks.length && toks[i].text !== '{') i++

  const keys = []
  let depth = 0
  let column = null
  for (; i < toks.length; i++) {
    const t = toks[i]
    if (t.text === '{') {
      depth++
      if (depth === 2) column = { key: null, set: false }
      continue
    }
    if (t.text === '}') {
      if (depth === 2) {
        if (column.key === null) throw new Error('a csvTable column has no `Key: "..."` string literal')
        if (column.set) keys.push(column.key)
      }
      depth--
      if (depth === 0) break
      continue
    }
    // A column's own fields sit at depth 2. Deeper is a func body or a nested
    // literal, where a `Key:` or `Set:` belongs to something else.
    if (depth !== 2 || t.kind !== 'ident' || toks[i + 1]?.text !== ':') continue
    const value = toks[i + 2]
    if (t.text === 'Key' && value?.kind === 'string') column.key = unquote(value.text)
    if (t.text === 'Set') column.set = value?.text !== 'nil'
  }
  if (depth !== 0) throw new Error('csvTable.Columns is never closed')
  if (keys.length === 0) throw new Error('csvTable has no column with a Set, so it has no import template')
  return keys
}

/**
 * The `max=` validate rule on every struct field tagged `json:"<field>"`. They
 * must agree: a create and an update request that limit one field differently
 * leave no single number for a copy to hold.
 * @param {string} text Go source of a request DTO file
 * @param {string} field the field's JSON name
 * @returns {number}
 */
export function goMaxTag(text, field) {
  const limits = []
  let struct = null
  for (const line of lf(text).split('\n')) {
    const decl = /^type\s+(\w+)\s+struct\b/.exec(line)
    if (decl) {
      struct = decl[1]
      continue
    }
    const tag = /`([^`]*)`/.exec(line)?.[1]
    if (!tag || /\bjson:"([^",]*)/.exec(tag)?.[1] !== field) continue
    const rules = /\bvalidate:"([^"]*)"/.exec(tag)?.[1].split(',') ?? []
    const max = rules.map((r) => /^max=(\d+)$/.exec(r.trim())?.[1]).find(Boolean)
    if (max) limits.push({ struct, max: Number(max) })
  }
  if (limits.length === 0) throw new Error(`no field tagged json:"${field}" carries a validate max=`)
  if (new Set(limits.map((l) => l.max)).size > 1) {
    const each = limits.map((l) => `max=${String(l.max)} on ${l.struct}`).join(', ')
    throw new Error(`json:"${field}" is limited differently (${each}), so no single copy can match`)
  }
  return limits[0].max
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Pair
 * @property {string} copy    the copy, as a reader should find it
 * @property {string} source  its source, likewise
 * @property {'list' | 'set' | 'value' | 'expression'} compare
 * @property {any} copied     what the copy holds
 * @property {any} truth      what the source holds
 */

/**
 * Every way each copy disagrees with its source, one line apiece.
 *
 * 'list' is exact and ordered. 'set' ignores order and repeats, for the band
 * enums, which the workflow lists in frequency order and the editor does not.
 * 'value' is exact. 'expression' compares arrowFunction's canonical forms and
 * shows the source text.
 * @param {Pair[]} pairs
 * @returns {string[]}
 */
export function disagreements(pairs) {
  const problems = []
  for (const p of pairs) {
    if (p.compare === 'value') {
      if (p.copied !== p.truth) problems.push(`${p.copy} is ${String(p.copied)}, but ${p.source} is ${String(p.truth)}`)
      continue
    }
    if (p.compare === 'expression') {
      if (p.copied.canonical !== p.truth.canonical) {
        problems.push(`${p.copy} is\n    ${p.copied.text}\n  but ${p.source} is\n    ${p.truth.text}`)
      }
      continue
    }
    const missing = p.truth.filter((v) => !p.copied.includes(v))
    const extra = p.copied.filter((v) => !p.truth.includes(v))
    if (missing.length) problems.push(`${p.copy} lacks ${missing.join(', ')}, which ${p.source} has`)
    if (extra.length) problems.push(`${p.copy} has ${extra.join(', ')}, which ${p.source} does not`)
    if (!missing.length && !extra.length && p.compare === 'list' && p.copied.join('\0') !== p.truth.join('\0')) {
      problems.push(`${p.copy} is [${p.copied.join(', ')}], but ${p.source} is [${p.truth.join(', ')}]`)
    }
  }
  return problems
}

/**
 * What a passing pair holds, for check-docs.mjs's one-line summary: a check
 * prints the value it verified, not just that it passed.
 * @param {Pair} p
 * @returns {string}
 */
export function verified(p) {
  if (p.compare === 'list') return `[${p.truth.join(', ')}]`
  if (p.compare === 'set') return `{${p.truth.join(', ')}}`
  if (p.compare === 'value') return String(p.truth)
  return 'token for token'
}

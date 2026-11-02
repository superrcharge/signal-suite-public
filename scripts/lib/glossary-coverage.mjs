// Holds docs/glossary.md to the app's closed vocabularies.
//
// A successor, or an agent, can read what a status or a kit type does from the
// code. What it cannot read from the code is what the word means to the people
// using the app: ALERT, IFK, SECRET, OW7 and the rest are unit and programme
// vocabulary, not English. The glossary is where that lives, and like every
// other hand-written list here it drifts silently unless something reads it.
//
// So each closed vocabulary is read from its authoritative Go declaration and
// every value must have a glossary row. A new status, kit type, branch or role
// then cannot ship without somebody writing down what it means.
//
// Only closed sets are held. Open ones (transport kinds, fiscal years, section
// keys, which are rows in a table) cannot be enumerated from source, and
// pretending otherwise would make this check pass vacuously for them.
//
// Pure functions only, same shape as prose-counts.mjs and stack-coverage.mjs:
// check-docs.mjs reads the files.

const lf = (s) => s.replace(/\r\n/g, '\n')

/**
 * Every `Ident = "value"` and `Ident Type = "value"` string constant in a Go
 * source file, whether inside a const block or not.
 * @param {string} text
 * @returns {Map<string, string>}
 */
export function goStringConsts(text) {
  const out = new Map()
  for (const m of lf(text).matchAll(/^\s*(?:const\s+)?([A-Za-z_]\w*)(?:\s+[A-Za-z_][\w.]*)?\s*=\s*"([^"]*)"\s*(?:\/\/.*)?$/gm)) {
    out.set(m[1], m[2])
  }
  return out
}

/**
 * The values of `var <name> = []string{...}` (or `[]T{...}`), resolving
 * identifiers against the file's string constants. Throws when the variable
 * is absent or an element cannot be resolved, so a refactor that moves a
 * vocabulary fails loudly instead of checking an empty list.
 * @param {string} text Go source
 * @param {string} name variable name
 * @returns {string[]}
 */
export function goSliceValues(text, name) {
  const src = lf(text)
  const m = src.match(new RegExp(`^var\\s+${name}\\s*=\\s*\\[\\]\\w+\\s*\\{([\\s\\S]*?)\\}`, 'm'))
  if (!m) throw new Error(`no \`var ${name} = []T{...}\` found`)
  const consts = goStringConsts(src)
  const values = []
  for (const raw of m[1].replace(/\/\/[^\n]*/g, '').split(',')) {
    const item = raw.trim()
    if (!item) continue
    const lit = item.match(/^"([^"]*)"$/)
    if (lit) {
      values.push(lit[1])
    } else if (consts.has(item)) {
      values.push(consts.get(item))
    } else {
      throw new Error(`cannot resolve \`${item}\` in \`var ${name}\``)
    }
  }
  if (values.length === 0) throw new Error(`\`var ${name}\` is empty`)
  return values
}

// Lower case with everything but letters, digits and & dropped, so the code
// value `alert-blue` matches the glossary term "ALERT BLUE" and `ow7` matches
// "OW-7".
export const normalise = (s) => s.toLowerCase().replace(/[^a-z0-9&]+/g, '')

/**
 * The terms a glossary defines: the first cell of every table row. A cell
 * naming several terms ("ALERT, ALERT BLUE, ALERT GREEN (statuses)",
 * "AAA / BBB / CCC", "`admin` and `editor`") defines each of them.
 * @param {string} markdown
 * @returns {Set<string>} normalised terms
 */
export function glossaryTerms(markdown) {
  const terms = new Set()
  for (const line of lf(markdown).split('\n')) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|/)
    if (!m) continue
    const cell = m[1].replace(/[*`]/g, '').trim()
    if (/^:?-+:?$/.test(cell) || cell.toLowerCase() === 'term') continue
    terms.add(normalise(cell))
    for (const part of cell.split(/,|\/|;|:|\(|\)|\band\b|\bor\b/)) {
      const t = normalise(part)
      if (t) terms.add(t)
    }
  }
  return terms
}

/**
 * @param {Set<string>} terms from glossaryTerms
 * @param {{ vocabulary: string, values: string[] }[]} vocabularies
 * @returns {{ vocabulary: string, value: string }[]} values with no glossary row
 */
export function missingTerms(terms, vocabularies) {
  const missing = []
  for (const { vocabulary, values } of vocabularies) {
    for (const value of values) {
      if (!terms.has(normalise(value))) missing.push({ vocabulary, value })
    }
  }
  return missing
}

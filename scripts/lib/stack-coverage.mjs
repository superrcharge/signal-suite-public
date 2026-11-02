// Holds docs/stack.md to the files that declare the stack.
//
// docs/stack.md is the one-page inventory of every component in the app. Its
// predecessors - the Tech Stack list in the old _project/README.md, then
// an old readiness document's sections and project.md's "Tech stack" - were all
// hand-typed, and every one of them drifted: a module added to go.mod or a
// workflow added to .github/workflows/ simply never appeared. A page that
// claims to be the whole system and silently is not is worse than no page.
//
// So the names are read out of the declaring files and each one must appear on
// the page. The rule for "appears" is deliberately strict: the exact name,
// inside backticks. A bare word in prose does not count, because "react" or
// "app" or "frontend" occur incidentally all over the page and would make the
// check pass vacuously for exactly the names most likely to be missing.
//
// Only presence is checked, never versions: the page names components and the
// pinning files own the versions, so there is nothing version-shaped to hold.
//
// Pure functions only, same shape as prose-counts.mjs: check-docs.mjs does the
// file reading, so both directions can be pinned by unit tests without a repo
// on disk. No YAML library exists on either machine, so compose files are read
// with a small indentation-based parse of the `services:` block.

// A Windows checkout with core.autocrlf reads CRLF; every anchor below is \n.
const lf = (s) => s.replace(/\r\n/g, '\n')

const unquote = (s) => s.replace(/^(["'])(.*)\1$/, '$2')

/**
 * Module paths of every direct `require` in a go.mod: the block form and the
 * single-line form, skipping anything marked `// indirect`.
 * @param {string} text go.mod contents
 * @returns {string[]} sorted, unique
 */
export function goDirectRequires(text) {
  const out = new Set()
  let inRequire = false
  let inOtherBlock = false

  for (const raw of lf(text).split('\n')) {
    const indirect = /\/\/\s*indirect\b/.test(raw)
    const line = raw.replace(/\/\/.*$/, '').trim()
    if (!line) continue

    if (inRequire) {
      if (line === ')') {
        inRequire = false
        continue
      }
      const m = line.match(/^(\S+)\s+\S+/)
      if (m && !indirect) out.add(unquote(m[1]))
      continue
    }
    if (inOtherBlock) {
      if (line === ')') inOtherBlock = false
      continue
    }

    if (/^require\s*\($/.test(line)) {
      inRequire = true
      continue
    }
    // replace ( ... ), exclude ( ... ), retract ( ... ), tool ( ... ): their
    // entries also look like "path version" and must not be read as requires.
    if (/^[a-z]+\s*\($/.test(line)) {
      inOtherBlock = true
      continue
    }
    const single = line.match(/^require\s+(\S+)\s+\S+/)
    if (single && !indirect) out.add(unquote(single[1]))
  }

  return [...out].sort()
}

/**
 * Every package named in `dependencies` and `devDependencies`.
 * @param {string} text package.json contents
 * @returns {string[]} sorted, unique
 */
export function npmPackageNames(text) {
  const pkg = JSON.parse(text)
  const names = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]
  return [...new Set(names)].sort()
}

/**
 * Workflow files from a directory listing. The listing is an argument so the
 * caller owns the filesystem; a README or anything else that is not YAML is
 * dropped, as GitHub itself ignores it.
 * @param {string[]} listing file names in .github/workflows/
 * @returns {string[]} sorted
 */
export function workflowFileNames(listing) {
  return listing
    .map((f) => f.split(/[\\/]/).pop())
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
}

/**
 * Keys directly under the top-level `services:` block of a compose file. The
 * child indent is taken from the first key under the block, so anything deeper
 * (build, environment, healthcheck, a service's own `networks:`) is ignored,
 * and the block ends at the next top-level key.
 * @param {string} text compose YAML contents
 * @returns {string[]} in file order
 */
export function composeServiceNames(text) {
  const out = []
  let inServices = false
  let childIndent = -1

  for (const raw of lf(text).split('\n')) {
    if (/^\s*(#.*)?$/.test(raw)) continue
    const indent = raw.match(/^ */)[0].length

    if (indent === 0) {
      inServices = /^services\s*:\s*(#.*)?$/.test(raw)
      childIndent = -1
      continue
    }
    if (!inServices) continue

    if (childIndent === -1) childIndent = indent
    if (indent !== childIndent) continue

    const m = raw.slice(indent).match(/^("[^"]+"|'[^']+'|[A-Za-z0-9._-]+)\s*:(\s|$)/)
    if (m) out.push(unquote(m[1]))
  }

  return out
}

/**
 * Every inline code span in a Markdown document, trimmed. Fenced blocks are
 * removed first: a name inside a shell example is not an entry on the page.
 * @param {string} markdown
 * @returns {Set<string>}
 */
export function codeSpans(markdown) {
  const withoutFences = lf(markdown).replace(/^\s*(```|~~~)[\s\S]*?^\s*\1\s*$/gm, '')
  const spans = new Set()
  for (const m of withoutFences.matchAll(/`([^`\n]+)`/g)) spans.add(m[1].trim())
  return spans
}

/**
 * Names that do not appear on the page as an exact backticked span. A name
 * written with one of the given path prefixes also counts, so
 * `.github/workflows/ci.yml` covers `ci.yml`; a bare suffix never does, so
 * `@types/react` does not cover `react`.
 * @param {string} stackMarkdown
 * @param {string[]} names
 * @param {{ prefixes?: string[] }} [opts]
 * @returns {string[]}
 */
export function missingFromStack(stackMarkdown, names, { prefixes = [] } = {}) {
  const spans = codeSpans(stackMarkdown)
  return names.filter((n) => !spans.has(n) && !prefixes.some((p) => spans.has(p + n)))
}

/**
 * The whole check, over already-read inputs.
 * @param {{ goMod: string, packageJson: string, workflowFiles: string[],
 *           composeTexts: string[], stackMd: string }} input
 * @returns {{ missing: {kind: string, name: string}[],
 *             counted: {go: number, npm: number, workflows: number, compose: number} }}
 */
export function checkStackCoverage({ goMod, packageJson, workflowFiles, composeTexts, stackMd }) {
  const go = goDirectRequires(goMod)
  const npm = npmPackageNames(packageJson)
  const workflows = workflowFileNames(workflowFiles)
  const compose = [...new Set(composeTexts.flatMap(composeServiceNames))].sort()

  const missing = [
    ...missingFromStack(stackMd, go).map((name) => ({ kind: 'go module', name })),
    ...missingFromStack(stackMd, npm).map((name) => ({ kind: 'npm package', name })),
    ...missingFromStack(stackMd, workflows, { prefixes: ['.github/workflows/'] }).map((name) => ({
      kind: 'workflow',
      name,
    })),
    ...missingFromStack(stackMd, compose).map((name) => ({ kind: 'compose service', name })),
  ]

  return {
    missing,
    counted: { go: go.length, npm: npm.length, workflows: workflows.length, compose: compose.length },
  }
}

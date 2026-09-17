#!/usr/bin/env node
// UI token preflight. Holds the frontend's page framework to one definition.
//
// The app has shared primitives - PageBanner, PageTitle, PageSubtitle,
// StatStrip, the surface-sx and banner-controls token modules - and for a long
// time it also had pages that ignored them. Nothing checked, so the drift was
// invisible until somebody measured it:
//
//   `borderRadius: '10px'` was written out fourteen times across seven pages,
//   silently overriding the 8px the theme sets on MuiPaper and the 4px
//   theme.shape declares.
//
//   The table head rule existed as a page-local `const HEAD_SX` in four files,
//   inlined four times in a fifth, and at a different size and colour in a
//   sixth.
//
//   theme.typography.fontFamily named Roboto, which nothing ever loaded - no
//   @font-face, no @fontsource dependency, no link tag - so the shell rendered
//   Helvetica on macOS and Arial on Windows from the same commit.
//
//   Four routes had no page heading at all, so they had no `h1`.
//
// Every one of those was a one-line grep away from being impossible to write.
// A convention nothing checks is not a convention, which is the argument
// AGENTS.md already makes for preflight-versions.mjs and check-docs.mjs; this
// is the same argument applied to the page framework.
//
// It reads source only and compiles nothing, so its answer is a pure function
// of the tree - it belongs in the receipt-cacheable set, NOT in verify.mjs's
// ALWAYS_RUN.
//
// Usage: node scripts/check-ui-tokens.mjs

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { repoRoot } from './lib/tree-digest.mjs'

const root = repoRoot()
const src = join(root, 'frontend', 'src')

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------
//
// A knowingly-exempt file needs a written reason, the same demand check-docs
// makes of a skipped doc and csv-manifest.json makes of a "no". A year later,
// "we meant to" and "nobody noticed" look identical in a diff.

// Files allowed to write the amber hex literally instead of reading the
// palette or `var(--shf-amber)`. Every one of them is on the sheet/export side,
// where a CSS custom property does not survive the trip.
const AMBER_LITERAL_OK = {
  'frontend/src/theme/theme.ts':
    'The palette itself. This is where the value is defined.',
  'frontend/src/components/catalog/compare-palette.ts':
    'Two frozen palettes whose contrast ratios are computed and snapshot-tested, ' +
    'and which the rasterizer reads at capture time. A var() would resolve to an ' +
    'empty string in the cloned document the canvas is drawn from.',
  'frontend/src/components/pace/emblem.ts':
    'Builds a standalone SVG document as a string, for export. It has no :root ' +
    'to inherit custom properties from.',
  'frontend/src/components/catalog/HeroBlock.tsx':
    'SVG presentation attributes inside the data sheet, which is rasterized to ' +
    'PNG and embedded in the .pptx. Same capture-time constraint as compare-palette.',
  'frontend/src/components/catalog/StatusPill.tsx':
    'A status-to-colour map on the data sheet, read during rasterization.',
  'frontend/src/components/pace/ChannelWheel.tsx':
    'Writes `var(--shf-amber, #F5A21F)` - the literal is the documented fallback ' +
    'for the rasterized copy, not a second source of truth.',
}

// Pages that legitimately render no PageTitle or RailTitle.
const NO_TITLE_OK = {
  'frontend/src/pages/not-found-page.tsx':
    'The only route outside MainLayout. It has no banner to put a title in, and ' +
    'its own 404 block is the heading.',
  'frontend/src/pages/catalog-print-page.tsx':
    'A print route. Its heading is the record on the sheet.',
  'frontend/src/pages/pace-print-page.tsx':
    'A print route. Its heading is the squadron on the sheet.',
  'frontend/src/pages/catalog-compare-print-page.tsx':
    'A print route. Its heading is the comparison on the sheet.',
  'frontend/src/pages/comms-library-print-page.tsx':
    'A print route; PrintPageShell supplies the bar.',
  'frontend/src/pages/catalog-compatibility-print-page.tsx':
    'A print route; PrintPageShell supplies the bar.',
  'frontend/src/pages/nets-print-page.tsx':
    'A print route; PrintPageShell supplies the bar.',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'generated') continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const sources = walk(src)
const rel = (p) => relative(root, p).split('\\').join('/')
const read = (p) => readFileSync(p, 'utf8')

/** Strip block and line comments, so a value named in prose is not a finding. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const skipped = []
function note(path, table) {
  skipped.push([path, table[path]])
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/**
 * The amber lives in the palette and reaches CSS as `--shf-amber`, published
 * from it by theme/global-styles.tsx. A literal is a second source that cannot
 * follow a palette change.
 */
function checkAmberLiteral() {
  const hits = []
  for (const file of sources) {
    const path = rel(file)
    if (path in AMBER_LITERAL_OK) { note(path, AMBER_LITERAL_OK); continue }
    const body = stripComments(read(file))
    if (/#f5a21f/i.test(body)) hits.push(path)
  }
  if (hits.length) {
    return {
      ok: false,
      detail:
        `${hits.length} file(s) write the amber hex literally:\n` +
        hits.map((h) => `  ${h}`).join('\n') +
        "\n\nUse `theme.palette.primary.main` in an sx, or `var(--shf-amber)` in a\n" +
        'style. If the file is rasterized for export and genuinely cannot read a\n' +
        'custom property, add it to AMBER_LITERAL_OK with the reason.',
    }
  }
  return { ok: true, detail: `#F5A21F only in the palette, plus ${Object.keys(AMBER_LITERAL_OK).length - 1} exempt export-side file(s)` }
}

/**
 * The shell's container radius. Fourteen literals used to override both the
 * theme's 8px MuiPaper rule and its 4px `shape.borderRadius`, which is how the
 * app ended up with six radii and no token.
 */
function checkSurfaceRadius() {
  const owner = 'frontend/src/components/common/surface-sx.ts'
  const hits = []
  for (const file of sources) {
    const path = rel(file)
    if (path === owner) continue
    if (/borderRadius:\s*'10px'/.test(stripComments(read(file)))) hits.push(path)
  }
  if (hits.length) {
    return {
      ok: false,
      detail:
        `${hits.length} file(s) restate the surface radius:\n` +
        hits.map((h) => `  ${h}`).join('\n') +
        `\n\nSpread PANEL_SX, or import SURFACE_RADIUS, from ${owner}.`,
    }
  }
  return { ok: true, detail: `borderRadius: '10px' only in ${owner.split('/').pop()}` }
}

/** The table head and tight-cell rules belong to surface-sx, not to a page. */
function checkPageLocalTableTokens() {
  const banned = [/const HEAD_SX\b/, /const TIGHT_SX\b/]
  const hits = []
  for (const file of sources.filter((f) => rel(f).startsWith('frontend/src/pages/'))) {
    const body = stripComments(read(file))
    for (const re of banned) if (re.test(body)) hits.push(`${rel(file)}  (${String(re)})`)
  }
  if (hits.length) {
    return {
      ok: false,
      detail:
        'page-local copies of a shared table token:\n' +
        hits.map((h) => `  ${h}`).join('\n') +
        '\n\nImport TABLE_HEAD_SX / TIGHT_CELL_SX from @/components/common instead.',
    }
  }
  return { ok: true, detail: 'no page declares its own HEAD_SX or TIGHT_SX' }
}

/**
 * The theme's body font is actually loaded.
 *
 * This first compared the theme's family to `--font-body`, which was a PROXY
 * for the real invariant and happened to be true. It broke the moment the
 * shell and the sheets legitimately used different families - the shell on
 * Roboto, the sheets still on IBM Plex Sans because only the four families in
 * `SHEET_FONT_FACES` survive a rasterized export. That is a correct state, and
 * the old check called it a failure.
 *
 * What is actually worth holding is the thing that was broken for the life of
 * the project: `theme.typography.fontFamily` named Roboto and nothing anywhere
 * loaded it - no @font-face, no dependency, no link tag - so every MUI-styled
 * surface fell through to Helvetica on macOS and Arial on Windows.
 */
function checkFontIsLoaded() {
  const themePath = join(src, 'theme', 'theme.ts')
  const cssPath = join(src, 'styles', 'catalog-tokens.css')
  const themeMatch = /fontFamily:\s*'"([^"]+)"/.exec(read(themePath))
  if (!themeMatch) return { ok: false, detail: 'no quoted first family in theme.typography.fontFamily' }
  const family = themeMatch[1].trim()
  const css = read(cssPath)
  const declared = [...css.matchAll(/font-family:\s*"([^"]+)"/g)].map((m) => m[1].trim())
  if (!declared.includes(family)) {
    return {
      ok: false,
      detail:
        `theme.typography.fontFamily leads with "${family}", which has no @font-face rule in\n` +
        `${rel(cssPath)}. Declared there: ${declared.length ? [...new Set(declared)].join(', ') : '(none)'}.\n\n` +
        'Nothing loads a family the stylesheet does not declare, so the theme falls\n' +
        'through to the OS default - Helvetica on macOS, Arial on Windows, and the same\n' +
        'commit rendering differently on the two checkouts. Self-host the face in\n' +
        'frontend/public/fonts/ and declare it, the way the other families are.',
    }
  }
  const weights = [...css.matchAll(/font-family:\s*"([^"]+)"[\s\S]*?font-weight:\s*([^;]+);/g)]
    .filter((m) => m[1].trim() === family)
    .map((m) => m[2].trim())
  return { ok: true, detail: `fontFamily "${family}" is self-hosted (@font-face weights ${weights.join(', ') || 'declared'})` }
}

/**
 * ...and the sheet that declares it has to be loaded on every route, not only
 * on the ones that happen to import it.
 */
function checkTokensSheetLoaded() {
  const path = join(src, 'theme', 'global-styles.tsx')
  const body = read(path)
  if (!/import\s+'@\/styles\/catalog-tokens\.css'/.test(body)) {
    return {
      ok: false,
      detail:
        'theme/global-styles.tsx does not import @/styles/catalog-tokens.css.\n' +
        'It is mounted on every route by contexts/theme-context.tsx, which is what\n' +
        'makes the fonts and the graphite ramp unconditional. Without it the sheet\n' +
        'arrives only through whichever page imported it.',
    }
  }
  return { ok: true, detail: 'catalog-tokens.css loaded once, in global-styles.tsx' }
}

/**
 * Every route has a page heading, in one style. Four did not, so they had no
 * `h1` and a screen reader had nothing to jump to.
 */
function checkEveryPageHasTitle() {
  const routerPath = join(src, 'routes', 'router.tsx')
  const router = read(routerPath)
  const imported = [...router.matchAll(/import\('@\/pages\/([a-z0-9-]+)'\)/g)].map((m) => m[1])
  if (imported.length === 0) {
    return { ok: false, detail: `parsed no lazy page imports out of ${rel(routerPath)} - the regex has stopped matching` }
  }
  const missing = []
  let checked = 0
  for (const name of imported) {
    const file = join(src, 'pages', `${name}.tsx`)
    const path = rel(file)
    if (path in NO_TITLE_OK) { note(path, NO_TITLE_OK); continue }
    if (!existsSync(file)) { missing.push(`${path}  (router imports it; the file is not there)`); continue }
    checked += 1
    const body = read(file)
    if (!/\b(PageTitle|RailTitle|PrintPageShell)\b/.test(body)) missing.push(path)
  }
  if (missing.length) {
    return {
      ok: false,
      detail:
        'page(s) with no heading component:\n' +
        missing.map((m) => `  ${m}`).join('\n') +
        '\n\nEvery page carries a PageTitle (or a RailTitle over a rail). It is the\n' +
        "page's h1. See .claude/context/patterns/frontend-page.md.",
    }
  }
  return { ok: true, detail: `${checked} routed page(s) carry a title component` }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const STEPS = [
  ['amber is the palette only', checkAmberLiteral],
  ['surface radius is a token', checkSurfaceRadius],
  ['no page-local table tokens', checkPageLocalTableTokens],
  ['theme font is actually loaded', checkFontIsLoaded],
  ['tokens sheet loaded globally', checkTokensSheetLoaded],
  ['every page has a title', checkEveryPageHasTitle],
]

console.log(`check-ui-tokens: ${STEPS.length} checks over ${sources.length} frontend sources\n`)

const failures = []
for (const [name, fn] of STEPS) {
  process.stdout.write(`  ${name} ... `)
  let result
  try {
    result = fn()
  } catch (err) {
    result = { ok: false, detail: err?.stack ?? String(err) }
  }
  if (result.ok) {
    console.log(`pass  (${result.detail})`)
  } else {
    console.log('FAIL')
    failures.push([name, result.detail])
  }
}

if (skipped.length) {
  console.log('')
  for (const [path, reason] of skipped) {
    console.log(`  exempt ${path}\n         reason: ${reason}`)
  }
}

if (failures.length > 0) {
  for (const [name, detail] of failures) {
    console.error(`\n${'-'.repeat(70)}\n${name}\n${'-'.repeat(70)}\n${detail}`)
  }
  console.error(`\ncheck-ui-tokens: FAILED ${failures.length} of ${STEPS.length}.`)
  process.exit(1)
}

console.log(`\ncheck-ui-tokens: PASSED all ${STEPS.length} checks.`)

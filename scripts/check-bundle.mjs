#!/usr/bin/env node
/**
 * Holds the built frontend bundle to one invariant: the emitted chunk import
 * graph is acyclic.
 *
 * This exists because of a shipped outage. An earlier release changed the module graph
 * enough that rolldown stopped emitting its runtime as a dedicated chunk and
 * folded it into another one. `vendor` then imported a helper from that chunk
 * and called it at module scope while the same chunk depended on `vendor` in
 * turn, so the binding was still undefined when React's top-level code ran:
 *
 *   TypeError: e is not a function   at vendor-*.js:1:61
 *
 * The SPA was a blank white screen in every browser.
 *
 * **Nothing in this repo could see it.** `vite build` exits 0 - a cyclic chunk
 * graph is legal ES modules, and only breaks when top-level code reads across
 * the cycle. All 15 verify steps passed. All six CI jobs passed. The deploy
 * smoke test passed too, because `verify-deploy.mjs` checks that `/` returns
 * HTML and cannot check that the HTML's JavaScript runs.
 *
 * A cycle is the precise signature of that class of failure and is cheap to
 * detect, which is why this checks for it rather than trying to prove the
 * bundle boots. Proving that needs a real browser; this needs a regex.
 *
 * If a future bundler legitimately needs a cyclic chunk graph, this check is
 * wrong rather than the bundle - but read the stack above before believing it.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = join(REPO, 'frontend');
const ASSETS = join(FRONTEND, 'dist', 'assets');

/**
 * Static imports only. A dynamic import cannot deadlock a module's top level,
 * so `import("./x.js")` is deliberately not matched - and is not, because these
 * both require a quote directly after `from` or after bare `import`.
 *
 * Two patterns, and the second one is the whole reason this check works. The
 * first version of this file required whitespace before `from`, which minified
 * output does not have: it emits `}from"./x.js"`. That regex found 18 edges
 * across 46 chunks and reported no cycles on a bundle that was demonstrably
 * cyclic, so the check passed on the exact outage it was written for. Any change
 * here must be re-run against the negative case in the test.
 */
const IMPORT_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g, // import ... from "x" / export ... from "x"
  /(?:^|[;\s])import\s*["']([^"']+)["']/g, // side-effect import "x"
];

function build() {
  execFileSync('npx', ['vite', 'build'], { cwd: FRONTEND, stdio: 'pipe' });
}

function chunkGraph() {
  const files = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
  const graph = new Map();
  for (const file of files) {
    const source = readFileSync(join(ASSETS, file), 'utf8');
    const deps = new Set();
    for (const pattern of IMPORT_PATTERNS) {
      for (const [, specifier] of source.matchAll(pattern)) {
        if (!specifier.startsWith('.')) continue;
        const target = specifier.replace(/^\.\//, '');
        if (files.includes(target)) deps.add(target);
      }
    }
    graph.set(file, deps);
  }
  return graph;
}

/** Depth-first, returning the first cycle found as a readable path. */
function findCycle(graph) {
  const state = new Map();
  const stack = [];

  const walk = (node) => {
    state.set(node, 'open');
    stack.push(node);
    for (const dep of graph.get(node) ?? []) {
      if (state.get(dep) === 'open') return [...stack.slice(stack.indexOf(dep)), dep];
      if (!state.has(dep)) {
        const found = walk(dep);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(node, 'done');
    return null;
  };

  for (const node of graph.keys()) {
    if (!state.has(node)) {
      const found = walk(node);
      if (found) return found;
    }
  }
  return null;
}

const shouldBuild = !process.argv.includes('--no-build');
if (shouldBuild) build();

const graph = chunkGraph();
const cycle = findCycle(graph);
const edges = [...graph.values()].reduce((n, deps) => n + deps.size, 0);

if (cycle) {
  console.error(`check-bundle: FAILED. Cyclic chunk imports across ${graph.size} chunks:\n`);
  console.error(`  ${cycle.join('\n    -> ')}\n`);
  console.error('A cycle here is legal ES modules and builds cleanly, but it breaks at');
  console.error('runtime as soon as one chunk reads an imported binding at module scope.');
  console.error('That shipped once as a blank white screen. See the comment in this file.');
  process.exit(1);
}

console.log(
  `check-bundle: PASSED. ${graph.size} chunks, ${edges} static imports between them, no cycles.`,
);

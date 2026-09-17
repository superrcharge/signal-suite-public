// Decides which /ship checks a given branch's diff can possibly affect.
//
// /ship runs 23 checks unconditionally, and six of them - README, structure.md,
// the two load-on-demand tables, domain context completeness, and memory
// staleness - are audits of prose keyed to domains and pages. A lockfile bump
// cannot change what README says about the Features section, and no reading of
// it will ever find a discrepancy. Those six were still walked, one prose
// instruction at a time, by a haiku-model agent, for every push including
// `chore(deps): bump x/crypto`.
//
// That is the expensive half of the audit and it is the half most often
// irrelevant. So compute the answer instead of asking the model to judge it:
// /ship runs on a small model precisely because the checks are meant to be
// mechanical, and "does this diff touch a domain" is exactly the kind of
// question that must not be left to inference.
//
// The bias is deliberately toward running the checks. Anything that looks like
// a domain, a page, a context file, or tracked prose puts the doc checks back
// in scope, and an unreadable diff does too. Skipping a check that mattered is
// a silent documentation gap; running one that did not is a few seconds.

// A changed path puts the doc checks in scope if it matches any of these.
//
// Each entry says which check it is standing in for, because the temptation
// when this list next needs editing will be to add a path without knowing what
// depends on it.
const DOC_TRIGGERS = [
  { re: /^backend\/internal\/domain\//, what: 'a backend domain (checks 7, 8, 9, 10)' },
  { re: /^frontend\/src\/pages\//, what: 'a frontend page (check 8)' },
  { re: /^\.claude\/context\//, what: 'a context file (checks 9, 10)' },
  // Any tracked markdown, not just the four files named by the checks. README
  // and structure.md are what checks 7 and 8 read, but check-docs.mjs holds
  // every tracked .md to the code, and a prose edit anywhere is the exact thing
  // these checks exist to catch drifting.
  { re: /\.md$/, what: 'tracked prose (checks 7, 8, 9, 10, 11)' },
]

/**
 * @param {string[]} changedPaths repo-relative, forward-slashed
 * @returns {{ docChecks: 'required'|'skip', triggers: string[] }}
 */
export function shipScope(changedPaths) {
  const triggers = []

  for (const { re, what } of DOC_TRIGGERS) {
    const hits = changedPaths.filter((p) => re.test(p))
    if (hits.length) {
      triggers.push(`${what}: ${hits.slice(0, 5).join(', ')}${hits.length > 5 ? ` (+${hits.length - 5} more)` : ''}`)
    }
  }

  return { docChecks: triggers.length ? 'required' : 'skip', triggers }
}

// Normalises the output of `git diff --name-only` and `git status --porcelain`
// into one deduped list of repo-relative forward-slashed paths.
//
// Both are parsed because /ship audits BEFORE it commits - the release sequence
// commits at step 1, after the audit passes - so on most runs the changes that
// matter are still in the working tree and `git diff main...HEAD` is empty.
// Reading only one of the two would have made the common case look like an
// empty diff, which this module would then have called out of scope. That is
// the failure worth guarding against: it skips the checks for the wrong reason
// and looks identical to a correct skip.
export function collectPaths({ diffOutput = '', statusOutput = '' } = {}) {
  const paths = new Set()

  for (const line of diffOutput.split('\n')) {
    const p = line.trim()
    if (p) paths.add(p.replace(/\\/g, '/'))
  }

  for (const line of statusOutput.split('\n')) {
    if (!line.trim()) continue
    // Porcelain v1: two status columns, a space, then the path. A rename is
    // `R  old -> new`; both sides are taken, because a file moved out of a
    // domain is as much a documentation event as one moved in.
    const body = line.slice(3).trim()
    if (!body) continue
    for (const side of body.split(' -> ')) {
      const p = side.trim().replace(/^"(.*)"$/, '$1').replace(/\\/g, '/')
      if (p) paths.add(p)
    }
  }

  return [...paths]
}

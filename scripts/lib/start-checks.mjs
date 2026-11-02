// Pure half of the automatic /start gate. scripts/start-checks.mjs runs the
// probes; this file turns their results into the one-line summary and the
// hook payload, so the wording and the verdicts are unit tested rather than
// eyeballed at session start.
//
// It used to be a bash script in the maintainer's home directory, wired up by
// a gitignored settings file, so a fresh clone silently had no session gate at
// all. Everything here is committed now for that reason.
//
// Same rule as env-report.mjs: a probe that failed says so. An empty result is
// never rendered as a pass.

// A probe result is either a string (the value) or { missing: reason }.
export const failed = (v) => v === undefined || v === null || (typeof v === 'object' && !Array.isArray(v))
const reason = (v) => (v && typeof v === 'object' ? v.missing : 'no result')

// owner/repo from an origin URL, in https or ssh form, with or without .git.
export function repoSlug(originUrl) {
  if (typeof originUrl !== 'string') return null
  const m = originUrl.trim().match(/github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

// gh keeps one active account per machine, so the login is reported as is and
// can be read rather than assumed.
export function accountVerdict(login) {
  if (failed(login)) return `unknown (${reason(login)})`
  if (typeof login === 'string' && login.trim() !== '') return `${login} (ok)`
  return 'not logged in (run gh auth login)'
}

export function branchVerdict(branch) {
  if (failed(branch)) return { text: `unknown (${reason(branch)})`, onMain: false }
  if (branch === '') return { text: 'detached HEAD', onMain: false }
  if (branch === 'main') {
    return { text: 'ON MAIN - create a branch before reading or editing anything', onMain: true }
  }
  return { text: `${branch} (not main, ok)`, onMain: false }
}

// `files` is the list of migration filenames; `unannotated` the subset whose
// first line is not `-- +goose Up`.
export function migrationVerdict(files, unannotated) {
  if (failed(files)) return `unknown (${reason(files)})`
  if (files.length === 0) return 'MISSING (no migration files found - check the working directory)'
  if (unannotated.length === 0) return `all ${files.length} annotated`
  return `MISSING -- +goose Up: ${unannotated.join(' ')}`
}

export function containerVerdict(names) {
  if (failed(names)) return `unknown (${reason(names)})`
  return names.includes('app') ? 'running' : 'NOT running (backend checks must run on the host)'
}

const plain = (v) => (failed(v) ? `unknown (${reason(v)})` : String(v))

export function summarize(r) {
  const branch = branchVerdict(r.branch)
  const parts = [
    `branch: ${branch.text}`,
    `gh: ${accountVerdict(r.account)}`,
    `CI(main): ${plain(r.ci)}`,
    `alerts: ${plain(r.alerts)}`,
    `container: ${containerVerdict(r.containers)}`,
    `migrations: ${migrationVerdict(r.migrations, r.unannotated || [])}`,
    `uncommitted: ${plain(r.dirty)}`,
  ]
  return { summary: parts.join(' | '), onMain: branch.onMain }
}

export const RULES =
  'Rules: never implement on main; run /ship before any push; read project rules ' +
  '(CLAUDE.md, AGENTS.md, .claude/context/patterns/) before proposing a plan.'

// The SessionStart hook contract: systemMessage is shown to the person,
// additionalContext is given to the agent.
export function hookPayload(summary) {
  return {
    systemMessage: `/start: ${summary}`,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `Automatic /start gate ran. ${summary}. ${RULES}`,
    },
  }
}

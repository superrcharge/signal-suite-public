// Detection for Bash commands that write to the repository.
//
// The PreToolUse branch guard matched only Write|Edit|NotebookEdit, so every
// mutation routed through Bash was invisible to it: a `git commit`, a heredoc
// into a source file, a `sed -i`, a `go get`. AGENTS.md already recorded the
// hole, describing the guard as "a seatbelt worn by one Claude Code session on
// one machine and by nothing else". This closes the Bash half of it.
//
// The bar for a pattern belonging here is narrow on purpose: it has to write a
// tracked file or move a ref. Read-only work on main must keep working,
// because a guard that blocks `git status` or `npm ci` is a guard somebody
// switches off, and a switched-off guard protects nothing. That is also why
// `git merge-base` is excluded by name - AGENTS.md documents using it to probe
// whether a branch has shipped, and it is a read.

import { execFileSync } from 'node:child_process'
import { relative, resolve } from 'node:path'

// Anchors a match to a command position: the start of the string, or just
// after a separator. Without it, `echo "run git commit later"` trips the guard,
// and so does any prose passed to a command.
const CMD_START = '(?:^|[;&|(`\\n])\\s*(?:sudo\\s+)?'

// Git subcommands that write history, move refs, or overwrite the worktree.
//
// `merge(?!-)` is the one entry that needs explaining: it keeps `git
// merge-base --is-ancestor` out, which is a read this repo's own notes tell
// you to run.
//
// `push` is deliberately absent, and that is the second entry needing a note.
// A subcommand regex stops at the verb and never reads the refspec, so it
// cannot tell `git push origin main` from `git push origin refs/tags/v1.7.2`.
// Only the first is what this guard exists to stop: AGENTS.md records that
// branch protection covers `refs/heads/main` and a tag is `refs/tags/*`, so
// blocking both made the guard stricter than the server it models and denied
// the documented release sequence. Push is classified by `classifyPush` below,
// which reads the arguments.
const GIT_WRITE_SUBCOMMANDS = [
  'commit',
  'merge(?!-)',
  'rebase',
  'cherry-pick',
  'revert',
  'am',
  'apply',
  'reset',
  'restore',
  'clean',
  'rm',
  'mv',
]

const PATTERNS = [
  {
    re: new RegExp(`${CMD_START}git\\s+(?:-\\S+\\s+)*(?:${GIT_WRITE_SUBCOMMANDS.join('|')})\\b`),
    what: 'a git command that writes history, moves a ref, or overwrites the worktree',
  },

  // `git checkout -b` is the documented way out of this guard, so a plain
  // `git checkout` is deliberately left alone. `git checkout --` is not: it
  // discards working tree changes, which has eaten an uncommitted fix here
  // before and is recorded in memory as a trap.
  {
    re: new RegExp(`${CMD_START}git\\s+checkout\\s+--(?:\\s|$)`),
    what: 'git checkout -- discards working tree changes',
  },

  { re: /\bsed\s+(?:-\S+\s+)*-\S*i/, what: 'sed -i edits files in place' },
  { re: /\bperl\s+(?:-\S+\s+)*-\S*i/, what: 'perl -i edits files in place' },

  // A bare `npm install` is allowed: it is the routine post-pull step, and the
  // dependency scan this repo runs after every pull depends on it. Naming a
  // package is what edits package.json.
  {
    re: new RegExp(`${CMD_START}npm\\s+(?:install|i|add)\\s+(?:-\\S+\\s+)*[^-\\s]`),
    what: 'npm install with a package name changes package.json and the lockfile',
  },
  {
    re: new RegExp(`${CMD_START}npm\\s+(?:uninstall|remove|update|up)\\b`),
    what: 'this npm command changes package.json and the lockfile',
  },
  {
    re: new RegExp(`${CMD_START}go\\s+get\\b`),
    what: 'go get changes go.mod and go.sum',
  },
]

// ---------------------------------------------------------------------------
// git push, classified by what it actually moves
//
// The one command here that needs its arguments read rather than its verb
// matched. Everything below fails closed: any form this cannot positively
// identify as tags-only is blocked, because the failure directions are not
// symmetric. Over-blocking is loud - you are on main cutting a release and the
// hook tells you why. Over-permitting is silent, and a `git push origin main`
// that should have been stopped is exactly what nobody notices.

// Flags that make a push unsafe whatever it names.
//
// `--follow-tags` sits here rather than beside `--tags` because it pushes the
// current branch *alongside* the tags, which is the thing being guarded.
const PUSH_BLOCKING_FLAGS = new Set([
  '-f',
  '--force',
  '--force-with-lease',
  '--force-if-includes',
  '-d',
  '--delete',
  '--mirror',
  '--all',
  '--prune',
  '--follow-tags',
])

// Flags taking a separate value, so the token after them is not a refspec.
const PUSH_VALUE_FLAGS = new Set(['-o', '--push-option', '--repo', '--exec', '--receive-pack'])

// Anchored like PATTERNS, and capturing the argument tail up to the next
// command separator so `git tag v1 && git push origin refs/tags/v1` is read as
// two commands rather than one run-on string.
const GIT_PUSH = new RegExp(`${CMD_START}git\\s+(?:-\\S+\\s+)*push\\b([^;&|\`\\n]*)`, 'g')

const PUSH_MOVES_BRANCH = 'git push moves a branch ref on the remote'
const PUSH_FORCE = 'git push --force / --delete / --mirror moves or removes a remote ref'
const PUSH_NO_REFSPEC = 'git push with no refspec pushes the current branch, which is main'

// True when `ref` names a tag in the repo at `cwd` and nothing else.
//
// Resolving against the repo rather than matching a `v\d+\.\d+\.\d+` shape is
// the whole point: a branch named `v1.7.2` is a branch, and a regex cannot
// tell. A name that is both is ambiguous - git itself refuses it - so it reads
// as a branch here, which is the direction that fails closed.
function isTagRef(ref, cwd) {
  if (!ref) return false

  const resolves = (fullRef) => {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', fullRef], {
        cwd,
        stdio: ['ignore', 'ignore', 'ignore'],
      })
      return true
    } catch {
      // Non-zero exit, git missing, cwd gone. All of them mean "cannot show
      // this is a tag", and the caller treats that as a branch.
      return false
    }
  }

  return resolves(`refs/tags/${ref}`) && !resolves(`refs/heads/${ref}`)
}

// Cuts a redirection and everything after it off the argument tail.
//
// GIT_PUSH stops its capture at `;`, `&`, `|` and a backtick, which are the
// separators that end a command - but a redirection ends the *arguments*
// without ending the command, and nothing was stopping there. So
// `git push origin refs/tags/v1.7.2 2>&1` captured a trailing `2>` (the `&`
// halted the capture mid-operator), `2>` was read as a second refspec, it
// resolved as neither a tag nor a branch, and a legitimate tag push was
// blocked. Found by running the real hook rather than the classifier: every
// unit test passed because none of them redirected.
//
// Optional leading digits are part of the match so the file descriptor in
// `2>` goes with it instead of surviving as a bare `2`.
const REDIRECT_TAIL = /\s*\d*[<>][\s\S]*$/

// Returns a reason string when this push writes something other than tags, or
// null when every ref it names is a tag.
function classifyPush(tail, cwd) {
  const tokens = tail.replace(REDIRECT_TAIL, '').trim().split(/\s+/).filter(Boolean)
  const refspecs = []
  let sawTagsFlag = false
  let remoteSeen = false

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (token.startsWith('-')) {
      const flag = token.split('=')[0]
      if (PUSH_BLOCKING_FLAGS.has(flag)) return PUSH_FORCE
      if (flag === '--tags') {
        sawTagsFlag = true
        continue
      }
      // `-o ci.skip` - skip the value so it is not read as a remote.
      if (PUSH_VALUE_FLAGS.has(flag) && !token.includes('=')) i++
      continue
    }

    // First bare token is the remote; everything after it is a refspec.
    if (!remoteSeen) {
      remoteSeen = true
      continue
    }
    refspecs.push(token)
  }

  // `git push --tags` pushes every tag and no branch. A bare `git push`, or one
  // naming only a remote, pushes the current branch - which on main is main.
  if (refspecs.length === 0) return sawTagsFlag ? null : PUSH_NO_REFSPEC

  for (const spec of refspecs) {
    if (spec.startsWith('+')) return PUSH_FORCE
    if (spec.startsWith(':')) return PUSH_FORCE

    // In `src:dst` the destination is what gets written on the remote.
    const dst = spec.includes(':') ? spec.slice(spec.lastIndexOf(':') + 1) : spec

    if (dst.startsWith('refs/tags/')) continue
    if (dst.startsWith('refs/')) return PUSH_MOVES_BRANCH
    if (!isTagRef(dst, cwd)) return PUSH_MOVES_BRANCH
  }

  return null
}

function pushMutations(command, cwd) {
  const reasons = []

  GIT_PUSH.lastIndex = 0
  let match
  while ((match = GIT_PUSH.exec(command)) !== null) {
    const reason = classifyPush(match[1] || '', cwd)
    if (reason) reasons.push(reason)
  }

  return reasons
}

// ---------------------------------------------------------------------------

// `tee`, which is how a heredoc lands a whole file. Redirections are found by
// scanRedirects below rather than by a regex - see the note there.
const TEE = /\btee\s+(?:-a\s+)?([^\s;&|)<>]+)/g

// A target the guard cannot resolve: it contains a variable or a command
// substitution, so the actual path is not knowable without running the shell.
const UNRESOLVABLE = /[$`]/

// Finds real redirection targets, tracking quote state as it goes.
//
// This used to be `/>>?\s*([^\s;&|)<>]+)/g` over the raw string, which cannot
// tell a redirection from a greater-than inside a quoted argument. It read
// `select(.closedAt > "2026-09-05")` as a write to a file named 2026-09-05,
// and `echo "GHCR > ACR"` as a write to one named ACR - the second being
// the phrasing a registry-mirror step would naturally use. A `>`
// inside quotes is never an operator, so this is a correctness fix rather
// than a loosening.
//
// Stripping quoted spans before scanning would have been the obvious shortcut
// and is wrong in the other direction: `echo x > "file.txt"` has an unquoted
// operator and a quoted target, so dropping the spans drops the target and the
// real write goes unnoticed. Quote state decides whether an operator counts;
// the target that follows is then read whether or not it is quoted.
function scanRedirects(command) {
  const targets = []
  let quote = null // "'" or '"' while inside a quoted span

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]

    if (quote) {
      // A backslash escape only suppresses the closing quote in double quotes;
      // inside single quotes bash treats a backslash literally.
      if (quote === '"' && ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }

    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '\\') {
      i++ // escaped character outside quotes, including an escaped >
      continue
    }
    if (ch !== '>') continue

    // Step past the operator (`>` or `>>`) and any whitespace.
    let j = i + 1
    if (command[j] === '>') j++
    while (j < command.length && (command[j] === ' ' || command[j] === '\t')) j++

    // Read the target, which may itself be quoted.
    let target = ''
    const openedWith = command[j] === '"' || command[j] === "'" ? command[j] : null
    if (openedWith) {
      j++
      while (j < command.length && command[j] !== openedWith) target += command[j++]
    } else {
      while (j < command.length && !' \t;&|)<>\n'.includes(command[j])) target += command[j++]
    }

    if (target) targets.push(target)
    i = j
  }

  return targets
}

// Directories inside the repo that are written constantly and tracked by
// nothing. Writing into node_modules is not implementing on main.
const IGNORED_TOP_LEVEL = ['node_modules', 'dist', 'coverage', 'tmp']

// Collects redirection targets that resolve to a path inside the repo.
//
// Returned relative and slash-normalised so the deny message reads the same on
// both machines this repo is worked from.
function targetsInsideRepo(command, repoRoot, cwd) {
  const hits = []

  const raws = scanRedirects(command)
  TEE.lastIndex = 0
  let match
  while ((match = TEE.exec(command)) !== null) {
    if (match[1]) raws.push(match[1])
  }

  for (const raw of raws) {
    if (!raw) continue

      // `2>&1` and friends name a file descriptor, not a file.
      if (raw.startsWith('&')) continue

      // The most common redirect target in this repo's own scripts, and it
      // never touches the tree.
      if (raw.startsWith('/dev/')) continue

      // A variable or command substitution. The guard cannot know what path
      // this is, and guessing produced `writes into the repo: $F` for a append
      // to a file that was not in the repo at all.
      //
      // Not claiming a write here is a deliberate polarity choice for this one
      // case, and it is safe because this hook is not the control. AGENTS.md:
      // "it is an early warning and never the thing that makes a rule true.
      // Branch protection is what makes the rule true." A redirection through
      // a variable can still dirty the worktree on main, but PATTERNS blocks
      // the commit and the server rejects the push, so the worst outcome is a
      // file to clean up - against a guard that denies ordinary commands,
      // which is how a guard gets switched off.
      if (UNRESOLVABLE.test(raw)) continue

      const abs = resolve(cwd, raw.replace(/^["']|["']$/g, ''))
      const rel = relative(repoRoot, abs)

      // Empty means the repo root itself; `..` or a drive letter means the
      // path left the repo, which is the scratchpad case and is fine.
      if (!rel || rel.startsWith('..') || /^[A-Za-z]:/.test(rel)) continue

      const segments = rel.split(/[\\/]/)
      if (IGNORED_TOP_LEVEL.includes(segments[0])) continue

    hits.push(segments.join('/'))
  }

  return hits
}

// Returns a list of human-readable reasons the command writes to the repo.
// Empty means the command is a read and should be allowed through.
export function repoMutations(command, { repoRoot, cwd }) {
  const reasons = []
  if (typeof command !== 'string' || !command.trim()) return reasons

  for (const { re, what } of PATTERNS) {
    if (re.test(command)) reasons.push(what)
  }

  for (const reason of pushMutations(command, cwd)) {
    if (!reasons.includes(reason)) reasons.push(reason)
  }

  const writes = targetsInsideRepo(command, repoRoot, cwd)
  if (writes.length) {
    const unique = [...new Set(writes)]
    reasons.push(`writes into the repo: ${unique.join(', ')}`)
  }

  return reasons
}

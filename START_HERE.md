# Start here

You have just cloned or downloaded this repository, and you may be reading this with an AI
assistant (Claude Code, Cursor, Copilot, ChatGPT, anything). This file is written for both of
you. Human: read the first two sections. AI: read the whole thing, then the files it names, in
that order, before proposing any change.

## What this is

**Asset Tracker** is a web app for a communications shop: it tracks SATCOM terminals, radio kits
and support contracts across sections, holds an equipment catalog of data sheets, and plans the
nets and PACE comms cards that run on that equipment. One Go binary serves the API and the React
front end; PostgreSQL holds the data. It was built for one unit and is shared here, sanitized,
so that you can run it and make it your own.

It is shared as-is. There is no release schedule, no published container image, and no support
line. Everything you need to run it is in this repository.

## Run it first (human, about fifteen minutes)

Do this before changing anything, so you know what "working" looks like.

1. Install **Podman Desktop** or **Docker Desktop**. That is the only tool you need. Open it once
   so its engine is running.
2. Open a terminal in this folder and run:

   ```bash
   cp .env.selfhost.example .env.selfhost
   ```

   Open `.env.selfhost` in any editor and change `change-me` to any password you like.
3. Build and start it. The first build compiles everything inside containers and takes a few
   minutes; nothing is installed on your machine.

   ```bash
   make selfhost-build
   ```

   No `make` on your machine? Run this instead:

   ```bash
   podman compose -p asset-tracker --env-file .env.selfhost -f compose.selfhost.yaml up -d --build --force-recreate app
   ```

   (Docker users: replace `podman` with `docker`.)
4. Open <http://127.0.0.1:3001>. You are signed in as an administrator. The database starts empty
   apart from a few starter sections; add a terminal, import a CSV from the share icon in the
   header, click around.

Everything else about running it, including backups, exposing it to other people safely, and
what does not work without Azure, is in [`docs/self-hosting.md`](docs/self-hosting.md).

## For the AI: what to read, in order

1. [`README.md`](README.md): what the app does, the API surface, the environment variables.
2. [`docs/self-hosting.md`](docs/self-hosting.md): how it runs off-cloud, and the one important
   fact that with sign-in off every visitor is an administrator.
3. [`AGENTS.md`](AGENTS.md): the working rules this repository was built under. Long, and written
   for Claude Code sessions. Read the first three sections ("Never implement on main", "Rules
   first", "Load-on-demand") and the "Verification before pushing" section; the rest is history
   you can consult when a rule surprises you.
4. [`.claude/context/project.md`](.claude/context/project.md): the tech stack and a table that
   maps each area of the app to the one focused note worth reading for it. Read only the note for
   the area you are about to change.
5. [`.claude/context/structure.md`](.claude/context/structure.md): the folder layout.

Do not read every file under `.claude/context/`. Each one is loaded on demand for the area it
covers, and that is the point of the table in `project.md`.

## For the AI: how this repository expects to be worked on

The repository carries its own quality gates. They are not optional decoration, they are why a
change here can be trusted, but a newcomer should know what they are before being surprised by
them.

**One command verifies everything:**

```bash
node scripts/verify.mjs
```

It runs the type check, both linters, both test suites, the migration checks, the docs-agree-
with-code check and a check on the built bundle. It needs Node 26 on the machine for the
frontend half, and either Go plus `golangci-lint` on the machine or the development containers
running (see below) for the backend half. A change to code is not finished until this passes.

**If the assistant is Claude Code**, four hooks in [`.claude/settings.json`](.claude/settings.json)
run automatically:

| Hook | What it does |
|---|---|
| `SessionStart` | prints which tools are installed on this machine |
| `PreToolUse` | refuses to edit a file, or run a writing shell command, while the checkout is on `main`. Create a branch first: `git checkout -b feat/my-change` |
| `PostToolUse` | rejects an em dash in anything just written; this repository uses hyphens and colons |
| `Stop` | refuses to end a turn on code changes that `verify.mjs` has not passed |

There are also two slash commands worth knowing: `/start` (run at the beginning of a session, it
checks the branch, CI and the containers) and `/ship` (run before pushing, it audits the change
and walks the commit and pull request). Both assume the `gh` command-line tool is installed and
signed in to a GitHub repository you own; until that is true, skip them and use `verify.mjs`.
Their text is in [`.claude/commands/`](.claude/commands/).

**If you want to iterate quickly and do not have Go and golangci-lint installed**, the honest
shortcut is to run the development stack, which has both inside a container:

```bash
make dev-build      # first time
make dev            # after that; hot reload for Go and React, app on http://localhost:3001
```

Without `make`: `podman compose -f compose.yaml -f compose.dev.yaml up -d --build`.

`verify.mjs` then runs the backend checks inside that container on its own. The full development
loop is in [`docs/development.md`](docs/development.md).

**If you would rather have no gates at all** while you learn the code, delete the `"hooks"` block
from `.claude/settings.json`. You lose the safety net described above and nothing else; the
application does not depend on it. Put it back before you share your fork with anyone.

## Making it your own

The first things a new owner usually changes, and where each lives:

| Change | Where |
|---|---|
| The name shown in the app | `frontend/index.html` (title), `frontend/src/components/common/signal-suite-mark.tsx` (the lockup), `README.md` |
| Your own sections | Settings page in the running app; or the starter rows in `backend/migrations/006_seed_sections_terminals.sql` for a fresh database |
| Terminal models, kit types, statuses | `frontend/src/pages/*-constants.ts` and `backend/internal/shared/assetstatus/`; see [`.claude/context/domains/terminal.md`](.claude/context/domains/terminal.md) and [`kit.md`](.claude/context/domains/kit.md) |
| Column labels on kits (BLACK / SECRET / TS) | `frontend/src/pages/kit-constants.ts`, `frontend/src/components/common/csv-labels.ts`, `backend/internal/domain/kit/csv.go`; then `cd backend && go test ./internal/csvregistry -update` regenerates the shared column list (needs Go on the machine, or run it inside the dev container with `podman exec app go test ./internal/csvregistry -update`) |
| Real sign-in with Microsoft Entra ID | set `AUTH_ENABLED=true` and the `AUTH_*` variables; [`.claude/context/authz.md`](.claude/context/authz.md) explains the app registration |
| Your GitHub path in the repo's own commands | once this code lives in a repository of your own (a fork, or a new repository you pushed it to), replace `superrcharge/signal-suite-public` in `.claude/settings.json`, `.claude/commands/start.md`, `.claude/commands/ship.md` and `docs/self-hosting.md` with your `owner/repo` |
| The colours | `frontend/src/styles/catalog-tokens.css` and `frontend/src/theme/`; see [`.claude/context/patterns/frontend-page.md`](.claude/context/patterns/frontend-page.md) |

Two things to know before the first change:

- **Every database change is a numbered SQL file** in `backend/migrations/`, applied automatically
  when the app starts. Add a new file with the next number; never edit an old one on a database
  that has already run it. The first line must be `-- +goose Up`.
- **CSV columns are declared once per domain** in `<domain>/csv.go`. Export, import and the
  template all read that one declaration, and a Go test regenerates the front end's copy.

## When something is wrong

- The app shows a blank page or every list is empty: read `make selfhost-logs` (without `make`:
  `podman compose -p asset-tracker --env-file .env.selfhost -f compose.selfhost.yaml logs -f`). Most often the
  database password changed after the first run; `docs/self-hosting.md` has the fix.
- `verify.mjs` fails on a step you did not touch: read the step's output before changing code.
  The docs-agree-with-code check in particular fails when prose names a file or version that
  moved, and the fix is in the prose.
- You are stuck on `main` and the AI cannot edit: `git checkout -b feat/first-change`.

## Credit

Created by Michael Charge in 2026. MIT licensed, see [`LICENSE`](LICENSE). Take it, change it,
ship it; a line in your README saying where it came from is appreciated but not required.

# Development Guide

> Not developing, just want it running on your own machine? That is [`self-hosting.md`](self-hosting.md).

The local stack runs through Docker Compose: Postgres + the Go backend (with Air hot-reload) + a Vite dev server proxied to by the backend. Auth is bypassed by default (`AUTH_ENABLED=false`). For Entra-enabled local validation see [`.claude/context/authz.md`](../.claude/context/authz.md#local-dev---entra-auth-enabled-validation-only).

## Quick start

```bash
make dev-build          # first time: build + start
make dev                # subsequent starts
make logs               # tail all services
make stop               # stop containers
make stop-v             # stop + remove volumes (resets DB)
```

The Makefile is the documented interface, but it is a thin wrapper - every target below is one compose
command. Where `make` is not installed, or the host runs podman rather than docker, run them directly:

```bash
podman compose -f compose.yaml -f compose.dev.yaml up -d --build          # dev-build
podman compose -f compose.yaml -f compose.dev.yaml up -d                  # dev
podman compose -f compose.yaml -f compose.dev.yaml logs -f app            # logs
podman compose -f compose.yaml -f compose.dev.yaml down                   # stop
podman compose -f compose.yaml -f compose.dev.yaml down -v                # stop-v
```

Use the compose command the Makefile picks (`podman-compose` if installed, else `podman compose`, or `docker compose` on a Docker host) - the compose
files are the same.

Three containers come up:

- **app** - Go backend with Air (`backend/.air.toml`), port 3001
- **postgresql** - PostgreSQL 16, matching `compose.selfhost.yaml` and CI's service container, so a migration cannot pass locally and fail on the server people run. Empty once migrations have run, port 5432. No rows are seeded beyond the starter sections. The backend's `make dev` Makefile target uses `compose.yaml` + `compose.dev.yaml` - production-shape `compose.yaml` alone would build the prod image instead.

## Hot-reload

### Frontend (Vite HMR)

Edits in `frontend/src/` are reflected within the Vite dev server immediately. The backend proxies non-API requests to `frontend:5173`, so the dev URL is `http://localhost:3001/` (or `http://localhost:5173/` directly if you prefer to bypass the backend).

### Backend (Air with polling)

Air uses **polling mode** rather than fsnotify, which works reliably across Docker volume mounts on macOS/Windows:

```toml
# backend/.air.toml
[build]
  poll = true
  poll_interval = 500   # check for changes every 500ms
```

Edit a `.go` file under `backend/` → Air detects within ~500ms → rebuild + restart. First build is ~3–5s on container start; subsequent rebuilds are ~1–2s.

If a backend change isn't picked up:

```bash
podman logs app --tail 50    # confirm Air saw the change
podman restart app           # nuclear option
```

## Health probes

```bash
curl http://localhost:3001/health             # backend liveness
curl http://localhost:3001/ready              # backend readiness
curl http://localhost:3001/api/v1/sections    # auth-bypassed, returns 200
curl http://localhost:5173                    # Vite dev server
```

`podman ps` shows each container's health status. Postgres reports healthy via `pg_isready`; backend via the `/health` HTTP probe; Vite via a basic root check.

## Service URLs

- **Backend API + proxied SPA**: http://localhost:3001
- **Vite dev server (direct)**: http://localhost:5173
- **PostgreSQL**: localhost:5432 (postgres / postgres)

## Common issues

### Port already in use

```bash
make stop                         # graceful
podman compose -f compose.yaml -f compose.dev.yaml down -v   # forceful + reset volumes
```

### Backend can't reach Postgres on startup

Confirm Postgres is healthy first: `podman logs postgresql --tail 20`. The backend depends on `postgresql` being healthy; `make dev` enforces that ordering, but a manual `podman start app` won't. The `app` healthcheck has a 60s `start_period` because Air compiles Go on boot, so give it a minute before assuming failure.

### Migrations not applied

Migrations run automatically on backend startup (`backend/main.go` calls `migrations.Run`). If you suspect a migration didn't apply:

```bash
podman exec -it postgresql psql -U postgres -d app -c '\dt'
podman exec -it postgresql psql -U postgres -d app -c 'SELECT * FROM goose_db_version ORDER BY id;'
```

### Frontend container fails on startup

Usually a `node_modules` mismatch after `package.json` changes.

`node_modules` lives in an anonymous volume inside the container and is a **separate tree from the host's**, which is the one `scripts/verify.mjs` exercises. Installing a dependency in only one of the two leaves `package.json` advertising a version nothing local ever runs, and CI becomes the first thing to install it:

```bash
podman exec frontend-dev sh -c "cd /app && npm install <pkg>"   # container tree
cd frontend && npm install <pkg>                                # host tree
```

Rebuild:

```bash
make stop
make dev-build
```

## Debugging

```bash
# Container logs
podman logs app
podman logs frontend-dev
podman logs postgresql

# Shell into a running container
podman exec -it app sh
podman exec -it frontend-dev sh

# Rebuild a specific service
podman compose -f compose.yaml -f compose.dev.yaml build app
podman compose -f compose.yaml -f compose.dev.yaml up -d app
```

## Tests

```bash
# Backend (host-side; go.mod's directive is the floor - currently go 1.26.8)
cd backend && go test ./...
cd backend && make test-integration   # integration tests against postgres container

# Frontend (host-side; package.json engines says node >=24, CI runs 26)
cd frontend && npm run test
cd frontend && npm run test:ui        # vitest UI
```

The Go directive is not just a language-version statement: CI resolves its toolchain with
`go-version-file: backend/go.mod` and installs the **exact** patch named there, so it decides which
stdlib govulncheck scans. `scripts/preflight-versions.mjs` holds that and eleven other version
relationships - run it before pushing, it takes about two seconds and compiles nothing.

There is no end-to-end suite. The previous Playwright suite was bound to the retired
Keycloak + oauth2-proxy stack and was removed; a replacement targeting Entra has not
been written.

## Pushing changes

```bash
node scripts/verify.mjs               # the single verification command - runs everything CI runs
make scan                             # gosec + govulncheck + npm audit
make setup-hooks                      # install pre-push hook (which calls verify.mjs)
```

`verify.mjs` writes `.claude/.verify-receipt.json` on success. CI runs the same checks plus a Trivy
filesystem scan on every PR - see `.github/workflows/ci.yml`.

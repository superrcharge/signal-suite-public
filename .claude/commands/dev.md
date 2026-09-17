# /dev - Local development environment

Start, rebuild, or tear down the containerized dev stack with Podman Compose.

---

## ⛔ Machine rules (do not violate)

- Use the same compose command the Makefile would: `podman-compose` if it is installed, otherwise `podman compose`, or `docker compose` on a Docker host. Mixing two of them against one project name confuses their state.
- **If `make` is not installed**, every target is a one-line compose command; run that directly. The compose file headers name the target they correspond to.
- **Never run `npm install` on the host** for this flow. `node_modules` lives in an anonymous volume inside the `frontend-dev` container. Install into the container instead:
  ```bash
  podman exec frontend-dev sh -c "cd /app && npm install <pkg>"
  ```

---

## Services

| Service | Container | Port | Notes |
|---|---|---|---|
| `app` | `app` | 3001 | Go backend (Air hot-reload). **This is the URL you open.** |
| `frontend` | `frontend-dev` | 5173 | Vite dev server; the backend proxies to it (`FRONTEND_MODE=proxy`) |
| `postgresql` | `postgresql` | 5432 | postgres/postgres, db `app` |

Open **http://localhost:3001** - not 5173. The backend proxies the Vite server, so 3001 is the whole app. Auth is bypassed in dev (`AUTH_ENABLED=false`).

5173 fails quietly: the SPA renders fine but every `/api` call returns the index shell, so all lists show zero rows and no error. Vite has no `/api` proxy by design - it was removed deliberately so auth headers reach the backend directly. An app that looks empty is the symptom of the wrong port, not of an empty database.

---

## Start

```bash
podman compose -f compose.yaml -f compose.dev.yaml up -d --build
```

The `app` healthcheck has a 60s `start_period` because Air compiles Go on boot. Give it a minute before assuming failure.

## Rebuild after dependency or Dockerfile changes

```bash
podman compose -f compose.yaml -f compose.dev.yaml up -d --build --force-recreate
```

## Stop

```bash
podman compose -f compose.yaml -f compose.dev.yaml down
```

Add `-v` to also drop the `postgresql-data` volume - **this wipes the local database** and migrations re-run from scratch on next start.

## Logs

```bash
podman compose -f compose.yaml -f compose.dev.yaml logs -f app
```

Swap `app` for `frontend` or `postgresql` as needed.

---

## Entra-auth mode (validate against your own tenant locally)

```bash
podman compose -f compose.yaml -f compose.dev.yaml -f compose.dev.entra.yaml up -d
```

Requires two gitignored files that must never be committed:
- `.env.entra.local` at the repo root - `AUTH_TENANT_ID`, `AUTH_CLIENT_ID`
- `frontend/.env.local` - the `VITE_AUTH_*` values

`AUTH_AUTHORITY_HOST` is set inline (not sensitive).

---

## Health check

```bash
curl http://localhost:3001/health
```

Expect `200`. API routes are versioned - `/api/v1/<domain>`, not `/api/<domain>`:

```bash
curl -i http://localhost:3001/api/v1/sections
```

With `AUTH_ENABLED=false` this returns data rather than the `401` you would get in a deployed environment.

## Migrations

Migrations run automatically on `app` container start (`backend/main.go` → `migrations.Run`). A failed migration crashes the container and the healthcheck never goes green - check `logs -f app` first when the stack won't come up.

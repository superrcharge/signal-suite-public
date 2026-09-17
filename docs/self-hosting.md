# Self-hosting

Run the app on one machine you control: a laptop, a NAS, a spare desktop. No cloud account, no
identity provider, nothing installed on the host except a container runtime. This is the
production image, built from `Dockerfile.prod` on your machine, plus a PostgreSQL container beside it.

For the hot-reload development stack see [`development.md`](development.md). For the environment
variables the image reads see the table in the [README](../README.md#environment-variables).

## Who this is for

- You want to try the app, or run it for a small team on a private network.
- You do not have, or do not want to involve, Azure or Microsoft Entra ID.

If you do have Entra ID and want real sign-in, the same image supports it: set `AUTH_ENABLED=true`
plus `AUTH_TENANT_ID`, `AUTH_CLIENT_ID` and `AUTH_AUTHORITY_HOST`. That is not covered here; the
[authorization notes](../.claude/context/authz.md) explain the app registration.

## Prerequisites

| Need | Why |
|---|---|
| **Podman or Docker, with compose** | The only hard requirement. `podman compose`, `podman-compose` and `docker compose` all work; the Makefile picks whichever is installed. |
| `make` | Optional. Every target below is a one-line compose command, shown alongside. |
| `git` | To clone and to pull updates. |
| Node | **Not** needed to run the app. Only for the optional smoke test at the end. |
| About 2 GB of RAM and a few GB of disk | The image build compiles the frontend and the Go binary inside a container. |

## First run

1. Clone the repository and enter it:

   ```bash
   git clone https://github.com/superrcharge/signal-suite-public.git
   cd signal-suite-public
   ```

2. Create the env file and set a database password. Anything will do; it never leaves the
   compose network.

   ```bash
   cp .env.selfhost.example .env.selfhost
   ```

   Open `.env.selfhost` and change `POSTGRES_PASSWORD=change-me`.

3. Build the image and start both containers. The first build compiles the frontend and the
   backend, so it takes a few minutes; later builds reuse layers.

   ```bash
   make selfhost-build
   ```

   Without `make`:

   ```bash
   podman compose -p asset-tracker --env-file .env.selfhost -f compose.selfhost.yaml up -d --build --force-recreate app
   ```

   `--force-recreate app` is not decoration: podman-compose rebuilds the image on `--build` but
   keeps the old container running unless told otherwise, so without it an upgrade looks applied
   and is not.

4. Watch the database migrations apply. They run every time the app container starts, and on a
   fresh database they create every table.

   ```bash
   make selfhost-logs
   ```

   You are looking for a line saying the migrations completed and the server is listening on
   `:3001`. Press `Ctrl+C` to stop following; the containers keep running.

5. Open <http://127.0.0.1:3001>.

You are signed in as the built-in admin. There is nothing to log in to, and no user to create.

## What "auth off" means

`compose.selfhost.yaml` sets `AUTH_ENABLED=false`. In that mode:

- Nobody signs in. Every request is treated as coming from one built-in administrator.
- Every role check passes, so every visitor can do everything an admin can: create, edit, delete,
  import, change sections, manage tags.
- The Users page and the Audit Log still work, but every action is attributed to that one
  built-in account.

There is no middle ground short of Entra ID: it is either "no sign-in, everyone is admin" or
"Entra sign-in with app-local roles". Plan the network around that.

## Exposing it safely

By default the app is published on `127.0.0.1` only, so it is reachable from the machine it runs
on and nowhere else. To reach it from other devices, pick one of these, in order of preference:

1. **A VPN or overlay network** such as Tailscale or WireGuard. Leave `SELFHOST_BIND=127.0.0.1`
   alone and reach the machine over the tunnel, or bind to the tunnel interface's address.
2. **A reverse proxy with its own authentication** (Caddy, nginx, Traefik) on the same machine,
   forwarding to `127.0.0.1:3001`. Basic auth or forward-auth in the proxy is what stands in for
   sign-in. If the proxy is on a non-private address, set `TRUSTED_PROXIES` in `.env.selfhost` to
   its address so rate limiting keys on the real client.
3. **Binding to the LAN** with `SELFHOST_BIND=0.0.0.0` (or the machine's LAN address). Only on a
   network where everyone who can reach the port is allowed to administer the app.

Never put `SELFHOST_BIND=0.0.0.0` on a machine with a public address.

## Backups and restore

Everything lives in the PostgreSQL volume. Back it up with a plain SQL dump:

```bash
make selfhost-backup
```

That writes `backups/asset-tracker-<timestamp>.sql` (the folder is gitignored). Without `make`:

```bash
mkdir -p backups && podman compose -p asset-tracker --env-file .env.selfhost -f compose.selfhost.yaml \
  exec -T postgresql pg_dump -U postgres app > backups/asset-tracker-manual.sql
```

To restore into a fresh database:

```bash
make selfhost-stop
podman compose -p asset-tracker --env-file .env.selfhost -f compose.selfhost.yaml down -v
make selfhost
podman compose -p asset-tracker --env-file .env.selfhost -f compose.selfhost.yaml \
  exec -T postgresql psql -U postgres app < backups/asset-tracker-<timestamp>.sql
```

The `down -v` drops the volume. Restore only after the app container has started once against
the empty database, so the schema exists before the dump's rows arrive; `make selfhost-logs`
shows when migrations have finished.

## Upgrades

```bash
make selfhost-backup
git pull
make selfhost-build
```

Migrations apply on boot. If a migration fails the app container exits, and `restart:
unless-stopped` will keep trying; read `make selfhost-logs` and restore the backup if needed.

## What does not work off-cloud

| Feature | Behaviour without Azure |
|---|---|
| Equipment photo upload | The upload control returns 501. Everything else about the catalog works. Set `AZURE_STORAGE_URL` to an Azure Blob container to enable it. |
| Sign-in and per-user roles | Off. See "What auth off means" above. |
| Managed-identity Postgres auth | Not applicable; the container uses `DB_PASSWORD`. |

## Smoke test

Without Node:

```bash
curl -fsS http://127.0.0.1:3001/health && curl -fsS http://127.0.0.1:3001/ready && echo ok
```

With Node 26 installed, the repo's own post-deploy check proves the SPA actually boots, not just
that the server answers:

```bash
node scripts/verify-deploy.mjs --url http://127.0.0.1:3001 --auth-disabled --boot
```

`--boot` needs a Chrome or Chromium binary on the machine; it sets `CHROME_PATH` if the default
is not found.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `set POSTGRES_PASSWORD in .env.selfhost` | The env file is missing or the password line is empty. Copy the example and set it. |
| Port already in use | Something else has 3001. Set `SELFHOST_PORT` in `.env.selfhost` and start again. |
| App container restarts in a loop | Read `make selfhost-logs`. Usually the database password changed after the volume was created; either put the old password back or `down -v` to start fresh (after a backup). |
| Rootless podman refuses a port below 1024 | Keep `SELFHOST_PORT` at 1024 or above, or put a reverse proxy in front. |
| Page loads but every list is empty | Expected on a fresh database. The migrations create a few starter sections and nothing else; add terminals, or import a CSV from the header's share menu. |

## Uninstall

```bash
make selfhost-stop
podman compose -p asset-tracker --env-file .env.selfhost -f compose.selfhost.yaml down -v
podman rmi asset-tracker:selfhost
```

The `down -v` removes the database volume, so back up first if you want the data.

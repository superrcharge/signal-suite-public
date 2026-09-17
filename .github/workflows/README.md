# GitHub Actions workflows

This directory holds every CI/CD workflow for Asset Tracker. There are three, and they split
into two groups:

- **CI** - runs on every PR and push to `main` (lint, test, scan)
- **Release** - `release.yml` would build the production image on a version tag and publish it to
  GHCR. This repository does not cut releases, so it has never run; it is kept in case a fork
  wants it. Running the app does not need it: see [`docs/self-hosting.md`](../../docs/self-hosting.md).

## Quick reference

| Workflow | Trigger | What it does |
|---|---|---|
| [`ci.yml`](#ciyml) | PR + push to `main` | Backend + frontend + security checks |
| [`security.yml`](#securityyml) | Push to `main` + weekly cron | Trivy + govulncheck |
| [`release.yml`](#releaseyml) | `v*` tag | Build + Trivy scan + push to GHCR |

---

## `ci.yml`

**Trigger:** every pull request, every push to `main`.

**Jobs** (six; the five marked required are the status checks `main` insists on):
- `preflight` - `scripts/preflight-versions.mjs` and `scripts/check-docs.mjs`: version pins agree with each other and the prose agrees with the code, before anything is compiled
- `backend` (required) - golangci-lint, `go build`, unit tests, goose migrations, integration tests against ephemeral PostgreSQL service container
- `frontend` (required) - ESLint, `tsc --noEmit`, Vitest, `npm audit --audit-level=high`
- `scripts` (required, shown as **Script tests**) - the `.test.mjs` suites under `scripts/lib/`, then `scripts/check-csv-coverage.mjs`
- `style` (required, shown as **Style**) - the em dash gate over lines the PR adds. Pull requests only, so it is absent from the run a push to `main` produces
- `security-scan` (required, shown as **Security Scan**) - Trivy filesystem scan (CRITICAL/HIGH fail the build) + govulncheck

**How to run:** automatic. Open a PR or push to `main`. To trigger manually for a branch, push a no-op commit.

---

## `security.yml`

**Trigger:** push to `main`, plus weekly schedule (`0 6 * * 1` - Monday 06:00 UTC).

**Jobs:**
- `trivy` - Trivy filesystem scan (CRITICAL/HIGH)
- `govulncheck` - Go vulnerability database scan against `backend/`

Catches vulnerabilities published after the last commit landed.

**How to run:** automatic. To trigger ad-hoc, push to main or wait for Monday's cron.

---

## `release.yml`

**Trigger:** `v*` tag push.

**What it does:**
- Builds `Dockerfile.prod` via Docker Buildx with GHA cache
- Loads the image locally and runs Trivy scan (CRITICAL/HIGH fails the build)
- Pushes to GHCR as `ghcr.io/<owner>/asset-tracker:<version>` (plus `:<major>.<minor>` and `:latest` on non-prerelease tags). The owner is whoever owns the repository the tag was pushed to
- Creates a GitHub Release using `CHANGELOG.md`

**Runs on:** `ubuntu-latest`, `environment: release`. A containerised self-hosted runner will not do here: it has no Docker daemon and lacks the capabilities rootless podman needs.

**Required permissions/secrets:** uses default `GITHUB_TOKEN` for GHCR + Release creation (no extra secrets).

**How to run:**
```bash
git tag v1.0.0
git push origin v1.0.0
```

Or via UI: Releases, Draft a new release, choose tag, Publish (the tag push triggers the workflow).

**Prerequisite for the image to be pullable by others:** GHCR packages are private by default.
After the first release, open the package on GitHub (Packages, `asset-tracker`, Package settings) and
set its visibility to public, or grant read access to the people who will pull it.

---

## If you ever do cut a release

1. Merge the PR that adds the `CHANGELOG.md` entry.
2. Tag the merge commit and push the tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   `release.yml` builds, scans, pushes to GHCR, creates the GitHub Release. Wait for it to complete.
3. Wherever the app runs, pull the new image and restart. For the compose stack in
   [`docs/self-hosting.md`](../../docs/self-hosting.md) that is `git pull` followed by
   `make selfhost-build`.
4. Confirm it is serving, not merely restarted:
   ```bash
   node scripts/verify-deploy.mjs --url http://127.0.0.1:3001 --auth-disabled --boot
   ```
   Drop `--auth-disabled` if the instance runs with Entra sign-in on.

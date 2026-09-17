# Container runtime detection (docker or podman)
CONTAINER_RUNTIME := $(shell command -v podman >/dev/null 2>&1 && echo podman || echo docker)
COMPOSE_CMD := $(shell command -v podman-compose >/dev/null 2>&1 && echo podman-compose || echo "$(CONTAINER_RUNTIME) compose")

# Compose files
COMPOSE_FILE := compose.yaml
COMPOSE_DEV_FILE := compose.dev.yaml

.PHONY: help dev dev-build dev-entra prod prod-build stop stop-v logs logs-app logs-frontend \
        selfhost selfhost-build selfhost-stop selfhost-logs selfhost-backup \
        frontend-install frontend-build frontend-test frontend-check \
        setup-hooks scan scan-backend scan-frontend seed-nets

## help: Show this help message
help:
	@echo "Container Runtime: $(CONTAINER_RUNTIME)"
	@echo "Compose Command: $(COMPOSE_CMD)"
	@echo ""
	@echo "Development targets (hot reload):"
	@echo "  dev              - Start dev environment, auth bypassed (AUTH_ENABLED=false)"
	@echo "  dev-build        - Rebuild and start dev environment, auth bypassed"
	@echo "  dev-entra        - Start dev environment with Entra auth enabled (your own tenant)"
	@echo "  logs             - Follow logs for all services"
	@echo "  logs-app         - Follow logs for app service only"
	@echo "  logs-frontend    - Follow logs for frontend service only"
	@echo ""
	@echo "Production targets:"
	@echo "  prod             - Build frontend and start production environment"
	@echo "  prod-build       - Rebuild all and start production environment"
	@echo ""
	@echo "Self-hosting (no cloud account, nothing but a container runtime):"
	@echo "  selfhost         - Start the self-hosted stack (prod image + Postgres, auth off)"
	@echo "  selfhost-build   - Rebuild the image and start (after git pull)"
	@echo "  selfhost-stop    - Stop it (data volume kept)"
	@echo "  selfhost-logs    - Follow its logs"
	@echo "  selfhost-backup  - pg_dump the database to backups/"
	@echo ""
	@echo "Dev data:"
	@echo "  seed-nets        - Seed the Nets Library with sample data (localhost only)"
	@echo ""
	@echo "Common targets:"
	@echo "  stop             - Stop all containers"
	@echo "  stop-v           - Stop all containers and remove volumes"
	@echo ""
	@echo "Frontend targets (local, non-containerized):"
	@echo "  frontend-install - Install frontend dependencies"
	@echo "  frontend-build   - Build frontend for production"
	@echo "  frontend-test    - Run frontend tests"
	@echo "  frontend-check   - Run lint, typecheck, and tests"
	@echo ""
	@echo "Quality targets:"
	@echo "  setup-hooks      - Install git pre-push hooks"
	@echo "  scan             - Security scan (backend + frontend)"
	@echo "  scan-backend     - Go gosec + govulncheck"
	@echo "  scan-frontend    - npm audit (high+)"
	@echo ""

# =============================================================================
# Development (hot reload)
# =============================================================================

## dev: Start development environment with hot reload (auth bypassed)
dev:
	@echo "==> Starting development environment with hot reload..."
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) up -d
	@echo ""
	@echo "Development environment started!"
	@echo "  - App:       http://localhost:3001  (auth bypassed)  <- open this"
	@echo "  - Vite:      internal, proxied by the backend. Opening :5173 directly"
	@echo "               renders the SPA but every /api call returns the index"
	@echo "               shell, so every list shows zero rows and no error."
	@echo ""
	@echo "Use 'make logs' to follow logs."

## dev-build: Rebuild and start development environment (auth bypassed)
dev-build:
	@echo "==> Rebuilding development environment..."
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) up -d --build
	@echo ""
	@echo "Development environment rebuilt!"
	@echo "  - App:       http://localhost:3001  (auth bypassed)  <- open this"
	@echo "  - Vite:      internal, proxied by the backend. Do not open :5173."

## dev-entra: Start dev environment with Entra auth enabled (your own tenant). Always rebuilds to avoid stale node_modules / image layers.
dev-entra:
	@if [ ! -f .env.entra.local ]; then \
		echo "ERROR: .env.entra.local not found at repo root."; \
		echo "Create it with AUTH_TENANT_ID and AUTH_CLIENT_ID - see .claude/context/authz.md."; \
		exit 1; \
	fi
	@if [ ! -f frontend/.env.local ]; then \
		echo "ERROR: frontend/.env.local not found."; \
		echo "Create it with VITE_AUTH_* - see .claude/context/authz.md."; \
		exit 1; \
	fi
	@echo "==> Stopping any existing stack (drops node_modules anonymous volume)..."
	@$(COMPOSE_CMD) -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) -f compose.dev.entra.yaml down -v --remove-orphans 2>/dev/null || true
	@echo "==> Starting dev environment with Entra auth - rebuilding images..."
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) -f compose.dev.entra.yaml up -d --build
	@echo ""
	@echo "Entra dev environment started!"
	@echo "  - App: http://localhost:3001  (load via :3001, since the backend proxies the SPA from Vite and handles /api)"
	@echo "  - SPA app reg must list http://localhost:3001/ as a SPA redirect URI."

# =============================================================================
# Production
# =============================================================================

## prod: Build frontend and start production environment (auth bypassed)
prod: frontend-build
	@echo "==> Starting production environment..."
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) up -d
	@echo ""
	@echo "Production environment started!"
	@echo "  - App: http://localhost:3001  (auth bypassed)"

## prod-build: Rebuild all and start production environment (auth bypassed)
prod-build: frontend-build
	@echo "==> Rebuilding production environment..."
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) up -d --build

# =============================================================================
# Self-hosting: compose.selfhost.yaml, see docs/self-hosting.md
# =============================================================================

SELFHOST_FILE    := compose.selfhost.yaml
SELFHOST_ENV     := .env.selfhost
SELFHOST_COMPOSE := $(COMPOSE_CMD) -p asset-tracker --env-file $(SELFHOST_ENV) -f $(SELFHOST_FILE)

## selfhost: Start the self-hosted stack (prod image + Postgres, auth off)
selfhost:
	@if [ ! -f $(SELFHOST_ENV) ]; then \
		echo "ERROR: $(SELFHOST_ENV) not found."; \
		echo "Run: cp .env.selfhost.example $(SELFHOST_ENV)   and set POSTGRES_PASSWORD."; \
		exit 1; \
	fi
	$(SELFHOST_COMPOSE) up -d
	@echo ""
	@echo "Self-hosted stack started."
	@echo "  - App: http://127.0.0.1:3001 (or the SELFHOST_BIND/SELFHOST_PORT you set)"
	@echo "  - No sign-in: every visitor is admin. Read docs/self-hosting.md before exposing it."

## selfhost-build: Rebuild the image and start the self-hosted stack (after git pull).
## --force-recreate matters: podman-compose rebuilds the image on --build but keeps the OLD
## container running unless told otherwise, so without it a pull looks applied and is not.
selfhost-build:
	@if [ ! -f $(SELFHOST_ENV) ]; then \
		echo "ERROR: $(SELFHOST_ENV) not found."; \
		echo "Run: cp .env.selfhost.example $(SELFHOST_ENV)   and set POSTGRES_PASSWORD."; \
		exit 1; \
	fi
	@echo "==> Building the production image (frontend + backend, inside the container)..."
	$(SELFHOST_COMPOSE) up -d --build --force-recreate app
	@echo ""
	@echo "Self-hosted stack rebuilt and started. Migrations run on boot: make selfhost-logs"

## selfhost-stop: Stop the self-hosted stack, keeping the data volume
selfhost-stop:
	$(SELFHOST_COMPOSE) down

## selfhost-logs: Follow the self-hosted stack's logs
selfhost-logs:
	$(SELFHOST_COMPOSE) logs -f

## selfhost-backup: pg_dump the self-hosted database to backups/asset-tracker-<timestamp>.sql
selfhost-backup:
	@mkdir -p backups
	$(SELFHOST_COMPOSE) exec -T postgresql pg_dump -U postgres app > backups/asset-tracker-$$(date +%Y%m%d-%H%M%S).sql
	@ls -la backups | tail -1

# =============================================================================
# Logging
# =============================================================================

## logs: Follow logs for all services
logs:
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) logs -f

## logs-app: Follow logs for app service only
logs-app:
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) logs -f app

## logs-frontend: Follow logs for frontend service only
logs-frontend:
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) logs -f frontend

# =============================================================================
# Stop
# =============================================================================

## stop: Stop all containers
stop:
	@echo "==> Stopping containers..."
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) down

## stop-v: Stop all containers and remove volumes
stop-v:
	@echo "==> Stopping containers and removing volumes..."
	$(COMPOSE_CMD) -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) down -v

# =============================================================================
# Frontend (local, non-containerized)
# =============================================================================

## frontend-install: Install frontend dependencies
frontend-install:
	@echo "==> Installing frontend dependencies..."
	cd frontend && npm install

## frontend-build: Build frontend for production
frontend-build:
	@echo "==> Building frontend..."
	cd frontend && npm ci && npm run build

## frontend-test: Run frontend tests
frontend-test:
	@echo "==> Running frontend tests..."
	cd frontend && npm run test -- --run

## frontend-check: Run frontend lint, typecheck, and tests
frontend-check:
	@echo "==> Running frontend checks..."
	cd frontend && npm run lint && npm run typecheck && npm run test -- --run

# =============================================================================
# Quality (hooks, security scans)
# =============================================================================

## setup-hooks: Install git pre-push hooks from scripts/hooks/
setup-hooks:
	@echo "==> Installing git hooks..."
	@bash scripts/setup-hooks.sh

## scan: Run backend + frontend security scans
scan: scan-backend scan-frontend

## scan-backend: Run Go security scans (gosec + govulncheck)
#
# Both tools are pinned, for the reason stated three times in .github/workflows:
# an unpinned install is a build that changes with no commit behind it, and a new
# major requiring a newer Go breaks the target with nothing in the history to
# explain it. GOVULNCHECK_VERSION matches ci.yml and security.yml deliberately -
# raise all three together.
#
# Installed unconditionally rather than behind `command -v`. The old guard meant
# whatever version the very first run happened to fetch was frozen on that
# machine forever, which is the reproducibility failure and the staleness failure
# at the same time. The vulnerability database is fetched at run time, so pinning
# the binary does not freeze what it knows about.
GOSEC_VERSION       := v2.29.0
GOVULNCHECK_VERSION := v1.7.0

scan-backend:
	@echo "==> Backend security scan..."
	@export PATH="$$PATH:$$(go env GOPATH)/bin" && cd backend && \
		go install github.com/securego/gosec/v2/cmd/gosec@$(GOSEC_VERSION) && \
		go install golang.org/x/vuln/cmd/govulncheck@$(GOVULNCHECK_VERSION) && \
		gosec ./... && \
		govulncheck ./...

## scan-frontend: Run npm audit (high+)
scan-frontend:
	@echo "==> Frontend security scan..."
	@cd frontend && npm audit --audit-level=high

## seed-nets: Seed the Nets Library with sample data (localhost only)
seed-nets:
	@node scripts/seed-dev-nets.mjs

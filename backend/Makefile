# Database connections (same PostgreSQL instance)
DB_HOST ?= localhost
DB_PORT ?= 5432
DB_USER ?= postgres
DB_PASSWORD ?= postgres
DB_NAME ?= app
DB_TEST_NAME ?= app_test
DB_CONTAINER ?= postgresql

DB_URL ?= postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)?sslmode=disable
DB_TEST_URL ?= postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_TEST_NAME)?sslmode=disable

# Container runtime (docker or podman)
CONTAINER_RT := $(shell which docker 2>/dev/null || which podman 2>/dev/null)

# Goose binary (check GOPATH/bin)
GOOSE := $(shell which goose 2>/dev/null || echo "$(shell go env GOPATH)/bin/goose")

.PHONY: help build run test test-integration migrate-up migrate-down migrate-status migrate-create \
        test-db-create test-db-drop test-db-setup test-db-teardown

help:
	@echo "Available targets:"
	@echo "  build              - Build the application"
	@echo "  run                - Run the application"
	@echo "  test               - Run unit tests only"
	@echo "  test-integration   - Run integration tests (creates test db, runs tests, tears down)"
	@echo "  migrate-up         - Run database migrations (dev)"
	@echo "  migrate-down       - Rollback last migration (dev)"
	@echo "  migrate-status     - Show migration status (dev)"
	@echo "  migrate-create     - Create new migration"

build:
	go build -o bin/server .

# ALLOW_INSECURE_DB is set here because this target carries no environment at
# all - it lives entirely on the defaults in config.Load(), which is exactly
# why it is the easiest path to forget. DB_PASSWORD no longer defaults to the
# literal "postgres", so it has to be passed too.
run:
	ALLOW_INSECURE_DB=true DB_PASSWORD=$(DB_PASSWORD) go run .

# Unit tests only (no database required)
test:
	go test ./...

# Integration tests - creates test db, runs migrations, runs tests, tears down
test-integration: test-db-setup
	@echo "Running integration tests..."
	@DB_HOST=$(DB_HOST) DB_PORT=$(DB_PORT) DB_NAME=$(DB_TEST_NAME) DB_USER=$(DB_USER) DB_PASSWORD=$(DB_PASSWORD) \
		ALLOW_INSECURE_DB=true \
		go test -tags=integration -v ./... || ($(MAKE) test-db-teardown && exit 1)
	@$(MAKE) test-db-teardown

# Test database lifecycle (uses container exec)
test-db-create:
	@echo "Creating test database $(DB_TEST_NAME)..."
	@$(CONTAINER_RT) exec $(DB_CONTAINER) psql -U $(DB_USER) -c "DROP DATABASE IF EXISTS $(DB_TEST_NAME);" 2>/dev/null || true
	@$(CONTAINER_RT) exec $(DB_CONTAINER) psql -U $(DB_USER) -c "CREATE DATABASE $(DB_TEST_NAME);"

test-db-drop:
	@echo "Dropping test database $(DB_TEST_NAME)..."
	@$(CONTAINER_RT) exec $(DB_CONTAINER) psql -U $(DB_USER) -c "DROP DATABASE IF EXISTS $(DB_TEST_NAME);" 2>/dev/null || true

test-db-setup: test-db-create
	@echo "Running migrations on test database..."
	$(GOOSE) -dir migrations postgres "$(DB_TEST_URL)" up

test-db-teardown: test-db-drop
	@echo "Test database cleaned up."

# Development database migrations
migrate-up:
	$(GOOSE) -dir migrations postgres "$(DB_URL)" up

migrate-down:
	$(GOOSE) -dir migrations postgres "$(DB_URL)" down

migrate-status:
	$(GOOSE) -dir migrations postgres "$(DB_URL)" status

migrate-create:
	@if [ -z "$(name)" ]; then echo "Usage: make migrate-create name=migration_name"; exit 1; fi
	$(GOOSE) -dir migrations create $(name) sql

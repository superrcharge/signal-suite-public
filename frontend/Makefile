.PHONY: install dev build test test-ui test-coverage lint typecheck clean

# Install dependencies
install:
	npm install

# Start development server
dev:
	npm run dev

# Build for production
build:
	npm run build

# Run tests
test:
	npm run test

# Run tests with UI
test-ui:
	npm run test:ui

# Run tests with coverage
test-coverage:
	npm run test:coverage

# Lint code
lint:
	npm run lint

# Type check
typecheck:
	npm run typecheck

# Preview production build
preview:
	npm run preview

# Clean build artifacts
clean:
	rm -rf dist node_modules coverage .eslintcache

# Install and start dev server
start: install dev

# Full check (lint, typecheck, test)
check: lint typecheck test

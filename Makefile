.DEFAULT_GOAL := help
COMPOSE := docker compose -f infra/docker-compose.yml --env-file .env

.PHONY: help setup dev dev-infra dev-api dev-web down test lint typecheck types types-check format

help: ## Show targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'

setup: ## Install all dependencies and git hooks
	@test -f .env || cp .env.example .env
	cd apps/api && uv sync
	pnpm install
	pre-commit install

dev-infra: ## Start postgres + redis only
	$(COMPOSE) up -d postgres redis

dev: ## Full stack in docker (postgres, redis, api, web) with hot reload
	$(COMPOSE) up --build

dev-api: dev-infra ## API on host with reload (needs `make setup`)
	cd apps/api && uv run uvicorn app.main:app --reload --port 8000

dev-web: ## Web on host with reload
	pnpm dev

down: ## Stop the compose stack
	$(COMPOSE) down

test: ## Run API (pytest) and web (vitest) tests
	cd apps/api && uv run pytest
	pnpm test

lint: ## ruff + eslint
	cd apps/api && uv run ruff check . && uv run ruff format --check .
	pnpm lint

format: ## Auto-format API code
	cd apps/api && uv run ruff check --fix . && uv run ruff format .

typecheck: ## mypy + tsc
	cd apps/api && uv run mypy .
	pnpm typecheck

types: ## Regenerate TS types from the FastAPI OpenAPI schema
	node scripts/generate-types.mjs

types-check: ## Fail if committed TS types are stale (used in CI)
	node scripts/generate-types.mjs --check

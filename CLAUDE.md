# ExploreAI — engineering rules for Claude sessions

Read `docs/project-memory/NEXT_SESSION.md` first, then `IMPLEMENTATION_STATUS.md` (§S2 is newest), `DECISIONS.md`, `ARCHITECTURE.md`, `PROJECT_BRIEF.md`.

## Principles (from the project brief)
1. Modular monolith. No LangGraph, vector DB, queues, Kubernetes without a concrete requirement.
2. Deterministic Python owns filtering, constraints, costs, scheduling, route validity.
3. LLM = intent extraction + optional wording only. Never the source of truth for places, prices, travel times.
4. Never invent venues; never present unknown prices/hours as facts (unknown != 0 / false).
5. Validate every external API response and LLM output.
6. Timeouts, bounded retries, logging, graceful fallbacks on every integration. Respect Nominatim/Overpass/OSRM usage policies.
7. No secrets in code. Config via `app/config.py` / `.env` (never committed).

## Working rules
- Inspect before editing; keep API contracts; regenerate shared types (`pnpm types` / `pnpm types:check`) when OpenAPI changes.
- Never claim tests passed unless run; record real results in `IMPLEMENTATION_STATUS.md`.
- No commit/push/destructive git, and no process kill or file deletion, without authorization. Only stop processes / delete files you created, after verifying path, PID and command line. The directory is currently **not a git repo**.
- End of session: run checks, update project-memory docs, rewrite `NEXT_SESSION.md` with one task.
- Avoid large multi-line bash heredocs containing quotes in Git Bash; they have failed to parse here. Use the Write/Edit tools.

## Commands (Windows; `make` may be unavailable)
- API checks (in `apps/api`): `uv run --frozen pytest -q`, `uv run --frozen ruff check .`, `uv run --frozen ruff format --check .`, `uv run --frozen mypy .`
- Run API: `cd apps/api; uv run uvicorn app.main:app --reload --port 8000` (docs at /docs)
- Root: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm types:check`; e2e: `pnpm --filter @exploreai/web test:e2e`
- Python must be 3.12 via `uv` (system python is 3.10).

## Backend layout (apps/api/app)
`main.py` factory · `config.py` settings · `schemas/` public contract · `routers/` HTTP only · `services/` logic · `errors.py` envelope · `middleware.py` request id · `logging_config.py`.
Errors: `{detail: str, code, request_id, errors?}`; raise `AppError` for expected failures. Tests must not use the network or a real `.env` (see `tests/conftest.py`).

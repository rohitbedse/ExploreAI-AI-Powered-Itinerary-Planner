# ExploreAI — Architecture

_Last updated: 2026-10-09. Sections marked **[built]** were verified in code; **[planned]** exists only in README/brief/config._

## Repository layout (verified)
```
apps/web          Next.js 15 / React 19 / Tailwind v4 / MapLibre / TanStack Query / zod   [built]
apps/api          FastAPI + Pydantic v2 (uv, ruff, mypy strict, pytest)                   [skeleton]
packages/shared   openapi.json + schema.d.ts generated from FastAPI; Schema<"X"> helper    [built]
infra             docker-compose (postgis 16-3.4, redis 7, api, web) + init.sql (CREATE EXTENSION postgis)
scripts           generate-types.mjs (--check mode for CI)
.github/workflows ci.yml (api job, web job)
```
No `.git` directory, no root `CLAUDE.md`, no `docs/` existed before this audit.

## Backend (apps/api)
Actual modules (updated after S1): `app/main.py` (factory, lifespan, CORS, middleware, error handlers), `app/config.py` (validated settings), `app/schemas/` (package: plans, errors, health), `app/errors.py`, `app/middleware.py`, `app/logging_config.py`, `app/services/readiness.py`, `app/routers/health.py` (`/health`, `/ready`; work), `app/routers/plans.py` (all handlers still 501).

Declared dependencies: fastapi, uvicorn, pydantic, pydantic-settings, httpx. **Absent:** SQLAlchemy/asyncpg, redis client, any LLM SDK, auth/password hashing, PostGIS tooling, tenacity/retry lib.

**Update (S2/S3):** the pipeline, LLM intent extraction, explanation service, Photon geocoder, Overpass client, OSRM router (+ labelled estimates), deterministic scheduler, plan builder and SSE emitter now exist (`app/services/pipeline.py`, `app/services/llm/`, `app/services/planning/`). Still absent: DB layer, cache layer, auth, persistence.

Request flow: `POST /plans/stream` -> `IntentExtractor` (LLM or rule fallback, validated) -> clarification error, OR `DeterministicPlanBuilder.build_stream`: geocode `location_text` (or use the shared device location) -> Overpass bbox search by interest categories -> constraint filter + 12-place shortlist -> OSRM table or labelled estimates -> greedy scheduler (window / known hours / known-price budget) -> `Plan` + `check_plan` -> pipeline re-validates -> `stop*` + exactly one `complete` (or one `error`).

### API contract (all under `/api/v1`)
| Method + path | operationId | State |
| --- | --- | --- |
| GET /health | getHealth | works, tested |
| GET /ready | getReadiness | works, tested (S1) |
| POST /plans/stream | streamPlan | 501 |
| GET /plans/saved | listSavedPlans | 501 |
| GET /plans/{id} | getPlan | 501 |
| POST /plans/{id}/revise/stream | streamRevision | 501 |
| POST /plans/{id}/save | savePlan | 501 |
| POST /auth/login, /auth/logout, GET /auth/me | login/logout/getMe | 501 |

SSE events (`PlanStreamEvent`, discriminated on `type`): `status{step,message}`, `stop{stop,leg_from_previous}`, `complete{plan}`, `error{message}`. Steps: understanding, finding_places, scoring, checking_routes, writing.

## Frontend (apps/web)
Routes: `/` (prompt composer, location chip, example cards), `/plan/[id]` (`new` = transient streaming URL, later `history.replaceState` to real id), `/saved`, `/login`, `/design` (internal showcase).
Data flow: Home stores `PlanRequest` in sessionStorage → `/plan/new` reads it → `usePlanStream` → `streamPlanEvents` (fetch + hand-written SSE parser, `src/lib/sse.ts`) → pure reducer (`plan-stream.ts`) → timeline + MapLibre map. REST via `apiFetch` (credentials: include, 15 s timeout). Types come from `@exploreai/shared`.
Client-only extras: regex prompt "parse preview" (`parse-prompt.ts`, hint only), **direct browser→Photon geocoding** (`geocode.ts`), PWA service worker (prod only).

## External integrations
| Integration | Status |
| --- | --- |
| Overpass | **[built, S3]** `planning/places.py`, bbox query, live-checked once |
| Photon | API geocoder **[built, S3]** (`planning/geocoding.py`); the browser still also calls `photon.komoot.io` directly (D7 open) |
| OSRM | **[built, S3, mocked only]** drive via public demo; walk/bike need own instances, else labelled estimates |
| Nominatim / ORS / Open-Meteo | **[planned]** env vars only |
| LLM chain (gemini/groq/openrouter/ollama) | **[planned]** env vars only; Settings holds only chain + timeout |
| PostgreSQL/PostGIS | container + extension only; no schema, no migrations, no client |
| Redis | container only; no client |
| SSE | frontend consumer built + tested against mocked streams; backend producer absent |
| Map tiles | OpenFreeMap style URL (configurable) |

## Known architectural inconsistencies
See IMPLEMENTATION_STATUS.md §3. Headline: README advertises "FastAPI + LangGraph" and a 5-stage LLM pipeline; this contradicts the "no LangGraph" principle and nothing of it exists.
